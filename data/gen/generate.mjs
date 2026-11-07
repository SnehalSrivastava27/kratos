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

// ---------- calendar / seasonality ----------
const DUSSEHRA = { '2026-10-19': 1.35, '2026-10-20': 2.0, '2026-10-21': 2.35, '2026-10-22': 2.45, '2026-10-23': 2.1, '2026-10-24': 1.7, '2026-10-25': 1.25 };
const WEEKDAY = [1.12, 1.08, 1.0, 0.97, 0.95, 0.92, 0.96]; // Sun..Sat
const isBBD = (d) => d >= '2026-10-03' && d <= '2026-10-09'; // Flipkart Big Billion Days + Amazon Great Indian Festival opening week
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
// regional festivals pull orders toward their states (city weight multiplier)
const CITY_FEST = [
  ['2026-08-20', '2026-08-26', ['Kerala'], 2.2], // Onam (Thiruvonam 26 Aug)
  ['2026-09-12', '2026-09-16', ['Maharashtra'], 1.4], // Ganesh Chaturthi (14 Sep)
  ['2026-10-15', '2026-10-20', ['West Bengal', 'Assam', 'Odisha'], 2.0], // Durga Puja (17-20 Oct)
];
const cityBoost = (d, c) => { let m = 1; for (const [a, b, st, x] of CITY_FEST) if (d >= a && d <= b && st.includes(c.state)) m *= x; return m; };

// ---------- geography ----------
// [city, state, region, tier, weight, base pincode]  tier: 1 metro/tier-1, 2, 3. East ships from the Delhi warehouse.
const CITIES = [
  ['Delhi', 'Delhi', 'North', 1, 30, 110001], ['Gurugram', 'Haryana', 'North', 1, 12, 122001], ['Noida', 'Uttar Pradesh', 'North', 1, 10, 201301],
  ['Lucknow', 'Uttar Pradesh', 'North', 2, 9, 226001], ['Jaipur', 'Rajasthan', 'North', 2, 9, 302001], ['Chandigarh', 'Chandigarh', 'North', 2, 7, 160017],
  ['Kanpur', 'Uttar Pradesh', 'North', 2, 5, 208001], ['Ludhiana', 'Punjab', 'North', 2, 5, 141001], ['Dehradun', 'Uttarakhand', 'North', 3, 4, 248001],
  ['Meerut', 'Uttar Pradesh', 'North', 3, 4, 250001], ['Jammu', 'Jammu and Kashmir', 'North', 3, 3, 180001], ['Amritsar', 'Punjab', 'North', 3, 3, 143001],
  ['Varanasi', 'Uttar Pradesh', 'North', 3, 3, 221001], ['Agra', 'Uttar Pradesh', 'North', 3, 3, 282001], ['Gorakhpur', 'Uttar Pradesh', 'North', 3, 2, 273001],
  ['Jodhpur', 'Rajasthan', 'North', 3, 2, 342001],
  ['Mumbai', 'Maharashtra', 'West', 1, 32, 400001], ['Thane', 'Maharashtra', 'West', 1, 9, 400601], ['Pune', 'Maharashtra', 'West', 1, 18, 411001],
  ['Ahmedabad', 'Gujarat', 'West', 1, 11, 380001], ['Surat', 'Gujarat', 'West', 2, 7, 395003], ['Vadodara', 'Gujarat', 'West', 2, 5, 390001],
  ['Nagpur', 'Maharashtra', 'West', 2, 5, 440001], ['Indore', 'Madhya Pradesh', 'West', 2, 6, 452001], ['Bhopal', 'Madhya Pradesh', 'West', 2, 4, 462001],
  ['Nashik', 'Maharashtra', 'West', 3, 4, 422001], ['Rajkot', 'Gujarat', 'West', 3, 3, 360001], ['Aurangabad', 'Maharashtra', 'West', 3, 2, 431001],
  ['Panaji', 'Goa', 'West', 3, 2, 403001], ['Raipur', 'Chhattisgarh', 'West', 3, 2, 492001],
  ['Bangalore', 'Karnataka', 'South', 1, 34, 560001], ['Hyderabad', 'Telangana', 'South', 1, 24, 500001], ['Chennai', 'Tamil Nadu', 'South', 1, 20, 600001],
  ['Kochi', 'Kerala', 'South', 2, 6, 682001], ['Coimbatore', 'Tamil Nadu', 'South', 2, 5, 641001], ['Visakhapatnam', 'Andhra Pradesh', 'South', 2, 4, 530001],
  ['Mysuru', 'Karnataka', 'South', 3, 3, 570001], ['Madurai', 'Tamil Nadu', 'South', 3, 3, 625001], ['Thiruvananthapuram', 'Kerala', 'South', 3, 3, 695001],
  ['Vijayawada', 'Andhra Pradesh', 'South', 3, 3, 520001], ['Mangaluru', 'Karnataka', 'South', 3, 2, 575001], ['Hubballi', 'Karnataka', 'South', 3, 2, 580020],
  ['Tiruchirappalli', 'Tamil Nadu', 'South', 3, 2, 620001], ['Kozhikode', 'Kerala', 'South', 3, 2, 673001], ['Warangal', 'Telangana', 'South', 3, 2, 506002],
  ['Kolkata', 'West Bengal', 'East', 1, 22, 700001], ['Bhubaneswar', 'Odisha', 'East', 2, 5, 751001], ['Patna', 'Bihar', 'East', 2, 6, 800001],
  ['Ranchi', 'Jharkhand', 'East', 2, 4, 834001], ['Guwahati', 'Assam', 'East', 2, 5, 781001], ['Siliguri', 'West Bengal', 'East', 3, 3, 734001],
  ['Durgapur', 'West Bengal', 'East', 3, 2, 713201], ['Jamshedpur', 'Jharkhand', 'East', 3, 2, 831001], ['Cuttack', 'Odisha', 'East', 3, 2, 753001],
  ['Gaya', 'Bihar', 'East', 3, 2, 823001],
].map(([city, state, region, tier, w, pin]) => ({ city, state, region, tier, w, pin }));
// Amazon Global Selling (exports): buyer cities abroad
const INTL = [['New York', 'United States', 40], ['London', 'United Kingdom', 25], ['Toronto', 'Canada', 15], ['Singapore', 'Singapore', 12], ['Sydney', 'Australia', 8]]
  .map(([city, state, w]) => ({ city, state, region: 'International', tier: '', w, pin: '' }));
