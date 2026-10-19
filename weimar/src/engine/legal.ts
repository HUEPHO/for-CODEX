import { actionCandidates } from './actions.ts';
import { active } from './rules.ts';
import { dispatch } from './reducer.ts';
import type { GameState, Action, Faction } from './types.ts';
export function legalActions(
  s: GameState,
  actor: Faction = active(s),
): { label: string; action: Action }[] {
  if (s.pending || s.phase !== 'action' || s.turn.actionsLeft === 0 || active(s) !== actor)
    return [];
  return actionCandidates(s, actor).filter(
    ({ action }) => dispatch(s, { type: 'action', actor, action }).ok,
  );
}
export function legalParliamentaryActions(s: GameState, region: string) {
  const actor = active(s);
  return actionCandidates(s, actor).filter(
    ({ action }) => dispatch(s, { type: 'play-pc', actor, region, action }).ok,
  );
}
