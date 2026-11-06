// Switch room roles (switch-core 0.31.0): a role is a room-scoped instruction bundle an agent assumes with
// mcp__switch__assume_role; "@<role>" in any message then reaches whoever holds it (delivery/addressing.py:246-269),
// so the Captain asks "@finance-approver" instead of a fixed name. Defined here through the admin gateway
// (POST /gateway/rooms/{id}/roles, gateway/rooms.py:891), idempotently, whenever the team joins a workspace room.
import { gw } from "./switch.js";

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

/** Defines the roles the room lacks. Never edits an existing one (a human may have tuned it in Console). Returns the names created. */
export async function ensureRoles(roomId: string): Promise<string[]> {
  const path = `/rooms/${encodeURIComponent(roomId)}/roles`;
  const have = new Set(((await gw("GET", path)) as { name: string }[]).map((r) => r.name));
  const made: string[] = [];
  for (const r of ROLES.filter((x) => !have.has(x.name))) {
    await gw("POST", path, { name: r.name, instructions: r.instructions, exclusive: r.exclusive });
    made.push(r.name);
  }
  return made;
}
