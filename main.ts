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
import { LimitByCount, EchoJson, FilterStage, InteractiveConfirmation, WriteLinesToFile, CountItems, DelayStage, StderrWriteEachItem } from "./pipelineutils.ts";
import { DeleteRepublishedPosts, DeleteRepublishedPostsFromInstance, DraftArchivedPosts, EchoRepublishedPosts, GetRepublishedPostsMissingFromInstance, IRepublishedPost, RepublishPosts, RepublishPostsConfig } from "./publishing/republishPosts.ts";
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
    console.log("")
    console.log("Check if any republished posts have been deleted so they can be attempted again")
    console.log("  ./run.sh --targetAcct account@instance.tld --check-deletions")
}
async function main(): Promise<void> {
    const flags = parseArgs(Deno.args, {
    boolean: ["help", "publish", "delete", "backdating-query", "check-deletions"],
    string: ["exportPath", "targetAcct", "inspect"],
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

    if (flags.inspect !== undefined){
        console.log("Reading export", flags.exportPath)
        Deno.exit(await inspectByOriginalUrl(flags.inspect, partition));
    }

    if (flags["backdating-query"]){
        console.log("Building backdating queries", flags.exportPath)
        Deno.exit(await buildBackdatingQueries(partition));
    }

    if (flags["check-deletions"]){
        console.log("Checking for deleted republished posts", flags.exportPath)
        Deno.exit(await checkForDeletedRepublishedPosts(partition, client));
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

    const archivedPostsCounter = new CountItems()
    const eligiblePostsCounter = new CountItems()

    const pipeline = new LoadArchivedPostKeysFromDb()
        .into(new LoadArchivedPostDataFromDb())
        .into(new FilterStage(p => p.inReplyTo === null)) // Don't republish replies.
        //.into(new FilterStage(p => p.hasAnyAttachments === true))
        //.into(new FilterStage(p => p.sensitive === true))
        .into(archivedPostsCounter)
        .into(new LoadRepublishedPostsFromDb(partition))
        .into(new DropRepublishedPosts())
        .into(eligiblePostsCounter)
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

    console.log("")
    console.log(`${result.length} posts were republished this run.`)
    console.log(`${eligiblePostsCounter} archived posts were eligible to be republished this run, ${archivedPostsCounter} archived posts are eligible overall.`)

    const republishedPosts = await RunPipeline(
        new LoadArchivedPostKeysFromDb()
            .into(new LoadArchivedPostDataFromDb())
            .into(new LoadRepublishedPostsFromDb(partition))
            .into(new KeepRepublishedPosts()),
        [partition]
    )

    console.log(`${republishedPosts.length} have been republished now or previously.`)

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

async function checkForDeletedRepublishedPosts(partition: DbPartition, client: MegalodonInterface): Promise<number>{

    const republishedCounter = new CountItems()
    const pipeline = new LoadArchivedPostKeysFromDb()
        .into(new LoadArchivedPostDataFromDb())
        .into(new LoadRepublishedPostsFromDb(partition))
        .into(new KeepRepublishedPosts())
        .into(republishedCounter)
        .into(new DelayStage(1000))
        .into(new StderrWriteEachItem((p) => '?'))
        .into(new GetRepublishedPostsMissingFromInstance(client))
        .into(new StderrWriteEachItem((p) => 'x'))
        .into(new DeleteRepublishedPostsFromDb(partition)) // remove anything that's been deleted remotely from the local republished posts, so we can try again.
        pipeline.stopOnError = true

    const result = await RunPipeline(pipeline, [partition])

    console.log();
    console.log(`out of ${republishedCounter.itemCount} republished posts, ${result.length} have been deleted remotely:`)

    for (const deleted of result){
        console.log(`- ${deleted.post.originalUrl} : '${deleted.post.text.substring(0, 15)}'`)
    }

    if (pipeline.errors.length > 0){
        return 1
    }
    return 0
}

async function inspectByOriginalUrl(originalUrl: string, partition: DbPartition): Promise<number>{

    const republishedCounter = new CountItems()
    const pipeline = new LoadArchivedPostKeysFromDb()
        .into(new LoadArchivedPostDataFromDb())
        .into(new LoadRepublishedPostsFromDb(partition))
        .into(new FilterStage((p) => {
            if ('status' in p){
                return p.post.originalUrl === originalUrl;
            }
            return p.originalUrl === originalUrl;
        }))
        pipeline.stopOnError = true

    const result = await RunPipeline(pipeline, [partition])

    console.log();
    console.log(JSON.stringify(result, null, 2))

    if (pipeline.errors.length > 0){
        return 1
    }
    return 0
}

await main();