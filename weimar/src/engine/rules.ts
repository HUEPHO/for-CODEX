import { fixedStances, reactionLimited } from './scenarios.ts';
import { SPACES, SPACE, distance } from '../data/board.ts';
import { HOLDINGS, HOLDING, isDeployedTrack } from '../data/holdings.ts';
import { FACTIONS } from './types.ts';
import { ruleValue } from './policies.ts';
import type { GameState, Faction, FactionValues, Piece, PieceKind, Effect } from './types.ts';

export class RuleError extends Error {}
export function ensure(value: unknown, message: string): asserts value {
  if (!value) throw new RuleError(message);
}
export function integer(
  value: unknown,
  min: number,
  max: number,
  message = '数值超出允许范围',
): asserts value is number {
  ensure(
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max,
    message,
  );
}
export const zeros = (): FactionValues => ({ Coalition: 0, KPD: 0, NSDAP: 0, RC: 0 });
export const active = (s: GameState): Faction => s.order[s.activeIndex];
export function record(s: GameState, text: string) {
  s.log.push({ n: s.log.length + 1, text });
}
export const inEffect = (s: GameState, n: number) => s.lingering.some((c) => c.card === n);
export const piecesAt = (s: GameState, where: string, kind?: PieceKind) =>
  s.pieces.filter((p) => p.location === where && (!kind || p.kind === kind));
export const onMap = (p: Piece) => !!SPACE[p.location];
export const isUnit = (p: Piece) => ['freikorps', 'reichswehr', 'militia', 'sa'].includes(p.kind);
export const mcs = (s: GameState, f: Faction) => piecesAt(s, `mat:${f}`, 'mcs').length;
export const presence = (s: GameState, f: Faction, id: string) => s.influence[id]?.[f] > 0;
export function uniqueLeader(values: FactionValues): Faction | null {
  const best = Math.max(...Object.values(values));
  const top = FACTIONS.filter((f) => values[f] === best);
  return best > 0 && top.length === 1 ? top[0] : null;
}
export const dominance = (s: GameState, id: string) => uniqueLeader(s.influence[id]);
export function survival(s: GameState, p: Piece) {
  return p.kind === 'reichswehr'
    ? 3
    : p.kind === 'freikorps'
      ? ruleValue(s, 'unit.strength', 2, p.owner ?? undefined)
      : ['militia', 'sa'].includes(p.kind)
        ? 1
        : 0;
}
export function supremacy(s: GameState, id: string): Faction | null {
  const totals = zeros();
  for (const p of piecesAt(s, id)) if (p.owner) totals[p.owner] += survival(s, p);
  return uniqueLeader(totals);
}
export const controls = (s: GameState, f: Faction, id: string) =>
  s.pc[SPACE[id].region].owner === f;
export const supply = (s: GameState, f: Faction) =>
  (f === 'Coalition' ? 45 : 35) - SPACES.reduce((n, p) => n + s.influence[p.id][f], 0);
export function blockedByAssassination(s: GameState, f: Faction, id: string) {
  return piecesAt(s, id, 'assassination').some(
    (p) => p.side === (['Coalition', 'KPD'].includes(f) ? 'left' : 'right'),
  );
}
export const influencePower = (s: GameState, f: Faction) =>
  ruleValue(
    s,
    'influence.amount-per-action',
    f === 'Coalition'
      ? 1
      : f === 'RC'
        ? s.tracks.reaction === 5
          ? 3
          : s.tracks.reaction === 4
            ? 2
            : 1
        : s.tracks.economy === 9
          ? 3
          : s.tracks.economy >= 7
            ? 2
            : 1,
    f,
  );
