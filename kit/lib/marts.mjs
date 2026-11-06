// Precomputed marts, built once into the cached DB (see data.mjs). Order matters: later marts read earlier ones.
// A mart whose source tables/columns are missing (e.g. test fixtures) is skipped. Bump MART_VERSION on any change.
export const MART_VERSION = 1;

const notCancelled = "status <> 'cancelled'";

export const MARTS = [
  // One row per order line + month, city tier, first-line flag, P&L COGS, new/returning.
  ['m_lines', `
    SELECT o.*, substr(o.date, 1, 7) AS month, t.city_tier,
      CASE WHEN ROW_NUMBER() OVER (PARTITION BY o.order_id ORDER BY o.rowid) = 1 THEN 1 ELSE 0 END AS is_first,
      CASE WHEN o.status = 'delivered' OR (o.status = 'returned' AND r.restockable = 'no') THEN o.qty * p.cogs ELSE 0 END AS cogs,
      CASE WHEN o.order_id = f.first_order THEN 'new' ELSE 'returning' END AS customer_type
    FROM orders o JOIN products p ON p.sku = o.sku
    LEFT JOIN (SELECT city, MAX(city_tier) AS city_tier FROM customers GROUP BY city) t ON t.city = o.city
    LEFT JOIN returns r ON r.order_id = o.order_id AND r.sku = o.sku
    LEFT JOIN (SELECT customer_id, MIN(order_id) AS first_order FROM orders GROUP BY customer_id) f ON f.customer_id = o.customer_id`],
  // One row per order. status = the first line's status (RTO and cancel are whole-order).
  ['m_orders', `
    SELECT order_id, MIN(date) AS date, month, channel, region, city, city_tier, warehouse, payment, courier, zone, customer_id, coupon,
      customer_type, MAX(CASE WHEN is_first = 1 THEN status END) AS status, COUNT(*) AS lines, SUM(qty) AS units,
      SUM(gross_revenue) AS gross, SUM(net_revenue) AS net
    FROM m_lines GROUP BY order_id`],
  ['daily_sales', `
    SELECT date, month, channel, sku, COUNT(DISTINCT CASE WHEN ${notCancelled} THEN order_id END) AS orders,
      SUM(CASE WHEN ${notCancelled} THEN qty ELSE 0 END) AS units,
      SUM(CASE WHEN ${notCancelled} THEN gross_revenue ELSE 0 END) AS gross_revenue,
      SUM(CASE WHEN ${notCancelled} THEN net_revenue ELSE 0 END) AS booked_revenue,
      SUM(CASE WHEN status = 'delivered' THEN net_revenue ELSE 0 END) AS net_revenue
    FROM m_lines GROUP BY date, channel, sku`],
  ['channel_month', `
    SELECT month, channel, SUM(orders) AS orders, SUM(units) AS units, SUM(gross_revenue) AS gross_revenue,
      SUM(booked_revenue) AS booked_revenue, SUM(net_revenue) AS net_revenue FROM daily_sales GROUP BY month, channel`],
  ['sku_month', `
    SELECT month, sku, SUM(orders) AS orders, SUM(units) AS units, SUM(gross_revenue) AS gross_revenue,
      SUM(booked_revenue) AS booked_revenue, SUM(net_revenue) AS net_revenue FROM daily_sales GROUP BY month, sku`],
  ['rto_by_channel', rto('channel')],
  ['rto_by_payment', rto('payment')],
  ['rto_by_tier', rto('city_tier')],
  ['rto_by_courier', rto('courier')],
  // Every paid-ads row in one shape. platform = Meta | Google | Amazon | Flipkart | Nykaa | Blinkit | Zepto.
  ['ads_daily_all', `
    SELECT date, substr(date, 1, 7) AS month, 'Meta' AS platform, 'meta' AS source, campaign, creative_type AS type,
      spend, impressions, clicks, purchases AS conversions, revenue FROM meta_ads_daily
    UNION ALL SELECT date, substr(date, 1, 7), 'Google', 'google', campaign, type, spend, impressions, clicks, conversions, revenue FROM google_ads_daily
    UNION ALL SELECT date, substr(date, 1, 7), platform, 'marketplace', campaign, NULL, spend, NULL, clicks, orders, revenue FROM marketplace_ads_daily`],
  ['creator_perf', `
    SELECT p.post_id, p.handle, c.name, c.tier, c.followers, c.engagement_pct, c.fake_follower_pct, p.platform, p.format, p.date,
      substr(p.date, 1, 7) AS month, p.views, p.link_clicks, p.coupon_code, p.orders, p.revenue, p.fee_paid, p.barter,
      CASE WHEN p.fee_paid > 0 THEN ROUND(1.0 * p.revenue / p.fee_paid, 2) END AS roas,
      CASE WHEN p.fee_paid > 0 AND p.views > 0 THEN ROUND(1000.0 * p.fee_paid / p.views, 1) END AS cpm,
      CASE WHEN p.fee_paid > 0 AND p.orders > 0 THEN ROUND(1.0 * p.fee_paid / p.orders) END AS cost_per_order
    FROM creator_posts p LEFT JOIN creators c ON c.handle = p.handle`],
  // Marketing spend per day, allocated to a sales channel: marketplace ads -> that marketplace; Meta, Google, creators -> Website.
  ['marketing_daily', `
    SELECT date, month, CASE WHEN source = 'marketplace' THEN platform ELSE 'Website' END AS channel, source AS kind, SUM(spend) AS spend
      FROM ads_daily_all GROUP BY 1, 2, 3, 4
    UNION ALL SELECT date, month, 'Website', 'creator', SUM(fee_paid) FROM creator_perf GROUP BY 1, 2`],
  // Day x channel P&L lines down to CM3 (P&L definitions, see switch/METRICS.md).
  ['channel_daily', `
    SELECT date, substr(date, 1, 7) AS month, channel, SUM(gross) AS gross_revenue, SUM(disc) AS discounts, SUM(ret) AS returns,
      SUM(net) AS net_revenue, SUM(booked) AS booked_revenue, SUM(cogs) AS cogs, SUM(fees) AS channel_fees, SUM(ship) AS shipping,
      SUM(orders) AS orders, SUM(units) AS units, SUM(mkt) AS marketing, SUM(ads) AS ad_spend, SUM(newc) AS new_customers
    FROM (
      SELECT date, channel,
        SUM(CASE WHEN ${notCancelled} THEN gross_revenue ELSE 0 END) AS gross,
        SUM(CASE WHEN ${notCancelled} THEN gross_revenue - net_revenue ELSE 0 END) AS disc,
        SUM(CASE WHEN status IN ('rto', 'returned') THEN net_revenue ELSE 0 END) AS ret,
        SUM(CASE WHEN status = 'delivered' THEN net_revenue ELSE 0 END) AS net,
        SUM(CASE WHEN ${notCancelled} THEN net_revenue ELSE 0 END) AS booked,
        SUM(cogs) AS cogs, SUM(channel_fee) AS fees, SUM(shipping_cost) AS ship,
        COUNT(DISTINCT CASE WHEN ${notCancelled} THEN order_id END) AS orders,
        SUM(CASE WHEN ${notCancelled} THEN qty ELSE 0 END) AS units, 0 AS mkt, 0 AS ads, 0 AS newc
      FROM m_lines GROUP BY date, channel
      UNION ALL SELECT date, channel, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, SUM(spend), SUM(CASE WHEN kind <> 'creator' THEN spend ELSE 0 END), 0
        FROM marketing_daily GROUP BY date, channel
      UNION ALL SELECT first_order_date, acquisition_channel, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, COUNT(*) FROM customers GROUP BY 1, 2
    ) GROUP BY date, channel`],
  ['stock_latest', `
    SELECT date, warehouse, sku, on_hand, in_transit, reserved FROM inventory_snapshot
    WHERE date = (SELECT MAX(date) FROM inventory_snapshot)`],
  ['payroll_summary', `
    SELECT month, dept, COUNT(*) AS headcount, SUM(gross) AS gross, SUM(pf_employee) AS pf_employee, SUM(professional_tax) AS professional_tax,
      SUM(tds) AS tds, SUM(net_pay) AS net_pay, SUM(pf_employer) AS pf_employer, SUM(employer_cost) AS employer_cost
    FROM payroll_2026_10 GROUP BY month, dept`],
  ['pnl', `
    SELECT *, net_revenue - cogs AS cm1, net_revenue - cogs - channel_fees - shipping AS cm2,
      net_revenue - cogs - channel_fees - shipping - marketing AS cm3 FROM pnl_monthly`],
];

function rto(dim) {
  return `SELECT month, ${dim}, COUNT(*) AS shipped_orders, SUM(status = 'rto') AS rto_orders,
    ROUND(100.0 * SUM(status = 'rto') / COUNT(*), 1) AS rto_pct FROM m_orders WHERE ${notCancelled} GROUP BY month, ${dim}`;
}
