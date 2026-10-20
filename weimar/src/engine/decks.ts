import { CARD, CARDS } from '../data/cards.ts';
import type { CardInstance, Era, GameState } from './types.ts';
import { shuffle } from './random.ts';

export const ERA_HAND: Record<Era, number> = { crisis: 7, golden: 9, decline: 6 };
const FIRST_STACK: Record<Era, number> = { crisis: 26, golden: 31, decline: 19 };
// TTS physical deck inventory: one Crisis, three Golden, four Decline elections.
// Each era reuses a single image/definition while every physical copy has its own UID.
const ELECTION_COPIES: Record<Era, number> = { crisis: 1, golden: 3, decline: 4 };

export function eraCards(era: Era): CardInstance[] {
  const cards: CardInstance[] = [];
  for (const card of CARDS.filter((c) => c.era === era)) {
    const copies = card.election ? ELECTION_COPIES[era] : 1;
    for (let i = 0; i < copies; i++) {
      const instance = { uid: `card-${card.id}${i ? `-${i + 1}` : ''}`, card: card.id };
      cards.push(instance);
    }
  }
  return cards;
}
/** Playbook 9.1: mandatory/election cards are shuffled into the upper stack only. */
export function prepareEraDeck(s: Pick<GameState, 'rng'>, era: Era): CardInstance[] {
  const cards = eraCards(era);
  const isSpecial = (c: CardInstance) => CARD[c.card].mandatory || CARD[c.card].election;
  const special = cards.filter(isSpecial);
  const shuffled = shuffle(
    s,
    cards.filter((c) => !isSpecial(c)),
  );
  return [
    ...shuffle(s, [...shuffled.slice(0, FIRST_STACK[era]), ...special]),
    ...shuffled.slice(FIRST_STACK[era]),
  ];
}

/** 9.5: pre-existing lingering events do not execute their one-time event steps. */
export function prepareBlackSun(s: GameState) {
  const cards = eraCards('golden');
  const lingeringIds = new Set(CARDS.filter((c) => c.lingering).map((c) => c.id));
  const mandatory = cards.filter((c) => c.card === 54 || c.card === 57);
  const otherLingering = shuffle(
    s,
    cards.filter((c) => lingeringIds.has(c.card) && !mandatory.includes(c)),
  );
  s.lingering = [...mandatory, ...otherLingering.slice(0, 3)];
  s.removedCards!.push(...otherLingering.slice(3), ...cards.filter((c) => c.card === 153));
  s.deck = shuffle(
    s,
    cards.filter((c) => !lingeringIds.has(c.card) && c.card !== 153),
  );
}
