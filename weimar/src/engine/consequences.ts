import { SPACE } from '../data/board.ts';
import type { Effect, Faction, GameState } from './types.ts';
import { onMap, piecesAt, record, returnEffects } from './rules.ts';
import { returnDecider } from './policies.ts';

export function strikeConsequences(s: GameState, space: string, actor: Faction): Effect[] {
  const chooser = returnDecider(s, actor);
  const effects = returnEffects(s, piecesAt(s, space, 'leverage'), chooser);
  if (s.pieces.filter((p) => p.kind === 'strike' && onMap(p)).length >= 3 && !s.generalStrike) {
    s.generalStrike = true;
    record(s, '总罢工触发：清除地图与经济轨道上的杠杆，并移除1个改革。');
    const reforms = s.pieces.filter((p) => p.kind === 'reform' && onMap(p));
    if (reforms.length)
      effects.push({
        type: 'choice',
        actor: 'KPD',
        prompt: '总罢工：KPD 选择移除1个改革',
        options: reforms.map((p) => ({
          id: p.id,
          label: SPACE[p.location].nameZh,
          effects: [{ type: 'return', pieceId: p.id, actor: chooser }],
        })),
      });
    effects.push(
      ...returnEffects(
        s,
        s.pieces.filter(
          (p) =>
            p.kind === 'leverage' &&
            (onMap(p) || p.location.startsWith('@economy:')) &&
            !effects.some((e) => e.type === 'return' && e.pieceId === p.id),
        ),
        chooser,
      ),
    );
  }
  return effects;
}
