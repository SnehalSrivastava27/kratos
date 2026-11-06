// Finds every installed SKILL.md ("book"). Read-only: never writes to a skill folder.
import { readdirSync, readFileSync, realpathSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";

export interface ScannedBook {
  id: string; // `${source}:${name}`
  name: string;
  description: string;
  source: string;
  path: string; // absolute, realpath'd SKILL.md
  hash: string;
  mtime: number;
}

const DESC_MAX = 1000;
const SKIP = new Set(["node_modules", ".git", ".trash"]);

/** `name` and `description` from YAML frontmatter (subset: plain, quoted, block `|`/`>` and multi-line plain scalars). */
export function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const m = text.replace(/^﻿/, "").match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { meta: {}, body: text };
  const lines = m[1].split(/\r?\n/);
  const meta: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_][\w-]*):(?:\s+(.*))?$/);
    if (!kv) continue;
    let v = (kv[2] ?? "").trim();
    const cont: string[] = []; // more-indented lines that follow belong to this key
    while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1].trim() === "")) cont.push(lines[++i].trim());
    if (/^[|>][+-]?\d*$/.test(v)) v = cont.join(v[0] === "|" ? "\n" : " ");
    else if (/^"/.test(v)) {
      const raw = [v, ...cont].join(" ");
      try { v = JSON.parse(raw.slice(0, raw.lastIndexOf('"') + 1)); } catch { v = raw.replace(/^"|"$/g, ""); }
    } else if (/^'/.test(v)) v = [v, ...cont].join(" ").replace(/^'|'\s*$/g, "").replace(/''/g, "'");
    else v = [v, ...cont].join(" ");
    meta[kv[1]] = v.replace(/\s+/g, " ").trim();
  }
  return { meta, body: text.slice(m[0].length) };
}

/** First prose paragraph of a markdown body (headings, fences, html comments skipped). */
function firstParagraph(body: string): string {
  for (const para of body.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n\s*\r?\n/)) {
    const p = para.split(/\r?\n/).filter((l) => !/^\s*(#|```|---|<)/.test(l)).join(" ").trim();
    if (p) return p;
  }
  return "";
}

export function parseSkill(text: string, folder: string): { name: string; description: string } {
  const { meta, body } = parseFrontmatter(text);
  const name = (meta.name || folder).trim();
  const description = (meta.description || firstParagraph(body)).replace(/\s+/g, " ").trim().slice(0, DESC_MAX);
  return { name, description };
}

const isVersion = (s: string) => /^v?\d+(\.\d+)*([-+].*)?$/.test(s) || /^[0-9a-f]{7,40}$/.test(s);

/** Plugin name for a `.../skills` dir: nearest .claude-plugin/plugin.json, else the first meaningful path segment. */
export function pluginName(skillsDir: string, pluginsRoot: string): string {
  for (let d = dirname(skillsDir); d.startsWith(pluginsRoot) && d !== pluginsRoot; d = dirname(d)) {
    try {
      const n = JSON.parse(readFileSync(join(d, ".claude-plugin", "plugin.json"), "utf8")).name;
      if (typeof n === "string" && n) return n;
    } catch {}
  }
  const segs = dirname(skillsDir).slice(pluginsRoot.length).split(sep).filter(Boolean);
  for (let i = segs.length - 1; i >= 0; i--) if (!isVersion(segs[i]) && !segs[i].startsWith(".") && !/^(plugins|external_plugins|skills)$/.test(segs[i])) return segs[i];
  return "unknown";
}

type Found = { file: string; source: string };

/** `<dir>/<child>/SKILL.md` for every child folder (symlinks followed). */
function childSkills(dir: string, source: (folder: string) => string): Found[] {
  let names: string[];
  try { names = readdirSync(dir); } catch { return []; }
  return names
    .filter((n) => !n.startsWith(".") && !SKIP.has(n))
    .map((n) => ({ file: join(dir, n, "SKILL.md"), source: source(n) }))
    .filter((f) => existsSync(f.file));
}

/** Every `skills/<x>/SKILL.md` below `root`, walking realpaths once each (no symlink loops). */
function pluginSkills(root: string, maxDepth = 8): Found[] {
  const out: Found[] = [];
  const seen = new Set<string>();
  let realRoot: string;
  try { realRoot = realpathSync(root); } catch { return out; }
  const walk = (dir: string, depth: number) => {
    let real: string;
    try { real = realpathSync(dir); } catch { return; }
    if (seen.has(real) || depth > maxDepth) return;
    seen.add(real);
    if (basename(dir) === "skills") out.push(...childSkills(dir, () => `plugin:${pluginName(dir, realRoot)}`));
    let ents;
    try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) if (!SKIP.has(e.name) && (e.isDirectory() || e.isSymbolicLink())) walk(join(dir, e.name), depth + 1);
  };
  walk(realRoot, 0);
  return out;
}

