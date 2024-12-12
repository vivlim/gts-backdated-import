import { IArchivedPost } from "../ingestion/main.ts";
import { BasePipelineStage, PipelineStageSink } from "../pipelines.ts";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkStringify from "remark-stringify";

export class TransformText extends BasePipelineStage<IArchivedPost, IArchivedPost>{
    constructor(private readonly transform: ((p: IArchivedPost) => string)) {
        super();
    }

    public get name(): string {
        return "TransformText"
    }
    protected async processInner(inputs: IArchivedPost[], sink: PipelineStageSink<IArchivedPost>): Promise<void> {
        for (const input of inputs){
            const newText = this.transform(input)
            await sink([{
                ...input,
                text: String(newText)
            }]);

        }
    }
}