import { IArchivedPost } from "../ingestion/main.ts";
import { BasePipelineStage, PipelineStageSink } from "../pipelines.ts";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkStringify from "remark-stringify";

export class PostContentToMarkdown extends BasePipelineStage<IArchivedPost, IArchivedPost>{
    private readonly parser;
    constructor() {
        super();

        this.parser = unified()
            .use(rehypeParse, { fragment: true })
            .use(rehypeRemark, { document: false, newlines: true, })
            .use(remarkStringify)
    }

    public get name(): string {
        return "PostContentToMarkdown"
    }
    protected async processInner(inputs: IArchivedPost[], sink: PipelineStageSink<IArchivedPost>): Promise<void> {
        for (const input of inputs){
            const newText = await this.parser.process(input.text);
            await sink([{
                ...input,
                text: String(newText)
            }]);

        }
    }

}