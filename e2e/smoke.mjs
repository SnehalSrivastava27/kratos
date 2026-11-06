// Smoke test against a running server. Usage: BASE_URL=http://127.0.0.1:8803 [CHROME_PATH=...] node e2e/smoke.mjs
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8803';
const LOCAL = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
// No CHROME_PATH and no local Chrome → playwright-core's own registry browser (npx playwright@1.49.1 install chromium).
const executablePath = process.env.CHROME_PATH || (existsSync(LOCAL) ? LOCAL : undefined);
// Any line of any feed message counts as "an event is on screen".
const feedLines = JSON.parse(readFileSync(new URL('../demo/feeds/sale-demo.json', import.meta.url), 'utf8'))
  .flatMap((e) => (e.text ?? '').split('\n')).map((l) => l.trim()).filter((l) => l.length >= 8);

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

await check('GET /api/health ok', async () => {
  const r = await fetch(`${BASE}/api/health`);
  assert(r.ok && (await r.json()).ok === true, `status ${r.status}`);
});
await check('GET /gallery/hero.html 200', async () => {
  const r = await fetch(`${BASE}/gallery/hero.html`);
  assert(r.status === 200, `status ${r.status}`);
});
await check('POST /api/events bad body → 400', async () => {
  const r = await fetch(`${BASE}/api/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"nope":1}' });
  assert(r.status === 400, `status ${r.status}`);
});

const browser = await chromium.launch({ executablePath, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  await check('/ renders h1, no page errors', async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.locator('h1').first().waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForTimeout(1000); // let late errors surface
    assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await page.close();
  });
  await check('/office renders canvas + an event within 15s', async () => {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log(`     (office page error: ${e.message})`));
    await page.goto(BASE + '/office', { waitUntil: 'load' });
    await page.locator('canvas').first().waitFor({ state: 'attached', timeout: 15_000 });
    await page.waitForFunction((lines) => lines.some((l) => document.body.innerText.includes(l)), feedLines, { timeout: 15_000 });
    await page.close();
  });
} finally {
  await browser.close();
}

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
