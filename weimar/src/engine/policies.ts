import { fixedStances } from './scenarios.ts';
import type { GameState, Faction, Era } from './types.ts';
import type { RuleKey } from './flow/protocol.ts';

type Rule = {
  card: number;
  key: RuleKey;
  mode: 'add' | 'set' | 'floor';
  value: number;
  faction?: Faction;
  when?: (s: GameState, faction?: Faction) => boolean;
};
/** Static rule definitions; serialized source cards in lingering determine life. */
export const RULES: Rule[] = [
  { card: 16, key: 'combat.spaces-per-action', mode: 'set', value: 2, faction: 'Coalition' },
  { card: 19, key: 'stance.max-steps', mode: 'set', value: 2, faction: 'NSDAP' },
  { card: 20, key: 'loyalty.progress-margin', mode: 'set', value: 2 },
  { card: 54, key: 'track.minimum', mode: 'floor', value: 1 },
  { card: 54, key: 'pv.regional-piece-value', mode: 'set', value: 4, faction: 'Coalition' },
  { card: 55, key: 'combat.strength', mode: 'add', value: 1, faction: 'NSDAP' },
  {
    card: 56,
    key: 'influence.amount-per-action',
    mode: 'set',
    value: 2,
    faction: 'NSDAP',
    when: (s) => s.momentum === 'NSDAP',
  },
  { card: 57, key: 'unit.strength', mode: 'set', value: 3, faction: 'RC' },
  { card: 57, key: 'pv.regional-piece-value', mode: 'set', value: 4, faction: 'RC' },
  { card: 58, key: 'unit.deployment-requires-influence', mode: 'set', value: 1, faction: 'NSDAP' },
  { card: 59, key: 'stance.max-steps', mode: 'set', value: 2, faction: 'KPD' },
  { card: 59, key: 'pv.regional-piece-value', mode: 'set', value: 4, faction: 'KPD' },
  { card: 62, key: 'unit.deployment-requires-influence', mode: 'set', value: 1, faction: 'KPD' },
  {
    card: 116,
    key: 'influence.reach-required',
    mode: 'set',
    value: 0,
    faction: 'NSDAP',
    when: (s) => s.momentum === 'NSDAP',
  },
  {
    card: 15,
    key: 'influence.replace-on-removal',
    mode: 'set',
    value: 1,
    when: (s, f) =>
      !!f &&
      ['RC', 'NSDAP'].includes(f) &&
      ['RC', 'NSDAP'].includes(s.momentum) &&
      s.tracks.reaction > s.tracks.progress,
  },
];
export function ruleValue(s: GameState, key: RuleKey, base: number, faction?: Faction) {
  for (const rule of RULES) {
    if (
      rule.key !== key ||
      !s.lingering.some((c) => c.card === rule.card) ||
      (rule.faction && rule.faction !== faction) ||
      (rule.when && !rule.when(s, faction))
    )
      continue;
    base =
      rule.mode === 'add'
        ? base + rule.value
        : rule.mode === 'floor'
          ? Math.max(base, rule.value)
          : rule.value;
  }
  return base;
}
export function shiftStance(s: GameState, faction: Faction, steps: number) {
  if (faction !== 'KPD' && faction !== 'NSDAP') throw new Error('只有 KPD / NSDAP 有立场');
  if (fixedStances(s)) {
    s.log.push({
      n: s.log.length + 1,
      text:
        s.scenario === 'black-sun'
          ? '黑日升起规则9.5：立场固定为务实，不移动立场标记。'
          : '教程规则9.2：立场固定为务实，不移动立场标记。',
    });
    return;
  }
  s.stance[faction] = Math.max(-3, Math.min(3, s.stance[faction] + steps));
  s.log.push({
    n: s.log.length + 1,
    text: `${faction} 立场调整为 ${s.stance[faction]}（-3 民主 / 0 务实 / +3 革命）。`,
  });
}
export function actionCompleted(s: GameState, faction: Faction, action: string) {
  if (action === 'move-mcs' && faction === 'NSDAP' && s.lingering.some((c) => c.card === 60)) {
    s.momentum = faction;
    s.log.push({ n: s.log.length + 1, text: '#60 种族理论：NSDAP 移动中产支持并获得 momentum。' });
  }
}
export function returnDecider(s: GameState, fallback: Faction) {
  return s.grantContext?.returnDecider ?? fallback;
}
export function seatsUsesRemaining(s: GameState) {
  if (!s.seats.available) return 0;
  const twice =
    s.lingering.some((c) => c.card === 124) &&
    (s.seats.owner === 'RC' || s.seats.owner === 'NSDAP');
  return Math.max(0, (twice ? 2 : 1) - (s.seats.uses ?? 0));
}
export function expireEra(s: GameState, era: Era, expiry: (card: number) => Era | undefined) {
  const expired = s.lingering.filter((c) => expiry(c.card) === era);
  s.discard.push(...expired);
  s.lingering = s.lingering.filter((c) => !expired.includes(c));
}
