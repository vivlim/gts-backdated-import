import { WithAttachments } from "./readMastodonBackup.ts";
import { DateTime } from "luxon";

interface IArchivedPostInner {
    originalUrl: string,
    originalDate: DateTime,
    text: string,
    sensitive: boolean,
    warningText?: string
}
export interface IArchivedPost extends WithAttachments<IArchivedPostInner> {
}