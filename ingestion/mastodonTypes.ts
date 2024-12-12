import { JsonValue } from "jsr:@std/json/types";

export const exampleOutboxData = {
// The context is omitted since it's not interesting for our purposes and messes with parsing.
  "id": "outbox.json",
  "type": "OrderedCollection",
  "totalItems": 2,
  "orderedItems": [
    {
      "id": "https://botsin.space/users/vivdev/statuses/113599784910969099/activity",
      "type": "Create",
      "actor": "https://botsin.space/users/vivdev",
      "published": "2024-12-05T10:39:15Z",
      "to": [
        "https://botsin.space/users/vivdev/followers"
      ],
      "cc": [
        "placeholder"
      ],
      "object": {
        "id": "https://botsin.space/users/vivdev/statuses/113599784910969099",
        "type": "Note",
        "summary": null,
        "inReplyTo": null,
        "published": "2024-12-05T10:39:15Z",
        "url": "https://botsin.space/@vivdev/113599784910969099",
        "attributedTo": "https://botsin.space/users/vivdev",
        "to": [
          "https://botsin.space/users/vivdev/followers"
        ],
        "cc": ["placeholder"],
        "sensitive": false,
        "atomUri": "https://botsin.space/users/vivdev/statuses/113599784910969099",
        "inReplyToAtomUri": "placeholder",
        "conversation": "tag:botsin.space,2024-12-05:objectId=135371558:objectType=Conversation",
        "content": "<p>this is one of two posts</p>",
        /*"contentMap": {
          "en": "<p>this is one of two posts</p>"
        },*/
        "attachment": [
            {"type":"Document","mediaType":"image/jpeg","url":"/instancename/media_attachments/files/109/215/002/346/601/852/original/133931bba7cb42da.jpg","name":"string"},

            {"type":"Document","mediaType":"image/jpeg","url":"/instancename/media_attachments/files/109/215/002/346/601/852/original/133931bba7cb42da.jpg","name":null}
        ],
        "tag": [{"type":"Mention"}], // omit other properties, other types of tags appear. like emoji
        "replies": {
          "id": "https://botsin.space/users/vivdev/statuses/113599784910969099/replies",
          "type": "Collection",
          "first": {
            "type": "CollectionPage",
            "next": "https://botsin.space/users/vivdev/statuses/113599784910969099/replies?only_other_accounts=true&page=true",
            "partOf": "https://botsin.space/users/vivdev/statuses/113599784910969099/replies",
            "items": ["placeholder"]
          }
        },
        "likes": {
          "id": "https://botsin.space/users/vivdev/statuses/113599784910969099/likes",
          "type": "Collection",
          "totalItems": 0
        },
        "shares": {
          "id": "https://botsin.space/users/vivdev/statuses/113599784910969099/shares",
          "type": "Collection",
          "totalItems": 0
        }
      }
    },
    {
      "id": "https://botsin.space/users/vivdev/statuses/113599785306172885/activity",
      "type": "Create",
      "actor": "https://botsin.space/users/vivdev",
      "published": "2024-12-05T10:39:21Z",
      "to": [
        "https://botsin.space/users/vivdev/followers"
      ],
      "cc": ["a"],
      "object": {
        "id": "https://botsin.space/users/vivdev/statuses/113599785306172885",
        "type": "Note",
        "summary": "text",
        "inReplyTo": "url",
        "published": "2024-12-05T10:39:21Z",
        "url": "https://botsin.space/@vivdev/113599785306172885",
        "attributedTo": "https://botsin.space/users/vivdev",
        "to": [
          "https://botsin.space/users/vivdev/followers"
        ],
        "cc": [],
        "sensitive": false,
        "atomUri": "https://botsin.space/users/vivdev/statuses/113599785306172885",
        "inReplyToAtomUri": null,
        "conversation": "tag:botsin.space,2024-12-05:objectId=135371562:objectType=Conversation",
        "content": "<p>this is two of two posts</p>",
        "contentMap": {
          "en": "<p>this is two of two posts</p>"
        },
        "attachment": [],
        "tag": [],
        "replies": {
          "id": "https://botsin.space/users/vivdev/statuses/113599785306172885/replies",
          "type": "Collection",
          "first": {
            "type": "CollectionPage",
            "next": "https://botsin.space/users/vivdev/statuses/113599785306172885/replies?only_other_accounts=true&page=true",
            "partOf": "https://botsin.space/users/vivdev/statuses/113599785306172885/replies",
            "items": []
          }
        },
        "likes": {
          "id": "https://botsin.space/users/vivdev/statuses/113599785306172885/likes",
          "type": "Collection",
          "totalItems": 0
        },
        "shares": {
          "id": "https://botsin.space/users/vivdev/statuses/113599785306172885/shares",
          "type": "Collection",
          "totalItems": 0
        }
      }
    }
  ]
}

