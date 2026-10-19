import setups from '../data/generated/setups.json' with { type: 'json' };
import { SPACES, REGIONS } from '../data/board.ts';
import { CARD } from '../data/cards.ts';
import { HOLDING } from '../data/holdings.ts';
import { FACTIONS } from './types.ts';
import type {
  GameState,
  NewGameOptions,
  PieceKind,
  Faction,
  CardInstance,
  TurnState,
} from './types.ts';
import { zeros, assertInvariants, integer, clampTracks } from './rules.ts';
import { shuffle } from './random.ts';
export const newTurn = (): TurnState => ({
  mode: 'unselected',
  actionsLeft: 0,
  eventDone: false,
  placed: [],
  removed: [],
  pcUsed: false,
  assaulted: [],
});
export function createGame(options: NewGameOptions = {}): GameState {
  const seed = options.seed ?? 1921;
  integer(seed, 0, 4294967295, '种子必须是0至4294967295的整数');
  const s: GameState = {
    schema: 1,
    ruleset: 'tutorial-v1',
    stance: { KPD: 0, NSDAP: 0 },
    pcLocked: [],
    demo: options.demo ?? true,
    seed,
    rng: seed,
    revision: 0,
    year: 1921,
    half: 'early',
    phase: 'order',
    order: [...FACTIONS],
    activeIndex: 0,
    momentum: 'Coalition',
    tracks: { economy: 3, progress: 2, reaction: 3, us: 1, ussr: 2, unity: 1, dollarDependence: 0 },
    influence: Object.fromEntries(
      SPACES.map((sp) => [
        sp.id,
        {
          ...zeros(),
          ...(setups.Tutorial as Record<string, Partial<ReturnType<typeof zeros>>>)[sp.id],
        },
      ]),
    ),
    pieces: [],
    hands: { Coalition: [], KPD: [], NSDAP: [], RC: [] },
    deck: [],
    discard: [],
    lingering: [],
    pc: Object.fromEntries(REGIONS.map((r) => [r, { owner: 'Coalition', available: true }])),
    article48: true,
    seats: { owner: null, available: false },
    electionCalled: false,
    victoryDeclared: [],
    generalStrike: false,
    turn: newTurn(),
    effects: [],
    pending: null,
    reveals: [],
    log: [
      {
        n: 1,
        text:
          options.demo === false
            ? '教程剧本 1921–1923；正式53张危机牌库，每阵营5张。'
            : '开发测试局：教程布局；固定的已实现牌序，每阵营3张。',
      },
    ],
  };
  function add(
    kind: PieceKind,
    owner: Faction | null,
    location: string,
    n = 1,
    side?: 'strike' | 'uprising',
  ) {
    for (let i = 0; i < n; i++)
      s.pieces.push({
        id: `piece-${s.pieces.length + 1}`,
        kind,
        owner,
        location,
        ...(side ? { side } : {}),
      });
  }
  const occupied = [
    '@progress:2',
    '@progress:3',
    '@reaction:2',
    '@reaction:3',
    ...['3', '4', '5'].map((n) => `@mcs:${n}`),
    ...['2', '3', '4', '5'].map((n) => `@reform:${n}`),
    '@reaction-assassination:2',
    '@reaction-cadre:4',
    '@reaction-clique:5',
    ...['2', '3', '4', '5'].map((n) => `@us:${n}`),
    '@ussr-army:1',
    '@ussr-army:3',
    '@ussr-army:5',
    '@ussr-cadre:4',
    '@ussr-cadre:5',
    '@ussr-black:3',
    '@ussr-yellow:4',
    '@economy-mcs:1',
    '@economy-mcs:9',
    '@kpd-cadre:1',
    '@kpd-cadre:2',
    '@kpd-strike:2',
    '@kpd-strike:3',
    '@kpd-strike:4',
    '@nsdap-cadre:1',
    '@nsdap-cadre:2',
    '@nsdap-cadre:3',
    '@nsdap-assassination:1',
    '@rc-economic:4',
    '@rc-clique:2',
    '@rc-assassination:1',
  ];
  for (const id of occupied) {
    const h = HOLDING[id];
    add(h.kind, h.owner, id, 1, h.kind === 'strike' ? 'strike' : undefined);
  }
  add('mcs', null, 'mat:RC', 2);
  add('freikorps', 'Coalition', 'Bayern');
  add('freikorps', 'Coalition', 'Berlin', 2);
  add('freikorps', 'Coalition', 'Koeln');
  add('freikorps', 'Coalition', 'Muenchen');
  add('freikorps', 'Coalition', 'reserve:Coalition', 4);
  add('freikorps', 'RC', 'Berlin', 2);
  add('freikorps', 'RC', 'Muenchen');
  add('militia', 'KPD', 'Bayern');
  add('militia', 'KPD', 'Berlin', 2);
  add('militia', 'KPD', 'Sachsen');
  add('militia', 'KPD', 'reserve:KPD', 5);
  add('sa', 'NSDAP', 'Muenchen');
  add('sa', 'NSDAP', 'reserve:NSDAP', 8);
  add('leverage', 'RC', 'Bayern', 2);
  add('clique', 'RC', 'Bayern');
  add('cadre', 'KPD', 'Berlin');
  add('cadre', 'NSDAP', 'Muenchen');
  add('strike', 'KPD', 'Sachsen', 1, 'strike');
  const instance = (card: number): CardInstance => ({ uid: `card-${card}`, card });
  if (s.demo) {
    s.hands.Coalition = [35, 17, 4].map(instance);
    s.hands.KPD = [49, 47, 152].map(instance);
    s.hands.NSDAP = [1, 39, 50].map(instance);
    s.hands.RC = [51, 44, 48].map(instance);
    s.deck = [52, 34].map(instance);
  } else {
    const regular = shuffle(
      s,
      Array.from({ length: 52 }, (_, i) => i + 1)
        .filter((n) => !CARD[n].mandatory)
        .map(instance),
    );
    s.deck = [
      ...shuffle(s, [...regular.slice(0, 26), instance(4), instance(152)]),
      ...regular.slice(26),
    ];
    for (const f of FACTIONS) s.hands[f] = s.deck.splice(0, 5);
  }
  // TTS bag: three loyal yellow backs and six rogue black backs. A separate
  // seeded stream assigns hidden identities without changing old card RNG.
  const loyaltyRng = { rng: (seed ^ 0x9e3779b9) >>> 0 };
  const allegiances = shuffle(loyaltyRng, [
    'Coalition',
    'Coalition',
    'Coalition',
    'RC',
    'RC',
    'RC',
    'RC',
    'RC',
    'RC',
  ] as const);
  let loyaltyIndex = 0;
  for (const p of s.pieces.filter((p) => p.kind === 'freikorps')) {
    p.revealed = p.owner === 'RC';
    p.allegiance = p.revealed ? 'RC' : allegiances[loyaltyIndex++];
  }
  assertInvariants(s);
  if (options.testCard !== undefined) {
    integer(options.testCard, 1, 151, '牌效测试范围为1—151');
    s.ruleset = 'standard-v1';
    s.demo = true;
    s.year = options.testCard >= 113 ? 1930 : options.testCard >= 53 ? 1924 : 1921;
    s.tracks.economy = 5;
    const wanted = options.testCard;
    s.hands.Coalition = s.hands.Coalition.filter((c) => c.card !== wanted);
    for (const f of FACTIONS) s.hands[f] = s.hands[f].filter((c) => c.card !== wanted);
    s.deck = s.deck.filter((c) => c.card !== wanted);
    s.hands.Coalition.unshift(instance(wanted));
    if (options.testPrerequisites) {
      let n = CARD[wanted].requires;
      while (n) {
        for (const f of FACTIONS) s.hands[f] = s.hands[f].filter((c) => c.card !== n);
        s.deck = s.deck.filter((c) => c.card !== n);
        s.lingering.push(instance(n));
        if (n === 119) {
          s.article48 = false;
          s.article48Removed = true;
        }
        n = CARD[n].requires;
      }
    }
    clampTracks(s);
    s.log = [
      {
        n: 1,
        text: `牌效实验局：教程地图，标准立场与限制；指定 #${wanted}，${options.testPrerequisites ? '已放入前置持续事件' : '未预置前置事件'}。此布局不是正式历史剧本。`,
      },
    ];
    assertInvariants(s);
  }
  return s;
}
