"""Recompute the demo's expected numbers from data/ (PLAN §7). Run: python3 switch/check_numbers.py"""
import csv, json
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "data"
rows = lambda f: list(csv.DictReader(open(D / f)))
b = json.load(open(D / "budget.json"))
uc, sale = b["unit_costs"], b["sale"]
uplift = {r["sku"]: float(r["sale_uplift_x"]) for r in rows("past_sales.csv")}

units = revenue = cogs = 0
print("Forecast:")
for p in rows("products.csv"):
    u = float(p["avg_daily_units"]) * uplift[p["sku"]] * sale["days"]
    r = u * round(float(p["mrp"]) * (1 - sale["discount_pct"] / 100))  # whole-rupee sale price
    units, revenue, cogs = units + u, revenue + r, cogs + u * float(p["cogs"])
    print(f"  {p['sku']} · {u:,.0f} units · ₹{r:,.0f}")

orders = round(units / uc["units_per_order"])  # whole orders
contribution = (revenue - cogs - orders * uc["shipping_per_order"]
                - revenue * (uc["payment_gateway_pct"] + uc["returns_pct_of_revenue"]) / 100)
print(f"Revenue ₹{revenue:,.0f} · contribution before marketing (after fixed costs)"
      f" ₹{contribution - b['fixed_costs_sale_period']:,.0f}")

ebitda = lambda mkt: contribution - mkt - b["fixed_costs_sale_period"]
g = b["guidance"]
top4 = sorted(rows("influencers.csv"), key=lambda r: -float(r["avg_views"]))[:4]
fees = sum(float(r["fee"]) for r in top4)
mkt_top4 = g["ads"] + fees + g["creative_production"]
e1, e2 = ebitda(b["total_marketing_budget"]), ebitda(mkt_top4)
print(f"EBITDA at ₹{b['total_marketing_budget']:,} marketing: ₹{e1:+,.0f}")
print(f"Top-4 by reach ({', '.join(r['name'] for r in top4)}) fees ₹{fees:,.0f}"
      f" → marketing ₹{mkt_top4:,.0f} → EBITDA ₹{e2:+,.0f}")

assert round(e1) == 128914 and round(e2) == -76086, (e1, e2)
