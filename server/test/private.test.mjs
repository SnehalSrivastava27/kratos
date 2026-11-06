// SW3: Finance's private nudges. The real observer runs against the fake Switch: messages in an agents-only
// "Finance desk" room (description team_room:<id>) reach the team's office as private messages, never Telegram.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { start, calls, fake, post, getJson, account, link, ev, sleep, upstream } from "./helpers.mjs";

const msg = (room, sender, body, extra = {}) => ({ room_id: room, payload: { sender_name: sender, sender_kind: "agent", body, message_id: `m-${Math.random()}`, timestamp: Date.now(), ...extra } });

test("private nudge: desk messages → private message events in the team's office; no Telegram post; no linking", async () => {
  const s = await start();
  const cookie = await account(s);
  await link(s, cookie);
  fake.obsRooms = [
    { room_id: "room-1", name: "Telegram: Kratos D2C", description: "" },
    { room_id: "desk-1", name: "Finance desk", description: "Private Finance nudges. Agents only, never Telegram. team_room:room-1" },
  ];
  fake.obsFrames = [
    msg("desk-1", "d2c-finance", "@d2c-influencers Creators at ₹3.55L, cap ₹1.5L: cut ₹2.05L, swap to engagement picks."),
    msg("desk-1", "d2c-influencers", "@d2c-finance Revised: creators ₹1.5L, engagement picks.", { thread_id: "desk-thread" }),
    msg("room-1", "d2c-finance", "💰 **Finance approved**", { thread_id: "t-war" }),
  ];
  calls.length = 0;
  const obs = spawn(process.execPath, ["src/index.ts"], {
    cwd: new URL("../../observer/", import.meta.url),
    env: { ...process.env, SERVER_URL: s.base, OBSERVER_TOKEN: "", SWITCH_AGENT_ID: "obs", SWITCH_API_ENDPOINT: upstream, SWITCH_API_TOKEN: "obs-key" },
    stdio: "ignore",
  });
  try {
    let h = [];
    for (let i = 0; i < 100 && h.length < 3; i++) await sleep(50), (h = await getJson(s, "/api/history", cookie));
    const [nudge, reply, verdict] = h.slice(-3);
    assert.equal(nudge.speaker, "d2c-finance");
    assert.equal(nudge.type, "message", "a nudge is a plain message, not a public pushback");
    assert.equal(nudge.room, "finance");
    assert.equal(nudge.meta.private, true);
    assert.equal(nudge.meta.to, "d2c-influencers");
    assert.equal(nudge.meta.switch_room_id, "room-1", "filed under its team room");
    assert.equal(nudge.meta.desk_room_id, "desk-1");
    assert.equal(nudge.meta.room_name, undefined);
    assert.deepEqual([reply.speaker, reply.room, reply.meta.private, reply.meta.to, reply.meta.switch_thread_id], ["d2c-influencers", "creators", true, "d2c-finance", undefined]);
    assert.equal(verdict.meta.private, undefined, "team room messages stay public");
    assert.equal(verdict.type, "approved");
    assert.ok(!calls.some((c) => /\/bot[^/]+\/sendMessage|\/message$|ops\/(post_message|send_targeted_message)/.test(c.path)), "nothing posted to Telegram or Switch");
  } finally {
    obs.kill("SIGKILL");
    fake.obsRooms = [];
    fake.obsFrames = [];
    await s.stop();
  }
});

test("private events never link a group or record a link attempt", async () => {
  const s = await start();
  const cookie = await account(s);
  try {
    const { code } = await (await post(s, "/api/workspaces/connect", {}, { cookie })).json();
    const r = await post(s, "/api/events", ev({ text: `link ${code}`, meta: { private: true, to: "d2c-ops" } }, "room-z"));
    assert.equal(r.status, 202);
    assert.equal((await getJson(s, "/api/workspaces/connect/status", cookie)).state, "waiting");
  } finally {
    await s.stop();
  }
});
