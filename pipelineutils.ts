import { BasePipelineStage, PipelineStageSink } from "./pipelines.ts";

export class LimitByCount<T> extends BasePipelineStage<T, T> {
    public processedCount: number = 0;
    constructor(public readonly allowedCount: number){
        super()
    }

    public get name(): string {
        return `LimitByCount(${this.allowedCount})`
    }

    protected async processInner(inputs: T[], sink: PipelineStageSink<T>): Promise<void> {
        for (const input of inputs){
            this.processedCount += 1;
            if (this.processedCount <= this.allowedCount){
                await sink([input])
            }
        }
    }
}

export class EchoJson<T> extends BasePipelineStage<T, T> {
    public get name(): string {
        return `EchoJson`
    }

    protected async processInner(inputs: T[], sink: PipelineStageSink<T>): Promise<void> {
        for (const input of inputs){
            console.log(JSON.stringify(input, null, 2))
            await sink([input])
        }
    }
}

export class FilterStage<T> extends BasePipelineStage<T, T> {
    constructor(private readonly condition: ((x: T) => boolean)){
        super();
    }

    public get name(): string {
        return `FilterStage`
    }

    protected async processInner(inputs: T[], sink: PipelineStageSink<T>): Promise<void> {
        for (const input of inputs){
            if (this.condition(input)){
                await sink([input])
            }
        }
    }
}

export class AsyncFilterStage<T> extends BasePipelineStage<T, T> {
    constructor(private readonly condition: ((x: T) => Promise<boolean>)){
        super();
    }

    public get name(): string {
        return `AsyncFilterStage`
    }

    protected async processInner(inputs: T[], sink: PipelineStageSink<T>): Promise<void> {
        for (const input of inputs){
            if (await this.condition(input)){
                await sink([input])
            }
        }
    }
}

export class InteractiveConfirmation<T> extends BasePipelineStage<T, T> {
    constructor(private readonly messageBuilder: ((x: T) => string)){
        super();
    }

    public get name(): string {
        return `InteractiveConfirmation`
    }

    protected async processInner(inputs: T[], sink: PipelineStageSink<T>): Promise<void> {
        for (const input of inputs){
            const msg = this.messageBuilder(input)
            if (confirm(msg)){
                console.log("user accepted; forwarding item")
                await sink([input]);
            }
            else {
                console.log("user rejected; dropping item")
            }
            
        }
    }
}

export class WriteLinesToFile<T> extends BasePipelineStage<T, T> {
    constructor(public readonly path: string, private readonly lineBuilder: ((x: T) => string)){
        super();
    }

    public get name(): string {
        return `WriteLinesToFile`
    }

    protected async processInner(inputs: T[], sink: PipelineStageSink<T>): Promise<void> {
        for (const input of inputs){
            const line = this.lineBuilder(input)
            await Deno.writeTextFile(this.path, line + "\n", {
                append: true
            })
            await sink([input])
        }
    }
}