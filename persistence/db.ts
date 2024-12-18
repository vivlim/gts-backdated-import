import { BasePipelineStage, PipelineStageSink } from "../pipelines.ts";
import { IArchivedPost } from "../ingestion/main.ts";
import { AsyncLazy } from "../util.ts";
import { KvToolbox, openKvToolbox } from "jsr:@kitsonk/kv-toolbox";
import * as KvBlob from "jsr:@kitsonk/kv-toolbox/blob";

export type DbPartition = string & { readonly __tag: unique symbol };

export const dbConnection = new AsyncLazy<Deno.Kv>(async () => {
    return await Deno.openKv();
})

export function dbKeyForPost(post: IArchivedPost, partition: DbPartition): Deno.KvKey {
    return [partition, 'archivedPost', post.id]
}

export function dbKeyForPostList(partition: DbPartition): Deno.KvKey {
    return [partition, 'archivedPostKeys']
}

export class LoadArchivedPostsToDb extends BasePipelineStage<IArchivedPost, IArchivedPost>{
    private storedKeys: Deno.KvKey[] = []
    constructor(private partition: DbPartition){
        super()

    }

    public get name(): string {
        return "LoadArchivedPostsToDb"
    }
    protected async processInner(inputs: IArchivedPost[], sink: PipelineStageSink<IArchivedPost>): Promise<void> {
        const db = await dbConnection.getValueAsync()
        for (const input of inputs){
            const key = dbKeyForPost(input, this.partition)
            this.storedKeys.push(key)
            await db.set(key, input);
            /*
            const res = await db.atomic()
                .check({ key, versionstamp: null }) // null version stamp means no value
                .set(key, inputs)
                .commit()
            if (res.ok){
                // it was added
                console.log("Stored post " + input.id)
            } else {
                // it already existed
                console.log("Post already existed " + input.id)
            }
                */
        }

        await sink(inputs);
    }

    public async savePostList() : Promise<void> {
        const db = await dbConnection.getValueAsync()
        await KvBlob.set(db, dbKeyForPostList(this.partition), KvBlob.toBlob(JSON.stringify(this.storedKeys)))
    }
}

export class LoadArchivedPostKeysFromDb extends BasePipelineStage<DbPartition, Deno.KvKey>{
    public get name(): string {
        return "LoadArchivedPostKeysFromDb"
    }

    protected async processInner(inputs: DbPartition[], sink: PipelineStageSink<Deno.KvKey>): Promise<void> {
        const db = await dbConnection.getValueAsync()
        const decoder = new TextDecoder("utf-8")
        for (const partition  of inputs){
            const keysData = await KvBlob.get(db, dbKeyForPostList(partition));
            if (keysData.value === null){
                throw new Error("No posts have been stored yet")
            }
            const keysJson = decoder.decode(keysData.value)
            const keys = JSON.parse(keysJson) as Deno.KvKey[]

            console.log(`Loaded ${keys.length} posts from db`);

            for (const key of keys){
                await sink([key])
            }
        }
    }
}

export class LoadArchivedPostDataFromDb extends BasePipelineStage<Deno.KvKey, IArchivedPost> {
    public get name(): string {
        return "LoadArchivedPostDataFromDb"
    }
    protected async processInner(keys: Deno.KvKey[], sink: PipelineStageSink<IArchivedPost>): Promise<void> {
        const db = await dbConnection.getValueAsync()
        for (const key of keys){
            const res = await db.get<IArchivedPost>(key)
            if (res.value === null){
                throw new Error(`Couldn't find record for key ${key}`)
            }

            await sink([res.value])
        }
    }
}

export class FilterNonPublicMastodonPosts extends BasePipelineStage<IArchivedPost, IArchivedPost> {
    public get name(): string {
        return "FilterNonPublicMastodonPosts"
    }
    protected async processInner(inputs: IArchivedPost[], sink: PipelineStageSink<IArchivedPost>): Promise<void> {
        for (const input of inputs){
            // Need to check what it means for https://www.w3.org/ns/activitystreams#Public to be in 'to' and 'cc'
            throw new Error("not implemented")
        }
    }
}