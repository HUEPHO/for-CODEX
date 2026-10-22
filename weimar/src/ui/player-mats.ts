import { HOLDING } from '../data/holdings.ts';
import { active, available, piecesAt, supply } from '../engine/rules.ts';
import { fixedStances } from '../engine/scenarios.ts';
import { FACTIONS } from '../engine/types.ts';
import type { Faction, GameState, Piece } from '../engine/types.ts';
import { counter, cubeArt, groupPieces, html, pieceArt, pieceName, tokenArt } from './pieces.ts';
import { pieceStatus } from './piece-status.ts';

// Pixel centers on the unmodified 700 × 500 original faction mats.
const MAT_HOLDINGS: Record<string, [number, number]> = {
  '@kpd-cadre:1': [176, 453],
  '@kpd-cadre:2': [88, 453],
  '@kpd-strike:1': [350, 278],
  '@kpd-strike:2': [438, 278],
  '@kpd-strike:3': [526, 278],
  '@kpd-strike:4': [612, 278],
  '@nsdap-cadre:1': [261, 425],
  '@nsdap-cadre:2': [174, 425],
  '@nsdap-cadre:3': [88, 425],
  '@nsdap-assassination:1': [525, 425],
  '@rc-economic:1': [198, 337],
  '@rc-economic:2': [284, 337],
  '@rc-economic:3': [371, 337],
  '@rc-economic:4': [457, 337],
  '@rc-clique:1': [198, 437],
  '@rc-clique:2': [284, 437],
  '@rc-assassination:1': [371, 437],
};
const NAMES: Record<Faction, string> = {
  Coalition: '民主联盟',
  KPD: '德国共产党',
  NSDAP: '国家社会主义工人党',
  RC: '激进保守派',
};
const VICTORY_POINTS: Record<Faction, [number, number]> = {
  Coalition: [487, 350],
  KPD: [612, 453],
  NSDAP: [612, 425],
  RC: [457, 437],
};

export function matPieces(s: GameState, faction: Faction) {
  return s.pieces.filter(
    (p) =>
      p.location === `reserve:${faction}` ||
      p.location === `mat:${faction}` ||
      (MAT_HOLDINGS[p.location] && HOLDING[p.location].group.startsWith(faction.toLowerCase())),
  );
}
export function matPieceAvailable(s: GameState, p: Piece, faction: Faction) {
  return p.location === `mat:${faction}` || available(s, p, faction);
}
function matMarker(asset: string, label: string, x: number, y: number, size = 64) {
  return `<g class="mat-marker" data-mat-marker="${asset}" transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 32})"><title>${html(label)}</title>${tokenArt(asset)}</g>`;
}
function trackText(s: GameState, f: Faction) {
  if (f === 'Coalition') return `团结：${['脆弱', '稳固', '强大'][s.tracks.unity]}`;
  if (f === 'RC') {
    const leverage = matPieces(s, f).filter((p) => p.kind === 'leverage');
    return `经济影响力：剩余 ${leverage.length} 枚杠杆，按从左到右取用`;
  }
  const stance = fixedStances(s) ? 0 : s.stance[f];
  return `立场：${stance < 0 ? '民主' : stance > 0 ? '革命' : '务实'}${stance ? ` ${stance > 0 ? '+' : ''}${stance}` : ''}${fixedStances(s) ? '（剧本固定，忽略立场解锁限制）' : ''}`;
}

