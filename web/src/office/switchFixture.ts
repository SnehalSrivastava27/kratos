// Dev only (/demo?demo&fixture=switch): a short loop that shows the Switch extras on camera —
// a morning brief, two room roles, a new hire's catch-up and a private note between agents.
import type { OfficeEvent } from '../shared/types';

const ev = (id: string, t: number, room: string, speaker: string, text: string, meta: Record<string, unknown> = {}) =>
  ({ id: `sw-${id}`, t, room, speaker, type: 'message', text, meta }) as OfficeEvent;

export const SWITCH_FIXTURE: OfficeEvent[] = [
  ev('ask', 0, 'war_room', 'founder', '@d2c-captain ⏰ Morning brief for 2026-11-07. Post today’s morning brief in War Room.', { targets: ['d2c-captain'] }),
  ev('brief', 1200, 'war_room', 'd2c-captain', '🎯 **Morning brief, 7 Nov**\n\n- **Orders:** **412** yesterday, up **9%**\n- **RTO:** **6.1%**, Delhi still the worst\n- **Today:** Finance signs off the creator spend', { kind: 'morning_brief' }),
  ev('role-fin', 2600, 'finance', 'd2c-finance', '🎭 assumed the `finance-approver` role.', { switch_role: { role: 'finance-approver', action: 'assumed' } }),
  ev('role-ops', 3800, 'ops', 'd2c-ops', '🎭 assumed the `ops-oncall` role.', { switch_role: { role: 'ops-oncall', action: 'assumed' } }),
  ev('catchup', 5000, 'finance', 'd2c-payroll', '📚 **Caught up from Switch**\n\n- Cap on creators is **₹1.5L**\n- Finance approver: **@d2c-finance**', { kind: 'catch_up' }),
  ev('private', 6400, 'finance', 'd2c-finance', '💰 **Hold the courier top-up**\n\n- **@d2c-ops:** ₹40k over this week’s cap\n- Send me the RTO split first', { private: true, to: 'd2c-ops', targets: ['d2c-ops'] }),
];