const CITY = Object.fromEntries([...CITIES, ...INTL].map((c) => [c.city, c]));
const METRO = new Set(['Delhi', 'Gurugram', 'Noida', 'Mumbai', 'Thane', 'Pune', 'Ahmedabad', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata']);
const ZONE_E = new Set(['Jammu', 'Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Guwahati']); // J&K, Kerala, North-East: special zone
const WH_CITIES = { Delhi: ['Delhi', 'Gurugram', 'Noida'], Mumbai: ['Mumbai', 'Thane'], Bangalore: ['Bangalore'] };
const WH_REGION = { Delhi: 'North', Mumbai: 'West', Bangalore: 'South' };
const WH_STATE = { Delhi: 'Delhi', Mumbai: 'Maharashtra', Bangalore: 'Karnataka' }; // one GSTIN per warehouse state
const GST_CODE = { 'Jammu and Kashmir': '01', Punjab: '03', Chandigarh: '04', Uttarakhand: '05', Haryana: '06', Delhi: '07', Rajasthan: '08', 'Uttar Pradesh': '09',
  Bihar: '10', Assam: '18', 'West Bengal': '19', Jharkhand: '20', Odisha: '21', Chhattisgarh: '22', 'Madhya Pradesh': '23', Gujarat: '24', Maharashtra: '27',
  Karnataka: '29', Goa: '30', Kerala: '32', 'Tamil Nadu': '33', Telangana: '36', 'Andhra Pradesh': '37' };
function zoneOf(city, wh) {
  if (WH_CITIES[wh].includes(city)) return 'A';
  if (ZONE_E.has(city)) return 'E';
  if (CITY[city].region === WH_REGION[wh]) return 'B';
  if (METRO.has(city)) return 'C';
  return 'D';
}
const REGION_W = { North: 0.36, West: 0.32, South: 0.24, East: 0.08 };
const HOME = { North: 'Delhi', West: 'Mumbai', South: 'Bangalore', East: 'Delhi', International: 'Mumbai' };

// ---------- channels & fees ----------
const CHANNELS = ['Website', 'Amazon', 'Flipkart', 'Nykaa', 'Myntra', 'Purplle', 'Meesho', 'Tata CLiQ', 'JioMart', 'AJIO',
  'Blinkit', 'Zepto', 'Instamart', 'BB Now', 'Flipkart Minutes', 'Health & Glow', 'Apollo Pharmacy', 'Amazon Global'];
const CH_SHARE = { Website: 0.45, Amazon: 0.16, Flipkart: 0.07, Nykaa: 0.1, Myntra: 0.025, Purplle: 0.03, Meesho: 0.03, 'Tata CLiQ': 0.012, JioMart: 0.01, AJIO: 0.008,
  Blinkit: 0.055, Zepto: 0.04, Instamart: 0.03, 'BB Now': 0.012, 'Flipkart Minutes': 0.008, 'Health & Glow': 0.015, 'Apollo Pharmacy': 0.01, 'Amazon Global': 0.005 };
const BBD_BOOST = { Amazon: 1.8, Flipkart: 2.0, Myntra: 1.5, Meesho: 1.6, AJIO: 1.4, 'Tata CLiQ': 1.3, 'Flipkart Minutes': 1.5 };
const FEES = [
  // channel, group, type, commission_pct, fixed_fee, shipping_fee, payment_gateway_pct, settlement_days, notes, tcs_pct, tds_pct
  ['Website', 'D2C', 'D2C (Shopify + Razorpay, Cashfree backup)', 0, 0, 0, 2, 2, 'Shipping billed by courier via Shiprocket, see couriers.csv; gateway 2% on prepaid only; Shiprocket remits COD 8 days after the week', 0, 0],
  ['Amazon', 'Marketplace', 'Marketplace (Easy Ship)', 6, 25, 65, 0, 7, 'Referral fee 0% under Rs 1000 since Mar 2026 and 8% above, blended 6%; closing fee Rs 25; weight handling Rs 65', 0.5, 0.1],
  ['Flipkart', 'Marketplace', 'Marketplace', 9, 20, 70, 0, 10, 'Commission 9% beauty, fixed fee Rs 20, shipping Rs 70 per shipment', 0.5, 0.1],
  ['Nykaa', 'Beauty marketplace', 'Beauty marketplace', 28, 0, 55, 0, 30, 'Nykaa takes 28% on selling price; long 30 day settlement', 0.5, 0.1],
  ['Myntra', 'Marketplace', 'Marketplace (beauty)', 22, 30, 60, 0, 15, 'Commission 22% plus Rs 30 fixed fee', 0.5, 0.1],
  ['Purplle', 'Beauty marketplace', 'Beauty marketplace', 25, 0, 50, 0, 30, 'Purplle margin 25% on selling price; Rs 50 forward shipping; 30 day settlement', 0.5, 0.1],
  ['Meesho', 'Marketplace', 'Marketplace (value, tier 2-3)', 0, 0, 75, 0, 7, '0% commission; seller pays forward shipping Rs 75 via Valmo; paid 7 days after delivery; heavy COD', 0.5, 0.1],
  ['Tata CLiQ', 'Beauty marketplace', 'Marketplace (Tata CLiQ Palette, premium beauty)', 20, 25, 60, 0, 15, 'Commission 20% plus Rs 25 fixed fee', 0.5, 0.1],
  ['JioMart', 'Marketplace', 'Marketplace', 12, 15, 60, 0, 15, 'Commission 12%, fixed fee Rs 15, shipping Rs 60', 0.5, 0.1],
  ['AJIO', 'Marketplace', 'Marketplace (AJIO beauty)', 25, 30, 60, 0, 30, 'Commission 25% plus Rs 30; 30 day settlement', 0.5, 0.1],
  ['Blinkit', 'Quick commerce', 'Quick commerce', 22, 10, 15, 0, 30, '22% margin plus Rs 10 per order; Rs 15 dark-store inbound freight per order', 0.5, 0.1],
  ['Zepto', 'Quick commerce', 'Quick commerce', 24, 10, 15, 0, 30, '24% margin plus Rs 10 per order; Rs 15 dark-store inbound freight per order', 0.5, 0.1],
  ['Instamart', 'Quick commerce', 'Quick commerce (Swiggy Instamart)', 23, 10, 15, 0, 30, '23% margin plus Rs 10 per order; Rs 15 dark-store inbound freight per order', 0.5, 0.1],
  ['BB Now', 'Quick commerce', 'Quick commerce (BigBasket BB Now)', 20, 10, 15, 0, 45, '20% margin plus Rs 10 per order; buys outright, pays in 45 days', 0.5, 0.1],
  ['Flipkart Minutes', 'Quick commerce', 'Quick commerce (Flipkart Minutes)', 18, 10, 15, 0, 15, 'Launch rate 18% plus Rs 10 per order; 15 day settlement', 0.5, 0.1],
  ['Health & Glow', 'Offline retail', 'Offline modern trade (beauty chain)', 32, 0, 12, 0, 60, 'Retailer 25% + distributor 7% margin on selling price; Rs 12 freight per bill; 60 day credit', 0, 0],
  ['Apollo Pharmacy', 'Offline retail', 'Offline modern trade (pharmacy chain)', 30, 0, 12, 0, 45, 'Retailer 23% + distributor 7% margin; Rs 12 freight per bill; 45 day credit', 0, 0],
  ['Amazon Global', 'Export', 'Export (Amazon Global Selling)', 15, 0, 450, 0, 14, 'Referral 15%; Rs 450 international shipping per order (Amazon Global Logistics); zero-rated GST under LUT', 0, 0],
].map(([channel, channel_group, type, commission_pct, fixed_fee, shipping_fee, payment_gateway_pct, settlement_days, notes, tcs_pct, tds_pct]) =>
  ({ channel, type, commission_pct, fixed_fee, shipping_fee, payment_gateway_pct, settlement_days, notes, channel_group, tcs_pct, tds_pct, gst_on_fees_pct: 18 }));
const FEE = Object.fromEntries(FEES.map((f) => [f.channel, f]));
const QC = new Set(['Blinkit', 'Zepto', 'Instamart', 'BB Now', 'Flipkart Minutes']);
const OFFLINE = new Set(['Health & Glow', 'Apollo Pharmacy']);
const EXPORT = 'Amazon Global';
// cities a channel can sell in (quick commerce dark stores, offline stores); others sell everywhere
const CH_CITIES = {
  Blinkit: [...METRO, 'Jaipur', 'Lucknow', 'Chandigarh', 'Indore'], Zepto: [...METRO, 'Jaipur', 'Lucknow'], Instamart: [...METRO, 'Kochi', 'Coimbatore'],
  'BB Now': [...METRO], 'Flipkart Minutes': ['Delhi', 'Gurugram', 'Noida', 'Mumbai', 'Thane', 'Pune', 'Bangalore', 'Hyderabad'],
  'Health & Glow': ['Bangalore', 'Mysuru', 'Mangaluru', 'Chennai', 'Hyderabad', 'Pune', 'Mumbai', 'Kolkata', 'Kochi'],
  'Apollo Pharmacy': ['Hyderabad', 'Chennai', 'Bangalore', 'Kolkata', 'Delhi', 'Visakhapatnam', 'Vijayawada', 'Madurai'],
};
const CH_PREFIX = { Website: 'WEB', Amazon: 'AMZ', Flipkart: 'FK', Nykaa: 'NYK', Myntra: 'MYN', Purplle: 'PUR', Meesho: 'MSH', 'Tata CLiQ': 'TCL', JioMart: 'JIO', AJIO: 'AJO',
  Blinkit: 'BLK', Zepto: 'ZEP', Instamart: 'IMT', 'BB Now': 'BBN', 'Flipkart Minutes': 'FKM', 'Health & Glow': 'HNG', 'Apollo Pharmacy': 'APL', 'Amazon Global': 'AMG' };
const COD_P = { Website: 0.42, Amazon: 0.34, Flipkart: 0.5, Myntra: 0.3, Nykaa: 0.22, Purplle: 0.35, Meesho: 0.62, 'Tata CLiQ': 0.2, JioMart: 0.45, AJIO: 0.35,
  Blinkit: 0.04, Zepto: 0.04, Instamart: 0.05, 'BB Now': 0.1, 'Flipkart Minutes': 0.05, 'Health & Glow': 0, 'Apollo Pharmacy': 0, 'Amazon Global': 0 };
const RTO_COD = { Website: 0.2, Amazon: 0.12, Flipkart: 0.17, Myntra: 0.14, Nykaa: 0.11, Purplle: 0.13, Meesho: 0.22, 'Tata CLiQ': 0.1, JioMart: 0.18, AJIO: 0.15,
  Blinkit: 0.03, Zepto: 0.03, Instamart: 0.03, 'BB Now': 0.03, 'Flipkart Minutes': 0.03, 'Health & Glow': 0, 'Apollo Pharmacy': 0, 'Amazon Global': 0 };
const TIER_RTO = { 1: 0.8, 2: 1.25, 3: 1.6 };
const RETURN_P = { Website: 0.022, Amazon: 0.045, Flipkart: 0.055, Myntra: 0.065, Nykaa: 0.03, Purplle: 0.035, Meesho: 0.08, 'Tata CLiQ': 0.04, JioMart: 0.05, AJIO: 0.06,
  Blinkit: 0.012, Zepto: 0.015, Instamart: 0.012, 'BB Now': 0.012, 'Flipkart Minutes': 0.015, 'Health & Glow': 0.01, 'Apollo Pharmacy': 0.008, 'Amazon Global': 0.03 };
const REPEAT_P = { Website: 0.3, Amazon: 0.18, Flipkart: 0.14, Myntra: 0.12, Nykaa: 0.24, Purplle: 0.2, Meesho: 0.1, 'Tata CLiQ': 0.12, JioMart: 0.1, AJIO: 0.1,
  Blinkit: 0.3, Zepto: 0.26, Instamart: 0.28, 'BB Now': 0.25, 'Flipkart Minutes': 0.2, 'Health & Glow': 0, 'Apollo Pharmacy': 0, 'Amazon Global': 0.1 };
// prepaid instrument mix (UPI dominates; BNPL = Simpl / LazyPay on the website, platform pay-later on marketplaces)
const PAY_MIX = {
  web: [['UPI', 'Card', 'Netbanking', 'Simpl', 'LazyPay', 'Wallet'], [62, 16, 4, 8, 5, 5]],
  mkt: [['UPI', 'Card', 'Netbanking', 'BNPL', 'Wallet'], [64, 22, 4, 6, 4]],
  qc: [['UPI', 'Card', 'Wallet'], [80, 14, 6]],
  offline: [['UPI', 'Card', 'Cash'], [58, 27, 15]],
  export: [['Card'], [1]],
};

// ---------- couriers ----------
// website orders ship through Shiprocket, which allocates one of these couriers
const COURIER = {
  Delhivery: { cost: [32, 38, 46, 52, 64], cod: 35, days: [1.6, 2.4, 3.0, 4.4, 6.2], rto: 1.0, w: 30 },
  Xpressbees: { cost: [29, 35, 42, 48, 60], cod: 32, days: [1.8, 2.7, 3.3, 4.8, 6.6], rto: 1.15, w: 19 },
  'Blue Dart': { cost: [45, 55, 68, 78, 92], cod: 45, days: [1.2, 1.9, 2.3, 3.4, 4.9], rto: 0.72, w: 10 },
  Shadowfax: { cost: [27, 33, 40, 46, 58], cod: 30, days: [1.4, 2.5, 3.4, 5.1, 7.0], rto: 1.3, w: 10 },
  Ekart: { cost: [30, 36, 44, 50, 62], cod: 33, days: [1.7, 2.6, 3.2, 4.6, 6.4], rto: 1.05, w: 10 },
  'Ecom Express': { cost: [28, 34, 41, 47, 59], cod: 31, days: [1.8, 2.8, 3.4, 4.7, 6.5], rto: 1.1, w: 10 },
  DTDC: { cost: [26, 32, 39, 44, 55], cod: 30, days: [2.0, 3.0, 3.6, 5.0, 6.9], rto: 1.2, w: 6 },
  'India Post': { cost: [22, 27, 33, 38, 46], cod: 25, days: [2.6, 3.6, 4.4, 6.0, 8.2], rto: 1.4, w: 4 },
};
const ZONES = ['A', 'B', 'C', 'D', 'E'];
const MKT_COURIER = { Amazon: 'Amazon Shipping', Flipkart: 'Ekart', Myntra: 'Ekart', Nykaa: 'Delhivery', Purplle: 'Delhivery', Meesho: 'Valmo', 'Tata CLiQ': 'Blue Dart',
  JioMart: 'Delhivery', AJIO: 'Ecom Express', Blinkit: 'Blinkit fleet', Zepto: 'Zepto fleet', Instamart: 'Instamart fleet', 'BB Now': 'BB Now fleet',
  'Flipkart Minutes': 'Flipkart Minutes fleet', 'Health & Glow': 'Distributor', 'Apollo Pharmacy': 'Distributor', 'Amazon Global': 'Amazon Global Logistics' };
// ---------- creators ----------
function creatorsAndPosts() {
  const R = rng('creators');
  const LANG = { North: ['Hindi', 'Hinglish', 'English'], West: ['Hinglish', 'Marathi', 'Gujarati', 'English'], South: ['English', 'Tamil', 'Telugu', 'Kannada', 'Malayalam'], East: ['Bengali', 'Hindi', 'English', 'Odia'] };
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

  // 12 regional-language creators (ShareChat, Moj, Josh, Instagram, YouTube): cheap, high engagement, mostly tier 2-3 audiences
  const RG = rng('creators-regional');
  const REGIONAL = [
    ['Sayani Bose', 'Bengali', 'Kolkata', 'Instagram', 'micro'], ['Ankita Das', 'Bengali', 'Siliguri', 'ShareChat', 'micro'], ['Lakshmi Menon', 'Malayalam', 'Kochi', 'Instagram', 'micro'],
    ['Anjali Nair', 'Malayalam', 'Thiruvananthapuram', 'YouTube', 'mid'], ['Kaveri Gowda', 'Kannada', 'Mysuru', 'Instagram', 'nano'], ['Sowmya Rao', 'Telugu', 'Vijayawada', 'ShareChat', 'mid'],
    ['Pallavi Jadhav', 'Marathi', 'Nashik', 'Moj', 'micro'], ['Mansi Patel', 'Gujarati', 'Rajkot', 'Instagram', 'nano'], ['Gurleen Kaur', 'Punjabi', 'Amritsar', 'Josh', 'micro'],
    ['Riya Mishra', 'Bhojpuri', 'Patna', 'ShareChat', 'mid'], ['Sushree Mohanty', 'Odia', 'Bhubaneswar', 'Instagram', 'nano'], ['Meenakshi S', 'Tamil', 'Madurai', 'YouTube', 'micro'],
  ];
  for (const [name, language, city, platform, tier] of REGIONAL) {
    const followers = round({ nano: RG.int(5000, 9800), micro: RG.int(20000, 90000), mid: RG.int(120000, 450000) }[tier] / 100) * 100;
    const engagement_pct = r1({ nano: RG.int(70, 120) / 10, micro: RG.int(50, 95) / 10, mid: RG.int(30, 60) / 10 }[tier]);
    const avg_views = round((followers * (platform === 'YouTube' ? 0.45 : platform === 'Instagram' ? 0.32 : 0.5) * RG.noise(0.25)) / 100) * 100;
    const fee_reel = Math.max(1500, round((11000 * (followers / 45000) ** 0.58 * RG.noise(0.12)) / 500) * 500); // regional rate cards run ~40% below English/Hinglish
    const first = name.split(' ')[0].toLowerCase();
    creators.push({ handle: `@${first}.${language.toLowerCase().slice(0, 5)}beauty`, platform, followers, engagement_pct, avg_views, fee_reel,
      fee_story: round((fee_reel * 0.3) / 500) * 500, niche: 'regional beauty', city, language, fake_follower_pct: r1(2 + RG.f() * 7), name, tier, past_brand_roas: '', source: 'regional' });
  }

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
  // regional posts timed to their festival (Onam, Ganesh Chaturthi, Durga Puja) plus a few Dussehra-week pushes
  const regional = creators.filter((c) => c.source === 'regional');
  const REG_POSTS = [['Lakshmi Menon', '2026-08-21'], ['Anjali Nair', '2026-08-23'], ['Pallavi Jadhav', '2026-09-12'], ['Sowmya Rao', '2026-09-05'],
    ['Sayani Bose', '2026-10-14'], ['Ankita Das', '2026-10-16'], ['Riya Mishra', '2026-10-10'], ['Gurleen Kaur', '2026-10-18'], ['Meenakshi S', '2026-10-20'],
    ['Kaveri Gowda', '2026-09-24'], ['Mansi Patel', '2026-10-21'], ['Sushree Mohanty', '2026-10-17']];
  for (const [n, date] of REG_POSTS) {
    const c = regional.find((x) => x.name === n);
    plan.push({ c, date, format: c.platform === 'YouTube' ? 'youtube_short' : c.platform === 'Instagram' ? 'reel' : 'short_video' });
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
    const barter = c.source === 'regional' ? c.tier !== 'mid' : c.tier === 'nano' && R.chance(0.35); // regional nano/micro creators work for product
    const fee_paid = barter ? 0 : story ? c.fee_story : c.fee_reel;
    let base = (c.handle.replace(/[^a-z]/gi, '').toUpperCase().replace(/^THE/, '')).slice(0, 6) + '15';
    let code = base; let k = 2;
    while (used.has(code)) code = base + String.fromCharCode(64 + k++);
    used.add(code);
    return { post_id: 'P' + String(i + 1).padStart(3, '0'), handle: c.handle, date: p.date, format: p.format, views, likes, comments, link_clicks,
      coupon_code: code, orders: 0, revenue: 0, fee_paid, platform: c.platform, barter: barter ? 'yes' : 'no', exp_orders, region: CITY[c.city].region, language: c.language };
  });
  return { creators, posts };
}
const { creators, posts } = creatorsAndPosts();
const DECAY = [0.34, 0.22, 0.15, 0.11, 0.08, 0.06, 0.04];

// ---------- orders ----------
function genOrders() {
  const R = rng('orders');
  const G = rng('orders-geo-pay'); // pincode + payment instrument: own stream so the order story above does not move
  const rows = [], customers = new Map(), pools = Object.fromEntries(CHANNELS.map((c) => [c, []]));
  const custSeq = Object.fromEntries(CHANNELS.map((c) => [c, 0]));
  let seq = 0;
  const regionW = (c) => c.w * REGION_W[c.region] / sum(CITIES.filter((x) => x.region === c.region), (x) => x.w);
  const tierW = { Meesho: { 1: 0.45, 2: 1.4, 3: 2.6 }, JioMart: { 1: 0.8, 2: 1.2, 3: 1.4 } };
  const chCities = Object.fromEntries(Object.entries(CH_CITIES).map(([ch, cs]) => [ch, CITIES.filter((c) => cs.includes(c.city))]));
  function pickCity(ch, d, post) {
    if (ch === EXPORT) return R.wpick(INTL, INTL.map((x) => x.w));
    const cs = chCities[ch] || (post && R.chance(0.5) ? CITIES.filter((x) => x.region === post.region) : CITIES);
    const base = chCities[ch] || post ? (c) => c.w : regionW;
    return R.wpick(cs, cs.map((c) => base(c) * (tierW[ch]?.[c.tier] ?? 1) * cityBoost(d, c)));
  }

  function discountFor(ch, d) {
    if (OFFLINE.has(ch)) return R.wpick([0, 5, 10], [60, 25, 15]);
    if (ch === EXPORT) return 0;
    if (isFestive(d)) return ch === 'Website' ? R.wpick([20, 25], [6, 4]) : R.wpick([15, 20, 25, 30], [2, 4, 3, 1]);
    if (isBBD(d) && BBD_BOOST[ch]) return R.wpick([20, 25, 30], [3, 4, 3]);
    if (d >= '2026-08-14' && d <= '2026-08-16') return R.wpick([15, 20], [6, 4]);
    switch (ch) {
      case 'Website': return R.wpick([0, 10, 15, 20], [36, 44, 14, 6]);
      case 'Amazon': case 'Flipkart': case 'JioMart': return R.wpick([5, 10, 15, 20], [20, 40, 30, 10]);
      case 'Nykaa': case 'Myntra': case 'Purplle': case 'Tata CLiQ': case 'AJIO': return R.wpick([10, 15, 20], [40, 40, 20]);
      case 'Meesho': return R.wpick([15, 20, 25], [30, 45, 25]);
      default: return R.wpick([0, 5, 10], [50, 30, 20]);
    }
  }

  function makeOrder(d, ch, take, post) {
    const order_id = 'KC' + String(100000 + ++seq);
    // customer (offline buyers are anonymous walk-ins: one id per bill)
    let cust = null;
    const pool = pools[ch];
    if (pool.length > 30 && R.chance(REPEAT_P[ch] * Math.min(1, pool.length / 400))) {
      for (let t = 0; t < 3 && !cust; t++) {
        const c = pool[Math.floor(R.f() * pool.length)];
        if (Date.parse(d) - Date.parse(c.last) >= 14 * DAY) cust = c;
      }
    }
    if (!cust) {
      const c = pickCity(ch, d, post);
      cust = { customer_id: CH_PREFIX[ch] + '-' + String(++custSeq[ch]).padStart(6, '0'), first_order_date: d, city: c.city, region: c.region,
        acquisition_channel: ch, orders: 0, total_spend: 0, last: d, city_tier: c.tier, state: c.state,
        pincode: c.pin ? c.pin + G.int(0, { 1: 90, 2: 30, 3: 10 }[c.tier]) : '', ...(post ? { acquired_by: post.coupon_code } : {}) };
      customers.set(cust.customer_id, cust); pool.push(cust);
    }
    cust.orders++; cust.last = d;
    const city = CITY[cust.city];
    const qc = QC.has(ch), off = OFFLINE.has(ch), exp = ch === EXPORT;
    const wh = exp ? 'Mumbai' : R.chance(0.07) ? R.pick(WAREHOUSES.filter((w) => w !== HOME[city.region])) : HOME[city.region];
    const zone = exp ? 'INTL' : qc || off ? 'A' : zoneOf(city.city, wh);
    // lines
    const units = take(R.wpick([1, 2, 3], [62, 28, 10]));
    const skus = SKUS.filter((s) => units.includes(s));
    const disc = post ? 15 : discountFor(ch, d);
    // payment and status
    const cod = !off && !exp && R.chance(Math.min(0.85, (post ? 0.3 : COD_P[ch]) * { 1: 0.85, 2: 1.15, 3: 1.35 }[city.tier]));
    let courier = ch === 'Website' ? null : MKT_COURIER[ch];
    if (!courier) {
      const names = Object.keys(COURIER).filter((n) => !(n === 'Shadowfax' && zone === 'E'));
      courier = R.wpick(names, names.map((n) => COURIER[n].w * (n === 'Blue Dart' && zone === 'C' ? 2 : 1) * (n === 'India Post' && (city.tier === 3 || 'DE'.includes(zone)) ? 3 : 1)));
    }
    let status = 'delivered';
    if (!off && R.chance(cod ? 0.055 : 0.025)) status = 'cancelled';
    else if (!off) {
      const p = cod ? RTO_COD[ch] * TIER_RTO[city.tier] * (ch === 'Website' ? COURIER[courier].rto : 1) * (isFestive(d) ? 1.15 : 1) : 0.015;
      if (R.chance(p)) status = 'rto';
    }
    const zi = ZONES.indexOf(zone);
    const deliveryDays = status !== 'delivered' ? '' : off ? 0 : exp ? round(8 * R.noise(0.25))
      : Math.max(qc ? 0 : 1, round((ch === 'Website' ? COURIER[courier].days[zi] : qc ? 0.1 : [1.4, 2.2, 2.6, 3.8, 5.5][zi]) * R.noise(0.25) + (isFestive(d) ? 1 : 0)));
    const [methods, mw] = PAY_MIX[ch === 'Website' ? 'web' : qc ? 'qc' : off ? 'offline' : exp ? 'export' : 'mkt'];
    const payment_method = cod ? 'COD' : G.wpick(methods, mw);
    const intra = city.state === WH_STATE[wh];
    const lines = skus.map((sku, li) => {
      const qty = units.filter((x) => x === sku).length;
      const mrp = P[sku].mrp, gross = mrp * qty, net = round(gross * (1 - disc / 100));
      let st = status;
      if (st === 'delivered' && li === 0 && R.chance(RETURN_P[ch] * (sku === 'SKU04' ? 1.4 : 1))) st = 'returned';
      return { order_id, date: d, channel: ch, region: city.region, city: city.city, warehouse: wh, sku, qty, mrp, discount_pct: disc, gross_revenue: gross,
        net_revenue: net, payment: cod ? 'cod' : 'prepaid', status: st, customer_id: cust.customer_id,
        coupon: post ? post.coupon_code : '', courier: status === 'cancelled' ? '' : courier, zone: status === 'cancelled' ? '' : zone,
        delivery_days: st === 'delivered' || st === 'returned' ? deliveryDays : '', shipping_cost: 0, channel_fee: 0,
        state: city.state, pincode: cust.pincode, payment_method,
        gst: st === 'delivered' && !exp ? round((net * 18) / 118) : 0,
        tax_type: status === 'cancelled' ? '' : exp ? 'Zero-rated export (LUT)' : intra ? 'CGST+SGST' : 'IGST' };
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
    const w = CHANNELS.map((c) => CH_SHARE[c] * (isFestive(d) && c !== 'Website' && c !== 'Nykaa' ? 1.15 : 1) * (isBBD(d) ? BBD_BOOST[c] ?? 1 : 1));
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
    'Broad prospecting': { cpm: 115, adsets: { 'Women 18-34 metro': [['Reel - the kesar story', 'reel', 1.1, 1.1], ['Static - founder note', 'static', 0.7, 0.75]], 'Women 25-44 tier 2': [['Reel - Hindi voiceover', 'reel', 0.9, 1.05], ['Reel - Tamil voiceover', 'reel', 0.6, 1.0], ['Static - Bengali Pujo offer', 'static', 0.5, 0.9]] } },
  };
  // creative language (regional creatives run in the tier-2 adset)
  const LANG = { 'Reel - Hindi voiceover': 'Hindi', 'Reel - Tamil voiceover': 'Tamil', 'Static - Bengali Pujo offer': 'Bengali', 'UGC - Kavya review': 'Tamil',
    'Reel - the kesar story': 'Hinglish', 'UGC - serum before after': 'Hinglish', 'UGC - SPF 50 test': 'Hinglish', 'Reel - sunscreen no white cast': 'Hinglish' };
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
      rows.push({ date: t.d, campaign: v.campaign, adset: t.a.adset, ad: t.a.ad, creative_type: t.a.ct, spend: t.spend, impressions, clicks, add_to_cart, purchases, revenue: t.revenue, language: LANG[t.a.ad] || 'English' });
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
    ['YouTube - the kesar story', 'video', 400, 4, 0.5, 0.004], ['Search - sunscreen Hindi keywords', 'search', 120, 7, 2.2, 0.05],
    ['Demand Gen - festive (Hindi)', 'demand_gen', 150, 5, 1.4, 0.008],
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
    ['Amazon', 'SP - Sunscreen auto', 620, 9, 4.2, 'Sponsored Products'], ['Amazon', 'SP - Vitamin C exact', 460, 12, 3.6, 'Sponsored Products'],
    ['Amazon', 'SB - Kesar brand video', 260, 7, 2.4, 'Sponsored Brands'], ['Amazon', 'SD - Retarget product viewers', 100, 8, 2.0, 'Sponsored Display'],
    ['Flipkart', 'PLA - Sunscreen', 300, 6, 3.0, 'PLA'], ['Flipkart', 'PCA - Festive brand banner', 80, 4, 1.6, 'PCA'],
    ['Nykaa', 'Nykaa Sponsored - Serum', 520, 9, 3.2, 'Sponsored listing'], ['Myntra', 'Myntra Ads - Serum', 80, 7, 2.4, 'Sponsored listing'],
    ['Purplle', 'Purplle Sponsored - Sunscreen', 70, 6, 2.7, 'Sponsored listing'], ['Meesho', 'Meesho Ads - Sunscreen', 90, 3, 3.3, 'Sponsored listing'],
    ['Blinkit', 'Blinkit Search - Sunscreen', 380, 5, 2.6, 'Search'], ['Zepto', 'Zepto Ads - Sunscreen', 240, 5, 2.3, 'Search'],
    ['Instamart', 'Instamart Ads - Sunscreen', 120, 5, 2.5, 'Search'],
  ];
  const rows = [];
  for (const d of DAYS) for (const [platform, campaign, base, cpc, roas, ad_type] of C) {
    const lvl = { '2026-08': 0.9, '2026-09': 0.95, '2026-10': 1.05 }[d.slice(0, 7)] * (isFestive(d) ? 1.8 : 1) * (isBBD(d) && BBD_BOOST[platform] ? 1.6 : 1);
    const spend = round(base * lvl * R.noise(0.2));
    const revenue = round(spend * roas * (isFestive(d) ? 1.1 : 1) * R.noise(0.3));
    rows.push({ date: d, platform, campaign, spend, clicks: round(spend / (cpc * R.noise(0.12))), orders: round(revenue / (640 * R.noise(0.1))), revenue, ad_type });
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
  ['Ramesh Kumar', 'M', 'Ops', 'Warehouse Associate (Delhi)', 'L0', 'Delhi', '2025-08-01', 2.4, 0],
  ['Sunita Patil', 'F', 'Ops', 'Warehouse Associate (Mumbai)', 'L0', 'Mumbai', '2025-11-01', 2.4, 0],
  ['Venkatesh Murthy', 'M', 'Ops', 'Warehouse Associate (Bangalore)', 'L0', 'Bangalore', '2026-02-01', 2.4, 0],
];
// ESI: employees with gross <= Rs 21,000/month; employee 0.75%, employer 3.25% of gross, rounded up to the rupee
const ESI_LIMIT = 21000;
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
    let special_monthly = fixedMonthly - basic_monthly - hra_monthly - pf_employer_monthly, esi_employer_monthly = 0;
    if (special_monthly + basic_monthly + hra_monthly <= ESI_LIMIT) { // ESI-covered: carve employer ESI out of the fixed CTC
      for (let k = 0; k < 5; k++) esi_employer_monthly = Math.ceil(0.0325 * (fixedMonthly - pf_employer_monthly - esi_employer_monthly)); // fixed point
      special_monthly -= esi_employer_monthly;
    }
    return { emp_id: 'E' + String(i + 1).padStart(3, '0'), name, dept, role, level, city, join_date, ctc_annual, basic_monthly, hra_monthly, special_monthly,
      pf_employer_monthly, variable_pct, gender, state: STATE[city], esi_employer_monthly };
  });
  return { employees, payroll: payrollFor('2026-10', employees) };
}
function payrollFor(month, emps = employees) {
  return emps.filter((e) => e.join_date <= month + '-01').map((e) => {
    const gross = e.basic_monthly + e.hra_monthly + e.special_monthly;
    const pf_employee = round(0.12 * Math.min(e.basic_monthly, 15000));
    const professional_tax = professionalTax(e.city, e.gender, gross);
    const tds = round(annualTax(gross * 12 - 75000) / 12);
    const esi = gross <= ESI_LIMIT, esi_employee = esi ? Math.ceil(0.0075 * gross) : 0, esi_employer = esi ? Math.ceil(0.0325 * gross) : 0;
    return { emp_id: e.emp_id, month, gross, pf_employee, professional_tax, tds, net_pay: gross - pf_employee - esi_employee - professional_tax - tds,
      pf_employer: e.pf_employer_monthly, employer_cost: gross + e.pf_employer_monthly + esi_employer, name: e.name, dept: e.dept, esi_employee, esi_employer, state: e.state };
  });
}
const { employees, payroll } = genPeople();
const salaryFor = (m) => sum(payrollFor(m), (p) => p.employer_cost);

