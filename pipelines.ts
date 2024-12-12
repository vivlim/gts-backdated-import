import { join } from "jsr:@std/path@^1.0.8";
import { timestampForFilename } from "./util.ts";

export interface IPipelineStage<TInput, TOutput> {
    process(inputs: TInput[], sink: PipelineStageSink<TOutput>): Promise<void>;
    get errors(): PipelineError[]
    set stopOnError(value: boolean)
    into<TNewFinalOutput>(target: IPipelineStage<TOutput, TNewFinalOutput>): IPipelineStage<TInput, TNewFinalOutput>;
}

// deno-lint-ignore no-explicit-any
export type PipelineError = {error: Error, inputs: any[], stageName: string};

export type PipelineStageSink<TOutput> = (output: TOutput[]) => Promise<void>;

export interface ISink<T>{
    push(data: T[]): Promise<AcceptedItemCount>;
}

// this is a newtype; see https://kubyshkin.name/posts/newtype-in-typescript/
export type ProcessedItemCount = number & { readonly __tag: unique symbol };
export type AcceptedItemCount = number & { readonly __tag: unique symbol };

class ChainedStagePair<TInput, TMiddleOutput, TLastOutput> implements IPipelineStage<TInput, TLastOutput>{
    constructor(private prev: IPipelineStage<TInput, TMiddleOutput>, private next: IPipelineStage<TMiddleOutput, TLastOutput>){
    }
    get errors(): PipelineError[] {
        return [...this.prev.errors, ...this.next.errors]
    }

    set stopOnError(value: boolean) {
        this.prev.stopOnError = value;
        this.next.stopOnError = value;
    }

    async process(inputs: TInput[], sink: PipelineStageSink<TLastOutput>): Promise<void> {
        await this.prev.process(inputs, async middleOutput => {
            await this.next.process(middleOutput, finalOutput => sink(finalOutput));
        });
    }
    
    into<TNewFinalOutput>(target: IPipelineStage<TLastOutput, TNewFinalOutput>): IPipelineStage<TInput, TNewFinalOutput> {
        return PipelineChain(this, target);
    }
}

export abstract class BasePipelineStage<TInput, TOutput> implements IPipelineStage<TInput, TOutput> {
    public stopOnError: boolean = true;

    public abstract get name(): string;

    public readonly errors: PipelineError[] = [];
    constructor(){}
    async process(inputs: TInput[], sink: PipelineStageSink<TOutput>): Promise<void> {
        const remainingInputs = [...inputs];

        while (remainingInputs.length > 0){
            const input = remainingInputs.shift()
            if (input === undefined){
                throw new Error("first item shouldn't be undefined when there are items remaining.")
            }

            try {
                await this.processInner([input], sink)
            }
            catch (e){
                if (e instanceof Error){
                    this.errors.push({error: e, inputs: [input], stageName: this.name})
                }
                else {
                    this.errors.push({error: new Error(`Error: ${e}`), inputs: [input], stageName: this.name})
                }

                if (this.stopOnError) {
                    throw new Error(`Encountered error in ${this.name} while processing, and stopOnError is true.`)
                }
            }
        }
    }

    into<TNewFinalOutput>(target: IPipelineStage<TOutput, TNewFinalOutput>): IPipelineStage<TInput, TNewFinalOutput> {
        return PipelineChain(this, target);
    }

    protected abstract processInner(inputs: TInput[], sink: PipelineStageSink<TOutput>): Promise<void>
}

export function PipelineChain<TInput, TMiddleOutput, TLastOutput>(prev: IPipelineStage<TInput, TMiddleOutput>, next: IPipelineStage<TMiddleOutput, TLastOutput>) : IPipelineStage<TInput, TLastOutput> {
    const chainedPair = new ChainedStagePair(prev, next)
    return chainedPair;
}

export async function RunPipeline<TInput, TOutput>(pipeline: IPipelineStage<TInput, TOutput>, input: TInput[]): Promise<TOutput[]> {
    const outputs: TOutput[] = []
    try {
        await pipeline.process(input, async s => {outputs.push(...s)});
        return outputs;
    }
    catch(e){
        console.log("error", e)

        const ts = timestampForFilename();
        Deno.mkdir(join("logs", ts), {recursive: true});
        let errNum = 0;
        for (const pipelineErr of pipeline.errors){
            const errFn = join("logs", ts, `err_${errNum++}_${pipelineErr.stageName.replaceAll(/[^a-zA-Z0-9]/g,'_')}.txt`)
            console.log(`- error in ${pipelineErr.stageName}, see ${errFn}`)
            await Deno.writeTextFile(errFn, `# ERROR\n${pipelineErr.error.stack}\n\n# INPUTS\n${JSON.stringify(pipelineErr.inputs, null, 2)}`)
        }
        return outputs;
    }
}