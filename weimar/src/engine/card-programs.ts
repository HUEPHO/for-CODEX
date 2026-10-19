import { SPACES, SPACE } from '../data/board.ts';
import { FACTIONS } from './types.ts';
import type { Faction, PieceKind, Action } from './types.ts';
import type { Expression, Program, Step } from './flow/protocol.ts';
import { actor, array, branch, calc, expr, field, lit, op, q, ref, when } from './flow/builders.ts';

const all = SPACES.map((p) => p.id),
  cities = SPACES.filter((p) => p.kind === 'City').map((p) => p.id),
  provinces = SPACES.filter((p) => p.kind !== 'City').map((p) => p.id);
const prussia = SPACES.filter((p) => p.region === 'Preussen').map((p) => p.id);
const east = ['Ostpreussen', 'Posen-Westpreussen', 'Niederschlesien', 'Oberschlesien'];
const neighbors = ['Bayern', ...SPACE.Bayern.adjacent];
const track = (name: 'progress' | 'reaction' | 'economy' | 'us' | 'ussr' | 'unity') =>
  q('track.value', { track: name });
const momentum = q('momentum.owner', {});
const pieces = (
  kind: PieceKind,
  owner?: Faction,
  locations?: string[] | Expression,
  extra: Record<string, unknown> = {},
) =>
  q('pieces.find', {
    kind,
    ...(owner ? { owner } : {}),
    ...(locations ? { locations } : { availability: 'map' as const }),
    ...extra,
  });
const count = (kind: PieceKind, owner?: Faction, locations?: string[] | Expression) =>
  calc('count', pieces(kind, owner, locations));
const pc = (region: string, f: Faction) =>
  calc('eq', field(q('parliament.state', { card: region }), 'owner'), f);
const owned = (f: Faction, relation: 'presence' | 'dominance' | 'supremacy' | 'parliament') =>
  q('spaces.find', { filter: { faction: f, relation } });
const has = (kind: PieceKind, owner?: Faction, locations?: string[]) =>
  calc('gt', count(kind, owner, locations), 0);
const gain = (f: Faction | Expression) => op('momentum.set', { faction: f });
const delta = (
  name: 'progress' | 'reaction' | 'economy' | 'us' | 'ussr' | 'unity',
  amount: number | Expression,
) => op('track.change', { track: name, mode: 'delta', amount });
const place = (
  f: Faction | Expression,
  n: number | Expression,
  spaces: string[] | Expression = all,
  chooser: Faction | Expression = f,
  optional = true,
  distinct = false,
  perSpace?: number,
  extra: Record<string, boolean> = {},
) =>
  op('influence.allocate', {
    actor: chooser,
    factions: typeof f === 'string' ? [f] : array(f),
    mode: 'place',
    count: n,
    spaces,
    optional,
    distinct,
    ...(perSpace ? { perSpace } : {}),
    ...extra,
  });
const remove = (
  factions: Faction[],
  n: number | Expression,
  spaces: string[] | Expression = all,
  chooser: Faction | Expression = actor,
  optional = true,
  distinct = false,
  perSpace?: number,
  extra: Record<string, boolean> = {},
) =>
  op('influence.allocate', {
    actor: chooser,
    factions,
    mode: 'remove',
    count: n,
    spaces,
    optional,
    distinct,
    ...(perSpace ? { perSpace } : {}),
    ...extra,
  });
const grant = (
  f: Faction | Expression,
  kinds: Action['kind'][],
  n: number | Expression = 1,
  spaces?: string[] | Expression,
  distinctSpaces = false,
  optional = true,
) =>
  op('action.grant', {
    actor: f,
    kinds,
    count: n,
    optional,
    overrides: [],
    ...(spaces ? { spaces } : {}),
    ...(distinctSpaces ? { distinctSpaces: true } : {}),
  });
const influenceActions: Action['kind'][] = ['place-influence', 'remove-influence'];
const deploy = (
  owner: Faction,
  kinds: PieceKind[],
  spaces: string[] | Expression,
  n: number | Expression = 1,
  chooser: Faction | Expression = actor,
  optional = false,
  extra: Record<string, boolean> = {},
  saveAs?: string,
) =>
  op(
    'pieces.deploy',
    { actor: chooser, owner, kinds, spaces, count: n, optional, ...extra },
    saveAs,
  );
const strike = (space: string, uprising = false, flipExisting = false) =>
  op('strike.place', { actor, space, uprising, flipExisting });
const returns = (
  ids: Expression,
  n: number | Expression = 200,
  chooser: Faction | Expression = actor,
  anyHolding = false,
  optional = false,
  saveAs?: string,
) => op('pieces.return', { actor: chooser, ids, count: n, optional, anyHolding }, saveAs);
const reveal = (ids: Expression, n: number | Expression = 200, optional = false) =>
  op('pieces.reveal', { actor, ids, count: n, optional });
