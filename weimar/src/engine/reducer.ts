import { CARD } from '../data/cards.ts';
import { REGIONS, SPACE, SPACES } from '../data/board.ts';
import { FACTIONS } from './types.ts';
import type { Command, DispatchResult, GameState, Faction, Action } from './types.ts';
import {
  active,
  assertInvariants,
  clampTracks,
  cleanSlate,
  ensure,
  inEffect,
  onMap,
  record,
  returnEffects,
} from './rules.ts';
import { newTurn } from './turn.ts';
import { advanceTimeline, beginHeldPenalties } from './lifecycle.ts';
import { applyAction } from './actions.ts';
import { queueCard, resolveEffects } from './events.ts';
import { checkSuddenVictory, finishElection } from './elections.ts';
import { seatsUsesRemaining } from './policies.ts';

function turnOwner(s: GameState, f: Faction) {
  ensure(s.phase === 'action' && active(s) === f, '尚未轮到这个阵营行动');
}
function outsideActionPair(s: GameState) {
  ensure(
    !(['event-first', 'event-last'].includes(s.turn.mode) && s.turn.actionsLeft === 1),
    '两个行动必须连续完成，期间不能插入其他操作',
  );
}
function playEvent(s: GameState, actor: Faction) {
  ensure(s.turn.cardUid && !s.turn.eventDone, '没有待打出的事件牌');
  const hand = s.hands[actor],
    i = hand.findIndex((c) => c.uid === s.turn.cardUid);
  ensure(i >= 0, '选中的事件牌已不在手中');
  const [card] = hand.splice(i, 1);
  queueCard(s, card, actor);
  s.turn.eventDone = true;
  record(s, `${actor} 打出 #${card.card} ${CARD[card.card].name}。`);
}
function localAction(s: GameState, action: Action, region: string) {
  if (action.kind === 'move-units' || action.kind === 'test-loyalty') return true;
  if ('space' in action) return SPACE[action.space]?.region === region;
  if (action.kind === 'place-leverage') return SPACE[action.to]?.region === region;
  if (action.kind === 'remove-leverage')
    return SPACE[s.pieces.find((p) => p.id === action.pieceId)?.location ?? '']?.region === region;
  return false;
}
// A single atomic command boundary. Failed commands never mutate input, history,
// random state, card ownership or logs. Suitable for a future authoritative server.
export function dispatch(input: GameState, command: Command): DispatchResult {
  try {
    ensure(
      command && typeof command === 'object' && FACTIONS.includes(command.actor),
      '命令或阵营无效',
    );
    ensure(input.phase !== 'finished', '对局已结束');
    const s = structuredClone(input),
      c = command;
    if (s.pending) {
      ensure(c.type === 'choose', '请先完成待处理选择');
      ensure(c.actor === s.pending.actor, '这个选择属于其他阵营');
      const option = s.pending.options.find((o) => o.id === c.option);
      ensure(option, '无效选项');
      record(s, `${c.actor} 选择：${option.label}`);
      s.pending = null;
      s.effects.unshift(...option.effects);
      resolveEffects(s);
    } else
      switch (c.type) {
        case 'set-order':
          ensure(s.phase === 'order' && c.actor === s.momentum, '应由 momentum 阵营设置年度顺序');
          ensure(
            Array.isArray(c.order) &&
              c.order.length === 4 &&
              new Set(c.order).size === 4 &&
              c.order.every((f) => FACTIONS.includes(f)),
            '四个阵营必须各出现一次',
          );
          s.order = [...c.order];
          s.activeIndex = 0;
          s.phase = 'action';
          s.turn = newTurn();
          record(s, `年度顺序：${c.order.join(' → ')}`);
          if (s.eraChange) beginHeldPenalties(s, s.eraChange);
          break;
        case 'begin-turn': {
          turnOwner(s, c.actor);
          ensure(s.turn.mode === 'unselected', '本回合已选择行动方式');
          ensure(['single', 'event-first', 'event-last'].includes(c.mode), '无效出牌方式');
          if (c.mode !== 'single') {
            const card = s.hands[c.actor].find((x) => x.uid === c.cardUid);
            ensure(card, '请选择本阵营手牌');
            ensure(CARD[card.card].status === 'implemented', '这张卡的事件尚未实现');
            ensure(!CARD[card.card].election || !s.electionCalled, '本轮已打出选举牌');
            s.turn.cardUid = card.uid;
          }
          s.turn.mode = c.mode;
          s.turn.actionsLeft = c.mode === 'single' ? 1 : 2;
          if (c.mode === 'event-first') playEvent(s, c.actor);
          break;
        }
        case 'action':
          turnOwner(s, c.actor);
          ensure(
            s.turn.mode !== 'unselected' && s.turn.actionsLeft > 0,
            '请先选择回合方式，或本回合已没有行动次数',
          );
          applyAction(s, c.actor, c.action);
          s.turn.actionsLeft--;
          break;
        case 'play-event':
          turnOwner(s, c.actor);
          ensure(s.turn.mode === 'event-last' && s.turn.actionsLeft === 0, '必须先完成两个行动');
          playEvent(s, c.actor);
          break;
        case 'pass': {
          turnOwner(s, c.actor);
          ensure(s.turn.mode === 'unselected', '开始行动后不能再跳过');
          if (c.discardUid) {
            const hand = s.hands[c.actor],
              i = hand.findIndex((x) => x.uid === c.discardUid);
            ensure(i >= 0, '手牌不存在');
            ensure(
              !CARD[hand[i].card].mandatory && !CARD[hand[i].card].election,
              '强制事件及选举牌不能弃置',
            );
            ensure(s.deck.length, '牌堆为空，不能换牌');
            s.discard.push(...hand.splice(i, 1));
            hand.push(s.deck.shift()!);
          }
          s.turn.mode = 'pass';
          record(s, `${c.actor} 跳过${c.discardUid ? '并换牌' : ''}。`);
          break;
        }
        case 'end-turn':
          turnOwner(s, c.actor);
          ensure(s.turn.mode !== 'unselected' && s.turn.actionsLeft === 0, '本回合尚未完成');
          ensure(
            !['event-first', 'event-last'].includes(s.turn.mode) || s.turn.eventDone,
            '必须打出承诺的事件牌',
          );
          s.reveals = [];
          s.turn = newTurn();
          if (s.activeIndex === 3) s.phase = 'sudden-victory';
          else s.activeIndex++;
          break;
        case 'play-seats':
          turnOwner(s, c.actor);
          outsideActionPair(s);
          ensure(s.seats.owner === c.actor && seatsUsesRemaining(s) > 0, '没有可用的国会议席牌');
          const remainingUses = seatsUsesRemaining(s) - 1;
          if (inEffect(s, 124) && ['RC', 'NSDAP'].includes(c.actor))
            s.seats.uses = (s.seats.uses ?? 0) + 1;
          s.seats.available = remainingUses > 0;
          s.momentum = c.actor;
          s.tracks.unity--;
          clampTracks(s);
          s.effects.push(...cleanSlate(s));
          record(s, `${c.actor} 使用国会议席牌。`);
          break;
        case 'play-pc': {
          turnOwner(s, c.actor);
          outsideActionPair(s);
          ensure(REGIONS.includes(c.region), '地区议会不存在');
          ensure(
            !s.turn.pcUsed && s.pc[c.region].owner === c.actor && s.pc[c.region].available,
            '本回合只能使用1张可用议会控制牌',
          );
          if (c.action) {
            ensure(localAction(s, c.action, c.region), '议会奖励行动必须影响对应地区');
            applyAction(s, c.actor, c.action, c.region);
          }
          if (c.removeReform) {
            const p = s.pieces.find((p) => p.id === c.removeReform);
            ensure(
              p?.kind === 'reform' && SPACE[p.location]?.region === c.region,
              '该改革不在议会范围内',
            );
            s.effects.push({ type: 'return', pieceId: p.id, actor: c.actor });
          }
          s.effects.push({ type: 'clean-slate', region: c.region });
          s.pc[c.region].available = false;
          s.turn.pcUsed = true;
          record(s, `${c.actor} 使用 ${c.region} 议会控制牌。`);
          break;
        }
        case 'advance':
          ensure(c.actor === s.momentum, '阶段推进由 momentum 阵营处理');
          if (s.phase === 'sudden-victory') checkSuddenVictory(s);
          else if (s.phase === 'election') finishElection(s, c.transfer);
          else if (s.phase === 'timeline') advanceTimeline(s, c);
          else throw new Error('当前阶段不允许此命令');
          break;
        case 'choose':
          throw new Error('没有待处理的选择');
        default:
          throw new Error('未知命令');
      }
    resolveEffects(s);
    // KPD, rather than the Momentum actor, owns this optional decision.
    const timelineKey = `timeline-choice:${s.year}:${s.half}`;
    if (s.phase === 'timeline' && !s.pending && s.timelineChoiceResolved !== timelineKey) {
      const strikes = s.pieces.filter((p) => p.kind === 'strike' && onMap(p));
      const options = [];
      for (let mask = 0; mask < 1 << strikes.length; mask++) {
        const selected = strikes.filter((_, i) => mask & (1 << i));
        options.push({
          id: String(mask),
          label: selected.length
            ? `移除 ${selected.map((p) => SPACE[p.location].nameZh).join('、')}`
            : '保留所有罢工与起义',
          effects: [
            ...returnEffects(s, selected, 'KPD'),
            { type: 'timeline-choice-done' as const, key: timelineKey },
          ],
        });
      }
      if (strikes.length)
        s.pending = { actor: 'KPD', prompt: '推进时间轴前：KPD 可移除任意罢工或起义', options };
      else s.timelineChoiceResolved = timelineKey;
    }
    if (
      s.phase === 'timeline' &&
      s.pieces.filter((p) => p.kind === 'strike' && onMap(p)).length < 3
    )
      s.generalStrike = false;
    s.revision++;
    assertInvariants(s);
    return { ok: true, state: s };
  } catch (error) {
    return { ok: false, state: input, error: error instanceof Error ? error.message : '无效命令' };
  }
}
