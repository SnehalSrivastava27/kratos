// Switch room roles (switch-core 0.31.0): a role is a room-scoped instruction bundle an agent assumes with
// mcp__switch__assume_role; "@<role>" in any message then reaches whoever holds it (delivery/addressing.py:246-269),
// so the Captain asks "@finance-approver" instead of a fixed name. Defined here through the admin gateway
// (POST /gateway/rooms/{id}/roles, gateway/rooms.py:891), idempotently, whenever the team joins a workspace room.
import { gw } from "./switch.js";
import { kvGet, kvSet } from "./store.js";

export type RoleSpec = { name: string; holder: string; exclusive: boolean; instructions: string };

export const ROLES: RoleSpec[] = [
  {
    name: "finance-approver", holder: "d2c-finance", exclusive: true,
    instructions: "You hold the Finance approver seat for Kesar & Co. Every plan that spends money needs your check before the founder is asked: " +
      "check it against data/finance_policy.json and data/budget.json, then reply in War Room with \"Finance approved\" or the exact gap (₹ to cut, from whom).",
  },
  {
    name: "ops-oncall", holder: "d2c-ops", exclusive: true,
    instructions: "You are Ops on call for Kesar & Co. A stock-out, a courier delay, an RTO spike or a stuck transfer comes to you first: " +
      "answer in the thread that asked within your next turn, with the units, the warehouse and the fix, and pull in @d2c-logistics or @d2c-procurement if needed.",
  },
];

/** Defines the roles the room lacks, once per workspace: a role it has ever seen there (made by us or a human) is
 *  remembered, so one a human deleted or tuned in Console is never re-created or edited. Returns the names created. */
export async function ensureRoles(wsId: string, roomId: string): Promise<string[]> {
  const key = `roles:${wsId}`;
  const known = new Set<string>(JSON.parse(kvGet(key) ?? "[]"));
  if (ROLES.every((r) => known.has(r.name))) return [];
  const path = `/rooms/${encodeURIComponent(roomId)}/roles`;
  for (const r of (await gw("GET", path)) as { name: string }[]) known.add(r.name);
  const made: string[] = [];
  for (const r of ROLES.filter((x) => !known.has(x.name))) {
    await gw("POST", path, { name: r.name, instructions: r.instructions, exclusive: r.exclusive });
    made.push(r.name);
    known.add(r.name);
    kvSet(key, JSON.stringify([...known]));
  }
  kvSet(key, JSON.stringify([...known]));
  return made;
}
