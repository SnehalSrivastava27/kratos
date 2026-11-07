// The public demo account's office (Kesar & Co., made-up data): a full day already in the chat, then sale
// day one playing live. History has negative `t`, so the replay pushes it at once and the chat clock reads
// it as earlier today (1 s of `t` = 1 minute; 0 = 21:00). The festive-sale story itself is
// demo/feeds/sale-demo.json, moved to 20:00–20:45.
import type { OfficeEvent, RoomId } from '../shared/types';
import saleDemo from '../../../demo/feeds/sale-demo.json';

type Row = [t: number, room: RoomId, speaker: string, type: OfficeEvent['type'], text: string, targets?: string[]];
const ev = (prefix: string) => ([t, room, speaker, type, text, targets]: Row, i: number): OfficeEvent =>
  ({ id: `${prefix}-${i + 1}`, t, room, speaker, type, text, ...(targets ? { meta: { targets } } : {}) });
const at = (hh: number, mm: number) => ((hh - 21) * 60 + mm) * 1000; // a clock time earlier today → t

const EARLIER: Row[] = [
  [at(9, 2), 'war_room', 'founder', 'message', '👑 @d2c-captain Morning! What’s on today?', ['d2c-captain']],
  [at(9, 4), 'war_room', 'd2c-captain', 'message', '🎯 **Today**\n\n- **Festive sale:** plan ready by tonight\n- **Payroll:** October run\n- **Library:** 6 new skills to shelve\n\n_I’ll ping you when a call is needed._'],
  [at(9, 20), 'war_room', 'librarian', 'done', '📚 **Library re-shelved**\n\n- **6** new skills\n- **8** shelves, one per department'],
  [at(10, 5), 'analytics', 'd2c-analyst', 'done', '📊 **Last week**\n\n- **Revenue:** **₹9.8L**, up **6%**\n- **AOV:** **₹1,090**\n- **RTO:** **7.2%**\n\n_Sunscreen is still the top seller._'],
  [at(10, 18), 'analytics', 'd2c-insights', 'message', '🔎 **Repeat buyers**\n\n- **Serum buyers:** **34%** come back in 60 days\n- **Sunscreen buyers:** **21%**\n\n_A Serum refill nudge at day 45 should pay._'],
  [at(11, 2), 'ads', 'd2c-google', 'done', '🔍 **Google Search**\n\n- **Brand terms:** **₹4.2** back per **₹1**\n- **“vitamin c serum”:** **₹1.4** back\n\n**_Paused the generic term, kept brand._**'],
  [at(11, 15), 'ads', 'd2c-marketplaces', 'message', '🛒 **Amazon Sponsored Ads**\n\n- **ACoS:** **18%** (target 20%)\n- **Glow Kit:** best seller in its category\n\n_No changes needed._'],
  [at(12, 10), 'creators', 'd2c-ugc', 'message', '🎬 **4 UGC videos in**\n\n- **Best hook:** “my 3-step glow routine”\n- **Length:** 18–25 s each\n\n_Queued for Meta testing next week._'],
  [at(12, 30), 'creators', 'd2c-influencers', 'message', '⭐ **October creators**\n\n- **GlowWithAnu:** **2.1x** return\n- **Desi Skin Desk:** **1.7x** return\n\n_Both are on the festive shortlist._'],
  [at(13, 40), 'ops', 'd2c-procurement', 'done', '🧾 **PO raised**\n\n- **SKU02 Sunscreen:** **2,000** units\n- **Lead time:** **7** days\n\n_Covers the sale with a week to spare._'],
  [at(14, 5), 'ops', 'd2c-logistics', 'message', '🚚 **Courier scorecard**\n\n- **Delhivery:** RTO **6.8%**\n- **Shadowfax:** RTO **9.1%**\n\n**_Moving Tier-2 COD to Delhivery._**'],
  [at(15, 10), 'design', 'd2c-copywriter', 'done', '✍️ **Serum page copy**\n\n- **Headline:** “Brighter in 14 days, or your money back”\n- **Bullets:** cut from 7 to 4\n\n_@d2c-design ready for the page._', ['d2c-design']],
  [at(15, 32), 'design', 'd2c-design', 'message', '🎨 **Page refresh live**\n\n- **Serum page:** new hero + 4 bullets\n\n_Watching add-to-cart for a week._'],
  [at(16, 45), 'finance', 'd2c-finance', 'done', '💰 **October close**\n\n- **Net revenue:** **₹37.9L**\n- **EBITDA:** **-₹2.3L**\n- **Biggest cost:** Meta ads\n\n**_Ads must return 2.5x to break even._**'],
  [at(17, 10), 'finance', 'd2c-payroll', 'done', '🧾 **Payroll ready**\n\n- **12** people, **₹6.4L**\n- **Pay date:** 1 Nov\n\n_Files sent to the bank._'],
  [at(18, 50), 'war_room', 'founder', 'message', '👑 @d2c-captain Let’s plan the festive sale at 8.', ['d2c-captain']],
  [at(18, 52), 'war_room', 'd2c-captain', 'message', '🎯 **Ready at 8**\n\n_Pulling last summer’s sale numbers first._'],
];

