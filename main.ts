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
import { LimitByCount, EchoJson, FilterStage } from "./pipelineutils.ts";
import { DraftArchivedPosts, RepublishPosts, RepublishPostsConfig } from "./publishing/republishPosts.ts";

async function main(): Promise<void> {
    const flags = parseArgs(Deno.args, {
    boolean: ["help", "publish"],
    string: ["exportPath", "targetAcct"],
    });

    if (flags.help){
        console.log("todo help text")
        Deno.exit(1);
    }

    if (flags.targetAcct === undefined){
        console.log("targetAcct must be provided")
        Deno.exit(1)
    }

    console.log("target account:", flags.targetAcct)
    const partition: DbPartition = flags.targetAcct as DbPartition;

    const client = await authenticate(partition);

    if (flags.exportPath !== undefined){
        console.log("Reading export", flags.exportPath)
        Deno.exit(await gatherPosts(flags.exportPath, partition));
    }

    if (flags.publish){
        console.log("publishing mode")
        Deno.exit(await publishUnpublishedArchivePosts(partition, client))
    }

    console.log("no action selected")
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
        .into(new FilterStage(p => p.hasAnyAttachments === true))
        .into(new LimitByCount(1))
        .into(new DraftArchivedPosts(client, config))
        //.into(new EchoJson())
        .into(new RepublishPosts(client, config))
        .into(new EchoJson())
        pipeline.stopOnError = true

    const result = await RunPipeline(pipeline, [partition])

    if (pipeline.errors.length > 0){
        return 1
    }
    return 0
}

await main();