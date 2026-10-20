import type { FlowState, Program, FlowContext, Receipt } from './flow/protocol.ts';
import type { DomainJob } from './flow/domain-types.ts';
export const FACTIONS = ['Coalition', 'KPD', 'NSDAP', 'RC'] as const;
export type Faction = (typeof FACTIONS)[number];
export type FactionValues = Record<Faction, number>;
export type Era = 'crisis' | 'golden' | 'decline';
export type ScenarioId = 'fate' | 'revolution' | 'new-hope' | 'black-sun';
export type Phase =
  'order' | 'action' | 'sudden-victory' | 'election' | 'timeline' | 'upkeep' | 'finished';
export type PieceKind =
  | 'leverage'
  | 'cadre'
  | 'reform'
  | 'strike'
  | 'assassination'
  | 'clique'
  | 'mcs'
  | 'freikorps'
  | 'reichswehr'
  | 'militia'
  | 'sa';
export interface Piece {
  id: string;
  kind: PieceKind;
  owner: Faction | null;
  location: string;
  side?: 'strike' | 'uprising' | 'left' | 'right';
  /** Hidden until revealed. Never render this field for unrevealed Freikorps. */
  allegiance?: 'Coalition' | 'RC';
  revealed?: boolean;
}
export interface Holding {
  id: string;
  label: string;
  kind: PieceKind;
  owner: Faction | null;
  group: string;
  level: number;
  track?: 'progress' | 'reaction' | 'us' | 'ussr' | 'economy';
}
export interface CardInstance {
  uid: string;
  card: number;
}
export interface CardDefinition {
  id: number;
  title: string;
  name: string;
  era: Era;
  image: string;
  status: 'implemented' | 'pending';
  mandatory: boolean;
  election: boolean;
  lingering: boolean;
  expires?: Era;
  requires?: number;
  cancels?: number;
  summary: string;
}
export interface SpaceDefinition {
  id: string;
  name: string;
  nameZh: string;
  region: string;
  kind: string;
  population: number;
  politicalValue: number;
  adjacent: string[];
}
export interface TurnState {
  mode: 'unselected' | 'single' | 'event-first' | 'event-last' | 'pass';
  actionsLeft: number;
  eventDone: boolean;
  cardUid?: string;
  placed: string[];
  removed: string[];
  pcUsed: boolean;
  assaulted: string[];
}
export type CombatSide = 'attacker' | 'defender';
export interface CombatState {
  space: string;
  attacker: Faction;
  defender: Faction;
  free: boolean;
  stage: string;
  participants: Record<string, CombatSide>;
  asked: string[];
  ignored: string[];
  support: Record<CombatSide, number>;
  strength: Record<CombatSide, number>;
  dice: Record<CombatSide, number>;
  hits: Record<CombatSide, number>;
  casualties: string[];
  cancelled?: boolean;
}
export type MilitaryEffect =
  | {
      type: 'move-units-choice';
      actor: Faction;
      moved: string[];
      arrivals: string[];
      region?: string;
      spaces?: string[];
    }
  | { type: 'sworn-enemies'; actor: Faction; space: string }
  | {
      type: 'loyalty-choice';
      actor: Faction;
      spaces: string[];
      region?: string;
      allowedSpaces?: string[];
    }
  | { type: 'reveal-unit'; pieceId: string };
export type CombatEffect =
  | { type: 'combat-start'; attacker: Faction; defender: Faction; space: string; free: boolean }
  | { type: 'combat-loans'; side: CombatSide }
  | { type: 'combat-request'; side: CombatSide; pieceId: string }
  | { type: 'combat-lend'; side: CombatSide; pieceId: string }
  | { type: 'combat-loyalty' }
  | { type: 'combat-support'; side: CombatSide }
  | { type: 'combat-spend-support'; side: CombatSide; pieceId: string }
  | { type: 'combat-roll' }
  | { type: 'combat-loss'; side: CombatSide; remaining: number }
  | { type: 'combat-casualty'; pieceId: string }
  | { type: 'combat-finish' };
