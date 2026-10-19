import type { Action, Era, Faction, PieceKind } from '../types.ts';
import type { Capability } from '../../data/card-survey.ts';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Track =
  'progress' | 'reaction' | 'us' | 'ussr' | 'economy' | 'unity' | 'dollarDependence';
export type GrantedActionKind = Action['kind'] | 'change-stance';

/** faceId identifies an image/rules template, uid a physical copy in a game. */
export interface CardSource {
  faceId: number;
  uid: string;
}
export interface FlowContext {
  source?: CardSource;
  origin: 'card' | 'ordinary-action' | 'parliament' | 'trigger' | 'free-combat';
  initiator: Faction;
  turnOwner: Faction;
  beneficiary: Faction;
  returnDecider: Faction;
}

/** These contracts describe scope, not implemented rule handlers. */
export type Duration =
  | { until: 'era-end'; era: Era }
  | { until: 'next-election' | 'turn-end' | 'game-end' | 'cancelled' };
export type RuleKey =
  | 'influence.reach-required'
  | 'influence.replace-on-removal'
  | 'influence.amount-per-action'
  | 'unit.deployment-requires-influence'
  | 'unit.strength'
  | 'combat.spaces-per-action'
  | 'combat.strength'
  | 'combat.die-adjustment'
  | 'loyalty.progress-margin'
  | 'stance.max-steps'
  | 'track.minimum'
  | 'track.maximum'
  | 'parliament.usable'
  | 'parliament.uses'
  | 'article48.can-cancel'
  | 'article48.reuse-cost'
  | 'pv.regional-piece-value'
  | 'pv.national-city-bonus'
  | 'dominance.required-margin';
export interface RuleModifier {
  id: string;
  source: CardSource;
  rule: RuleKey;
  mode: 'add' | 'set' | 'allow' | 'deny' | 'floor' | 'ceiling';
  value: number | boolean;
  when: Expression;
  duration: Duration;
  /** Explicit precedence needs a rules citation; insertion order is not a ruling. */
  priority: number;
  basis: string;
}
export interface RuleOverride {
  rule: 'reach' | 'same-turn-place-remove' | 'region' | 'action-count';
  basis: string;
}
export type TriggerWindow =
  | 'dominance-changed'
  | 'action-completed'
  | 'unit-arrived'
  | 'influence-changed'
  | 'card-played'
  | 'election-started'
  | 'era-ended';
export interface TriggerDefinition {
  id: string;
  source: CardSource;
  window: TriggerWindow;
  when: Expression;
  body: Step[];
  duration: Duration;
  recursion: 'once-per-window';
  order: 'annual-order' | 'source-order';
}