export interface ScanRoots { home?: string; repo?: string }

export function scan({ home = homedir(), repo }: ScanRoots = {}): ScannedBook[] {
  const claudeSkills = join(home, ".claude", "skills");
  const synced = join(claudeSkills, "synced");
  const gstack = (folder: string) => folder === "gstack" || existsSync(join(claudeSkills, "gstack", folder, "SKILL.md"));
  const found: Found[] = [
    ...childSkills(claudeSkills, (f) => (gstack(f) ? "gstack" : "~/.claude/skills")),
    ...(() => { try { return readdirSync(synced).flatMap((b) => childSkills(join(synced, b), () => "anthropic-skills")); } catch { return []; } })(),
    ...childSkills(join(home, ".agents", "skills"), () => "~/.agents/skills"),
    ...pluginSkills(join(home, ".claude", "plugins")),
    ...(repo ? childSkills(join(repo, ".claude", "skills"), () => "repo") : []),
  ];
  const books: ScannedBook[] = [];
  const realSeen = new Set<string>();
  for (const f of found) {
    let path: string, text: string, mtime: number;
    try {
      path = realpathSync(f.file);
      if (realSeen.has(path) || !statSync(path).isFile()) continue;
      realSeen.add(path);
      text = readFileSync(path, "utf8");
      mtime = statSync(path).mtimeMs;
    } catch { continue; }
    const { name, description } = parseSkill(text, basename(dirname(f.file)));
    const source = f.source === "~/.claude/skills" && /\(gstack\)\s*$/.test(description) ? "gstack" : f.source;
    books.push({ id: `${source}:${name}`, name, description, source, path, mtime, hash: createHash("sha1").update(text).digest("hex") });
  }
  return dedupe(books);
}

/** Same name + content (copies, plugin cache vs marketplace) or same id (two versions): keep the newest; ties keep the first found. */
export function dedupe(books: ScannedBook[]): ScannedBook[] {
  const keep = new Map<string, ScannedBook>();
  const byContent = new Map<string, string>(); // name+hash -> id kept
  for (const b of books) {
    const ck = `${b.name}\0${b.hash}`;
    const prevId = byContent.get(ck);
    const prev = prevId ? keep.get(prevId) : keep.get(b.id);
    if (prev && prev.mtime >= b.mtime) continue;
    if (prev) keep.delete(prev.id);
    const other = keep.get(b.id); // replacing a content-dup may still collide with another book's id
    if (other && other.mtime >= b.mtime) continue;
    keep.set(b.id, b);
    byContent.set(ck, b.id);
  }
  return [...keep.values()];
}

/** SKILL.md body without frontmatter, capped at `max` bytes. */
export function readBody(path: string, max = 200 * 1024): string {
  const { body } = parseFrontmatter(readFileSync(path, "utf8"));
  const buf = Buffer.from(body, "utf8");
  return buf.length <= max ? body : buf.subarray(0, max).toString("utf8").replace(/�$/, "") + "\n\n…(cut at 200 KB)";
}
