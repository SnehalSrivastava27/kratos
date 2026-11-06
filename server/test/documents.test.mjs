// SW2: room documents pinned in Switch → observer `artifact` events with meta.switch_document → GET /api/documents.
import { test } from "node:test";
import assert from "node:assert/strict";
import { start, fake, post, get, getJson, account, link, ev } from "./helpers.mjs";

const doc = (text, d, extra = {}, room) =>
  ev({ room: "war_room", speaker: "d2c-captain", type: "artifact", text, ...extra, meta: { switch_document: d, ...extra.meta } }, room);

test("documents: latest per id, deleted dropped, per workspace, same auth as other reads", async () => {
  const s = await start();
  try {
    const a = await account(s);
    const wa = (await link(s, a)).workspace;
    const b = await account(s);
    fake.chats["room-3"] = "-333";
    await link(s, b, { room: "room-3" });

    const v1 = { id: "festive-sale-plan", title: "Festive sale plan — v1", version: 1, action: "created" };
    let r = await post(s, "/api/events", doc("📄 created room document “Festive sale plan — v1”.", v1));
    assert.equal(r.status, 201, await r.clone().text());
    assert.deepEqual((await r.json()).meta.switch_document, v1, "stored as is: no schema change needed");
    await post(s, "/api/events", doc("📄 created room document “Finance sign-off”.", { id: "finance-sign-off", title: "Finance sign-off", action: "created" }, { speaker: "d2c-finance" }));
    await post(s, "/api/events", doc("📄 updated room document “Festive sale plan — v2”.", { ...v1, title: "Festive sale plan — v2", version: 2, action: "updated" }));
    await post(s, "/api/events", doc("📄 created room document “Old notes”.", { id: "old-notes", title: "Old notes", action: "created" }));
    await post(s, "/api/events", doc("🗑 deleted room document “Old notes”.", { id: "old-notes", title: "Old notes", action: "deleted" }));
    await post(s, "/api/events", ev({ text: "plain message" }));
    await post(s, "/api/events", doc("📄 created room document “B plan”.", { id: "b-plan", title: "B plan", action: "created" }, {}, "room-3"));

    const docs = await getJson(s, "/api/documents", a);
    assert.deepEqual(docs.map((d) => [d.id, d.title, d.version, d.by]), [
      ["finance-sign-off", "Finance sign-off", undefined, "d2c-finance"],
      ["festive-sale-plan", "Festive sale plan — v2", 2, "d2c-captain"],
    ]);
    assert.ok(docs.every((d) => d.event_id && d.t && d.room === "war_room"));
    assert.deepEqual((await getJson(s, "/api/documents", b)).map((d) => d.id), ["b-plan"]);
    assert.equal((await get(s, "/api/documents")).status, 401);
    assert.equal((await get(s, `/api/documents?ws=${wa.id}`, b)).status, 403);
  } finally {
    await s.stop();
  }
});
