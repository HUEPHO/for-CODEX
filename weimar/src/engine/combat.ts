import { SPACE } from '../data/board.ts';
import type {
  GameState,
  Faction,
  CombatSide,
  CombatEffect,
  Effect,
  ChoiceOption,
} from './types.ts';
import { FACTIONS } from './types.ts';
import {
  active,
  changeInfluence,
  controls,
  ensure,
  isUnit,
  piecesAt,
  record,
  survival,
  supremacy,
} from './rules.ts';
import { randomInt } from './random.ts';
import { revealUnit, unitLabel } from './units.ts';
import { ruleValue, shiftStance } from './policies.ts';

const opposite = (side: CombatSide): CombatSide => (side === 'attacker' ? 'defender' : 'attacker');
const pair = () => ({ attacker: 0, defender: 0 });
export function canAssault(
  s: GameState,
  attacker: Faction,
  defender: Faction,
  space: string,
  free = false,
) {
  const pieces = piecesAt(s, space);
  return (
    !!SPACE[space] &&
    FACTIONS.includes(defender) &&
    attacker !== defender &&
    !s.combat &&
    (free || !s.turn.assaulted.includes(space)) &&
    pieces.some((p) => isUnit(p) && p.owner === attacker) &&
    pieces.some(
      (p) => (isUnit(p) && p.owner === defender) || (defender === 'KPD' && p.kind === 'strike'),
    )
  );
}
function units(s: GameState, side: CombatSide) {
  const c = s.combat!;
  return piecesAt(s, c.space).filter(
    (p) => isUnit(p) && c.participants[p.id] === side && !c.ignored.includes(p.id),
  );
}
export function assaultStrength(s: GameState, side: CombatSide) {
  const c = s.combat!;
  const f = c[side],
    pieces = piecesAt(s, c.space);
  let strength = units(s, side).reduce((n, p) => n + survival(s, p), 0) + c.support[side];
  if (controls(s, f, c.space)) strength += 2;
  if (f === 'KPD') {
    const strike = pieces.find((p) => p.kind === 'strike');
    if (strike) strength += strike.side === 'uprising' ? 2 : 1;
  }
  if (
    (f === 'Coalition' || f === 'RC') &&
    pieces.some((p) => p.kind === 'leverage' && p.owner === f)
  )
    strength++;
  if ((f === 'KPD' || f === 'NSDAP') && pieces.some((p) => p.kind === 'cadre' && p.owner === f))
    strength++;
  strength = ruleValue(s, 'combat.strength', strength, f);
  return strength;
}
function finishCombat(s: GameState, cancelled = false) {
  const c = s.combat!;
  c.cancelled = cancelled;
  c.stage = cancelled ? '忠诚检定后取消' : '结算完成';
  s.lastCombat = structuredClone(c);
  delete s.combat;
}
export function resolveCombat(s: GameState, e: CombatEffect) {
  if (e.type === 'combat-start') {
    ensure(
      canAssault(s, e.attacker, e.defender, e.space, e.free),
      '突击目标无效、缺少参与部队或本回合已经突击过该地区',
    );
    if (!e.free) s.turn.assaulted.push(e.space);
    const participants: Record<string, CombatSide> = {};
    for (const p of piecesAt(s, e.space).filter(isUnit)) {
      if (p.owner === e.attacker) participants[p.id] = 'attacker';
      if (p.owner === e.defender) participants[p.id] = 'defender';
    }
    s.combat = {
      space: e.space,
      attacker: e.attacker,
      defender: e.defender,
      free: e.free,
      stage: '进攻方借兵',
      participants,
      asked: [],
      ignored: [],
      support: pair(),
      strength: pair(),
      dice: pair(),
      hits: pair(),
      casualties: [],
    };
    record(
      s,
      `${SPACE[e.space].nameZh}：${e.attacker} 突击 ${e.defender}${e.free ? '（死敌免费突击，不额外消耗行动）' : ''}。`,
    );
    s.effects.unshift({ type: 'combat-loans', side: 'attacker' });
    return;
  }
  const c = s.combat;
  ensure(c, '没有正在结算的突击');
  switch (e.type) {
    case 'combat-loans': {
      const next: Effect =
        e.side === 'attacker'
          ? { type: 'combat-loans', side: 'defender' }
          : { type: 'combat-loyalty' };
      const thirdParty = piecesAt(s, c.space).filter(
        (p) =>
          isUnit(p) &&
          p.owner !== c.attacker &&
          p.owner !== c.defender &&
          !c.participants[p.id] &&
          !c.asked.includes(`${e.side}:${p.id}`) &&
          !piecesAt(s, c.space).some(
            (other) => other.owner === p.owner && c.participants[other.id] === opposite(e.side),
          ),
      );
      c.stage = e.side === 'attacker' ? '进攻方借兵' : '防守方借兵';
      if (!thirdParty.length) {
        s.effects.unshift(next);
        break;
      }
      s.pending = {
        actor: c[e.side],
        prompt: `${c[e.side]} 可向其他阵营请求借兵；出借方必须同意`,
        options: [
          { id: 'done', label: '结束借兵', effects: [next] },
          ...thirdParty.map((p): ChoiceOption => ({
            id: p.id,
            label: `请求借用 ${unitLabel(p)}`,
            effects: [{ type: 'combat-request', side: e.side, pieceId: p.id }],
          })),
        ],
      };
      break;
    }
    case 'combat-request': {
      const p = s.pieces.find((p) => p.id === e.pieceId)!;
      c.asked.push(`${e.side}:${p.id}`);
      c.stage = '等待出借许可';
      s.pending = {
        actor: p.owner!,
        prompt: `是否将 ${unitLabel(p)} 借给 ${c[e.side]}？借用方决定战斗中的损失次序。`,
        options: [
          { id: 'refuse', label: '拒绝出借', effects: [{ type: 'combat-loans', side: e.side }] },
          {
            id: 'lend',
            label: '同意出借',
            effects: [
              { type: 'combat-lend', side: e.side, pieceId: p.id },
              { type: 'combat-loans', side: e.side },
            ],
          },
        ],
      };
      break;
    }
    case 'combat-lend':
      c.participants[e.pieceId] = e.side;
      break;
    case 'combat-loyalty': {
      c.stage = '忠诚检定';
      const coalition = (['attacker', 'defender'] as const).find(
        (side) =>
          units(s, side).some((p) => p.owner === 'Coalition') &&
          units(s, opposite(side)).some((p) => p.owner === 'RC'),
      );
      if (
        coalition &&
        s.tracks.progress < s.tracks.reaction + ruleValue(s, 'loyalty.progress-margin', 0)
      ) {
        const before = units(s, coalition);
        const onlyCoalition = before.length > 0 && before.every((p) => p.owner === 'Coalition');
        c.ignored = before.filter((p) => p.kind === 'reichswehr').map((p) => p.id);
        for (const p of piecesAt(s, c.space).filter(
          (p) => p.owner === 'Coalition' && p.kind === 'freikorps' && !p.revealed,
        )) {
          revealUnit(s, p.id);
          if (p.owner === 'RC') c.participants[p.id] = opposite(coalition);
        }
        record(
          s,
          '联盟忠诚检定失败：国防军不参战，叛离自由军团加入对面；已揭示的忠诚自由军团保持忠诚。',
        );
        if (onlyCoalition && !units(s, coalition).length) {
          record(s, '该侧已无忠诚参战单位，取消突击；本次行动仍已消耗。');
          finishCombat(s, true);
          break;
        }
      } else
        record(
          s,
          coalition ? '联盟忠诚检定通过。' : '双方没有相对的联盟与 RC 部队，免于忠诚检定。',
        );
      s.effects.unshift({ type: 'combat-support', side: 'attacker' });
      break;
    }
    case 'combat-support': {
      c.stage = '中产支持加成';
      const next: Effect =
        e.side === 'attacker'
          ? { type: 'combat-support', side: 'defender' }
          : { type: 'combat-roll' };
      const pawns = piecesAt(s, `mat:${c[e.side]}`, 'mcs');
      if (!pawns.length) {
        s.effects.unshift(next);
        break;
      }
      s.pending = {
        actor: c[e.side],
        prompt: `${c[e.side]} 是否归还1个中产支持，让本次突击强度 +2？`,
        options: [
          { id: 'skip', label: '保留中产支持', effects: [next] },
          ...pawns.map((p): ChoiceOption => ({
            id: p.id,
            label: `归还 ${p.id}，突击强度 +2`,
            effects: [{ type: 'combat-spend-support', side: e.side, pieceId: p.id }, next],
          })),
        ],
      };
      break;
    }
    case 'combat-spend-support':
      c.support[e.side] = 2;
      s.effects.unshift({ type: 'return', pieceId: e.pieceId, actor: active(s) });
      break;
    case 'combat-roll':
      for (const side of ['attacker', 'defender'] as const) {
        c.strength[side] = assaultStrength(s, side);
        c.dice[side] = randomInt(s, 6) + 1;
        c.hits[side] = Math.max(0, c.strength[side] - c.dice[side]);
        record(
          s,
          `${c[side]}：突击强度 ${c.strength[side]} − 掷骰 ${c.dice[side]} = ${c.hits[side]} 命中。`,
        );
      }
      s.effects.unshift(
        { type: 'combat-loss', side: 'attacker', remaining: c.hits.attacker },
        { type: 'combat-loss', side: 'defender', remaining: c.hits.defender },
        { type: 'combat-finish' },
      );
      break;
    case 'combat-loss': {
      c.stage = `${c[e.side]} 分配命中（剩余 ${e.remaining}）`;
      if (e.remaining <= 0) break;
      const targets = units(s, opposite(e.side));
      if (targets.length) {
        s.pending = {
          actor: c[e.side],
          prompt: `${c[e.side]} 分配 ${e.remaining} 命中：先处理对方部队；不足 SV 的命中会被吸收`,
          options: targets.map((p): ChoiceOption => {
            const cost = survival(s, p),
              destroyed = e.remaining >= cost;
            return {
              id: p.id,
              label: `${unitLabel(p)} · SV ${cost} · ${destroyed ? '移除' : '吸收剩余命中，存活'}`,
              effects: destroyed
                ? [
                    { type: 'combat-casualty', pieceId: p.id },
                    { type: 'return', pieceId: p.id, actor: active(s) },
                    { ...e, remaining: e.remaining - cost },
                  ]
                : [{ type: 'log', text: `${unitLabel(p)} 吸收 ${e.remaining} 命中，未被移除。` }],
            };
          }),
        };
        break;
      }
      const targetFaction = c[opposite(e.side)];
      const strike = targetFaction === 'KPD' ? piecesAt(s, c.space, 'strike')[0] : undefined;
      if (strike) {
        const cost = strike.side === 'uprising' ? 2 : 1;
        if (e.remaining >= cost)
          s.effects.unshift(
            { type: 'combat-casualty', pieceId: strike.id },
            { type: 'return', pieceId: strike.id, actor: active(s) },
            { ...e, remaining: e.remaining - cost },
          );
        else record(s, '剩余命中不足以移除起义，命中被吸收。');
        break;
      }
      changeInfluence(
        s,
        targetFaction,
        c.space,
        -Math.min(e.remaining, s.influence[c.space][targetFaction]),
        true,
        true,
      );
      break;
    }
    case 'combat-casualty':
      c.casualties.push(e.pieceId);
      record(s, `突击移除 ${e.pieceId}。`);
      break;
    case 'combat-finish':
      if (c.hits.attacker !== c.hits.defender) {
        s.momentum = c.hits.attacker > c.hits.defender ? c.attacker : c.defender;
        record(s, `${s.momentum} 命中较高，获得 momentum。`);
      } else record(s, '双方命中相同，momentum 不变。');
      if (supremacy(s, c.space) !== c.attacker && s.influence[c.space][c.attacker] > 0)
        changeInfluence(s, c.attacker, c.space, -1, true, true);
      if (c.defender === 'KPD' || c.defender === 'NSDAP') shiftStance(s, c.defender, 1);
      finishCombat(s);
      break;
  }
}
