import { assertEquals, assertThrows } from "@std/assert";
import { exampleOutboxData, typecheckOutboxExport } from "./mastodonTypes.ts";
import { getMediaAttachmentPath } from "./readMastodonBackup.ts";

Deno.test({name: "typecheck matching export"}, async(t) => {
    typecheckOutboxExport(exampleOutboxData)
})

Deno.test({name: "typecheck matching export, different array"}, async(t) => {
    typecheckOutboxExport({
            "id": "outbox.json",
            "type": "OrderedCollection",
            "totalItems": 2,
            "orderedItems": [exampleOutboxData.orderedItems[1]]
    })
})

Deno.test({name: "typecheck mismatching export, obj instead of array"}, async(t) => {
    assertThrows(() => {
        typecheckOutboxExport({
            "id": "outbox.json",
            "type": "OrderedCollection",
            "totalItems": 2,
            "orderedItems": {"this is": "wrong"}
        })
    })
})

Deno.test({name: "typecheck mismatching export, missing a property"}, async(t) => {
    assertThrows(() => {
        typecheckOutboxExport({
            "id": "outbox.json",
            // type is missing
            "totalItems": 2,
            "orderedItems": exampleOutboxData.orderedItems
        })
    })
})

Deno.test({name: "typecheck mismatching export, wrong type in array"}, async(t) => {
    assertThrows(() => {
        typecheckOutboxExport({
            "id": "outbox.json",
            // type is missing
            "totalItems": 2,
            "orderedItems": [{"id": "blah"}]
        })
    })
})


Deno.test({name: "typecheck matching export, item has more properties"}, async(t) => {
    const itemWithMoreProperties = {...exampleOutboxData.orderedItems[1],
        "a": "a",
        "b": "b",
    }
    typecheckOutboxExport({
            "id": "outbox.json",
            "type": "OrderedCollection",
            "totalItems": 2,
            "orderedItems": [exampleOutboxData.orderedItems[1]]
    })
})

Deno.test({name: "typecheck matching export, nullable not null"}, async(t) => {
    const item = {
      "id": "https://botsin.space/users/vivdev/statuses/113599784910969099/activity",
      "type": "Create",
      "actor": "https://botsin.space/users/vivdev",
      "published": "2024-12-05T10:39:15Z",
      "to": [
        "https://botsin.space/users/vivdev/followers"
      ],
      "cc": [],
      "object": {
        ...exampleOutboxData.orderedItems[0].object,
        inReplyTo: "this is not null" // See typecheckSpecialCaseProperties
      }
    }
    typecheckOutboxExport({
            "id": "outbox.json",
            "type": "OrderedCollection",
            "totalItems": 2,
            "orderedItems": [item]
    })
})

Deno.test("attachment path", (t) => {
    assertEquals(getMediaAttachmentPath("/home/user/mastodon_export", "/instancename/media_attachments/files/109/215/002/346/601/852/original/133931bba7cb42da.jpg"), "/home/user/mastodon_export/media_attachments/files/109/215/002/346/601/852/original/133931bba7cb42da.jpg")
})

Deno.test("malformed attachment path", (t) => {
    assertEquals(getMediaAttachmentPath("/home/user/mastodon_export", "/files/109/215/002/346/601/852/original/133931bba7cb42da.jpg"), null)
})