// SW4: Switch room roles defined when the team joins a room; the Captain's morning brief, asked through Switch
// (on a schedule and with POST /api/brief). Fake Switch only (helpers.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { start, tmp, calls, fake, post, account, link, sleep } from "./helpers.mjs";

const officePosts = () => calls.filter((c) => c.path === "/agents/office-1/message" || c.path === "/agents/office-1/ops/post_message");
const roleCalls = () => calls.filter((c) => c.path === "/gateway/rooms/room-1/roles");
/** IST "HH:MM" `offsetMin` minutes from now. */
const istAt = (offsetMin) => new Date(Date.now() + (330 + offsetMin) * 60_000).toISOString().slice(11, 16);

test("roles: linking defines finance-approver and ops-oncall in the Switch room once; a restart only reads them", async () => {
  fake.roles = {};
  const DATA_DIR = tmp();
  let s = await start({ DATA_DIR, MORNING_BRIEF: "off" });
  try {
    calls.length = 0;
    await link(s, await account(s));
    const made = roleCalls().filter((c) => c.method === "POST").map((c) => c.json);
    assert.deepEqual(made.map((r) => [r.name, r.exclusive]), [["finance-approver", true], ["ops-oncall", true]]);
    assert.ok(made.every((r) => r.instructions.length > 40));
  } finally {
    await s.stop();
  }
  calls.length = 0;
  s = await start({ DATA_DIR, MORNING_BRIEF: "off" });
  try {
    for (let i = 0; i < 40 && !roleCalls().length; i++) await sleep(50);
    assert.deepEqual(roleCalls().map((c) => c.method), ["GET"], "existing roles are left alone");
  } finally {
    await s.stop();
  }
});

test("roles: only the missing ones are defined; a Switch without roles still goes ready", async () => {
  const s = await start({ MORNING_BRIEF: "off" });
  try {
    fake.roles = { "room-1": [{ name: "finance-approver", instructions: "tuned by hand", exclusive: false }] };
    calls.length = 0;
    await link(s, await account(s));
    assert.deepEqual(roleCalls().filter((c) => c.method === "POST").map((c) => c.json.name), ["ops-oncall"]);
    assert.equal(fake.roles["room-1"][0].instructions, "tuned by hand", "never edited");

    fake.rolesDown = true;
    const st = await link(s, await account(s), { room: "old", chat: "-5" });
    assert.equal(st.state, "ready");
    assert.match(s.log(), /switch roles not defined/);
  } finally {
    fake.roles = {};
    fake.rolesDown = false;
    await s.stop();
  }
});

test("brief: POST /api/brief asks @d2c-captain through Switch as d2c-office, War Room tag, once a minute", async () => {
  fake.roles = {};
  const s = await start({ MORNING_BRIEF: "off" });
  try {
    const cookie = await account(s);
    const ws = (await link(s, cookie)).workspace;
    calls.length = 0;
    const r = await post(s, `/api/brief?ws=${ws.id}`, {}, { cookie });
    assert.equal(r.status, 202, await r.clone().text());
    assert.equal((await r.json()).via, "switch:d2c-office");
    const p = officePosts();
    assert.equal(p.length, 1);
    assert.equal(p[0].json.room_id, "room-1");
    assert.match(p[0].json.content, /^#WarRoom @d2c-captain ⏰ Morning brief for \d{4}-\d{2}-\d{2}\./, "no War Room thread yet: top level, tagged");
    assert.equal((await post(s, `/api/brief?ws=${ws.id}`, {}, { cookie })).status, 429);
    assert.equal((await post(s, `/api/brief?ws=${ws.id}`, {})).status, 401, "needs the session");
    assert.equal((await fetch(`${s.base}/api/brief?ws=${ws.id}`, { method: "POST", headers: { cookie, origin: s.base, "content-type": "text/plain" }, body: "{}" })).status, 415);
  } finally {
    await s.stop();
  }
});

test("brief: the scheduler asks once a day inside the window, and never outside it", async () => {
  fake.roles = {};
  const DATA_DIR = tmp();
  // set up a ready workspace with the scheduler off
  let s = await start({ DATA_DIR, MORNING_BRIEF: "off" });
  await link(s, await account(s));
  await s.stop();

  // window opened a minute ago: one brief, however many ticks
  calls.length = 0;
  s = await start({ DATA_DIR, MORNING_BRIEF_AT: istAt(-1), BRIEF_TICK_MS: "50" });
  await sleep(600);
  await s.stop();
  assert.equal(officePosts().filter((c) => /Morning brief for/.test(c.json.content)).length, 1);

  // restarted the same day: already sent (kv)
  calls.length = 0;
  s = await start({ DATA_DIR, MORNING_BRIEF_AT: istAt(-1), BRIEF_TICK_MS: "50" });
  await sleep(400);
  await s.stop();
  assert.equal(officePosts().length, 0, "not twice a day");

  // outside the window (opened 3 h ago, closed after 2 h): nothing
  const D2 = tmp();
  s = await start({ DATA_DIR: D2, MORNING_BRIEF: "off" });
  await link(s, await account(s));
  await s.stop();
  calls.length = 0;
  s = await start({ DATA_DIR: D2, MORNING_BRIEF_AT: istAt(-180), BRIEF_TICK_MS: "50" });
  await sleep(400);
  await s.stop();
  assert.equal(officePosts().length, 0, "a restart in the afternoon sends no morning brief");
});