const hidden = (locations?: string[]) =>
  q('pieces.find', {
    kind: 'freikorps',
    owner: 'Coalition',
    revealed: false,
    ...(locations ? { locations } : { availability: 'map' }),
  });
const repeat = (n: Expression, body: Step[], index = 'iteration'): Step => ({
  type: 'repeat',
  count: n,
  index,
  body,
});
const highest = (a: Expression, b: Expression) => calc('gt', a, b);
const reformCount = count('reform');
const leftKills = calc('count', pieces('assassination', undefined, undefined, { side: 'left' }));
const trackDifference = calc(
  'max',
  calc('subtract', track('progress'), track('reaction')),
  calc('subtract', track('reaction'), track('progress')),
);
const returnMcs = (f: Faction) => returns(pieces('mcs', undefined, [`mat:${f}`]), 1, f, true);
const pv = (f: Faction) => q('pv.current', { faction: f });
const optionalTake = (to: Faction, from: Faction) =>
  branch(to, `${to}：是否随机拿取 ${from} 的一张手牌？`, [
    { label: '随机拿取一张', steps: [op('hand.transfer-random', { from, to })] },
    { label: '不拿取', steps: [] },
  ]);
const religiousRemoval = (regions: string[]): Step[] => [
  remove(
    [...FACTIONS],
    q('mcs.count', { faction: momentum }),
    q('spaces.find', { filter: { regions } }),
    momentum,
  ),
];

