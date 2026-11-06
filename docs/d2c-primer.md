# How an Indian D2C skincare brand actually works (2025-26 primer)

A short field guide for the Kesar & Co. agents, and raw material for the blog. Plain numbers, simple words.
Figures are typical ranges from public sources (listed at the end). They move every few months, so treat them
as "what a founder would say in a meeting", not as a rate card. The demo data in `data/` is built on these ranges.

## 1. The shape of the business

- A brand at ₹3-5 Cr a year sells 5-15 SKUs, ships 100-150 orders a day and has 15-30 people.
- Revenue is split across **own website** (Shopify + a payment gateway) and **marketplaces**: Amazon, Flipkart,
  Nykaa (beauty), Myntra (fashion + beauty) and **quick commerce** (Blinkit, Zepto, Swiggy Instamart).
- A common mix for a young beauty brand: website 40-50%, Amazon + Flipkart 25-30%, Nykaa 10-15%, quick commerce 5-15%
  (quick commerce is the fastest-growing slice in metros).
- Tier 2 and 3 cities now drive most *new* D2C orders (Unicommerce: ~66% of new D2C orders in FY26), but metros
  still bring most of the money because they buy more and return less.
- The real job is not "selling". It is **contribution margin**: what is left after discounts, returns, product cost,
  marketplace fees, shipping and ads. Most brands at this size run EBITDA between -15% and +5%.

## 2. Unit economics of one order (website, ₹899 serum, 10% off)

| Line | ₹ | Note |
|---|---|---|
| Selling price | 809 | MRP 899 minus 10% coupon |
| Product cost (COGS) | -210 | formula + bottle + carton + manufacturer's charge |
| Payment gateway (prepaid) | -16 | ~2% + GST on the fee (Razorpay standard) |
| Shipping, zone B | -38 | ~₹30-60 per 500 g parcel via an aggregator |
| COD fee (if COD) | -35 | ~₹30-45 or ~1.5-2% of order value |
| **Contribution before ads** | ~510-545 | then pay for ads, creators, salaries, rent |

On Nykaa the same order loses ~28-33% to commission + shipping; on Amazon ~12-16%. That is why every brand pushes
customers to its own website, and why the website needs the most ad money.

## 3. Marketplace and channel fees (2025-26)

- **Amazon India**: fees = referral (commission) + closing fee + weight handling (shipping) + 18% GST on fees.
  Amazon removed referral fees on items under ₹300 (Apr 2025) and later reported zero referral fees on products under
  ₹1,000 across many categories, beauty included (from Mar 2026). Closing fee is ~₹5-40 by price band; weight handling
  on Easy Ship is ~₹29-42 local and ~₹65-79 national for 0-500 g. Settlement roughly every 7 days.
- **Flipkart**: beauty commission ~10-15% plus a fixed fee (~₹20-35 for ₹500-1,000 items) and shipping. Flipkart simplified
  its rate card to commission + fixed fee; check the Seller Hub before relying on any number.
- **Nykaa**: works more like a retailer. Expect 25-35% of selling price as commission or margin, slow payment (30+ days),
  and pressure to fund discounts in big sales (Pink Friday, Hot Pink sale).
- **Myntra (beauty)**: ~20-25% commission plus fixed fees.
- **Quick commerce (Blinkit, Zepto, Instamart)**: commissions/margins of roughly 10-25% for beauty, plus listing fees,
  dark-store inbound freight and "suggested" ad spend. Total platform cost often lands at 35-50% of selling price. Many brands
  sell to them B2B (they buy stock) rather than marketplace-style; either way cash comes back in ~30 days.
- **Own website**: Shopify plan + apps (₹10-20k a month), payment gateway ~2% (+GST), settlement T+2 working days.

Kesar & Co. data: `channel_fees.csv` (blended per channel), `orders.channel_fee` per line.

## 4. COD, RTO and returns: the silent margin killer

- **COD (cash on delivery)** is still big in India: industry estimates of 60-65% of all e-commerce orders, higher in tier 2/3.
  Beauty brands with good prepaid nudges get it to 35-45% on the website.
- **RTO (return to origin)**: the customer refuses or is not reachable, the parcel comes back. You pay shipping both ways and
  earn nothing. COD RTO is ~20-30%; prepaid RTO is ~2-3%. By city: metros ~18-24%, tier 2 ~30-38%, tier 3 ~38-50% (COD).
- Fixes brands use: COD verification on WhatsApp, a ₹30-50 COD fee, partial prepaid, ₹50 off for prepaid, address checks,
  and blocking pin codes with repeat RTO.