export type AssassinationEffect =
  | {
      type: 'assassination-loss';
      actor: Faction;
      space: string;
      side: 'left' | 'right';
      region?: string;
    }
  | { type: 'assassination-bonus'; actor: Faction; region?: string }
  | { type: 'assassination-place'; pieceId: string; space: string; side: 'left' | 'right' };
export type LifecycleEffect =
  | { type: 'timeline-complete'; inflationSpace?: string }
  | { type: 'new-year-ready'; economy?: number }
  | { type: 'held-penalty'; faction: Faction; remaining: number }
  | { type: 'era-deal'; era: Era; penalties: FactionValues }
  | { type: 'campaign-finish'; penalties: FactionValues };
export type Effect =
  | LifecycleEffect
  | MilitaryEffect
  | CombatEffect
  | AssassinationEffect
  | { type: 'flow-start'; program: Program; context: FlowContext }
  | { type: 'flow-choice'; requestId: number; actor: Faction; ids: string[] }
  | { type: 'flow-complete'; requestId: number }
  | { type: 'domain-job'; job: DomainJob }
  | { type: 'domain-commit'; job: DomainJob; choice: string }
  | { type: 'grant-end' }
  | { type: 'referendum-result'; transfer?: { to: Faction; amount: number } }
  | { type: 'snap-election-result'; transfer?: { to: Faction; amount: number } }
  | { type: 'hound-assault'; actor: Faction; excluded: string; region?: string }
  | { type: 'log'; text: string }
  | { type: 'momentum'; faction: Faction }
  | {
      type: 'track';
      track: 'progress' | 'reaction' | 'us' | 'ussr' | 'economy' | 'unity';
      delta: number;
    }
  | {
      type: 'influence';
      faction: Faction;
      space: string;
      amount: number;
      conflictException?: boolean;
    }
  | { type: 'return'; pieceId: string; actor: Faction }
  | { type: 'move-piece'; pieceId: string; to: string }
  | { type: 'random-discard'; faction: Faction }
  | { type: 'random-take'; faction: Faction; from: Faction }
  | { type: 'draw'; faction: Faction }
  | { type: 'discard'; faction: Faction; uid: string }
  | { type: 'peek'; viewer: Faction; target: Faction }
  | { type: 'choice'; actor: Faction; prompt: string; options: ChoiceOption[] }
  | { type: 'finish-card'; card: CardInstance; resolved: boolean }
  | { type: 'clean-slate'; region?: string }
  | { type: 'build-event'; card: CardInstance; actor: Faction }
  | { type: 'ebert-cost'; actor: Faction; left: number }
  | { type: 'mcs-choice'; actor: Faction; remaining: number }
  | { type: 'optional-discard'; faction: Faction; uid: string }
  | { type: 'remove-one'; faction: Faction; actor: Faction }
  | { type: 'spend-article' | 'spend-seats' }
  | { type: 'timeline-choice-done'; key: string }
  | { type: 'finish-round' };
