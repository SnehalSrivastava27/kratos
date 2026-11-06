// GET /api/kpis (contracts/api.md v4): headline numbers of the demo brand from data/*.csv (made-up data, no chats).
// v2 files (contracts/data-catalog.md, task R1) when present; otherwise the v1 files give what they can (Meta ROAS).
// Cached until a source file's mtime changes.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

type Row = Record<string, string>;
const FILES = ["orders.csv", "products.csv", "meta_ads_daily.csv", "google_ads_daily.csv", "marketplace_ads_daily.csv", "pnl_monthly.csv", "meta_campaigns.csv"];

/** RFC 4180-ish: quoted fields, "" escapes, CRLF. Rows as header → value. */
export function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let row: string[] = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c !== '"') f += c;
      else if (text[i + 1] === '"') (f += '"'), i++;
      else q = false;
    } else if (c === '"') q = true;
    else if (c === ",") row.push(f), (f = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f), rows.push(row), (row = []), (f = "");
    } else f += c;
  }
  if (f || row.length) row.push(f), rows.push(row);
  const [head = [], ...rest] = rows;
  return rest.filter((r) => r.length > 1 || r[0]).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const sum = (rows: Row[], col: string) => rows.reduce((a, r) => a + num(r[col]), 0);
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;
const pct = (part: number, whole: number) => (whole ? round((100 * part) / whole, 1) : null);
const ratio = (a: number, b: number) => (b ? round(a / b, 2) : null);

export function computeKpis(dir: string, mtimes: Record<string, number>) {
  const read = (f: string) => (mtimes[f] !== undefined ? parseCsv(readFileSync(join(dir, f), "utf8")) : null);
  const updated = Math.round(Math.max(0, ...Object.values(mtimes))) || null;
  const meta = read("meta_ads_daily.csv") ?? read("meta_campaigns.csv"); // v1 fallback: same spend/revenue columns
  const out = {
    updated, window: { from: null as string | null, to: null as string | null }, net_revenue: null as number | null, orders: null as number | null,
    aov: null as number | null, rto_pct: null as number | null, return_pct: null as number | null,
    meta_roas: meta ? ratio(sum(meta, "revenue"), sum(meta, "spend")) : null, blended_roas: null as number | null, ebitda_last_month: null as number | null,
    by_channel: [] as { channel: string; orders: number; net_revenue: number; rto_pct: number | null }[],
    top_skus: [] as { sku: string; name: string; units: number; net_revenue: number }[],
  };
  const pnl = read("pnl_monthly.csv");
  if (pnl?.length) out.ebitda_last_month = round(num([...pnl].sort((a, b) => a.month.localeCompare(b.month)).at(-1)!.ebitda));
  const orders = read("orders.csv");
  if (!orders?.length) return out;

  // An order may span lines (one per SKU). Orders = distinct ids not cancelled; revenue = delivered lines only.
  const dates = orders.map((o) => o.date).filter(Boolean).sort();
  out.window = { from: dates[0] ?? null, to: dates.at(-1) ?? null };
  const delivered = orders.filter((o) => o.status === "delivered");
  const ids = (rows: Row[]) => new Set(rows.map((o) => o.order_id)).size;
  const placed = orders.filter((o) => o.status !== "cancelled");
  const net = sum(delivered, "net_revenue");
  out.net_revenue = round(net);
  out.orders = ids(placed);
  out.aov = ids(delivered) ? round(net / ids(delivered)) : null;
  out.rto_pct = pct(ids(placed.filter((o) => o.status === "rto")), out.orders);
  out.return_pct = pct(ids(placed.filter((o) => o.status === "returned")), out.orders);
  const spend = ["meta_ads_daily.csv", "google_ads_daily.csv", "marketplace_ads_daily.csv"].reduce((a, f) => a + sum(read(f) ?? [], "spend"), 0);
  out.blended_roas = ratio(net, spend);

  const group = (key: string) => {
    const m = new Map<string, Row[]>();
    for (const o of orders) m.get(o[key])?.push(o) ?? m.set(o[key], [o]);
    return m;
  };
  out.by_channel = [...group("channel")].map(([channel, rows]) => {
    const p = rows.filter((o) => o.status !== "cancelled");
    return { channel, orders: ids(p), net_revenue: round(sum(rows.filter((o) => o.status === "delivered"), "net_revenue")), rto_pct: pct(ids(p.filter((o) => o.status === "rto")), ids(p)) };
  }).sort((a, b) => b.net_revenue - a.net_revenue);
  const names = new Map((read("products.csv") ?? []).map((p) => [p.sku, p.name]));
  out.top_skus = [...group("sku")].map(([sku, rows]) => {
    const d = rows.filter((o) => o.status === "delivered");
    return { sku, name: names.get(sku) ?? sku, units: sum(d, "qty"), net_revenue: round(sum(d, "net_revenue")) };
  }).sort((a, b) => b.net_revenue - a.net_revenue).slice(0, 5);
  return out;
}

let cache: { key: string; value: ReturnType<typeof computeKpis> } | null = null;
export function kpis(dir: string) {
  const mtimes: Record<string, number> = {};
  for (const f of FILES) {
    try {
      mtimes[f] = statSync(join(dir, f)).mtimeMs;
    } catch {}
  }
  const key = JSON.stringify(mtimes);
  if (cache?.key !== key) cache = { key, value: computeKpis(dir, mtimes) };
  return cache.value;
}
