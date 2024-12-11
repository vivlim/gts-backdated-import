import { parseArgs } from "jsr:@std/cli/parse-args";
import { ReadJsonFileAsArrayStage } from "./ingestion/readArrayJson.ts";
import { FilterLinkedPosts, NormalizeMastodonPosts } from "./ingestion/normalize.ts";
import { ExtractMastodonExportItems, GatherMastodonAttachments } from "./ingestion/readMastodonBackup.ts";
import { exists } from "jsr:@std/fs";
import { join } from "jsr:@std/path@^1.0.8";
import { RunPipeline } from "./pipelines.ts";
import { IArchivedPost } from "./ingestion/main.ts";
import { DbPartition, LoadArchivedPostDataFromDb, LoadArchivedPostKeysFromDb, LoadArchivedPostsToDb } from "./persistence/db.ts";
import { authenticate } from "./client/auth.ts";
import { MegalodonInterface } from "megalodon";
import { LimitByCount, EchoJson, FilterStage, InteractiveConfirmation, WriteLinesToFile } from "./pipelineutils.ts";
import { DeleteRepublishedPosts, DeleteRepublishedPostsFromInstance, DraftArchivedPosts, EchoRepublishedPosts, IRepublishedPost, RepublishPosts, RepublishPostsConfig } from "./publishing/republishPosts.ts";
import { PostContentToMarkdown } from "./publishing/rehypeTransformText.ts";
import { DeleteRepublishedPostsFromDb, DropRepublishedPosts, KeepRepublishedPosts, LoadRepublishedPostsFromDb, RecordRepublishToDb } from "./publishing/db.ts";
import { timestampForFilename } from "./util.ts";
import {DateTime} from "luxon";

function helpText(){
    console.log("USAGE")
    console.log("")
    console.log("Load export archive's posts into database (do this first)")
    console.log("  ./run.sh --targetAcct account@instance.tld --exportPath ./path/to/extracted/mastodon/export ")
    console.log("")
    console.log("Republish posts from database")
    console.log("  ./run.sh --targetAcct account@instance.tld --publish")
    console.log("")
    console.log("Generate postgres query to backdate republished posts")
    console.log("  ./run.sh --targetAcct account@instance.tld --backdating-query")
}
async function main(): Promise<void> {
    const flags = parseArgs(Deno.args, {
    boolean: ["help", "publish", "delete", "backdating-query"],
    string: ["exportPath", "targetAcct"],
    });

    if (flags.help){
        helpText();
        Deno.exit(1);
    }

    if (flags.targetAcct === undefined){
        console.log("targetAcct must be provided")
        helpText();
        Deno.exit(1)
    }

    console.log("target account:", flags.targetAcct)
    const partition: DbPartition = flags.targetAcct as DbPartition;

    const client = await authenticate(partition);

    if (flags.exportPath !== undefined){
        console.log("Reading export", flags.exportPath)
        Deno.exit(await gatherPosts(flags.exportPath, partition));
    }

    if (flags["backdating-query"]){
        console.log("Building backdating queries", flags.exportPath)
        Deno.exit(await buildBackdatingQueries(partition));
    }

    if (flags.delete){
        console.log("delete republished mode")
        Deno.exit(await deleteRepublished(partition, client))
    }

    if (flags.publish){
        console.log("publishing mode")
        Deno.exit(await publishUnpublishedArchivePosts(partition, client))
    }

    console.log("no action selected")
    helpText();
    Deno.exit(1);
}

async function gatherPosts(exportPath: string, partition: DbPartition): Promise<number>{
    if (!await exists(exportPath)){
        console.log(`Path ${exportPath} not found`)
        return 1
    }

    const outboxJsonPath = join(exportPath, "outbox.json")

    if (!await exists(outboxJsonPath)){
        console.log(`outbox.json not found at ${outboxJsonPath}`)
        return 1;
    }

    const loadPostsStage = new LoadArchivedPostsToDb(partition);

    const pipeline = new ReadJsonFileAsArrayStage()
        .into(new ExtractMastodonExportItems())
        .into(new FilterLinkedPosts())
        .into(new GatherMastodonAttachments(exportPath)
        .into(new NormalizeMastodonPosts()))
        .into(loadPostsStage);
    
    const posts: IArchivedPost[] = await RunPipeline(pipeline, [outboxJsonPath])
    console.log(`collected ${posts.length} posts`)
    await loadPostsStage.savePostList() // Save the list of added posts to the db
    if (pipeline.errors.length > 0){
        return 1
    }
    return 0
}

async function publishUnpublishedArchivePosts(partition: DbPartition, client: MegalodonInterface): Promise<number>{

    const config: RepublishPostsConfig = {}

    const pipeline = new LoadArchivedPostKeysFromDb()
        .into(new LoadArchivedPostDataFromDb())
        .into(new FilterStage(p => p.inReplyTo === null)) // Don't republish replies.
        //.into(new FilterStage(p => p.hasAnyAttachments === true))
        //.into(new FilterStage(p => p.sensitive === true))
        .into(new LoadRepublishedPostsFromDb(partition))
        .into(new DropRepublishedPosts())
        .into(new LimitByCount(10))
        .into(new PostContentToMarkdown())
        .into(new DraftArchivedPosts(client, config))
        //.into(new EchoJson())
        .into(new RepublishPosts(client, config))
        .into(new RecordRepublishToDb(partition))
        //.into(new EchoJson())
        .into(new EchoRepublishedPosts())
        pipeline.stopOnError = true

    const result = await RunPipeline(pipeline, [partition])

    if (pipeline.errors.length > 0){
        return 1
    }
    return 0
}

async function deleteRepublished(partition: DbPartition, client: MegalodonInterface): Promise<number>{
    const pipeline = new LoadArchivedPostKeysFromDb()
        .into(new LoadArchivedPostDataFromDb())
        //.into(new FilterStage(p => p.hasAnyAttachments === true))
        .into(new FilterStage(p => p.sensitive === true))
        .into(new LoadRepublishedPostsFromDb(partition))
        .into(new KeepRepublishedPosts())
        .into(new LimitByCount(1))
        //.into(new InteractiveConfirmation(p => `Delete post ${p.status.url}?`))
        .into(new DeleteRepublishedPostsFromInstance(client)) // does not work on deno https://github.com/denoland/deno/issues/22565
        .into(new DeleteRepublishedPostsFromDb(partition))
        .into(new EchoRepublishedPosts())
        pipeline.stopOnError = true

    const result = await RunPipeline(pipeline, [partition])

    if (pipeline.errors.length > 0){
        return 1
    }
    return 0
}

async function buildBackdatingQueries(partition: DbPartition): Promise<number>{
    const ts = timestampForFilename();

    const sqlwriter = new WriteLinesToFile<IRepublishedPost>(`backdate_posts_${ts}.sql`, (p) => {
            const tsForSql = new DateTime(p.post.originalDate).toISO()
            const query = `update statuses set created_at=TIMESTAMP WITH TIME ZONE '${tsForSql}' where id='${p.status.id}';`
            return query;
        });

    const pipeline = new LoadArchivedPostKeysFromDb()
        .into(new LoadArchivedPostDataFromDb())
        .into(new LoadRepublishedPostsFromDb(partition))
        .into(new KeepRepublishedPosts())
        .into(new EchoRepublishedPosts())
        .into(sqlwriter)
        pipeline.stopOnError = true

    const result = await RunPipeline(pipeline, [partition])

    console.log(`wrote query to ${sqlwriter.path} for ${result.length} republished posts.`)

    if (pipeline.errors.length > 0){
        return 1
    }
    return 0
}

await main();