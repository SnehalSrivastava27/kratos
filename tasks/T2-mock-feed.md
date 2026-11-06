# T2 · Mock event feed (the demo script as data)
**Wave:** 1 · **Owns:** `demo/` · **Reads:** `contracts/events.schema.json`, `contracts/sample-feed.json`, `docs/PLAN.md` §3, §7

## Goal
Write the full "plan the festive sale" conversation as a timed event feed. It drives the office
before Switch is live, the landing hero loop, and the demo video.

## Deliverables
- `demo/feeds/sale-demo.json`: 35–50 events, ~45 seconds total (`t` in ms).
  Must include, in order: founder prompt → captain assigns → analyst forecast → ads plan →
  creators shortlist (top-4, ₹3.55L) → ops transfers (with `meta.transfers`: Delhi SKU01 + SKU05) →
  design artifacts (`meta.artifact_url` = `/gallery/hero.html`, `/gallery/serum.html`, `/gallery/glowkit.html`) →
  finance pushback (`meta.ebitda` −76086) → revised creators (₹1.18L) → finance approved (`meta.ebitda` 160914) →
  captain `approval_needed` to founder → founder `celebrate`.
- Include `working` events so agents visibly start before they finish.
- `demo/validate.mjs`: validates the feed against the schema (use `ajv`) and checks ordering.
- `demo/script.md`: the same story as a human-readable video script.

## Acceptance
- [ ] `node demo/validate.mjs demo/feeds/sale-demo.json` passes
- [ ] Every number matches PLAN §7 expected numbers
- [ ] All texts follow Telegram style: short lines, no tables, emoji first
