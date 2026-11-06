// Shared guards: repo paths, output paths, spec loading, limits.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const OUT_DIR = path.join(REPO, 'gallery', 'live-run');
export const LIMITS = { specBytes: 1_000_000, rows: 10_000, slides: 40, defaultRows: 200, timeoutMs: 60_000 };

export class KitError extends Error {}
export const fail = (msg) => { throw new KitError(msg); };

const inside = (p, root) => p === root || p.startsWith(root + path.sep);

// Resolve a user-given read path; only the repo and the OS temp dir are readable.
export function readablePath(p) {
  const abs = path.resolve(REPO, p);
  let real;
  try { real = fs.realpathSync(abs); } catch { fail(`not found: ${p}`); }
  const roots = [REPO, fs.realpathSync(os.tmpdir())].map((r) => fs.realpathSync(r));
  if (!roots.some((r) => inside(real, r))) fail(`path outside repo: ${p}`);
  return real;
}

// Spec: inline JSON (starts with "{") or a path to a .json file. Capped at 1 MB.
export function loadSpec(arg) {
  if (!arg) fail('missing spec (inline JSON or path to a .json file)');
  let text = arg;
  if (!arg.trimStart().startsWith('{')) {
    const p = readablePath(arg);
    if (fs.statSync(p).size > LIMITS.specBytes) fail('spec larger than 1 MB');
    text = fs.readFileSync(p, 'utf8');
  }
  if (Buffer.byteLength(text) > LIMITS.specBytes) fail('spec larger than 1 MB');
  let spec;
  try { spec = JSON.parse(text); } catch { fail('spec is not valid JSON'); }
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) fail('spec must be a JSON object');
  return spec;
}

// Output file name: [a-z0-9-_.] only, no dirs, no "..", extension forced. Lands in gallery/live-run/.
export function outPath(name, ext, fallback) {
  let n = String(name ?? fallback).toLowerCase();
  if (n.includes('/') || n.includes('\\') || n.includes('..') || path.isAbsolute(n)) fail(`bad output name: ${name}`);
  if (!/^[a-z0-9][a-z0-9-_.]{0,80}$/.test(n)) fail(`bad output name: ${name} (use a-z 0-9 - _ .)`);
  n = n.replace(/\.[a-z0-9]+$/, '') + ext;
  const abs = path.join(OUT_DIR, n);
  if (!inside(abs, OUT_DIR)) fail(`bad output name: ${name}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  // Refuse to follow a symlink planted in the output dir.
  try { if (fs.lstatSync(abs).isSymbolicLink()) fail(`refusing to overwrite symlink: ${n}`); } catch (e) { if (e instanceof KitError) throw e; }
  return abs;
}

export function writeOut(abs, data) {
  fs.writeFileSync(abs, data);
  const rel = path.relative(REPO, abs).split(path.sep).join('/');
  return { path: rel, url: '/' + rel, bytes: fs.statSync(abs).size };
}

export const str = (v, max = 2000) => (v == null ? '' : String(v).slice(0, max));
