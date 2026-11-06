// The Librarian: puts each scanned book on a department shelf, via Claude Code headless or a keyword fallback.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ScannedBook } from "./scan.js";

export type ShelfId = "war_room" | "analytics" | "ads" | "creators" | "ops" | "design" | "engineering" | "general";
export interface LibraryBook { id: string; name: string; description: string; source: string; path?: string; department: ShelfId; why: string }
export interface Library { updatedAt: number | null; librarian: "idle" | "working"; shelves: { id: ShelfId; label: string; books: LibraryBook[] }[] }
export type Placement = { department: ShelfId; why: string };

export const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
export const LIBRARY_FILE = process.env.LIBRARY_FILE || join(ROOT, "data/library.json");
const PROMPT_FILE = join(ROOT, "librarian/prompt.md");

export const SHELVES: { id: ShelfId; label: string }[] = [
  { id: "war_room", label: "War Room" }, { id: "analytics", label: "Analytics" }, { id: "ads", label: "Ads" },
  { id: "creators", label: "Creators" }, { id: "ops", label: "Ops" }, { id: "design", label: "Design" },
  { id: "engineering", label: "Engineering" }, { id: "general", label: "General" },
];
const SHELF_IDS = new Set<string>(SHELVES.map((s) => s.id));

// ponytail: first matching keyword wins, in this order; the Claude run is the real categoriser.
const KEYWORDS: [ShelfId, RegExp][] = [
  ["ads", /\b(ads?|advertis\w*|campaigns?|seo|marketing|growth|meta ads|google ads|ppc|cac|roas|funnel|conversion|landing page)\b/i],
  ["analytics", /\b(analytics|metrics?|dashboards?|insights?|data|sql|queries|query|research|reports?|experiments?|a\/b|kpis?|warehouse|hogql|funnels?|cohorts?)\b/i],
  ["creators", /\b(content|influencers?|social|video|writ\w*|copy\w*|brand voice|blog|newsletter|captions?|podcast|tweets?|instagram|tiktok|youtube|narrat\w*)\b/i],
  ["design", /\b(design\w*|ui|ux|visual|brand|images?|slides?|decks?|figma|css|typograph\w*|colou?rs?|illustrat\w*|svg|diagrams?|mockups?|prototypes?|pptx|animation)\b/i],
  ["ops", /\b(ops|operations?|inventory|logistics|deploy\w*|infra\w*|monitor\w*|automat\w*|ci|cron|schedul\w*|workflows?|canary|release|docker|incident|alerts?|spreadsheets?|xlsx|email|calendar)\b/i],
  ["engineering", /\b(code|coding|review|tests?|testing|debug\w*|refactor\w*|api|sdk|typescript|python|react|git|pr|lint\w*|bugs?|cli|plugins?|hooks?|mcp|lsp|devtools?|compil\w*|programm\w*)\b/i],
  ["war_room", /\b(strateg\w*|plan\w*|roadmap|coordinat\w*|ceo|founder|decisions?|priorit\w*|okrs?|retro\w*|office hours)\b/i],
];

export function heuristic(b: { name: string; description: string }): Placement {
  const text = `${b.name.replace(/[-_]/g, " ")} ${b.description}`;
  for (const [department, re] of KEYWORDS) {
    const m = text.match(re);
    if (m) return { department, why: `keyword "${m[0].toLowerCase()}"` };
  }
  return { department: "general", why: "no department keyword" };
}

/** Pull `[{id, department, why}]` out of Claude's text; keeps only ids we asked about. Unknown department → general. */
export function parsePlacements(text: string, askedIds: Set<string>): Map<string, Placement> {
  const out = new Map<string, Placement>();
  const start = text.indexOf("["), end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return out;
  let arr: unknown;
  try { arr = JSON.parse(text.slice(start, end + 1)); } catch { return out; }
  if (!Array.isArray(arr)) return out;
  for (const r of arr) {
    if (!r || typeof r !== "object" || typeof r.id !== "string" || !askedIds.has(r.id)) continue;
    const dep = typeof r.department === "string" && SHELF_IDS.has(r.department) ? (r.department as ShelfId) : "general";
    out.set(r.id, { department: dep, why: typeof r.why === "string" ? r.why.replace(/\s+/g, " ").trim().slice(0, 200) : "" });
  }
  return out;
}

export const claudeBin = () => process.env.CLAUDE_BIN || (existsSync(join(homedir(), ".local/bin/claude")) ? join(homedir(), ".local/bin/claude") : "claude");