export interface SpaceFilter {
  kind?: 'city' | 'non-city';
  regions?: string[];
  ids?: string[];
  adjacentTo?: string;
  faction?: Faction;
  relation?: 'presence' | 'dominance' | 'occupation' | 'supremacy' | 'parliament';
  piece?: PieceKind;
  exclude?: string[];
  full?: boolean;
}
export interface QueryArguments {
  'spaces.find': { filter: SpaceFilter };
  'pieces.find': {
    kind?: PieceKind;
    kinds?: PieceKind[];
    owner?: Faction;
    locations?: string[];
    availability?: 'available' | 'map' | 'reserve' | 'any';
    side?: string;
    revealed?: boolean;
  };
  'influence.count': { faction: Faction; spaces: string[] };
  'influence.leaders': { spaces: string[] };
  'track.value': { track: Track };
  'momentum.owner': Record<string, never>;
  'order.current': Record<string, never>;
  'stance.value': { faction: Faction };
  'pv.current': { faction: Faction };
  'mcs.count': { faction: Faction };
  'parliament.state': { card: string };
  'event.active': { faceId: number };
  'choice.candidates': {
    domain: 'action' | 'return-slot' | 'hand' | 'influence';
    faction: Faction;
    scope?: SpaceFilter;
  };
}
export interface OperationArguments {
  'influence.allocate': {
    actor: Faction;
    factions: Faction[];
    mode: 'place' | 'remove' | 'replace';
    to?: Faction;
    count: number;
    spaces: string[];
    optional: boolean;
    distinct?: boolean;
    perSpace?: number;
    sameSpace?: boolean;
    singleFaction?: boolean;
  };
  'pieces.deploy': {
    actor: Faction;
    owner: Faction;
    kinds: PieceKind[];
    spaces: string[];
    count: number;
    optional: boolean;
    distinct?: boolean;
    unrevealed?: boolean;
    fromMap?: boolean;
  };
  'pieces.return': {
    actor: Faction;
    ids: string[];
    count: number;
    optional: boolean;
    anyHolding?: boolean;
  };
  'pieces.reveal': { actor: Faction; ids: string[]; count: number; optional: boolean };
  'leverage.place': { actor: Faction; owner?: Faction; optional: boolean; spaces?: string[] };
  'leverage.replace': {
    actor: Faction;
    from: Faction;
    to: Faction;
    count: number;
    optional: boolean;
  };
  'strike.place': { actor: Faction; space: string; uprising: boolean; flipExisting: boolean };
  'board.remove': { actor: Faction; spaces: string[]; kinds: PieceKind[]; influence: boolean };
  'track.choose': {
    actor: Faction;
    track: Track;
    distance: number;
    direction: 'either' | 'negative' | 'positive';
    optional: boolean;
  };
  'influence.change': {
    faction: Faction;
    space: string;
    amount: number;
    overrides?: RuleOverride[];
  };
  'influence.replace': {
    from: Faction;
    to: Faction;
    space: string;
    count: number;
    overrides: RuleOverride[];
  };
  'piece.move': { pieceId: string; destination: string };
  'piece.replace': { removedId: string; replacementId: string };
  'piece.reveal': { pieceId: string };
  'piece.flip': { pieceId: string; side: string };
  'piece.remove-permanently': { pieceId: string };
  'track.change': { track: Track; mode: 'delta' | 'set' | 'toward-stability'; amount: number };
  'momentum.set': { faction: Faction };
  'hand.draw': { faction: Faction; count: number };
  'hand.transfer-random': { from: Faction; to: Faction };
  'hand.discard': { faction: Faction; uid: string };
  'hand.peek': { viewer: Faction; target: Faction };
  'stance.change': { faction: Faction; steps: number };
  'action.grant': {
    actor: Faction;
    kinds: GrantedActionKind[];
    count: number;
    scope?: SpaceFilter;
    overrides: RuleOverride[];
    optional: boolean;
    spaces?: string[];
    distinctSpaces?: boolean;
  };
  'rule.install': { modifier: RuleModifier };
  'rule.expire': { sourceUid: string };
  'trigger.install': { trigger: TriggerDefinition };
  'parliament.change': {
    card: string;
    change: 'transfer' | 'refresh' | 'spend' | 'lock' | 'remove-permanently';
    faction?: Faction;
    uses?: number;
    duration?: Duration;
  };
  'election.schedule': { at: 'round-end' };
  'election.special': { policy: 'referendum' | 'snap-election' };
  'victory.declare': { faction: Faction; basis: string };
  'random.roll': { sides: number; count: number };
}
export const OPERATION_CAPABILITY: Record<keyof OperationArguments, Capability> = {
  'influence.allocate': 'influence',
  'pieces.deploy': 'pieces',
  'pieces.return': 'pieces',
  'pieces.reveal': 'reveal',
  'leverage.place': 'pieces',
  'leverage.replace': 'replacement',
  'strike.place': 'pieces',
  'board.remove': 'pieces',
  'track.choose': 'tracks',
  'influence.change': 'influence',
  'influence.replace': 'replacement',
  'piece.move': 'pieces',
  'piece.replace': 'replacement',
  'piece.reveal': 'reveal',
  'piece.flip': 'reveal',
  'piece.remove-permanently': 'permanent',
  'track.change': 'tracks',
  'momentum.set': 'momentum',
  'hand.draw': 'hands',
  'hand.transfer-random': 'hands',
  'hand.discard': 'hands',
  'hand.peek': 'visibility',
  'stance.change': 'stance',
  'action.grant': 'actions',
  'rule.install': 'modifiers',
  'rule.expire': 'lifecycle',
  'trigger.install': 'triggers',
  'parliament.change': 'parliament',
  'election.schedule': 'elections',
  'election.special': 'specialElection',
  'victory.declare': 'victory',
  'random.roll': 'dice',
};
export const QUERY_KINDS = [
  'spaces.find',
  'pieces.find',
  'influence.count',
  'influence.leaders',
  'track.value',
  'momentum.owner',
  'order.current',
  'stance.value',
  'pv.current',
  'mcs.count',
  'parliament.state',
  'event.active',
  'choice.candidates',
] as const satisfies readonly (keyof QueryArguments)[];
export type OperationKind = keyof OperationArguments;
export type QueryKind = keyof QueryArguments;
type Template<M> = {
  [K in keyof M]: { kind: K; args: { [P in keyof M[K]]: Expression } };
}[keyof M];
export type OperationTemplate = Template<OperationArguments>;
export type QueryTemplate = Template<QueryArguments>;

