import { CARD } from '../data/cards.ts';
import { SPACE, SPACES } from '../data/board.ts';
import { HOLDING, isDeployedTrack } from '../data/holdings.ts';
import { FACTIONS } from './types.ts';
import type { GameState, Faction, CardInstance, Effect, ChoiceOption } from './types.ts';
import { randomInt } from './random.ts';
import {
  available,
  active,
  cleanSlate,
  changeInfluence,
  clampTracks,
  ensure,
  inEffect,
  onMap,
  piecesAt,
  record,
  returnEffects,
  returnOptions,
  isUnit,
} from './rules.ts';
import { resolveMilitary } from './units.ts';
import { resolveCombat } from './combat.ts';
import { resolveAssassination } from './assassinations.ts';
import { resolveFlowEffect } from './flow/bridge.ts';
import { CARD_PROGRAMS } from './card-programs.ts';
import { canAssault } from './combat.ts';
import { finishReferendum, finishElection } from './elections.ts';
import { returnDecider } from './policies.ts';

const choice = (actor: Faction, prompt: string, options: ChoiceOption[]): Effect => ({
  type: 'choice',
  actor,
  prompt,
  options,
});
export function eventEffects(s: GameState, card: CardInstance, actor: Faction): Effect[] {
  const n = card.card;
  const finish: Effect = { type: 'finish-card', card, resolved: true };
  const effects: Effect[] = [];
  if (CARD[n].requires && !inEffect(s, CARD[n].requires!) && s.ruleset !== 'tutorial-v1')
    return [{ type: 'finish-card', card, resolved: false }];
  if (CARD_PROGRAMS[n])
    return [
      {
        type: 'flow-start',
        program: CARD_PROGRAMS[n],
        context: {
          source: { faceId: n, uid: card.uid },
          origin: 'card',
          initiator: actor,
          turnOwner: active(s),
          beneficiary: actor,
          returnDecider: actor,
        },
      },
      finish,
    ];
  switch (n) {
    case 92:
      break;
    case 44: {
      const roll = randomInt(s, 6) + 1,
        count = s.pieces.filter(
          (p) => p.kind === 'leverage' && (onMap(p) || isDeployedTrack(p.location)),
        ).length;
      effects.push({ type: 'log', text: `合理化改造：掷骰 ${roll}，已部署杠杆 ${count}。` });
      if (roll <= count) effects.push({ type: 'track', track: 'economy', delta: 1 });
      break;
    }
    case 107:
    case 47: {
      const options: ChoiceOption[] = [
        {
          id: 'unity',
          label: '联盟团结向脆弱移动1格',
          effects: [{ type: 'track', track: 'unity', delta: -1 }],
        },
        {
          id: 'influence',
          label: '从地图移除每个阵营各1个影响力',
          effects: FACTIONS.map((f) => ({ type: 'remove-one', faction: f, actor })),
        },
      ];
      if (s.seats.owner && s.seats.available)
        options.unshift({
          id: 'seats',
          label: '将国会议席牌翻至背面',
          effects: [{ type: 'spend-seats' }],
        });
      effects.push(choice(actor, '政党政治：选择一项', options));
      break;
    }
    case 108:
    case 48: {
      const remove = s.pieces.filter(
        (p) =>
          onMap(p) &&
          ((p.kind === 'assassination' && ['Coalition', 'KPD'].includes(s.momentum)) ||
            (p.kind === 'strike' && p.side === 'strike' && s.momentum !== 'KPD')),
      );
      effects.push(...returnEffects(s, remove, actor));
      break;
    }
    case 148:
    case 109:
    case 49:
      effects.push(
        choice(
          actor,
          '阶级叛徒：选择随机弃牌的阵营',
          FACTIONS.map((f) => ({
            id: f,
            label: f,
            effects: [{ type: 'random-discard', faction: f }],
          })),
        ),
      );
      break;
    case 149:
    case 110:
    case 50:
      effects.push(
        choice(
          actor,
          '变节者：选择一个对手',
          FACTIONS.filter((f) => f !== actor).map((f) => ({
            id: f,
            label: f,
            effects: [{ type: 'random-take', faction: actor, from: f }],
          })),
        ),
      );
      break;
    case 150:
    case 111:
    case 51:
      effects.push({ type: 'draw', faction: actor });
      break;
    case 151:
    case 112:
    case 52:
      effects.push(
        choice(
          actor,
          '大众媒体：选择要查看的手牌',
          FACTIONS.map((f) => ({
            id: f,
            label: f,
            effects: [{ type: 'peek', viewer: actor, target: f }],
          })),
        ),
      );
      break;
    case 152:
    case 153:
    case 154:
      ensure(!s.electionCalled, '本轮已经打出选举牌');
      s.electionCalled = true;
      s.electionCard = card;
      s.momentum = actor;
      return [{ type: 'log', text: '选举已预约，将在四个阵营行动后结算。' }];
    default:
      throw new Error(`卡牌 #${n} 的事件效果尚未实现`);
  }
  return [...effects, finish];
}
export function queueCard(s: GameState, card: CardInstance, actor: Faction) {
  ensure(CARD[card.card]?.status === 'implemented', '此牌只有牌面，事件效果尚未实现');
  if (CARD[card.card].election) ensure(!s.electionCalled, '本轮只能打出一张选举牌');
  const eligible =
    !CARD[card.card].election &&
    !CARD[card.card].mandatory &&
    !s.article48Removed &&
    !(inEffect(s, 124) && ['NSDAP', 'RC'].includes(actor));
  const ebert = inEffect(s, 4) && s.tracks.unity === 1;
  if (eligible && (s.article48 || ebert)) {
    const cancel: Effect[] = [
      { type: 'spend-article' },
      { type: 'finish-card', card, resolved: false },
      { type: 'momentum', faction: 'Coalition' },
      { type: 'clean-slate' },
    ];
    if (!s.article48) cancel.push({ type: 'ebert-cost', actor, left: -1 });
    s.effects.push(
      choice('Coalition', `是否使用第48条取消 #${card.card} ${CARD[card.card].name}？`, [
        { id: 'allow', label: '不取消，结算事件', effects: [{ type: 'build-event', card, actor }] },
        {
          id: 'article48',
          label: s.article48 ? '使用第48条' : '依据艾伯特再次使用（会损失联盟影响力）',
          effects: cancel,
        },
      ]),
    );
  } else s.effects.push({ type: 'build-event', card, actor });
}
export function resolveEffects(s: GameState) {
  let steps = 0;
  while (!s.pending && s.effects.length) {
    ensure(++steps < 1000, '事件队列超出限制');
    const e = s.effects.shift()!;
    if (resolveFlowEffect(s, e)) continue;
    switch (e.type) {
      case 'referendum-result':
        finishReferendum(s, e.transfer);
        break;
      case 'snap-election-result':
        finishElection(s, e.transfer, true);
        break;
      case 'hound-assault': {
        const options: ChoiceOption[] = [];
        for (const space of SPACES.filter(
          (p) =>
            p.id !== e.excluded &&
            (!e.region || p.region === e.region) &&
            (!s.grantContext?.spaces || s.grantContext.spaces.includes(p.id)),
        ))
          for (const target of FACTIONS)
            if (canAssault(s, e.actor, target, space.id))
              options.push({
                id: `${space.id}:${target}`,
                label: `${space.nameZh} → ${target}`,
                effects: [
                  {
                    type: 'combat-start',
                    attacker: e.actor,
                    defender: target,
                    space: space.id,
                    free: false,
                  },
                ],
              });
        if (options.length)
          s.pending = {
            actor: e.actor,
            prompt: '#16 猎犬主义：可再突击一个不同地区',
            options: [...options, { id: 'stop', label: '不再突击', effects: [] }],
          };
        break;
      }
      case 'move-units-choice':
      case 'sworn-enemies':
      case 'loyalty-choice':
      case 'reveal-unit':
        resolveMilitary(s, e);
        break;
      case 'combat-start':
      case 'combat-loans':
      case 'combat-request':
      case 'combat-lend':
      case 'combat-loyalty':
      case 'combat-support':
      case 'combat-spend-support':
      case 'combat-roll':
      case 'combat-loss':
      case 'combat-casualty':
      case 'combat-finish':
        resolveCombat(s, e);
        break;
      case 'assassination-place':
      case 'assassination-loss':
      case 'assassination-bonus':
        resolveAssassination(s, e);
        break;
      case 'log':
        record(s, e.text);
        break;
      case 'spend-article':
        s.article48 = false;
        break;
      case 'spend-seats':
        s.seats.available = false;
        break;
      case 'timeline-choice-done':
        s.timelineChoiceResolved = e.key;
        break;
      case 'momentum':
        s.momentum = e.faction;
        record(s, `${e.faction} 获得 momentum。`);
        break;
      case 'track':
        s.tracks[e.track] += e.delta;
        if (e.track === 'us')
          s.tracks.dollarDependence = Math.max(
            s.tracks.dollarDependence,
            Math.min(3, s.tracks.us - 2),
          );
        clampTracks(s);
        record(s, `${e.track} 轨道调整为 ${s.tracks[e.track]}。`);
        break;
      case 'influence':
        changeInfluence(s, e.faction, e.space, e.amount, true, e.conflictException);
        break;
      case 'choice':
        if (e.options.length) s.pending = { actor: e.actor, prompt: e.prompt, options: e.options };
        break;
      case 'return': {
        const p = s.pieces.find((p) => p.id === e.pieceId);
        ensure(p, '无法归还缺失的棋子');
        if (isUnit(p) && p.kind !== 'reichswehr') {
          p.location = `reserve:${p.owner}`;
          break;
        }
        const options = returnOptions(s, p);
        ensure(options.length, '没有匹配的空存放格');
        if (options.length === 1) {
          p.location = options[0].id;
          if (p.kind === 'strike') p.side = 'strike';
          clampTracks(s);
        } else
          s.pending = {
            actor: e.actor,
            prompt: `归还 ${p.owner ?? ''} ${p.kind}：选择存放轨道（自动使用最高空格）`,
            options: options.map((h) => ({
              id: h.id,
              label: h.label,
              effects: [{ type: 'move-piece', pieceId: p.id, to: h.id }],
            })),
          };
        break;
      }
      case 'move-piece': {
        const p = s.pieces.find((p) => p.id === e.pieceId);
        ensure(p, '棋子不存在');
        p.location = e.to;
        if (p.kind === 'strike' && e.to.startsWith('@')) p.side = 'strike';
        clampTracks(s);
        break;
      }
      case 'clean-slate':
        s.effects.unshift(...cleanSlate(s, e.region));
        break;
      case 'build-event':
        s.effects.unshift(...eventEffects(s, e.card, e.actor));
        break;
      case 'finish-card': {
        const card = CARD[e.card.card];
        if (e.resolved && card.cancels) {
          const old = s.lingering.findIndex((c) => c.card === card.cancels);
          if (old >= 0) s.discard.push(...s.lingering.splice(old, 1));
        }
        if (e.resolved && card.lingering) s.lingering.push(e.card);
        else s.discard.push(e.card);
        clampTracks(s);
        record(
          s,
          `#${card.id} ${card.name}：${e.resolved ? (card.lingering ? '持续生效' : '结算完成') : '被取消或未满足前置条件'}。`,
        );
        break;
      }
      case 'random-discard': {
        const hand = s.hands[e.faction];
        if (!hand.length) {
          record(s, `${e.faction} 没有手牌。`);
          break;
        }
        const i = randomInt(s, hand.length),
          card = hand[i];
        if (CARD[card.card].mandatory || CARD[card.card].election)
          record(s, `${e.faction} 随机选中的 #${card.card} 不能弃置，仍保留。`);
        else {
          hand.splice(i, 1);
          s.discard.push(card);
          record(s, `${e.faction} 随机弃置 #${card.card}。`);
        }
        break;
      }
      case 'random-take': {
        const hand = s.hands[e.from];
        if (!hand.length) {
          record(s, '目标没有手牌。');
          break;
        }
        const [card] = hand.splice(randomInt(s, hand.length), 1);
        s.hands[e.faction].push(card);
        record(s, `${e.faction} 随机取得 ${e.from} 的一张手牌。`);
        s.effects.unshift({ type: 'optional-discard', faction: e.faction, uid: card.uid });
        break;
      }
      case 'draw': {
        const card = s.deck.shift();
        if (!card) {
          record(s, '牌堆已空，无牌可抽。');
          break;
        }
        s.hands[e.faction].push(card);
        record(s, `${e.faction} 抽取1张牌。`);
        s.effects.unshift({ type: 'optional-discard', faction: e.faction, uid: card.uid });
        break;
      }
      case 'optional-discard': {
        const card = s.hands[e.faction].find((c) => c.uid === e.uid);
        if (
          card &&
          s.momentum === e.faction &&
          !CARD[card.card].mandatory &&
          !CARD[card.card].election
        )
          s.pending = {
            actor: e.faction,
            prompt: `拥有 momentum：是否弃掉刚获得的 #${card.card} ${CARD[card.card].name}？`,
            options: [
              { id: 'keep', label: '保留', effects: [] },
              {
                id: 'discard',
                label: '弃掉',
                effects: [{ type: 'discard', faction: e.faction, uid: e.uid }],
              },
            ],
          };
        break;
      }
      case 'discard': {
        const hand = s.hands[e.faction],
          i = hand.findIndex((c) => c.uid === e.uid);
        ensure(i >= 0, '手牌不存在');
        ensure(
          !CARD[hand[i].card].mandatory && !CARD[hand[i].card].election,
          '不能弃置强制或选举牌',
        );
        s.discard.push(...hand.splice(i, 1));
        break;
      }
      case 'peek':
        s.reveals.push({
          viewer: e.viewer,
          target: e.target,
          cards: structuredClone(s.hands[e.target]),
        });
        record(s, `${e.viewer} 查看了 ${e.target} 的手牌。`);
        break;
      case 'ebert-cost': {
        const left = e.left === -1 ? Math.ceil((randomInt(s, 6) + 1) / 2) : e.left;
        if (e.left === -1) record(s, `艾伯特再次使用第48条：最多移除 ${left} 个联盟影响力。`);
        if (left > 0) {
          const eligible = SPACES.filter(
            (p) => s.influence[p.id].Coalition > 0 && !s.turn.placed.includes(p.id),
          );
          if (eligible.length)
            s.pending = {
              actor: e.actor,
              prompt: `艾伯特：可再移除至多 ${left} 个联盟影响力`,
              options: [
                { id: 'stop', label: '停止移除', effects: [] },
                ...eligible.map((p) => ({
                  id: p.id,
                  label: p.nameZh,
                  effects: [
                    {
                      type: 'influence' as const,
                      faction: 'Coalition' as const,
                      space: p.id,
                      amount: -1,
                    },
                    { type: 'ebert-cost' as const, actor: e.actor, left: left - 1 },
                  ],
                })),
              ],
            };
        }
        break;
      }
      case 'remove-one': {
        const eligible = SPACES.filter(
          (p) => s.influence[p.id][e.faction] > 0 && !s.turn.placed.includes(p.id),
        );
        if (eligible.length)
          s.pending = {
            actor: e.actor,
            prompt: `选择移除 ${e.faction} 的1个影响力`,
            options: eligible.map((p) => ({
              id: p.id,
              label: p.nameZh,
              effects: [{ type: 'influence', faction: e.faction, space: p.id, amount: -1 }],
            })),
          };
        break;
      }
      case 'mcs-choice': {
        if (e.remaining <= 0) break;
        const again: Effect = { ...e, remaining: e.remaining - 1 };
        const options: ChoiceOption[] = [{ id: 'stop', label: '结束此行动', effects: [] }];
        for (const p of s.pieces.filter((p) => p.kind === 'mcs')) {
          if (available(s, p, e.actor) || p.location === 'mat:RC')
            options.push({
              id: `take-${p.id}`,
              label: `取得 ${HOLDING[p.location]?.label ?? 'RC 阵营板上的支持'}`,
              effects: [{ type: 'move-piece', pieceId: p.id, to: `mat:${e.actor}` }, again],
            });
          if (p.location.startsWith('mat:'))
            options.push({
              id: `return-${p.id}`,
              label: `归还 ${p.location.slice(4)} 的支持`,
              effects: [{ type: 'return', pieceId: p.id, actor: returnDecider(s, e.actor) }, again],
            });
        }
        s.pending = {
          actor: e.actor,
          prompt: `NSDAP 干部允许再移动 ${e.remaining} 次中产支持`,
          options,
        };
        break;
      }
      case 'finish-round':
        s.phase = 'timeline';
        break;
    }
  }
}
