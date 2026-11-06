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

test("role notices → switch_role; the Captain's brief → morning_brief (SW4)", async () => {
  const { switchRole, isMorningBrief } = await import("./index.ts");
  assert.deepEqual(switchRole("\u{1F3AD} assumed the `finance-approver` role."), { role: "finance-approver", action: "assumed" });
  assert.deepEqual(switchRole("\u{1F3AD} released the `ops-oncall` role."), { role: "ops-oncall", action: "released" });
  assert.equal(switchRole("I assumed the `ops-oncall` role."), null);
  // index.ts onMessage only applies switchRole to d2c-* speakers: a founder typing the notice is plain text
  assert.equal(isMorningBrief("d2c-captain", "☀️ **Morning brief, 7 Nov**\n\n- **Orders:** **412**"), true);
  assert.equal(isMorningBrief("founder", "☀️ **Morning brief**"), false);
  assert.equal(isMorningBrief("d2c-captain", "🎯 **Morning brief, 7 Nov**"), true);
  assert.equal(isMorningBrief("d2c-captain", "🎯 **Festive sale plan**"), false);
});