export interface ChoiceOption {
  id: string;
  label: string;
  effects: Effect[];
}
export interface PendingChoice {
  actor: Faction;
  prompt: string;
  options: ChoiceOption[];
}
export interface ElectionResult {
  regions: { region: string; blocked: boolean; totals: FactionValues; winner: Faction | null }[];
  base: FactionValues;
  totals: FactionValues;
  ranking: Faction[];
  transfer?: { from: Faction; to: Faction; amount: number };
}
export interface GameState {
  schema: 1;
  ruleset: 'tutorial-v1' | 'standard-v1';
  scenario?: ScenarioId;
  extraElectionUsed?: boolean;
  extraElectionPending?: boolean;
  /** Set during annual upkeep; resolve only after the new turn order is chosen. */
  eraChange?: Era;
  lastHeldPenalty?: FactionValues;
  stance: { KPD: number; NSDAP: number };
  pcLocked: string[];
  flow?: FlowState;
  flowReceipt?: Receipt;
  grantContext?: { returnDecider: Faction; spaces?: string[] };
  demo: boolean;
  seed: number;
  rng: number;
  revision: number;
  year: number;
  half: 'early' | 'late';
  phase: Phase;
  order: Faction[];
  activeIndex: number;
  momentum: Faction;
  tracks: {
    economy: number;
    progress: number;
    reaction: number;
    us: number;
    ussr: number;
    unity: number;
    dollarDependence: number;
  };
  influence: Record<string, FactionValues>;
  pieces: Piece[];
  hands: Record<Faction, CardInstance[]>;
  deck: CardInstance[];
  discard: CardInstance[];
  removedCards?: CardInstance[];
  lingering: CardInstance[];
  pc: Record<string, { owner: Faction | null; available: boolean }>;
  article48: boolean;
  article48Removed?: boolean;
  seats: { owner: Faction | null; available: boolean; uses?: number };
  electionCalled: boolean;
  electionCard?: CardInstance;
  victoryDeclared: Faction[];
  generalStrike: boolean;
  turn: TurnState;
  effects: Effect[];
  pending: PendingChoice | null;
  reveals: { viewer: Faction; target: Faction; cards: CardInstance[] }[];
  lastElection?: ElectionResult;
  combat?: CombatState;
  lastCombat?: CombatState;
  winner?: Faction;
  winReason?: string;
  scenarioEnding?: boolean;
  timelineChoiceResolved?: string;
  log: { n: number; text: string }[];
}
export type Action =
  | { kind: 'change-stance'; steps: number }
  | { kind: 'place-unit'; pieceId: string; space: string }
  | { kind: 'move-units' | 'test-loyalty' }
  | { kind: 'assault'; space: string; target: Faction }
  | { kind: 'place-assassination'; pieceId: string; space: string; side: 'left' | 'right' }
  | { kind: 'gain-momentum' }
  | { kind: 'place-influence'; space: string; count: number }
  | { kind: 'remove-influence'; space: string; targets: Partial<FactionValues> }
  | { kind: 'advance-progress' | 'advance-reaction' }
  | { kind: 'increase-deals'; track: 'us' | 'ussr' }
  | { kind: 'increase-unity'; pieceId: string }
  | { kind: 'move-mcs'; pieceId: string; to: string }
  | {
      kind: 'place-cadre' | 'place-reform' | 'place-strike' | 'place-clique';
      pieceId: string;
      space: string;
    }
  | { kind: 'flip-uprising'; space: string }
  | { kind: 'place-leverage'; pieceId: string; to: string }
  | { kind: 'remove-leverage'; pieceId: string }
  | { kind: 'declare-victory' };
export type Command =
  | { type: 'set-order'; actor: Faction; order: Faction[] }
  | {
      type: 'begin-turn';
      actor: Faction;
      mode: 'single' | 'event-first' | 'event-last';
      cardUid?: string;
    }
  | { type: 'action'; actor: Faction; action: Action }
  | { type: 'play-event'; actor: Faction }
  | { type: 'choose'; actor: Faction; option: string }
  | { type: 'pass'; actor: Faction; discardUid?: string }
  | { type: 'end-turn'; actor: Faction }
  | {
      type: 'advance';
      actor: Faction;
      transfer?: { to: Faction; amount: number };
      removeStrikes?: string[];
      inflationSpace?: string;
    }
  | { type: 'play-seats'; actor: Faction }
  | ({ type: 'call-extra-election'; actor: Faction } & (
      { card: 'seats' } | { card: 'pc'; region: string }
    ))
  | { type: 'play-pc'; actor: Faction; region: string; action?: Action; removeReform?: string };
export interface NewGameOptions {
  scenario?: ScenarioId;
  seed?: number;
  demo?: boolean;
  /** Dedicated card lab uses the tutorial map with standard stance/limits. */
  testCard?: number;
  testPrerequisites?: boolean;
}
export type DispatchResult =
  { ok: true; state: GameState } | { ok: false; error: string; state: GameState };