// ---------- WhatsApp (Interakt for marketing, WATI for utility flows) ----------
// Meta per-message rates via the BSP: marketing Rs 0.88, utility Rs 0.125 per delivered message (BSP markup included).
const WA_RATE = { marketing: 0.88, utility: 0.125 };
const WEEKS = []; for (let d = '2026-08-01'; d <= '2026-10-31'; d = addDays(d, 7)) WEEKS.push(d); // 14 weeks starting Saturdays
function genWhatsApp() {
  const R = rng('whatsapp');
  const rows = [];
  const firstLines = orders.filter((o, i) => i === 0 || orders[i - 1].order_id !== o.order_id);
  const web = firstLines.filter((o) => o.channel === 'Website');
  const inWeek = (w) => (o) => o.date >= w && o.date < addDays(w, 7);
  const add = (date, bsp, flow, category, audience, language, sent, readP, clickP, convP) => {
    const delivered = round(sent * (0.94 + R.f() * 0.04)), read = Math.min(delivered, round(delivered * readP * R.noise(0.05)));
    const clicked = Math.min(read, round(read * clickP * R.noise(0.12)));
    const ord = convP ? Math.min(clicked, round(clicked * convP * R.noise(0.15))) : 0;
    rows.push({ date, bsp, flow, category, audience, language, sent, delivered, read, clicked, orders: ord, revenue: ord ? round(ord * 1120 * R.noise(0.08)) : 0,
      cost: round(delivered * WA_RATE[category]) });
  };
  for (const w of WEEKS) {
    const wk = web.filter(inWeek(w));
    add(w, 'Interakt', 'Abandoned cart recovery', 'marketing', 'Website carts abandoned with phone number', 'Hinglish', round(wk.length * 1.6), 0.82, 0.19, 0.24);
    add(w, 'WATI', 'COD order confirmation', 'utility', 'Every website COD order', 'English + Hindi', wk.filter((o) => o.payment === 'cod').length, 0.88, 0.71, 0);
    add(w, 'WATI', 'NDR reattempt (failed delivery)', 'utility', 'Website orders with a failed delivery attempt', 'English + Hindi', round(wk.filter((o) => o.status === 'rto').length * 2.4) + 3, 0.8, 0.34, 0);
    const old = web.filter(inWeek(addDays(w, -42))).filter((o) => o.status === 'delivered');
    if (old.length) add(w, 'Interakt', 'Reorder reminder (day 42)', 'marketing', 'Website buyers 6 weeks after delivery', 'English', old.length, 0.78, 0.14, 0.3);
  }
  const B = [
    ['2026-08-13', 'Independence Day sale', 'All opted-in subscribers', 'Hinglish', 11000], ['2026-08-21', 'Onam gift sets', 'Kerala subscribers', 'Malayalam', 950],
    ['2026-08-24', 'Raksha Bandhan Glow Kit', 'All opted-in subscribers', 'Hinglish', 11750], ['2026-09-04', 'Monsoon skincare routine', 'All opted-in subscribers', 'English', 12000],
    ['2026-09-12', 'Ganesh Chaturthi offer', 'Maharashtra subscribers', 'Marathi', 3100], ['2026-09-25', 'Sunscreen restock', 'Past SKU02 buyers', 'English', 3900],
    ['2026-10-03', 'Festive early access (website)', 'All opted-in subscribers', 'Hinglish', 13250], ['2026-10-11', 'Navratri glow edit', 'Gujarat + Hindi belt subscribers', 'Gujarati + Hindi', 5900],
    ['2026-10-15', 'Durga Puja (Pujo) offer', 'West Bengal, Assam, Odisha subscribers', 'Bengali', 1300], ['2026-10-19', 'Dussehra sale live', 'All opted-in subscribers', 'Hindi', 14250],
    ['2026-10-22', 'Last day Dussehra sale', 'Clicked but not bought', 'Hinglish', 4600], ['2026-10-28', 'Diwali gifting preview', 'All opted-in subscribers', 'Hinglish', 14800],
  ];
  for (const [date, flow, audience, language, sent] of B) add(date, 'Interakt', `Broadcast - ${flow}`, 'marketing', audience, language, sent, 0.74, 0.07, 0.17);
  rows.sort((a, b) => (a.date + a.flow < b.date + b.flow ? -1 : 1));
  rows.forEach((r, i) => (r.campaign_id = 'WA' + String(i + 1).padStart(3, '0')));
  return rows;
}
const whatsapp = genWhatsApp();
const waCost = (m, bsp) => sum(whatsapp.filter((w) => w.date.startsWith(m) && w.bsp === bsp), (w) => w.cost);

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
    add(m, 'Software', 'GoKwik (checkout and COD verification)', 6500 + R.int(0, 1500));
    add(m, 'Software', 'Interakt (WhatsApp marketing: plan + message charges)', 2499 + waCost(m, 'Interakt'));
    add(m, 'Software', 'WATI (WhatsApp COD confirmation and NDR flows)', 1999 + waCost(m, 'WATI'));
    add(m, 'Software', 'Email and SMS', 7200);
    add(m, 'Software', 'Google Workspace', employees.filter((e) => e.join_date <= m + '-01').length * 175);
    add(m, 'Software', 'Freshdesk (helpdesk, WhatsApp inbox, IVR)', 4800 + 1500);
    add(m, 'Software', 'Accounting and payroll software', 3800);
    add(m, 'Creative production', 'Product shoot and UGC edits', { '2026-08': 38000, '2026-09': 42000, '2026-10': 64000 }[m]);
    add(m, 'Professional fees', 'CA firm (books, GST, TDS filing)', 22000);
    add(m, 'Professional fees', 'Legal and trademark', m === '2026-09' ? 22000 : 6000);
    add(m, 'Utilities', 'Electricity, internet, housekeeping', 13500 + R.int(0, 2000));
    add(m, 'Travel', 'Team travel', 9000 + R.int(0, 6000));
    add(m, 'Samples and gifting', 'PR boxes and creator seeding', { '2026-08': 18000, '2026-09': 21000, '2026-10': 34000 }[m]);
    add(m, 'Bank and compliance', 'Bank charges, ROC, stamp duty', 3200);
    add(m, 'Trade marketing', 'Health & Glow and Apollo shelf visibility', 15000);
    add(m, 'Professional fees', 'Export compliance (IEC, LUT, FDA listing)', 6000);
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

