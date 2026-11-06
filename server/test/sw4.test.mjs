// SW4: Switch room roles defined when the team joins a room; the Captain's morning brief, asked through Switch
// (on a schedule and with POST /api/brief). Fake Switch only (helpers.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { start, tmp, calls, fake, post, account, link, sleep, getJson, upstream } from "./helpers.mjs";

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
    await sleep(500);
    assert.deepEqual(roleCalls(), [], "already set up: Switch is not asked again");
  } finally {
    await s.stop();
  }
  // a human deletes ops-oncall in Console: a restart never brings it back
  fake.roles["room-1"] = fake.roles["room-1"].filter((r) => r.name !== "ops-oncall");
  calls.length = 0;
  s = await start({ DATA_DIR, MORNING_BRIEF: "off" });
  try {
    await sleep(500);
    assert.equal(roleCalls().filter((c) => c.method === "POST").length, 0, "a deleted role stays deleted");
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

test("brief: asked early with POST /api/brief, the 09:00 run skips today", async () => {
  fake.roles = {};
  const DATA_DIR = tmp();
  let s = await start({ DATA_DIR, MORNING_BRIEF: "off" });
  const cookie = await account(s);
  const ws = (await link(s, cookie)).workspace;
  assert.equal((await post(s, `/api/brief?ws=${ws.id}`, {}, { cookie })).status, 202);
  await s.stop();
  calls.length = 0;
  s = await start({ DATA_DIR, MORNING_BRIEF_AT: istAt(-1), BRIEF_TICK_MS: "50" });
  await sleep(400);
  await s.stop();
  assert.equal(officePosts().length, 0, "one brief a day, however it was asked");
});

test("brief: a bad MORNING_BRIEF_AT warns and falls back to 09:00; a window may cross midnight", async () => {
  const s = await start({ MORNING_BRIEF_AT: "25:00" });
  try {
    assert.match(s.log(), /MORNING_BRIEF_AT is not HH:MM/);
  } finally {
    await s.stop();
  }
  const out = spawnSync(process.execPath, ["--import", "tsx", "-e", `
    const { dueDay, parseAt } = await import("./src/brief.ts");
    const ist = (iso) => Date.parse(iso) - 330 * 60000;
    console.log(JSON.stringify([dueDay(ist("2026-11-07T23:45:00Z"), 1410), dueDay(ist("2026-11-08T01:00:00Z"), 1410),
      dueDay(ist("2026-11-08T02:00:00Z"), 1410), dueDay(ist("2026-11-07T09:30:00Z"), 540), parseAt("25:00"), parseAt("7:05"), parseAt("09:60")]));`],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  assert.deepEqual(JSON.parse(out.stdout.trim().split("\n").pop()), ["2026-11-07", "2026-11-07", null, "2026-11-07", null, 425, null]);
});

test("observer: an agent's role notice → meta.switch_role; the same text from a person stays plain", async () => {
  fake.roles = {};
  const s = await start({ MORNING_BRIEF: "off" });
  const cookie = await account(s);
  await link(s, cookie);
  const msg = (sender, kind, body) => ({ room_id: "room-1", payload: { sender_name: sender, sender_kind: kind, body, message_id: `m-${Math.random()}`, timestamp: Date.now() } });
  fake.obsRooms = [{ room_id: "room-1", name: "Telegram: Kratos D2C", description: "" }];
  fake.obsFrames = [
    msg("d2c-finance", "agent", "\u{1F3AD} assumed the `finance-approver` role."),
    msg("Snehal", "user", "\u{1F3AD} released the `finance-approver` role."),
  ];
  const obs = spawn(process.execPath, ["src/index.ts"], {
    cwd: new URL("../../observer/", import.meta.url),
    env: { ...process.env, SERVER_URL: s.base, OBSERVER_TOKEN: "", SWITCH_AGENT_ID: "obs", SWITCH_API_ENDPOINT: upstream, SWITCH_API_TOKEN: "obs-key" },
    stdio: "ignore",
  });
  try {
    let h = [];
    for (let i = 0; i < 100 && h.length < 3; i++) await sleep(50), (h = await getJson(s, "/api/history", cookie));
    const [agent, human] = h.slice(-2);
    assert.deepEqual(agent.meta.switch_role, { role: "finance-approver", action: "assumed" });
    assert.equal(human.speaker, "founder");
    assert.equal(human.meta.switch_role, undefined, "humans don't hold roles");
  } finally {
    obs.kill("SIGKILL");
    fake.obsRooms = [];
    fake.obsFrames = [];
    await s.stop();
  }
});
