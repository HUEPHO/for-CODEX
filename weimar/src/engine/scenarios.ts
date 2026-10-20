import type { Era, Faction, GameState, PieceKind, ScenarioId } from './types.ts';

type Placement = [kind: PieceKind, owner: Faction | null, location: string, count?: number];
interface Scenario {
  name: string;
  setup: 'Fate' | 'Revolution' | 'NewHope' | 'BlackSun';
  startYear: number;
  endYear: number;
  era: Era;
  handSize: number;
  fixedStances: boolean;
  unlimitedReaction: boolean;
  tracks: GameState['tracks'];
  stance: GameState['stance'];
  holdings: string[];
  placements: Placement[];
}
const boxes = (group: string, ...levels: number[]) => levels.map((n) => `@${group}:${n}`);
const crisisHoldings = [
  '@reaction:2',
  ...boxes('mcs', 2, 3, 4, 5),
  ...boxes('reform', 2, 3, 4, 5),
  '@reaction-assassination:2',
  '@reaction-cadre:3',
  '@reaction-cadre:4',
  '@reaction-clique:5',
  ...boxes('us', 1, 2, 3, 4, 5),
  ...boxes('ussr-army', 1, 3, 5),
  ...boxes('ussr-yellow', 2, 4),
  ...boxes('ussr-black', 1, 3),
  ...boxes('ussr-cadre', 2, 4, 5),
  '@economy-mcs:1',
  '@economy-mcs:9',
  '@kpd-cadre:1',
  '@kpd-cadre:2',
  ...boxes('kpd-strike', 1, 2, 3, 4),
  ...boxes('nsdap-cadre', 1, 2, 3),
  '@nsdap-assassination:1',
  ...boxes('rc-economic', 2, 3, 4),
  '@rc-clique:2',
  '@rc-assassination:1',
];
// Preserve the Fate 0.6 piece order: saved commands refer to these stable piece IDs.
const crisisPlacements: Placement[] = [
  ['mcs', null, 'mat:RC'],
  ['freikorps', 'Coalition', 'Berlin', 2],
  ['freikorps', 'Coalition', 'Koeln'],
  ['freikorps', 'Coalition', 'Muenchen'],
  ['freikorps', 'Coalition', 'reserve:Coalition', 5],
  ['freikorps', 'RC', 'Berlin'],
  ['freikorps', 'RC', 'reserve:RC', 2],
  ['militia', 'KPD', 'Berlin'],
  ['militia', 'KPD', 'reserve:KPD', 8],
  ['sa', 'NSDAP', 'reserve:NSDAP', 9],
  ['clique', 'RC', 'Bayern'],
];
const laterHoldings = [
  ...boxes('progress', 2, 3),
  ...boxes('reaction', 2, 3),
  ...boxes('mcs', 4, 5),
  ...boxes('reform', 2, 3, 4, 5),
  '@reaction-assassination:2',
  '@reaction-cadre:4',
  '@reaction-clique:5',
  ...boxes('us', 3, 4, 5),
  ...boxes('ussr-army', 3, 5),
  ...boxes('ussr-yellow', 2, 4),
  '@ussr-black:3',
  ...boxes('ussr-cadre', 4, 5),
  '@economy-mcs:1',
  '@economy-mcs:9',
  ...boxes('kpd-cadre', 1, 2),
  ...boxes('kpd-strike', 1, 2, 3, 4),
  ...boxes('nsdap-cadre', 1, 2, 3),
  '@nsdap-assassination:1',
  ...boxes('rc-economic', 3, 4),
  '@rc-assassination:1',
];
const crisisTracks: GameState['tracks'] = {
  economy: 5,
  progress: 1,
  reaction: 2,
  us: 1,
  ussr: 1,
  unity: 1,
  dollarDependence: 0,
};
export const SCENARIOS: Record<ScenarioId, Scenario> = {
  fate: {
    name: '共和国的命运',
    setup: 'Fate',
    startYear: 1919,
    endYear: 1933,
    era: 'crisis',
    handSize: 7,
    fixedStances: false,
    unlimitedReaction: false,
    tracks: crisisTracks,
    stance: { KPD: 2, NSDAP: 3 },
    holdings: crisisHoldings,
    placements: crisisPlacements,
  },
  revolution: {
    name: '革命时代',
    setup: 'Revolution',
    startYear: 1919,
    endYear: 1923,
    era: 'crisis',
    handSize: 7,
    fixedStances: false,
    unlimitedReaction: true,
    tracks: crisisTracks,
    stance: { KPD: 2, NSDAP: 3 },
    holdings: crisisHoldings.map((id) => (id === '@ussr-black:1' ? '@rc-economic:1' : id)),
    placements: crisisPlacements,
  },
  'new-hope': {
    name: '新希望',
    setup: 'NewHope',
    startYear: 1924,
    endYear: 1933,
    era: 'golden',
    handSize: 9,
    fixedStances: false,
    unlimitedReaction: false,
    tracks: { economy: 5, progress: 2, reaction: 3, us: 2, ussr: 2, unity: 2, dollarDependence: 0 },
    stance: { KPD: 0, NSDAP: 0 },
    holdings: laterHoldings,
    placements: [
      ['mcs', null, 'mat:Coalition'],
      ['mcs', null, 'mat:RC', 2],
      ['leverage', 'RC', 'Bayern'],
      ['clique', 'RC', 'Bayern'],
      ['clique', 'RC', 'Ostpreussen'],
      ['reichswehr', 'Coalition', 'Berlin'],
      ['cadre', 'KPD', 'Berlin'],
      ['militia', 'KPD', 'Berlin'],
      ['freikorps', 'RC', 'Berlin'],
      ['freikorps', 'RC', 'reserve:RC', 5],
      ['militia', 'KPD', 'reserve:KPD', 8],
      ['cadre', 'NSDAP', 'Muenchen'],
      ['sa', 'NSDAP', 'Muenchen'],
      ['sa', 'NSDAP', 'reserve:NSDAP', 8],
      ['freikorps', 'RC', 'removed', 3],
      ['freikorps', 'Coalition', 'removed', 3],
    ],
  },
  'black-sun': {
    name: '黑日升起',
    setup: 'BlackSun',
    startYear: 1928,
    endYear: 1933,
    era: 'golden',
    handSize: 3,
    fixedStances: true,
    unlimitedReaction: true,
    tracks: { economy: 5, progress: 4, reaction: 3, us: 4, ussr: 4, unity: 1, dollarDependence: 2 },
    stance: { KPD: 0, NSDAP: 0 },
    holdings: [
      ...laterHoldings.filter(
        (id) =>
          !['@us:3', '@ussr-army:3', '@ussr-yellow:2', '@ussr-black:3', '@nsdap-cadre:1'].includes(
            id,
          ),
      ),
      '@progress:4',
      '@reaction-cadre:3',
    ],
    placements: [
      ['mcs', null, 'mat:Coalition'],
      ['mcs', null, 'mat:NSDAP'],
      ['mcs', null, 'mat:RC'],
      ['freikorps', 'RC', 'Bayern'],
      ['sa', 'NSDAP', 'Bayern'],
      ['leverage', 'RC', 'Bayern'],
      ['clique', 'RC', 'Bayern'],
      ['sa', 'NSDAP', 'Berlin'],
      ['reichswehr', 'Coalition', 'Berlin'],
      ['leverage', 'Coalition', 'Berlin'],
      ['militia', 'KPD', 'Berlin'],
      ['freikorps', 'RC', 'Berlin'],
      ['militia', 'KPD', 'Hamburg'],
      ['cadre', 'KPD', 'Koeln'],
      ['militia', 'KPD', 'Koeln', 2],
      ['cadre', 'NSDAP', 'Muenchen'],
      ['sa', 'NSDAP', 'Muenchen', 2],
      ['reichswehr', 'Coalition', 'Muenchen'],
      ['leverage', 'RC', 'Ostpreussen'],
      ['freikorps', 'RC', 'Ostpreussen'],
      ['clique', 'RC', 'Ostpreussen'],
      ['freikorps', 'RC', 'reserve:RC', 3],
      ['militia', 'KPD', 'reserve:KPD', 5],
      ['sa', 'NSDAP', 'reserve:NSDAP', 5],
      ['freikorps', 'RC', 'removed', 3],
      ['freikorps', 'Coalition', 'removed', 3],
    ],
  },
};

export const fixedStances = (s: GameState) =>
  s.ruleset === 'tutorial-v1' || !!(s.scenario && SCENARIOS[s.scenario].fixedStances);
export const reactionLimited = (s: GameState) =>
  s.ruleset !== 'tutorial-v1' && !(s.scenario && SCENARIOS[s.scenario].unlimitedReaction);
