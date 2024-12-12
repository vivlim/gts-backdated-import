import { IArchivedPost } from "../ingestion/main.ts";
import { dbConnection, DbPartition } from "../persistence/db.ts";
import { BasePipelineStage, PipelineStageSink } from "../pipelines.ts";
import { IRepublishedPost } from "./republishPosts.ts";

export type IDuplicates<T> = {duplicates: T[], key: string}

export function dbKeyDuplicate(post: IRepublishedPost | IArchivedPost, partition: DbPartition): Deno.KvKey {
    let id;
    if ('status' in post){
        id = post.post.id
    }
    else {
        id = post.id
    }

    return [partition, 'duplicate', id]
}

export class CollectDuplicates<T> extends BasePipelineStage<T, void> {
    private readonly collection = new Map<string, T[]>();
    constructor(private readonly getKey: ((x: T) => string)){
        super()
    }

    public get name(): string {
        return "CollectDuplicates"
    }

    protected async processInner(inputs: T[], sink: PipelineStageSink<void>): Promise<void> {
        for (const input of inputs){
            const key = this.getKey(input);

            let seenInstances = this.collection.get(key);
            if (seenInstances === undefined){
                this.collection.set(key, [input])
                return;
            }

            seenInstances.push(input);
        }
        
    }

    public collectDuplicates(): IDuplicates<T>[]{
        const found: IDuplicates<T>[] = [];
        for (const [key, value] of this.collection.entries()){
            if (value.length > 1){
                const d: IDuplicates<T> = {
                    duplicates: value.slice(1),
                    key: key
                }
                found.push(d)
            }
        }
        return found;
    }
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