export type MastodonOutboxExport = typeof exampleOutboxData;

export type MastodonOutboxItem = MastodonOutboxPost | MastodonOutboxLinkedPost

export type MastodonOutboxPost = typeof exampleOutboxData.orderedItems[0] | typeof exampleOutboxData.orderedItems[1]
export type MastodonOutboxLinkedPost = {
    id: string,
    type: string,
    actor:string,
    published:string,
    to: string[],
    cc: string[],
    object: string,
}

//** handle specific properties by name */
function typecheckSpecialCaseProperties(x: any, propertyName: string) : boolean {
    const t = typeof x;
    const nullableStrings = ["inReplyTo", "summary", "inReplyToAtomUri", "conversation", "name"/*attachments may not include filename*/]
    if (t === 'string'){
        if (nullableStrings.indexOf(propertyName) >= 0){
            return true;
        }
    }

    if (t === 'object'){
        if (nullableStrings.indexOf(propertyName) >= 0){
            return true;
        }
    }

    if (t === 'string' && propertyName === "object"){
        // The object is a link and is not actually here.
        return true;
    }

    return false;
}

export function typecheckOutboxExport(data: JsonValue): MastodonOutboxExport {
    shallowTypeCheck<MastodonOutboxExport>(exampleOutboxData, data);
    return data as MastodonOutboxExport;
}

function shallowTypeCheck<T>(expected: T, actual: any): void {
    if (typeof expected === 'function' && typeof actual !== 'function'){
        return expected(actual)
    }

    if (expected === undefined && actual === undefined){
        return;
    }
    if (expected === null && actual === null){
        return;
    }

    if (Array.isArray(expected) && Array.isArray(actual)){
        const compareTo = expected[0];
        try {
        // @ts-ignore
        return actual.map(x => shallowTypeCheck<typeof expected[0]>(compareTo, x));
        }
        catch (e){
            if (e instanceof Error){
                throw new Error(`Mismatch when checking array of length ${expected.length}: ${e.message}`)
            }
            throw new Error(`Mismatch when checking array at length ${expected.length}: ${e}`)
        }
    }

    if (typeof expected !== typeof actual){
        throw new Error(`Mismatch between types; expected ${typeof expected} but found a ${typeof actual} (value: ${JSON.stringify(actual)})`)
    }

    if (typeof actual === 'function'){
        throw new Error("Typechecking functions is not supported")
    }

    if (typeof actual === 'object' && typeof expected === 'object'){
        for (const propName of Object.keys(expected!)){
            try {
                const actualValue = actual[propName];
                // @ts-ignore
                const expectedValue = expected[propName];
                if (!typecheckSpecialCaseProperties(actualValue, propName)){
                    shallowTypeCheck(expectedValue, actualValue)
                }
            }
            catch (e){
                if (e instanceof Error){
                    throw new Error(`Mismatch when checking property ${propName}: ${e.message}`)
                }
                throw new Error(`Mismatch when checking property ${propName}: ${e}`)
            }
        }
    }
}