/** Card data uses generic operations; it never mutates GameState or installs UI callbacks. */
const definitions: Record<number, Step[]> = {
  1: [],
  2: [
    gain('Coalition'),
    when(pc('Preussen', 'Coalition'), [
      op('influence.allocate', {
        actor: 'Coalition',
        factions: ['KPD', 'NSDAP', 'RC'],
        mode: 'replace',
        to: 'Coalition',
        count: 2,
        spaces: prussia,
        optional: true,
        distinct: true,
        perSpace: 1,
      }),
    ]),
  ],
  3: [
    returns(pieces('mcs', undefined, ['mat:RC']), 1, 'RC', true),
    when(calc('gt', leftKills, 0), [delta('reaction', -1)]),
  ],
  4: [],
  5: [
    op('parliament.change', {
      card: 'Berlin',
      change: 'lock',
      duration: { until: 'next-election' },
    }),
    deploy('RC', ['freikorps'], ['Berlin']),
    strike('Berlin'),
    op('track.change', { track: 'unity', mode: 'set', amount: 1 }),
  ],
  6: [
    op('influence.change', { faction: 'KPD', space: 'Bayern', amount: 1 }),
    deploy('KPD', ['militia'], ['Bayern'], 2),
    when(calc('gte', q('influence.count', { faction: 'KPD', spaces: ['Bayern'] }), 4), [
      strike('Bayern', true),
    ]),
  ],
  7: [
    strike('Provinz Westfalen'),
    strike('Rheinprovinz'),
    deploy(
      'Coalition',
      ['freikorps'],
      ['Provinz Westfalen', 'Rheinprovinz'],
      2,
      actor,
      false,
      { distinct: true, unrevealed: true },
      'deployed',
    ),
    reveal(ref('deployed', 'pieceIds')),
    grant('RC', ['place-influence']),
  ],
  8: [
    op('influence.change', { faction: 'KPD', space: 'Provinz Westfalen', amount: 2 }),
    deploy('KPD', ['militia'], ['Provinz Westfalen'], 2),
    when(calc('gt', q('influence.count', { faction: 'KPD', spaces: ['Provinz Westfalen'] }), 5), [
      strike('Provinz Westfalen', true, true),
    ]),
  ],
  9: [
    returns(
      pieces(
        'leverage',
        'RC',
        all.concat([
          '@progress:2',
          '@progress:3',
          '@progress:4',
          '@progress:5',
          '@reaction:2',
          '@reaction:3',
          '@reaction:4',
          '@reaction:5',
          ...Array.from({ length: 7 }, (_, i) => `@economy:${i + 2}`),
        ]),
      ),
      1,
      actor,
      true,
    ),
    when(calc('gt', leftKills, 0), [grant('Coalition', ['move-mcs'])]),
  ],
  10: branch(actor, '自由军团复员：选择一项', [
    {
      label: '联盟团结调至脆弱',
      steps: [op('track.change', { track: 'unity', mode: 'set', amount: 0 })],
    },
    {
      label: '揭示全部联盟自由军团，永久移出备用区忠诚军团',
      steps: [
        reveal(q('pieces.find', { kind: 'freikorps', owner: 'Coalition', revealed: false })),
        {
          type: 'for-each',
          items: q('pieces.find', {
            kind: 'freikorps',
            owner: 'Coalition',
            availability: 'reserve',
          }),
          item: 'unit',
          body: [op('piece.remove-permanently', { pieceId: ref('unit') })],
        },
      ],
    },
  ]),
  11: [
    op('board.remove', {
      actor,
      spaces: ['Oberschlesien'],
      kinds: ['leverage', 'cadre'],
      influence: true,
    }),
  ],
  12: [
    {
      type: 'choose',
      actor,
      prompt: '波兰走廊：总影响力最多者取得 momentum；并列时由行动方选择',
      options: { type: 'options', values: q('influence.leaders', { spaces: east }) },
      min: lit(1),
      max: lit(1),
      bind: 'leader',
      onEmpty: 'error',
    },
    { type: 'for-each', items: ref('leader'), item: 'party', body: [gain(ref('party'))] },
  ],
  13: [
    when(
      calc(
        'or',
        has('leverage', 'RC', ['Bayern']),
        calc(
          'or',
          pc('Bayern', 'RC'),
          calc(
            'gt',
            q('influence.count', { faction: 'RC', spaces: ['Bayern'] }),
            calc(
              'max',
              q('influence.count', { faction: 'Coalition', spaces: ['Bayern'] }),
              calc(
                'max',
                q('influence.count', { faction: 'KPD', spaces: ['Bayern'] }),
                q('influence.count', { faction: 'NSDAP', spaces: ['Bayern'] }),
              ),
            ),
          ),
        ),
      ),
      [grant('RC', [], 2, neighbors, true)],
      [grant('RC', [], 1, neighbors, true)],
    ),
  ],
  14: [
    op('leverage.place', { actor: 'RC', owner: 'RC', optional: false }),
    delta('economy', calc('multiply', -1, count('leverage', 'RC'))),
  ],
  15: [],
  16: [],
  17: [delta('ussr', 1), op('stance.change', { faction: 'KPD', steps: -1 })],
  18: [
    deploy('NSDAP', ['sa'], ['Muenchen'], 2),
    when(calc('eq', q('stance.value', { faction: 'NSDAP' }), 3), [
      grant('NSDAP', ['place-influence'], 2),
    ]),
  ],
  19: [],
  20: [],
  21: [grant('NSDAP', ['place-influence'], calc('multiply', 2, count('cadre', 'NSDAP')))],
  22: [remove(['NSDAP', 'KPD'], calc('multiply', 2, reformCount), all, 'Coalition', true, true, 1)],
  23: [
    deploy('RC', ['freikorps'], ['Bayern'], 1, 'RC', true),
    remove([...FACTIONS], 2, ['Bayern'], 'RC', true, false, 2, { singleFaction: true }),
  ],
  24: [remove(['Coalition', 'KPD'], calc('multiply', 3, leftKills))],
  25: [
    when(
      calc('gte', track('economy'), 5),
      [
        op('track.choose', {
          actor,
          track: 'economy',
          distance: 2,
          direction: 'negative',
          optional: true,
        }),
      ],
      [delta('economy', -1)],
    ),
  ],
  26: [
    when(
      calc('eq', momentum, 'Coalition'),
      [place('Coalition', 2, all, 'Coalition', true, true, 1)],
      [
        when(
          calc('eq', momentum, 'KPD'),
          [place('KPD', 4, all, 'KPD', true, true, 1)],
          [place(actor, 1)],
        ),
      ],
    ),
  ],
  27: [
    deploy('KPD', ['militia'], ['Berlin'], 2),
    deploy('Coalition', ['freikorps', 'reichswehr'], ['Berlin'], 1, 'Coalition', true),
    grant('Coalition', ['assault'], 1, ['Berlin']),
    when(calc('eq', count('militia', 'KPD', ['Berlin']), 0), [gain('KPD')]),
  ],
  28: [
    strike('Berlin'),
    ...['Provinz Sachsen', 'Sachsen', 'Thueringen'].flatMap((space) => [
      op('random.roll', { count: 1, sides: 6 }, 'dice'),
      when(
        calc(
          'lte',
          ref('dice', 'rolls', 0),
          q('influence.count', { faction: 'KPD', spaces: [space] }),
        ),
        [strike(space)],
      ),
    ]),
  ],
  29: [
    grant('Coalition', ['move-mcs']),
    repeat(reformCount, [
      remove([...FACTIONS], 2, cities, 'Coalition', true, false, 2, { sameSpace: true }),
    ]),
  ],
  30: [
    op(
      'track.choose',
      { actor: 'Coalition', track: 'economy', distance: 3, direction: 'either', optional: true },
      'movement',
    ),
    repeat(ref('movement', 'actual'), [place('RC', 1), place('NSDAP', 1)]),
  ],
  31: [
    remove(['NSDAP'], 2, all, actor, false, true, 1),
    when(calc('or', calc('eq', momentum, 'NSDAP'), has('cadre', 'NSDAP')), [
      place('NSDAP', 2, all, 'NSDAP', true, true, 1),
    ]),
  ],
  32: [
    op('random.roll', { count: 1, sides: 6 }, 'dice'),
    remove(['KPD'], calc('divide-ceil', ref('dice', 'rolls', 0), 2), ['Bayern'], actor, false),
    remove(['Coalition'], 1, ['Bayern'], actor, false),
    ...branch(actor, '白色恐怖：部署或揭示军团', [
      { label: '巴伐利亚部署叛离军团', steps: [deploy('RC', ['freikorps'], ['Bayern'])] },
      {
        label: '揭示巴伐利亚及慕尼黑全部联盟军团',
        steps: [reveal(hidden(['Bayern', 'Muenchen']))],
      },
    ]),
  ],
  33: [
    { type: 'let', name: 'reactionCount', value: track('reaction') },
    grant('RC', ['place-influence'], ref('reactionCount')),
    grant('NSDAP', ['place-influence'], ref('reactionCount')),
  ],
  34: [op('stance.change', { faction: 'KPD', steps: 1 }), gain('RC')],
  35: [
    when(calc('gte', track('progress'), 2), [place('Coalition', 2, cities, actor, false, true, 1)]),
  ],
  36: [deploy('NSDAP', ['sa'], owned('NSDAP', 'presence'), 2, 'NSDAP', true, { distinct: true })],
  37: [
    deploy('RC', ['freikorps'], ['Berlin']),
    when(calc('gte', track('ussr'), 2), [reveal(hidden(), 1)]),
  ],
  38: [
    deploy('RC', ['freikorps'], ['Brandenburg']),
    op('influence.change', { faction: 'RC', space: 'Brandenburg', amount: 1 }),
  ],
  39: east.map((space) => op('influence.change', { faction: 'NSDAP', space, amount: 1 })),
  40: [
    strike('Hamburg', true),
    when(
      calc('eq', q('stance.value', { faction: 'KPD' }), 3),
      [deploy('KPD', ['militia'], ['Hamburg'], 2)],
      [deploy('KPD', ['militia'], ['Hamburg'])],
    ),
  ],
  41: branch(actor, '图勒协会：选择一项', [
    {
      label: '慕尼黑放置1个 RC 影响力',
      steps: [op('influence.change', { faction: 'RC', space: 'Muenchen', amount: 1 })],
    },
    { label: 'NSDAP 移动中产支持', steps: [grant('NSDAP', ['move-mcs'])] },
  ]),
  42: [
    grant('Coalition', ['place-influence']),
    when(highest(track('progress'), track('reaction')), [grant('Coalition', ['move-mcs'])]),
  ],
  43: [
    grant('RC', ['move-mcs']),
    when(calc('eq', momentum, 'NSDAP'), [grant('NSDAP', ['move-mcs'])]),
  ],
  45: [
    reveal(q('pieces.find', { kind: 'freikorps', owner: 'Coalition', revealed: false }), 3, true),
    when(calc('gte', track('reaction'), track('progress')), [
      deploy('RC', ['freikorps'], owned('RC', 'presence'), 1, 'RC', true),
      deploy('NSDAP', ['sa'], owned('NSDAP', 'presence'), 1, 'NSDAP', true),
    ]),
  ],
  46: [op('leverage.place', { actor, optional: false })],
  53: [
    op('track.change', { track: 'economy', mode: 'set', amount: 5 }),
    ...branch(actor, '地产抵押马克：选择移除范围', [
      {
        label: '地图全部罢工（保留起义）',
        steps: [returns(pieces('strike', undefined, undefined, { side: 'strike' }))],
      },
      { label: '地图全部杠杆', steps: [returns(pieces('leverage'))] },
      {
        label: '经济轨道全部杠杆',
        steps: [
          returns(
            pieces(
              'leverage',
              undefined,
              Array.from({ length: 7 }, (_, i) => `@economy:${i + 2}`),
            ),
          ),
        ],
      },
    ]),
  ],
  54: [when(calc('eq', track('unity'), 0), [delta('unity', 1)])],
  55: [],
  56: [],
  57: [],
  58: [],
  59: [],
  60: [],
  61: [
    grant('RC', ['place-influence'], track('reaction')),
    place('NSDAP', 1, owned('RC', 'dominance')),
  ],
  62: [],
  63: [
    delta('unity', -1),
    remove(['Coalition'], 26, owned('KPD', 'dominance'), 'KPD', true, true, 1),
  ],
  64: [grant('KPD', ['move-mcs'])],
  65: [
    grant('Coalition', ['move-mcs']),
    when(calc('gte', track('us'), 2), [grant('Coalition', influenceActions)]),
  ],
  66: [
    place('Coalition', track('progress'), cities, 'Coalition', true, true, 1),
    remove(['Coalition'], track('reaction'), provinces, 'RC', true, true, 1),
  ],
  67: [
    grant('Coalition', ['place-reform']),
    when(has('reform', undefined, prussia), [gain('Coalition')]),
  ],
  68: [
    returns(
      pieces('mcs', undefined, ['mat:Coalition']),
      calc('max', 0, calc('subtract', 4, track('progress'))),
      actor,
      true,
    ),
  ],
  69: [grant('Coalition', influenceActions, track('us'))],
  70: [
    op('track.change', { track: 'economy', mode: 'toward-stability', amount: 1 }),
    op('track.change', { track: 'us', mode: 'delta', amount: 1 }, 'deals'),
    when(ref('deals', 'outcome', 'newDollar'), [grant('Coalition', [])]),
  ],
  71: [
    gain('Coalition'),
    when(calc('gte', calc('add', track('us'), track('ussr')), 4), [place('Coalition', 1)]),
  ],
  72: [
    grant('RC', []),
    when(highest(track('reaction'), track('progress')), [place('RC', 1, cities)]),
  ],
  73: [
    when(
      calc('eq', momentum, 'NSDAP'),
      [gain('RC')],
      [when(calc('eq', momentum, 'RC'), [gain('NSDAP')])],
    ),
  ],
  74: [grant('KPD', ['move-mcs'], count('cadre', 'KPD'))],
  75: [
    grant('Coalition', ['move-mcs']),
    when(pc('Berlin', 'Coalition'), [remove(['KPD', 'NSDAP', 'RC'], 1, ['Berlin'], 'Coalition')]),
  ],
  76: [
    grant('Coalition', ['move-mcs']),
    when(calc('gt', reformCount, 0), [grant('Coalition', ['place-influence'])]),
  ],
  77: [
    op('stance.change', { faction: 'KPD', steps: -1 }),
    when(has('mcs', undefined, ['mat:KPD']), [grant('KPD', influenceActions)]),
  ],
  78: [
    returns(pieces('cadre'), 1),
    when(calc('gt', reformCount, 0), [grant('Coalition', ['move-mcs'])]),
  ],
  79: branch('Coalition', '包豪斯：选择行动组合', [
    { label: '至多2次放置影响力行动', steps: [grant('Coalition', ['place-influence'], 2)] },
    { label: '1次移动中产支持行动', steps: [grant('Coalition', ['move-mcs'])] },
  ]),
  80: [grant('RC', ['place-influence'], track('us'))],
  81: [place('KPD', 2), place('NSDAP', 2), place('RC', 2)],
  82: [when(calc('eq', momentum, 'RC'), [op('election.special', { policy: 'referendum' })])],
  83: [
    ...branch(actor, '禁止红色阵线斗士同盟：选择移除部队', [
      { label: '移除2个工人民兵', steps: [returns(pieces('militia', 'KPD'), 2)] },
      { label: '移除1个 KPD 干部', steps: [returns(pieces('cadre', 'KPD'), 1)] },
    ]),
    grant('KPD', ['place-influence']),
  ],
  84: [grant('RC', ['place-unit', 'test-loyalty'], calc('count', owned('RC', 'supremacy')))],
  85: [
    { type: 'let', name: 'supremacySpaces', value: owned('Coalition', 'supremacy') },
    grant(
      'Coalition',
      influenceActions,
      calc('count', ref('supremacySpaces')),
      ref('supremacySpaces'),
      true,
    ),
  ],
  86: branch(actor, '德意志国家人民党入阁：选择一项', [
    {
      label: '将国会议席牌交给 RC',
      steps: [op('parliament.change', { card: 'seats', change: 'transfer', faction: 'RC' })],
    },
    {
      label: '团结为稳固或脆弱时，联盟归还1个中产支持',
      steps: [when(calc('lte', track('unity'), 1), [returnMcs('Coalition')])],
    },
  ]),
  87: [remove(['NSDAP', 'RC'], 1, cities, actor, false)],
  88: [
    returns(
      q('pieces.find', {
        kind: 'leverage',
        locations: [
          ...all,
          ...Array.from({ length: 4 }, (_, i) => `@progress:${i + 2}`),
          ...Array.from({ length: 4 }, (_, i) => `@reaction:${i + 2}`),
          ...Array.from({ length: 7 }, (_, i) => `@economy:${i + 2}`),
        ],
      }),
      1,
    ),
    delta('economy', 1),
  ],
  89: branch(
    actor,
    '容克贵族：选择一个东部地区',
    [...east, 'Pommern'].map((space) => ({
      label: SPACE[space].nameZh,
      steps: [
        place('RC', 1, [space], actor, false),
        op('leverage.place', { actor, owner: 'RC', optional: false, spaces: [space] }),
      ],
    })),
  ),
  90: [
    when(
      calc('eq', momentum, 'KPD'),
      [grant(actor, ['move-mcs'], 1, undefined, false, false)],
      [grant(actor, ['move-mcs'], 2)],
    ),
  ],
  91: [
    grant('Coalition', influenceActions, count('mcs', undefined, ['mat:Coalition'])),
    grant('RC', influenceActions, count('mcs', undefined, ['mat:RC'])),
  ],
  93: [
    gain('Coalition'),
    // Official errata: only these markers deployed on the map, not holding boxes.
    when(
      calc(
        'gte',
        calc(
          'count',
          q('pieces.find', { kinds: ['strike', 'assassination', 'reform'], availability: 'map' }),
        ),
        track('progress'),
      ),
      [grant('Coalition', ['move-mcs'])],
    ),
  ],
  94: branch(actor, '实用主义：选择一项', [
    { label: '反动降低1', steps: [delta('reaction', -1)] },
    {
      label: '巴伐利亚和莱茵各放置1个联盟影响力',
      steps: ['Bayern', 'Rheinprovinz'].map((space) =>
        place('Coalition', 1, [space], actor, false),
      ),
    },
  ]),
  95: [grant('Coalition', ['place-influence'], trackDifference, undefined, false, false)],
  96: [
    grant('Coalition', ['place-influence'], count('leverage', 'Coalition', cities)),
    grant('RC', ['remove-influence'], count('leverage', 'RC', cities)),
  ],
  97: [
    op('influence.allocate', {
      actor: 'RC',
      factions: ['Coalition'],
      mode: 'replace',
      to: 'RC',
      count: 1,
      spaces: ['Berlin'],
      optional: true,
    }),
    gain('NSDAP'),
    grant('NSDAP', influenceActions),
  ],
  98: [
    op(
      'influence.allocate',
      {
        actor: 'NSDAP',
        factions: ['Coalition', 'KPD', 'RC'],
        mode: 'remove',
        count: 1,
        spaces: cities,
        optional: true,
      },
      'opponentsRemoved',
    ),
    op(
      'influence.allocate',
      {
        actor: 'NSDAP',
        factions: ['NSDAP'],
        mode: 'remove',
        count: q('influence.count', { faction: 'NSDAP', spaces: cities }),
        spaces: cities,
        optional: true,
      },
      'ownRemoved',
    ),
    place(
      'NSDAP',
      calc('add', ref('opponentsRemoved', 'actual'), ref('ownRemoved', 'actual')),
      provinces,
    ),
  ],
  99: [
    when(calc('or', calc('eq', momentum, 'NSDAP'), calc('eq', momentum, 'RC')), [
      grant(momentum, influenceActions, trackDifference),
    ]),
  ],
  101: [
    grant('Coalition', influenceActions, 1, ['Berlin']),
    when(has('leverage', 'Coalition', ['Berlin']), [gain('Coalition')]),
  ],
  103: [returnMcs('Coalition')],
  104: [
    delta('ussr', 1),
    grant('KPD', ['place-influence']),
    grant('Coalition', ['place-influence']),
  ],
  105: [
    {
      type: 'for-each',
      items: q('order.current', {}),
      item: 'faction',
      body: FACTIONS.map((f) => when(calc('eq', ref('faction'), f), [returnMcs(f)])),
    },
  ],
  106: branch(
    actor,
    '恩斯特·尼基施：选择替换阵营',
    (['RC', 'KPD'] as Faction[]).map((f) => ({
      label: `萨克森：联盟影响力 → ${f}`,
      steps: [
        op('influence.allocate', {
          actor,
          factions: ['Coalition'],
          mode: 'replace',
          to: f,
          count: 1,
          spaces: ['Sachsen'],
          optional: false,
        }),
      ],
    })),
  ),
  113: [
    {
      type: 'let',
      name: 'fullRcSpaces',
      value: q('spaces.find', { filter: { faction: 'RC', relation: 'dominance', full: true } }),
    },
    op('influence.allocate', {
      actor,
      factions: [...FACTIONS],
      mode: 'replace',
      to: 'NSDAP',
      count: calc('count', ref('fullRcSpaces')),
      spaces: ref('fullRcSpaces'),
      optional: false,
      distinct: true,
      perSpace: 1,
    }),
  ],
  114: [
    grant(
      'NSDAP',
      ['place-influence'],
      calc('count', calc('union', owned('RC', 'dominance'), owned('RC', 'parliament'))),
    ),
  ],
  115: branch(actor, '普鲁士政变：选择一项', [
    {
      label: '至多按反动值移除普鲁士联盟影响力',
      steps: [remove(['Coalition'], track('reaction'), prussia)],
    },
    {
      label: 'RC 取得普鲁士议会控制并翻至正面',
      steps: [op('parliament.change', { card: 'Preussen', change: 'transfer', faction: 'RC' })],
    },
  ]),
  116: [],
  117: [
    gain('NSDAP'),
    grant(
      'NSDAP',
      ['place-influence'],
      calc(
        'count',
        calc(
          'union',
          q('spaces.find', {
            filter: { faction: 'NSDAP', relation: 'dominance', kind: 'non-city' },
          }),
          q('spaces.find', { filter: { faction: 'RC', relation: 'dominance', kind: 'non-city' } }),
        ),
      ),
    ),
    op('election.special', { policy: 'snap-election' }),
  ],
  118: [
    when(
      calc(
        'and',
        calc('eq', momentum, 'NSDAP'),
        pc('seats', 'NSDAP'),
        calc('gte', pv('NSDAP'), 15),
      ),
      [
        op('victory.declare', {
          faction: 'NSDAP',
          basis: '#118 授权法：momentum、国会议席与至少15 PV',
        }),
      ],
    ),
  ],
  119: [
    delta('economy', 1),
    op('track.change', { track: 'unity', mode: 'set', amount: 0 }),
    op('parliament.change', { card: 'article48', change: 'remove-permanently' }),
  ],
  120: branch(
    actor,
    '东部援助：选择一个地区',
    [...east, 'Pommern'].map((space) => ({
      label: SPACE[space].nameZh,
      steps: [
        op('leverage.place', { actor, owner: 'Coalition', optional: false, spaces: [space] }),
        place('Coalition', 1, [space], actor, false),
      ],
    })),
  ),
  121: [
    // English card: two spaces with NSDAP Momentum; otherwise three.
    when(
      calc('eq', momentum, 'NSDAP'),
      [remove(['NSDAP'], 2, all, actor, false, true, 1)],
      [remove(['NSDAP'], 3, all, actor, false, true, 1)],
    ),
    place('NSDAP', 3, owned('NSDAP', 'presence'), actor, true, true, 1),
  ],
  122: [
    when(calc('lte', pv('NSDAP'), 9), optionalTake('RC', 'NSDAP'), optionalTake('NSDAP', 'RC')),
  ],
  123: [delta('economy', 1)],
  124: [],
  125: [
    op('leverage.replace', {
      actor,
      from: 'Coalition',
      to: 'RC',
      count: q('mcs.count', { faction: 'RC' }),
      optional: false,
    }),
  ],
  126: religiousRemoval(['NorthernStates', 'Preussen']),
  127: [
    gain('NSDAP'),
    when(pc('seats', 'KPD'), [
      op('parliament.change', { card: 'seats', change: 'transfer', faction: 'NSDAP' }),
      op('parliament.change', { card: 'seats', change: 'refresh' }),
    ]),
    remove(['KPD'], 3, all, actor, false, true, 1),
  ],
  128: [op('track.change', { track: 'economy', mode: 'toward-stability', amount: 1 })],
  129: [
    {
      type: 'let',
      name: 'saSpaces',
      value: calc(
        'union',
        owned('NSDAP', 'supremacy'),
        q('spaces.find', { filter: { faction: 'NSDAP', piece: 'cadre' } }),
      ),
    },
    deploy('NSDAP', ['sa'], ref('saSpaces'), calc('count', ref('saSpaces')), actor, false, {
      distinct: true,
    }),
  ],
  130: [
    returns(
      calc(
        'union',
        calc('union', pieces('sa', 'NSDAP'), pieces('militia', 'KPD')),
        pieces('freikorps', 'RC'),
      ),
      1,
    ),
  ],
  131: [
    { type: 'let', name: 'beneficiary', value: momentum },
    when(
      calc('or', calc('eq', ref('beneficiary'), 'KPD'), calc('eq', ref('beneficiary'), 'NSDAP')),
      branch(ref('beneficiary'), '青年一代：选择一项', [
        {
          label: '同一地区放置至多2个本方影响力',
          steps: [
            place(ref('beneficiary'), 2, all, ref('beneficiary'), true, false, undefined, {
              sameSpace: true,
            }),
          ],
        },
        { label: '一次移动中产支持行动', steps: [grant(ref('beneficiary'), ['move-mcs'])] },
      ]),
    ),
  ],
  132: [when(calc('gte', pv('NSDAP'), 10), [place('NSDAP', 2, provinces, 'NSDAP', true, true, 1)])],
  133: [
    deploy('Coalition', ['reichswehr'], ['Ostpreussen', 'Posen-Westpreussen'], 1, actor, false, {
      fromMap: true,
    }),
  ],
  134: [
    op('random.roll', { count: 1, sides: 6 }, 'die'),
    when(
      calc('lte', ref('die', 'rolls', 0), 3),
      [grant(actor, ['move-mcs'], 1, undefined, false, false)],
      FACTIONS.map((f) => when(calc('eq', actor, f), [returnMcs(f)])),
    ),
  ],
  135: [
    remove(['NSDAP'], 1, ['Bayern'], actor, false),
    // Sequential instructions retain 6.0's same-Action-Step place/remove limit.
    when(calc('eq', momentum, 'RC'), [place('RC', 1, ['Bayern'], actor, false)]),
  ],
  136: religiousRemoval(['SouthernStates', 'Bayern']),
  137: [
    returns(pieces('sa', 'NSDAP'), 4, actor, false, true, 'removedSa'),
    {
      type: 'for-each',
      items: ref('removedSa', 'spaces'),
      item: 'space',
      body: branch('NSDAP', '冲锋队被禁：在该移除地区选择补偿', [
        { label: '放置至多2个 NSDAP 影响力', steps: [place('NSDAP', 2, array(ref('space')))] },
        {
          label: '若尚无干部，放置1个可用 NSDAP 干部',
          steps: [deploy('NSDAP', ['cadre'], array(ref('space')), 1, 'NSDAP', true)],
        },
        { label: '不放置', steps: [] },
      ]),
    },
  ],
  138: [
    ...branch(actor, '托洛茨基主义：选择移除', [
      { label: '1个 KPD 干部', steps: [returns(pieces('cadre', 'KPD'), 1)] },
      { label: '2个工人民兵', steps: [returns(pieces('militia', 'KPD'), 2)] },
      { label: '3个 KPD 影响力', steps: [remove(['KPD'], 3, all, actor, false)] },
    ]),
    ...branch('KPD', 'KPD 可移动一格立场', [
      { label: '向民主移动1格', steps: [op('stance.change', { faction: 'KPD', steps: -1 })] },
      { label: '向革命移动1格', steps: [op('stance.change', { faction: 'KPD', steps: 1 })] },
      { label: '不移动', steps: [] },
    ]),
  ],
  139: [
    deploy('NSDAP', ['cadre'], ['Baden']),
    grant('NSDAP', influenceActions, count('cadre', 'NSDAP'), undefined, false, false),
  ],
  140: [returns(pieces('sa', 'NSDAP', ['Berlin']))],
  141: [
    op('influence.allocate', {
      actor: 'RC',
      factions: ['NSDAP'],
      mode: 'replace',
      to: 'RC',
      count: 2,
      spaces: owned('RC', 'presence'),
      optional: true,
    }),
  ],
  142: branch('NSDAP', '性科学研究所遭焚毁：选择一项', [
    { label: '柏林放置1个 NSDAP 影响力', steps: [place('NSDAP', 1, ['Berlin'])] },
    { label: '柏林移除任意1个影响力', steps: [remove([...FACTIONS], 1, ['Berlin'], 'NSDAP')] },
  ]),
  143: [remove(['Coalition'], 1, ['Berlin'], actor, false)],
  144: [
    when(calc('eq', momentum, 'Coalition'), [
      op('random.roll', { count: 1, sides: 6 }, 'die'),
      when(
        calc('lte', ref('die', 'rolls', 0), 2),
        [gain('KPD')],
        [when(calc('lte', ref('die', 'rolls', 0), 4), [gain('NSDAP')], [gain('RC')])],
      ),
    ]),
  ],
  145: [op('stance.change', { faction: 'NSDAP', steps: 1 }), grant('NSDAP', influenceActions)],
  146: [
    { type: 'let', name: 'nsdapPv', value: pv('NSDAP') },
    { type: 'let', name: 'rcPv', value: pv('RC') },
    when(
      calc('gt', ref('nsdapPv'), ref('rcPv')),
      [gain('NSDAP')],
      [when(calc('gt', ref('rcPv'), ref('nsdapPv')), [gain('RC')])],
    ),
  ],
  147: [
    grant('NSDAP', ['place-unit', 'move-units']),
    when(has('sa', 'NSDAP', ['Schleswig-Holstein']), [grant('NSDAP', ['move-mcs'])]),
  ],
};
// Identical printed effects share a program body, but retain the physical source card.
definitions[100] = definitions[75];
definitions[102] = definitions[94];
export const CARD_PROGRAMS: Record<number, Program> = Object.fromEntries(
  Object.entries(definitions).map(([id, steps]) => [
    Number(id),
    { version: 1, id: `event-${id}-v1`, steps },
  ]),
);
