// Generated from contracts/ by the orchestrator. Do not edit in worker branches.
export type RoomId = 'war_room' | 'analytics' | 'ads' | 'creators' | 'ops' | 'design';
export type EventType =
  | 'message' | 'assign' | 'working' | 'approval_needed'
  | 'pushback' | 'approved' | 'done' | 'artifact' | 'celebrate';

export interface Transfer { sku: string; from: string; to: string; units: number }

export interface OfficeEvent {
  id: string;
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
  };
}

export interface Person {
  id: string; name: string; emoji: string;
  kind: 'human' | 'agent'; zone: string; color: string; group?: string;
}

export interface Zone {
  id: string; label: string; x: number; z: number; w: number; d: number; props: string[];
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
export interface GalleryItem { name: string; url: string; size: number; mtime: number }

/** GET /api/health */
export interface Health {
  ok: boolean; version: string; uptime: number; clients: number; history: number;
  db: 'ok' | 'memory' | 'error';
}
