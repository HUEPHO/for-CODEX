import { CARDS } from '../data/cards.ts';
import type { CardInstance, Era, GameState } from './types.ts';
import { shuffle } from './random.ts';

export const ERA_HAND: Record<Era, number> = { crisis: 7, golden: 9, decline: 6 };
const FIRST_STACK: Record<Era, number> = { crisis: 26, golden: 31, decline: 19 };
// TTS physical deck inventory: one Crisis, three Golden, four Decline elections.
// Each era reuses a single image/definition while every physical copy has its own UID.
const ELECTION_COPIES: Record<Era, number> = { crisis: 1, golden: 3, decline: 4 };

/** Playbook 9.1: mandatory/election cards are shuffled into the upper stack only. */
export function prepareEraDeck(s: Pick<GameState, 'rng'>, era: Era): CardInstance[] {
  const regular: CardInstance[] = [],
    special: CardInstance[] = [];
  for (const card of CARDS.filter((c) => c.era === era)) {
    const copies = card.election ? ELECTION_COPIES[era] : 1;
    for (let i = 0; i < copies; i++) {
      const instance = { uid: `card-${card.id}${i ? `-${i + 1}` : ''}`, card: card.id };
      (card.mandatory || card.election ? special : regular).push(instance);
    }
  }
  const shuffled = shuffle(s, regular);
  return [
    ...shuffle(s, [...shuffled.slice(0, FIRST_STACK[era]), ...special]),
    ...shuffled.slice(FIRST_STACK[era]),
  ];
}