- **Customer returns** in skincare are low (2-6%) because opened products cannot be resold. Common reasons: damaged or
  leaking in transit, irritation/breakout, "did not suit my skin", wrong item, near-expiry stock. Marketplaces see more
  returns than the website.

Kesar & Co. data: `orders.status` (`rto`, `returned`), `returns.csv` (reason, restockable), `couriers.csv` (RTO by courier/zone).

## 5. Shipping and couriers

- Small brands ship website orders through an **aggregator** (Shiprocket, NimbusPost, iThink) that picks a courier per order:
  **Delhivery, Xpressbees, Blue Dart, Ekart, Shadowfax**, DTDC. Marketplace orders mostly go with the marketplace's own logistics
  (Amazon Shipping/ATS, Ekart for Flipkart and Myntra).
- **Zones** set the price: A = same city, B = same state/region, C = metro to metro, D = rest of India, E = North East, J&K,
  Kerala and hills. A typical 500 g rate runs ~₹25-35 in zone A up to ~₹45-65 in zone E, plus fuel surcharge and GST.
- Blue Dart is fastest and costliest, with the lowest RTO; cheaper last-mile players are fine in metros but RTO more in tier 3.
- Delivery: 1-2 days in-city, 2-3 days in-region and metro to metro, 4-7 days for the rest of India.
- Most brands keep stock in 2-4 **3PL warehouses** (Mumbai/Bhiwandi, Delhi NCR, Bangalore) paying storage + ~₹8-15 per order
  for pick and pack. Shipping from the nearest warehouse cuts both cost and RTO.

## 6. Paid ads

- **Meta (Facebook + Instagram)** is the main engine. Indian D2C CPMs are far below the US; agencies quote averages of
  ₹100-450 for beauty depending on audience (broad is cheap, retargeting is pricey), and CPMs rose ~20% in 2024-25.
  Good beauty accounts see CTR 1-3%, website conversion 2-4%, and **ROAS ~3x** blended (retargeting 4-5x, cold prospecting 1.5-2x).
- Meta's ROAS uses 7-day click + 1-day view, so it over-claims (20-35% above 1-day click). Never add Meta, Google and creator
  revenue together: they count the same sale.
- **UGC (user-generated) videos and before/after** creatives usually beat polished statics in beauty.
- **Google**: brand search (cheap, 6-10x ROAS but mostly people who would buy anyway), generic search (expensive clicks),
  Shopping/Performance Max (2.5-3.5x), YouTube (awareness; weak direct ROAS).
- **Marketplace ads**: Amazon Sponsored Products/Brands, Flipkart PLA, Nykaa sponsored listings, Blinkit/Zepto search ads.
  Usually 2.5-4.5x ROAS; on quick commerce brands report ad spend climbing from ~5% to 15-20% of sales on the platform.
- A healthy total marketing budget for a growing beauty brand is 20-30% of net revenue (MER of 3.5-5x).

## 7. Creators (influencers)

- Tiers: **nano** (<10k followers), **micro** (10k-100k), **mid** (100k-500k), **macro** (500k-1M), **mega** (1M+).
- Rough Indian rates per Instagram Reel: nano ₹1-12k (many do barter: free product), micro ₹5-75k, mid/macro ₹80k-3L,
  mega ₹1-8L. Stories cost ~25-35% of a reel. Add 18% GST for registered creators and 15-25% if an agency manages them.
- What predicts sales is **engagement rate**, audience fit (city, language, skin concerns) and real followers, not follower count.
  Audit fake followers: anything above ~15% is a red flag.
- Track with a **unique coupon code per post** (e.g. KAVYAC15) and a link; coupon attribution undercounts, but it is honest.
  Small high-engagement creators often deliver 3-5x ROAS on coupon; big ones often below 1x.

Kesar & Co. data: `creators.csv`, `creator_posts.csv`, coupon column in `orders.csv`.

## 8. Making the product: procurement

- Almost every small Indian skincare brand uses a **contract manufacturer** (third-party, "TPM"), often in Baddi (Himachal),
  Mumbai/Thane, Vapi or Ahmedabad, with GMP / ISO 22716 certification. The brand owns the formula and the brand; the
  manufacturer charges a **conversion (job-work) fee** per unit.
- **MOQ**: typically 500-1,000 units per SKU per batch at the factory; packaging suppliers want 3,000-20,000 pieces.
- **Lead time**: 7-9 weeks for a new product (sampling, approval, packaging, production, QC); repeat batches ~3-4 weeks.
  Packaging (glass bottles, airless jars) is often the slowest item at ~4 weeks.
