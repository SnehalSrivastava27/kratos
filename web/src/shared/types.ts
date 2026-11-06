// Generated from contracts/ by the orchestrator. Do not edit in worker branches.
export type RoomId = 'war_room' | 'analytics' | 'ads' | 'creators' | 'ops' | 'design' | 'finance' | 'qa_lab';
export type EventType =
  | 'message' | 'assign' | 'working' | 'approval_needed'
  | 'pushback' | 'approved' | 'done' | 'artifact' | 'celebrate' | 'hired' | 'command';

export interface Transfer { sku: string; from: string; to: string; units: number }

export interface OfficeEvent {
  id: string;
  ws?: string; // workspace id, server-assigned (v3)
  t: number;
  room: RoomId;
  speaker: string; // person id from roster
  type: EventType;
  text: string;
  meta?: {
    targets?: string[];
    thread_id?: number; // Telegram forum topic id (message_thread_id)
    artifact_url?: string;
    ebitda?: number;
    transfers?: Transfer[];
    switch_room_id?: string; // observer → server (v3)
    room_name?: string;
  };
}

export interface Person {
  id: string; name: string; emoji: string;
  kind: 'human' | 'agent'; zone: string; color: string; group?: string;
  topic?: string; // roster v4: the forum topic this person posts in
  role?: string; // one-line job description
  lead?: boolean; // department lead (and the captain)
  reports_to?: string; // specialist → their department lead's id
}

/** contracts/roster.json `rooms[]`. `internal` rooms (QA Lab) never show in the UI. */
export interface Room { id: RoomId; label: string; zone: string; topic: string; internal?: boolean }

export interface Zone {
  id: string; label: string; x: number; z: number; w: number; d: number; props: string[];
  desks?: [number, number][]; // zone-local desk centres; desk id '<zone>#<i>'
}

/** GET /api/kpis (B3). Money in rupees; percentages as 0–100. */
export interface Kpis {
  updated: string; window: { from: string; to: string };
  net_revenue: number; orders: number; aov: number; rto_pct: number; return_pct: number;
  meta_roas: number; blended_roas: number; ebitda_last_month: number;
  by_channel: { channel: string; orders: number; net_revenue: number; rto_pct: number }[];
  top_skus: { sku: string; name: string; units: number; net_revenue: number }[];
}

export type AgentState = 'idle' | 'working' | 'walking' | 'waiting' | 'done';

// --- Read APIs (B1, contracts/api.md) ---
/** Server-derived person state (no 'walking': that is a client-side animation). */
export type DerivedAgentState = Exclude<AgentState, 'walking'>;

/** GET /api/rooms */
export interface RoomSummary {
  id: RoomId;
  label: string;
  group: string; // Telegram supergroup name (roster telegram.group), e.g. "Kratos D2C"
  topic: string; // forum topic in that group, e.g. "War Room"
  members: string[]; // person ids
  last: OfficeEvent | null;
  count: number; // stored events in this room
}

/** GET /api/agents */
export interface AgentSummary {
  id: string;
  name: string;
  kind: 'human' | 'agent';
  state: DerivedAgentState;
  last: OfficeEvent | null; // last event this person sent
  room: RoomId | null; // room of that event
}

/** GET /api/gallery */
export interface GalleryItem {
  name: string; url: string; size: number; mtime: number;
  title: string; // from gallery/index.json, else the file name
  sku: string | null;
}

/** GET /api/health */
export interface Health {
  ok: boolean; version: string; uptime: number; clients: number; history: number;
  db: 'ok' | 'memory' | 'error';
}

// ---- v2: hiring + skills library (contracts/api.md "Office actions") ----
export type ShelfId = 'war_room' | 'analytics' | 'ads' | 'creators' | 'ops' | 'design' | 'engineering' | 'general';

export interface Employee {
  id: string; name: string; role: string; room: RoomId; emoji: string; color: string;
  desk: string; // zone id + index, e.g. "growth_pod#2"
  hiredAt: number;
  switchAgentId: string | null;
  status: 'active' | 'pending_console';
}

export interface LibraryBook {
  id: string; name: string; description: string;
  source: string; // e.g. "~/.claude/skills", "gstack", "plugin:x"
  path?: string; // server-side SKILL.md path; omitted for non-loopback clients
  department: ShelfId;
  why: string; // librarian's one-line reason
}

export interface Library {
  updatedAt: number | null;
  librarian: 'idle' | 'working';
  shelves: { id: ShelfId; label: string; books: LibraryBook[] }[];
}

// ---- v3: accounts + workspaces (contracts/api.md "v3") ----
export interface User { id: string; email: string; name: string; createdAt: number }
export interface Workspace {
  id: string; name: string; switchRoomId: string; chatId: string | null; ownerId: string;
  topics: Partial<Record<RoomId, { threadId: number | null }>>;
  status: 'linking' | 'ready' | 'needs_admin';
  createdAt: number;
}
export type ConnectState = 'waiting' | 'linking' | 'needs_admin' | 'ready' | 'expired';
