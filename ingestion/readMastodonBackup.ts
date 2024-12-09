import { JsonValue } from "jsr:@std/json/types";
import { BasePipelineStage, PipelineStageSink } from "../pipelines.ts";
import { exampleOutboxData, MastodonOutboxExport, MastodonOutboxItem, MastodonOutboxPost, typecheckOutboxExport } from "./mastodonTypes.ts";
import * as path from "jsr:@std/path";
import { exists, existsSync } from "jsr:@std/fs";

export class ExtractMastodonExportItems extends BasePipelineStage<JsonValue, MastodonOutboxItem> {
    public get name(): string {
        return "ExtractMastodonExportItems";
    }
    protected async processInner(inputs: JsonValue[], sink: PipelineStageSink<MastodonOutboxItem>): Promise<void> {
        for (const input of inputs){
            if (input === null){
                throw new Error("Input was null");
            }

            // hacky typechecking :(
            const outboxExport: MastodonOutboxExport = typecheckOutboxExport(input);

            await sink(outboxExport.orderedItems);
        }
    }
}

export interface AttachmentFile {
    filePath: string,
    altText: string,
    mediaType: string,
}
export type WithAttachments<T> = T & {
    foundAttachments: AttachmentFile[],
    missingAttachments: string[],
    hasAnyAttachments: boolean | null,
}

export class GatherMastodonAttachments extends BasePipelineStage<MastodonOutboxPost, WithAttachments<MastodonOutboxPost>> {

    constructor(private extractedArchiveRootPath: string) {
        super()
    }

    public get name(): string {
        return "GatherMastodonAttachments";
    }
    protected async processInner(inputs: MastodonOutboxPost[], sink: PipelineStageSink<WithAttachments<MastodonOutboxPost>>): Promise<void> {
        for (const input of inputs){
            const result: WithAttachments<MastodonOutboxPost> = {...input, foundAttachments: [], missingAttachments: [], hasAnyAttachments: input.object.attachment.length > 0};
            for (const attachment of input.object.attachment){
                console.log("test url", attachment.url)
                const attachmentPath = getMediaAttachmentPath(this.extractedArchiveRootPath, attachment.url);
                if (attachmentPath === null){
                    console.log("didn't map path for url ", attachment.url)
                    result.missingAttachments.push(attachment.url)
                    continue;
                }
                    console.log("testingg path", attachmentPath)
                // if async exists is used, there's some timing sensitivity and tests fail :/
                const found = existsSync(attachmentPath);
                if (!found){
                    result.missingAttachments.push(attachment.url)
                    continue;
                }

                result.foundAttachments.push({
                    ...attachment,
                    filePath: attachmentPath,
                    altText: attachment.name,
                })
            }

            await sink([result]);
        }
    }
}

export function getMediaAttachmentPath(base: string, url: string): string | null {
    // expected form:
    // /instancename/media_attachments/files/109/215/002/346/601/852/original/133931bba7cb42da.jpg
    const parts = url.split('/');

    while (parts.shift() !== "media_attachments" && parts.length > 0);

    if (parts.length === 0){
        return null;
    }

    return path.join(base, "media_attachments", ...parts);
}