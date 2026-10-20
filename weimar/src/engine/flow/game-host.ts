import { fixedStances } from '../scenarios.ts';
import { SPACE, SPACES } from '../../data/board.ts';
import { HOLDINGS, HOLDING, isDeployedTrack } from '../../data/holdings.ts';
import { FACTIONS } from '../types.ts';
import type { Action, ChoiceOption, Effect, Faction, GameState, Piece } from '../types.ts';
import type {
  Host,
  Json,
  OperationArguments,
  OperationKind,
  Receipt,
  ResolvedOperation,
  SpaceFilter,
  Track,
} from './protocol.ts';
import type { DomainJob } from './domain-types.ts';
import {
  active,
  available,
  blockedByAssassination,
  changeInfluence,
  clampTracks,
  controls,
  dominance,
  ensure,
  inEffect,
  isUnit,
  mcs,
  onMap,
  piecesAt,
  presence,
  record,
  returnOptions,
  supply,
  supremacy,
  zeros,
} from '../rules.ts';
import { actionCandidates, applyAction, leverageDestinations } from '../actions.ts';
import { revealUnit, unitLabel } from '../units.ts';
import { strikeConsequences } from '../consequences.ts';
import { shiftStance } from '../policies.ts';
import { previewElection, previewReferendum } from '../elections.ts';
import { randomInt } from '../random.ts';

