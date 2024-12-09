import { parseArgs } from "jsr:@std/cli/parse-args";
import { ReadJsonFileAsArrayStage } from "./ingestion/readArrayJson.ts";
import { FilterLinkedPosts, NormalizeMastodonPosts } from "./ingestion/normalize.ts";
import { ExtractMastodonExportItems, GatherMastodonAttachments } from "./ingestion/readMastodonBackup.ts";
import { exists } from "jsr:@std/fs";
import { join } from "jsr:@std/path@^1.0.8";
import { RunPipeline } from "./pipelines.ts";
import { IArchivedPost } from "./ingestion/main.ts";

async function main(): Promise<void> {
    const flags = parseArgs(Deno.args, {
    boolean: ["help"],
    string: ["exportPath", "targetAcct"],
    });

    if (flags.help){
        console.log("todo help text")
        Deno.exit(1);
    }

    if (flags.exportPath !== undefined){
        console.log("Reading export", flags.exportPath)
        Deno.exit(await gatherPosts(flags.exportPath));
    }

    console.log("no action selected")
}

async function gatherPosts(exportPath: string): Promise<number>{
    if (!await exists(exportPath)){
        console.log(`Path ${exportPath} not found`)
        return 1
    }

    const outboxJsonPath = join(exportPath, "outbox.json")

    if (!await exists(outboxJsonPath)){
        console.log(`outbox.json not found at ${outboxJsonPath}`)
        return 1;
    }

    const pipeline = new ReadJsonFileAsArrayStage()
        .into(new ExtractMastodonExportItems())
        .into(new FilterLinkedPosts())
        .into(new GatherMastodonAttachments(exportPath)
        .into(new NormalizeMastodonPosts()));
    
    const posts: IArchivedPost[] = await RunPipeline(pipeline, [outboxJsonPath])
    console.log(`collected ${posts.length} posts`)
    if (pipeline.errors.length > 0){
        return 1
    }
    return 0
}

await main();