- **Raw materials**: actives (vitamin C as ethyl ascorbic acid, niacinamide, hyaluronic acid, ferulic acid), UV filters
  (zinc oxide, titanium dioxide), oils, and for a kesar brand, **Kashmiri saffron** (₹250-300 per gram, prices swing with the
  harvest and it is paid in advance). Packaging is usually a bigger cost than the formula.
- Payment terms: chemicals and packaging 15-45 days credit; contract manufacturers often want an advance + 30-45 days;
  saffron traders want cash upfront.
- Rule of thumb: product cost (COGS) at 20-30% of MRP for skincare.

Kesar & Co. data: `suppliers.csv`, `raw_materials.csv`, `bom.csv`, `purchase_orders.csv`.

## 9. Inventory and stock

- Keep 4-8 weeks of cover per SKU per warehouse; less before a sale is how stockouts happen.
- Weekly stock = last week + received - shipped. Plan transfers between warehouses (2 days here) before a regional spike.
- Quick commerce needs stock in the platform's dark stores, so it ties up extra inventory.

## 10. People and payroll (25-person startup, FY 2026-27)

- **CTC** (cost to company) = fixed pay + variable/bonus + employer PF. Typical split of monthly fixed pay:
  **basic 40-50%**, **HRA** 50% of basic in metros (40% elsewhere), **special allowance** = the rest.
- **PF (provident fund)**: 12% of basic from the employee and 12% from the employer, commonly capped at ₹15,000 basic
  (so ₹1,800 each a month at most).
- **ESI** applies only if gross pay is ₹21,000 a month or less (none in our team).
- **Professional tax** is a state tax: Maharashtra ₹200 a month (₹300 in February; women earning up to ₹25,000 are exempt);
  Karnataka ₹200 if salary is ₹25,000+ (limit raised in 2025); Delhi has none.
- **TDS (income tax) under the new regime**, the default: standard deduction ₹75,000; slabs nil to ₹4 L, 5% to ₹8 L,
  10% to ₹12 L, 15% to ₹16 L, 20% to ₹20 L, 25% to ₹24 L, 30% above; the 87A rebate makes income up to ₹12 L tax-free
  (so salaries up to ~₹12.75 L pay no tax); plus 4% cess. Budget 2026 left these unchanged.
- Typical Indian D2C pay (Mumbai/Bangalore): executives ₹3-5 L, managers ₹7-12 L, heads ₹15-30 L; founders at this stage
  often draw ₹8-15 L.

Kesar & Co. data: `employees.csv`, `payroll_2026_10.csv`.

## 11. The monthly P&L

```
Gross revenue (MRP x units)        - Discounts     - RTO and returns      = Net revenue
- COGS - Channel fees - Shipping                                          = Contribution
- Marketing (Meta + Google + marketplace ads + creators)                  = Contribution after marketing
- Salaries - Opex (rent, 3PL, software, creative, CA/legal, travel)       = EBITDA
```

Healthy targets for a beauty brand this size: contribution after marketing 25-35% of net revenue, marketing 20-30%,
EBITDA around break-even. Kesar & Co. sits at about -4% to -7% EBITDA, and Finance's rule is that any sale must be EBITDA positive
(`data/finance_policy.json`).

## 12. The calendar

- Payday (1st-5th) lifts orders; Sundays and Mondays are the strongest days online.
- Festive season: Independence Day sales (15 Aug), Raksha Bandhan (gift kits), Navratri, Dussehra, then Diwali and the big
  marketplace sales (Amazon Great Indian Festival, Flipkart Big Billion Days, Nykaa Pink Friday). In 2026, Dussehra is 20 Oct and
  Diwali 8 Nov, so the big Kesar & Co. sale is still ahead.
- Sunscreen sells most in summer and monsoon; serums and face oils pick up in winter and the wedding season.

## Sources

