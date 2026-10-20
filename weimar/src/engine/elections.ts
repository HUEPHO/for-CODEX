import { REGIONS, SPACES } from '../data/board.ts';
import { FACTIONS } from './types.ts';
import type { ElectionResult, Faction, GameState } from './types.ts';
import {
  cleanSlate,
  dominance,
  ensure,
  inEffect,
  integer,
  mcs,
  onMap,
  piecesAt,
  record,
  supremacy,
  uniqueLeader,
  zeros,
} from './rules.ts';
import { shuffle } from './random.ts';
import { ruleValue } from './policies.ts';

export function previewElection(s: GameState): ElectionResult {
  const base = zeros();
  const regions = REGIONS.map((region) => {
    const spaces = SPACES.filter((sp) => sp.region === region);
    const blocked = spaces.some((sp) =>
      piecesAt(s, sp.id).some(
        (p) => p.kind === 'assassination' || (p.kind === 'strike' && p.side === 'uprising'),
      ),
    );
    const totals = zeros();
    if (!blocked)
      for (const sp of spaces) {
        const dom = dominance(s, sp.id);
        if (dom) totals[dom] += sp.politicalValue;
        for (const p of piecesAt(s, sp.id)) {
          if (p.kind === 'leverage' && p.owner === 'Coalition')
            totals.Coalition += ruleValue(s, 'pv.regional-piece-value', 1, 'Coalition');
          if (p.kind === 'leverage' && p.owner === 'RC')
            totals.RC += ruleValue(s, 'pv.regional-piece-value', 1, 'RC');
          if (p.kind === 'reform') totals.Coalition += 3;
          if (p.kind === 'cadre' && p.owner === 'KPD')
            totals.KPD += ruleValue(s, 'pv.regional-piece-value', 2, 'KPD');
          if (p.kind === 'cadre' && p.owner === 'NSDAP') totals.NSDAP += 2;
        }
      }
    for (const f of FACTIONS) base[f] += totals[f];
    return { region, blocked, totals, winner: uniqueLeader(totals) };
  });
  const totals = { ...base };
  totals[s.momentum] += 3;
  for (const f of FACTIONS) totals[f] += mcs(s, f) * 2;
  totals.Coalition += s.influence.Berlin.Coalition * Math.max(0, s.tracks.progress - 2);
  if (inEffect(s, 92))
    for (const sp of SPACES.filter((sp) => sp.kind === 'City')) {
      const f = dominance(s, sp.id);
      if (f) totals[f] += sp.id === 'Berlin' ? 2 : 1;
    }
  return {
    regions,
    base,
    totals,
    ranking: [...FACTIONS].sort((a, b) => totals[b] - totals[a] || mcs(s, b) - mcs(s, a)),
  };
}
export function finishElection(
  s: GameState,
  transfer?: { to: Faction; amount: number },
  snap = false,
) {
  const result = previewElection(s);
  const nsdapBeforeTransfer = result.totals.NSDAP;
  if (transfer) {
    ensure(FACTIONS.includes(transfer.to) && transfer.to !== s.momentum, '只能向其他阵营转让选票');
    integer(
      transfer.amount,
      0,
      Math.floor(result.totals[s.momentum] / 2),
      '转让数最多为自身PV的一半（向下取整）',
    );
    result.totals[s.momentum] -= transfer.amount;
    result.totals[transfer.to] += transfer.amount;
    result.transfer = { from: s.momentum, ...transfer };
  }
  // Random permutation breaks only exact PV + MCS ties. It is persisted via rng.
  result.ranking = shuffle(s, [...FACTIONS]).sort(
    (a, b) => result.totals[b] - result.totals[a] || mcs(s, b) - mcs(s, a),
  );
  s.lastElection = result;
  for (const r of result.regions) s.pc[r.region] = { owner: r.winner, available: !!r.winner };
  s.pcLocked = [];
  if (!snap && s.electionCard) {
    s.discard.push(s.electionCard);
    delete s.electionCard;
  }
  if (!snap) s.electionCalled = false;
  const winner = result.ranking[0];
  record(
    s,
    `${snap ? '#117 提前选举' : '全国选举'}：${FACTIONS.map((f) => `${f} ${result.totals[f]} PV`).join(' / ')}。第一名 ${winner}。`,
  );
  if (winner !== 'Coalition' || s.scenarioEnding) {
    const rcSteals =
      winner === 'NSDAP' &&
      result.transfer?.from === 'RC' &&
      result.transfer.to === 'NSDAP' &&
      result.transfer.amount >= nsdapBeforeTransfer / 2;
    s.winner = rcSteals ? 'RC' : winner;
    s.winReason = rcSteals
      ? 'RC 转让的选票至少占 NSDAP 总PV的一半（3.2）'
      : s.scenarioEnding
        ? s.ruleset === 'tutorial-v1'
          ? '教程剧本终局选举'
          : s.scenario === 'fate'
            ? '共和国的命运：1933年最终选举'
            : '牌效实验局结束选举'
        : '全国选举胜利';
    s.phase = 'finished';
    record(s, `${s.winner} 获胜：${s.winReason}`);
  } else {
    s.article48 = !s.article48Removed;
    s.seats = { owner: result.ranking[1], available: true };
    if (snap) s.effects.unshift(...cleanSlate(s));
    else s.effects.push(...cleanSlate(s), { type: 'finish-round' });
  }
}
/** Rule 7.4: no regional piece bonuses, no PC/seat/Article48 refresh or clean slate. */
export function previewReferendum(s: GameState): ElectionResult {
  const normal = previewElection(s),
    base = zeros();
  const regions = normal.regions.map((r) => {
    const totals = zeros();
    if (!r.blocked)
      for (const sp of SPACES.filter((p) => p.region === r.region)) {
        const f = dominance(s, sp.id);
        if (f) totals[f] += sp.politicalValue;
      }
    for (const f of FACTIONS) base[f] += totals[f];
    return { ...r, totals, winner: uniqueLeader(totals) };
  });
  const totals = zeros();
  for (const f of FACTIONS) totals[f] = base[f] + normal.totals[f] - normal.base[f];
  return {
    regions,
    base,
    totals,
    ranking: [...FACTIONS].sort((a, b) => totals[b] - totals[a] || mcs(s, b) - mcs(s, a)),
  };
}
export function finishReferendum(s: GameState, transfer?: { to: Faction; amount: number }) {
  const result = previewReferendum(s);
  if (transfer) {
    ensure(FACTIONS.includes(transfer.to) && transfer.to !== s.momentum, '无效转让对象');
    integer(transfer.amount, 0, Math.floor(result.totals[s.momentum] / 2));
    result.totals[s.momentum] -= transfer.amount;
    result.totals[transfer.to] += transfer.amount;
    result.transfer = { from: s.momentum, ...transfer };
  }
  result.ranking = shuffle(s, [...FACTIONS]).sort(
    (a, b) => result.totals[b] - result.totals[a] || mcs(s, b) - mcs(s, a),
  );
  record(s, `#82 公投：${FACTIONS.map((f) => `${f} ${result.totals[f]} PV`).join(' / ')}。`);
  if (result.ranking[0] === 'RC') {
    s.winner = 'RC';
    s.winReason = '#82 全民公投获胜';
    s.phase = 'finished';
  }
}
export function checkSuddenVictory(s: GameState) {
  for (const f of s.order) {
    if (!s.victoryDeclared.includes(f)) continue;
    const reforms = s.pieces.filter((p) => p.kind === 'reform' && onMap(p)).length;
    const uprisings = s.pieces.filter(
      (p) => p.kind === 'strike' && p.side === 'uprising' && onMap(p),
    ).length;
    const berlin = supremacy(s, 'Berlin');
    const won =
      f === 'Coalition'
        ? reforms >= 4 || (reforms >= 3 && s.tracks.unity === 2)
        : f === 'KPD'
          ? uprisings >= 4 || (uprisings >= 3 && berlin === f)
          : f === 'NSDAP'
            ? mcs(s, f) > mcs(s, 'RC') &&
              (berlin === f ||
                SPACES.filter((p) => p.kind === 'City' && supremacy(s, p.id) === f).length >= 2)
            : mcs(s, f) >= 4 || (mcs(s, f) >= 3 && berlin === f);
    if (won) {
      s.winner = f;
      s.winReason = '即时胜利';
      s.phase = 'finished';
      record(s, `${f} 达成即时胜利。`);
      return;
    }
  }
  s.victoryDeclared = [];
  s.phase = s.electionCalled ? 'election' : 'timeline';
  record(s, '即时胜利检查完成，未有阵营获胜。');
}
