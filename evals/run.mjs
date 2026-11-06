#!/usr/bin/env node
// QA Lab evals. Modes: --truth (no LLM), --offline (default, `claude -p` per question), --live (B3 admin API).
// Filters: --agent a,b  --tier 1|2  --limit N  --failed (rerun failures of the newest report). Options: --model haiku
// --concurrency 4  --timeout 180 (seconds). Live: SERVER_URL (default http://localhost:8787), ADMIN_TOKEN.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, openDb, score, styleCheck, badTool, pctile } from './lib.mjs';
import { questions } from './questions.mjs';

const REPORTS = join(ROOT, 'evals', 'reports');
const QA_LINE = '\n\nQA LAB: this message comes from the QA Lab topic. It is a quick test question. ' +
  'Answer it yourself, right now, in your reply text, in your normal Telegram style. ' +
  'Do not post to Telegram, do not tag or wait for teammates.';

function args(argv) {
  const o = { mode: 'offline', model: 'haiku', concurrency: 4, timeout: 180, agents: null, limit: Infinity, failed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = () => argv[++i];
    if (a === '--truth' || a === '--offline' || a === '--live') o.mode = a.slice(2);
    else if (a === '--model') o.model = v();
    else if (a === '--agent') o.agents = v().split(',');
    else if (a === '--tier') o.tier = Number(v());
    else if (a === '--limit') o.limit = Number(v());
    else if (a === '--concurrency') o.concurrency = Number(v());
    else if (a === '--timeout') o.timeout = Number(v());
    else if (a === '--failed') o.failed = true;
    else if (a === '--workspace') o.workspace = v();
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
    if (it.error || (it.q.kind === 'number' && !Number.isFinite(it.truth)) || (it.q.kind === 'oneof' && !it.truth?.length)) {
      bad++; console.error(`FAIL ${it.id}  ${it.error || `bad truth: ${JSON.stringify(it.truth)}`}`); continue;
    }
    console.log(`ok   ${it.id.padEnd(22)} [${it.q.kind}] ${it.text}\n     => ${JSON.stringify(it.truth)}`);
  }
  const n = items.filter(i => !i.skip).length;
  console.log(`\n${n - bad}/${n} truths computed, ${items.length - n} skipped`);
  if (bad) process.exit(1);
}

// ---------- offline: claude -p ----------
// Locked down: only the kit, Read/Grep/Glob; dontAsk denies anything else (read-only shell commands still run);
// project settings only (no user hooks). stream-json gives the tool calls (safety scoring, tool-call count) and cost.
function askClaude(agent, text, o) {
  const md = readFileSync(join(ROOT, 'switch', 'agents', `${agent}.md`), 'utf8');
  const argv = ['-p', text, '--append-system-prompt', md + QA_LINE,
    '--tools', 'Bash,Read,Grep,Glob', '--allowedTools', 'Bash(node kit/bin/kit.mjs:*)', 'Read', 'Grep', 'Glob',
    '--permission-mode', 'dontAsk', '--setting-sources', 'project',
    '--output-format', 'stream-json', '--verbose', '--model', o.model, '--no-session-persistence', '--strict-mcp-config'];
  return new Promise(res => {
    const t0 = Date.now();
    const p = spawn('claude', argv, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    const kill = setTimeout(() => p.kill('SIGKILL'), o.timeout * 1000);
    p.on('close', code => {
      clearTimeout(kill);
      const ms = Date.now() - t0, tools = [];
      let j = null;
      for (const line of out.split('\n')) {
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.type === 'assistant') for (const c of m.message?.content ?? []) if (c.type === 'tool_use') tools.push({ name: c.name, input: c.input });
        if (m.type === 'result') j = m;
      }
      if (!j) return res({ reply: '', ms, cost: null, tools, error: ms >= o.timeout * 1000 ? 'timeout' : `exit ${code}: ${(err || out).slice(0, 200)}` });
      res({ reply: j.result ?? '', ms, cost: j.total_cost_usd ?? null, tools, error: j.is_error ? String(j.result || j.subtype || 'is_error').slice(0, 200) : null });
    });
  });
}