export function withinReach(s: GameState, f: Faction, id: string, placing: boolean) {
  if (ruleValue(s, 'influence.reach-required', 1, f) === 0) return true;
  if (f === 'RC') {
    if (placing && distance('Berlin', id) <= 1) return true;
    return s.pieces.some(
      (p) => p.kind === 'clique' && onMap(p) && distance(p.location, id) <= Math.max(1, mcs(s, f)),
    );
  }
  if (
    placing &&
    (['Coalition', 'KPD'].includes(f)
      ? distance('Berlin', id) <= 1
      : ['Muenchen', 'Bayern'].includes(id))
  )
    return true;
  if (placing && f === 'NSDAP' && dominance(s, id) === 'RC') return true;
  const origins = SPACES.filter(
    (p) =>
      presence(s, f, p.id) || (!placing && piecesAt(s, p.id, 'cadre').some((x) => x.owner === f)),
  );
  return (
    origins.some((p) => distance(p.id, id) <= 1) ||
    piecesAt(s, id, 'cadre').some((p) => p.owner === f)
  );
}
export function changeInfluence(
  s: GameState,
  f: Faction,
  id: string,
  amount: number,
  event = false,
  conflictException = false,
) {
  ensure(SPACE[id], '地区不存在');
  integer(amount, -45, 45);
  const before = dominance(s, id);
  if (amount > 0) {
    if (
      (!conflictException && s.turn.removed.includes(id)) ||
      blockedByAssassination(s, f, id) ||
      (!event && f === 'Coalition' && s.tracks.economy <= 3)
    ) {
      if (event) {
        record(s, `${SPACE[id].nameZh}：放置受规则限制，跳过。`);
        return;
      }
      throw new RuleError('该地区本回合已移除影响力，或暗杀／经济状态禁止放置');
    }
    const room = SPACE[id].population - Object.values(s.influence[id]).reduce((a, b) => a + b, 0);
    if (event) amount = Math.min(amount, room, supply(s, f));
    else ensure(amount <= room && amount <= supply(s, f), '超过地区人口上限或阵营剩余方块');
    if (amount > 0 && !conflictException) s.turn.placed.push(id);
  } else if (amount < 0) {
    if (!conflictException && s.turn.placed.includes(id)) {
      if (event) {
        record(s, `${SPACE[id].nameZh}：本回合已放置影响力，跳过移除。`);
        return;
      }
      throw new RuleError('同一阵营回合中不能在同一地区放置和移除影响力');
    }
    if (event) amount = -Math.min(-amount, s.influence[id][f]);
    else ensure(-amount <= s.influence[id][f], '目标阵营没有足够影响力');
    if (amount < 0 && !conflictException) s.turn.removed.push(id);
  }
  s.influence[id][f] += amount;
  if (amount) record(s, `${f} · ${SPACE[id].nameZh} 影响力 ${amount > 0 ? '+' : ''}${amount}`);
  if (inEffect(s, 1) && before !== 'NSDAP' && dominance(s, id) === 'NSDAP') {
    s.momentum = 'NSDAP';
    record(s, '#1 煽动民众：NSDAP 获得新的领导权，取得 momentum。');
  }
}
export function available(s: GameState, p: Piece, f: Faction): boolean {
  if (isUnit(p) && p.owner === f && p.location === `reserve:${f}`) return true;
  const h = HOLDING[p.location];
  if (!h || isDeployedTrack(p.location)) return false;
  if (h.owner && h.owner !== f) return false;
  if (h.group === 'mcs')
    return h.level <= s.tracks[['Coalition', 'KPD'].includes(f) ? 'progress' : 'reaction'];
  if (h.group === 'economy-mcs') return s.tracks.economy === h.level;
  if (h.group === 'rc-economic')
    return !s.pieces.some(
      (x) => HOLDING[x.location]?.group === h.group && HOLDING[x.location].level < h.level,
    );
  if (h.group === 'rc-clique') return !piecesAt(s, `@rc-economic:${h.level}`).length;
  if (h.group === 'rc-assassination') return f === 'RC' && !piecesAt(s, '@rc-economic:3').length;
  if (h.group === 'nsdap-assassination')
    return f === 'NSDAP' && (fixedStances(s) || s.stance.NSDAP >= 2);
  if (!fixedStances(s)) {
    if (h.group === 'kpd-cadre') return s.stance.KPD <= -(h.level + 1);
    if (h.group === 'kpd-strike') return h.level === 1 || s.stance.KPD >= h.level - 1;
    if (h.group === 'nsdap-cadre') return s.stance.NSDAP <= -h.level;
  }
  if (h.track) return h.level <= s.tracks[h.track];
  return true; // Tutorial (9.2) and Black Sun (9.5) ignore stance-based availability.
}
export function returnOptions(s: GameState, p: Piece) {
  const candidates = HOLDINGS.filter(
    (h) =>
      h.kind === p.kind &&
      h.owner === p.owner &&
      !isDeployedTrack(h.id) &&
      !piecesAt(s, h.id).length,
  );
  return candidates.filter(
    (h) => !candidates.some((other) => other.group === h.group && other.level > h.level),
  );
}
export const returnEffects = (s: GameState, pieces: Piece[], actor: Faction): Effect[] =>
  pieces.map((p) => ({ type: 'return', pieceId: p.id, actor }));