// ---------- India layer: geography, festive calendar, GST, settlements, quick commerce, reviews, CX, cohorts, vendors, compliance ----------
const firstLines = [...ORDERS_BY_ID.values()].map((ls) => ls[0]);
const delivered = orders.filter((o) => o.status === 'delivered');
const monthEnd = (m) => addDays(addDays(m + '-01', 32).slice(0, 7) + '-01', -1);
const nextMonth = (m) => addDays(m + '-01', 32).slice(0, 7);

function genCities() {
  return CITIES.map((c) => ({ city: c.city, state: c.state, region: c.region, tier: c.tier, pincode: c.pin, gst_state_code: GST_CODE[c.state],
    is_metro: METRO.has(c.city) ? 'yes' : 'no', home_warehouse: HOME[c.region],
    zone_from_mumbai: zoneOf(c.city, 'Mumbai'), zone_from_delhi: zoneOf(c.city, 'Delhi'), zone_from_bangalore: zoneOf(c.city, 'Bangalore'),
    quick_commerce: [...QC].filter((q) => CH_CITIES[q].includes(c.city)).join('; '),
    offline_stores: [...OFFLINE].filter((q) => CH_CITIES[q].includes(c.city)).join('; ') }));
}

function genFestive() {
  // [event, start, end, type, focus (states, or ''), platforms (channels, or ''), expected_uplift_x for upcoming, note]
  const E = [
    ['Independence Day sale', '2026-08-14', '2026-08-16', 'sale', '', '', '', 'Site-wide 15-20% off'],
    ['Onam', '2026-08-20', '2026-08-26', 'festival', 'Kerala', '', '', 'Thiruvonam 26 Aug; Malayalam creators + WhatsApp'],
    ['Raksha Bandhan', '2026-08-24', '2026-08-28', 'festival', '', '', '', 'Gifting: Glow Kit (SKU05) sells ~2x'],
    ['Ganesh Chaturthi', '2026-09-12', '2026-09-16', 'festival', 'Maharashtra', '', '', 'Ganesh Chaturthi 14 Sep'],
    ['Flipkart Big Billion Days', '2026-10-03', '2026-10-09', 'platform sale', '', 'Flipkart; Flipkart Minutes', '', 'Deepest marketplace discounts of the year (20-30%)'],
    ['Amazon Great Indian Festival (opening week)', '2026-10-03', '2026-10-09', 'platform sale', '', 'Amazon', '', 'Prime early access then open sale'],
    ['Myntra Big Fashion Festival', '2026-10-03', '2026-10-09', 'platform sale', '', 'Myntra', '', ''],
    ['Meesho Mega Blockbuster Sale', '2026-10-03', '2026-10-09', 'platform sale', '', 'Meesho', '', 'Tier 2-3, heavy COD'],
    ['Navratri', '2026-10-11', '2026-10-19', 'festival', 'Gujarat; Maharashtra; Uttar Pradesh; Delhi; Rajasthan', '', '', ''],
    ['Durga Puja', '2026-10-15', '2026-10-20', 'festival', 'West Bengal; Assam; Odisha', '', '', 'Pujo 17-20 Oct; Bengali creatives'],
    ['Dussehra week sale', '2026-10-19', '2026-10-25', 'sale', '', '', '', 'Dussehra 20 Oct; peak days of the quarter'],
    ['Karva Chauth', '2026-10-29', '2026-10-29', 'festival', 'Delhi; Punjab; Haryana; Rajasthan; Uttar Pradesh', '', '', ''],
    ['Diwali sale (Dhanteras to Diwali)', '2026-11-01', '2026-11-08', 'sale', '', '', 3.0, 'Dhanteras 6 Nov, Diwali 8 Nov: the planned festive sale'],
    ['Bhai Dooj', '2026-11-11', '2026-11-11', 'festival', '', '', 1.4, 'Gifting'],
    ['Chhath Puja', '2026-11-14', '2026-11-15', 'festival', 'Bihar; Jharkhand; Uttar Pradesh', '', 1.2, ''],
    ['Wedding season', '2026-11-20', '2027-02-28', 'season', '', '', 1.25, 'Dev Uthani Ekadashi 20 Nov opens the season; bridal skincare, Kesar Face Oil'],
    ['Nykaa Pink Friday Sale', '2026-11-20', '2026-11-30', 'platform sale', '', 'Nykaa', 2.2, 'Nykaa\'s biggest sale; funds part of the discount'],
    ['Black Friday (exports)', '2026-11-26', '2026-11-30', 'platform sale', '', 'Amazon Global', 2.5, 'US/UK/Canada buyers'],
    ['Myntra End of Reason Sale (EORS)', '2026-12-06', '2026-12-12', 'platform sale', '', 'Myntra', 2.4, ''],
    ['Christmas and New Year', '2026-12-20', '2026-12-31', 'festival', '', '', 1.3, 'Gift sets'],
    ['Pongal / Makar Sankranti', '2027-01-13', '2027-01-16', 'festival', 'Tamil Nadu; Andhra Pradesh; Telangana; Karnataka; Gujarat', '', 1.4, 'Tamil and Telugu creatives'],
    ['Republic Day sale', '2027-01-17', '2027-01-26', 'platform sale', '', 'Amazon; Flipkart', 1.8, 'Amazon Great Republic Day + Flipkart Republic Day sale'],
    ['Eid ul-Fitr', '2027-03-09', '2027-03-10', 'festival', '', '', 1.2, 'Date depends on the moon'],
    ['Holi', '2027-03-18', '2027-03-22', 'festival', 'Uttar Pradesh; Delhi; Bihar; Rajasthan; Haryana', '', 1.3, 'Holi 22 Mar: pre- and post-Holi skin care'],
  ];
  const booked = orders.filter((o) => o.status !== 'cancelled');
  return E.map(([event, start_date, end_date, type, focus, platforms, exp, note]) => {
    let observed = '';
    if (end_date <= '2026-10-31') {
      const st = focus ? focus.split('; ') : null, ch = platforms ? platforms.split('; ') : null;
      const scope = booked.filter((o) => (!st || st.includes(o.state)) && (!ch || ch.includes(o.channel)));
      const days = (Date.parse(end_date) - Date.parse(start_date)) / DAY + 1;
      const win = sum(scope.filter((o) => o.date >= start_date && o.date <= end_date), (o) => o.net_revenue) / days;
      observed = r2(win / (sum(scope, (o) => o.net_revenue) / 92));
    }
    return { event, start_date, end_date, type, focus_states: focus, platforms, status: end_date <= '2026-10-31' ? 'past' : 'upcoming',
      observed_uplift_x: observed, expected_uplift_x: exp, note };
  });
}

// GST: one GSTIN per warehouse state. Output tax on delivered domestic lines (prices are GST-inclusive, HSN 3304 at 18%).
// ITC: 18% on channel fees + shipping (GSTIN of the shipping warehouse); ads, creators (100k+ followers are GST-registered),
// raw materials and head-office opex at the Maharashtra GSTIN; 3PL at its warehouse's GSTIN; blocked credits (insurance, travel,
// gifting, foreign SaaS under reverse charge) excluded. TCS: 0.5% of taxable value sold through e-commerce operators.
const GSTIN = { Maharashtra: '27AAKCK4821M1Z5', Delhi: '07AAKCK4821M1Z9', Karnataka: '29AAKCK4821M1Z1' };
const BLOCKED_OPEX = new Set(['Insurance', 'Travel', 'Samples and gifting']);
const poGstRate = (p) => (p.material_id === 'RM07' || p.supplier_id === 'S03' ? 5 : 18);
function genGst() {
  const rows = [];
  const opening = { Maharashtra: 0, Delhi: 0, Karnataka: 0 };
  const big = new Set(creators.filter((c) => c.followers >= 100000).map((c) => c.handle));
  for (const m of MONTHS) for (const wh of WAREHOUSES) {
    const st = WH_STATE[wh], hq = st === 'Maharashtra';
    const ls = delivered.filter((o) => o.date.startsWith(m) && o.warehouse === wh && o.channel !== EXPORT);
    let cgst = 0, sgst = 0, igst = 0;
    for (const o of ls) if (o.tax_type === 'CGST+SGST') { const c = round(o.gst / 2); cgst += c; sgst += o.gst - c; } else igst += o.gst;
    const output = cgst + sgst + igst;
    const fees = orders.filter((o) => o.date.startsWith(m) && o.warehouse === wh && o.status !== 'cancelled');
    const itc_on_fees = round(0.18 * sum(fees, (o) => o.channel_fee + o.shipping_cost));
    const itc_on_marketing = hq ? round(0.18 * (sum([...meta, ...google, ...mktAds].filter((x) => x.date.startsWith(m)), (x) => x.spend)
      + sum(posts.filter((p) => p.date.startsWith(m) && big.has(p.handle)), (p) => p.fee_paid))) : 0;
    const itc_on_purchases = hq ? round(sum(pos.filter((p) => p.received_date.startsWith(m)), (p) => (p.total * poGstRate(p)) / 100)) : 0;
    const itc_on_opex = round(0.18 * sum(opex.filter((x) => x.month === m && !BLOCKED_OPEX.has(x.category) && !x.vendor.startsWith('Shopify')
      && (x.category === 'Warehousing (3PL)' ? x.vendor.endsWith(wh) : hq)), (x) => x.amount));
    const itc_total = itc_on_fees + itc_on_marketing + itc_on_purchases + itc_on_opex;
    const available = opening[st] + itc_total;
    const after = Math.max(0, output - available);
    const tcs_credit = round(0.005 * sum(ls.filter((o) => FEE[o.channel].tcs_pct > 0), (o) => o.net_revenue - o.gst));
    rows.push({ month: m, gstin: GSTIN[st], state: st, hsn: '3304', taxable_value: sum(ls, (o) => o.net_revenue - o.gst), cgst, sgst, igst, output_gst: output,
      itc_on_fees, itc_on_marketing, itc_on_purchases, itc_on_opex, itc_total, itc_opening: opening[st], itc_closing: Math.max(0, available - output),
      tcs_credit, cash_payable: Math.max(0, after - tcs_credit), gstr1_due: nextMonth(m) + '-11', gstr3b_due: nextMonth(m) + '-20' });
    opening[st] = Math.max(0, available - output);
  }
  return rows;
}

