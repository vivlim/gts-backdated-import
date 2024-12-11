import { Entity, MegalodonInterface } from "megalodon";
import { IArchivedPost } from "../ingestion/main.ts";
import { BasePipelineStage, PipelineStageSink } from "../pipelines.ts";
import { unwrapResponse } from "../util.ts";

export interface IRepublishedPost {
    post: IArchivedPost,
    status: Entity.Status
}

export interface RepublishPostsConfig {

}

export type MegalodonDraft = {
    text: string,
    options: MegalodonPostOptions,
    source: IArchivedPost,
}
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
            const result = await this.client.postStatus(draft.text, draft.options)
            // not scheduling so assert that it's a normal status
            const status = unwrapResponse(result) as Entity.Status;

            await sink([{
                post: draft.source,
                status,
            }])
        }
    }
}