- Amazon referral fee cuts: [Amazon press release, Aug 2025](https://press.aboutamazon.com/in/news/small-business/2025/8/amazon-announces-zero-referral-fees-on-over-1-2-crore-products-move-aimed-at-boosting-growth-of-lakhs-of-sellers-across-india),
  [Outlook Business](https://www.outlookbusiness.com/news/amazon-india-slashes-referral-fees-for-12mn-products-under-300-largest-in-companys-history),
  [Shiprocket: Amazon commission rates](https://shiprocket.in/blog/amazon-commission-rates-in-india)
- Flipkart fees: [Flipkart Seller Hub](https://seller.flipkart.com/fees-and-commission), [Inc42 on the rate card](https://inc42.com/buzz/flipkart-modifies-rate-card-for-sellers-to-boost-clarity-on-settlement),
  [Gonukkad guide](https://www.gonukkad.com/blog/flipkart-seller-commission-charges)
- Marketplace fee comparison: [Fibre2Fashion: Amazon, Flipkart and Nykaa fees](https://emerge.fibre2fashion.com/blogs/10651/understanding-amazon-flipkart-nykaa-seller-fees-how-much-profit-can-you-really-make)
- Quick commerce: [echai.ventures: q-comm margins](https://echai.ventures/d2c/d2c-quick-commerce/qcomm-margins-commissions-listing-fees),
  [Inc42: Blinkit variable commission](https://inc42.com/?p=503754), [The D2C Pulse](https://thed2cpulse.com/?p=727),
  [base.com: Blinkit vs Zepto vs Instamart](https://base.com/en-IN/blog/?p=19769)
- COD and RTO: [Razorpay on COD](https://razorpay.com/blog/cash-on-delivery-and-the-challenges/),
  [base.com India e-commerce benchmarks 2026](https://www.base.com/en-IN/blog/india-ecommerce-benchmarks-2026-how-brands-reduce-rto-in-india-and-hit-accuracy-sla-targets),
  [Unicommerce via Devdiscourse](https://www.devdiscourse.com/article/headlines/3880310-tier-2-3-cities-drive-66-pc-of-new-d2c-orders-in-fy26)
- Payment gateway: [Razorpay pricing explained](https://razorpay.com/blog/razorpay-payment-gateway-pricing-explained/), [Razorpay settlements](https://razorpay.com/docs/payments/settlements/faqs/)
- Shipping zones and rates: [Shiprocket: shipping zones](https://shiprocket.in/blog/shipping-zones-india-explained),
  [Shiprocket support: zones](https://support.shiprocket.in/support/solutions/articles/43000664184-explaining-shipping-zones-how-shipment-zones-affect-order-fulfillment-and-rates-)
- Meta ads: [Sociolabs: Indian D2C on Meta](https://sociolabs.in/d2c-brands-india-meta-ads-roas/), [Trendtrack 2025 benchmarks](https://www.trendtrack.io/blog-post/meta-ad-spend-by-industry),
  [Triple Whale benchmarks](https://triplewhale.com/blog/facebook-ads-benchmarks), [echai.ventures: ROAS to expect](https://echai.ventures/d2c/d2c-meta-ads-fundamentals/roas-to-expect)
- Creator rates: [Kofluence: nano vs micro vs macro](https://www.kofluence.com/?p=68787), [Dazzlerr](https://www.dazzlerr.com/?p=59291),
  [Starclinch pricing guide](https://starclinch.com/blog/influencer-fees-in-india-complete-pricing-guide/), [echai.ventures: micro vs macro](https://echai.ventures/d2c/d2c-influencer-affiliate/micro-vs-macro-influencers-d2c-india)
- Contract manufacturing: [Auriga Research CDMO](https://aurigaresearchsaurabh.pages.dev/cdmo/personal-care/), [Xiran: skincare manufacturers in India](https://xirancosmetics.com/it/skincare-manufacturers-in-india/),
  [Closo: costs, MOQs and timelines](https://closo.co/blogs/inventory-liquidation/skincare-manufacturer)
- Tax and payroll: [Business Today: FY 2026-27 slabs](https://www.businesstoday.in/personal-finance/tax/story/tax-slabs-fy-2026-27-what-budget-2026-changed-for-individual-taxpayers-and-which-regime-works-best-514044-2026-02-01),
  [Upstox: ₹12.75 L tax-free](https://upstox.com/news/personal-finance/tax/new-tax-regime-calculation-fy-2026-27-how-much-of-your-salary-above-12-75-lakh-can-be-tax-free/article-191279),
  [ClearTax: Maharashtra PT](https://cleartax.in/s/professional-tax-maharashtra), [Taxaj: state PT slabs 2025-26](https://www.taxaj.com/learn/professional-tax-india-state-wise-slabs/),
  [Maharashtra women PT exemption](https://lexplosion.in/maharashtra-exempts-women-earning-monthly-salary-or-wage-up-to-rs-25000-and-persons-with-benchmark-disability-from-professional-tax-payment/)
