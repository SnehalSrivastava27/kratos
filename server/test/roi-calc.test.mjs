// ROI2: the pure maths (server/src/roi-calc.ts, imported as TypeScript): pricing overrides, the forecast, sessions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergePrices, forecast, sessionsIn, DEFAULT_PRICES, isAck } from "../src/roi-calc.ts";

test("pricing: switch/pricing.json mirrors the list prices; overrides are 'negotiated', new models priced, bad entries skipped", () => {
  const file = JSON.parse(readFileSync(new URL("../../switch/pricing.json", import.meta.url), "utf8"));
  const shipped = mergePrices(file);
  assert.deepEqual(shipped.prices, DEFAULT_PRICES, "the shipped file is the list prices");
  assert.deepEqual([shipped.negotiated, shipped.errors], [[], []]);
  const m = mergePrices({ models: {
    "claude-haiku-5-5": { input: 0.08, output: 0.4, cache_read: 0.008, cache_write: 0.1 },
    "my-finetune": { input: 1, output: 2, cache_read: 0, cache_write: 0 },
    "claude-opus-5-5": { input: -1, output: 20, cache_read: 0.2, cache_write: 5 },
  } });
  assert.equal(m.prices["claude-haiku-5-5"].input, 0.08);
  assert.equal(m.prices["my-finetune"].output, 2);
  assert.deepEqual(m.prices["claude-opus-5-5"], DEFAULT_PRICES["claude-opus-5-5"], "a negative price is refused, the list price stays");
  assert.deepEqual(m.negotiated, ["claude-haiku-5-5", "my-finetune"]);
  assert.deepEqual(m.errors, ["claude-opus-5-5"]);
  assert.deepEqual(mergePrices(null).prices, DEFAULT_PRICES);
});

test("forecast: burn rate = MTD / days run incl. today; status thresholds 80% / 100%; days to cap from what's left", () => {
  const now = new Date("2026-11-10T12:00:00Z"); // day 10 of a 30-day month
  const f = forecast(2, now, 10);
  assert.deepEqual([f.burnPerDay, f.projectedUsd, f.used, f.daysToCap, f.status, f.projectedOver], [0.2, 6, 0.2, 40, "ok", false]);
  assert.equal(forecast(8, now, 10).status, "warn");
  assert.equal(forecast(8, now, 10).projectedOver, true);
  assert.equal(forecast(10, now, 10).status, "over");
  assert.equal(forecast(10, now, 10).daysToCap, 0);
  assert.equal(forecast(0, now, 10).daysToCap, null, "no spend: no date");
  assert.deepEqual([forecast(3, now, null).status, forecast(3, now, null).capUsd], ["none", null]);
});

test("work sessions are runs of active hours; acks are recognised", () => {
  assert.equal(sessionsIn([0, 2, 3, 0, 0, 1, 0, 4]), 3);
  assert.equal(sessionsIn([]), 0);
  for (const t of ["confirmed", "OK!", "noted, thanks", "👍", "on it"]) assert.ok(isAck(t), t);
  assert.ok(!isAck("Shortlist: 4 creators, ₹1.2L total"));
});
