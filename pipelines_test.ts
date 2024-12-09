import { assertEquals } from "@std/assert/equals";
import { PipelineChain, IPipelineStage, ISink, ProcessedItemCount, BasePipelineStage, PipelineStageSink } from "./pipelines.ts";
import { delay } from "jsr:@std/async/delay"

class AddStage extends BasePipelineStage<[number, number], number> {
    public get name(): string {
        return "AddStage"
    }

    async processInner(inputs: [number, number][], sink: PipelineStageSink<number>): Promise<void> {
        await delay(1)
        for (const input of inputs){
            console.log("AddStage processing: " + JSON.stringify(input))
            await sink([input[0] + input[1]])
        }
    }
}

class ParseNumberStage extends BasePipelineStage<[string, string], [number, number]> {
    public get name(): string {
        return "ParseNumberStage"
    }

    async processInner(inputs: [string, string][], sink: PipelineStageSink<[number, number]>): Promise<void> {
        await delay(1)
        for (const input of inputs){
            console.log("ParseNumberStage processing: " + JSON.stringify(input))
            await sink([[parseInt(input[0]), parseInt(input[1])]])
        }
    }
}

class ThrowErrorStage extends BasePipelineStage<number, string> {
    public get name(): string {
        return "ThrowErrorStage"
    }

    async processInner(inputs: number[], sink: PipelineStageSink<string>): Promise<void> {
        await delay(1)
        throw new Error(`ThrowErrorStage throwing on inputs ${JSON.stringify(inputs)}`)
    }
}

Deno.test("trivial pipeline", async(t) => {
    const pipeline: IPipelineStage<[number, number], number> = new AddStage();

    let result: number = -1;
    await pipeline.process([[1, 1]], (async out => {result = out[0]}))
    assertEquals(result, 2);
    assertEquals(pipeline.errors.length, 0);
})

Deno.test("two-stage chained pipeline", async(t) => {
    const pipeline: IPipelineStage<[string, string], number> = PipelineChain(new ParseNumberStage(), new AddStage());

    let result: number = -1;
    await pipeline.process([["1", "1"]], (async out => {result = out[0]}))
    assertEquals(result, 2);
    //assertEquals(pipeline.errors.length, 0);
})

Deno.test("pipeline with errors thrown", async(t) => {
    const pipeline: IPipelineStage<[string, string], string> = PipelineChain(PipelineChain(new ParseNumberStage(), new AddStage()), new ThrowErrorStage());
    pipeline.stopOnError = false;

    let result: string = "unset by test";
    await pipeline.process([["1", "1"]], (async out => {result = out[0]}))
    console.log(JSON.stringify(pipeline.errors))
    assertEquals(result, "unset by test");
    assertEquals(pipeline.errors.length, 1);
    assertEquals(pipeline.errors[0].error.message.indexOf("ThrowErrorStage"), 0)
    assertEquals(pipeline.errors[0].inputs[0], 2)
    assertEquals(pipeline.errors[0].stageName, "ThrowErrorStage")
})