// Settlements: what each platform paid us, per cycle (weekly; offline monthly). Website = Razorpay (prepaid) + Shiprocket COD remittance.
function genSettlements() {
  const rows = [];
  const live = orders.filter((o) => o.status !== 'cancelled');
  const cycles = (ch) => (OFFLINE.has(ch) ? MONTHS.map((m) => [m + '-01', monthEnd(m)]) : WEEKS.map((w) => [w, addDays(w, 6) > '2026-10-31' ? '2026-10-31' : addDays(w, 6)]));
  const payers = [['Website', 'Razorpay', (o) => o.payment === 'prepaid', 2], ['Website', 'Shiprocket COD remittance', (o) => o.payment === 'cod', 8],
    ...CHANNELS.filter((c) => c !== 'Website').map((c) => [c, c === EXPORT ? 'Amazon Global Selling' : OFFLINE.has(c) ? `${c} (via distributor)` : c, () => true, FEE[c].settlement_days])];
  for (const [ch, payer, f, days] of payers) {
    const fee = FEE[ch];
    for (const [a, b] of cycles(ch)) {
      const ls = live.filter((o) => o.channel === ch && f(o) && o.date >= a && o.date <= b);
      if (!ls.length) continue;
      const gross = sum(ls.filter((o) => o.status === 'delivered'), (o) => o.net_revenue), gst = sum(ls, (o) => o.gst);
      const fees = sum(ls, (o) => o.channel_fee), shipping = ch === 'Website' ? 0 : sum(ls, (o) => o.shipping_cost);
      const gst_on_fees = round(0.18 * (fees + shipping)), tcs = round((fee.tcs_pct / 100) * (gross - gst)), tds = round((fee.tds_pct / 100) * (gross - gst));
      const settlement_date = addDays(b, days);
      rows.push({ channel: ch, payer, cycle_start: a, cycle_end: b, settlement_date, orders: new Set(ls.map((o) => o.order_id)).size, gross_sales: gross,
        fees, shipping, gst_on_fees, tcs, tds, net_payout: gross - fees - shipping - gst_on_fees - tcs - tds, status: settlement_date <= '2026-10-31' ? 'paid' : 'pending' });
    }
  }
  rows.sort((a, b) => (a.settlement_date + a.channel < b.settlement_date + b.channel ? -1 : 1));
  rows.forEach((r, i) => (r.settlement_id = 'ST' + String(i + 1).padStart(4, '0')));
  return rows;
}

// Quick-commerce dark-store stock (weekly, per platform x city x SKU). units_sold_week = that platform's non-cancelled units in the city that week.
const DARK_STORES = { Blinkit: 1.0, Zepto: 0.75, Instamart: 0.7, 'BB Now': 0.35, 'Flipkart Minutes': 0.3 };
function genQcInventory() {
  const R = rng('qc-inventory');
  const rows = [];
  const snaps = WEEKS.slice(1); // Saturdays 08-08..10-31, same dates as inventory_snapshot; units_sold_week = the 7 days ending that date
  const sold = {};
  for (const o of orders) if (QC.has(o.channel) && o.status !== 'cancelled') {
    const wk = snaps.find((w) => w >= o.date);
    if (!wk || o.date <= WEEKS[0]) continue; // the 08-01 snapshot week starts before the data
    const k = wk + o.channel + o.city + o.sku; sold[k] = (sold[k] || 0) + o.qty;
  }
  // story: Zepto Bangalore runs out of sunscreen and Blinkit Mumbai is thin on serum going into Diwali
  const LOW = { 'Zepto|Bangalore|SKU02': 0.38, 'Blinkit|Mumbai|SKU01': 0.45, 'Instamart|Hyderabad|SKU05': 0.5 };
  for (const w of snaps) for (const p of QC) for (const city of CH_CITIES[p]) {
    const stores = Math.max(2, round(CITY[city].w * 0.45 * DARK_STORES[p])); // dark stores in the city that list us (a small brand is not in every store)
    for (const s of SKUS) {
      const u = sold[w + p + city + s] || 0;
      const avail = w === '2026-10-31' && LOW[`${p}|${city}|${s}`] ? LOW[`${p}|${city}|${s}`] : 0.84 + R.f() * 0.15;
      const in_stock = round(stores * avail), on_hand = in_stock * R.int(1, 2);
      rows.push({ date: w, platform: p, city, sku: s, dark_stores: stores, in_stock_stores: in_stock, on_hand, units_sold_week: u,
        days_of_cover: u ? r1(on_hand / (u / 7)) : '', availability_pct: r1((100 * in_stock) / stores) });
    }
  }
  return rows;
}

// Ratings and reviews: new ratings per month x platform x SKU (stars 5..1), from delivered units.
function genReviews() {
  const R = rng('reviews');
  // share of delivered units that get rated (the website asks on WhatsApp via Judge.me)
  const RATE = { Website: 0.14, Amazon: 0.09, Flipkart: 0.1, Nykaa: 0.13, Myntra: 0.08, Purplle: 0.1, Meesho: 0.16, 'Tata CLiQ': 0.08, JioMart: 0.07, AJIO: 0.08, Blinkit: 0.05 };
  const SHIFT = { Website: 0.15, Nykaa: 0.1, 'Tata CLiQ': 0.1, Meesho: -0.35, Flipkart: -0.1, JioMart: -0.15, Blinkit: 0 };
  const SKU_Q = { SKU01: 0.05, SKU02: -0.2, SKU03: 0.1, SKU04: -0.1, SKU05: 0.15 };
  const PRAISE = { SKU01: 'Visible glow in 2 weeks', SKU02: 'No white cast on brown skin', SKU03: 'Light, not sticky', SKU04: 'Saffron smell, glow', SKU05: 'Great gift box' };
  const GRIPE = { SKU01: 'Oxidises (turns orange) after a month', SKU02: 'White cast on dusky skin', SKU03: 'Too light for dry winter skin', SKU04: 'Too oily for humid weather', SKU05: 'Mini sizes too small' };
  const rows = [];
  for (const m of MONTHS) for (const p of Object.keys(RATE)) for (const s of SKUS) {
    const units = sum(delivered.filter((o) => o.channel === p && o.sku === s && o.date.startsWith(m)), (o) => o.qty);
    const n = round(units * RATE[p] * R.noise(0.2));
    if (!n) continue;
    const mean = 4.15 + (SHIFT[p] ?? 0) + SKU_Q[s] + (p === 'Meesho' && s === 'SKU02' ? -0.3 : 0);
    // J-shaped review curve (5 > 4 > 1 > 3 > 2), mass moved between 5 and 1-2 stars so the mean hits the target
    const q = Math.max(-0.3, Math.min(0.2, (mean - 4.09) / 1.92 + R.norm() * 0.03));
    const w = [0.55 + 0.5 * q, 0.22, 0.09, 0.05 - 0.08 * q, 0.09 - 0.42 * q];
    const c = w.map((x) => Math.floor(n * x));
    const rem = w.map((x, i) => [n * x - c[i], i]).sort((x, y) => y[0] - x[0]);
    for (let k = 0, left = n - sum(c); k < left; k++) c[rem[k][1]]++;
    const [five, four, three, two, one] = c;
    rows.push({ month: m, platform: p, sku: s, ratings: n, avg_rating: r2((5 * five + 4 * four + 3 * three + 2 * two + one) / n), five_star: five, four_star: four,
      three_star: three, two_star: two, one_star: one, reviews_with_text: round(n * (0.25 + R.f() * 0.15)), top_praise: PRAISE[s], top_complaint: GRIPE[s] });
  }
  return rows;
}

// Customer support tickets (website orders + pre-sale questions). Marketplaces run their own CX, so only escalations land here.
const LANG_BY_STATE = { 'Uttar Pradesh': 'Hindi', Delhi: 'Hindi', Rajasthan: 'Hindi', Bihar: 'Hindi', Haryana: 'Hindi', 'Madhya Pradesh': 'Hindi', Jharkhand: 'Hindi',
  Chhattisgarh: 'Hindi', Uttarakhand: 'Hindi', Punjab: 'Punjabi', Maharashtra: 'Marathi', Gujarat: 'Gujarati', 'West Bengal': 'Bengali', Odisha: 'Odia', Assam: 'Assamese',
  'Tamil Nadu': 'Tamil', Kerala: 'Malayalam', Karnataka: 'Kannada', Telangana: 'Telugu', 'Andhra Pradesh': 'Telugu' };
function genTickets() {
  const R = rng('tickets');
  const rows = [];
  const retBy = new Map(returns.map((r) => [r.order_id, r]));
  const lang = (st) => (R.chance(0.55) ? 'English' : LANG_BY_STATE[st] ? (R.chance(0.6) ? LANG_BY_STATE[st] : 'Hindi') : 'Hindi');
  const add = (date, category, o) => {
    const via = category.startsWith('Product question') ? R.wpick(['WhatsApp', 'Instagram DM', 'Email'], [60, 32, 8]) : R.wpick(['WhatsApp', 'Email', 'IVR', 'Instagram DM'], [55, 20, 17, 8]);
    const bot = via === 'WhatsApp' && ['Where is my order (WISMO)', 'Change COD to prepaid'].includes(category) && R.chance(0.7);
    const busy = isFestive(date) ? 2.2 : 1;
    const agents = ['Divya Pillai', 'Rahul Mishra', ...(date >= '2026-10-01' ? ['Lavanya Reddy'] : [])];
    const first_response_mins = bot ? R.int(0, 2) : via === 'IVR' ? R.int(1, 4) : round((via === 'Email' ? 180 : 35) * busy * R.noise(0.5));
    const resolution_hours = r1((bot ? 0.2 : { 'Damaged or leaking on arrival': 30, 'Return or refund request': 40, 'Failed delivery (NDR)': 20 }[category] ?? 8) * busy * R.noise(0.4));
    const open = date >= '2026-10-29' && !bot && R.chance(0.5);
    const status = open ? 'open' : R.chance(category.startsWith('Damaged') ? 0.12 : 0.03) ? 'escalated' : 'resolved';
    const base = { 'Damaged or leaking on arrival': 3.4, 'Failed delivery (NDR)': 3.6, 'Return or refund request': 3.7 }[category] ?? 4.3;
    const csat = status === 'resolved' && R.chance(0.42) ? Math.max(1, Math.min(5, round(base - (busy - 1) * 0.4 + R.norm() * 0.9))) : '';
    rows.push({ date, channel: via, order_id: o?.order_id ?? '', sales_channel: o?.channel ?? '', category, language: o ? lang(o.state) : R.pick(['English', 'Hindi', 'Hinglish', 'Tamil', 'Bengali']),
      first_response_mins, resolution_hours: status === 'open' ? '' : resolution_hours, status, csat, handled_by: bot ? 'WhatsApp bot' : R.pick(agents) });
  };
  for (const o of firstLines) {
    const ret = retBy.get(o.order_id);
    if (o.channel === 'Website') {
      if (o.status === 'cancelled' && R.chance(0.3)) add(o.date, 'Cancel order', o);
      if (o.status === 'rto' && R.chance(0.4)) add(addDays(o.date, R.int(2, 5)), 'Failed delivery (NDR)', o);
      if ((o.status === 'delivered' || o.status === 'returned') && R.chance(+o.delivery_days >= 5 ? 0.3 : isFestive(o.date) ? 0.06 : 0.03)) add(addDays(o.date, R.int(1, 3)), 'Where is my order (WISMO)', o);
      if (o.payment === 'cod' && o.status !== 'cancelled' && R.chance(0.015)) add(o.date, 'Change COD to prepaid', o);
      if (o.status === 'delivered' && R.chance(0.012)) add(addDays(o.date, R.int(3, 10)), 'Product usage question', o);
    } else if (!OFFLINE.has(o.channel) && R.chance(0.004)) add(addDays(o.date, R.int(2, 8)), 'Marketplace order escalation', o);
    if (ret && R.chance(o.channel === 'Website' ? 0.85 : 0.2))
      add(ret.date, /Damaged|Wrong item|missing/i.test(ret.reason) ? 'Damaged or leaking on arrival' : 'Return or refund request', o);
  }
  for (const d of DAYS) for (let k = R.pois(isFestive(d) ? 10 : 5); k > 0; k--) add(d, 'Product question (pre-sale)', null);
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  rows.forEach((r, i) => (r.ticket_id = 'TK' + String(i + 1).padStart(5, '0')));
  return rows;
}

