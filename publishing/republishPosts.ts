import { Entity, MegalodonInterface } from "megalodon";
import { IArchivedPost } from "../ingestion/main.ts";
import { BasePipelineStage, PipelineStageSink } from "../pipelines.ts";
import { unwrapResponse } from "../util.ts";
import { AttachmentFile, WithAttachments } from "../ingestion/readMastodonBackup.ts";
import { Buffer } from "jsr:@std/streams/buffer";
import { StreamConv } from "../streamconvert.ts";
import * as nodeBuffer from "node:buffer"
import { basename } from "jsr:@std/path@^1.0.8";
import {DateTime} from "luxon"

export interface IRepublishedPost {
    post: IArchivedPost,
    status: Entity.Status
}

export interface RepublishPostsConfig {

}

export type MegalodonDraft = WithAttachments<{
    text: string,
    options: MegalodonPostOptions,
    source: IArchivedPost,
}>

export type MegalodonPostOptions = {
        media_ids?: Array<string>;
        poll?: {
            options: Array<string>;
            expires_in: number;
            multiple?: boolean;
            hide_totals?: boolean;
        };
        in_reply_to_id?: string;
        sensitive?: boolean;
        spoiler_text?: string;
        visibility?: Entity.StatusVisibility;
        language?: string;
        quote_id?: string;
    };

export class DraftArchivedPosts extends BasePipelineStage<IArchivedPost, MegalodonDraft> {
    constructor(private readonly client: MegalodonInterface, config: RepublishPostsConfig){
        super()
    }

    public get name(): string {
        return "DraftArchivedPosts"
    }
    protected async processInner(inputs: IArchivedPost[], sink: PipelineStageSink<MegalodonDraft>): Promise<void> {
        for (const input of inputs){
            const draft: MegalodonDraft = {
                text: input.text,
                options: {
                    sensitive: input.sensitive,
                    spoiler_text: input.warningText,
                    visibility: "public"
                },
                source: input,
                foundAttachments: input.foundAttachments,
                hasAnyAttachments: input.hasAnyAttachments,
                missingAttachments: input.missingAttachments,
            }

            await sink([draft]);
        }
    }

}

export class RepublishPosts extends BasePipelineStage<MegalodonDraft, IRepublishedPost> {
    constructor(private readonly client: MegalodonInterface, config: RepublishPostsConfig){
        super()
    }

    public get name(): string {
        return "RepublishPosts"
    }
    protected async processInner(inputs: MegalodonDraft[], sink: PipelineStageSink<IRepublishedPost>): Promise<void> {
        for (const draft of inputs){
            let options = {...draft.options}

            if (draft.hasAnyAttachments){
                options.media_ids = [];

                for (let attachment of draft.foundAttachments){
                    const attachmentData = await Deno.open(attachment.filePath)
                    const stream = new StreamConv(attachmentData.readable, basename(attachment.filePath))
                    const upload = unwrapResponse(await this.client.uploadMedia(stream, {
                        description: attachment.altText,
                    }));
                    options.media_ids.push(upload.id);
                }
            }

            const result = await this.client.postStatus(draft.text, options)
            // not scheduling so assert that it's a normal status
            const status = unwrapResponse(result) as Entity.Status;

            await sink([{
                post: draft.source,
                status,
            }])
        }
    }
}

export class EchoRepublishedPosts extends BasePipelineStage<IRepublishedPost, IRepublishedPost> {
    public get name(): string {
        return "EchoRepublishedPosts"
    }
    protected async processInner(inputs: IRepublishedPost[], sink: PipelineStageSink<IRepublishedPost>): Promise<void> {
        for (const input of inputs){
            console.log(`republished ${input.status.url} - originally ${input.post.originalUrl} @ ${new DateTime(input.post.originalDate)}: '${input.post.text.substring(0, 15)}'`)
            await sink([input])
        }
    }
}

export class DeleteRepublishedPostsFromInstance extends BasePipelineStage<IRepublishedPost, IRepublishedPost> {
    constructor(private readonly client: MegalodonInterface){
        super()
    }

    public get name(): string {
        return "DeleteRepublishedPostsFromInstance"
    }
    protected async processInner(inputs: IRepublishedPost[], sink: PipelineStageSink<IRepublishedPost>): Promise<void> {
        for (const input of inputs){
            console.log(`requesting to delete status ${input.status.id} which was at ${input.status.url}`)
            const result = await this.client.deleteStatus(input.status.id) // doesn't seem to work on deno: https://github.com/denoland/deno/issues/22565
            // not scheduling so assert that it's a normal status
            unwrapResponse(result)

            await sink([input])
        }
    }
}

export class GetRepublishedPostsMissingFromInstance extends BasePipelineStage<IRepublishedPost, IRepublishedPost> {
    constructor(private readonly client: MegalodonInterface){
        super()
    }

    public get name(): string {
        return "GetRepublishedPostsMissingFromInstance"
    }
    protected async processInner(inputs: IRepublishedPost[], sink: PipelineStageSink<IRepublishedPost>): Promise<void> {
        for (const input of inputs){
            const searchResult = unwrapResponse(await this.client.search(input.status.uri, {type: "statuses", limit: 1, resolve: false}))
            if (searchResult.statuses.length === 0){
                await sink([input])
            }
        }
    }
}