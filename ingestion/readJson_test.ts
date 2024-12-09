import { assertEquals } from "@std/assert/equals";
import { PipelineChain, IPipelineStage, ISink, ProcessedItemCount, BasePipelineStage, PipelineStageSink, RunPipeline } from "../pipelines.ts";
import { delay } from "jsr:@std/async/delay"
import { Filename, ReadJsonFileAsArrayStage } from "./readArrayJson.ts";
import { JsonValue } from "jsr:@std/json/types";

Deno.test({name: "read simple object", permissions: {read: true}}, async(t) => {
    const pipeline: IPipelineStage<Filename, JsonValue> = new ReadJsonFileAsArrayStage();

    const result: JsonValue = await RunPipeline(pipeline, ["./testdata/testoutbox.json" as Filename]);
    console.log(JSON.stringify(result, null, 2));
    assertEquals((result[0] as any)["orderedItems"].length, 2);
    assertEquals((result[0] as any)["orderedItems"][0]["id"], "https://botsin.space/users/vivdev/statuses/113599784910969099/activity");
    assertEquals(pipeline.errors.length, 0);
})