// Cohorts: first non-cancelled order month x acquisition channel (same definition as kit metric cohort_retention).
function genCohorts() {
  const by = new Map();
  for (const o of firstLines.filter((x) => x.status !== 'cancelled')) {
    if (!by.has(o.customer_id)) by.set(o.customer_id, []);
    by.get(o.customer_id).push(o);
  }
  const rows = new Map();
  for (const [cid, os] of by) {
    const cohort = os.map((o) => o.date).sort()[0].slice(0, 7), ch = os[0].channel;
    const k = cohort + '|' + ch;
    const r = rows.get(k) || { cohort_month: cohort, acquisition_channel: ch, customers: 0, m1: 0, m2: 0, repeat_customers: 0, orders: 0, revenue: 0 };
    const ms = new Set(os.map((o) => o.date.slice(0, 7)));
    r.customers++; r.orders += os.length; r.repeat_customers += os.length >= 2 ? 1 : 0;
    r.m1 += ms.has(nextMonth(cohort)) ? 1 : 0; r.m2 += ms.has(nextMonth(nextMonth(cohort))) ? 1 : 0;
    r.revenue += sum(delivered.filter((l) => l.customer_id === cid), (l) => l.net_revenue);
    rows.set(k, r);
  }
  return [...rows.values()].sort((a, b) => (a.cohort_month + CHANNELS.indexOf(a.acquisition_channel)) < (b.cohort_month + CHANNELS.indexOf(b.acquisition_channel)) ? -1 : 1)
    .map((r) => ({ cohort_month: r.cohort_month, acquisition_channel: r.acquisition_channel, customers: r.customers,
      m1_retained: r.cohort_month < '2026-10' ? r.m1 : '', m1_pct: r.cohort_month < '2026-10' ? r1((100 * r.m1) / r.customers) : '',
      m2_retained: r.cohort_month < '2026-09' ? r.m2 : '', m2_pct: r.cohort_month < '2026-09' ? r1((100 * r.m2) / r.customers) : '',
      repeat_customers: r.repeat_customers, orders: r.orders, revenue: r.revenue, revenue_per_customer: round(r.revenue / r.customers) }));
}

// Vendors: suppliers + every opex vendor, with GSTIN, MSME (Udyam) category and the TDS section we deduct under.
const VENDOR_META = {
  S01: ['Himachal Pradesh', 'Small', '194C', 2], S02: ['Maharashtra', 'Medium', 'none', 0], S03: ['Tamil Nadu', 'Micro', 'none', 0], S04: ['Jammu and Kashmir', 'Micro', 'none', 0],
  S05: ['Gujarat', 'Small', 'none', 0], S06: ['Dadra and Nagar Haveli and Daman and Diu', 'Small', 'none', 0], S07: ['Maharashtra', 'Micro', 'none', 0], S08: ['Gujarat', 'Small', 'none', 0],
};
const SERVICE_META = [ // [vendor (= opex.vendor), city, state, msme, terms, tds section, rate]
  ['Office lease - Andheri East, Mumbai', 'Mumbai', 'Maharashtra', 'Not MSME', 0, '194I', 10], ['StackBox 3PL - Mumbai', 'Bhiwandi', 'Maharashtra', 'Medium', 30, '194C', 2],
  ['NCR Fulfil 3PL - Delhi', 'Delhi', 'Delhi', 'Small', 30, '194C', 2], ['Southline 3PL - Bangalore', 'Bangalore', 'Karnataka', 'Small', 30, '194C', 2],
  ['Shopify (plan and apps)', 'Ottawa', 'Foreign (Canada)', 'Not MSME', 0, 'none', 0], ['Shiprocket platform', 'Delhi', 'Delhi', 'Not MSME', 0, '194J', 2],
  ['GoKwik (checkout and COD verification)', 'Gurugram', 'Haryana', 'Not MSME', 15, '194J', 2], ['Interakt (WhatsApp marketing: plan + message charges)', 'Mumbai', 'Maharashtra', 'Not MSME', 0, '194J', 2],
  ['WATI (WhatsApp COD confirmation and NDR flows)', 'Bangalore', 'Karnataka', 'Small', 0, '194J', 2], ['Email and SMS', 'Bangalore', 'Karnataka', 'Small', 15, '194J', 2],
  ['Google Workspace', 'Gurugram', 'Haryana', 'Not MSME', 0, 'none', 0], ['Freshdesk (helpdesk, WhatsApp inbox, IVR)', 'Chennai', 'Tamil Nadu', 'Not MSME', 0, '194J', 2],
  ['Accounting and payroll software', 'Pune', 'Maharashtra', 'Small', 0, '194J', 2], ['Product shoot and UGC edits', 'Mumbai', 'Maharashtra', 'Micro', 15, '194J', 10],
  ['CA firm (books, GST, TDS filing)', 'Mumbai', 'Maharashtra', 'Micro', 15, '194J', 10], ['Legal and trademark', 'Mumbai', 'Maharashtra', 'Micro', 15, '194J', 10],
  ['Electricity, internet, housekeeping', 'Mumbai', 'Maharashtra', 'Micro', 15, '194C', 2], ['Team travel', 'Mumbai', 'Maharashtra', 'Not MSME', 0, 'none', 0],
  ['PR boxes and creator seeding', 'Mumbai', 'Maharashtra', 'Micro', 15, '194C', 2], ['Bank charges, ROC, stamp duty', 'Mumbai', 'Maharashtra', 'Not MSME', 0, 'none', 0],
  ['Job portal subscription', 'Noida', 'Uttar Pradesh', 'Not MSME', 0, '194J', 2], ['Group health insurance (quarterly)', 'Mumbai', 'Maharashtra', 'Not MSME', 0, 'none', 0],
  ['Health & Glow and Apollo shelf visibility', 'Bangalore', 'Karnataka', 'Not MSME', 30, '194C', 2], ['Export compliance (IEC, LUT, FDA listing)', 'Mumbai', 'Maharashtra', 'Micro', 15, '194J', 10],
];
const STATE_CODE = { ...GST_CODE, 'Himachal Pradesh': '02', 'Dadra and Nagar Haveli and Daman and Diu': '26' };
function fakeGstin(state, name) {
  if (!STATE_CODE[state]) return '';
  const h = hash(name), L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  const pan = 'AA' + 'CF'[h % 2] + L[(h >>> 3) % L.length] + name.replace(/[^A-Z]/gi, '').toUpperCase()[0] + String(1000 + (h % 9000)) + L[(h >>> 7) % L.length];
  return STATE_CODE[state] + pan + '1Z' + ((h >>> 11) % 10);
}
function genVendors() {
  const rows = SUPPLIERS.map((s) => { const [state, msme, sec, rate] = VENDOR_META[s.supplier_id];
    return { vendor_id: s.supplier_id, name: s.name, type: 'supplier', category: s.category, city: s.city, state, gstin: fakeGstin(state, s.name), msme_category: msme,
      payment_terms_days: s.payment_terms_days, tds_section: sec, tds_rate_pct: rate }; });
  SERVICE_META.forEach(([name, city, state, msme, terms, sec, rate], i) => rows.push({ vendor_id: 'V' + String(i + 1).padStart(2, '0'), name, type: 'service',
    category: opex.find((x) => x.vendor === name)?.category ?? '', city, state, gstin: fakeGstin(state, name), msme_category: msme, payment_terms_days: terms, tds_section: sec, tds_rate_pct: rate }));
  return rows;
}

// Compliance calendar: GST, TDS, PF, ESI, professional tax and ROC due dates, with the amount due computed from the files.
function genCompliance(gst, vendors) {
  const R = rng('compliance');
  const V = Object.fromEntries(vendors.map((v) => [v.name, v]));
  const rows = [];
  const add = (due_date, filing, authority, period, gstin_state, amount, note = '') => rows.push({ due_date, filing, authority, period, gstin_state, amount, note });
  for (const m of MONTHS) {
    const n = nextMonth(m), pr = payrollFor(m);
    for (const g of gst.filter((x) => x.month === m)) {
      add(n + '-11', 'GSTR-1 (outward supplies)', 'GSTN', m, g.state, '', 'Invoice-wise B2C/B2B and HSN 3304 summary');
      add(n + '-20', 'GSTR-3B (pay GST)', 'GSTN', m, g.state, g.cash_payable, 'Cash payable after ITC and marketplace TCS (gst_monthly.csv)');
    }
    add(n + '-07', 'TDS payment - salaries (sec 192)', 'Income Tax (challan 281)', m, '', sum(pr, (p) => p.tds));
    const vendorTds = round(sum(opex.filter((x) => x.month === m), (x) => (x.amount * (V[x.vendor]?.tds_rate_pct ?? 0)) / 100)
      + sum(posts.filter((p) => p.date.startsWith(m)), (p) => p.fee_paid * 0.1)
      + sum(pos.filter((p) => p.date.startsWith(m) && p.material_id.startsWith('JW')), (p) => p.total * 0.02));
    add(n + '-07', 'TDS payment - vendors and creators (194C/194J/194I)', 'Income Tax (challan 281)', m, '', vendorTds, '194J 10% on creator fees, 194C 2% on contract manufacturing');
    add(n + '-15', 'PF ECR and payment', 'EPFO', m, '', sum(pr, (p) => p.pf_employee + p.pf_employer), 'Employee 12% + employer 12% of basic (capped at Rs 15,000)');
    add(n + '-15', 'ESI contribution', 'ESIC', m, '', sum(pr, (p) => p.esi_employee + p.esi_employer), 'Employees with gross up to Rs 21,000: 0.75% + 3.25%');
    add(monthEnd(m), 'Professional tax', 'Maharashtra (Mahakosh)', m, 'Maharashtra', sum(pr.filter((p) => p.state === 'Maharashtra'), (p) => p.professional_tax));
    add(n + '-20', 'Professional tax', 'Karnataka (PT portal)', m, 'Karnataka', sum(pr.filter((p) => p.state === 'Karnataka'), (p) => p.professional_tax));
  }
  add('2026-10-30', 'AOC-4 (FY 2025-26 financial statements)', 'MCA', 'FY 2025-26', '', '', 'AGM held 30 Sep 2026');
  add('2026-10-31', 'TDS returns 24Q + 26Q (Q2: Jul-Sep)', 'Income Tax (TRACES)', '2026-Q2', '', '');
  add('2026-10-31', 'MSME-1 (dues to micro and small vendors over 45 days)', 'MCA', 'Apr-Sep 2026', '', '', 'Nil return: every MSME vendor paid within 45 days (sec 43B(h))');
  add('2026-11-29', 'MGT-7 (annual return)', 'MCA', 'FY 2025-26', '', '');
  add('2026-12-15', 'Advance tax (Q3 instalment)', 'Income Tax', 'FY 2026-27', '', 0, 'Loss-making: nil');
  add('2026-12-31', 'GSTR-9 (annual GST return)', 'GSTN', 'FY 2025-26', 'Maharashtra; Delhi; Karnataka', '');
  add('2027-01-31', 'TDS returns 24Q + 26Q (Q3: Oct-Dec)', 'Income Tax (TRACES)', '2026-Q3', '', '');
  rows.sort((a, b) => (a.due_date + a.filing + a.gstin_state < b.due_date + b.filing + b.gstin_state ? -1 : 1));
  for (const r of rows) {
    if (r.due_date > '2026-10-31') { r.status = 'upcoming'; r.filed_on = ''; r.late_fee = ''; continue; }
    const late = r.filing.startsWith('GSTR-3B') && r.gstin_state === 'Karnataka' && r.period === '2026-08'; // the one slip: filed 2 days late
    r.status = late ? 'filed late' : 'filed';
    r.filed_on = addDays(r.due_date, late ? 2 : -R.int(0, 4));
    r.late_fee = late ? 200 : 0; // Rs 50 CGST + Rs 50 SGST per day of delay
  }
  return rows;
}

const cities = genCities();
const festive = genFestive();
const gstMonthly = genGst();
const settlements = genSettlements();
const qcInventory = genQcInventory();
const reviews = genReviews();
const tickets = genTickets();
const cohorts = genCohorts();
const vendors = genVendors();
const compliance = genCompliance(gstMonthly, vendors);