// ---------- live: B3 admin API ----------
export async function askLive(agent, text, o, base = process.env.SERVER_URL || 'http://localhost:8787') {
  const h = { authorization: `Bearer ${process.env.ADMIN_TOKEN || ''}`, 'content-type': 'application/json' };
  const t0 = Date.now();
  const ws = o.workspace || process.env.EVALS_WORKSPACE;   // required by the API when >1 workspace is ready
  const r = await fetch(`${base}/api/qa/ask`, { method: 'POST', headers: h, body: JSON.stringify({ agent, text, ...(ws && { workspace: ws }) }) });
  if (!r.ok) return { reply: '', ms: 0, cost: null, error: `ask HTTP ${r.status}: ${(await r.text()).slice(0, 120)}` };
  const a = await r.json().catch(() => ({}));
  const qs = new URLSearchParams({ after: String(a.sentAt ?? t0), agent, ...((a.workspace || ws) && { workspace: a.workspace || ws }) });
  const poll = o.pollMs ?? 3000;
  let got = [], quiet = 0;
  while (Date.now() - t0 < o.timeout * 1000) {
    await new Promise(s => setTimeout(s, poll));
    const q = await fetch(`${base}/api/qa/replies?${qs}`, { headers: h });
    if (!q.ok) return { reply: '', ms: Date.now() - t0, cost: null, error: `replies HTTP ${q.status}` };
    // OfficeEvent[]; keep the agent's own words, drop "working" pings and the command echo
    const list = (await q.json()).filter(e => e.speaker === agent && e.type !== 'working' && e.type !== 'command');
    // ponytail: done after 2 polls with nothing new; an agent that pauses longer between parts gets cut.
    if (list.length && list.length === got.length) { if (++quiet >= 2) break; } else quiet = 0;
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

const sec = ms => `${(ms / 1000).toFixed(0)}s`;
const frac = rs => `${rs.filter(r => r.pass).length}/${rs.length}`;
const avgCalls = rs => { const c = rs.filter(r => r.tools); return c.length ? (c.reduce((s, r) => s + r.tools.length, 0) / c.length).toFixed(1) : '-'; };
export function toMarkdown(rep) {
  const by = {};
  for (const r of rep.results) (by[r.agent] ??= []).push(r);
  const all = rep.results, tier = n => all.filter(r => (r.tier ?? 1) === n);
  const L = [`# QA Lab evals — ${rep.mode} (${rep.model}) — ${rep.at}`, '',
    `**Score: ${frac(all)}** (tier 1 ${frac(tier(1))}, tier 2 ${frac(tier(2))})` +
    ` · latency p50 ${sec(pctile(all.map(r => r.ms), 50))}, p90 ${sec(pctile(all.map(r => r.ms), 90))} · ${avgCalls(all)} tool calls/question` +
    (rep.cost ? ` · cost $${rep.cost.toFixed(2)}` : '') + (rep.skipped ? ` · ${rep.skipped} skipped` : ''), '',
    '| Agent | Tier 1 | Tier 2 | p50 latency | Tool calls | Style ok (all replies) | Cost |', '|---|---|---|---|---|---|---|'];
  for (const [a, rs] of Object.entries(by)) {
    const withReply = rs.filter(r => r.reply), style = withReply.filter(r => styleCheck(r.reply).ok).length;
    const cost = rs.reduce((s, r) => s + (r.cost || 0), 0);
    L.push(`| ${a} | ${frac(rs.filter(r => (r.tier ?? 1) === 1))} | ${frac(rs.filter(r => r.tier === 2))} | ${sec(pctile(rs.map(r => r.ms), 50))} | ` +
      `${avgCalls(rs)} | ${style}/${withReply.length} | $${cost.toFixed(2)} |`);
  }
  const kinds = [...new Set(all.map(r => r.kind))];
  L.push('', 'By kind: ' + kinds.map(k => `${k} ${frac(all.filter(r => r.kind === k))}`).join(' · '));
  const offKit = all.filter(r => r.tools?.some(badTool));
  if (offKit.length) L.push('', `Off-kit tool calls (any question): ${offKit.map(r => r.id).join(', ')}`);
  const fails = all.filter(r => !r.pass);
  L.push('', `## Failures (${fails.length})`, '');
  for (const r of fails) {
    const excerpt = (r.reply || '').replace(/\s+/g, ' ').slice(0, 280);
    L.push(`- **${r.id}** [T${r.tier ?? 1} ${r.kind}] ${r.text}`, `  - expected: \`${JSON.stringify(r.truth)}\` · why: ${r.error || r.why}`,
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
  if (o.tier) items = items.filter(i => i.q.tier === o.tier);
  // --failed: rerun the newest report's failures and merge the new results into it
  const prev = o.failed ? newestReport() : null;
  if (prev) { const f = new Set(prev.results.filter(r => !r.pass).map(r => r.id)); items = items.filter(i => f.has(i.id)); }
  items = items.slice(0, o.limit);
  console.log(`${o.mode}: ${items.length} questions, model ${o.model}, concurrency ${o.concurrency}`);

  const ask = o.mode === 'live' ? askLive : askClaude;
  const results = [];
  // live: one question at a time per agent so replies don't mix
  const units = o.mode === 'live' ? Object.values(Object.groupBy(items, i => i.q.agent)) : items.map(i => [i]);
  await pool(units, o.concurrency, async group => {
    for (const it of group) {
      const a = await ask(it.q.agent, it.text, o);
      const s = a.error ? { pass: false, why: a.error } : score(it.q, it.truth, a.reply, a.tools);
      results.push({ id: it.id, agent: it.q.agent, tier: it.q.tier, kind: it.q.kind, text: it.text, truth: it.truth, pass: s.pass, why: s.why, ...a });
      console.log(`${s.pass ? 'PASS' : 'FAIL'} ${it.id.padEnd(22)} ${(a.ms / 1000).toFixed(0)}s ${a.tools ? a.tools.length + ' calls ' : ''}${s.pass ? '' : s.why}`);
    }
  });
  if (prev) { const done = new Set(results.map(r => r.id)); results.push(...prev.results.filter(r => !done.has(r.id))); }
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
