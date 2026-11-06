// `npm run mock`: a fake Switch agent bridge that speaks the real wire shapes
// (agent-protocol.md: connection_state, message envelopes with SSE ids, beat, ops/list_rooms),
// runs the real observer against it, then checks the office server received the mapped events.
// Needs the office server running: OFFICE_URL (default from config.json, http://localhost:8787).
import { createServer } from "node:http";
import { loadConfig, run } from "./index.ts";

const AGENT = "mock-observer";
const ROOMS = [
  { room_id: "r-war", name: "Kesar HQ · War Room" },
  { room_id: "r-fin", name: "Kesar HQ · Finance" },
  { room_id: "r-cre", name: "Kesar HQ · Creators" },
  { room_id: "r-x", name: "Random chat" }, // unknown → logged, skipped
];
const msg = (seq: number, room_id: string, sender_name: string, body: string) => ({
  type: "message", room_id, bridge_id: "b-telegram", channel_type: "channel_public", sequence: seq,
  payload: { addressed: false, sender: `@switch-x-${seq}:switch.local`, sender_name, message_id: `m${seq}`, body, timestamp: Date.now(), thread_id: null, attachments: [] },
});
const EVENTS = [
  msg(1, "r-war", "Snehal", "Plan our festive sale: 30% off, 5 days, ₹5L marketing budget"),
  msg(2, "r-war", "d2c-captain", "🎯 Festive sale · 30% off · 5 days · ₹5L\n@d2c-analyst forecast first, then @d2c-ads."),
  msg(3, "r-fin", "d2c-finance", "💰 Marketing ₹7.05L vs ₹5L budget\nEBITDA −₹0.76L ❌\n@d2c-influencers cut ₹2.05L"),
  msg(4, "r-x", "d2c-ops", "should be skipped: unknown room"),
  msg(5, "r-fin", "d2c-finance", "💰 Marketing ₹5L ✅ EBITDA +₹1.29L ✅\n@d2c-captain Finance approved"),
  msg(6, "r-war", "d2c-captain", "🎯 Final plan ready. Finance approved.\n@founder please approve?"),
];
const EXPECT = [
  ["war_room", "founder", "message"], ["war_room", "d2c-captain", "message"], ["finance", "d2c-finance", "pushback"],
  ["finance", "d2c-finance", "approved"], ["war_room", "d2c-captain", "approval_needed"],
];

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

bridge.listen(0, async () => {
  const cfg = loadConfig();
  const t0 = Date.now();
  const port = (bridge.address() as { port: number }).port;
  run({ agentId: AGENT, apiEndpoint: `http://127.0.0.1:${port}`, token: "mock-token" }, cfg);
  await new Promise((r) => setTimeout(r, 200 * EVENTS.length + 1500));
  const history = (await (await fetch(`${cfg.server}/api/history?limit=200`)).json()) as any[];
  const got = history.filter((e) => e.t >= t0 - 1000 && String(e.id).startsWith("srv-")).map((e) => [e.room, e.speaker, e.type]);
  const ok = JSON.stringify(got.slice(-EXPECT.length)) === JSON.stringify(EXPECT);
  console.log(ok ? `mock OK: ${EXPECT.length} events reached ${cfg.server}` : `mock FAILED\n want ${JSON.stringify(EXPECT)}\n got  ${JSON.stringify(got)}`);
  process.exit(ok ? 0 : 1);
});