// ---------- write ----------
const C = {
  orders: ['order_id', 'date', 'channel', 'region', 'city', 'warehouse', 'sku', 'qty', 'mrp', 'discount_pct', 'gross_revenue', 'net_revenue', 'payment', 'status', 'customer_id', 'coupon', 'courier', 'zone', 'delivery_days', 'shipping_cost', 'channel_fee', 'state', 'pincode', 'payment_method', 'gst', 'tax_type'],
  channel_fees: ['channel', 'type', 'commission_pct', 'fixed_fee', 'shipping_fee', 'payment_gateway_pct', 'settlement_days', 'notes', 'channel_group', 'tcs_pct', 'tds_pct', 'gst_on_fees_pct'],
  customers: ['customer_id', 'first_order_date', 'city', 'region', 'acquisition_channel', 'orders', 'total_spend', 'last_order_date', 'city_tier', 'acquired_by', 'state', 'pincode'],
  returns: ['order_id', 'date', 'sku', 'channel', 'reason', 'refund', 'restockable', 'qty'],
  meta_ads_daily: ['date', 'campaign', 'adset', 'ad', 'creative_type', 'spend', 'impressions', 'clicks', 'add_to_cart', 'purchases', 'revenue', 'language'],
  google_ads_daily: ['date', 'campaign', 'type', 'spend', 'impressions', 'clicks', 'conversions', 'revenue'],
  marketplace_ads_daily: ['date', 'platform', 'campaign', 'spend', 'clicks', 'orders', 'revenue', 'ad_type'],
  creators: ['handle', 'platform', 'followers', 'engagement_pct', 'avg_views', 'fee_reel', 'fee_story', 'niche', 'city', 'language', 'fake_follower_pct', 'name', 'tier', 'past_brand_roas'],
  creator_posts: ['post_id', 'handle', 'date', 'format', 'views', 'likes', 'comments', 'link_clicks', 'coupon_code', 'orders', 'revenue', 'fee_paid', 'platform', 'barter', 'roas', 'language'],
  suppliers: ['supplier_id', 'name', 'city', 'category', 'payment_terms_days', 'rating'],
  raw_materials: ['material_id', 'name', 'unit', 'unit_cost', 'supplier_id', 'moq', 'lead_time_days', 'stock', 'monthly_usage', 'last_po_cost'],
  bom: ['sku', 'material_id', 'qty_per_unit'],
  purchase_orders: ['po_id', 'date', 'supplier_id', 'material_id', 'qty', 'unit_cost', 'total', 'expected_date', 'received_date', 'status', 'payment_due'],
  inventory_snapshot: ['date', 'warehouse', 'sku', 'on_hand', 'in_transit', 'reserved', 'shipped_week', 'received_week'],
  couriers: ['courier', 'zone', 'cost_per_order', 'cod_fee', 'avg_delivery_days', 'rto_pct', 'orders', 'cod_share_pct'],
  employees: ['emp_id', 'name', 'dept', 'role', 'level', 'city', 'join_date', 'ctc_annual', 'basic_monthly', 'hra_monthly', 'special_monthly', 'pf_employer_monthly', 'variable_pct', 'gender', 'state', 'esi_employer_monthly'],
  payroll_2026_10: ['emp_id', 'month', 'gross', 'pf_employee', 'professional_tax', 'tds', 'net_pay', 'pf_employer', 'employer_cost', 'name', 'dept', 'esi_employee', 'esi_employer'],
  opex: ['month', 'category', 'vendor', 'amount'],
  pnl_monthly: ['month', 'gross_revenue', 'discounts', 'returns', 'net_revenue', 'cogs', 'channel_fees', 'shipping', 'marketing', 'salaries', 'opex', 'ebitda', 'orders', 'units', 'new_customers', 'meta_ads', 'google_ads', 'marketplace_ads', 'creator_fees', 'ebitda_pct', 'marketing_pct'],
  cities: ['city', 'state', 'region', 'tier', 'pincode', 'gst_state_code', 'is_metro', 'home_warehouse', 'zone_from_mumbai', 'zone_from_delhi', 'zone_from_bangalore', 'quick_commerce', 'offline_stores'],
  festive_calendar: ['event', 'start_date', 'end_date', 'type', 'focus_states', 'platforms', 'status', 'observed_uplift_x', 'expected_uplift_x', 'note'],
  gst_monthly: ['month', 'gstin', 'state', 'hsn', 'taxable_value', 'cgst', 'sgst', 'igst', 'output_gst', 'itc_on_fees', 'itc_on_marketing', 'itc_on_purchases', 'itc_on_opex', 'itc_total', 'itc_opening', 'itc_closing', 'tcs_credit', 'cash_payable', 'gstr1_due', 'gstr3b_due'],
  settlements: ['settlement_id', 'channel', 'payer', 'cycle_start', 'cycle_end', 'settlement_date', 'orders', 'gross_sales', 'fees', 'shipping', 'gst_on_fees', 'tcs', 'tds', 'net_payout', 'status'],
  qc_inventory: ['date', 'platform', 'city', 'sku', 'dark_stores', 'in_stock_stores', 'on_hand', 'units_sold_week', 'days_of_cover', 'availability_pct'],
  reviews: ['month', 'platform', 'sku', 'ratings', 'avg_rating', 'five_star', 'four_star', 'three_star', 'two_star', 'one_star', 'reviews_with_text', 'top_praise', 'top_complaint'],
  support_tickets: ['ticket_id', 'date', 'channel', 'order_id', 'sales_channel', 'category', 'language', 'first_response_mins', 'resolution_hours', 'status', 'csat', 'handled_by'],
  whatsapp_campaigns: ['campaign_id', 'date', 'bsp', 'flow', 'category', 'audience', 'language', 'sent', 'delivered', 'read', 'clicked', 'orders', 'revenue', 'cost'],
  cohort_retention: ['cohort_month', 'acquisition_channel', 'customers', 'm1_retained', 'm1_pct', 'm2_retained', 'm2_pct', 'repeat_customers', 'orders', 'revenue', 'revenue_per_customer'],
  vendors: ['vendor_id', 'name', 'type', 'category', 'city', 'state', 'gstin', 'msme_category', 'payment_terms_days', 'tds_section', 'tds_rate_pct'],
  compliance_calendar: ['due_date', 'filing', 'authority', 'period', 'gstin_state', 'amount', 'status', 'filed_on', 'late_fee', 'note'],
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
for (const [f, rows] of [['cities', cities], ['festive_calendar', festive], ['gst_monthly', gstMonthly], ['settlements', settlements], ['qc_inventory', qcInventory],
  ['reviews', reviews], ['support_tickets', tickets], ['whatsapp_campaigns', whatsapp], ['cohort_retention', cohorts], ['vendors', vendors], ['compliance_calendar', compliance]])
  writeCsv(f + '.csv', C[f], rows);

const oct = pnl[2];
const policy = {
  brand: 'Kesar & Co.',
  as_of: '2026-10-31',
  max_marketing_pct_of_net_revenue: 25,
  max_marketing_pct_of_net_revenue_sale_period: 30,
  min_monthly_ebitda: -500000, // loss budget while the brand opens marketplaces, quick commerce and offline
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
  lines.push(`- **October payroll**: ${pr.length} people paid, gross ${inr(sum(pr, (p) => p.gross))}, net pay ${inr(sum(pr, (p) => p.net_pay))}, employee PF ${inr(sum(pr, (p) => p.pf_employee))}, TDS ${inr(sum(pr, (p) => p.tds))}, PT ${inr(sum(pr, (p) => p.professional_tax))}; employer cost (gross + employer PF + employer ESI) ${inr(sum(pr, (p) => p.employer_cost))} = P&L salaries. Headcount ${employees.length}; ${employees.filter((e) => e.join_date > '2026-10-01').length} joining after Oct.`);
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

// India / platform story numbers
function indiaStories() {
  const lines = [];
  const pct = (a, b) => r1((100 * a) / b);
  const octDel = delivered.filter((o) => o.date.startsWith('2026-10'));
  const grp = {}; for (const o of octDel) { const g = FEE[o.channel].channel_group; grp[g] = (grp[g] || 0) + o.net_revenue; }
  const octNet = sum(octDel, (o) => o.net_revenue);
  lines.push(`- **October channel mix (delivered revenue)**: ${Object.entries(grp).sort((a, b) => b[1] - a[1]).map(([g, v]) => `${g} ${pct(v, octNet)}%`).join(', ')}. Quick commerce = Blinkit, Zepto, Instamart, BB Now, Flipkart Minutes.`);
  const qcCh = [...QC].map((c) => [c, sum(octDel.filter((o) => o.channel === c), (o) => o.net_revenue)]).sort((a, b) => b[1] - a[1]);
  lines.push(`- **Quick commerce October**: ${qcCh.map(([c, v]) => `${c} ${inr(v)}`).join(', ')}.`);
  const live = firstLines.filter((o) => o.status !== 'cancelled');
  const rt = (f) => { const os = live.filter(f); return pct(os.filter((o) => o.status === 'rto').length, os.length); };
  lines.push(`- **RTO by city tier (all channels)**: tier 1 ${rt((o) => CITY[o.city].tier === 1)}%, tier 2 ${rt((o) => CITY[o.city].tier === 2)}%, tier 3 ${rt((o) => CITY[o.city].tier === 3)}%. Meesho RTO ${rt((o) => o.channel === 'Meesho')}% with ${pct(live.filter((o) => o.channel === 'Meesho' && o.payment === 'cod').length, live.filter((o) => o.channel === 'Meesho').length)}% COD.`);
  const st = {}; for (const o of live) if (o.region !== 'International') st[o.state] = (st[o.state] || 0) + 1;
  lines.push(`- **Top states by orders**: ${Object.entries(st).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s, n]) => `${s} ${n.toLocaleString('en-IN')}`).join(', ')}; East (Kolkata, Patna, Guwahati...) ships from Delhi.`);
  const webPre = live.filter((o) => o.channel === 'Website' && o.payment === 'prepaid');
  const pm = {}; for (const o of webPre) pm[o.payment_method] = (pm[o.payment_method] || 0) + 1;
  lines.push(`- **Website prepaid instruments**: ${Object.entries(pm).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${pct(n, webPre.length)}%`).join(', ')} (Simpl + LazyPay = BNPL).`);
  const g10 = gstMonthly.filter((g) => g.month === '2026-10');
  lines.push(`- **GST October (HSN 3304, 18%)**: output ${inr(sum(g10, (g) => g.output_gst))}, ITC ${inr(sum(g10, (g) => g.itc_total))}, marketplace TCS ${inr(sum(g10, (g) => g.tcs_credit))}; cash payable ${g10.map((g) => `${g.state} ${inr(g.cash_payable)}`).join(', ')} (GSTR-3B due 2026-11-20). Maharashtra carries ${inr(g10.find((g) => g.state === 'Maharashtra').itc_closing)} unused ITC: credit cannot move between GSTINs.`);
  const pend = settlements.filter((s) => s.status === 'pending');
  const pc = {}; for (const s of pend) pc[s.channel] = (pc[s.channel] || 0) + s.net_payout;
  lines.push(`- **Receivables on 2026-10-31 (settlements not yet paid)**: ${inr(sum(pend, (s) => s.net_payout))}; biggest ${Object.entries(pc).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, v]) => `${c} ${inr(v)}`).join(', ')}.`);
  const lowQc = qcInventory.filter((r) => r.date === '2026-10-31').sort((a, b) => a.availability_pct - b.availability_pct).slice(0, 3);
  lines.push(`- **Dark-store availability on 2026-10-31 (lowest)**: ${lowQc.map((r) => `${r.platform} ${r.city} ${r.sku} ${r.availability_pct}% (${r.in_stock_stores}/${r.dark_stores} stores)`).join('; ')}.`);
  const rp = {}; for (const r of reviews) { rp[r.platform] ??= [0, 0]; rp[r.platform][0] += r.avg_rating * r.ratings; rp[r.platform][1] += r.ratings; }
  const rr = Object.entries(rp).filter(([, [, n]]) => n >= 30).map(([p, [s, n]]) => [p, r2(s / n), n]).sort((a, b) => b[1] - a[1]);
  lines.push(`- **Ratings (quarter, weighted)**: platforms with 30+ ratings: best ${rr[0][0]} ${rr[0][1]}, worst ${rr.at(-1)[0]} ${rr.at(-1)[1]}; ${sum(reviews, (r) => r.ratings).toLocaleString('en-IN')} new ratings in all.`);
  const tc = {}; for (const t of tickets) tc[t.category] = (tc[t.category] || 0) + 1;
  const cs = tickets.filter((t) => t.csat !== '');
  lines.push(`- **Support**: ${tickets.length.toLocaleString('en-IN')} tickets (${pct(tickets.filter((t) => t.channel === 'WhatsApp').length, tickets.length)}% WhatsApp); top ${Object.entries(tc).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, n]) => `"${k}" ${n}`).join(', ')}; CSAT ${r2(sum(cs, (t) => t.csat) / cs.length)}/5.`);
  const cart = whatsapp.filter((w) => w.flow === 'Abandoned cart recovery');
  lines.push(`- **WhatsApp**: ${whatsapp.length} campaigns/flows, message cost ${inr(sum(whatsapp, (w) => w.cost))}; abandoned-cart flow ${inr(sum(cart, (w) => w.revenue))} revenue on ${inr(sum(cart, (w) => w.cost))} (${r2(sum(cart, (w) => w.revenue) / sum(cart, (w) => w.cost))}x).`);
  const aug = cohorts.find((c) => c.cohort_month === '2026-08' && c.acquisition_channel === 'Website');
  lines.push(`- **Cohorts**: August website cohort ${aug.customers.toLocaleString('en-IN')} customers, ${aug.m1_pct}% bought again in September, ${aug.m2_pct}% in October.`);
  const fx = festive.filter((f) => f.status === 'past').sort((a, b) => b.observed_uplift_x - a.observed_uplift_x).slice(0, 3);
  lines.push(`- **Festive uplift (booked revenue/day vs quarter average, same scope)**: ${fx.map((f) => `${f.event} ${f.observed_uplift_x}x`).join(', ')}. Next: Diwali sale 2026-11-01..11-08.`);
  const p10 = payroll;
  lines.push(`- **ESI**: ${p10.filter((p) => p.esi_employee > 0).length} warehouse associates under ₹21,000 gross; October ESI ${inr(sum(p10, (p) => p.esi_employee + p.esi_employer))} (0.75% + 3.25%).`);
  const nov = compliance.filter((c) => c.due_date.startsWith('2026-11') && c.amount !== '');
  lines.push(`- **Compliance due in November 2026**: ${nov.length} payments worth ${inr(sum(nov, (c) => +c.amount))}; ${vendors.filter((v) => ['Micro', 'Small'].includes(v.msme_category)).length} MSME (micro/small) vendors must be paid within 45 days.`);
  return lines.join('\n');
}

const README = `# Sample brand data: Kesar & Co.

