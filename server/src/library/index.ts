// /api/library: the skills library (contracts/api.md "Office actions (v2)"). Mounted by server/src/index.ts.
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import type { OfficeEvent } from "../store.js";
import { scan, readBody } from "./scan.js";
import { buildLibrary, categorize, heuristic, writeLibrary, shelfSummary, LIBRARY_FILE, ROOT, SHELVES, type Library, type LibraryBook } from "./shelve.js";

export type LibraryCtx = { isTrusted: boolean; emit: (e: Omit<OfficeEvent, "id">) => void };

let running: string | null = null; // runId while the Librarian works
let fallback: { at: number; lib: Library } | null = null;

/** data/library.json, or (never shelved yet) a fresh scan on keyword shelves with updatedAt null, cached 60 s. */
export function loadLibrary(file = LIBRARY_FILE): Library {
  try {
    const lib = JSON.parse(readFileSync(file, "utf8")) as Library;
    if (Array.isArray(lib.shelves)) return lib;
  } catch {}
  if (!fallback || Date.now() - fallback.at > 60_000) fallback = { at: Date.now(), lib: buildLibrary(scan({ repo: ROOT }), heuristic, null) };
  return fallback.lib;
}

/** Only ids in the index resolve, and only to a SKILL.md: the id never becomes a path. */
export function findBook(lib: Library, id: string): LibraryBook | undefined {
  const b = lib.shelves.flatMap((s) => s.books).find((x) => x.id === id);
  return b?.path && /[\\/]SKILL\.md$/.test(b.path) ? b : undefined;
}

const publicBook = (b: LibraryBook, trusted: boolean): LibraryBook => (trusted ? b : { ...b, path: undefined });

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}

export async function runLibrarian(emit: LibraryCtx["emit"], log: (s: string) => void = () => {}): Promise<Library> {
  const say = (type: "working" | "done" | "message", text: string) => emit({ t: Date.now(), room: "war_room", speaker: "librarian", type, text });
  try {
    const books = scan({ repo: ROOT });
    say("working", `📚 Re-shelving ${books.length} skills…`);
    const { placements, via } = await categorize(books, {
      log,
      onProgress: (p) => p.done < p.total && say("working", `📚 Shelved ${p.done}/${p.total} skills…`),
    });
    const lib = buildLibrary(books, (b) => placements.get(b.id) ?? heuristic(b), Date.now());
    writeLibrary(lib);
    fallback = null;
    say("done", `📚 Shelved ${books.length} skills: ${shelfSummary(lib)}${via === "claude" ? "" : " (keyword shelving: Claude Code unavailable)"}`);
    return lib;
  } catch (e) {
    say("message", `📚 Couldn't re-shelve the library: ${(e as Error).message}`);
    throw e;
  }
}

export async function handleLibrary(req: IncomingMessage, res: ServerResponse, url: URL, ctx: LibraryCtx): Promise<boolean> {
  const method = req.method === "HEAD" ? "GET" : req.method;
  const route = `${method} ${url.pathname}`;

  if (route === "GET /api/library") {
    const lib = loadLibrary();
    send(res, 200, {
      ...lib,
      librarian: running ? "working" : "idle",
      shelves: lib.shelves.map((s) => ({ ...s, label: s.label ?? SHELVES.find((x) => x.id === s.id)?.label, books: s.books.map((b) => publicBook(b, ctx.isTrusted)) })),
    });
    return true;
  }
  if (route === "GET /api/library/book") {
    const book = findBook(loadLibrary(), url.searchParams.get("id") ?? "");
    if (!book) return send(res, 404, { error: "book not found" }), true;
    let markdown: string;
    try { markdown = readBody(book.path!); } catch { return send(res, 404, { error: "book file missing; re-shelve the library" }), true; }
    send(res, 200, { book: publicBook(book, ctx.isTrusted), markdown });
    return true;
  }
  if (route === "POST /api/library/categorize") {
    if (!ctx.isTrusted) return send(res, 401, { error: "unauthorized" }), true;
    if (running) return send(res, 409, { error: "the librarian is already working", runId: running }), true;
    const runId = `lib-${Date.now()}`;
    running = runId;
    runLibrarian(ctx.emit).catch(() => {}).finally(() => (running = null));
    send(res, 202, { ok: true, runId });
    return true;
  }
  return false;
}