/** Sale day one, live: plays after the history, then the whole office replays on a loop. */
const LIVE: Row[] = [
  [4000, 'analytics', 'd2c-analyst', 'working', '📊 **Hour 1 numbers coming in**\n\n_Website, Amazon and Nykaa first._'],
  [10000, 'analytics', 'd2c-analyst', 'done', '📊 **Sale hour 1**\n\n- **Orders:** **412** (plan: 380)\n- **Revenue:** **₹4.1L**\n- **Top seller:** Sunscreen SPF 50\n\n**_8% ahead of plan._**'],
  [18000, 'ads', 'd2c-ads', 'message', '📣 **Advantage+ is flying**\n\n- **Advantage+:** **3.4x** in hour 1\n- **Retargeting:** **2.9x**\n- **Lookalike 1%:** **1.9x**'],
  [26000, 'creators', 'd2c-ugc', 'message', '🎬 **First creator reel is live**\n\n- **GlowWithAnu:** **48k** views in 40 min\n- **Code GLOW30:** **63** orders'],
  [34000, 'ops', 'd2c-logistics', 'message', '🚚 **Delhi trucks checked in**\n\n- **SKU01:** **70** units\n- **SKU05:** **40** units\n\n_@d2c-ops stock is live in Delhi._', ['d2c-ops']],
  [40000, 'ops', 'd2c-ops', 'done', '📦 **No stockouts so far**\n\n- **Delhi:** **2.5** days of cover\n- **RTO:** **6.1%**, down from 7.2%'],
  [48000, 'war_room', 'd2c-captain', 'working', '🎯 **Moving money to the winner**\n\n_Checking the split with Finance._'],
  [56000, 'war_room', 'd2c-captain', 'approval_needed', '🎯 **Approval needed**\n\n- **Shift:** **₹40k** from Lookalike to Advantage+\n- **Why:** **3.4x** vs **1.9x** return\n- **Total spend:** unchanged\n\n**_@founder approve the shift?_**', ['founder']],
  [70000, 'design', 'd2c-copywriter', 'message', '✍️ **Push copy for tonight**\n\n- _“Your festive glow, 30% off. Ends Sunday.”_\n\n_@d2c-design pairing it with the hero banner._', ['d2c-design']],
  [84000, 'finance', 'd2c-finance', 'message', '💰 **Spend pacing**\n\n- **Ads:** **₹58k** of **₹3L**\n- **Creators:** **₹45k** paid\n\n_On track. EBITDA stays positive._'],
  [98000, 'ads', 'd2c-marketplaces', 'message', '🛒 **Amazon is low on Glow Kits**\n\n- **Amazon FBA:** **14** left\n- **Website:** **120** in stock\n\n_@d2c-ops can we refill FBA?_', ['d2c-ops']],
  [106000, 'ops', 'd2c-procurement', 'done', '🧾 **Glow Kit refill booked**\n\n- **300** kits to Amazon FBA\n- **Lands:** in 3 days'],
  [120000, 'analytics', 'd2c-forecaster', 'message', '📈 **Forecast updated**\n\n- **5-day units:** **3,610** (was 3,340)\n- **Revenue:** about **₹22.1L**'],
  [135000, 'analytics', 'd2c-insights', 'message', '🔎 **Who’s buying**\n\n- **New customers:** **61%**\n- **Repeat:** **39%**, mostly Serum'],
];

const SALE_AT = at(20, 0);
export const DEMO_ACCOUNT_FEED: OfficeEvent[] = [
  ...EARLIER.map(ev('earlier')),
  ...(saleDemo as OfficeEvent[]).map((e) => ({ ...e, id: `sale-${e.id}`, t: SALE_AT + e.t })),
  ...LIVE.map(ev('live')),
];
