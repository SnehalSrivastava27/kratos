// Skills library: frontmatter, scan + dedupe, id → path allowlist, keyword shelves, Claude JSON validation, handler.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tsImport } from "tsx/esm/api";

const home = mkdtempSync(join(tmpdir(), "hq-lib-"));
process.env.LIBRARY_FILE = join(home, "library.json");
after(() => rmSync(home, { recursive: true, force: true }));

const scanMod = await tsImport("../src/library/scan.ts", import.meta.url);
const shelve = await tsImport("../src/library/shelve.ts", import.meta.url);
const lib = await tsImport("../src/library/index.ts", import.meta.url);

function skill(dir, text, mtime) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), text);
  if (mtime) utimesSync(join(dir, "SKILL.md"), mtime, mtime);
}

test("frontmatter: plain, quoted, block scalars, missing", () => {
  const { meta, body } = scanMod.parseFrontmatter("---\nname: qa\ndescription: >-\n  Test the app\n  and fix bugs.\nother: 'it''s'\n---\n# Body\n");
  assert.equal(meta.name, "qa");
  assert.equal(meta.description, "Test the app and fix bugs.");
  assert.equal(meta.other, "it's");
  assert.equal(body, "# Body\n");
  assert.equal(scanMod.parseFrontmatter('---\nname: "a \\"b\\""\n---\n').meta.name, 'a "b"');
  assert.deepEqual(scanMod.parseSkill("# Title\n\nFirst para\nline two.\n\nSecond.", "my-skill"), { name: "my-skill", description: "First para line two." });
  assert.equal(scanMod.parseSkill("---\nbroken: [\n---\nHello", "x").name, "x"); // odd frontmatter → folder name
});

test("scan: sources, symlinks, dedupe newest, plugin names", () => {
  const h = join(home, "h");
  const fm = (n, d) => `---\nname: ${n}\ndescription: ${d}\n---\nbody of ${n}\n`;
  skill(join(h, ".agents/skills/kun"), fm("kun", "Solve problems"));
  mkdirSync(join(h, ".claude/skills"), { recursive: true });
  symlinkSync(join(h, ".agents/skills/kun"), join(h, ".claude/skills/kun")); // same file twice
  skill(join(h, ".claude/skills/gstack"), fm("gstack", "Router"));
  skill(join(h, ".claude/skills/gstack/qa"), fm("qa", "QA (gstack)"));
  skill(join(h, ".claude/skills/qa"), fm("qa", "QA (gstack)")); // copy of gstack/qa
  skill(join(h, ".claude/skills/synced/bucket/pdf"), fm("pdf", "PDFs"));
  skill(join(h, ".claude/skills/hf"), fm("hf", "video"), 1000);
  skill(join(h, ".agents/skills/hf"), fm("hf", "video"), 2000); // identical content, newer → wins
  skill(join(h, ".claude/plugins/cache/mkt/posthog/1.2.3/skills/funnels"), fm("funnels", "old"), 1000);
  skill(join(h, ".claude/plugins/marketplaces/mkt/plugins/posthog/skills/funnels"), fm("funnels", "new"), 2000); // same id, newer wins
  mkdirSync(join(h, ".claude/plugins/marketplaces/mkt/plugins/posthog/skills/loop"), { recursive: true });
  symlinkSync(join(h, ".claude/plugins"), join(h, ".claude/plugins/marketplaces/mkt/plugins/posthog/skills/loop/up")); // symlink loop
  skill(join(h, ".claude/plugins/synced/x/uuid/skills/actor"), fm("actor", "scrape"));
  mkdirSync(join(h, ".claude/plugins/synced/x/uuid/.claude-plugin"), { recursive: true });
  writeFileSync(join(h, ".claude/plugins/synced/x/uuid/.claude-plugin/plugin.json"), '{"name":"apify"}');

  const books = scanMod.scan({ home: h });
  const ids = books.map((b) => b.id).sort();
  assert.deepEqual(ids, ["anthropic-skills:pdf", "gstack:gstack", "gstack:qa", "plugin:apify:actor", "plugin:posthog:funnels", "~/.agents/skills:hf", "~/.claude/skills:kun"]);
  assert.equal(books.find((b) => b.id === "plugin:posthog:funnels").description, "new");
  assert.equal(new Set(books.map((b) => b.path)).size, books.length);
});

