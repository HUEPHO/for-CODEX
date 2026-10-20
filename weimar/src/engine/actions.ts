import { fixedStances, reactionLimited } from './scenarios.ts';
import { SPACE, SPACES } from '../data/board.ts';
import { HOLDING, isDeployedTrack } from '../data/holdings.ts';
import { FACTIONS } from './types.ts';
import type { Action, GameState, Faction, Piece, Effect } from './types.ts';
import {
  available,
  ensure,
  integer,
  influencePower,
  withinReach,
  blockedByAssassination,
  supremacy,
  dominance,
  controls,
  piecesAt,
  onMap,
  presence,
  changeInfluence,
  clampTracks,
  record,
  returnEffects,
  mcs,
  isUnit,
  supply,
} from './rules.ts';
import { canPlaceUnit, movementOptions, unrevealedUnits, unitLabel } from './units.ts';
import { canAssault } from './combat.ts';
import { canAssassinate } from './assassinations.ts';
import { actionCompleted, returnDecider, ruleValue, shiftStance } from './policies.ts';
import { strikeConsequences } from './consequences.ts';

export const ACTION_LABELS: Record<Action['kind'], string> = {
  'change-stance': '改变立场',
  'place-unit': '部署部队',
  'move-units': '移动部队（最多3支）',
  assault: '突击',
  'test-loyalty': '测试联盟忠诚（最多3地）',
  'place-assassination': '放置暗杀',
  'gain-momentum': '取得 momentum',
  'place-influence': '放置影响力',
  'remove-influence': '移除影响力',
  'advance-progress': '提高进步',
  'advance-reaction': '提高反动',
  'increase-deals': '提升协定',
  'increase-unity': '提高团结',
  'move-mcs': '移动中产支持',
  'place-cadre': '放置干部',
  'place-reform': '放置改革',
  'place-strike': '放置罢工',
  'place-clique': '放置保守派集团',
  'flip-uprising': '罢工转为起义',
  'place-leverage': '放置杠杆',
  'remove-leverage': '移除杠杆',
  'declare-victory': '放置即时胜利标记',
};
export function leverageDestinations(s: GameState, p: Piece): string[] {
  const group = p.owner === 'Coalition' ? 'progress' : 'reaction';
  const next = [2, 3, 4, 5].find((n) => !piecesAt(s, `@${group}:${n}`).length);
  const out = next ? [`@${group}:${next}`] : [];
  for (const side of [
    [2, 3, 4, 5],
    [8, 7, 6, 5],
  ]) {
    if (
      p.owner === 'Coalition' &&
      s.pieces.some(
        (x) => x.owner === 'RC' && side.map((n) => `@economy:${n}`).includes(x.location),
      )
    )
      continue;
    const n = side.find((n) => !piecesAt(s, `@economy:${n}`).length);
    if (n) out.push(`@economy:${n}`);
  }
  if (!s.generalStrike)
    out.push(...SPACES.filter((sp) => presence(s, p.owner!, sp.id)).map((sp) => sp.id));
  return [...new Set(out)];
}
function requireFaction(actor: Faction, allowed: Faction[]) {
  ensure(allowed.includes(actor), '这个阵营没有该行动');
}
function getPiece(s: GameState, id: string) {
  const p = s.pieces.find((p) => p.id === id);
  ensure(p, '棋子不存在');
  return p;
}
function requirePiece(s: GameState, actor: Faction, id: string, kind: Piece['kind']) {
  const p = getPiece(s, id);
  ensure(p.kind === kind && available(s, p, actor), '棋子类型不符或尚未可用');
  return p;
}
export function executeMcs(s: GameState, actor: Faction, pieceId: string, to: string) {
  const p = getPiece(s, pieceId);
  ensure(p.kind === 'mcs', '需要中产支持棋子');
  if (to === `mat:${actor}`) {
    ensure(
      available(s, p, actor) || (actor === 'NSDAP' && p.location === 'mat:RC'),
      '只能拿取可用中产支持；NSDAP 也可从 RC 阵营板拿取',
    );
    p.location = to;
  } else {
    ensure(to === 'return' && p.location.startsWith('mat:'), '只能从阵营板移回存放格');
    s.effects.push({ type: 'return', pieceId, actor: returnDecider(s, actor) });
  }
}
export function applyAction(s: GameState, actor: Faction, a: Action, region?: string) {
  ensure(a && typeof a === 'object' && a.kind in ACTION_LABELS, '行动尚未实现或格式错误');
  switch (a.kind) {
    case 'change-stance':
      requireFaction(actor, ['KPD', 'NSDAP']);
      ensure(!fixedStances(s), '本剧本不使用立场轨道');
      integer(
        a.steps,
        -ruleValue(s, 'stance.max-steps', 1, actor),
        ruleValue(s, 'stance.max-steps', 1, actor),
      );
      ensure(
        a.steps !== 0 &&
          s.stance[actor as 'KPD' | 'NSDAP'] + Math.sign(a.steps) >= -3 &&
          s.stance[actor as 'KPD' | 'NSDAP'] + Math.sign(a.steps) <= 3,
        '立场已到尽头',
      );
      shiftStance(s, actor, a.steps);
      break;
    case 'place-unit': {
      const p = getPiece(s, a.pieceId);
      ensure(
        canPlaceUnit(s, actor, p, a.space),
        '部队不可用，或目标缺少本阵营领导权、议会控制或干部',
      );
      p.location = a.space;
      record(s, `${unitLabel(p)} 部署到 ${SPACE[a.space].nameZh}。`);
      if (p.kind === 'militia' || p.kind === 'sa')
        s.effects.push({ type: 'sworn-enemies', actor, space: a.space });
      break;
    }
    case 'move-units':
      ensure(
        movementOptions(s, actor, [], region, s.grantContext?.spaces).length,
        '没有符合目的地及距离限制的可移动部队',
      );
      s.effects.push({
        type: 'move-units-choice',
        actor,
        moved: [],
        arrivals: [],
        region,
        spaces: s.grantContext?.spaces,
      });
      break;
    case 'test-loyalty':
      requireFaction(actor, ['RC']);
      ensure(
        unrevealedUnits(s, [], region, s.grantContext?.spaces).length,
        '范围内没有未揭示的联盟自由军团',
      );
      s.effects.push({
        type: 'loyalty-choice',
        actor,
        spaces: [],
        region,
        allowedSpaces: s.grantContext?.spaces,
      });
      break;
    case 'assault':
      ensure(canAssault(s, actor, a.target, a.space), '突击目标无效、缺少部队或本回合已突击该地区');
      s.effects.push({
        type: 'combat-start',
        attacker: actor,
        defender: a.target,
        space: a.space,
        free: false,
      });
      if (ruleValue(s, 'combat.spaces-per-action', 1, actor) > 1)
        s.effects.push({ type: 'hound-assault', actor, excluded: a.space, region });
      break;
    case 'place-assassination': {
      const p = getPiece(s, a.pieceId);
      ensure(
        canAssassinate(s, actor, p, a.space, a.side),
        '暗杀标记不可用，或目标地区没有对应阵营影响力',
      );
      s.effects.push(
        { type: 'assassination-place', pieceId: p.id, space: a.space, side: a.side },
        { type: 'assassination-loss', actor, space: a.space, side: a.side, region },
      );
      break;
    }
    case 'gain-momentum':
      s.momentum = actor;
      break;
    case 'place-influence':
      ensure(SPACE[a.space], '地区不存在');
      integer(a.count, 1, influencePower(s, actor));
      ensure(withinReach(s, actor, a.space, true), '目标地区不在放置范围内');
      changeInfluence(s, actor, a.space, a.count);
      break;
    case 'remove-influence': {
      ensure(SPACE[a.space], '地区不存在');
      ensure(a.targets && typeof a.targets === 'object', '缺少移除目标');
      ensure(
        Object.keys(a.targets).every((k) => FACTIONS.includes(k as Faction)),
        '无效阵营',
      );
      ensure(withinReach(s, actor, a.space, false), '目标地区不在移除范围内');
      ensure(!blockedByAssassination(s, actor, a.space), '暗杀标记阻止本阵营在此移除影响力');
      let count = 0;
      for (const f of FACTIONS) {
        const n = a.targets[f] ?? 0;
        integer(n, 0, 3);
        if (!n) continue;
        ensure(f !== actor, '不能用此行动移除己方影响力');
        ensure(supremacy(s, a.space) !== f, '目标阵营在此拥有军事优势');
        count += n;
      }
      integer(count, 1, influencePower(s, actor));
      const replacing = ruleValue(s, 'influence.replace-on-removal', 0, actor) === 1;
      const replacements = replacing ? (a.targets.Coalition ?? 0) + (a.targets.KPD ?? 0) : 0;
      ensure(replacements <= supply(s, actor), '替换所需本方影响力不足');
      for (const f of FACTIONS) if (a.targets[f]) changeInfluence(s, f, a.space, -a.targets[f]!);
      if (replacements) {
        // #15 is one atomic replacement: its own removal does not block its placement.
        changeInfluence(s, actor, a.space, replacements, true, true);
        s.turn.placed.push(a.space);
      }
      break;
    }
    case 'advance-progress':
    case 'advance-reaction': {
      const progress = a.kind === 'advance-progress';
      requireFaction(actor, [progress ? 'Coalition' : 'RC']);
      const track = progress ? 'progress' : 'reaction';
      if (!progress && reactionLimited(s))
        ensure(s.tracks.reaction < s.tracks.progress + 1, '反动不能超过进步1格');
      ensure(
        piecesAt(s, `@${track}:${s.tracks[track] + 1}`).length,
        '下一格没有杠杆，无法提高轨道',
      );
      s.tracks[track]++;
      break;
    }
    case 'increase-deals': {
      requireFaction(actor, ['Coalition']);
      ensure(a.track === 'us' || a.track === 'ussr', '协定轨道无效');
      ensure(s.tracks[a.track] < 5, '协定已到顶');
      s.tracks[a.track]++;
      if (a.track === 'us')
        s.tracks.dollarDependence = Math.max(s.tracks.dollarDependence, s.tracks.us - 2);
      break;
    }
    case 'increase-unity': {
      requireFaction(actor, ['Coalition']);
      const p = getPiece(s, a.pieceId);
      ensure(p.kind === 'mcs' && p.location === 'mat:Coalition', '联盟阵营板上需要有中产支持');
      ensure(s.tracks.unity < 2, '团结已经强大');
      s.tracks.unity++;
      s.effects.push({ type: 'return', pieceId: p.id, actor: returnDecider(s, actor) });
      break;
    }
    case 'move-mcs': {
      const count =
        actor === 'NSDAP'
          ? s.pieces.filter((p) => p.kind === 'cadre' && p.owner === actor && onMap(p)).length
          : 1;
      ensure(count > 0, 'NSDAP 需要地图上的干部才能执行此行动');
      executeMcs(s, actor, a.pieceId, a.to);
      if (count > 1) s.effects.push({ type: 'mcs-choice', actor, remaining: count - 1 });
      break;
    }
    case 'place-cadre':
    case 'place-reform':
    case 'place-strike':
    case 'place-clique': {
      ensure(SPACE[a.space], '地区不存在');
      const kind =
        a.kind === 'place-cadre'
          ? 'cadre'
          : a.kind === 'place-reform'
            ? 'reform'
            : a.kind === 'place-strike'
              ? 'strike'
              : 'clique';
      requireFaction(
        actor,
        kind === 'cadre'
          ? ['KPD', 'NSDAP']
          : kind === 'reform'
            ? ['Coalition']
            : kind === 'strike'
              ? ['KPD']
              : ['RC'],
      );
      const p = requirePiece(s, actor, a.pieceId, kind);
      if (kind === 'reform') {
        ensure(s.tracks.unity >= 1, '团结脆弱时不能放置改革');
        ensure(controls(s, actor, a.space), '需要联盟议会控制');
        ensure(
          !piecesAt(s, a.space).some(
            (p) =>
              ['strike', 'reform', 'assassination'].includes(p.kind) ||
              (p.kind === 'leverage' && p.owner === 'RC'),
          ),
          '罢工、起义、暗杀、黑色杠杆或已有改革阻止放置',
        );
      } else if (kind === 'clique') {
        ensure(
          dominance(s, a.space) === 'RC' && !blockedByAssassination(s, 'RC', a.space),
          '需要 RC 领导权，且没有棕黑暗杀',
        );
      } else {
        ensure(
          dominance(s, a.space) === actor || controls(s, actor, a.space),
          '需要本阵营领导权或议会控制',
        );
        ensure(
          !piecesAt(s, a.space, kind).length,
          kind === 'cadre' ? '此地已有干部' : '此地已有罢工或起义',
        );
      }
      p.location = a.space;
      if (kind === 'strike') {
        p.side = 'strike';
        s.effects.push(...strikeConsequences(s, a.space, actor));
      }
      break;
    }
    case 'flip-uprising': {
      requireFaction(actor, ['KPD']);
      const p = piecesAt(s, a.space, 'strike')[0];
      ensure(p?.side === 'strike', '目标地区没有可翻面的罢工');
      p.side = 'uprising';
      break;
    }
    case 'place-leverage': {
      requireFaction(actor, ['Coalition', 'RC']);
      const p = requirePiece(s, actor, a.pieceId, 'leverage');
      ensure(leverageDestinations(s, p).includes(a.to), '不符合杠杆放置位置、顺序或总罢工限制');
      p.location = a.to;
      if (SPACE[a.to]) {
        const remove = piecesAt(s, a.to).filter((x) =>
          actor === 'Coalition'
            ? (x.kind === 'strike' && x.side === 'strike') ||
              (x.kind === 'cadre' && x.owner === 'KPD')
            : x.kind === 'assassination' || (x.kind === 'cadre' && x.owner === 'NSDAP'),
        );
        s.effects.push(...returnEffects(s, remove, returnDecider(s, actor)));
      }
      break;
    }
    case 'remove-leverage': {
      requireFaction(actor, ['Coalition', 'RC']);
      const p = getPiece(s, a.pieceId);
      ensure(
        p.kind === 'leverage' && (onMap(p) || isDeployedTrack(p.location)),
        '只能移除已部署的杠杆',
      );
      if (p.location.startsWith('@progress:') || p.location.startsWith('@reaction:')) {
        const h = HOLDING[p.location];
        ensure(
          !s.pieces.some(
            (x) => HOLDING[x.location]?.group === h.group && HOLDING[x.location].level > h.level,
          ),
          '必须先移除最高格的杠杆',
        );
      }
      if (p.location.startsWith('@economy:')) {
        const n = Number(p.location.split(':')[1]);
        const higher =
          n < 5
            ? [...Array(5 - n)].map((_, i) => n + i + 1)
            : n > 5
              ? [...Array(n - 5)].map((_, i) => n - i - 1)
              : [];
        ensure(
          !higher.some((v) => piecesAt(s, `@economy:${v}`).length),
          '必须先移除该侧靠近中央的最高编号杠杆',
        );
      }
      s.effects.push({ type: 'return', pieceId: p.id, actor: returnDecider(s, actor) });
      break;
    }
    case 'declare-victory':
      if (!fixedStances(s) && (actor === 'KPD' || actor === 'NSDAP'))
        ensure(s.stance[actor] === 3, '立场尚未释放即时胜利标记');
      ensure(!s.victoryDeclared.includes(actor), '本轮已放置即时胜利标记');
      ensure(
        actor !== 'RC' || !piecesAt(s, '@rc-economic:4').length,
        'RC 经济影响力第4格尚未释放即时胜利标记',
      );
      s.victoryDeclared.push(actor);
      break;
  }
  clampTracks(s);
  actionCompleted(s, actor, a.kind);
  record(s, `${actor}：${ACTION_LABELS[a.kind]}`);
}

