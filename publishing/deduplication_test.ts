import { assertEquals } from "@std/assert/equals";
import { CollectDuplicates, IDuplicates } from "./deduplication.ts";
import { RunPipeline } from "../pipelines.ts";

Deno.test({name: "deduplication of numbers"}, async(t) => {

    const dupCollector = new CollectDuplicates<number>(i => `${i}`);
    await RunPipeline(dupCollector, [1,2,3,4,5,6,7,8,9,2,4,6,8,10,4,8,8]);
    const dups: IDuplicates<number>[] = dupCollector.collectDuplicates();
    console.log(JSON.stringify(dups, null, 2));
    assertEquals(dups.length, 4);
    assertEquals(dups, [
        {
            "duplicates": [ 2 ],
            "key": "2",
            "original": 2
        },
        {
            "duplicates": [ 4, 4 ],
            "key": "4",
            "original": 4
        },
        {
            "duplicates": [ 6 ],
            "key": "6",
            "original": 6
        },
        {
            "duplicates": [ 8, 8, 8 ],
            "key": "8",
            "original": 8
        }
    ])
})

Deno.test({name: "when there are no duplicates"}, async(t) => {

    const dupCollector = new CollectDuplicates<number>(i => `${i}`);
    await RunPipeline(dupCollector, [1,2,3,4,5,6,7,8,9]);
    const dups: IDuplicates<number>[] = dupCollector.collectDuplicates();
    console.log(JSON.stringify(dups, null, 2));
    assertEquals(dups.length, 0);
})

Deno.test({name: "when there are only duplicates"}, async(t) => {

    const dupCollector = new CollectDuplicates<number>(i => `${i}`);
    await RunPipeline(dupCollector, [1,1,1,1,1,1,1,2,2,2,2,2,2,2,2]);
    const dups: IDuplicates<number>[] = dupCollector.collectDuplicates();
    console.log(JSON.stringify(dups, null, 2));
    assertEquals(dups.length, 2);
    assertEquals(dups, [
        {
            "duplicates": [1,1,1,1,1,1],
            "key": "1",
            "original": 1
        },
        {
            "duplicates": [2,2,2,2,2,2,2],
            "key": "2",
            "original": 2
        }
    ])
})


type DeduplicableByContent = {
    id: string,
    content: string,
}
Deno.test({name: "deduplication by exact content"}, async(t) => {

    const dupCollector = new CollectDuplicates<DeduplicableByContent>(c => c.content);
    await RunPipeline(dupCollector, [
        {id: "a", content: "nobody will ever post like this again"},
        {id: "b", content: "so true"}, // not a duplicate, it's the first instance of this
        {id: "c", content: "so true"}, // duplicate
        {id: "d", content: "yeah"}, // not a duplicate
        {id: "e", content: "first! edit: oh :("},
        {id: "f", content: "first!"},
        {id: "g", content: "that wasn't first by a long shot"},
        {id: "h", content: "yeah"}, // duplicate
        {id: "i", content: "YEAH"}, // not a duplicate
    ]);
    const dups: IDuplicates<DeduplicableByContent>[] = dupCollector.collectDuplicates();
    console.log(JSON.stringify(dups, null, 2));
    assertEquals(dups.length, 2);
    assertEquals(dups, [
        {
            "duplicates": [
            {
                "id": "c",
                "content": "so true"
            }
            ],
            "key": "so true",
            "original": {
                "id": "b",
                "content": "so true"
            }
        },
        {
            "duplicates": [
            {
                "id": "h",
                "content": "yeah"
            }
            ],
            "key": "yeah",
            "original": {
                "id": "d",
                "content": "yeah"
            }
        }
    ])
})