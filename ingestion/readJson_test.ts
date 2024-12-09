import { assertEquals } from "@std/assert/equals";
import { PipelineChain, IPipelineStage, ISink, ProcessedItemCount, BasePipelineStage, PipelineStageSink, RunPipeline } from "../pipelines.ts";
import { delay } from "jsr:@std/async/delay"
import { Filename, ReadJsonFileAsArrayStage } from "./readArrayJson.ts";
import { JsonValue } from "jsr:@std/json/types";
import { ExtractMastodonExportItems, GatherMastodonAttachments, WithAttachments } from "./readMastodonBackup.ts";
import { MastodonOutboxExport, MastodonOutboxItem } from "./mastodonTypes.ts";
import { exists } from "jsr:@std/fs/exists";

Deno.test({name: "read simple object", permissions: {read: true}}, async(t) => {
    const pipeline: IPipelineStage<Filename, JsonValue> = new ReadJsonFileAsArrayStage();

    const result: JsonValue = await RunPipeline(pipeline, ["./testdata/outbox.json" as Filename]);
    console.log(JSON.stringify(result, null, 2));
    assertEquals((result[0] as any)["orderedItems"].length, 2);
    assertEquals((result[0] as any)["orderedItems"][0]["id"], "https://botsin.space/users/vivdev/statuses/113599784910969099/activity");
    assertEquals(pipeline.errors.length, 0);
})

Deno.test({name: "read mastodon outbox export", permissions: {read: true}}, async(t) => {
    const pipeline = new ReadJsonFileAsArrayStage()
        .into(new ExtractMastodonExportItems());

    const result: MastodonOutboxItem[] = await RunPipeline(pipeline, ["./testdata/outbox.json" as Filename]);
    console.log(JSON.stringify(result, null, 2));
    assertEquals(pipeline.errors.length, 0);
    assertEquals(result[0].type, "Create")
    assertEquals(result[0].published, "2024-12-05T10:39:15Z")
    assertEquals(result.length, 2)
})

Deno.test({name: "get attachments", permissions: {read: true}}, async(t) => {
    const pipeline = new ReadJsonFileAsArrayStage()
        .into(new ExtractMastodonExportItems())
        .into(new GatherMastodonAttachments("./testdata"));

    const result: WithAttachments<MastodonOutboxItem>[] = await RunPipeline(pipeline, ["./testdata/outbox.json" as Filename]);
    console.log(JSON.stringify(result, null, 2));
    assertEquals(pipeline.errors.length, 0);
    assertEquals(result[0].missingAttachments.length, 0);
    assertEquals(result[0].type, "Create")
    assertEquals(result[0].published, "2024-12-05T10:39:15Z")
    assertEquals(result.length, 2)

    const foundAttachments = result[0].foundAttachments;
    assertEquals(foundAttachments.length, 1);
    assertEquals(await exists(foundAttachments[0].filePath), true)
})