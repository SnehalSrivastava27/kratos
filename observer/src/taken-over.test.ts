// node --test observer/src/taken-over.test.ts — `taken_over` is final (SW7, docs internals/agent-connection).
// A fake Switch: the first stream is evicted `heartbeat_lapsed` (recoverable: the observer must reopen), the second
// `taken_over` (final: run() must reject instead of reopening).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { run, TakenOver, isTakenOver } from "./index.ts";

test("isTakenOver reads the evicted frame and the beat 409 body", () => {
  assert.equal(isTakenOver({ code: "taken_over", reason: "another stream attached" }), true);
  assert.equal(isTakenOver({ detail: { code: "taken_over", message: "…" } }), true);
  assert.equal(isTakenOver({ code: "heartbeat_lapsed" }), false);
  assert.equal(isTakenOver({ detail: { code: "no_stream" } }), false);
  assert.equal(isTakenOver(null), false);
});

test("evicted heartbeat_lapsed reconnects; evicted taken_over stops for good", async () => {
  let opens = 0;
  const srv = createServer((req, res) => {
    if (req.url?.includes("/events")) {
      opens++;
      const code = opens === 1 ? "heartbeat_lapsed" : "taken_over";
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end(`id: ${opens}\nevent: evicted\ndata: ${JSON.stringify({ code, reason: "test", room_id: null })}\n\n`);
    } else {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ result: [] }));
    }
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address() as AddressInfo;
  const creds = { agentId: "obs", apiEndpoint: `http://127.0.0.1:${port}`, token: "t" };
  const cfg = { server: "http://127.0.0.1:1", credentials: "", unknownSpeaker: null, ignoreSpeakers: [], speakers: {}, rooms: {} };
  try {
    await assert.rejects(run(creds, cfg), TakenOver);
    assert.equal(opens, 2); // reopened once after heartbeat_lapsed, never after taken_over
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(opens, 2);
  } finally {
    srv.close();
  }
});