export function playerMat(s: GameState, faction: Faction) {
  const pieces = matPieces(s, faction);
  const units = pieces.filter((p) => p.location === `reserve:${faction}`);
  const reserves = units.length <= 9 ? units.map((p) => [p]) : groupPieces(units);
  const unitLayer = reserves
    .map((g, i) =>
      counter(
        g,
        (faction === 'Coalition' ? 87 : 103) + (i % 5) * 87,
        94 + Math.floor(i / 5) * 85,
        64,
        pieceStatus(s, g[0]),
      ),
    )
    .join('');
  const support = pieces.filter((p) => p.location === `mat:${faction}`);
  const supportLayer = support
    .map((p, i) =>
      counter([p], 550 + (i % 3) * 42, 93 + Math.floor(i / 3) * 42, 36, pieceStatus(s, p)),
    )
    .join('');
  const holdingLayer = pieces
    .filter((p) => MAT_HOLDINGS[p.location])
    .map((p) => {
      const usable = matPieceAvailable(s, p, faction);
      const [x, y] = MAT_HOLDINGS[p.location];
      return `<g data-mat-holding="${p.location}" data-available="${usable}" class="${usable ? 'mat-available' : 'mat-locked'}"><title>${html(HOLDING[p.location].label)} · ${usable ? '可用' : '待解锁'}</title>${counter([p], x, y, 62, pieceStatus(s, p))}</g>`;
    })
    .join('');
  let track = '';
  if (faction === 'Coalition') {
    track = matMarker('unity', trackText(s, faction), [208, 300, 394][s.tracks.unity], 404);
  } else if (faction === 'KPD' || faction === 'NSDAP') {
    const stance = fixedStances(s) ? 0 : s.stance[faction];
    track = matMarker(
      `stance-${faction.toLowerCase()}`,
      trackText(s, faction),
      (faction === 'KPD' ? 88 : 86) + (stance + 3) * 87.3,
      faction === 'KPD' ? 367 : 338,
    );
  }
  const victory = s.victoryDeclared.includes(faction)
    ? ''
    : matMarker(
        `victory-${faction.toLowerCase()}`,
        '即时胜利标记尚未声明',
        ...VICTORY_POINTS[faction],
      );
  const strike =
    faction === 'KPD' && !s.generalStrike
      ? matMarker('general-strike', '总罢工尚未生效', 525, 453)
      : '';
  return `<div class="player-mat-surface"><img src="/assets/mats/${faction.toLowerCase()}.png" alt="${NAMES[faction]}原版玩家垫板" width="700" height="500" loading="lazy" draggable="false"/><svg viewBox="0 0 700 500" aria-label="${NAMES[faction]}垫板上的棋子与轨道">${unitLayer}${supportLayer}${holdingLayer}${track}${victory}${strike}</svg></div>`;
}
function inventory(s: GameState, faction: Faction) {
  const pieces = matPieces(s, faction);
  const list = (items: Piece[], describe: (group: Piece[]) => string) =>
    groupPieces(items)
      .map(
        (g) =>
          `<li><svg viewBox="0 0 32 32" aria-hidden="true">${pieceArt(g[0])}</svg><span>${html(pieceName(g[0]))}<small>${describe(g)}</small></span><b>×${g.length}</b></li>`,
      )
      .join('') || '<li class="muted">无</li>';
  const removed = s.pieces.filter((p) => p.owner === faction && p.location === 'removed');
  const boardSupply = s.pieces.filter(
    (p) =>
      !MAT_HOLDINGS[p.location] &&
      HOLDING[p.location] &&
      available(s, p, faction) &&
      (p.kind !== 'assassination' || faction === 'RC' || faction === 'NSDAP'),
  );
  return `<aside class="mat-inventory"><p class="mat-track-state">${trackText(s, faction)}</p>
    <p class="mat-cubes"><svg viewBox="0 0 18 18" aria-hidden="true">${cubeArt(faction)}</svg>可用影响力 <strong>${supply(s, faction)}</strong></p>
    <h3>垫板棋子 <span>${pieces.length}</span></h3><ul>${list(pieces, (g) => {
      const usable = g.filter((p) => matPieceAvailable(s, p, faction)).length;
      return `可用 ${usable}${usable < g.length ? ` · 待解锁 ${g.length - usable}` : ''}`;
    })}</ul>
    <details><summary>棋盘轨道上可取 · ${boardSupply.length}</summary><ul>${list(boardSupply, (g) => html([...new Set(g.map((p) => HOLDING[p.location].label))].join('、')))}</ul></details>
    ${removed.length ? `<details class="removed-pieces"><summary>已移出游戏 · ${removed.length}</summary><p>这些部队不计入可用或待解锁库存。</p><ul>${list(removed, () => '已移出游戏')}</ul></details>` : ''}
    <p class="mat-victory-state">${s.victoryDeclared.includes(faction) ? '已声明即时胜利，标记位于时间轴。' : '即时胜利标记尚未声明。'}${faction === 'KPD' ? ` 总罢工${s.generalStrike ? '生效，标记在主棋盘' : '未生效'}。` : ''}</p></aside>`;
}

export function reserveTrays(s: GameState, selected: Faction = active(s), open = false) {
  return `<details id="player-area" class="reserve-trays"${open ? ' open' : ''}><summary>玩家区 · 原版垫板与库存</summary>
    <div class="mat-tabs" role="group" aria-label="查看阵营垫板">${FACTIONS.map((f) => `<button type="button" class="${f}${selected === f ? ' selected' : ''}" data-mat-faction="${f}" aria-pressed="${selected === f}">${f === 'Coalition' ? '民主联盟' : f}${s.phase === 'action' && active(s) === f ? ' · 行动中' : ''}</button>`).join('')}<a class="mat-return" href="#turn-controls">返回行动面板 ↑</a></div>
    ${FACTIONS.map((f) => `<section class="player-mat-pane ${f}" data-faction="${f}" aria-label="${NAMES[f]}玩家区"${selected === f ? '' : ' hidden'}>${playerMat(s, f)}${inventory(s, f)}</section>`).join('')}
    <p class="mat-legend"><i class="legend-available"></i>绿框可用 · 淡色待解锁。悬停查看名称；团结、立场和胜利标记记录当前状态。</p></details>`;
}
