// Regression check: a malformed WS frame must not crash the server, and POST /api/events must
// replace caller-supplied ids. Usage: npm run check (PORT defaults to 8790).
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import WebSocket from "ws";

const PORT = process.env.PORT ?? "8790";
const base = `http://localhost:${PORT}`;
const srv = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: new URL(".", import.meta.url), env: { ...process.env, PORT, OBSERVER_TOKEN: "", DATA_DIR: process.env.DATA_DIR ?? ".data/check" }, stdio: "inherit",
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const health = () => fetch(`${base}/api/health`).then((r) => r.ok, () => false);

try {
  for (let i = 0; i < 40 && !(await health()); i++) await sleep(250);
  assert.ok(await health(), "server did not start");

  // 1. bad frame: RSV2/RSV3 set + reserved opcode 0xF → ws 'error' on the server side
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  await new Promise((r, j) => { ws.on("open", r); ws.on("error", j); });
  ws._socket.write(Buffer.from([0xff, 0x80, 0, 0, 0, 0]));
  await new Promise((r) => { ws.on("close", r); setTimeout(r, 1000); });
  await sleep(300);
  assert.ok(await health(), "server died after malformed frame");

  // 2. poisoned id is replaced
  const res = await fetch(`${base}/api/events`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "x@99999999999999", t: 0, room: "ops", speaker: "d2c-ops", type: "message", text: "hi" }),
  });
  assert.equal(res.status, 201);
  const ev = await res.json();
  assert.notEqual(ev.id, "x@99999999999999");
  assert.match(ev.id, /^srv-/);
  console.log("check ok: survived bad frame; id replaced →", ev.id);
} finally {
  srv.kill("SIGTERM");
}
