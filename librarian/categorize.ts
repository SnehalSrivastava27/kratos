// npm run librarian [-- --dry-run]: scan every installed skill, shelve it with Claude Code, write data/library.json.
import { scan } from "../server/src/library/scan.ts";
import { categorize, buildLibrary, heuristic, writeLibrary, shelfSummary, claudeBin, LIBRARY_FILE, ROOT } from "../server/src/library/shelve.ts";

const dry = process.argv.includes("--dry-run");
const t0 = Date.now();
const secs = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const books = scan({ repo: ROOT });
const bySource: Record<string, number> = {};
for (const b of books) bySource[b.source] = (bySource[b.source] ?? 0) + 1;
console.log(`📚 found ${books.length} skills in ${secs()}`);
for (const [s, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${s}`);

if (dry) {
  console.log(`\n--dry-run: no Claude calls, nothing written. Keyword shelves would be:\n   ${shelfSummary(buildLibrary(books, heuristic, null))}`);
  console.log(`   (a real run sends ${Math.ceil(books.length / 40)} batches of ≤40 to ${claudeBin()})`);
} else {
  console.log(`\nasking ${claudeBin()} in batches of 40…`);
  const { placements, via } = await categorize(books, {
    log: (s) => console.error(`   ! ${s}`),
    onProgress: (p) => console.log(`   batch ${p.batch}/${p.batches} via ${p.via}: ${p.done}/${p.total} shelved (${secs()})`),
  });
  const lib = buildLibrary(books, (b) => placements.get(b.id) ?? heuristic(b), Date.now());
  writeLibrary(lib);
  console.log(`\n📚 shelved ${books.length} skills via ${via} in ${secs()} → ${LIBRARY_FILE}\n   ${shelfSummary(lib)}`);
}
