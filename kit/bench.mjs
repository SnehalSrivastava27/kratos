// p50/p90 wall time of cold `kit` processes. Run: node kit/bench.mjs [runs]   (KIT_CACHE=0 = no SQLite cache)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const KIT = fileURLToPath(new URL('./bin/kit.mjs', import.meta.url));
const runs = Number(process.argv[2]) || 15;
const cases = [
  ['sql', ['sql', 'SELECT channel, SUM(net_revenue) r FROM orders WHERE status = \'delivered\' GROUP BY 1']],
  ['metric', ['metric', 'rto_pct', '--by', 'channel', '--month', '2026-09']],
  ['brief', ['brief', 'finance']],
];
spawnSync(process.execPath, [KIT, 'tables']); // warm the cache file (a rebuild is not what we measure)
const q = (xs, p) => xs.slice().sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))];
for (const [name, args] of cases) {
  const ms = [];
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    const r = spawnSync(process.execPath, [KIT, ...args], { encoding: 'utf8' });
    ms.push(performance.now() - t);
    if (i === 0 && !r.stdout.startsWith('{"ok":true')) console.log(name, r.stdout.slice(0, 200));
  }
  console.log(`${name.padEnd(7)} p50 ${q(ms, 0.5).toFixed(0)} ms  p90 ${q(ms, 0.9).toFixed(0)} ms  (${runs} runs, cache ${process.env.KIT_CACHE === '0' ? 'off' : 'on'})`);
}
