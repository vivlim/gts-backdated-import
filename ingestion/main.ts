import { WithAttachments } from "./readMastodonBackup.ts";
import { DateTime } from "luxon";

interface IArchivedPostInner {
    id: string,
    originalUrl: string,
    originalDate: DateTime,
    text: string,
    sensitive: boolean,
    warningText?: string,
    inReplyTo: string | null,
    visibility: 'public' | 'unlisted' | 'other'
}
export interface IArchivedPost extends WithAttachments<IArchivedPostInner> {
}