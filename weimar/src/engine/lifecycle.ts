import { CARD } from '../data/cards.ts';
import { SPACES } from '../data/board.ts';
import { FACTIONS } from './types.ts';
import type { Command, Era, FactionValues, GameState, LifecycleEffect } from './types.ts';
import {
  changeInfluence,
  clampTracks,
  ensure,
  onMap,
  piecesAt,
  record,
  returnEffects,
  zeros,
} from './rules.ts';
import { expireEra } from './policies.ts';
import { ERA_HAND, prepareEraDeck } from './decks.ts';
import { newTurn } from './turn.ts';

export function heldPenalties(s: GameState): FactionValues {
  const result = zeros();
  for (const f of FACTIONS)
    result[f] = s.hands[f].reduce(
      (sum, c) => sum + (CARD[c.card].mandatory || CARD[c.card].election ? 2 : 1),
      0,
    );
  return result;
}

/** Both era changes and the 1933 ending use the same interruptible penalty sequence. */
export function beginHeldPenalties(s: GameState, era?: Era) {
  const penalties = heldPenalties(s);
  s.lastHeldPenalty = penalties;
  s.phase = 'upkeep';
  s.turn = newTurn();
  record(s, `留牌惩罚：${s.order.map((f) => `${f} ${penalties[f]}`).join(' / ')}。`);
  s.effects.push(
    ...s.order.map((faction) => ({
      type: 'held-penalty' as const,
      faction,
      remaining: penalties[faction],
    })),
    era ? { type: 'era-deal', era, penalties } : { type: 'campaign-finish', penalties },
  );
}

export function advanceTimeline(s: GameState, c: Extract<Command, { type: 'advance' }>) {
  ensure(!c.removeStrikes?.length, '通过 KPD 的时间轴选择窗口移除罢工');
  const inflation = s.tracks.economy === 1 && SPACES.some((p) => s.influence[p.id].Coalition > 0);
  if (inflation)
    ensure(
      c.inflationSpace && s.influence[c.inflationSpace]?.Coalition > 0,
      '恶性通胀：momentum 阵营需要选择移除1个联盟影响力的地区',
    );
  s.turn = newTurn();
  s.phase = 'upkeep';
  const assassinations = s.pieces.filter(
    (p) =>
      p.kind === 'assassination' &&
      onMap(p) &&
      piecesAt(s, p.location).some(
        (u) => u.owner === 'Coalition' && ['freikorps', 'reichswehr'].includes(u.kind),
      ),
  );
  s.effects.push(...returnEffects(s, assassinations, s.momentum), {
    type: 'timeline-complete',
    inflationSpace: inflation ? c.inflationSpace : undefined,
  });
}

export function resolveLifecycle(s: GameState, e: LifecycleEffect) {
  switch (e.type) {
    case 'timeline-complete': {
      if (e.inflationSpace) changeInfluence(s, 'Coalition', e.inflationSpace, -1, true, true);
      const finalYear =
        s.scenario === 'fate'
          ? 1933
          : s.ruleset === 'tutorial-v1'
            ? 1923
            : s.year >= 1930
              ? 1933
              : 1929;
      if (s.half === 'late' && s.year >= finalYear) {
        s.scenarioEnding = true;
        if (s.scenario === 'fate') beginHeldPenalties(s);
        else s.phase = 'election';
        break;
      }
      s.activeIndex = 0;
      s.turn = newTurn();
      s.reveals = [];
      if (s.half === 'early') {
        s.half = 'late';
        s.phase = 'action';
      } else {
        s.half = 'early';
        s.year++;
        if (s.scenario === 'fate' && (s.year === 1924 || s.year === 1930))
          s.eraChange = s.year === 1924 ? 'golden' : 'decline';
        if (s.year >= 1920 && s.year <= 1923) s.tracks.economy--;
        if (s.year >= 1931 && s.year <= 1933) s.tracks.economy++;
        if (s.year === 1930) {
          const economy = s.tracks.dollarDependence
            ? 5 + s.tracks.dollarDependence
            : s.tracks.economy;
          s.tracks.economy = economy;
          // Returns can pause for holding-box choices. Do not expose the next annual
          // order or held-card decisions until every economy-track marker is returned.
          s.effects.push(
            ...returnEffects(
              s,
              s.pieces.filter((p) => p.kind === 'leverage' && p.location.startsWith('@economy:')),
              s.momentum,
            ),
            { type: 'new-year-ready', economy },
          );
        } else {
          clampTracks(s);
          s.effects.push({ type: 'new-year-ready' });
        }
      }
      record(s, `进入 ${s.year} ${s.half === 'early' ? '上半年' : '下半年'}。`);
      break;
    }
    case 'new-year-ready':
      if (e.economy !== undefined) s.tracks.economy = e.economy;
      clampTracks(s);
      s.phase = 'order';
      break;
    case 'held-penalty': {
      if (e.remaining <= 0) break;
      const spaces = SPACES.filter((p) => s.influence[p.id][e.faction] > 0);
      if (!spaces.length) break;
      s.pending = {
        actor: s.momentum,
        prompt: `${e.faction} 留牌：${s.hands[e.faction].map((c) => `#${c.card} ${CARD[c.card].name}`).join('、')}。可再移除至多 ${e.remaining} 个该阵营影响力；放弃移除仍按原惩罚减少新手牌。`,
        options: [
          { id: 'stop', label: '不再移除该阵营影响力', effects: [] },
          ...spaces.map((p) => ({
            id: p.id,
            label: `${p.nameZh}：移除1个 ${e.faction} 影响力`,
            effects: [
              {
                type: 'influence' as const,
                faction: e.faction,
                space: p.id,
                amount: -1,
                conflictException: true,
              },
              { ...e, remaining: e.remaining - 1 },
            ],
          })),
        ],
      };
      break;
    }
    case 'era-deal': {
      expireEra(s, e.era === 'golden' ? 'crisis' : 'golden', (id) => CARD[id].expires);
      s.removedCards ??= [];
      s.removedCards.push(...s.deck, ...s.discard, ...FACTIONS.flatMap((f) => s.hands[f]));
      s.discard = [];
      s.deck = prepareEraDeck(s, e.era);
      for (const f of s.order) {
        s.hands[f] = s.deck.splice(0, Math.max(0, ERA_HAND[e.era] - e.penalties[f]));
        record(
          s,
          `${f} 获得 ${s.hands[f].length} 张${e.era === 'golden' ? '黄金' : '衰落'}时代手牌（基础 ${ERA_HAND[e.era]} − 留牌惩罚 ${e.penalties[f]}）。`,
        );
      }
      delete s.eraChange;
      s.reveals = [];
      s.turn = newTurn();
      clampTracks(s);
      s.phase = 'action';
      break;
    }
    case 'campaign-finish':
      if (e.penalties.Coalition) {
        s.phase = 'election';
        record(s, '1933年终：联盟存在留牌惩罚，进行最终地区与全国选举。');
      } else {
        s.winner = 'Coalition';
        s.winReason = '共和国的命运：1933年终联盟没有留牌惩罚';
        s.phase = 'finished';
        record(s, `Coalition 获胜：${s.winReason}。`);
      }
      break;
  }
}
