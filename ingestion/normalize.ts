import { BasePipelineStage, PipelineStageSink } from "../pipelines.ts";
import { IArchivedPost } from "./main.ts";
import { MastodonOutboxItem, MastodonOutboxPost } from "./mastodonTypes.ts";
import { AttachmentFile, WithAttachments } from "./readMastodonBackup.ts";
import { DateTime } from "npm:luxon";

export class NormalizeMastodonPosts extends BasePipelineStage<WithAttachments<MastodonOutboxPost>, IArchivedPost>{
    public get name(): string {
        return "NormalizeMastodonPosts"
    }
    protected async processInner(inputs: WithAttachments<MastodonOutboxPost>[], sink: PipelineStageSink<IArchivedPost>): Promise<void> {
        const normalized = inputs.map(i => new ArchivedMastodonPost(i));
        await sink(normalized);
    }
}

export class FilterLinkedPosts extends BasePipelineStage<MastodonOutboxItem, MastodonOutboxPost>{
    public get name(): string {
        return "FilterLinkedPosts"
    }
    protected async processInner(inputs: MastodonOutboxItem[], sink: PipelineStageSink<MastodonOutboxPost>): Promise<void> {
        const filtered: MastodonOutboxPost[] = []
        for (const i of inputs){
            if (typeof i.object === 'object'){
                filtered.push(i as MastodonOutboxPost);
            }
        }
        await sink(filtered);
    }
}

export class ArchivedMastodonPost implements IArchivedPost {
    public readonly id: string;
    public readonly originalUrl: string;
    public readonly originalDate: DateTime;
    public readonly text: string;
    public readonly sensitive: boolean;
    public readonly warningText?: string | undefined;
    public readonly foundAttachments: AttachmentFile[];
    public readonly missingAttachments: string[];
    public readonly hasAnyAttachments: boolean | null;
    public readonly inReplyTo: string | null;
    public readonly visibility: IArchivedPost['visibility']

    constructor(public source: MastodonOutboxPost | WithAttachments<MastodonOutboxPost>){
        const id = source.object.id.split('/').pop();
        if (id === undefined){
            throw new Error("Couldn't derive an ID for a post")
        }
        this.id = id;
        this.originalUrl = source.object.url;
        this.originalDate = DateTime.fromISO(source.object.published);
        this.text = source.object.content;
        this.sensitive = source.object.sensitive;
        this.warningText = source.object.summary ?? undefined; // TODO: is this right??
        if (source.object.inReplyTo === null){
            this.inReplyTo = null
        }
        else {
            this.inReplyTo = source.object.inReplyTo;
        }
        
        if ("hasAnyAttachments" in source){
            this.foundAttachments = source.foundAttachments;
            this.missingAttachments = source.missingAttachments;
            this.hasAnyAttachments = source.hasAnyAttachments;
        }
        else {
            this.foundAttachments = [];
            this.missingAttachments = [];
            this.hasAnyAttachments = null;
        }

        const pub: string = "https://www.w3.org/ns/activitystreams#Public";
        if (source.to.includes(pub)) {
            this.visibility = 'public'
        }
        else if (source.cc.includes(pub)) {
            this.visibility = 'unlisted'
        }
        else {
            this.visibility = 'other'
        }
    }

}