/** One headless Claude Code call (no tools), prompt on stdin; resolves with the model's text result. */
export function askClaude(prompt: string, timeoutMs = 240_000): Promise<string> {
  return new Promise((ok, fail) => {
    const p = spawn(claudeBin(), ["-p", "--output-format", "json", "--tools", "", "--no-session-persistence"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { p.kill("SIGKILL"); fail(new Error("claude timed out")); }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => { clearTimeout(timer); fail(e); });
    p.on("close", (code) => {
      clearTimeout(timer);
      try {
        const r = JSON.parse(out);
        if (r.is_error || typeof r.result !== "string") return fail(new Error(`claude error: ${String(r.result ?? r.subtype).slice(0, 200)}`));
        ok(r.result);
      } catch {
        fail(new Error(`claude exited ${code}: ${(err || out).slice(0, 200)}`));
      }
    });
    p.stdin.end(prompt);
  });
}

const batchPrompt = (template: string, books: ScannedBook[]) =>
  template + "\n\n" + JSON.stringify(books.map((b) => ({ id: b.id, name: b.name, description: b.description.slice(0, 300) })), null, 1);

export interface Progress { done: number; total: number; batch: number; batches: number; via: "claude" | "heuristic" }
export interface RunOpts { ask?: (prompt: string) => Promise<string>; batchSize?: number; concurrency?: number; onProgress?: (p: Progress) => void; log?: (s: string) => void }

/** Shelve every book. Per batch: ask, re-ask once for missing ids, then missing → general.
 *  A batch whose calls both fail (no claude, timeout, junk) falls back to the keyword heuristic. */
export async function categorize(books: ScannedBook[], opts: RunOpts = {}): Promise<{ placements: Map<string, Placement>; via: "claude" | "heuristic" | "mixed" }> {
  const { ask = askClaude, batchSize = 40, concurrency = 4, onProgress, log = () => {} } = opts;
  const placements = new Map<string, Placement>();
  let template = "";
  try { template = readFileSync(PROMPT_FILE, "utf8"); } catch {}
  const batches: ScannedBook[][] = [];
  for (let i = 0; i < books.length; i += batchSize) batches.push(books.slice(i, i + batchSize));
  let done = 0, claudeBatches = 0, next = 0;
  const one = async (bi: number) => {
    const batch = batches[bi];
    let missing = batch, viaClaude = false;
    for (let attempt = 0; attempt < 2 && missing.length && template; attempt++) {
      try {
        const got = parsePlacements(await ask(batchPrompt(template, missing)), new Set(missing.map((b) => b.id)));
        for (const [id, p] of got) placements.set(id, p);
        viaClaude ||= got.size > 0;
        missing = missing.filter((b) => !got.has(b.id));
      } catch (e) {
        log(`batch ${bi + 1}: ${(e as Error).message}`);
      }
    }
    for (const b of missing) placements.set(b.id, viaClaude ? { department: "general", why: "the librarian skipped it" } : heuristic(b));
    if (viaClaude) claudeBatches++;
    done += batch.length;
    onProgress?.({ done, total: books.length, batch: bi + 1, batches: batches.length, via: viaClaude ? "claude" : "heuristic" });
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, async () => { while (next < batches.length) await one(next++); }));
  return { placements, via: claudeBatches === batches.length ? "claude" : claudeBatches ? "mixed" : "heuristic" };
}

export function buildLibrary(books: ScannedBook[], place: (b: ScannedBook) => Placement, updatedAt: number | null): Library {
  const shelves = SHELVES.map((s) => ({ ...s, books: [] as LibraryBook[] }));
  for (const b of books) {
    const p = place(b);
    shelves.find((s) => s.id === p.department)!.books.push({ id: b.id, name: b.name, description: b.description, source: b.source, path: b.path, department: p.department, why: p.why });
  }
  for (const s of shelves) s.books.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { updatedAt, librarian: "idle", shelves };
}

export function writeLibrary(lib: Library, file = LIBRARY_FILE) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(lib, null, 1) + "\n");
  renameSync(tmp, file);
}

/** "Engineering 80 · Design 22 · …" (non-empty shelves, biggest first). */
export const shelfSummary = (lib: Library) =>
  lib.shelves.filter((s) => s.books.length).sort((a, b) => b.books.length - a.books.length).map((s) => `${s.label} ${s.books.length}`).join(" · ");