export function selectSpaces(s: GameState, filter: SpaceFilter = {}) {
  return SPACES.filter((p) => {
    if (filter.ids && !filter.ids.includes(p.id)) return false;
    if (filter.full && Object.values(s.influence[p.id]).reduce((a, b) => a + b, 0) !== p.population)
      return false;
    if (filter.exclude?.includes(p.id)) return false;
    if (filter.kind && (p.kind === 'City') !== (filter.kind === 'city')) return false;
    if (filter.regions && !filter.regions.includes(p.region)) return false;
    if (filter.adjacentTo && !SPACE[filter.adjacentTo]?.adjacent.includes(p.id)) return false;
    if (
      filter.piece &&
      !piecesAt(s, p.id, filter.piece).some((x) => !filter.faction || x.owner === filter.faction)
    )
      return false;
    if (filter.relation) {
      const f = filter.faction;
      ensure(f, '目标关系缺少阵营');
      if (filter.relation === 'presence' && !presence(s, f, p.id)) return false;
      if (filter.relation === 'dominance' && dominance(s, p.id) !== f) return false;
      if (filter.relation === 'supremacy' && supremacy(s, p.id) !== f) return false;
      if (filter.relation === 'parliament' && !controls(s, f, p.id)) return false;
      if (
        filter.relation === 'occupation' &&
        !piecesAt(s, p.id).some((x) => isUnit(x) && x.owner === f)
      )
        return false;
    }
    return true;
  }).map((p) => p.id);
}
const jobKinds = [
  'influence.allocate',
  'pieces.deploy',
  'pieces.return',
  'pieces.reveal',
  'leverage.place',
  'leverage.replace',
  'strike.place',
  'board.remove',
  'track.choose',
  'action.grant',
] as const;
export const SUPPORTED_OPERATIONS: OperationKind[] = [
  ...jobKinds,
  'influence.change',
  'piece.reveal',
  'piece.remove-permanently',
  'track.change',
  'momentum.set',
  'stance.change',
  'parliament.change',
  'election.special',
  'random.roll',
  'hand.transfer-random',
  'victory.declare',
];
export function gameHost(s: GameState): Host {
  return {
    operations: SUPPORTED_OPERATIONS,
    queries: [
      'spaces.find',
      'pieces.find',
      'influence.count',
      'influence.leaders',
      'track.value',
      'momentum.owner',
      'order.current',
      'stance.value',
      'pv.current',
      'mcs.count',
      'parliament.state',
      'event.active',
    ],
    query(q) {
      const a = q.args;
      switch (q.kind) {
        case 'spaces.find':
          return selectSpaces(s, a.filter as unknown as SpaceFilter);
        case 'pieces.find':
          return s.pieces
            .filter((p) => {
              if (a.kind && p.kind !== a.kind) return false;
              if (a.kinds && !(a.kinds as string[]).includes(p.kind)) return false;
              if (a.owner && p.owner !== a.owner) return false;
              if (a.locations && !(a.locations as string[]).includes(p.location)) return false;
              if (a.side && p.side !== a.side) return false;
              if (typeof a.revealed === 'boolean' && p.revealed !== a.revealed) return false;
              if (a.availability === 'map' && !onMap(p)) return false;
              if (a.availability === 'reserve' && !p.location.startsWith('reserve:')) return false;
              if (
                a.availability === 'available' &&
                !available(s, p, (a.owner ?? p.owner) as Faction)
              )
                return false;
              return p.location !== 'removed';
            })
            .map((p) => p.id);
        case 'influence.count':
          return (a.spaces as string[]).reduce(
            (n, id) => n + s.influence[id][a.faction as Faction],
            0,
          );
        case 'influence.leaders': {
          const totals = zeros();
          for (const id of a.spaces as string[])
            for (const f of FACTIONS) totals[f] += s.influence[id][f];
          return FACTIONS.filter((f) => totals[f] === Math.max(...Object.values(totals)));
        }
        case 'track.value':
          return s.tracks[a.track as Track];
        case 'momentum.owner':
          return s.momentum;
        case 'order.current':
          return [...s.order];
        case 'stance.value':
          return fixedStances(s) ? 0 : s.stance[a.faction as 'KPD' | 'NSDAP'];
        case 'pv.current':
          return previewElection(s).totals[a.faction as Faction];
        case 'mcs.count':
          return mcs(s, a.faction as Faction);
        case 'parliament.state':
          return a.card === 'seats'
            ? { ...s.seats, locked: false }
            : { ...s.pc[a.card as string], locked: s.pcLocked.includes(a.card as string) };
        case 'event.active':
          return inEffect(s, a.faceId as number);
        default:
          throw new Error(`未实现查询 ${q.kind}`);
      }
    },
  };
}
function receipt(s: GameState, amount = 1, space?: string, pieceId?: string) {
  const r = s.flowReceipt!;
  ensure(r, '缺少操作回执');
  r.actual = (r.actual ?? 0) + amount;
  if (space && SPACE[space]) r.spaces = [...new Set([...(r.spaces ?? []), space])];
  if (pieceId) r.pieceIds = [...(r.pieceIds ?? []), pieceId];
}
function moveTrack(s: GameState, track: Track, value: number) {
  ensure(track !== 'dollarDependence', '美元依赖只能由美国协定释放');
  ensure(Number.isInteger(value), '轨道目标必须是整数');
  if (track === 'us' || track === 'ussr') ensure(value >= s.tracks[track], '协定不能降低');
  const before = s.tracks[track],
    dollars = s.tracks.dollarDependence;
  s.tracks[track] = value;
  clampTracks(s);
  if (track === 'us') s.tracks.dollarDependence = Math.max(dollars, s.tracks.us - 2);
  record(s, `${track}：${before} → ${s.tracks[track]}`);
  s.flowReceipt = {
    actual: Math.abs(s.tracks[track] - before),
    outcome: { before, after: s.tracks[track], newDollar: s.tracks.dollarDependence > dollars },
  };
}
export function executeOperation(s: GameState, request: ResolvedOperation) {
  s.flowReceipt = { actual: 0, spaces: [], pieceIds: [] };
  const a = request.args;
  if ((jobKinds as readonly string[]).includes(request.kind)) {
    const count = Number(a.count ?? 1);
    ensure(Number.isInteger(count) && count >= 0 && count <= 200, '事件次数无效');
    const job = {
      kind: request.kind,
      args: structuredClone(a),
      remaining: count,
      used: [],
      returnDecider: s.flow!.context.returnDecider,
      origins: Object.fromEntries(s.pieces.map((p) => [p.id, p.location])),
    } as unknown as DomainJob;
    s.effects.unshift({ type: 'domain-job', job });
    return;
  }
  switch (request.kind) {
    case 'influence.change': {
      const faction = a.faction as Faction,
        space = a.space as string,
        before = s.influence[space][faction];
      changeInfluence(s, faction, space, a.amount as number, true);
      receipt(s, Math.abs(s.influence[space][faction] - before), space);
      break;
    }
    case 'momentum.set':
      ensure(FACTIONS.includes(a.faction as Faction), '无效阵营');
      s.momentum = a.faction as Faction;
      record(s, `${s.momentum} 获得 momentum。`);
      receipt(s);
      break;
    case 'track.change': {
      const track = a.track as Track,
        amount = a.amount as number;
      const value =
        a.mode === 'set'
          ? amount
          : a.mode === 'toward-stability'
            ? s.tracks[track] +
              Math.sign(5 - s.tracks[track]) * Math.min(amount, Math.abs(5 - s.tracks[track]))
            : s.tracks[track] + amount;
      moveTrack(s, track, value);
      break;
    }
    case 'stance.change':
      shiftStance(s, a.faction as Faction, a.steps as number);
      receipt(s);
      break;
    case 'piece.reveal':
      revealUnit(s, a.pieceId as string);
      receipt(s, 1, undefined, a.pieceId as string);
      break;
    case 'piece.remove-permanently': {
      const p = s.pieces.find((p) => p.id === a.pieceId);
      ensure(p, '棋子不存在');
      receipt(s, 1, p.location, p.id);
      p.location = 'removed';
      record(s, `${p.id} 永久移出游戏。`);
      break;
    }
    case 'parliament.change': {
      const id = a.card as string;
      if (id === 'article48' && a.change === 'remove-permanently') {
        s.article48 = false;
        s.article48Removed = true;
        record(s, '第48条永久移出游戏。');
        receipt(s);
        break;
      }
      if (id === 'seats') {
        if (a.change === 'transfer') {
          ensure(FACTIONS.includes(a.faction as Faction), '无效阵营');
          // A transfer alone does not turn the card face up.
          s.seats.owner = a.faction as Faction;
        } else if (a.change === 'refresh') {
          s.seats.available = true;
          delete s.seats.uses;
        } else if (a.change === 'spend') s.seats.available = false;
        else throw new Error('此国会议席操作尚未实现');
        record(
          s,
          `国会议席：${s.seats.owner ?? '无持有者'}，${s.seats.available ? '正面' : '背面'}。`,
        );
        receipt(s);
        break;
      }
      ensure(s.pc[id], '议会牌不存在');
      if (a.change === 'lock') {
        s.pc[id] = { owner: null, available: false };
        s.pcLocked = [...new Set([...s.pcLocked, id])];
      } else if (a.change === 'refresh') s.pc[id].available = !s.pcLocked.includes(id);
      else if (a.change === 'spend') s.pc[id].available = false;
      else if (a.change === 'transfer') {
        ensure(FACTIONS.includes(a.faction as Faction), '无效阵营');
        s.pc[id] = { owner: a.faction as Faction, available: !s.pcLocked.includes(id) };
      } else throw new Error('此议会操作尚未实现');
      receipt(s);
      break;
    }
    case 'random.roll': {
      const count = a.count as number,
        sides = a.sides as number;
      ensure(
        Number.isInteger(count) &&
          count >= 1 &&
          count <= 20 &&
          Number.isInteger(sides) &&
          sides >= 2 &&
          sides <= 100,
        '骰子参数无效',
      );
      const rolls = Array.from({ length: count }, () => randomInt(s, sides) + 1);
      s.flowReceipt = { rolls };
      record(s, `事件掷骰：${rolls.join('、')}`);
      break;
    }
    case 'election.special': {
      const snap = a.policy === 'snap-election';
      const effect = snap ? 'snap-election-result' : 'referendum-result';
      const label = snap ? '#117 提前选举' : '#82 公投';
      const value = (snap ? previewElection(s) : previewReferendum(s)).totals[s.momentum],
        options: ChoiceOption[] = [
          {
            id: 'no-transfer',
            label: `不转让 PV，结算${snap ? '提前选举' : '公投'}`,
            effects: [{ type: effect }],
          },
        ];
      for (const to of FACTIONS.filter((f) => f !== s.momentum))
        for (let amount = 1; amount <= Math.floor(value / 2); amount++)
          options.push({
            id: `${to}:${amount}`,
            label: `向 ${to} 转让 ${amount} PV`,
            effects: [{ type: effect, transfer: { to, amount } }],
          });
      s.pending = { actor: s.momentum, prompt: `${label}：momentum 方可转让 PV`, options };
      break;
    }
    case 'hand.transfer-random': {
      const from = a.from as Faction,
        to = a.to as Faction,
        hand = s.hands[from];
      if (hand.length) {
        const [card] = hand.splice(randomInt(s, hand.length), 1);
        s.hands[to].push(card);
        receipt(s);
        record(s, `${to} 随机取得 ${from} 的一张手牌。`);
      } else record(s, `${from} 没有手牌，跳过拿取。`);
      break;
    }
    case 'victory.declare': {
      s.winner = a.faction as Faction;
      s.winReason = a.basis as string;
      s.phase = 'finished';
      record(s, `${s.winner} 获胜：${s.winReason}`);
      break;
    }
    default:
      throw new Error(`未实现领域操作 ${request.kind}`);
  }
}
interface Candidate {
  id: string;
  label: string;
  apply: () => void;
}
function next(s: GameState, job: DomainJob, amount = 1, used?: string) {
  s.effects.unshift({
    type: 'domain-job',
    job: { ...job, remaining: job.remaining - amount, used: used ? [...job.used, used] : job.used },
  });
}
function returnPiece(
  s: GameState,
  p: Piece,
  actor: Faction,
  anyHolding: boolean,
  continuation: Effect[],
) {
  if (isUnit(p) && p.kind !== 'reichswehr') {
    p.location = `reserve:${p.owner}`;
    s.effects.unshift(...continuation);
    return;
  }
  const slots = anyHolding
    ? HOLDINGS.filter(
        (h) =>
          h.kind === p.kind &&
          h.owner === p.owner &&
          !isDeployedTrack(h.id) &&
          !piecesAt(s, h.id).length,
      )
    : returnOptions(s, p);
  ensure(slots.length, '没有可用的归还存放格');
  s.effects.unshift({
    type: 'choice',
    actor,
    prompt: `归还 ${p.kind}：${anyHolding ? '任意空存放格' : '选择轨道最高空存放格'}`,
    options: slots.map((h) => ({
      id: h.id,
      label: h.label,
      effects: [{ type: 'move-piece', pieceId: p.id, to: h.id }, ...continuation],
    })),
  });
}
function probeAction(s: GameState, actor: Faction, action: Action, spaces: string[] | undefined) {
  const probe = structuredClone({
    ...s,
    flow: undefined,
    flowReceipt: undefined,
    pending: null,
    effects: [],
    log: [],
  });
  probe.grantContext = { returnDecider: active(s), ...(spaces ? { spaces } : {}) };
  try {
    applyAction(probe, actor, action);
    return true;
  } catch {
    return false;
  }
}
function actionSpace(s: GameState, a: Action): string | undefined {
  if ('space' in a) return a.space;
  if (a.kind === 'place-leverage' && SPACE[a.to]) return a.to;
  if (a.kind === 'remove-leverage') return s.pieces.find((p) => p.id === a.pieceId)?.location;
  return undefined;
}
export function domainCandidates(s: GameState, job: DomainJob): Candidate[] {
  const out: Candidate[] = [];
  const add = (id: string, label: string, apply: () => void) => out.push({ id, label, apply });
  if (job.remaining <= 0) return out;
  switch (job.kind) {
    case 'influence.allocate': {
      const a = job.args;
      for (const space of a.spaces)
        for (const f of a.factions) {
          if (
            !SPACE[space] ||
            (a.distinct && job.used.includes(space)) ||
            (a.sameSpace && job.used.length && job.used[0] !== space)
          )
            continue;
          if (
            a.mode === 'place' &&
            (s.turn.removed.includes(space) || blockedByAssassination(s, f, space))
          )
            continue;
          if (a.mode === 'remove' && s.turn.placed.includes(space)) continue;
          if (
            a.mode === 'replace' &&
            (((s.turn.removed.includes(space) || s.turn.placed.includes(space)) &&
              !job.used.includes(space)) ||
              !a.to ||
              blockedByAssassination(s, a.to, space))
          )
            continue;
          const room =
            SPACE[space].population - Object.values(s.influence[space]).reduce((x, y) => x + y, 0);
          const limit = Math.min(
            job.remaining,
            a.perSpace ?? job.remaining,
            a.mode === 'place' ? Math.min(room, supply(s, f)) : s.influence[space][f],
            a.mode === 'replace' && f !== a.to ? supply(s, a.to!) : Infinity,
          );
          for (let count = 1; count <= limit; count++)
            add(
              `${space}|${f}|${count}`,
              `${SPACE[space].nameZh} · ${f} ${a.mode === 'place' ? '放置' : a.mode === 'remove' ? '移除' : '替换'} ${count}`,
              () => {
                if (a.mode === 'replace') {
                  changeInfluence(s, f, space, -count, true, job.used.includes(space));
                  changeInfluence(s, a.to!, space, count, true, true);
                  s.turn.placed.push(space);
                } else changeInfluence(s, f, space, a.mode === 'place' ? count : -count, true);
                receipt(s, count, space);
                const updated = {
                  ...job,
                  args: { ...a, ...(a.singleFaction ? { factions: [f] } : {}) },
                };
                next(s, updated, count, space);
              },
            );
        }
      break;
    }
    case 'pieces.deploy': {
      const a = job.args;
      const units = s.pieces.filter(
        (p) =>
          p.owner === a.owner &&
          a.kinds.includes(p.kind) &&
          (available(s, p, a.owner) || (a.fromMap && onMap(p))) &&
          (!a.unrevealed || !p.revealed),
      );
      for (const space of a.spaces.filter(
        (id) => SPACE[id] && (!a.distinct || !job.used.includes(id)),
      ))
        for (const p of units) {
          if (p.kind === 'cadre' && piecesAt(s, space, 'cadre').length) continue;
          add(`${p.id}|${space}`, `${SPACE[space].nameZh} · ${unitLabel(p)}`, () => {
            p.location = space;
            receipt(s, 1, space, p.id);
            next(s, job, 1, space);
            record(s, `${unitLabel(p)} 由事件部署至 ${SPACE[space].nameZh}。`);
            if (p.kind === 'militia' || p.kind === 'sa')
              s.effects.unshift({ type: 'sworn-enemies', actor: active(s), space });
          });
        }
      break;
    }
    case 'pieces.reveal':
      for (const p of s.pieces.filter(
        (p) =>
          job.args.ids.includes(p.id) &&
          p.kind === 'freikorps' &&
          !p.revealed &&
          p.location !== 'removed',
      ))
        add(p.id, unitLabel(p), () => {
          revealUnit(s, p.id);
          receipt(s, 1, p.location, p.id);
          next(s, job);
        });
      break;
    case 'pieces.return':
      for (const p of s.pieces.filter(
        (p) =>
          job.args.ids.includes(p.id) &&
          !job.used.includes(p.id) &&
          p.location === job.origins?.[p.id],
      ))
        add(p.id, `${SPACE[p.location]?.nameZh ?? p.location} · ${p.kind}`, () => {
          receipt(s, 1, p.location, p.id);
          returnPiece(
            s,
            p,
            job.args.anyHolding ? job.args.actor : job.returnDecider,
            !!job.args.anyHolding,
            [
              {
                type: 'domain-job',
                job: { ...job, remaining: job.remaining - 1, used: [...job.used, p.id] },
              },
            ],
          );
        });
      break;
    case 'leverage.place': {
      for (const p of s.pieces.filter(
        (p) =>
          p.kind === 'leverage' &&
          (!job.args.owner || p.owner === job.args.owner) &&
          available(s, p, p.owner!),
      )) {
        const targets = [
          ...leverageDestinations(s, p).filter((id) => !SPACE[id]),
          ...(!s.generalStrike ? SPACES.map((p) => p.id) : []),
        ];
        for (const to of targets.filter((id) => !job.args.spaces || job.args.spaces.includes(id)))
          add(`${p.id}|${to}`, `${p.owner} 杠杆 → ${SPACE[to]?.nameZh ?? to}`, () => {
            p.location = to;
            receipt(s, 1, to, p.id);
            clampTracks(s);
            const remove = piecesAt(s, to).filter((x) =>
              p.owner === 'Coalition'
                ? (x.kind === 'strike' && x.side === 'strike') ||
                  (x.kind === 'cadre' && x.owner === 'KPD')
                : x.kind === 'assassination' || (x.kind === 'cadre' && x.owner === 'NSDAP'),
            );
            s.effects.unshift(
              ...remove.map((x) => ({
                type: 'return' as const,
                pieceId: x.id,
                actor: job.returnDecider,
              })),
            );
          });
      }
      break;
    }
    case 'leverage.replace': {
      const a = job.args;
      const removed = s.pieces.filter(
        (p) => p.kind === 'leverage' && p.owner === a.from && onMap(p),
      );
      const replacements = s.pieces.filter(
        (p) => p.kind === 'leverage' && p.owner === a.to && available(s, p, a.to),
      );
      for (const old of removed)
        for (const replacement of replacements) {
          if (s.generalStrike) continue;
          add(
            `${old.id}|${replacement.id}`,
            `${SPACE[old.location].nameZh} · 黄色杠杆 → 黑色杠杆`,
            () => {
              const space = old.location;
              replacement.location = space;
              receipt(s, 1, space, replacement.id);
              // As with placing black leverage, remove matching cadres/assassinations.
              const cleanup = piecesAt(s, space).filter(
                (p) => p.kind === 'assassination' || (p.kind === 'cadre' && p.owner === 'NSDAP'),
              );
              returnPiece(s, old, job.returnDecider, false, [
                ...cleanup.map((p): Effect => ({
                  type: 'return',
                  pieceId: p.id,
                  actor: job.returnDecider,
                })),
                { type: 'domain-job', job: { ...job, remaining: job.remaining - 1 } },
              ]);
            },
          );
        }
      break;
    }
    case 'strike.place': {
      const a = job.args,
        existing = piecesAt(s, a.space, 'strike')[0];
      if (existing) {
        if (a.flipExisting && existing.side === 'strike')
          add('flip', '将已有罢工翻为起义', () => {
            existing.side = 'uprising';
            receipt(s, 1, a.space, existing.id);
          });
      } else
        for (const p of s.pieces.filter((p) => p.kind === 'strike' && available(s, p, 'KPD')))
          add(p.id, `从 ${HOLDING[p.location]?.label} 放置${a.uprising ? '起义' : '罢工'}`, () => {
            p.location = a.space;
            p.side = a.uprising ? 'uprising' : 'strike';
            receipt(s, 1, a.space, p.id);
            s.effects.unshift(...strikeConsequences(s, a.space, job.returnDecider));
          });
      break;
    }
    case 'board.remove': {
      const a = job.args;
      for (const p of s.pieces.filter(
        (p) => a.spaces.includes(p.location) && a.kinds.includes(p.kind),
      ))
        add(p.id, `${SPACE[p.location].nameZh} · 移除 ${p.owner ?? ''} ${p.kind}`, () => {
          receipt(s, 1, p.location, p.id);
          returnPiece(s, p, job.returnDecider, false, [{ type: 'domain-job', job }]);
        });
      if (a.influence)
        for (const space of a.spaces)
          for (const f of FACTIONS)
            if (s.influence[space][f] > 0 && !s.turn.placed.includes(space))
              add(`${space}|${f}`, `${SPACE[space].nameZh} · 移除 ${f} 1 影响力`, () => {
                changeInfluence(s, f, space, -1, true);
                receipt(s, 1, space);
                s.effects.unshift({ type: 'domain-job', job });
              });
      break;
    }
    case 'track.choose': {
      const a = job.args,
        seen = new Set<number>();
      for (let delta = -a.distance; delta <= a.distance; delta++) {
        if (
          (a.direction === 'negative' && delta > 0) ||
          (a.direction === 'positive' && delta < 0) ||
          (!a.optional && delta === 0)
        )
          continue;
        const probe = structuredClone({
          ...s,
          flow: undefined,
          pending: null,
          effects: [],
          log: [],
        });
        moveTrack(probe, a.track, s.tracks[a.track] + delta);
        const to = probe.tracks[a.track];
        if (seen.has(to)) continue;
        seen.add(to);
        add(String(to), `${a.track} ${s.tracks[a.track]} → ${to}`, () => moveTrack(s, a.track, to));
      }
      break;
    }
    case 'action.grant': {
      const a = job.args;
      const candidates = actionCandidates(s, a.actor).filter(
        (c) => !a.kinds.length || a.kinds.includes(c.action.kind),
      );
      const scopes = a.distinctSpaces
        ? (a.spaces ?? []).filter((id) => !job.used.includes(id)).map((id) => [id])
        : [a.spaces];
      for (const scope of scopes)
        for (const candidate of candidates) {
          const action = candidate.action,
            space = actionSpace(s, action);
          if (
            scope &&
            !['move-units', 'test-loyalty'].includes(action.kind) &&
            (!space || !scope.includes(space))
          )
            continue;
          if (!probeAction(s, a.actor, action, scope)) continue;
          const id = String(out.length);
          add(
            id,
            `${a.actor} · ${candidate.label}${scope && a.distinctSpaces ? `（限定 ${SPACE[scope[0]].nameZh}）` : ''}`,
            () => {
              const tail = s.effects;
              s.effects = [];
              s.grantContext = {
                returnDecider: job.returnDecider,
                ...(scope ? { spaces: scope } : {}),
              };
              applyAction(s, a.actor, action);
              receipt(s, 1, space);
              s.effects.push(
                { type: 'grant-end' },
                {
                  type: 'domain-job',
                  job: {
                    ...job,
                    remaining: job.remaining - 1,
                    used: a.distinctSpaces ? [...job.used, scope![0]] : job.used,
                  },
                },
                ...tail,
              );
            },
          );
        }
      break;
    }
  }
  return out;
}
export function resolveDomainJob(s: GameState, job: DomainJob) {
  const titles: Record<DomainJob['kind'], string> = {
    'influence.allocate': '分配影响力',
    'pieces.deploy': '部署部队',
    'pieces.return': '归还棋子',
    'pieces.reveal': '揭示自由军团',
    'leverage.place': '放置杠杆',
    'leverage.replace': '替换杠杆',
    'strike.place': '放置罢工／起义',
    'board.remove': '移除地图棋子',
    'track.choose': '调整轨道',
    'action.grant': '事件授予行动',
  };
  const candidates = domainCandidates(s, job);
  if (!candidates.length) {
    if (job.remaining > 0) record(s, `${titles[job.kind]}：无合法目标，跳过剩余指令。`);
    return;
  }
  const options: ChoiceOption[] = candidates.map((c) => ({
    id: c.id,
    label: c.label,
    effects: [{ type: 'domain-commit', job, choice: c.id }],
  }));
  const optional = ('optional' in job.args && job.args.optional) || job.kind === 'board.remove';
  if (optional) options.push({ id: 'stop', label: '不执行／结束此部分', effects: [] });
  if (options.length === 1) {
    candidates[0].apply();
    return;
  }
  s.pending = {
    actor: job.args.actor,
    prompt: `${titles[job.kind]}（剩余 ${job.kind === 'board.remove' ? '任意数量' : job.remaining}）`,
    options,
  };
}
export function commitDomainJob(s: GameState, job: DomainJob, id: string) {
  const candidate = domainCandidates(s, job).find((c) => c.id === id);
  ensure(candidate, '事件选择已失效');
  candidate.apply();
}
