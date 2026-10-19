import { SPACE, SPACES, distance } from '../data/board.ts';
import type { Faction, GameState, Piece, MilitaryEffect, Effect, ChoiceOption } from './types.ts';
import {
  available,
  controls,
  dominance,
  ensure,
  isUnit,
  onMap,
  piecesAt,
  record,
  presence,
} from './rules.ts';
import { ruleValue } from './policies.ts';

const UNIT_NAMES = {
  freikorps: '自由军团',
  reichswehr: '国防军',
  militia: '工人民兵',
  sa: '冲锋队',
};
export function unitLabel(p: Piece) {
  const name = UNIT_NAMES[p.kind as keyof typeof UNIT_NAMES] ?? p.kind;
  const loyalty = p.kind === 'freikorps' ? (p.revealed ? '已揭示' : '未揭示') : '';
  return `${p.owner} ${name} ${p.id}${loyalty ? `（${loyalty}）` : ''}`;
}
export function canPlaceUnit(s: GameState, actor: Faction, p: Piece, space: string) {
  return (
    !!SPACE[space] &&
    isUnit(p) &&
    p.owner === actor &&
    available(s, p, actor) &&
    (controls(s, actor, space) ||
      (ruleValue(s, 'unit.deployment-requires-influence', 0, actor) === 1 &&
        presence(s, actor, space)) ||
      dominance(s, space) === actor ||
      (['KPD', 'NSDAP'].includes(actor) &&
        piecesAt(s, space, 'cadre').some((c) => c.owner === actor)))
  );
}
export function movementOptions(
  s: GameState,
  actor: Faction,
  moved: string[],
  region?: string,
  allowedSpaces?: string[],
) {
  return s.pieces
    .filter((p) => isUnit(p) && p.owner === actor && onMap(p) && !moved.includes(p.id))
    .flatMap((p) => {
      const range = s.generalStrike || piecesAt(s, p.location, 'strike').length ? 1 : 3;
      return SPACES.filter(
        (sp) =>
          sp.id !== p.location &&
          (!region || sp.region === region) &&
          (!allowedSpaces || allowedSpaces.includes(sp.id)) &&
          distance(p.location, sp.id) <= range,
      ).map((sp) => ({ piece: p, to: sp.id }));
    });
}
export function unrevealedUnits(
  s: GameState,
  spaces: string[] = [],
  region?: string,
  allowedSpaces?: string[],
) {
  return s.pieces
    .filter(
      (p) =>
        p.kind === 'freikorps' &&
        p.owner === 'Coalition' &&
        !p.revealed &&
        onMap(p) &&
        !spaces.includes(p.location) &&
        (!region || SPACE[p.location].region === region),
      // Scope is applied below without exposing hidden loyalties.
    )
    .filter((p) => !allowedSpaces || allowedSpaces.includes(p.location));
}
export function revealUnit(s: GameState, id: string) {
  const p = s.pieces.find((p) => p.id === id);
  ensure(p?.kind === 'freikorps' && p.allegiance, '忠诚检定需要自由军团');
  if (p.revealed) return;
  p.revealed = true;
  p.owner = p.allegiance;
  if (p.location.startsWith('reserve:')) p.location = `reserve:${p.owner}`;
  record(
    s,
    `${SPACE[p.location]?.nameZh ?? p.location}：${p.id} 揭示为 ${p.owner === 'RC' ? 'RC 叛离自由军团' : '忠诚的联盟自由军团'}。`,
  );
}
export function resolveMilitary(s: GameState, e: MilitaryEffect) {
  switch (e.type) {
    case 'reveal-unit':
      revealUnit(s, e.pieceId);
      break;
    case 'move-units-choice': {
      const finish: Effect[] = ['KPD', 'NSDAP'].includes(e.actor)
        ? [...new Set(e.arrivals)].map((space) => ({
            type: 'sworn-enemies',
            actor: e.actor,
            space,
          }))
        : [];
      const moves =
        e.moved.length < 3 ? movementOptions(s, e.actor, e.moved, e.region, e.spaces) : [];
      if (!moves.length) {
        s.effects.unshift(...finish);
        break;
      }
      s.pending = {
        actor: e.actor,
        prompt: `移动部队：已移动 ${e.moved.length}/3 支；每支只能移动一次`,
        options: [
          { id: 'stop', label: '完成移动并处理死敌突击', effects: finish },
          ...moves.map(({ piece, to }): ChoiceOption => ({
            id: `${piece.id}:${to}`,
            label: `${unitLabel(piece)}：${SPACE[piece.location].nameZh} → ${SPACE[to].nameZh}`,
            effects: [
              { type: 'move-piece', pieceId: piece.id, to },
              {
                type: 'log',
                text: `${unitLabel(piece)} 从 ${SPACE[piece.location].nameZh} 移至 ${SPACE[to].nameZh}。`,
              },
              { ...e, moved: [...e.moved, piece.id], arrivals: [...e.arrivals, to] },
            ],
          })),
        ],
      };
      break;
    }
    case 'loyalty-choice': {
      const units =
        e.spaces.length < 3 ? unrevealedUnits(s, e.spaces, e.region, e.allowedSpaces) : [];
      if (!units.length) break;
      s.pending = {
        actor: e.actor,
        prompt: `测试联盟忠诚：已检查 ${e.spaces.length}/3 个地区，每个地区翻一支部队`,
        options: [
          { id: 'stop', label: '结束忠诚检定', effects: [] },
          ...units.map((p): ChoiceOption => ({
            id: p.id,
            label: `${SPACE[p.location].nameZh} · ${unitLabel(p)}`,
            effects: [
              { type: 'reveal-unit', pieceId: p.id },
              { ...e, spaces: [...e.spaces, p.location] },
            ],
          })),
        ],
      };
      break;
    }
    case 'sworn-enemies': {
      const units = piecesAt(s, e.space).filter(isUnit);
      if (!units.some((p) => p.owner === 'KPD') || !units.some((p) => p.owner === 'NSDAP')) break;
      const begin = (attacker: Faction): Effect => ({
        type: 'combat-start',
        attacker,
        defender: attacker === 'KPD' ? 'NSDAP' : 'KPD',
        space: e.space,
        free: true,
      });
      if (e.actor === 'KPD' || e.actor === 'NSDAP') s.effects.unshift(begin(e.actor));
      else
        s.pending = {
          actor: e.actor,
          prompt: `${SPACE[e.space].nameZh} 触发死敌免费突击：选择进攻方`,
          options: ['KPD', 'NSDAP'].map((f) => ({
            id: f,
            label: `${f} 进攻`,
            effects: [begin(f as Faction)],
          })),
        };
      break;
    }
  }
}
