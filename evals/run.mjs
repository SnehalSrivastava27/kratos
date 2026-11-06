#!/usr/bin/env node
// QA Lab evals. Modes: --truth (no LLM), --offline (default, `claude -p` per question), --live (B3 admin API).
// Filters: --agent a,b  --limit N  --failed (rerun failures of the newest report). Options: --model sonnet
// --concurrency 4  --timeout 180 (seconds). Live: SERVER_URL (default http://localhost:8787), ADMIN_TOKEN.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, openDb, score, styleCheck } from './lib.mjs';
import { questions } from './questions.mjs';

const REPORTS = join(ROOT, 'evals', 'reports');
const QA_LINE = '\n\nQA LAB: this message comes from the QA Lab topic. It is a quick test question. ' +
  'Answer it yourself, right now, in your reply text, in your normal Telegram style. ' +
  'Do not post to Telegram, do not tag or wait for teammates.';

function args(argv) {
  const o = { mode: 'offline', model: 'sonnet', concurrency: 4, timeout: 180, agents: null, limit: Infinity, failed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === '--truth' || a === '--offline' || a === '--live') o.mode = a.slice(2);
    else if (a === '--model') o.model = v();
    else if (a === '--agent') o.agents = v().split(',');
    else if (a === '--limit') o.limit = Number(v());
    else if (a === '--concurrency') o.concurrency = Number(v());
    else if (a === '--timeout') o.timeout = Number(v());
    else if (a === '--failed') o.failed = true;
    else throw new Error(`unknown arg ${a}`);
  }
  return o;
}

// Resolve text + truth for every question. Errors are kept per question (truth mode fails on any).
export function resolve(db = openDb()) {
  const v2 = db.has('orders');
  return questions.map((q, i) => {
    const id = `${q.agent}#${questions.slice(0, i).filter(x => x.agent === q.agent).length + 1}`;
    if (q.v2 && !v2) return { id, q, skip: 'v2 data not present (data/orders.csv missing)' };
    try {
      return { id, q, text: typeof q.text === 'function' ? q.text(db) : q.text, truth: q.truth(db) };
    } catch (e) { return { id, q, error: e.message }; }
  });
}

function truthMode(items) {
  let bad = 0;
  for (const it of items) {
    if (it.skip) { console.log(`SKIP ${it.id}  ${it.skip}`); continue; }
    if (it.error || (it.q.kind === 'number' && !Number.isFinite(it.truth))) {
      bad++; console.error(`FAIL ${it.id}  ${it.error || `truth is not a finite number: ${it.truth}`}`); continue;
    }
    console.log(`ok   ${it.id.padEnd(22)} [${it.q.kind}] ${it.text}\n     => ${JSON.stringify(it.truth)}`);
  }
  const n = items.filter(i => !i.skip).length;
  console.log(`\n${n - bad}/${n} truths computed, ${items.length - n} skipped`);
  if (bad) process.exit(1);
}