Everything here is **made-up but realistic** sample data for Kesar & Co., an Indian skincare D2C brand (₹4 Cr a year run rate,
5 SKUs, 3 warehouses with a GSTIN each, 18 sales channels, 28 people). History window **2026-08-01 to 2026-10-31**. Money is INR rupees
(integers unless the column says otherwise). Contract: \`contracts/data-catalog.md\`. Background on how Indian D2C works: \`docs/d2c-primer.md\`.

- Frozen v1 files (do not edit): products, past_sales, regions, warehouses, channels, meta_campaigns, influencers, budget.json.
- Generated v2 files: rebuild with \`npm run data\` (seeded, byte-for-byte deterministic). Verify with \`npm run data:check\`.
- Never edit a generated file by hand; change \`data/gen/generate.mjs\` and regenerate.

**Sales channels** (\`channel_fees.channel_group\`): D2C website (Shopify + Razorpay, COD via Shiprocket); marketplaces Amazon, Flipkart,
Myntra, Meesho, JioMart, AJIO; beauty marketplaces Nykaa, Purplle, Tata CLiQ (Palette); quick commerce Blinkit, Zepto, Instamart
(Swiggy), BB Now (BigBasket), Flipkart Minutes; offline modern trade Health & Glow, Apollo Pharmacy; export Amazon Global.

## Story numbers (computed by the generator, exact)

${stories()}

## India and platform story numbers

${indiaStories()}

## How the files tie together

- \`orders.csv\` has **one row per order line** (order_id repeats for multi-SKU orders). \`status\` is per line: an order is
  cancelled or RTO as a whole; a customer return marks one line \`returned\`. Order-level shipping sits on the order's **first line**.
- \`orders.channel_fee\` = commission_pct x net_revenue + fixed_fee + payment_gateway_pct x net_revenue (prepaid only) for delivered
  lines; RTO/returned lines keep only fixed_fee + gateway fee; cancelled = 0 (rates from \`channel_fees.csv\`). Fees are ex-GST; the 18% GST
  on them is input tax credit (\`gst_monthly.itc_on_fees\`), not a cost.
- \`orders.shipping_cost\` (first line only): Website = courier rate for the zone (\`couriers.csv\`) + COD fee if COD and not RTO,
  plus the same rate again if the order was RTO or had a return. Other channels = \`channel_fees.shipping_fee\`, doubled on RTO/return.
- Prices are **GST-inclusive** (MRP). \`orders.gst\` = 18/118 of net_revenue on delivered domestic lines (HSN 3304); \`tax_type\` CGST+SGST when the
  buyer's state = the shipping warehouse's state (Mumbai = Maharashtra, Delhi = Delhi, Bangalore = Karnataka), else IGST; exports zero-rated (LUT).
  Revenue in the P&L stays GST-inclusive, as most Indian D2C dashboards show it.
- \`returns.csv\` has one row per returned line; \`refund\` = that line's net_revenue.
- \`pnl_monthly.csv\` (by order month): gross_revenue = sum of gross on non-cancelled lines; discounts = gross - net; returns = net of
  RTO + returned lines; net_revenue = gross - discounts - returns; cogs = products.cogs x qty for delivered lines + returned lines that
  are not restockable; channel_fees and shipping = sums of the order columns; marketing = Meta + Google + marketplace ads spend (by
  date) + creator fee_paid (by post date); salaries = basic + HRA + special + employer PF + employer ESI for employees whose join_date is on
  or before the 1st of the month (variable pay is paid annually in April, not accrued); opex = opex.csv (WhatsApp message charges sit in the
  Interakt and WATI lines). ebitda = net_revenue - everything else.
- \`creator_posts.orders/revenue\` = non-cancelled website orders that used that post's \`coupon_code\` (net revenue, booked).
  Coupon codes are unique per post and attribution runs 7 days from the post date.
- \`meta_ads_daily.csv\` summed over 2026-10-02..2026-10-31 by campaign equals \`meta_campaigns.csv\` spend and revenue exactly.
  Meta revenue is Meta-attributed (7-day click, 1-day view) and overlaps with website, Google and creator revenue - do not add them up.
  The same goes for marketplace ads and WhatsApp revenue.
- \`inventory_snapshot.csv\` is weekly (Saturdays). on_hand(prev week) = on_hand + shipped_week - received_week. The 2026-10-31 rows equal
  the stock columns in \`products.csv\` exactly. in_transit = finished goods that land in the following week. Quick-commerce dark-store stock is
  the platforms' own (\`qc_inventory.csv\`), already counted as shipped from our warehouses.
- \`bom.csv\`: sum of qty_per_unit x the material's base cost equals products.cogs (the JW0x line is the contract manufacturer's
  conversion charge). raw_materials.unit_cost is the standard cost; last_po_cost is the latest PO price (saffron and vitamin C have crept up).
- \`payroll_2026_10.csv\`: gross = basic + HRA + special; pf_employee = 12% of min(basic, 15000); ESI when gross <= ₹21,000: employee 0.75%,
  employer 3.25% (rounded up); professional tax: Maharashtra ₹200 (women earning up to ₹25,000 exempt), Karnataka ₹200 if gross >= ₹25,000,
  Delhi none; TDS = new regime (₹75,000 standard deduction, slabs 0/5/10/15/20/25/30 at 4/8/12/16/20/24 L, 87A rebate to ₹12 L taxable with
  marginal relief, 4% cess) on gross x 12, divided by 12. net_pay = gross - pf_employee - esi_employee - professional_tax - tds;
  employer_cost = gross + pf_employer + esi_employer.
- \`customers.csv\`: customer_id is per channel (marketplaces do not share buyer identity, so the same person on Amazon and the website is two
  ids; offline buyers are one walk-in id per bill). orders = all orders incl. cancelled; total_spend = net revenue of delivered lines.
- \`gst_monthly.csv\`: per month x GSTIN. output_gst = sum of orders.gst shipped from that state; ITC = 18% of channel fees + shipping (that
  GSTIN) + ads, GST-registered creators (100k+ followers), received POs (5% saffron/botanicals, else 18%) and head-office opex (Maharashtra);
  blocked credits (insurance, travel, gifting, foreign SaaS) excluded. itc_closing rolls into next month's itc_opening; cash_payable =
  max(0, output - ITC available) - TCS credit (0.5% of taxable value sold through e-commerce operators), floored at 0.
- \`settlements.csv\`: one row per platform payout cycle (weekly; offline monthly) by order date. gross_sales = delivered net revenue,
  fees/shipping = the order columns, gst_on_fees = 18%, TCS 0.5% and TDS 0.1% (sec 194-O) of taxable value; net_payout = gross - all of
  those; settlement_date = cycle end + settlement_days; status pending if after 2026-10-31.
- \`qc_inventory.csv\`: units_sold_week = that platform's non-cancelled units in the city in the 7 days to the snapshot date;
  days_of_cover = on_hand / (units_sold_week / 7); availability_pct = in_stock_stores / dark_stores.
- \`cohort_retention.csv\` uses the same definition as \`kit metric cohort_retention\` (first non-cancelled order month).
- \`compliance_calendar.csv\` amounts come from the files: GSTR-3B = gst_monthly.cash_payable, TDS/PF/ESI/PT from the payroll of that month,
  vendor TDS from opex x vendors.tds_rate_pct + 10% of creator fees (194J) + 2% of job-work POs (194C).

## Data dictionary

${Object.entries({
  'orders.csv': 'Order lines. coupon = creator coupon (website only); courier; zone A local, B regional, C metro-metro, D rest of India, E Kerala/J&K/North-East, INTL export; delivery_days for delivered/returned lines; shipping_cost; channel_fee; state and pincode of the buyer; payment_method (UPI, Card, Netbanking, Simpl, LazyPay, BNPL, Wallet, Cash, COD); gst inside net_revenue; tax_type.',
  'channel_fees.csv': 'Fee card per sales channel: commission %, fixed fee per line, shipping fee per order, payment gateway % (website prepaid), settlement days, notes, channel_group (D2C, Marketplace, Beauty marketplace, Quick commerce, Offline retail, Export), TCS % and TDS % the platform withholds, GST % on fees.',
  'customers.csv': 'One row per customer id: first order date, city, region, acquisition channel, orders, total_spend, last_order_date, city_tier (1 metro/tier-1, 2, 3), acquired_by (creator coupon of first order, if any), state, pincode.',
  'returns.csv': 'Customer returns after delivery: return date, reason, refund, restockable (yes/no), qty. RTO is not here; it is orders.status = rto.',
  'meta_ads_daily.csv': 'Meta (Facebook/Instagram) ads per day per ad: spend, impressions, clicks, add_to_cart, purchases, revenue (Meta-attributed), creative language.',
  'google_ads_daily.csv': 'Google Ads per day per campaign. type: search, shopping, performance_max, video (YouTube), demand_gen.',
  'marketplace_ads_daily.csv': 'Marketplace and quick-commerce ads per day per campaign (platform-attributed): Amazon Sponsored Products/Brands/Display, Flipkart PLA/PCA, Nykaa, Myntra, Purplle, Meesho, Blinkit, Zepto, Instamart. ad_type.',
  'creators.csv': 'Creator roster (8 from influencers.csv + 30 more + 12 regional-language creators on Instagram, YouTube, ShareChat, Moj, Josh). fee_reel/fee_story in ₹ per deliverable, fake_follower_pct from audit, tier nano/micro/mid/macro/mega, past_brand_roas only for v1 creators.',
  'creator_posts.csv': 'Every creator post Aug-Oct: views, likes, comments, link clicks, coupon_code, attributed orders/revenue, fee_paid (0 = barter), roas = revenue / fee_paid, language.',
  'suppliers.csv': 'Suppliers: contract manufacturer, chemicals, botanicals, saffron, packaging. payment_terms_days (0 = advance), rating out of 5.',
  'raw_materials.csv': 'Materials with unit, standard unit_cost, last_po_cost, supplier, MOQ, lead time, stock on hand (2026-10-31), monthly_usage at average demand.',
  'bom.csv': 'Bill of materials: qty of each material per finished unit.',
  'purchase_orders.csv': 'POs Aug-early Nov. status: received, received_late, in_transit, delayed (past expected date, not received), open. payment_due = received (or expected) + supplier terms.',
  'inventory_snapshot.csv': 'Weekly finished-goods stock per warehouse and SKU with shipped_week and received_week.',
  'couriers.csv': 'Rate card per courier and zone for website orders (via Shiprocket: Delhivery, Xpressbees, Blue Dart, Shadowfax, Ekart, Ecom Express, DTDC, India Post) plus observed rto_pct, avg_delivery_days, orders and cod_share_pct over the quarter.',
  'employees.csv': '28 people. ctc_annual includes variable pay; monthly fixed = basic + HRA + special + employer PF + employer ESI. gender is used only for Maharashtra professional tax.',
  'payroll_2026_10.csv': 'October 2026 payroll for everyone who had joined by 2026-10-01, with ESI.',
  'opex.csv': 'Monthly operating expenses by category and vendor (rent, 3PL warehousing, software incl. WhatsApp BSPs, creative, professional fees, trade marketing, etc.).',
  'pnl_monthly.csv': 'Monthly P&L computed from the files above, plus orders, units, new_customers, the marketing split, ebitda_pct and marketing_pct.',
  'finance_policy.json': 'Rules Finance enforces: marketing % cap, EBITDA floors, max CAC, cash floor and approval limits.',
  'cities.csv': '55 Indian cities: state, region, tier, base pincode, GST state code, metro flag, home warehouse, courier zone from each warehouse, quick-commerce platforms and offline chains present.',
  'festive_calendar.csv': 'Festivals and platform sales Aug 2026-Mar 2027 (Onam, Navratri, Durga Puja, Diwali, Pongal, Holi, Eid, wedding season, Big Billion Days, Great Indian Festival, Pink Friday, EORS...): focus states, platforms, observed uplift (past) and expected uplift (upcoming).',
  'gst_monthly.csv': 'GST per month per GSTIN (Maharashtra, Delhi, Karnataka): taxable value, CGST/SGST/IGST, ITC by source, ITC carried forward, marketplace TCS credit, cash payable, GSTR-1 and GSTR-3B due dates.',
  'settlements.csv': 'Payouts per platform cycle: gross sales, fees, shipping, GST on fees, TCS, TDS, net payout, settlement date, paid/pending.',
  'qc_inventory.csv': 'Quick-commerce dark-store stock per Saturday x platform x city x SKU: dark stores listing us, stores in stock, units, units sold that week, days of cover, availability %.',
  'reviews.csv': 'New ratings per month x platform x SKU: star counts, average rating, written reviews, top praise and top complaint.',
  'support_tickets.csv': 'Customer support tickets (WhatsApp, email, IVR, Instagram DM): category, language, first response (minutes), resolution (hours), status, CSAT 1-5, who handled it.',
  'whatsapp_campaigns.csv': 'WhatsApp broadcasts and automated flows (Interakt marketing, WATI utility): sent, delivered, read, clicked, orders, revenue, cost at Meta per-message rates.',
  'cohort_retention.csv': 'Acquisition cohorts (first non-cancelled order month x channel): customers, retained in month +1 / +2, repeat customers, orders, revenue.',
  'vendors.csv': 'Every supplier and service vendor: state, GSTIN, MSME (Udyam) category, payment terms, TDS section and rate.',
  'compliance_calendar.csv': 'Statutory due dates Aug 2026-Jan 2027: GSTR-1/3B per GSTIN, TDS, PF, ESI, professional tax, ROC; amount, status, filed_on, late fee.',
}).map(([f, d]) => `- **${f}**: ${d}`).join('\n')}
`;
writeFile('README.md', README);

if (!process.argv[2]) {
  console.log(`orders ${orders.length} lines, ${ORDERS_BY_ID.size} orders, customers ${customers.length}, posts ${posts.length}, POs ${pos.length}`);
  for (const p of pnl) console.log(p.month, 'net', p.net_revenue, 'mkt', p.marketing, 'sal', p.salaries, 'opex', p.opex, 'ebitda', p.ebitda, p.ebitda_pct + '%');
}
