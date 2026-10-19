import { SPACE } from '../data/board.ts';
import type {
  Faction,
  GameState,
  Piece,
  AssassinationEffect,
  ChoiceOption,
  Effect,
} from './types.ts';
import { available, ensure, onMap, piecesAt, presence, record, supremacy } from './rules.ts';
import { returnDecider } from './policies.ts';

export function assassinationTargets(actor: Faction, side: 'left' | 'right'): Faction[] {
  return side === 'left' ? ['Coalition', 'KPD'] : [actor === 'NSDAP' ? 'RC' : 'NSDAP'];
}
export function canAssassinate(
  s: GameState,
  actor: Faction,
  p: Piece,
  space: string,
  side: 'left' | 'right',
) {
  return (
    ['RC', 'NSDAP'].includes(actor) &&
    !!SPACE[space] &&
    (side === 'left' || side === 'right') &&
    p.kind === 'assassination' &&
    available(s, p, actor) &&
    assassinationTargets(actor, side).some((f) => presence(s, f, space))
  );
}
export function resolveAssassination(s: GameState, e: AssassinationEffect) {
  if (e.type === 'assassination-place') {
    const p = s.pieces.find((p) => p.id === e.pieceId);
    ensure(p?.kind === 'assassination', '暗杀标记不存在');
    p.location = e.space;
    p.side = e.side;
    record(s, `${SPACE[e.space].nameZh} 放置 ${e.side === 'left' ? '黄红' : '棕黑'} 暗杀标记。`);
    return;
  }
  if (e.type === 'assassination-bonus') {
    if (e.actor !== 'NSDAP' || s.pieces.filter((p) => p.kind === 'clique' && onMap(p)).length < 2)
      return;
    const markers = s.pieces.filter((p) => p.kind === 'assassination' && available(s, p, e.actor));
    const cliques = s.pieces.filter(
      (p) =>
        p.kind === 'clique' &&
        onMap(p) &&
        supremacy(s, p.location) !== 'RC' &&
        (!s.grantContext?.spaces || s.grantContext.spaces.includes(p.location)) &&
        (!e.region || SPACE[p.location].region === e.region),
    );
    const options = markers.flatMap((marker) =>
      cliques.map((clique): ChoiceOption => ({
        id: `${marker.id}:${clique.id}`,
        label: `${SPACE[clique.location].nameZh}：放置棕黑暗杀并移除 ${clique.id}`,
        effects: [
          {
            type: 'assassination-place',
            pieceId: marker.id,
            space: clique.location,
            side: 'right',
          },
          { type: 'return', pieceId: clique.id, actor: returnDecider(s, e.actor) },
        ],
      })),
    );
    if (options.length)
      s.pending = {
        actor: e.actor,
        prompt: '地图至少有两个保守派集团：执行 NSDAP 额外暗杀',
        options,
      };
    return;
  }
  const factions = assassinationTargets(e.actor, e.side);
  const next: Effect = { type: 'assassination-bonus', actor: e.actor, region: e.region };
  const options: ChoiceOption[] = [];
  // Official October 2026 clarification: assassination losses bypass the
  // same-step place/remove conflict and do not create that conflict afterwards.
  const limits = factions.map((f) => s.influence[e.space][f]);
  for (let a = 0; a <= Math.min(2, limits[0]); a++) {
    for (let b = 0; b <= Math.min(2 - a, limits[1] ?? 0); b++) {
      const counts = [a, b];
      const effects = factions.flatMap((f, i): Effect[] =>
        counts[i]
          ? [
              {
                type: 'influence',
                faction: f,
                space: e.space,
                amount: -counts[i],
                conflictException: true,
              },
            ]
          : [],
      );
      options.push({
        id: `cubes:${a}:${b}`,
        label:
          a + b
            ? `移除 ${factions.map((f, i) => `${f} ${counts[i]}`).join(' / ')} 影响力`
            : '不移除影响力',
        effects: [...effects, next],
      });
    }
  }
  for (const p of piecesAt(s, e.space)) {
    if (
      (e.side === 'left' && (p.kind === 'reform' || (p.kind === 'cadre' && p.owner === 'KPD'))) ||
      (e.side === 'right' && e.actor === 'RC' && p.kind === 'cadre' && p.owner === 'NSDAP')
    ) {
      options.push({
        id: p.id,
        label: `移除 ${p.owner} ${p.kind === 'reform' ? '改革' : '干部'} ${p.id}`,
        effects: [{ type: 'return', pieceId: p.id, actor: returnDecider(s, e.actor) }, next],
      });
    }
  }
  s.pending = {
    actor: e.actor,
    prompt: `${SPACE[e.space].nameZh} 暗杀：移除至多2个目标影响力，或1个符合条件的改革／干部`,
    options,
  };
}
