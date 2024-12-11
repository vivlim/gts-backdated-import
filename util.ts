import { Response } from "megalodon";
export class AsyncLazy<T> {
    private constructedValue: T | null = null;
    private error: Error | unknown | null = null;

    public constructor(private factory: () => Promise<T>) {
    }

    public async getValueAsync(): Promise<T> {
        if (this.constructedValue !== null) {
            return this.constructedValue;
        }

        if (this.error !== null) {
            throw this.error;
        }

        try {
            this.constructedValue = await this.factory();
            return this.constructedValue;
        }
        catch (e) {
            this.error = e;
            throw e;
        }
    }

}
export function unwrapResponse<T>(response: Response<T>, label?: string | undefined) {
    if (label === undefined) {
        label = "Request";
    }
    if (response.status !== 200 && response.status !== 202) {
        if (label !== undefined) {
            console.log(`${label} request failed with code ${response.status}`, response.statusText, response.data)
        } else {
            console.log(`api request failed with code ${response.status}`, response.statusText, response.data)

        }
        throw new Error(`${label} failed with code ${response.status}: ${response.statusText}`)
    }

    return response.data;
}