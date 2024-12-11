import { IArchivedPost } from "../ingestion/main.ts";
import { dbConnection, DbPartition } from "../persistence/db.ts";
import { BasePipelineStage, PipelineStageSink } from "../pipelines.ts";
import { IRepublishedPost } from "./republishPosts.ts";


export function dbKeyRepublishState(post: IRepublishedPost | IArchivedPost, partition: DbPartition): Deno.KvKey {
    let id;
    if ('status' in post){
        id = post.post.id
    }
    else {
        id = post.id
    }

    return [partition, 'republishState', id]
}

export class RecordRepublishToDb extends BasePipelineStage<IRepublishedPost, IRepublishedPost> {
    constructor(private partition: DbPartition){
        super()
    }

    public get name(): string {
        return "RecordRepublishToDb"
    }
    protected async processInner(inputs: IRepublishedPost[], sink: PipelineStageSink<IRepublishedPost>): Promise<void> {
        const db = await dbConnection.getValueAsync()
        for (const input of inputs){
            const key = dbKeyRepublishState(input, this.partition);
            await db.set(key, input);
            await sink([input])
        }
    }
}

export class LoadRepublishedPostsFromDb extends BasePipelineStage<IArchivedPost, IArchivedPost | IRepublishedPost> {
    constructor(private partition: DbPartition){
        super()
    }

    public get name(): string {
        return "RecordRepublishToDb"
    }
    protected async processInner(inputs: IArchivedPost[], sink: PipelineStageSink<IArchivedPost | IRepublishedPost>): Promise<void> {
        const db = await dbConnection.getValueAsync()
        for (const input of inputs){
            const key = dbKeyRepublishState(input, this.partition);
            const existing = await db.get<IRepublishedPost>(key);
            if (existing.value !== null){
                await sink([existing.value])
            }
            else {
                await sink([input])
            }
        }
    }
}

export class DeleteRepublishedPostsFromDb extends BasePipelineStage<IRepublishedPost, IRepublishedPost> {
    constructor(private partition: DbPartition){
        super()
    }

    public get name(): string {
        return "DeleteRepublishedPostsFromDb"
    }
    protected async processInner(inputs: IRepublishedPost[], sink: PipelineStageSink<IRepublishedPost>): Promise<void> {
        const db = await dbConnection.getValueAsync()
        for (const input of inputs){
            const key = dbKeyRepublishState(input, this.partition);
            await db.delete(key)
            await sink([input])
        }
    }
}

export class DropRepublishedPosts extends BasePipelineStage<IArchivedPost | IRepublishedPost, IArchivedPost> {
    public get name(): string {
        return `DropRepublishedPosts`
    }

    protected async processInner(inputs: (IArchivedPost | IRepublishedPost)[], sink: PipelineStageSink<IArchivedPost>): Promise<void> {
        for (const input of inputs){
            if ('id' in input){
                await sink([input])
            }
        }
    }
}

export class KeepRepublishedPosts extends BasePipelineStage<IArchivedPost | IRepublishedPost, IRepublishedPost> {
    public get name(): string {
        return `KeepRepublishedPosts`
    }

    protected async processInner(inputs: (IArchivedPost | IRepublishedPost)[], sink: PipelineStageSink<IRepublishedPost>): Promise<void> {
        for (const input of inputs){
            if ('status' in input){
                await sink([input])
            }
        }
    }
}