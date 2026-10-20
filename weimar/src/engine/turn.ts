import type { TurnState } from './types.ts';

export const newTurn = (): TurnState => ({
  mode: 'unselected',
  actionsLeft: 0,
  eventDone: false,
  placed: [],
  removed: [],
  pcUsed: false,
  assaulted: [],
});