export function clampTracks(s: GameState) {
  const highest = (group: string) =>
    Math.max(
      1,
      ...s.pieces
        .filter((p) => p.location.startsWith(`@${group}:`))
        .map((p) => Number(p.location.split(':')[1])),
    );
  s.tracks.progress = Math.min(highest('progress'), Math.max(1, s.tracks.progress));
  s.tracks.reaction = Math.min(highest('reaction'), Math.max(1, s.tracks.reaction));
  if (reactionLimited(s)) s.tracks.reaction = Math.min(s.tracks.reaction, s.tracks.progress + 1);
  s.tracks.unity = Math.min(2, Math.max(ruleValue(s, 'track.minimum', 0), s.tracks.unity));
  s.tracks.us = Math.min(5, Math.max(1, s.tracks.us));
  s.tracks.ussr = Math.min(5, Math.max(1, s.tracks.ussr));
  let low = 1,
    high = 9;
  for (const p of s.pieces.filter(
    (p) => p.kind === 'leverage' && p.owner === 'Coalition' && p.location.startsWith('@economy:'),
  )) {
    const v = Number(p.location.split(':')[1]);
    if (v <= 5) low = Math.max(low, v);
    if (v >= 5) high = Math.min(high, v);
  }
  if (s.year >= 1930 && s.tracks.dollarDependence)
    low = Math.max(low, 5 + s.tracks.dollarDependence);
  s.tracks.economy = Math.max(low, Math.min(high, s.tracks.economy));
}
export function cleanSlate(s: GameState, region?: string): Effect[] {
  const remove = s.pieces.filter((p) => {
    if (!onMap(p) || (region && SPACE[p.location].region !== region)) return false;
    const dom = dominance(s, p.location),
      pc = s.pc[SPACE[p.location].region].owner;
    if (p.kind === 'assassination') return true;
    if (p.kind === 'strike' && p.side === 'strike')
      return (
        dom !== 'KPD' &&
        pc !== 'KPD' &&
        !piecesAt(s, p.location, 'cadre').some((c) => c.owner === 'KPD')
      );
    return p.kind === 'leverage' && dom !== p.owner && pc !== p.owner;
  });
  return returnEffects(s, remove, s.momentum);
}
export function assertInvariants(s: GameState) {
  ensure(s.schema === 1, '存档版本不兼容');
  ensure(
    s.order.length === 4 &&
      new Set(s.order).size === 4 &&
      s.order.every((f) => FACTIONS.includes(f)),
    '阵营顺序无效',
  );
  integer(s.activeIndex, 0, 3);
  integer(s.year, 1919, 1933);
  integer(s.stance.KPD, -3, 3);
  integer(s.stance.NSDAP, -3, 3);
  integer(s.rng, 0, 4294967295);
  integer(s.turn.actionsLeft, 0, 2);
  for (const name of ['economy', 'progress', 'reaction', 'us', 'ussr', 'unity'] as const)
    integer(
      s.tracks[name],
      name === 'unity' ? 0 : 1,
      name === 'economy' ? 9 : name === 'unity' ? 2 : 5,
    );
  for (const sp of SPACES) {
    for (const f of FACTIONS) integer(s.influence[sp.id][f], 0, 45);
    ensure(
      Object.values(s.influence[sp.id]).reduce((a, b) => a + b, 0) <= sp.population,
      `${sp.id} 超过人口上限`,
    );
    ensure(piecesAt(s, sp.id, 'cadre').length <= 1, '一个地区至多1个 Cadre');
    ensure(piecesAt(s, sp.id, 'strike').length <= 1, '一个地区至多1个罢工或起义');
  }
  for (const f of FACTIONS) ensure(supply(s, f) >= 0, '方块总量不守恒');
  ensure(new Set(s.pieces.map((p) => p.id)).size === s.pieces.length, '重复棋子');
  ensure(new Set(s.turn.assaulted).size === s.turn.assaulted.length, '同一回合重复突击地区');
  for (const p of s.pieces.filter(isUnit)) {
    ensure(!!p.owner, '部队必须属于一个阵营');
    ensure(
      onMap(p) ||
        p.location === 'removed' ||
        p.location === `reserve:${p.owner}` ||
        (p.kind === 'reichswehr' && HOLDING[p.location]?.kind === 'reichswehr'),
      '部队位置无效',
    );
    if (p.kind === 'freikorps') {
      ensure(p.allegiance === 'Coalition' || p.allegiance === 'RC', '自由军团缺少忠诚面');
      ensure(
        p.revealed ? p.owner === p.allegiance : p.owner === 'Coalition',
        '自由军团所属与忠诚状态不符',
      );
    }
  }
  if (s.combat) {
    ensure(s.phase === 'action' && !!SPACE[s.combat.space], '突击阶段或地区无效');
    ensure(s.combat.attacker !== s.combat.defender, '突击双方不能相同');
    for (const id of Object.keys(s.combat.participants))
      ensure(
        s.pieces.some((p) => p.id === id && isUnit(p)),
        '突击参与者不存在',
      );
  }
  for (const h of HOLDINGS) ensure(piecesAt(s, h.id).length <= 1, '存放格重复占用');
  for (let v = 2; v <= 8; v++)
    ensure(piecesAt(s, `@economy:${v}`).length <= 1, '经济轨道格重复占用');
  const allCards = [
    ...s.deck,
    ...s.discard,
    ...(s.removedCards ?? []),
    ...s.lingering,
    ...FACTIONS.flatMap((f) => s.hands[f]),
    ...(s.electionCard ? [s.electionCard] : []),
  ];
  ensure(new Set(allCards.map((c) => c.uid)).size === allCards.length, '卡牌出现于多个区域');
  ensure(s.pieces.filter((p) => p.kind === 'mcs').length === 7, '中产支持棋子总数必须为7');
}