test("book lookup: only indexed ids, never a path", () => {
  const index = shelve.buildLibrary(
    [{ id: "x:a", name: "a", description: "", source: "x", path: "/s/a/SKILL.md" }, { id: "x:evil", name: "evil", description: "", source: "x", path: "/etc/passwd" }],
    () => ({ department: "general", why: "" }), 1,
  );
  assert.equal(lib.findBook(index, "x:a").path, "/s/a/SKILL.md");
  assert.equal(lib.findBook(index, "x:evil"), undefined); // not a SKILL.md
  for (const id of ["../../etc/passwd", "/etc/passwd", "/s/a/SKILL.md", "x:a/../b", ""]) assert.equal(lib.findBook(index, id), undefined);
});

test("readBody strips frontmatter and caps size", () => {
  const d = join(home, "big");
  skill(d, "---\nname: big\n---\n" + "é".repeat(150_000));
  const md = scanMod.readBody(join(d, "SKILL.md"));
  assert.ok(!md.startsWith("---"));
  assert.ok(Buffer.byteLength(md) <= 200 * 1024 + 40);
  assert.ok(md.endsWith("(cut at 200 KB)"));
});

test("heuristic categoriser", () => {
  assert.equal(shelve.heuristic({ name: "meta-ads", description: "Run paid campaigns" }).department, "ads");
  assert.equal(shelve.heuristic({ name: "funnels", description: "Build a dashboard of conversion metrics" }).department, "ads");
  assert.equal(shelve.heuristic({ name: "sql", description: "Query the data warehouse" }).department, "analytics");
  assert.equal(shelve.heuristic({ name: "pptx", description: "Make slides" }).department, "design");
  assert.equal(shelve.heuristic({ name: "debugger", description: "Find and fix bugs" }).department, "engineering");
  assert.equal(shelve.heuristic({ name: "zzz", description: "Nothing here" }).department, "general");
});

test("Claude JSON validation + re-ask once, then general", async () => {
  const asked = new Set(["a", "b", "c"]);
  const got = shelve.parsePlacements('Sure!\n```json\n[{"id":"a","department":"design","why":"ui"},{"id":"b","department":"finance","why":"x"},{"id":"zz","department":"ads"}, 5]\n```', asked);
  assert.deepEqual([...got.keys()], ["a", "b"]);
  assert.equal(got.get("b").department, "general"); // unknown shelf
  assert.equal(shelve.parsePlacements("not json", asked).size, 0);

  const books = ["a", "b", "c"].map((id) => ({ id, name: id, description: "code review", source: "t", path: `/t/${id}/SKILL.md` }));
  const calls = [];
  const ask = async (p) => {
    calls.push(p);
    return calls.length === 1 ? '[{"id":"a","department":"ops","why":"w"}]' : '[{"id":"b","department":"ads","why":"w"}]';
  };
  const { placements, via } = await shelve.categorize(books, { ask });
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes('"b"') && !calls[1].includes('"id": "a"')); // re-ask only the missing ones
  assert.deepEqual([placements.get("a").department, placements.get("b").department, placements.get("c").department], ["ops", "ads", "general"]);
  assert.equal(via, "claude");

  const failing = await shelve.categorize(books, { ask: async () => { throw new Error("no claude"); } });
  assert.equal(failing.via, "heuristic");
  assert.equal(failing.placements.get("a").department, "engineering");
});

test("handler: paths hidden from untrusted, categorize needs trust", async () => {
  const b = { id: "t:a", name: "a", description: "d", source: "t", path: join(home, "big/SKILL.md"), department: "design", why: "w" };
  shelve.writeLibrary({ updatedAt: 1, librarian: "idle", shelves: [{ id: "design", label: "Design", books: [b] }] });
  const call = async (method, path, isTrusted) => {
    let status, body;
    const res = { writeHead: (s) => (status = s), end: (s) => (body = JSON.parse(s)) };
    const handled = await lib.handleLibrary({ method }, res, new URL(path, "http://x"), { isTrusted, emit: () => {} });
    return { handled, status, body };
  };
  let r = await call("GET", "/api/library", false);
  assert.equal(r.status, 200);
  assert.equal(r.body.shelves[0].books[0].path, undefined);
  assert.equal((await call("GET", "/api/library", true)).body.shelves[0].books[0].path, b.path);
  r = await call("GET", "/api/library/book?id=t:a", false);
  assert.equal(r.status, 200);
  assert.equal(r.body.book.path, undefined);
  assert.ok(r.body.markdown.length > 1000);
  assert.equal((await call("GET", "/api/library/book?id=../../etc/passwd", true)).status, 404);
  assert.equal((await call("POST", "/api/library/categorize", false)).status, 401);
  assert.equal((await call("GET", "/api/nope", true)).handled, false);
});
