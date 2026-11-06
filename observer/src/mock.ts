// `npm run mock`: a fake Switch agent bridge that speaks the real wire shapes
// (agent-protocol.md: connection_state, message envelopes with SSE ids, beat, ops/list_rooms), runs the real observer
// against it and a fake office server, then checks what the observer POSTed to /api/events.
// No Switch and no office server needed (v3: the office maps rooms/topics; the observer only tags them).
import { createServer } from "node:http";
import { loadConfig, run } from "./index.ts";

const AGENT = "mock-observer";
const ROOMS = [
  { room_id: "r-kd", name: "Telegram: Kratos D2C", external_channel_id: -1001 },
  { room_id: "r-x", name: "Random chat" }, // no chat id known: forwarded anyway (the server may link it)
];
const msg = (seq: number, room_id: string, sender_name: string, body: string, thread_id: string | null = null) => ({
  type: "message", room_id, bridge_id: "b-telegram", channel_type: "channel_public", sequence: seq,
  payload: { addressed: false, sender: `@switch-x-${seq}:switch.local`, sender_name, message_id: `m${seq}`, body, timestamp: Date.now(), thread_id, attachments: [] },
});
const EVENTS = [
  msg(1, "r-kd", "Snehal", "Plan our festive sale: 30% off, 5 days, ₹5L marketing budget", "ev-war"),
  msg(2, "r-kd", "d2c-captain", "🎯 Festive sale · 30% off · 5 days · ₹5L\n@d2c-analyst forecast first, then @d2c-ads.", "ev-war"),
  msg(3, "r-kd", "d2c-ads", "📣 Meta split ₹3L · ROAS 3.4 ❌ cut retargeting", "ev-ads"),
  msg(4, "r-x", "Someone", "482913"), // a link code from a group no workspace has yet
  msg(5, "r-kd", "d2c-ops", "🚚 Transfers booked ✅ approved", null),
  msg(6, "r-kd", "Switch", "ignored: Switch's own voice"),
];
// [room guess, speaker, type, switch_room_id, room_name, chat_id, switch_thread_id, targets]
const EXPECT = [
  ["war_room", "founder", "message", "r-kd", "Telegram: Kratos D2C", "-1001", "ev-war", null],
  ["war_room", "d2c-captain", "message", "r-kd", "Telegram: Kratos D2C", "-1001", "ev-war", ["d2c-analyst", "d2c-ads"]],
  ["ads", "d2c-ads", "pushback", "r-kd", "Telegram: Kratos D2C", "-1001", "ev-ads", null],
  ["war_room", "founder", "message", "r-x", "Random chat", null, null, null],
  ["ops", "d2c-ops", "approved", "r-kd", "Telegram: Kratos D2C", "-1001", null, null],
];

const posted: any[] = [];
const office = createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  if (req.method === "POST" && req.url === "/api/events") posted.push(JSON.parse(body));
  res.writeHead(req.url === "/api/people" ? 200 : 201, { "content-type": "application/json" }).end(req.url === "/api/people" ? "[]" : "{}");
});

const bridge = createServer((req, res) => {
  const path = req.url!.split("?")[0];
  if (req.headers.authorization !== "Bearer mock-token") return res.writeHead(401).end();
  if (req.method === "GET" && path === `/agents/${AGENT}/events`) {
    res.writeHead(200, { "content-type": "text/event-stream" });
    const conn = new URL(req.url!, "http://x").searchParams.get("connection_id");
    res.write(`event: connection_state\ndata: ${JSON.stringify({ connection_id: conn, agent_id: AGENT, scope: "all", filter: "all", rooms: [], cursor: 0, heartbeat_interval_seconds: 2 })}\n\n`);
    res.write(": keepalive\n\n");
    EVENTS.forEach((e, i) => setTimeout(() => res.write(`id: ${e.sequence}\nevent: message\ndata: ${JSON.stringify(e)}\n\n`), 200 * (i + 1)));
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  if (path === `/agents/${AGENT}/connection/beat`) return res.end(JSON.stringify({ ok: true, rooms: [], cursor: 0 }));
  if (path === `/agents/${AGENT}/ops/list_rooms`) return res.end(JSON.stringify({ result: ROOMS }));
  res.writeHead(404).end();
});

office.listen(0, () => bridge.listen(0, async () => {
  const cfg = { ...loadConfig(), server: `http://127.0.0.1:${(office.address() as { port: number }).port}` };
  const port = (bridge.address() as { port: number }).port;
  run({ agentId: AGENT, apiEndpoint: `http://127.0.0.1:${port}`, token: "mock-token" }, cfg);
  await new Promise((r) => setTimeout(r, 200 * EVENTS.length + 1500));
  const got = posted.map((e) => [e.room, e.speaker, e.type, e.meta?.switch_room_id, e.meta?.room_name ?? null, e.meta?.chat_id ?? null, e.meta?.switch_thread_id ?? null, e.meta?.targets ?? null]);
  const ok = JSON.stringify(got) === JSON.stringify(EXPECT);
  console.log(ok ? `mock OK: ${EXPECT.length} events forwarded with their Switch room` : `mock FAILED\n want ${JSON.stringify(EXPECT)}\n got  ${JSON.stringify(got)}`);
  process.exit(ok ? 0 : 1);
}));
