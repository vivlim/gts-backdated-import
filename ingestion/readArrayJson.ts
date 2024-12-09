import { BasePipelineStage, PipelineStageSink } from "../pipelines.ts";
import { ensureFile } from "jsr:@std/fs";
import { TextDelimiterStream } from "jsr:@std/streams";
import { JsonParseStream, JsonValue } from "jsr:@std/json";
import * as jsonc from "jsr:@std/jsonc";



// this is a newtype; see https://kubyshkin.name/posts/newtype-in-typescript/
export type Filename = string & { readonly __tag: unique symbol };

export class ReadJsonFileAsArrayStage extends BasePipelineStage<Filename, JsonValue>{
    public get name(): string {
        return "ReadJsonFileAsArray"
    }
    protected async processInner(inputs: Filename[], sink: PipelineStageSink<JsonValue>): Promise<void> {
        const decoder = new TextDecoder("utf-8")
        for (const fn of inputs){
            const input = await Deno.readFile(fn);
            const decoded = decoder.decode(input);
            await sink([jsonc.parse(decoded)])
            /*
            const input = await Deno.open(fn);
            await input.readable
                .pipeThrough(new TextDecoderStream())
                .pipeThrough(new JsonParseStream())
                .pipeTo(new WritableStream({
                    async write(chunk: JsonValue) {
                        await sink([chunk])
                    }
                }));
                */
        }
    }
}