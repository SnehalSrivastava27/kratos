# Data and toolkit

The sample brand's data and the read-only toolkit agents use to compute every number.

← [Back to README](../README.md)

**Dataset.** Everything in `data/` is made-up but realistic: Kesar & Co., an Indian skincare D2C brand at about ₹4.4 Cr a year, selling through 18 channels: its Shopify website (Razorpay, COD via Shiprocket), Amazon, Flipkart, Myntra, Meesho, JioMart, AJIO, Nykaa, Purplle and Tata CLiQ, quick commerce on Blinkit, Zepto, Instamart, BB Now and Flipkart Minutes, Health & Glow and Apollo Pharmacy stores, and Amazon Global exports. Three months of order lines (Aug–Oct 2026) cover 55 cities across tiers 1–3 with pincodes, courier zones and 8 couriers, COD and RTO by tier, UPI/BNPL/COD payments, and GST on every line. Around them sit ads (Meta, Google, marketplace and quick-commerce ads), regional-language creators, WhatsApp campaigns, dark-store stock, ratings, support tickets, platform settlements with TCS/TDS, GST per GSTIN, payroll with PF/ESI/PT/TDS, MSME vendors and a compliance calendar. A seeded generator (`npm run data`) rebuilds it byte-for-byte, and `npm run data:check` runs 250 consistency checks, from the P&L down to every GST rupee. See [data/README.md](../data/README.md) and [docs/d2c-primer.md](d2c-primer.md).

Agents run `node kit/bin/kit.mjs <command>`, which prints one JSON object. Guide:
[`switch/TOOLKIT.md`](../switch/TOOLKIT.md); 50 built-in D2C metrics: [`switch/METRICS.md`](../switch/METRICS.md).

| Command | What it does | Library |
|---|---|---|
| `tables`, `sql` | Read-only SQL over every `data/*.csv` | `node:sqlite`, csv-parse |
| `stats`, `forecast`, `metric`, `brief` | Group stats, trend × day-of-week forecast, D2C metrics | simple-statistics |
| `chart` | Vega-Lite chart → `.svg` + `.png` | vega, vega-lite, sharp |
| `deck`, `xlsx`, `docx`, `pdf`, `banner` | Slides, sheets, Word, PDF, sale banners | pptxgenjs, exceljs, docx, pdfkit, sharp |