// ---------- offline: claude -p ----------
function askClaude(agent, text, o) {
  const md = readFileSync(join(ROOT, 'switch', 'agents', `${agent}.md`), 'utf8');
  const argv = ['-p', text, '--append-system-prompt', md + QA_LINE,
    '--allowedTools', 'Bash(node kit/bin/kit.mjs:*)', 'Read', 'Grep', 'Glob',
    '--output-format', 'json', '--model', o.model, '--no-session-persistence', '--strict-mcp-config'];
  return new Promise(res => {
    const t0 = Date.now();
    const p = spawn('claude', argv, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    const kill = setTimeout(() => p.kill('SIGKILL'), o.timeout * 1000);
    p.on('close', code => {
      clearTimeout(kill);
      const ms = Date.now() - t0;
      try {
        const j = JSON.parse(out);
        res({ reply: j.result ?? '', ms, cost: j.total_cost_usd ?? null, error: j.is_error ? (j.subtype || 'is_error') : null });
      } catch {
        res({ reply: '', ms, cost: null, error: ms >= o.timeout * 1000 ? 'timeout' : `exit ${code}: ${(err || out).slice(0, 200)}` });
      }
    });
  });
}

// ---------- live: B3 admin API ----------
export async function askLive(agent, text, o, base = process.env.SERVER_URL || 'http://localhost:8787') {
  const h = { authorization: `Bearer ${process.env.ADMIN_TOKEN || ''}`, 'content-type': 'application/json' };
  const t0 = Date.now();
  const r = await fetch(`${base}/api/qa/ask`, { method: 'POST', headers: h, body: JSON.stringify({ agent, text }) });
  if (!r.ok) return { reply: '', ms: 0, cost: null, error: `ask HTTP ${r.status}` };
  const sentAt = (await r.json().catch(() => ({}))).sentAt ?? new Date(t0).toISOString();
  const poll = o.pollMs ?? 3000;
  let got = [];
  while (Date.now() - t0 < o.timeout * 1000) {
    await new Promise(s => setTimeout(s, poll));
    const q = await fetch(`${base}/api/qa/replies?after=${encodeURIComponent(sentAt)}&agent=${encodeURIComponent(agent)}`, { headers: h });
    if (!q.ok) return { reply: '', ms: Date.now() - t0, cost: null, error: `replies HTTP ${q.status}` };
    const j = await q.json();
    const list = (Array.isArray(j) ? j : j.replies || []).filter(x => !x.agent || x.agent === agent);
    // ponytail: done once a poll brings nothing new after the first reply; agents that post in many slow parts get cut.
    if (list.length && list.length === got.length) break;
    got = list;
  }
  if (!got.length) return { reply: '', ms: Date.now() - t0, cost: null, error: 'timeout' };
  return { reply: got.map(x => x.text ?? '').join('\n\n'), ms: Date.now() - t0, cost: null, error: null };
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

function newestReport() {
  const f = existsSync(REPORTS) && readdirSync(REPORTS).filter(f => /^\d.*\.json$/.test(f)).sort().at(-1);
  if (!f) throw new Error('--failed: no previous report in evals/reports/');
  return JSON.parse(readFileSync(join(REPORTS, f), 'utf8'));
}

export function toMarkdown(rep) {
  const by = {};
  for (const r of rep.results) (by[r.agent] ??= []).push(r);
  const L = [`# QA Lab evals — ${rep.mode} (${rep.model}) — ${rep.at}`, '',
    `**Score: ${rep.results.filter(r => r.pass).length}/${rep.results.length}**` +
    (rep.cost ? ` · cost $${rep.cost.toFixed(2)}` : '') + (rep.skipped ? ` · ${rep.skipped} skipped` : ''), '',
    '| Agent | Pass | Avg latency | Style ok (all replies) | Cost |', '|---|---|---|---|---|'];
  for (const [a, rs] of Object.entries(by)) {
    const p = rs.filter(r => r.pass).length, withReply = rs.filter(r => r.reply);
    const style = withReply.filter(r => styleCheck(r.reply).ok).length;
    const cost = rs.reduce((s, r) => s + (r.cost || 0), 0);
    L.push(`| ${a} | ${p}/${rs.length} | ${(rs.reduce((s, r) => s + r.ms, 0) / rs.length / 1000).toFixed(0)}s | ${style}/${withReply.length} | $${cost.toFixed(2)} |`);
  }
  const fails = rep.results.filter(r => !r.pass);
  L.push('', `## Failures (${fails.length})`, '');
  for (const r of fails) {
    const excerpt = (r.reply || '').replace(/\s+/g, ' ').slice(0, 280);
    L.push(`- **${r.id}** [${r.kind}] ${r.text}`, `  - expected: \`${JSON.stringify(r.truth)}\` · why: ${r.error || r.why}`,
      `  - got: ${excerpt || '(no reply)'}`);
  }
  return L.join('\n') + '\n';
}

async function main() {
  const o = args(process.argv.slice(2));
  let items = resolve();
  if (o.mode === 'truth') return truthMode(items);

  const errs = items.filter(i => i.error);
  if (errs.length) { errs.forEach(e => console.error(`truth error ${e.id}: ${e.error}`)); process.exit(1); }
  let skipped = items.filter(i => i.skip).length;
  items = items.filter(i => !i.skip);
  const noMd = new Set(items.map(i => i.q.agent).filter(a => o.mode === 'offline' && !existsSync(join(ROOT, 'switch', 'agents', `${a}.md`))));
  if (noMd.size) { console.log(`no instructions yet (skipped): ${[...noMd].join(', ')}`); skipped += items.filter(i => noMd.has(i.q.agent)).length; }
  items = items.filter(i => !noMd.has(i.q.agent));
  if (o.agents) items = items.filter(i => o.agents.includes(i.q.agent));
  if (o.failed) { const f = new Set(newestReport().results.filter(r => !r.pass).map(r => r.id)); items = items.filter(i => f.has(i.id)); }
  items = items.slice(0, o.limit);
  console.log(`${o.mode}: ${items.length} questions, model ${o.model}, concurrency ${o.concurrency}`);

  const ask = o.mode === 'live' ? askLive : askClaude;
  const results = [];
  // live: one question at a time per agent so replies don't mix
  const units = o.mode === 'live' ? Object.values(Object.groupBy(items, i => i.q.agent)) : items.map(i => [i]);
  await pool(units, o.concurrency, async group => {
    for (const it of group) {
      const a = await ask(it.q.agent, it.text, o);
      const s = a.error ? { pass: false, why: a.error } : score(it.q, it.truth, a.reply);
      results.push({ id: it.id, agent: it.q.agent, kind: it.q.kind, text: it.text, truth: it.truth, pass: s.pass, why: s.why, ...a });
      console.log(`${s.pass ? 'PASS' : 'FAIL'} ${it.id.padEnd(22)} ${(a.ms / 1000).toFixed(0)}s ${s.pass ? '' : s.why}`);
    }
  });
  results.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const at = new Date().toISOString();
  const rep = { at, mode: o.mode, model: o.mode === 'live' ? 'switch' : o.model, skipped,
    cost: results.reduce((s, r) => s + (r.cost || 0), 0), results };
  mkdirSync(REPORTS, { recursive: true });
  const file = join(REPORTS, `${at.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(rep, null, 2));
  writeFileSync(join(REPORTS, 'latest.md'), toMarkdown(rep));
  console.log(`\n${results.filter(r => r.pass).length}/${results.length} passed · $${rep.cost.toFixed(2)} · ${file} · evals/reports/latest.md`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exit(1); });
