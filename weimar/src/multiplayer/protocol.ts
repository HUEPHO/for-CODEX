import type { Action, Command, Faction, GameState, ScenarioId } from '../engine/types.ts';

export const NETWORK_VERSION = 'weimar-steam-1';
export const LOBBY_TAG = 'weimar-digital';
export interface Member {
  id: string;
  name: string;
}
export interface RoomInfo {
  id: string;
  host: string;
  version: number;
  scenario: ScenarioId;
  seats: Record<Faction, string | null>;
  members: Member[];
  ready: string[];
  started: boolean;
  paused: boolean;
}
export interface PlayerView {
  /** A display projection, never an input to the authoritative rule engine. */
  state: GameState;
  handCounts: Record<Faction, number>;
  deckCount: number;
  factions: Faction[];
  canAct: boolean;
  decisionActor: Faction;
  actions: { label: string; action: Action }[];
  pcActions: Record<string, { label: string; action: Action }[]>;
}
export interface RoomSnapshot {
  room: RoomInfo;
  view: PlayerView | null;
}
export type RoomRequest =
  | { type: 'sync' }
  | { type: 'seat'; faction: Faction; claim: boolean }
  | { type: 'ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'command'; revision: number; command: Command };
export type WireMessage =
  | {
      protocol: typeof NETWORK_VERSION;
      lobby: string;
      kind: 'request';
      id: string;
      request: RoomRequest;
    }
  | {
      protocol: typeof NETWORK_VERSION;
      lobby: string;
      kind: 'snapshot';
      id?: string;
      error?: string;
      snapshot: RoomSnapshot;
    };
export interface LobbySummary {
  id: string;
  name: string;
  scenario: string;
  members: number;
}
export interface DesktopStatus {
  available: boolean;
  appId: number;
  self: Member | null;
  error?: string;
  notice?: string;
  canResume: boolean;
  lobbyId?: string;
  snapshot: RoomSnapshot | null;
}
export interface SteamBridge {
  status(): Promise<DesktopStatus>;
  create(scenario: ScenarioId): Promise<void>;
  resume(save?: string): Promise<void>;
  list(): Promise<LobbySummary[]>;
  join(id: string): Promise<void>;
  leave(): Promise<void>;
  invite(): Promise<void>;
  request(request: RoomRequest): Promise<void>;
  exportSave(): Promise<string>;
  subscribe(listener: (status: DesktopStatus) => void): () => void;
}
declare global {
  interface Window {
    weimarSteam?: SteamBridge;
  }
}