// Enumerate every target combination for implemented actions; the reducer remains
// authoritative. The UI and tests consume the SAME commands as future clients.
export function actionCandidates(s: GameState, f: Faction): { label: string; action: Action }[] {
  const out: { label: string; action: Action }[] = [];
  const add = (a: Action, detail = '') =>
    out.push({ label: `${ACTION_LABELS[a.kind]}${detail ? ' · ' + detail : ''}`, action: a });
  add({ kind: 'gain-momentum' });
  add({ kind: 'declare-victory' });
  if (!fixedStances(s) && (f === 'KPD' || f === 'NSDAP'))
    for (let n = 1; n <= ruleValue(s, 'stance.max-steps', 1, f); n++)
      for (const direction of [-1, 1])
        add(
          { kind: 'change-stance', steps: n * direction },
          `${direction === 1 ? '向革命' : '向民主'} ${n} 格`,
        );
  if (movementOptions(s, f, []).length) add({ kind: 'move-units' });
  if (f === 'RC' && unrevealedUnits(s).length) add({ kind: 'test-loyalty' });
  if (f === 'Coalition') {
    add({ kind: 'advance-progress' });
    for (const track of ['us', 'ussr'] as const)
      add({ kind: 'increase-deals', track }, track === 'us' ? '美国' : '苏联');
  }
  if (f === 'RC') add({ kind: 'advance-reaction' });
  for (const sp of SPACES) {
    for (const target of FACTIONS)
      if (canAssault(s, f, target, sp.id))
        add({ kind: 'assault', space: sp.id, target }, `${sp.nameZh} → ${target}`);
    for (let count = 1; count <= influencePower(s, f); count++)
      add({ kind: 'place-influence', space: sp.id, count }, `${sp.nameZh} +${count}`);
    const opponents = FACTIONS.filter((x) => x !== f);
    function combinations(index: number, left: number, targets: Partial<Record<Faction, number>>) {
      if (index === opponents.length) {
        if (Object.values(targets).some((n) => n > 0))
          add(
            { kind: 'remove-influence', space: sp.id, targets: { ...targets } },
            `${sp.nameZh} ${Object.entries(targets)
              .filter(([, n]) => n)
              .map(([f, n]) => `${f} −${n}`)
              .join(' / ')}`,
          );
        return;
      }
      const o = opponents[index];
      for (let n = 0; n <= Math.min(left, s.influence[sp.id][o]); n++)
        combinations(index + 1, left - n, { ...targets, [o]: n });
    }
    combinations(0, influencePower(s, f), {});
    if (f === 'KPD') add({ kind: 'flip-uprising', space: sp.id }, sp.nameZh);
  }
  for (const p of s.pieces) {
    if (isUnit(p) && available(s, p, f))
      for (const sp of SPACES) {
        if (canPlaceUnit(s, f, p, sp.id))
          add(
            { kind: 'place-unit', pieceId: p.id, space: sp.id },
            `${sp.nameZh} ← ${unitLabel(p)}`,
          );
      }
    if (p.kind === 'assassination' && available(s, p, f))
      for (const sp of SPACES) {
        for (const side of ['left', 'right'] as const)
          if (canAssassinate(s, f, p, sp.id, side))
            add(
              { kind: 'place-assassination', pieceId: p.id, space: sp.id, side },
              `${sp.nameZh} · ${side === 'left' ? '黄红面' : '棕黑面'} · ${p.id}`,
            );
      }
    if (p.kind === 'mcs') {
      if (available(s, p, f) || (f === 'NSDAP' && p.location === 'mat:RC'))
        add(
          { kind: 'move-mcs', pieceId: p.id, to: `mat:${f}` },
          HOLDING[p.location]?.label ?? '从 RC 阵营板拿取',
        );
      if (p.location.startsWith('mat:'))
        add(
          { kind: 'move-mcs', pieceId: p.id, to: 'return' },
          `归还 ${p.location.slice(4)} 的支持`,
        );
      if (f === 'Coalition' && p.location === 'mat:Coalition')
        add({ kind: 'increase-unity', pieceId: p.id });
    }
    if (p.kind === 'leverage' && ['Coalition', 'RC'].includes(f)) {
      if (available(s, p, f))
        for (const to of leverageDestinations(s, p))
          add(
            { kind: 'place-leverage', pieceId: p.id, to },
            `${HOLDING[p.location]?.label} → ${SPACE[to]?.nameZh ?? HOLDING[to]?.label ?? to}`,
          );
      if (onMap(p) || isDeployedTrack(p.location))
        add(
          { kind: 'remove-leverage', pieceId: p.id },
          `${p.owner} ${SPACE[p.location]?.nameZh ?? p.location}`,
        );
    }
    if (available(s, p, f) && ['cadre', 'reform', 'strike', 'clique'].includes(p.kind))
      for (const sp of SPACES) {
        const kind = (
          {
            cadre: 'place-cadre',
            reform: 'place-reform',
            strike: 'place-strike',
            clique: 'place-clique',
          } as const
        )[p.kind as 'cadre' | 'reform' | 'strike' | 'clique'];
        add({ kind, pieceId: p.id, space: sp.id }, `${sp.nameZh} ← ${HOLDING[p.location]?.label}`);
      }
  }
  return out;
}