export type Expression =
  | { type: 'array'; items: Expression[] }
  | { type: 'options'; values: Expression }
  | { type: 'field'; value: Expression; path: (string | number)[] }
  | { type: 'literal'; value: Json }
  | { type: 'binding'; name: string; path?: (string | number)[] }
  | { type: 'context'; key: 'initiator' | 'turnOwner' | 'beneficiary' | 'returnDecider' }
  | { type: 'query'; query: QueryTemplate }
  | {
      type: 'calculate';
      op:
        | 'add'
        | 'subtract'
        | 'multiply'
        | 'divide-ceil'
        | 'min'
        | 'max'
        | 'eq'
        | 'gt'
        | 'gte'
        | 'lt'
        | 'lte'
        | 'and'
        | 'or'
        | 'not'
        | 'count'
        | 'unique'
        | 'union';
      args: Expression[];
    };
export type Step =
  | { type: 'sequence'; steps: Step[] }
  | { type: 'let'; name: string; value: Expression }
  | { type: 'if'; condition: Expression; then: Step[]; otherwise?: Step[] }
  | { type: 'repeat'; count: Expression; index: string; body: Step[] }
  | { type: 'for-each'; items: Expression; item: string; body: Step[] }
  | {
      type: 'choose';
      actor: Expression;
      prompt: string;
      options: Expression;
      min: Expression;
      max: Expression;
      bind: string;
      onEmpty: 'skip' | 'error';
    }
  | { type: 'operation'; operation: OperationTemplate; saveAs?: string };
export interface Program {
  version: 1;
  id: string;
  steps: Step[];
}
/** Registration is separate from scope survey. A card is executable only when
 * its entire program AND every required domain adapter have been verified. */
export interface EventSpecification {
  faceId: number;
  revision: number;
  templateOf?: number;
  prerequisite?: Expression;
  whenPrerequisiteFails: 'discard-without-effect' | 'reject-play';
  response: 'article48-window' | 'uncancellable';
  mandatory: boolean;
  duration?: Duration;
  cancels: number[];
  program: Program;
  evidence: { sourceImage: string; rules: string[] };
}
export interface Option {
  id: string;
  label: string;
  value: Json;
}
/** Host reports actual results after all consequences have settled. Never infer
 * actual changes from requested amounts (caps, shortages, cancellations, etc.). */
export interface Receipt {
  actual?: number;
  spaces?: string[];
  pieceIds?: string[];
  cardUids?: string[];
  rolls?: number[];
  outcome?: Json;
}
export type ResolvedOperation = { kind: OperationKind; args: Record<string, Json> };
export type ResolvedQuery = { kind: QueryKind; args: Record<string, Json> };
export interface Host {
  operations: readonly OperationKind[];
  queries: readonly QueryKind[];
  /** Pure read against the authoritative state at the current continuation. */
  query(request: ResolvedQuery, context: FlowContext): Json;
}
export type Frame =
  | { type: 'block'; steps: Step[]; next: number; locals: Record<string, Json> }
  | { type: 'loop'; values: Json[]; next: number; bind: string; body: Step[] };
export type Wait =
  | {
      type: 'choice';
      id: number;
      actor: Faction;
      prompt: string;
      options: Option[];
      min: number;
      max: number;
      bind: string;
    }
  | { type: 'operation'; id: number; request: ResolvedOperation; saveAs?: string };
export interface FlowState {
  version: 1;
  programId: string;
  context: FlowContext;
  frames: Frame[];
  wait: Wait | null;
  nextRequest: number;
  status: 'running' | 'waiting' | 'complete';
  result: Record<string, Json>;
}
