/*
copied from https://github.com/CesiumLabs/streamconv/blob/v1.0.2/src/Conv.ts
based on https://github.com/Borewit/readable-web-to-node-stream
*/

import * as mod from "node:stream"
import * as fsBuf from "node:buffer"

export class StreamConv extends mod.Readable {

    public bytesRead: number = 0;
    public released = false;
    private reader: ReadableStreamDefaultReader;
    private pendingRead!: Promise<any>;

    // i added a name here because megalodon expects it
    constructor(stream: ReadableStream, public readonly name: string) {
        super();
        this.reader = stream.getReader();
    }

    public async _read() {
        if (this.released) {
            this.push(null);
            return;
        }
        this.pendingRead = this.reader.read();
        const data = await this.pendingRead;
        // @ts-ignore
        delete this.pendingRead;
        if (data.done || this.released) {
            this.push(null);
        } else {
            this.bytesRead += data.value.length;
            this.push(data.value);
        }
    }

    public async waitForReadToComplete() {
        if (this.pendingRead) {
            await this.pendingRead;
        }
    }

    public async close(): Promise<void> {
        await this.syncAndRelease();
    }

    private async syncAndRelease() {
        this.released = true;
        await this.waitForReadToComplete();
        await this.reader.releaseLock();
    }
}