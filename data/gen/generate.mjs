// Kesar & Co. demo data generator (contracts/data-catalog.md, v2).
// Deterministic: seeded PRNG, Node stdlib only. Run: node data/gen/generate.mjs [outDir]
// Reads the frozen v1 files from data/ and writes every v2 file to outDir (default data/).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : DATA;
fs.mkdirSync(OUT, { recursive: true });

// ---------- helpers ----------
const readCsv = (f) => {
  const [h, ...rows] = fs.readFileSync(path.join(DATA, f), 'utf8').trim().split('\n');
  const cols = h.split(',');
  return rows.map((r) => Object.fromEntries(r.split(',').map((v, i) => [cols[i], v])));
};
const cell = (v) => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v ?? '');
const writeCsv = (f, cols, rows) =>
  fs.writeFileSync(path.join(OUT, f), [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n');
const writeFile = (f, s) => fs.writeFileSync(path.join(OUT, f), s);

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
// one independent stream per module, so tuning one file never reshuffles another
function rng(name) {
  const f = mulberry32(hash('kesar-v2:' + name));
  const r = {
    f,
    int: (a, b) => a + Math.floor(f() * (b - a + 1)),
    pick: (a) => a[Math.floor(f() * a.length)],
    chance: (p) => f() < p,
    wpick(items, w) { const t = w.reduce((a, b) => a + b, 0); let x = f() * t; for (let i = 0; i < items.length; i++) { x -= w[i]; if (x < 0) return items[i]; } return items[items.length - 1]; },
    norm() { return Math.sqrt(-2 * Math.log(1 - f())) * Math.cos(2 * Math.PI * f()); },
    noise: (sd) => Math.max(0.2, 1 + sd * r.norm()),
    pois(l) { if (l > 40) return Math.max(0, Math.round(l + Math.sqrt(l) * r.norm())); let k = 0, p = 1; const L = Math.exp(-l); do { k++; p *= f(); } while (p > L); return k - 1; },
  };
  return r;
}
const round = Math.round;
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const sum = (a, f = (x) => x) => a.reduce((s, x) => s + f(x), 0);
const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const addDays = (s, n) => iso(Date.parse(s) + n * DAY);
const dow = (s) => new Date(s).getUTCDay();
const DAYS = Array.from({ length: 92 }, (_, i) => iso(Date.UTC(2026, 7, 1) + i * DAY));
const MONTHS = ['2026-08', '2026-09', '2026-10'];
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

// ---------- v1 inputs (frozen) ----------
const products = readCsv('products.csv').map((p) => ({ ...p, mrp: +p.mrp, cogs: +p.cogs, avg: +p.avg_daily_units }));
const SKUS = products.map((p) => p.sku);
const P = Object.fromEntries(products.map((p) => [p.sku, p]));
const metaV1 = readCsv('meta_campaigns.csv');
const infV1 = readCsv('influencers.csv');
const WAREHOUSES = ['Mumbai', 'Delhi', 'Bangalore'];
const HOME = { North: 'Delhi', West: 'Mumbai', South: 'Bangalore' };

// ---------- calendar / seasonality ----------
const DUSSEHRA = { '2026-10-19': 1.35, '2026-10-20': 2.0, '2026-10-21': 2.35, '2026-10-22': 2.45, '2026-10-23': 2.1, '2026-10-24': 1.7, '2026-10-25': 1.25 };
const WEEKDAY = [1.12, 1.08, 1.0, 0.97, 0.95, 0.92, 0.96]; // Sun..Sat
function seasonRaw(d, sku) {
  const i = DAYS.indexOf(d), dom = +d.slice(8);
  let m = WEEKDAY[dow(d)] * (1 + 0.0024 * (i - 46)); // gentle growth trend
  if (dom <= 5) m *= 1.1; // payday
  if (d >= '2026-08-14' && d <= '2026-08-16') m *= 1.25; // Independence Day sale
  if (d >= '2026-08-24' && d <= '2026-08-27') m *= sku === 'SKU05' ? 1.9 : 1.12; // Raksha Bandhan gifting (28 Aug)
  if (d >= '2026-10-11' && d <= '2026-10-18') m *= 1.12; // Navratri
  if (DUSSEHRA[d]) m *= sku === 'SKU05' ? DUSSEHRA[d] * 1.25 : DUSSEHRA[d]; // Dussehra festive week
  if (sku === 'SKU02') m *= d < '2026-09-15' ? 1.06 : 0.95; // sunscreen softens as monsoon ends
  return m;
}
const SEASON = {};
for (const s of SKUS) {
  const raw = DAYS.map((d) => seasonRaw(d, s));
  const k = (92 * 1.1) / sum(raw); // 92-day mean = avg_daily_units x 1.1 (slight growth since v1 averages were set)
  DAYS.forEach((d, i) => (SEASON[d + s] = raw[i] * k));
}
const isFestive = (d) => d >= '2026-10-19' && d <= '2026-10-25';

// ---------- geography ----------
// [city, region, tier, weight]  tier: 1 metro/tier-1, 2, 3
const CITIES = [
  ['Delhi', 'North', 1, 30], ['Gurugram', 'North', 1, 12], ['Noida', 'North', 1, 10], ['Lucknow', 'North', 2, 9], ['Jaipur', 'North', 2, 9],
  ['Chandigarh', 'North', 2, 7], ['Kanpur', 'North', 2, 5], ['Ludhiana', 'North', 2, 5], ['Dehradun', 'North', 3, 4], ['Meerut', 'North', 3, 4], ['Jammu', 'North', 3, 3],
  ['Mumbai', 'West', 1, 32], ['Thane', 'West', 1, 9], ['Pune', 'West', 1, 18], ['Ahmedabad', 'West', 1, 11], ['Surat', 'West', 2, 7], ['Vadodara', 'West', 2, 5],
  ['Nagpur', 'West', 2, 5], ['Indore', 'West', 2, 6], ['Bhopal', 'West', 2, 4], ['Nashik', 'West', 3, 4],
  ['Bangalore', 'South', 1, 34], ['Hyderabad', 'South', 1, 24], ['Chennai', 'South', 1, 20], ['Kochi', 'South', 2, 6], ['Coimbatore', 'South', 2, 5],
  ['Visakhapatnam', 'South', 2, 4], ['Mysuru', 'South', 3, 3], ['Madurai', 'South', 3, 3], ['Thiruvananthapuram', 'South', 3, 3],
].map(([city, region, tier, w]) => ({ city, region, tier, w }));
const CITY = Object.fromEntries(CITIES.map((c) => [c.city, c]));
const METRO = new Set(['Delhi', 'Gurugram', 'Noida', 'Mumbai', 'Thane', 'Pune', 'Ahmedabad', 'Bangalore', 'Hyderabad', 'Chennai']);
const QC_CITIES = METRO; // quick commerce only runs in big metros
const ZONE_E = new Set(['Jammu', 'Kochi', 'Thiruvananthapuram']); // J&K, Kerala: special zone
const WH_CITIES = { Delhi: ['Delhi', 'Gurugram', 'Noida'], Mumbai: ['Mumbai', 'Thane'], Bangalore: ['Bangalore'] };
const WH_REGION = { Delhi: 'North', Mumbai: 'West', Bangalore: 'South' };
function zoneOf(city, wh) {
  if (WH_CITIES[wh].includes(city)) return 'A';
  if (ZONE_E.has(city)) return 'E';
  if (CITY[city].region === WH_REGION[wh]) return 'B';
  if (METRO.has(city)) return 'C';
  return 'D';
}
const REGION_W = { North: 0.4, West: 0.35, South: 0.25 };

// ---------- channels & fees ----------
const CHANNELS = ['Website', 'Amazon', 'Flipkart', 'Nykaa', 'Myntra', 'Blinkit', 'Zepto'];
const CH_SHARE = { Website: 0.45, Amazon: 0.19, Flipkart: 0.08, Myntra: 0.03, Nykaa: 0.15, Blinkit: 0.06, Zepto: 0.04 };
const FEES = [
  // channel, type, commission_pct, fixed_fee, shipping_fee, payment_gateway_pct, settlement_days, notes
  ['Website', 'D2C (Shopify + Razorpay)', 0, 0, 0, 2, 2, 'Shipping billed by courier, see couriers.csv; gateway 2% on prepaid only'],
  ['Amazon', 'Marketplace (Easy Ship)', 6, 25, 65, 0, 7, 'Referral fee 0% under Rs 1000 since Mar 2026 and 8% above, blended 6%; closing fee Rs 25; weight handling Rs 65'],
  ['Flipkart', 'Marketplace', 9, 20, 70, 0, 10, 'Commission 9% beauty, fixed fee Rs 20, shipping Rs 70 per shipment'],
  ['Nykaa', 'Beauty marketplace', 28, 0, 55, 0, 30, 'Nykaa takes 28% on selling price; long 30 day settlement'],
  ['Myntra', 'Marketplace (beauty)', 22, 30, 60, 0, 15, 'Commission 22% plus Rs 30 fixed fee'],
  ['Blinkit', 'Quick commerce', 22, 10, 15, 0, 30, '22% margin plus Rs 10 per order; Rs 15 dark-store inbound freight per order'],
  ['Zepto', 'Quick commerce', 24, 10, 15, 0, 30, '24% margin plus Rs 10 per order; Rs 15 dark-store inbound freight per order'],
].map(([channel, type, commission_pct, fixed_fee, shipping_fee, payment_gateway_pct, settlement_days, notes]) =>
  ({ channel, type, commission_pct, fixed_fee, shipping_fee, payment_gateway_pct, settlement_days, notes }));
const FEE = Object.fromEntries(FEES.map((f) => [f.channel, f]));
const CH_PREFIX = { Website: 'WEB', Amazon: 'AMZ', Flipkart: 'FK', Nykaa: 'NYK', Myntra: 'MYN', Blinkit: 'BLK', Zepto: 'ZEP' };
const COD_P = { Website: 0.42, Amazon: 0.34, Flipkart: 0.5, Myntra: 0.3, Nykaa: 0.22, Blinkit: 0.04, Zepto: 0.04 };
const RTO_COD = { Website: 0.2, Amazon: 0.12, Flipkart: 0.17, Myntra: 0.14, Nykaa: 0.11, Blinkit: 0.03, Zepto: 0.03 };
const TIER_RTO = { 1: 0.8, 2: 1.25, 3: 1.6 };
const RETURN_P = { Website: 0.022, Amazon: 0.045, Flipkart: 0.055, Myntra: 0.065, Nykaa: 0.03, Blinkit: 0.012, Zepto: 0.015 };
const REPEAT_P = { Website: 0.3, Amazon: 0.18, Flipkart: 0.14, Myntra: 0.12, Nykaa: 0.24, Blinkit: 0.3, Zepto: 0.26 };

// ---------- couriers ----------
// website orders ship through Shiprocket, which allocates one of these couriers
const COURIER = {
  Delhivery: { cost: [32, 38, 46, 52, 64], cod: 35, days: [1.6, 2.4, 3.0, 4.4, 6.2], rto: 1.0, w: 38 },
  Xpressbees: { cost: [29, 35, 42, 48, 60], cod: 32, days: [1.8, 2.7, 3.3, 4.8, 6.6], rto: 1.15, w: 25 },
  'Blue Dart': { cost: [45, 55, 68, 78, 92], cod: 45, days: [1.2, 1.9, 2.3, 3.4, 4.9], rto: 0.72, w: 12 },
  Shadowfax: { cost: [27, 33, 40, 46, 58], cod: 30, days: [1.4, 2.5, 3.4, 5.1, 7.0], rto: 1.3, w: 12 },
  Ekart: { cost: [30, 36, 44, 50, 62], cod: 33, days: [1.7, 2.6, 3.2, 4.6, 6.4], rto: 1.05, w: 13 },
};
const ZONES = ['A', 'B', 'C', 'D', 'E'];
const MKT_COURIER = { Amazon: 'Amazon Shipping', Flipkart: 'Ekart', Myntra: 'Ekart', Nykaa: 'Delhivery', Blinkit: 'Blinkit fleet', Zepto: 'Zepto fleet' };

// ---------- creators ----------
function creatorsAndPosts() {
  const R = rng('creators');
  const LANG = { North: ['Hindi', 'Hinglish', 'English'], West: ['Hinglish', 'Marathi', 'Gujarati', 'English'], South: ['English', 'Tamil', 'Telugu', 'Kannada', 'Malayalam'] };
  const v1Meta = {
    'Riya Glows': ['@riyaglows', 'Mumbai', 'Hinglish', 24.5], 'SkinBySana': ['@skinbysana', 'Delhi', 'Hinglish', 11.2],
    'The Derm Diaries': ['@thedermdiaries', 'Bangalore', 'English', 6.8], 'Meera Minimal': ['@meeraminimal', 'Pune', 'English', 9.4],
    'GlowWithAnu': ['@glowwithanu', 'Hyderabad', 'Telugu', 7.1], 'Desi Skin Desk': ['@desiskindesk', 'Lucknow', 'Hindi', 5.2],
    'Tanvi Tries': ['@tanvitries', 'Ahmedabad', 'Gujarati', 14.8], 'Kavya Care': ['@kavyacare', 'Chennai', 'Tamil', 3.9],
  };
  const creators = infV1.map((c) => {
    const [handle, city, language, fake] = v1Meta[c.name];
    const fee = +c.fee;
    return { handle, platform: c.platform, followers: +c.followers, engagement_pct: +c.engagement_pct, avg_views: +c.avg_views,
      fee_reel: fee, fee_story: round((fee * 0.3) / 500) * 500, niche: c.niche, city, language, fake_follower_pct: fake,
      name: c.name, tier: tierOf(+c.followers), past_brand_roas: +c.past_brand_roas, source: 'v1' };
  });
  function tierOf(f) { return f < 10000 ? 'nano' : f < 100000 ? 'micro' : f < 500000 ? 'mid' : f < 1000000 ? 'macro' : 'mega'; }
  const first = ['Aanya', 'Ishita', 'Pooja', 'Sneha', 'Ritika', 'Nidhi', 'Aditi', 'Shruti', 'Divya', 'Priya', 'Neha', 'Simran', 'Harini', 'Lavanya',
    'Megha', 'Payal', 'Kritika', 'Rhea', 'Zoya', 'Fatima', 'Bhavya', 'Tanya', 'Sakshi', 'Nandini', 'Deepa', 'Swati', 'Rohan', 'Arjun', 'Kabir', 'Vikram'];
  const suffix = ['skin', 'glows', 'beautydiary', 'tries', 'reviews', 'care', 'naturally', 'glowup', 'skintalks', 'minimal'];
  const niches = ['skincare', 'beauty', 'skincare', 'minimal beauty', 'ayurveda beauty', 'budget beauty', 'grooming', 'lifestyle'];
  // 30 extra creators: nano -> macro, mostly Instagram
  const tiers = [...Array(9).fill('nano'), ...Array(12).fill('micro'), ...Array(6).fill('mid'), ...Array(3).fill('macro')];
  tiers.forEach((tier, i) => {
    const nm = first[i];
    const platform = i % 10 === 3 ? 'YouTube' : i % 10 === 7 ? (i < 15 ? 'Moj' : 'YouTube') : i === 25 ? 'Josh' : 'Instagram';
    const followers = round({ nano: R.int(4000, 9800), micro: R.int(11000, 95000), mid: R.int(105000, 480000), macro: R.int(520000, 980000) }[tier] / 100) * 100;
    const engagement_pct = r1({ nano: R.int(60, 110) / 10, micro: R.int(35, 85) / 10, mid: R.int(22, 55) / 10, macro: R.int(12, 32) / 10 }[tier]);
    const avg_views = round((followers * (platform === 'YouTube' ? 0.45 : 0.32) * R.noise(0.25)) / 100) * 100;
    const c = R.wpick(CITIES, CITIES.map((x) => x.w));
    // fitted to the v1 rate card: fee ~ 18k x (followers / 45k)^0.58
    const fee_reel = Math.max(1500, round((18000 * (followers / 45000) ** 0.58 * R.noise(0.12)) / 500) * 500);
    const fake = r1({ nano: 3 + R.f() * 5, micro: 5 + R.f() * 9, mid: 8 + R.f() * 12, macro: 12 + R.f() * 16 }[tier]);
    const name = nm + ' ' + (['Sharma', 'Iyer', 'Reddy', 'Patel', 'Khan', 'Nair', 'Gupta', 'Mehta', 'Das', 'Joshi'][i % 10]);
    creators.push({ handle: '@' + nm.toLowerCase() + '.' + suffix[i % suffix.length], platform, followers, engagement_pct, avg_views,
      fee_reel, fee_story: round((fee_reel * 0.3) / 500) * 500, niche: R.pick(niches), city: c.city, language: R.pick(LANG[c.region]),
      fake_follower_pct: fake, name, tier, past_brand_roas: '', source: 'v2' });
  });

  // posts: ~14 per month, plus the fixed v1-creator story beats
  const H = Object.fromEntries(creators.map((c) => [c.name, c]));
  const fixed = [
    ['SkinBySana', '2026-08-09', 'story'], ['Desi Skin Desk', '2026-08-18', 'youtube_video'], ['Kavya Care', '2026-08-22', 'reel'],
    ['The Derm Diaries', '2026-09-06', 'youtube_video'], ['GlowWithAnu', '2026-09-12', 'reel'], ['Tanvi Tries', '2026-09-20', 'reel'],
['Riya Glows', '2026-10-08', 'reel'], ['Kavya Care', '2026-10-12', 'reel'],
    ['GlowWithAnu', '2026-10-17', 'story'], ['Desi Skin Desk', '2026-10-19', 'youtube_short'], ['SkinBySana', '2026-10-21', 'story'],
  ];
  const extra = creators.filter((c) => c.source === 'v2');
  const plan = fixed.map(([n, date, format]) => ({ c: H[n], date, format }));
  for (const m of MONTHS) {
    const n = { '2026-08': 7, '2026-09': 6, '2026-10': 9 }[m];
    for (let k = 0; k < n; k++) {
      const c = R.wpick(extra, extra.map((x) => ({ nano: 6, micro: 6, mid: 1.2, macro: 0.25 }[x.tier])));
      const dim = m === '2026-09' ? 30 : 31;
      let day = R.int(1, dim);
      if (m === '2026-10' && R.chance(0.45)) day = R.int(14, 22); // festive push
      const format = c.platform === 'YouTube' ? R.pick(['youtube_video', 'youtube_short']) : c.platform === 'Instagram' ? R.wpick(['reel', 'story', 'carousel'], [6, 3, 1]) : 'short_video';
      plan.push({ c, date: `${m}-${String(day).padStart(2, '0')}`, format });
    }
  }
  plan.sort((a, b) => (a.date + a.c.handle < b.date + b.c.handle ? -1 : 1));
  const used = new Set();
  const posts = plan.map((p, i) => {
    const c = p.c, story = p.format === 'story';
    const views = round(c.avg_views * (story ? 0.35 : 1) * R.noise(0.3));
    const likes = round(views * (c.engagement_pct / 100) * (story ? 0.2 : 1.6) * R.noise(0.2));
    const comments = round(likes * (0.025 + R.f() * 0.03));
    const ctr = (story ? 0.012 : p.format.startsWith('youtube') ? 0.009 : 0.004) * R.noise(0.3);
    const link_clicks = round(views * ctr);
    // expected coupon orders: engagement and real followers drive conversion; past ROAS hints at quality
    const quality = (c.engagement_pct / 4) * (1 - c.fake_follower_pct / 60) * (c.past_brand_roas ? +c.past_brand_roas / 3.2 : R.noise(0.25));
    const exp_orders = Math.max(1, views * 0.0011 * quality * (c.tier === 'nano' || c.tier === 'micro' ? 1.15 : 0.85));
    const barter = c.tier === 'nano' && R.chance(0.35);
    const fee_paid = barter ? 0 : story ? c.fee_story : c.fee_reel;
    let base = (c.handle.replace(/[^a-z]/gi, '').toUpperCase().replace(/^THE/, '')).slice(0, 6) + '15';
    let code = base; let k = 2;
    while (used.has(code)) code = base + String.fromCharCode(64 + k++);
    used.add(code);
    return { post_id: 'P' + String(i + 1).padStart(3, '0'), handle: c.handle, date: p.date, format: p.format, views, likes, comments, link_clicks,
      coupon_code: code, orders: 0, revenue: 0, fee_paid, platform: c.platform, barter: barter ? 'yes' : 'no', exp_orders, region: CITY[c.city].region };
  });
  return { creators, posts };
}
const { creators, posts } = creatorsAndPosts();
const DECAY = [0.34, 0.22, 0.15, 0.11, 0.08, 0.06, 0.04];

// ---------- orders ----------
function genOrders() {
  const R = rng('orders');
  const rows = [], customers = new Map(), pools = Object.fromEntries(CHANNELS.map((c) => [c, []]));
  const custSeq = Object.fromEntries(CHANNELS.map((c) => [c, 0]));
  let seq = 0;
  const cityW = CITIES.map((c) => c.w * REGION_W[c.region] / sum(CITIES.filter((x) => x.region === c.region), (x) => x.w));
  const qcCities = CITIES.filter((c) => QC_CITIES.has(c.city));

  function discountFor(ch, d) {
    if (isFestive(d)) return ch === 'Website' ? R.wpick([20, 25], [6, 4]) : R.wpick([15, 20, 25, 30], [2, 4, 3, 1]);
    if (d >= '2026-08-14' && d <= '2026-08-16') return R.wpick([15, 20], [6, 4]);
    switch (ch) {
      case 'Website': return R.wpick([0, 10, 15, 20], [36, 44, 14, 6]);
      case 'Amazon': case 'Flipkart': return R.wpick([5, 10, 15, 20], [20, 40, 30, 10]);
      case 'Nykaa': case 'Myntra': return R.wpick([10, 15, 20], [40, 40, 20]);
      default: return R.wpick([0, 5, 10], [50, 30, 20]);
    }
  }

  function makeOrder(d, ch, take, post) {
    const order_id = 'KC' + String(100000 + ++seq);
    // customer
    let cust = null;
    const pool = pools[ch];
    if (pool.length > 30 && R.chance(REPEAT_P[ch] * Math.min(1, pool.length / 400))) {
      for (let t = 0; t < 3 && !cust; t++) {
        const c = pool[Math.floor(R.f() * pool.length)];
        if (Date.parse(d) - Date.parse(c.last) >= 14 * DAY && (!QC_CITIES.has(c.city) ? !['Blinkit', 'Zepto'].includes(ch) : true)) cust = c;
      }
    }
    if (!cust) {
      let c;
      if (ch === 'Blinkit' || ch === 'Zepto') c = R.wpick(qcCities, qcCities.map((x) => x.w));
      else if (post && R.chance(0.5)) { const cs = CITIES.filter((x) => x.region === post.region); c = R.wpick(cs, cs.map((x) => x.w)); }
      else c = R.wpick(CITIES, cityW);
      cust = { customer_id: CH_PREFIX[ch] + '-' + String(++custSeq[ch]).padStart(6, '0'), first_order_date: d, city: c.city, region: c.region,
        acquisition_channel: ch, orders: 0, total_spend: 0, last: d, city_tier: c.tier, ...(post ? { acquired_by: post.coupon_code } : {}) };
      customers.set(cust.customer_id, cust); pool.push(cust);
    }
    cust.orders++; cust.last = d;
    const city = CITY[cust.city];
    const wh = R.chance(0.07) ? R.pick(WAREHOUSES.filter((w) => w !== HOME[city.region])) : HOME[city.region];
    const zone = ['Blinkit', 'Zepto'].includes(ch) ? 'A' : zoneOf(city.city, wh);
    // lines
    const units = take(R.wpick([1, 2, 3], [62, 28, 10]));
    const skus = SKUS.filter((s) => units.includes(s));
    const disc = post ? 15 : discountFor(ch, d);
    // payment and status
    const cod = R.chance(Math.min(0.8, (post ? 0.3 : COD_P[ch]) * { 1: 0.85, 2: 1.15, 3: 1.35 }[city.tier]));
    let courier = ch === 'Website' ? null : MKT_COURIER[ch];
    if (!courier) {
      const names = Object.keys(COURIER).filter((n) => !(n === 'Shadowfax' && zone === 'E'));
      courier = R.wpick(names, names.map((n) => COURIER[n].w * (n === 'Blue Dart' && zone === 'C' ? 2 : 1)));
    }
    let status = 'delivered';
    if (R.chance(cod ? 0.055 : 0.025)) status = 'cancelled';
    else {
      const p = cod ? RTO_COD[ch] * TIER_RTO[city.tier] * (ch === 'Website' ? COURIER[courier].rto : 1) * (isFestive(d) ? 1.15 : 1) : 0.015;
      if (R.chance(p)) status = 'rto';
    }
    const zi = ZONES.indexOf(zone);
    const deliveryDays = status === 'delivered'
      ? Math.max(['Blinkit', 'Zepto'].includes(ch) ? 0 : 1, round((ch === 'Website' ? COURIER[courier].days[zi] : ['Blinkit', 'Zepto'].includes(ch) ? 0.1 : [1.4, 2.2, 2.6, 3.8, 5.5][zi]) * R.noise(0.25) + (isFestive(d) ? 1 : 0)))
      : '';
    const lines = skus.map((sku, li) => {
      const qty = units.filter((x) => x === sku).length;
      const mrp = P[sku].mrp, gross = mrp * qty, net = round(gross * (1 - disc / 100));
      let st = status;
      if (st === 'delivered' && li === 0 && R.chance(RETURN_P[ch] * (sku === 'SKU04' ? 1.4 : 1))) st = 'returned';
      return { order_id, date: d, channel: ch, region: city.region, city: city.city, warehouse: wh, sku, qty, mrp, discount_pct: disc, gross_revenue: gross,
        net_revenue: net, payment: cod ? 'cod' : 'prepaid', status: st, customer_id: cust.customer_id,
        coupon: post ? post.coupon_code : '', courier: status === 'cancelled' ? '' : courier, zone: status === 'cancelled' ? '' : zone,
        delivery_days: st === 'delivered' || st === 'returned' ? deliveryDays : '', shipping_cost: 0, channel_fee: 0 };
    });
    costOrder(lines);
    for (const l of lines) if (l.status === 'delivered') cust.total_spend += l.net_revenue;
    if (post) { post.orders += status === 'cancelled' ? 0 : 1; post.revenue += status === 'cancelled' ? 0 : sum(lines, (l) => l.net_revenue); }
    rows.push(...lines);
  }

  for (const d of DAYS) {
    const u = Object.fromEntries(SKUS.map((s) => [s, P[s].avg * SEASON[d + s]]));
    // the day's units per SKU are drawn first, then packed into orders, so the SKU mix matches products.csv exactly
    const pool = SKUS.flatMap((s) => Array(R.pois(u[s] / 0.963)).fill(s)); // ~3.7% of orders get cancelled
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(R.f() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const take = (n) => (pool.length ? pool.splice(0, n) : [R.wpick(SKUS, SKUS.map((s) => u[s]))]);
        for (const p of posts) {
      const k = (Date.parse(d) - Date.parse(p.date)) / DAY;
      if (k < 0 || k > 6) continue;
      const n = R.pois(p.exp_orders * DECAY[k]);
      for (let j = 0; j < n; j++) makeOrder(d, 'Website', take, p);
    }
    const w = CHANNELS.map((c) => CH_SHARE[c] * (isFestive(d) && c !== 'Website' && c !== 'Nykaa' ? 1.15 : 1));
    while (pool.length) makeOrder(d, R.wpick(CHANNELS, w), take, null);
  }
  return { rows, customers: [...customers.values()] };
}

// order-level costs live on the order's first line; per-line fees on every line
function costOrder(lines) {
  const l0 = lines[0], ch = l0.channel, f = FEE[ch], cod = l0.payment === 'cod';
  const anyReturn = lines.some((l) => l.status === 'returned');
  for (const l of lines) {
    const pg = !cod ? (f.payment_gateway_pct / 100) * l.net_revenue : 0;
    if (l.status === 'cancelled') l.channel_fee = 0;
    else if (l.status === 'delivered') l.channel_fee = round((f.commission_pct / 100) * l.net_revenue + f.fixed_fee + pg);
    else l.channel_fee = round(f.fixed_fee + pg); // rto / returned: commission refunded, fixed + gateway fees kept
  }
  if (l0.status === 'cancelled') return;
  const st = l0.status === 'rto' ? 'rto' : 'shipped';
  if (ch === 'Website') {
    const c = COURIER[l0.courier], base = c.cost[ZONES.indexOf(l0.zone)];
    l0.shipping_cost = base + (cod && st !== 'rto' ? c.cod : 0) + (st === 'rto' || anyReturn ? base : 0);
  } else l0.shipping_cost = f.shipping_fee * (st === 'rto' || anyReturn ? 2 : 1);
}

const { rows: orders, customers } = genOrders();
const ORDERS_BY_ID = new Map();
for (const o of orders) { if (!ORDERS_BY_ID.has(o.order_id)) ORDERS_BY_ID.set(o.order_id, []); ORDERS_BY_ID.get(o.order_id).push(o); }

// ---------- returns ----------
const REASONS = [
  ['Damaged or leaking on arrival', 24, false], ['Skin irritation or breakout', 17, false], ['Did not suit skin type', 14, false],
  ['Wrong item delivered', 11, true], ['Changed mind', 12, true], ['Texture or fragrance not as expected', 9, false], ['Near expiry date', 5, true],
];
const SKU_REASON = { SKU02: ['White cast on skin', 14, false], SKU04: ['Too oily for my skin', 14, false], SKU05: ['Item missing from kit', 12, true] };
function genReturns() {
  const R = rng('returns');
  return orders.filter((o) => o.status === 'returned').map((o) => {
    const list = SKU_REASON[o.sku] ? [...REASONS, SKU_REASON[o.sku]] : REASONS;
    const [reason, , restockable] = R.wpick(list, list.map((x) => x[1]));
    return { order_id: o.order_id, date: addDays(o.date, (+o.delivery_days || 2) + R.int(2, 9)), sku: o.sku, channel: o.channel, reason,
      refund: o.net_revenue, restockable: restockable ? 'yes' : 'no', qty: o.qty };
  });
}
const returns = genReturns();

// ---------- meta ads ----------
function genMeta() {
  const R = rng('meta');
  const STRUCT = {
    'Retargeting - cart abandoners': { cpm: 430, adsets: { 'ATC 7d': [['Carousel - bestsellers', 'carousel', 1.0, 1.1], ['UGC - Kavya review', 'ugc_video', 0.9, 1.25]], 'Site visitors 30d': [['DPA - catalogue', 'catalogue', 1.2, 0.85]] } },
    'Advantage+ Shopping': { cpm: 210, adsets: { 'ASC - all products': [['UGC - serum before after', 'ugc_video', 1.4, 1.25], ['Static - Vitamin C hero', 'static', 0.8, 0.8], ['Reel - sunscreen no white cast', 'reel', 1.0, 1.0]] } },
    'Lookalike 1% buyers': { cpm: 250, adsets: { 'LAL 1% purchasers': [['UGC - SPF 50 test', 'ugc_video', 1.1, 1.15], ['Static - kesar glow', 'static', 0.7, 0.8]], 'LAL 1% high AOV': [['Carousel - glow kit', 'carousel', 0.8, 1.0]] } },
    'Broad prospecting': { cpm: 115, adsets: { 'Women 18-34 metro': [['Reel - the kesar story', 'reel', 1.1, 1.1], ['Static - founder note', 'static', 0.7, 0.75]], 'Women 25-44 tier 2': [['Reel - Hindi voiceover', 'reel', 0.9, 1.05]] } },
  };
  const rows = [];
  const WIN0 = '2026-10-02', WIN1 = '2026-10-31';
  for (const v of metaV1) {
    const s = STRUCT[v.campaign], roas = +v.roas, ctr = +v.ctr_pct / 100;
    const ads = Object.entries(s.adsets).flatMap(([adset, list]) => list.map(([ad, ct, w, q]) => ({ adset, ad, ct, w, q })));
    const tmp = [];
    for (const d of DAYS) {
      const mo = d.slice(0, 7);
      const lvl = { '2026-08': 0.7, '2026-09': 0.78, '2026-10': 1 }[mo] * (isFestive(d) ? 1.7 : 1) * (dow(d) === 0 ? 1.08 : 1);
      const roasDay = roas * { '2026-08': 0.93, '2026-09': 0.97, '2026-10': 1 }[mo] * (isFestive(d) ? 1.18 : 1);
      for (const a of ads) {
        const spend = lvl * a.w * R.noise(0.18);
        tmp.push({ d, a, spend, revenue: spend * roasDay * a.q * R.noise(0.3) });
      }
    }
    // scale everything so the 30-day window matches v1 exactly; outside the window, same scale for continuity
    const inWin = (t) => t.d >= WIN0 && t.d <= WIN1;
    const ks = +v.spend / sum(tmp.filter(inWin), (t) => t.spend), kr = +v.revenue / sum(tmp.filter(inWin), (t) => t.revenue);
    for (const t of tmp) { t.spend = round(t.spend * ks); t.revenue = round(t.revenue * kr); }
    const last = tmp.filter((t) => t.d === WIN1).at(-1);
    last.spend += +v.spend - sum(tmp.filter(inWin), (t) => t.spend);
    last.revenue += +v.revenue - sum(tmp.filter(inWin), (t) => t.revenue);
    for (const t of tmp) {
      const impressions = round((t.spend / (s.cpm * R.noise(0.1))) * 1000);
      const clicks = round(impressions * ctr * R.noise(0.12));
      const purchases = round(t.revenue / (860 * R.noise(0.08)));
      const add_to_cart = Math.max(purchases, round(purchases * (3.2 + R.f() * 1.4)));
      rows.push({ date: t.d, campaign: v.campaign, adset: t.a.adset, ad: t.a.ad, creative_type: t.a.ct, spend: t.spend, impressions, clicks, add_to_cart, purchases, revenue: t.revenue });
    }
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}
const meta = genMeta();

// ---------- google ads ----------
function genGoogle() {
  const R = rng('google');
  const C = [
    ['Brand - Kesar & Co', 'search', 420, 6, 7.4, 0.11], ['Generic - vitamin c serum', 'search', 600, 19, 1.9, 0.045],
    ['Shopping - sunscreen', 'shopping', 300, 9, 2.6, 0.018], ['PMax - all products', 'performance_max', 850, 11, 3.1, 0.012],
    ['YouTube - the kesar story', 'video', 400, 4, 0.5, 0.004],
  ];
  const rows = [];
  for (const d of DAYS) for (const [campaign, type, base, cpc, roas, ctr] of C) {
    const lvl = { '2026-08': 0.92, '2026-09': 0.96, '2026-10': 1.05 }[d.slice(0, 7)] * (isFestive(d) ? 1.5 : 1);
    const spend = round(base * lvl * R.noise(0.15));
    const clicks = round(spend / (cpc * R.noise(0.12)));
    const impressions = round(clicks / (ctr * R.noise(0.15)));
    const revenue = round(spend * roas * R.noise(0.35));
    rows.push({ date: d, campaign, type, spend, impressions, clicks, conversions: round(revenue / (820 * R.noise(0.1))), revenue });
  }
  return rows;
}
const google = genGoogle();

// ---------- marketplace ads ----------
function genMktAds() {
  const R = rng('mktads');
  const C = [
    ['Amazon', 'SP - Sunscreen auto', 620, 9, 4.2], ['Amazon', 'SP - Vitamin C exact', 460, 12, 3.6], ['Amazon', 'SB - Kesar brand video', 260, 7, 2.4],
    ['Flipkart', 'PLA - Sunscreen', 300, 6, 3.0], ['Nykaa', 'Nykaa Sponsored - Serum', 520, 9, 3.2],
    ['Blinkit', 'Blinkit Search - Sunscreen', 380, 5, 2.6], ['Zepto', 'Zepto Ads - Sunscreen', 240, 5, 2.3],
  ];
  const rows = [];
  for (const d of DAYS) for (const [platform, campaign, base, cpc, roas] of C) {
    const lvl = { '2026-08': 0.9, '2026-09': 0.95, '2026-10': 1.05 }[d.slice(0, 7)] * (isFestive(d) ? 1.8 : 1);
    const spend = round(base * lvl * R.noise(0.2));
    const revenue = round(spend * roas * (isFestive(d) ? 1.1 : 1) * R.noise(0.3));
    rows.push({ date: d, platform, campaign, spend, clicks: round(spend / (cpc * R.noise(0.12))), orders: round(revenue / (640 * R.noise(0.1))), revenue });
  }
  return rows;
}
const mktAds = genMktAds();

// ---------- procurement ----------
const SUPPLIERS = [
  ['S01', 'Ankur Formulations Pvt Ltd', 'Baddi', 'Contract manufacturer', 45, 4.3],
  ['S02', 'Vasant Chemicals', 'Mumbai', 'Actives and chemicals', 30, 4.1],
  ['S03', 'Nilgiri Botanicals', 'Coimbatore', 'Oils and botanicals', 30, 4.4],
  ['S04', 'Pampore Kesar Traders', 'Srinagar', 'Saffron', 0, 3.6],
  ['S05', 'Glassline Packaging', 'Vapi', 'Glass bottles and droppers', 30, 4.0],
  ['S06', 'Polytube India', 'Daman', 'Tubes and jars', 30, 3.9],
  ['S07', 'PrintCraft Cartons', 'Bhiwandi', 'Cartons, labels, gift boxes', 15, 4.2],
  ['S08', 'Sunshield Ingredients', 'Ahmedabad', 'UV filters and minerals', 45, 4.0],
].map(([supplier_id, name, city, category, payment_terms_days, rating]) => ({ supplier_id, name, city, category, payment_terms_days, rating }));
// material_id, name, unit, unit_cost, supplier, moq, lead_time_days
const MATERIALS = [
  ['RM01', 'Ethyl ascorbic acid (vitamin C)', 'kg', 5800, 'S02', 5, 14], ['RM02', 'Niacinamide', 'kg', 1250, 'S02', 10, 10],
  ['RM03', 'Hyaluronic acid (sodium hyaluronate)', 'kg', 42000, 'S02', 1, 21], ['RM04', 'Ferulic acid', 'kg', 14500, 'S02', 1, 21],
  ['RM05', 'Zinc oxide (non-nano)', 'kg', 640, 'S08', 25, 12], ['RM06', 'Titanium dioxide', 'kg', 520, 'S08', 25, 12],
  ['RM07', 'Kashmiri saffron (kesar)', 'g', 260, 'S04', 50, 20], ['RM08', 'Kumkumadi oil blend', 'litre', 2400, 'S03', 10, 15],
  ['RM09', 'Squalane (plant)', 'kg', 3600, 'S03', 5, 18], ['RM10', 'Glycerin (vegetable)', 'kg', 130, 'S02', 50, 7],
  ['RM11', 'Ceramide complex', 'kg', 18500, 'S02', 1, 25], ['RM12', 'Vitamin E (tocopherol)', 'kg', 2600, 'S02', 5, 10],
  ['RM13', 'Base cream (CM formula)', 'kg', 420, 'S01', 100, 21],
  ['PK01', '30 ml amber glass dropper bottle', 'piece', 22, 'S05', 5000, 30], ['PK02', '50 g sunscreen tube', 'piece', 13, 'S06', 10000, 25],
  ['PK03', '50 g airless jar', 'piece', 24, 'S06', 5000, 25], ['PK04', 'Mono carton', 'piece', 6, 'S07', 10000, 12],
  ['PK05', 'Front and back labels', 'set', 2, 'S07', 20000, 10], ['PK06', 'Glow kit gift box', 'piece', 58, 'S07', 2000, 18],
  ['PK07', '10 ml mini bottle', 'piece', 9, 'S05', 5000, 30], ['PK08', '20 ml mini tube', 'piece', 6, 'S06', 5000, 25],
  ['PK09', '30 ml face oil bottle with dropper', 'piece', 34, 'S05', 3000, 30],
].map(([material_id, name, unit, unit_cost, supplier_id, moq, lead_time_days]) => ({ material_id, name, unit, unit_cost, supplier_id, moq, lead_time_days }));
const BOM_SPEC = {
  SKU01: [['RM01', 0.0045], ['RM04', 0.00015], ['RM03', 0.00006], ['RM07', 0.02], ['RM12', 0.0003], ['RM10', 0.0015], ['PK01', 1], ['PK04', 1], ['PK05', 1]],
  SKU02: [['RM05', 0.0075], ['RM06', 0.0025], ['RM02', 0.001], ['RM13', 0.032], ['PK02', 1], ['PK04', 1], ['PK05', 1]],
  SKU03: [['RM11', 0.0003], ['RM03', 0.00005], ['RM07', 0.01], ['RM10', 0.0025], ['RM13', 0.04], ['PK03', 1], ['PK04', 1], ['PK05', 1]],
  SKU04: [['RM08', 0.022], ['RM09', 0.006], ['RM07', 0.12], ['RM12', 0.0004], ['PK09', 1], ['PK04', 1], ['PK05', 1]],
  SKU05: [['RM01', 0.0015], ['RM07', 0.1], ['RM05', 0.003], ['RM13', 0.025], ['RM08', 0.006], ['PK07', 1], ['PK08', 2], ['PK06', 1], ['PK05', 3]],
};
// conversion (job-work) charge from the contract manufacturer closes BOM cost to products.cogs exactly
function genBom() {
  const MC = Object.fromEntries(MATERIALS.map((m) => [m.material_id, m]));
  const bom = [], jw = [];
  for (const s of SKUS) {
    const mat = sum(BOM_SPEC[s], ([id, q]) => MC[id].unit_cost * q);
    const id = 'JW0' + s.slice(-1);
    const cost = r2(P[s].cogs - mat);
    if (cost < 5) throw new Error(`BOM for ${s} exceeds cogs (${mat})`);
    jw.push({ material_id: id, name: `Manufacturing and filling charge - ${P[s].name}`, unit: 'unit', unit_cost: cost, supplier_id: 'S01', moq: 1000, lead_time_days: 21 });
    for (const [material_id, qty_per_unit] of [...BOM_SPEC[s], [id, 1]]) bom.push({ sku: s, material_id, qty_per_unit });
  }
  return { bom, mats: [...MATERIALS, ...jw] };
}
const { bom, mats } = genBom();

function genPOs() {
  const R = rng('po');
  const pos = [];
  let n = 0;
  const raw = mats.filter((m) => !m.material_id.startsWith('JW'));
  for (const m of raw) {
    const every = m.material_id.startsWith('PK') ? 34 : m.material_id === 'RM07' ? 24 : 28;
    for (let t = R.int(0, 14); t < 104; t += every + R.int(-4, 6)) {
      const date = addDays('2026-08-01', t);
      if (date > '2026-11-05') break;
      const qty = m.moq * R.wpick([1, 2, 3], [5, 3, 1]);
      const drift = 1 + (t / 92) * (m.material_id === 'RM01' ? 0.09 : m.material_id === 'RM07' ? 0.14 : 0.02);
      const unit_cost = r2(m.unit_cost * drift * (0.97 + R.f() * 0.04));
      const expected = addDays(date, m.lead_time_days);
      let late = R.chance(0.2) ? R.int(2, 8) : R.int(-2, 1);
      if (m.material_id === 'RM07' && date >= '2026-10-01') late = 11; // the saffron story
      const recv = addDays(expected, late);
      let status, received_date = '';
      if (recv <= '2026-11-06') { status = late > 2 ? 'received_late' : 'received'; received_date = recv; }
      else status = expected < '2026-11-07' ? 'delayed' : date >= '2026-11-01' ? 'open' : 'in_transit';
      pos.push({ date, supplier_id: m.supplier_id, material_id: m.material_id, qty, unit_cost, total: round(qty * unit_cost), expected_date: expected, received_date, status, payment_due: addDays(recv, SUPPLIERS.find((s) => s.supplier_id === m.supplier_id).payment_terms_days) });
    }
  }
  // finished-goods job-work POs to the contract manufacturer (monthly, all SKUs)
  for (const date of ['2026-08-04', '2026-09-03', '2026-10-01', '2026-11-03']) for (const s of SKUS) {
    const m = mats.find((x) => x.material_id === 'JW0' + s.slice(-1));
    const qty = round((P[s].avg * 30 * (date >= '2026-10-01' ? 1.3 : 1)) / 100) * 100;
    const expected = addDays(date, 21);
    const recv = date === '2026-11-03' ? '' : addDays(expected, R.int(-1, 4));
    pos.push({ date, supplier_id: 'S01', material_id: m.material_id, qty, unit_cost: m.unit_cost, total: round(qty * m.unit_cost), expected_date: expected,
      received_date: recv, status: recv ? (Date.parse(recv) - Date.parse(expected) > 2 * DAY ? 'received_late' : 'received') : 'open', payment_due: addDays(recv || expected, 45) });
  }
  pos.sort((a, b) => (a.date + a.material_id < b.date + b.material_id ? -1 : 1));
  pos.forEach((p) => (p.po_id = 'PO-26' + String(++n).padStart(3, '0')));
  // unit_cost stays the standard cost (BOM ties to cogs); last_po_cost shows where prices moved
  for (const m of mats) m.last_po_cost = pos.filter((p) => p.material_id === m.material_id).at(-1)?.unit_cost ?? m.unit_cost;
  return pos;
}
const pos = genPOs();
function stockMats() {
  const R = rng('rmstock');
  for (const m of mats) {
    const use = sum(bom.filter((b) => b.material_id === m.material_id), (b) => b.qty_per_unit * P[b.sku].avg * 30);
    m.stock = m.material_id.startsWith('JW') ? 0 : m.material_id === 'RM07' ? 140 : Math.max(m.moq * 0.3, use * (0.6 + R.f() * 1.6));
    m.stock = ['piece', 'set', 'g', 'unit'].includes(m.unit) ? round(m.stock) : r2(m.stock);
    m.monthly_usage = r2(use);
  }
}
stockMats();

// ---------- inventory ----------
function genInventory() {
  const R = rng('inventory');
  const weeks = []; for (let d = '2026-08-01'; d <= '2026-10-31'; d = addDays(d, 7)) weeks.push(d);
  const shipped = {}; // week-end date + wh + sku -> units shipped in (prev, d]
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    const wk = weeks.find((w) => w >= o.date);
    const k = wk + o.warehouse + o.sku; shipped[k] = (shipped[k] || 0) + o.qty;
  }
  const finalStock = { Mumbai: 'stock_mumbai', Delhi: 'stock_delhi', Bangalore: 'stock_bangalore' };
  const finalTransit = { 'Delhi|SKU02': 600, 'Bangalore|SKU02': 400, 'Mumbai|SKU03': 300 }; // FG arriving early Nov; note Delhi SKU01 has none
  const rows = [];
  for (const wh of WAREHOUSES) for (const s of SKUS) {
    let next = +P[s][finalStock[wh]];
    const out = [];
    let transit = finalTransit[wh + '|' + s] || 0;
    for (let i = weeks.length - 1; i >= 0; i--) {
      const d = weeks[i];
      const sh = shipped[d + wh + s] || 0;
      const weekly = Math.max(1, P[s].avg * 7 * ({ Delhi: 0.4, Mumbai: 0.35, Bangalore: 0.25 }[wh]));
      out.push({ date: d, warehouse: wh, sku: s, on_hand: next, in_transit: transit, reserved: round((sh / 7) * (0.6 + R.f() * 0.5)), shipped_week: sh });
      if (i === 0) break;
      // stock one week earlier = this week's stock + what shipped - what was received
      let received = 0;
      if (next + sh > weekly * (3.2 + R.f() * 1.5)) received = Math.max(0, round((next + sh - weekly * (1.4 + R.f())) / 50) * 50);
      out[out.length - 1].received_week = received;
      transit = received; // last week's in-transit is this week's receipt
      next = next + sh - received;
    }
    out.at(-1).received_week = 0;
    rows.push(...out.reverse());
  }
  rows.forEach((r) => (r.received_week ??= 0));
  rows.sort((a, b) => (a.date + a.warehouse + a.sku < b.date + b.warehouse + b.sku ? -1 : 1));
  return rows;
}
const inventory = genInventory();

// ---------- people ----------
// [name, gender, dept, role, level, city, join_date, ctc_lakh, variable_pct]
const PEOPLE = [
  ['Ananya Kapoor', 'F', 'Founders', 'Co-founder and CEO', 'L7', 'Mumbai', '2023-06-01', 9.6, 0],
  ['Rohit Malhotra', 'M', 'Founders', 'Co-founder and COO', 'L7', 'Mumbai', '2023-06-01', 9.6, 0],
  ['Ishaan Verma', 'M', 'Growth', 'Head of Growth', 'L5', 'Mumbai', '2024-04-01', 15, 10],
  ['Sana Qureshi', 'F', 'Growth', 'Performance Marketing Manager', 'L4', 'Mumbai', '2024-08-01', 8.4, 10],
  ['Karan Bhatia', 'M', 'Growth', 'Marketplaces Manager', 'L4', 'Delhi', '2024-11-01', 8.4, 10],
  ['Pooja Nair', 'F', 'Growth', 'Marketplaces Executive', 'L2', 'Delhi', '2025-07-01', 4.2, 5],
  ['Tara Menon', 'F', 'Growth', 'Creator Partnerships Manager', 'L3', 'Bangalore', '2025-01-01', 6.6, 10],
  ['Aditi Rao', 'F', 'Growth', 'Social Media Executive', 'L2', 'Mumbai', '2025-09-01', 3.9, 0],
  ['Neel Shah', 'M', 'Growth', 'CRM and Retention Executive', 'L2', 'Mumbai', '2025-04-01', 4.5, 5],
  ['Vikram Sethi', 'M', 'Ops', 'Operations Manager', 'L4', 'Mumbai', '2024-02-01', 8.4, 10],
  ['Meghna Iyer', 'F', 'Ops', 'Procurement Executive', 'L2', 'Mumbai', '2025-03-01', 4.8, 5],
  ['Dr. Farah Siddiqui', 'F', 'Ops', 'Formulation Chemist', 'L3', 'Mumbai', '2024-06-01', 7.2, 5],
  ['Arjun Yadav', 'M', 'Ops', 'Warehouse Coordinator (Delhi)', 'L1', 'Delhi', '2025-02-01', 3.3, 0],
  ['Manjunath Gowda', 'M', 'Ops', 'Warehouse Coordinator (Bangalore)', 'L1', 'Bangalore', '2025-05-01', 3.3, 0],
  ['Rhea D\'Souza', 'F', 'Design', 'Design Lead', 'L4', 'Mumbai', '2024-03-01', 7.8, 5],
  ['Kunal Joshi', 'M', 'Design', 'Graphic Designer', 'L2', 'Mumbai', '2025-01-01', 4.2, 0],
  ['Simran Gill', 'F', 'Design', 'Video Editor', 'L2', 'Delhi', '2025-10-01', 3.9, 0],
  ['Nikhil Agarwal', 'M', 'Finance', 'Finance Manager', 'L4', 'Mumbai', '2024-05-01', 7.8, 5],
  ['Priya Kulkarni', 'F', 'Finance', 'Accounts Executive', 'L2', 'Mumbai', '2025-02-01', 3.6, 0],
  ['Divya Pillai', 'F', 'CX', 'CX Lead', 'L3', 'Bangalore', '2024-09-01', 5.4, 5],
  ['Rahul Mishra', 'M', 'CX', 'CX Executive', 'L1', 'Delhi', '2025-06-01', 3.3, 0],
  ['Lavanya Reddy', 'F', 'CX', 'CX Executive', 'L1', 'Bangalore', '2026-10-01', 3.3, 0],
  ['Aakash Jain', 'M', 'Tech', 'Shopify Developer', 'L3', 'Bangalore', '2024-10-01', 8.4, 0],
  ['Zoya Khan', 'F', 'Tech', 'Data Analyst', 'L3', 'Mumbai', '2026-09-01', 6.6, 5],
  ['Siddharth Rao', 'M', 'Tech', 'Automation Engineer (AI agents)', 'L3', 'Bangalore', '2026-08-01', 6.6, 0],
];
const STATE = { Mumbai: 'Maharashtra', Delhi: 'Delhi', Bangalore: 'Karnataka' };
function professionalTax(city, gender, gross) {
  if (STATE[city] === 'Maharashtra') { if (gender === 'F' && gross <= 25000) return 0; return gross <= 7500 ? 0 : gross <= 10000 ? 175 : 200; }
  if (STATE[city] === 'Karnataka') return gross >= 25000 ? 200 : 0;
  return 0; // Delhi has no professional tax
}
// New regime FY 2026-27: std deduction 75k, slabs 0-4L nil, 5/10/15/20/25/30, 87A rebate to 12L with marginal relief, 4% cess
function annualTax(taxable) {
  const slabs = [[400000, 0], [800000, 0.05], [1200000, 0.1], [1600000, 0.15], [2000000, 0.2], [2400000, 0.25], [Infinity, 0.3]];
  let tax = 0, lo = 0;
  for (const [hi, rate] of slabs) { if (taxable > lo) tax += (Math.min(taxable, hi) - lo) * rate; lo = hi; }
  if (taxable <= 1200000) tax = 0; else tax = Math.min(tax, taxable - 1200000);
  return tax * 1.04;
}
function genPeople() {
  const employees = PEOPLE.map(([name, gender, dept, role, level, city, join_date, ctcL, variable_pct], i) => {
    const ctc_annual = round(ctcL * 100000);
    const fixedMonthly = round((ctc_annual * (1 - variable_pct / 100)) / 12);
    const basic_monthly = round(fixedMonthly * (dept === 'Founders' ? 0.5 : 0.45));
    const hra_monthly = round(basic_monthly * (city === 'Bangalore' ? 0.4 : 0.5));
    const pf_employer_monthly = round(0.12 * Math.min(basic_monthly, 15000));
    const special_monthly = fixedMonthly - basic_monthly - hra_monthly - pf_employer_monthly;
    return { emp_id: 'E' + String(i + 1).padStart(3, '0'), name, dept, role, level, city, join_date, ctc_annual, basic_monthly, hra_monthly, special_monthly,
      pf_employer_monthly, variable_pct, gender, state: STATE[city] };
  });
  const payroll = employees.filter((e) => e.join_date <= '2026-10-01').map((e) => {
    const gross = e.basic_monthly + e.hra_monthly + e.special_monthly;
    const pf_employee = round(0.12 * Math.min(e.basic_monthly, 15000));
    const professional_tax = professionalTax(e.city, e.gender, gross);
    const tds = round(annualTax(gross * 12 - 75000) / 12);
    return { emp_id: e.emp_id, month: '2026-10', gross, pf_employee, professional_tax, tds, net_pay: gross - pf_employee - professional_tax - tds,
      pf_employer: e.pf_employer_monthly, employer_cost: gross + e.pf_employer_monthly, name: e.name, dept: e.dept };
  });
  return { employees, payroll };
}
const { employees, payroll } = genPeople();
const salaryFor = (m) => sum(employees.filter((e) => e.join_date <= m + '-01'), (e) => e.basic_monthly + e.hra_monthly + e.special_monthly + e.pf_employer_monthly);

// ---------- opex ----------
function genOpex() {
  const R = rng('opex');
  const rows = [];
  const add = (month, category, vendor, amount) => rows.push({ month, category, vendor, amount: round(amount) });
  for (const m of MONTHS) {
    const shippedBy = (wh) => new Set(orders.filter((o) => o.date.startsWith(m) && o.warehouse === wh && o.status !== 'cancelled').map((o) => o.order_id)).size;
    add(m, 'Rent', 'Office lease - Andheri East, Mumbai', 78000);
    for (const [wh, v] of [['Mumbai', 'StackBox 3PL'], ['Delhi', 'NCR Fulfil 3PL'], ['Bangalore', 'Southline 3PL']])
      add(m, 'Warehousing (3PL)', `${v} - ${wh}`, 12000 + shippedBy(wh) * 9);
    add(m, 'Software', 'Shopify (plan and apps)', 14500);
    add(m, 'Software', 'Shiprocket platform', 2999);
    add(m, 'Software', 'Checkout and COD verification app', 6500 + R.int(0, 1500));
    add(m, 'Software', 'WhatsApp marketing (BSP)', 9000 + R.int(0, 3000));
    add(m, 'Software', 'Email and SMS', 7200);
    add(m, 'Software', 'Google Workspace', 25 * 175);
    add(m, 'Software', 'Helpdesk', 4800);
    add(m, 'Software', 'Accounting and payroll software', 3800);
    add(m, 'Creative production', 'Product shoot and UGC edits', { '2026-08': 38000, '2026-09': 42000, '2026-10': 64000 }[m]);
    add(m, 'Professional fees', 'CA firm (books, GST, TDS filing)', 22000);
    add(m, 'Professional fees', 'Legal and trademark', m === '2026-09' ? 22000 : 6000);
    add(m, 'Utilities', 'Electricity, internet, housekeeping', 13500 + R.int(0, 2000));
    add(m, 'Travel', 'Team travel', 9000 + R.int(0, 6000));
    add(m, 'Samples and gifting', 'PR boxes and creator seeding', { '2026-08': 18000, '2026-09': 21000, '2026-10': 34000 }[m]);
    add(m, 'Bank and compliance', 'Bank charges, ROC, stamp duty', 3200);
    if (m === '2026-10') add(m, 'Recruitment', 'Job portal subscription', 14000);
    if (m === '2026-08') add(m, 'Insurance', 'Group health insurance (quarterly)', 52000);
  }
  return rows;
}
const opex = genOpex();

// ---------- P&L ----------
function genPnl() {
  const nonRestock = new Set(returns.filter((r) => r.restockable === 'no').map((r) => r.order_id + r.sku));
  return MONTHS.map((m) => {
    const o = orders.filter((x) => x.date.startsWith(m) && x.status !== 'cancelled');
    const gross_revenue = sum(o, (x) => x.gross_revenue);
    const discounts = sum(o, (x) => x.gross_revenue - x.net_revenue);
    const ret = sum(o.filter((x) => x.status === 'rto' || x.status === 'returned'), (x) => x.net_revenue);
    const net_revenue = gross_revenue - discounts - ret;
    const cogs = sum(o.filter((x) => x.status === 'delivered' || (x.status === 'returned' && nonRestock.has(x.order_id + x.sku))), (x) => x.qty * P[x.sku].cogs);
    const channel_fees = sum(o, (x) => x.channel_fee);
    const shipping = sum(o, (x) => x.shipping_cost);
    const meta_ads = sum(meta.filter((x) => x.date.startsWith(m)), (x) => x.spend);
    const google_ads = sum(google.filter((x) => x.date.startsWith(m)), (x) => x.spend);
    const marketplace_ads = sum(mktAds.filter((x) => x.date.startsWith(m)), (x) => x.spend);
    const creator_fees = sum(posts.filter((x) => x.date.startsWith(m)), (x) => x.fee_paid);
    const marketing = meta_ads + google_ads + marketplace_ads + creator_fees;
    const salaries = salaryFor(m);
    const opx = sum(opex.filter((x) => x.month === m), (x) => x.amount);
    const ebitda = net_revenue - cogs - channel_fees - shipping - marketing - salaries - opx;
    const new_customers = customers.filter((c) => c.first_order_date.startsWith(m)).length;
    return { month: m, gross_revenue, discounts, returns: ret, net_revenue, cogs, channel_fees, shipping, marketing, salaries, opex: opx, ebitda,
      orders: new Set(o.map((x) => x.order_id)).size, units: sum(o, (x) => x.qty), new_customers, meta_ads, google_ads, marketplace_ads, creator_fees,
      ebitda_pct: r1((ebitda / net_revenue) * 100), marketing_pct: r1((marketing / net_revenue) * 100) };
  });
}
const pnl = genPnl();

// ---------- write ----------
const C = {
  orders: ['order_id', 'date', 'channel', 'region', 'city', 'warehouse', 'sku', 'qty', 'mrp', 'discount_pct', 'gross_revenue', 'net_revenue', 'payment', 'status', 'customer_id', 'coupon', 'courier', 'zone', 'delivery_days', 'shipping_cost', 'channel_fee'],
  channel_fees: ['channel', 'type', 'commission_pct', 'fixed_fee', 'shipping_fee', 'payment_gateway_pct', 'settlement_days', 'notes'],
  customers: ['customer_id', 'first_order_date', 'city', 'region', 'acquisition_channel', 'orders', 'total_spend', 'last_order_date', 'city_tier', 'acquired_by'],
  returns: ['order_id', 'date', 'sku', 'channel', 'reason', 'refund', 'restockable', 'qty'],
  meta_ads_daily: ['date', 'campaign', 'adset', 'ad', 'creative_type', 'spend', 'impressions', 'clicks', 'add_to_cart', 'purchases', 'revenue'],
  google_ads_daily: ['date', 'campaign', 'type', 'spend', 'impressions', 'clicks', 'conversions', 'revenue'],
  marketplace_ads_daily: ['date', 'platform', 'campaign', 'spend', 'clicks', 'orders', 'revenue'],
  creators: ['handle', 'platform', 'followers', 'engagement_pct', 'avg_views', 'fee_reel', 'fee_story', 'niche', 'city', 'language', 'fake_follower_pct', 'name', 'tier', 'past_brand_roas'],
  creator_posts: ['post_id', 'handle', 'date', 'format', 'views', 'likes', 'comments', 'link_clicks', 'coupon_code', 'orders', 'revenue', 'fee_paid', 'platform', 'barter', 'roas'],
  suppliers: ['supplier_id', 'name', 'city', 'category', 'payment_terms_days', 'rating'],
  raw_materials: ['material_id', 'name', 'unit', 'unit_cost', 'supplier_id', 'moq', 'lead_time_days', 'stock', 'monthly_usage', 'last_po_cost'],
  bom: ['sku', 'material_id', 'qty_per_unit'],
  purchase_orders: ['po_id', 'date', 'supplier_id', 'material_id', 'qty', 'unit_cost', 'total', 'expected_date', 'received_date', 'status', 'payment_due'],
  inventory_snapshot: ['date', 'warehouse', 'sku', 'on_hand', 'in_transit', 'reserved', 'shipped_week', 'received_week'],
  couriers: ['courier', 'zone', 'cost_per_order', 'cod_fee', 'avg_delivery_days', 'rto_pct', 'orders', 'cod_share_pct'],
  employees: ['emp_id', 'name', 'dept', 'role', 'level', 'city', 'join_date', 'ctc_annual', 'basic_monthly', 'hra_monthly', 'special_monthly', 'pf_employer_monthly', 'variable_pct', 'gender', 'state'],
  payroll_2026_10: ['emp_id', 'month', 'gross', 'pf_employee', 'professional_tax', 'tds', 'net_pay', 'pf_employer', 'employer_cost', 'name', 'dept'],
  opex: ['month', 'category', 'vendor', 'amount'],
  pnl_monthly: ['month', 'gross_revenue', 'discounts', 'returns', 'net_revenue', 'cogs', 'channel_fees', 'shipping', 'marketing', 'salaries', 'opex', 'ebitda', 'orders', 'units', 'new_customers', 'meta_ads', 'google_ads', 'marketplace_ads', 'creator_fees', 'ebitda_pct', 'marketing_pct'],
};

// couriers.csv: rates are the card; rto_pct / avg_delivery_days are observed on website orders
const ordersOnly = [...ORDERS_BY_ID.values()].map((ls) => ls[0]);
const courierRows = [];
for (const [name, c] of Object.entries(COURIER)) ZONES.forEach((z, zi) => {
  const os = ordersOnly.filter((o) => o.channel === 'Website' && o.courier === name && o.zone === z);
  const del = os.filter((o) => o.delivery_days !== '');
  courierRows.push({ courier: name, zone: z, cost_per_order: c.cost[zi], cod_fee: c.cod,
    avg_delivery_days: del.length ? r1(sum(del, (o) => +o.delivery_days) / del.length) : c.days[zi],
    rto_pct: os.length ? r1((100 * os.filter((o) => o.status === 'rto').length) / os.length) : 0, orders: os.length,
    cod_share_pct: os.length ? r1((100 * os.filter((o) => o.payment === 'cod').length) / os.length) : 0 });
});

for (const c of customers) c.last_order_date = c.last;
customers.sort((a, b) => (a.customer_id < b.customer_id ? -1 : 1));
for (const p of posts) p.roas = p.fee_paid ? r2(p.revenue / p.fee_paid) : '';

writeCsv('orders.csv', C.orders, orders);
writeCsv('channel_fees.csv', C.channel_fees, FEES);
writeCsv('customers.csv', C.customers, customers);
writeCsv('returns.csv', C.returns, returns);
writeCsv('meta_ads_daily.csv', C.meta_ads_daily, meta);
writeCsv('google_ads_daily.csv', C.google_ads_daily, google);
writeCsv('marketplace_ads_daily.csv', C.marketplace_ads_daily, mktAds);
writeCsv('creators.csv', C.creators, creators);
writeCsv('creator_posts.csv', C.creator_posts, posts);
writeCsv('suppliers.csv', C.suppliers, SUPPLIERS);
writeCsv('raw_materials.csv', C.raw_materials, mats);
writeCsv('bom.csv', C.bom, bom);
writeCsv('purchase_orders.csv', C.purchase_orders, pos);
writeCsv('inventory_snapshot.csv', C.inventory_snapshot, inventory);
writeCsv('couriers.csv', C.couriers, courierRows);
writeCsv('employees.csv', C.employees, employees);
writeCsv('payroll_2026_10.csv', C.payroll_2026_10, payroll);
writeCsv('opex.csv', C.opex, opex);
writeCsv('pnl_monthly.csv', C.pnl_monthly, pnl);

const oct = pnl[2];
const policy = {
  brand: 'Kesar & Co.',
  as_of: '2026-10-31',
  max_marketing_pct_of_net_revenue: 25,
  max_marketing_pct_of_net_revenue_sale_period: 30,
  min_monthly_ebitda: -300000,
  min_ebitda_sale_period: 0,
  max_blended_cac: 450,
  max_creator_fee_without_founder_ok: 50000,
  cash_balance: 11800000,
  cash_floor: 4000000,
  approval_needed_above: 100000,
  payment_terms_note: 'Marketplaces settle 7-30 days after delivery (channel_fees.csv settlement_days); suppliers are paid on payment_terms_days.',
  rules: [
    'Total marketing (Meta + Google + marketplace ads + creator fees) must stay under max_marketing_pct_of_net_revenue of the month\'s net revenue.',
    'Any sale plan must be EBITDA positive over the sale period (budget.json rule).',
    'Blended CAC = marketing / new customers in the month; flag if above max_blended_cac.',
    'Never let cash fall below cash_floor; anything above approval_needed_above needs founder approval in the War Room.',
  ],
};
writeFile('finance_policy.json', JSON.stringify(policy, null, 2) + '\n');

// ---------- README with computed story numbers ----------
function stories() {
  const lines = [];
  const shipped = (o) => o.status !== 'cancelled';
  const rto = (ch, m) => { const os = ordersOnly.filter((o) => o.channel === ch && o.date.startsWith(m) && shipped(o)); return r1((100 * os.filter((o) => o.status === 'rto').length) / os.length); };
  const q = { gross: sum(pnl, (p) => p.gross_revenue), net: sum(pnl, (p) => p.net_revenue), ebitda: sum(pnl, (p) => p.ebitda) };
  lines.push(`- **Net revenue** Aug ${inr(pnl[0].net_revenue)}, Sep ${inr(pnl[1].net_revenue)}, Oct ${inr(pnl[2].net_revenue)} (quarter ${inr(q.net)}; annualised ≈ ₹${(q.net * 4 / 1e7).toFixed(2)} Cr).`);
  lines.push(`- **EBITDA** Aug ${inr(pnl[0].ebitda)} (${pnl[0].ebitda_pct}%), Sep ${inr(pnl[1].ebitda)} (${pnl[1].ebitda_pct}%), Oct ${inr(pnl[2].ebitda)} (${pnl[2].ebitda_pct}%). Marketing was ${pnl[2].marketing_pct}% of net revenue in October.`);
  lines.push(`- **Orders** ${pnl.map((p) => `${p.month} ${p.orders.toLocaleString('en-IN')}`).join(', ')}; units ${pnl.map((p) => p.units.toLocaleString('en-IN')).join(' / ')}.`);
  const byDay = {}; for (const o of orders) if (shipped(o)) byDay[o.date] = (byDay[o.date] || 0) + o.net_revenue;
  const peak = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
  lines.push(`- **Peak day** ${peak[0]} (Dussehra week) with ${inr(peak[1])} net booked revenue vs a 92-day daily average of ${inr(sum(Object.values(byDay)) / 92)}.`);
  const skuRev = SKUS.map((s) => [s, sum(orders.filter((o) => o.sku === s && o.status === 'delivered'), (o) => o.net_revenue)]).sort((a, b) => b[1] - a[1]);
  lines.push(`- **Top SKU by delivered revenue (quarter)**: ${skuRev[0][0]} ${P[skuRev[0][0]].name} ${inr(skuRev[0][1])}; then ${skuRev.slice(1).map(([s, v]) => `${s} ${inr(v)}`).join(', ')}.`);
  const chRev = CHANNELS.map((c) => [c, sum(orders.filter((o) => o.channel === c && o.status === 'delivered' && o.date.startsWith('2026-10')), (o) => o.net_revenue)]);
  lines.push(`- **October delivered revenue by channel**: ${chRev.map(([c, v]) => `${c} ${inr(v)}`).join(', ')}.`);
  lines.push(`- **RTO % (orders shipped, by order date)**: Amazon Sep ${rto('Amazon', '2026-09')}%, Website Sep ${rto('Website', '2026-09')}%, Flipkart Sep ${rto('Flipkart', '2026-09')}%, Website Oct ${rto('Website', '2026-10')}%.`);
  const web = ordersOnly.filter((o) => o.channel === 'Website' && shipped(o));
  const cod = web.filter((o) => o.payment === 'cod'), pre = web.filter((o) => o.payment === 'prepaid');
  lines.push(`- **Website COD**: ${r1((100 * cod.length) / web.length)}% of shipped website orders are COD; COD RTO ${r1((100 * cod.filter((o) => o.status === 'rto').length) / cod.length)}% vs prepaid ${r1((100 * pre.filter((o) => o.status === 'rto').length) / pre.length)}%.`);
  const tierRto = [1, 2, 3].map((t) => { const os = cod.filter((o) => CITY[o.city].tier === t); return `tier ${t} ${r1((100 * os.filter((o) => o.status === 'rto').length) / os.length)}%`; });
  lines.push(`- **Website COD RTO by city tier**: ${tierRto.join(', ')}.`);
  const cr = Object.keys(COURIER).map((n) => { const os = web.filter((o) => o.courier === n); return [n, r1((100 * os.filter((o) => o.status === 'rto').length) / os.length)]; }).sort((a, b) => b[1] - a[1]);
  lines.push(`- **Courier RTO (website, all zones)**: worst ${cr[0][0]} ${cr[0][1]}%, best ${cr.at(-1)[0]} ${cr.at(-1)[1]}%.`);
  const rr = {}; for (const r of returns) rr[r.reason] = (rr[r.reason] || 0) + 1;
  const topR = Object.entries(rr).sort((a, b) => b[1] - a[1]);
  lines.push(`- **Returns**: ${returns.length} customer returns, refunds ${inr(sum(returns, (r) => r.refund))}; top reason "${topR[0][0]}" (${topR[0][1]}), then "${topR[1][0]}" (${topR[1][1]}).`);
  const paid = posts.filter((p) => p.fee_paid > 0);
  const best = [...paid].sort((a, b) => b.roas - a.roas)[0], worst = paid.filter((p) => p.fee_paid >= 25000).sort((a, b) => a.roas - b.roas)[0];
  const H = Object.fromEntries(creators.map((c) => [c.handle, c]));
  lines.push(`- **Best creator post ROAS**: ${H[best.handle].name} (${best.handle}) ${best.post_id} on ${best.date}: ${best.orders} orders, ${inr(best.revenue)} on ${inr(best.fee_paid)} fee = ${best.roas}x (coupon ${best.coupon_code}).`);
  lines.push(`- **Worst creator post ROAS (fee >= ₹25,000)**: ${H[worst.handle].name} (${worst.handle}) ${worst.post_id} on ${worst.date}: ${worst.orders} orders, ${inr(worst.revenue)} on ${inr(worst.fee_paid)} = ${worst.roas}x; fake followers ${H[worst.handle].fake_follower_pct}%.`);
  const cf = MONTHS.map((m) => inr(sum(posts.filter((p) => p.date.startsWith(m)), (p) => p.fee_paid)));
  lines.push(`- **Creator fees**: Aug ${cf[0]}, Sep ${cf[1]}, Oct ${cf[2]}; ${posts.length} posts, ${posts.filter((p) => p.barter === 'yes').length} barter (product only).`);
  const metaRoas = metaV1.map((v) => `${v.campaign} ${v.roas}x`).join(', ');
  lines.push(`- **Meta, last 30 days (2026-10-02..10-31)**: spend ${inr(sum(metaV1, (v) => +v.spend))}, revenue ${inr(sum(metaV1, (v) => +v.revenue))}; ${metaRoas}.`);
  const ct = {}; for (const r of meta.filter((x) => x.date >= '2026-10-02')) { ct[r.creative_type] ??= [0, 0]; ct[r.creative_type][0] += r.spend; ct[r.creative_type][1] += r.revenue; }
  lines.push(`- **Meta creative types (last 30 days ROAS)**: ${Object.entries(ct).sort((a, b) => b[1][1] / b[1][0] - a[1][1] / a[1][0]).map(([k, [s, r]]) => `${k} ${r2(r / s)}x`).join(', ')}.`);
  const g = {}; for (const r of google.filter((x) => x.date.startsWith('2026-10'))) { g[r.campaign] ??= [0, 0]; g[r.campaign][0] += r.spend; g[r.campaign][1] += r.revenue; }
  lines.push(`- **Google October**: spend ${inr(sum(Object.values(g), (x) => x[0]))}; ${Object.entries(g).map(([k, [s, r]]) => `${k} ${r2(r / s)}x`).join(', ')}.`);
  const ma = {}; for (const r of mktAds.filter((x) => x.date.startsWith('2026-10'))) { ma[r.platform] ??= [0, 0]; ma[r.platform][0] += r.spend; ma[r.platform][1] += r.revenue; }
  lines.push(`- **Marketplace ads October**: ${Object.entries(ma).map(([k, [s, r]]) => `${k} ${inr(s)} spend, ${r2(r / s)}x ROAS`).join('; ')}.`);
  const feePct = CHANNELS.map((c) => { const os = orders.filter((o) => o.channel === c && o.status === 'delivered'); return [c, r1((100 * sum(os, (o) => o.channel_fee + o.shipping_cost)) / sum(os, (o) => o.net_revenue))]; }).sort((a, b) => b[1] - a[1]);
  lines.push(`- **Fees + shipping as % of delivered revenue**: ${feePct.map(([c, v]) => `${c} ${v}%`).join(', ')}.`);
  const rep = customers.filter((c) => c.orders >= 2).length;
  lines.push(`- **Customers**: ${customers.length.toLocaleString('en-IN')} unique; ${r1((100 * rep) / customers.length)}% ordered 2+ times in the quarter; website repeat ${r1((100 * customers.filter((c) => c.acquisition_channel === 'Website' && c.orders >= 2).length) / customers.filter((c) => c.acquisition_channel === 'Website').length)}%. October blended CAC ${inr(oct.marketing / oct.new_customers)} (marketing / new customers).`);
  const pr = payroll;
  lines.push(`- **October payroll**: ${pr.length} people paid, gross ${inr(sum(pr, (p) => p.gross))}, net pay ${inr(sum(pr, (p) => p.net_pay))}, employee PF ${inr(sum(pr, (p) => p.pf_employee))}, TDS ${inr(sum(pr, (p) => p.tds))}, PT ${inr(sum(pr, (p) => p.professional_tax))}; employer cost (gross + employer PF) ${inr(sum(pr, (p) => p.employer_cost))} = P&L salaries. Headcount ${employees.length}; ${employees.filter((e) => e.join_date > '2026-10-01').length} joining after Oct.`);
  const topTds = [...pr].sort((a, b) => b.tds - a.tds)[0];
  lines.push(`- **Highest TDS**: ${topTds.name} ${inr(topTds.tds)}/month. Founders draw ₹9.6 L CTC each, so under the new regime their TDS is ₹0 (87A rebate to ₹12 L taxable).`);
  const del = pos.filter((p) => p.status === 'delayed' || p.status === 'received_late');
  const sf = pos.filter((p) => p.material_id === 'RM07');
  lines.push(`- **Procurement**: ${pos.length} POs worth ${inr(sum(pos, (p) => p.total))}; ${pos.filter((p) => p.status === 'delayed').length} delayed now, ${pos.filter((p) => p.status === 'received_late').length} arrived late. Saffron (RM07) price moved from ₹${sf[0].unit_cost}/g to ₹${sf.at(-1).unit_cost}/g; latest saffron PO ${sf.filter((p) => p.date >= '2026-10-01').map((p) => `${p.po_id} expected ${p.expected_date} (${p.status})`).join(', ')}.`);
  const inv = inventory.filter((r) => r.date === '2026-10-31');
  const cover = inv.map((r) => { const daily = sum(orders.filter((o) => o.warehouse === r.warehouse && o.sku === r.sku && o.date >= '2026-10-03' && o.status !== 'cancelled'), (o) => o.qty) / 29; return [r.warehouse, r.sku, r.on_hand, r1(r.on_hand / Math.max(daily, 0.1))]; }).sort((a, b) => a[3] - b[3]);
  lines.push(`- **Stock cover on 2026-10-31 (days, at last-4-weeks rate)**: lowest ${cover.slice(0, 3).map(([w, s, oh, d]) => `${w} ${s} ${oh} units = ${d} days`).join('; ')}.`);
  return lines.join('\n');
}

const README = `# Kesar & Co. demo data (v2)

Everything here is **made-up but realistic** demo data for Kesar & Co., an Indian skincare D2C brand (₹3-4 Cr a year run rate,
5 SKUs, 3 warehouses, 7 sales channels, 25 people). History window **2026-08-01 to 2026-10-31**. Money is INR rupees (integers
unless the column says otherwise). Contract: \`contracts/data-catalog.md\`. Background on how Indian D2C works: \`docs/d2c-primer.md\`.

- Frozen v1 files (do not edit): products, past_sales, regions, warehouses, channels, meta_campaigns, influencers, budget.json.
- Generated v2 files: rebuild with \`npm run data\` (seeded, byte-for-byte deterministic). Verify with \`npm run data:check\`.
- Never edit a generated file by hand; change \`data/gen/generate.mjs\` and regenerate.

## Story numbers (computed by the generator, exact)

${stories()}

## How the files tie together

- \`orders.csv\` has **one row per order line** (order_id repeats for multi-SKU orders). \`status\` is per line: an order is
  cancelled or RTO as a whole; a customer return marks one line \`returned\`. Order-level shipping sits on the order's **first line**.
- \`orders.channel_fee\` = commission_pct x net_revenue + fixed_fee + payment_gateway_pct x net_revenue (prepaid only) for delivered
  lines; RTO/returned lines keep only fixed_fee + gateway fee; cancelled = 0 (rates from \`channel_fees.csv\`).
- \`orders.shipping_cost\` (first line only): Website = courier rate for the zone (\`couriers.csv\`) + COD fee if COD and not RTO,
  plus the same rate again if the order was RTO or had a return. Marketplaces = \`channel_fees.shipping_fee\`, doubled on RTO/return.
- \`returns.csv\` has one row per returned line; \`refund\` = that line's net_revenue.
- \`pnl_monthly.csv\` (by order month): gross_revenue = sum of gross on non-cancelled lines; discounts = gross - net; returns = net of
  RTO + returned lines; net_revenue = gross - discounts - returns; cogs = products.cogs x qty for delivered lines + returned lines that
  are not restockable; channel_fees and shipping = sums of the order columns; marketing = Meta + Google + marketplace ads spend (by
  date) + creator fee_paid (by post date); salaries = basic + HRA + special + employer PF for employees whose join_date is on or before
  the 1st of the month (variable pay is paid annually in April, not accrued); opex = opex.csv. ebitda = net_revenue - everything else.
- \`creator_posts.orders/revenue\` = non-cancelled website orders that used that post's \`coupon_code\` (net revenue, booked).
  Coupon codes are unique per post and attribution runs 7 days from the post date.
- \`meta_ads_daily.csv\` summed over 2026-10-02..2026-10-31 by campaign equals \`meta_campaigns.csv\` spend and revenue exactly.
  Meta revenue is Meta-attributed (7-day click, 1-day view) and overlaps with website, Google and creator revenue - do not add them up.
- \`inventory_snapshot.csv\` is weekly (Saturdays). on_hand(prev week) = on_hand + shipped_week - received_week. The 2026-10-31 rows equal
  the stock columns in \`products.csv\` exactly. in_transit = finished goods that land in the following week.
- \`bom.csv\`: sum of qty_per_unit x the material's base cost equals products.cogs (the JW0x line is the contract manufacturer's
  conversion charge). raw_materials.unit_cost is the standard cost; last_po_cost is the latest PO price (saffron and vitamin C have crept up).
- \`payroll_2026_10.csv\`: gross = basic + HRA + special; pf_employee = 12% of min(basic, 15000); professional tax: Maharashtra ₹200
  (women earning up to ₹25,000 exempt), Karnataka ₹200 if gross >= ₹25,000, Delhi none; TDS = new regime (₹75,000 standard deduction,
  slabs 0/5/10/15/20/25/30 at 4/8/12/16/20/24 L, 87A rebate to ₹12 L taxable with marginal relief, 4% cess) on gross x 12, divided by 12.
  net_pay = gross - pf_employee - professional_tax - tds.
- \`customers.csv\`: customer_id is per channel (marketplaces do not share buyer identity, so the same person on Amazon and the website is two
  ids). orders = all orders incl. cancelled; total_spend = net revenue of delivered lines.

## Data dictionary

${Object.entries({
  'orders.csv': 'Order lines. coupon = creator coupon (website only); courier; zone A local, B regional, C metro-metro, D rest of India, E Kerala/J&K; delivery_days for delivered/returned lines; shipping_cost; channel_fee.',
  'channel_fees.csv': 'Fee card per sales channel: commission %, fixed fee per line, shipping fee per order (marketplaces), payment gateway % (website prepaid), settlement days, notes.',
  'customers.csv': 'One row per customer id: first order date, city, region, acquisition channel, orders, total_spend, last_order_date, city_tier (1 metro/tier-1, 2, 3), acquired_by (creator coupon of first order, if any).',
  'returns.csv': 'Customer returns after delivery: return date, reason, refund, restockable (yes/no), qty. RTO is not here; it is orders.status = rto.',
  'meta_ads_daily.csv': 'Meta (Facebook/Instagram) ads per day per ad: spend, impressions, clicks, add_to_cart, purchases, revenue (Meta-attributed).',
  'google_ads_daily.csv': 'Google Ads per day per campaign. type: search, shopping, performance_max, video (YouTube).',
  'marketplace_ads_daily.csv': 'Amazon Sponsored Products/Brands, Flipkart PLA, Nykaa, Blinkit and Zepto ads per day per campaign (platform-attributed).',
  'creators.csv': 'Creator roster (8 from influencers.csv + 30 more). fee_reel/fee_story in ₹ per deliverable, fake_follower_pct from audit, tier nano/micro/mid/macro/mega, past_brand_roas only for v1 creators.',
  'creator_posts.csv': 'Every creator post Aug-Oct: views, likes, comments, link clicks, coupon_code, attributed orders/revenue, fee_paid (0 = barter), roas = revenue / fee_paid.',
  'suppliers.csv': 'Suppliers: contract manufacturer, chemicals, botanicals, saffron, packaging. payment_terms_days (0 = advance), rating out of 5.',
  'raw_materials.csv': 'Materials with unit, standard unit_cost, last_po_cost, supplier, MOQ, lead time, stock on hand (2026-10-31), monthly_usage at average demand.',
  'bom.csv': 'Bill of materials: qty of each material per finished unit.',
  'purchase_orders.csv': 'POs Aug-early Nov. status: received, received_late, in_transit, delayed (past expected date, not received), open. payment_due = received (or expected) + supplier terms.',
  'inventory_snapshot.csv': 'Weekly finished-goods stock per warehouse and SKU with shipped_week and received_week.',
  'couriers.csv': 'Rate card per courier and zone for website orders (via Shiprocket) plus observed rto_pct, avg_delivery_days, orders and cod_share_pct over the quarter.',
  'employees.csv': '25 people. ctc_annual includes variable pay; monthly fixed = basic + HRA + special + employer PF. gender is used only for Maharashtra professional tax.',
  'payroll_2026_10.csv': 'October 2026 payroll for everyone who had joined by 2026-10-01.',
  'opex.csv': 'Monthly operating expenses by category and vendor (rent, 3PL warehousing, software, creative, professional fees, etc.).',
  'pnl_monthly.csv': 'Monthly P&L computed from the files above, plus orders, units, new_customers, the marketing split, ebitda_pct and marketing_pct.',
  'finance_policy.json': 'Rules Finance enforces: marketing % cap, EBITDA floors, max CAC, cash floor and approval limits.',
}).map(([f, d]) => `- **${f}**: ${d}`).join('\n')}
`;
writeFile('README.md', README);

if (!process.argv[2]) {
  console.log(`orders ${orders.length} lines, ${ORDERS_BY_ID.size} orders, customers ${customers.length}, posts ${posts.length}, POs ${pos.length}`);
  for (const p of pnl) console.log(p.month, 'net', p.net_revenue, 'mkt', p.marketing, 'sal', p.salaries, 'opex', p.opex, 'ebitda', p.ebitda, p.ebitda_pct + '%');
}
