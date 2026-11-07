// SW7: team addressing scoped to our rooms (docs internals/identity-and-access#addressing-policy) instead of the
// legacy open `policy: null`. Fake Switch only (helpers.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { start, tmp, calls, fake, account, link, sleep, TEAM } from "./helpers.mjs";

const puts = () => calls.filter((c) => c.method === "PUT" && c.path.endsWith("/addressing-policy"));
const teamIds = TEAM.map((_, i) => `x${i + 1}`);

test("linking scopes every team agent to the linked rooms; observer untouched; a restart changes nothing", async () => {
  fake.policies = {};
  const DATA_DIR = tmp();
  let s = await start({ DATA_DIR, MORNING_BRIEF: "off" });
  try {
    calls.length = 0;
    await link(s, await account(s));
    assert.deepEqual(puts().map((c) => c.path.split("/")[3]).sort(), [...teamIds].sort(), "the 16 team agents, not the observer or d2c-taken");
    const p = fake.policies.x1;
    assert.deepEqual(p.rules[0], { rooms: ["room-1"], room_groups: "*", users: "*", agents: "*", owner: true, owner_agents: true, platform: false },
      "anyone in the team room: the founder (unclaimed Telegram), d2c-office and the other agents");
    assert.deepEqual(p.rules[1], { rooms: "*", room_groups: "*", users: [], agents: "*", owner: true, owner_agents: true, platform: false },
      "elsewhere only agents (the Finance desk is created at run time), never other people");
    assert.ok(!puts().some((c) => c.json.policy === null), "never the legacy open policy");

    // a second group linked: rooms only grow, both stay admitted
    await link(s, await account(s), { room: "old", chat: "-5" });
    assert.deepEqual(fake.policies.x1.rules[0].rooms, ["old", "room-1"]);
    assert.equal(fake.policies.obs, undefined, "observer keeps its owner-only policy (switch-up.sh)");
  } finally {
    await s.stop();
  }
  calls.length = 0;
  s = await start({ DATA_DIR, MORNING_BRIEF: "off" });
  try {
    await sleep(500);
    assert.deepEqual(puts(), [], "already scoped: a restart only reads");
  } finally {
    await s.stop();
  }
});
