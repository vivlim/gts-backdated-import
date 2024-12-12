import { IArchivedPost } from "../ingestion/main.ts";
import { dbConnection, dbKeyForPost, DbPartition } from "../persistence/db.ts";
import { BasePipelineStage, PipelineStageSink } from "../pipelines.ts";
import { IRepublishedPost } from "./republishPosts.ts";

export type IDuplicates<T> = {duplicates: T[], original: T, key: string}
export type IDuplicateRecord = {
    original: Deno.KvKey,
    duplicates: Deno.KvKey[],
}

export function dbKeyDuplicate(
    post: IRepublishedPost | IArchivedPost,
    //** differentiates the key used to duplicate, in case there are different axes of deduplication that we care about later */
    keyName: string,
    partition: DbPartition): Deno.KvKey {
    let id;
    if ('status' in post){
        id = post.post.id
    }
    else {
        id = post.id
    }

    return [partition, 'duplicate', keyName, id]
}

export async function recordDuplicatesToDb(partition: DbPartition,
    //** differentiates the key used to duplicate, in case there are different axes of deduplication that we care about later */
    deduplicationKeyName: string,
    duplicates: IDuplicates<IArchivedPost>[]){
    const db = await dbConnection.getValueAsync();
    for (const duplicatedPost of duplicates){
        const duplicateKeys = duplicatedPost.duplicates.map(d => dbKeyForPost(d, partition))
        const originalKey = dbKeyForPost(duplicatedPost.original, partition)

        for (const d of duplicatedPost.duplicates){
            const dupRecordKey = dbKeyDuplicate(d, deduplicationKeyName, partition);
            const dupRecord: IDuplicateRecord = {
                original: originalKey,
                duplicates: duplicateKeys
            };
            await db.set(dupRecordKey, dupRecord)
        }
    }
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
                    key: key,
                    original: value[0]
                }
                found.push(d)
            }
        }
        return found;
    }
}

export class FilterDuplicatedPosts extends BasePipelineStage<IArchivedPost, IArchivedPost> {
    public duplicatesDropped: number = 0;
    constructor(private readonly partition: DbPartition, private readonly deduplicationKey: string, private readonly action: 'keep' | 'drop'){
        super()
    }
    public get name(): string {
        return `FilterDuplicatedPosts_${this.action}_${this.deduplicationKey}`
    }

    protected async processInner(inputs: IArchivedPost[], sink: PipelineStageSink<IArchivedPost>): Promise<void> {
        const db = await dbConnection.getValueAsync()
        for (const input of inputs){
            const dupKey = dbKeyDuplicate(input, this.deduplicationKey, this.partition);
            const duplicateRecord = await db.get<IDuplicateRecord>(dupKey)
            if (duplicateRecord.value === null){
                if (this.action === 'drop'){ // drop duplicates = keep non-duplicates, push them to the sink
                    await sink([input])
                }
            }
            else {
                if (this.action === 'keep'){ // keep duplicates = push them to the sink
                    await sink([input])
                } else {
                    this.duplicatesDropped++;
                }
            }
        }
    }
}

export class ForgetDuplicatePosts extends BasePipelineStage<IArchivedPost, IArchivedPost> {
    public duplicatesDropped: number = 0;
    constructor(private readonly partition: DbPartition, private readonly deduplicationKey: string){
        super()
    }
    public get name(): string {
        return `ForgetDuplicatePosts_${this.deduplicationKey}`
    }

    protected async processInner(inputs: IArchivedPost[], sink: PipelineStageSink<IArchivedPost>): Promise<void> {
        const db = await dbConnection.getValueAsync()
        for (const input of inputs){
            const dupKey = dbKeyDuplicate(input, this.deduplicationKey, this.partition);
            await db.delete(dupKey)
            console.log("Forget duplicate: " + dupKey.join(" "))
            await sink([input])
        }
    }
}