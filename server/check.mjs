// Regression check: a malformed WS frame must not crash the server, and POST /api/events must
// replace caller-supplied ids. Usage: npm run check (PORT defaults to 8790). Never touches Switch or Telegram:
// the linked workspace stays "linking", which is enough for a signed-in socket and scoped events.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import WebSocket from "ws";

const PORT = process.env.PORT ?? "8790";
const base = `http://localhost:${PORT}`;
const srv = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd: new URL(".", import.meta.url),
  env: { ...process.env, PORT, OBSERVER_TOKEN: "", DATA_DIR: process.env.DATA_DIR ?? `.data/check-${Date.now()}`,
    SWITCH_CORE_ENV: "/nonexistent", TELEGRAM_BOT_TOKEN: "", ENV_FILE: "/nonexistent", TOPICS_FILE: "/nonexistent" },
  stdio: "inherit",
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const health = () => fetch(`${base}/api/health`).then((r) => r.ok, () => false);

try {
  for (let i = 0; i < 40 && !(await health()); i++) await sleep(250);
  assert.ok(await health(), "server did not start");

  // 0. an account with a (linking) workspace on Switch room "check-room"
  const json = { "content-type": "application/json", origin: base };
  const signup = await fetch(`${base}/api/auth/signup`, { method: "POST", headers: json, body: JSON.stringify({ email: `check${Date.now()}@example.com`, password: "check-password" }) });
  const cookie = signup.headers.get("set-cookie").split(";")[0];
  const { code } = await (await fetch(`${base}/api/workspaces/connect`, { method: "POST", headers: { ...json, cookie } })).json();
  const meta = { switch_room_id: "check-room", room_name: "Check", chat_id: "-1" };
  const post = (body) => fetch(`${base}/api/events`, { method: "POST", headers: json, body: JSON.stringify({ t: 0, room: "ops", speaker: "d2c-ops", type: "message", meta, ...body }) });
  assert.equal((await post({ text: code })).status, 202);

  // 1. bad frame: RSV2/RSV3 set + reserved opcode 0xF → ws 'error' on the server side
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`, { headers: { cookie } });
  await new Promise((r, j) => { ws.on("open", r); ws.on("error", j); });
  ws._socket.write(Buffer.from([0xff, 0x80, 0, 0, 0, 0]));
  await new Promise((r) => { ws.on("close", r); setTimeout(r, 1000); });
  await sleep(300);
  assert.ok(await health(), "server died after malformed frame");

  // 2. poisoned id is replaced
  const res = await post({ id: "x@99999999999999", text: "hi" });
  assert.equal(res.status, 201);
  const ev = await res.json();
  assert.notEqual(ev.id, "x@99999999999999");
  assert.match(ev.id, /^srv-/);
  console.log("check ok: survived bad frame; id replaced →", ev.id);
} finally {
  srv.kill("SIGTERM");
}
