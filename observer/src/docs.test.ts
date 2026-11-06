// node --test observer/src/docs.test.ts — the room-document notice parser (SW2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { switchDocument, inferType } from "./index.ts";

test("room document notices → switch_document", () => {
  assert.deepEqual(switchDocument("\u{1F4C4} created room document “Festive sale plan — v1”."),
    { id: "festive-sale-plan", title: "Festive sale plan — v1", version: 1, action: "created" });
  assert.deepEqual(switchDocument("\u{1F4C4} updated room document “Festive sale plan — v2”."),
    { id: "festive-sale-plan", title: "Festive sale plan — v2", version: 2, action: "updated" });
  assert.deepEqual(switchDocument("\u{1F5D1} deleted room document “Finance sign-off”."),
    { id: "finance-sign-off", title: "Finance sign-off", action: "deleted" });
  assert.equal(switchDocument("🎯 **Festive sale plan**\n\n- **Pinned in Switch:** Festive sale plan v1"), null);
  assert.equal(switchDocument("I created room document “x”."), null);
  assert.equal(inferType("💰 **Finance approved**"), "approved"); // unchanged
});
