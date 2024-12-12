import { IArchivedPost } from "../ingestion/main.ts";
import { BasePipelineStage, PipelineStageSink } from "../pipelines.ts";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeRemark from "rehype-remark";
import remarkStringify from "remark-stringify";
import rehypeStringify from "rehype-stringify";
import { Root } from "hast";
import { CONTINUE, visit } from "unist-util-visit"
import { remove} from "unist-util-remove"
import { Element } from "../../../.cache/deno/npm/registry.npmjs.org/@types/hast/3.0.4/index.d.ts";

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

export class RemoveAnchorTags extends BasePipelineStage<IArchivedPost, IArchivedPost>{
    private readonly parser;
    constructor(private readonly hrefSubstring: string | undefined) {
        super();

        this.parser = unified()
            .use(rehypeParse, { fragment: true })
            .use(rehypeRemoveAnchorTags, {hrefSubstring: hrefSubstring})
            .use(rehypeStringify)
    }

    public get name(): string {
        return "RemoveAnchorTags"
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

function rehypeRemoveAnchorTags(options: {
    hrefSubstring?: string
}) {
    return function (tree: Root) {
        remove(tree, {}, (node, index, parent) => {
            if (node.type !== 'element'){
                return false;
            }
            
            if ('properties' in node){
                const element = node as Element
                const href = element.properties['href']?.toString()
                if (href === undefined){
                    return false;
                }

                if (options.hrefSubstring !== undefined){
                    // specifically drop links containing the substring
                    if (href.indexOf(options.hrefSubstring) >= 0){
                        return true;
                    }
                    return false;
                }

                return true;
            }

        })
    };
}