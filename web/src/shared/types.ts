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
