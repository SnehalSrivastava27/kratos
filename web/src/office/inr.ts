// Indian money format: ₹ crores (≥ 1 Cr), lakhs (≥ 1 L), else grouped rupees (₹12,345). Pure, for inr.check.mjs.
export function inr(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '−' : '', a = Math.abs(n);
  const short = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  if (a >= 1e7) return `${sign}₹${short(a / 1e7)} Cr`;
  if (a >= 1e5) return `${sign}₹${short(a / 1e5)}L`;
  return `${sign}₹${Math.round(a).toLocaleString('en-IN')}`;
}
/** 12345 → "12,345" (Indian grouping: 1,23,456). */
export const count = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('en-IN'));
