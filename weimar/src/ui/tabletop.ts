import { CARD } from '../data/cards.ts';
import { SPACES, SPACE, REGION_NAMES } from '../data/board.ts';
import { FACTIONS } from '../engine/types.ts';
import type { Action, GameState } from '../engine/types.ts';
import { dominance, piecesAt, supremacy } from '../engine/rules.ts';
import {
  BOARD_AREAS,
  PC_ANCHORS,
  dealsX,
  economyX,
  holdingPoint,
  progressY,
} from './board-layout.ts';
import {
  PIECE_NAMES,
  counter,
  cubeArt,
  groupPieces,
  html,
  pieceArt,
  pieceName,
  tokenArt,
} from './pieces.ts';

export function actionSpace(action: Action): string | undefined {
  return 'space' in action
    ? action.space
    : 'to' in action && SPACE[action.to]
      ? action.to
      : undefined;
}
function marker(asset: string, label: string, x: number, y: number, size = 34, round = false) {
  return `<g class="board-marker" transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 32})"><title>${html(label)}</title>${tokenArt(asset, round)}</g>`;
}
function spaceLayer(s: GameState, id: string, selected: string, targets: Set<string>) {
  const area = BOARD_AREAS[id],
    sp = SPACE[id];
  const { x, y, w, h, city } = area;
  const count = FACTIONS.reduce((n, f) => n + s.influence[id][f], 0);
  const title = `${sp.nameZh}：${FACTIONS.map((f) => `${f} ${s.influence[id][f]}`).join('，')}；棋子${piecesAt(s, id).length}枚`;
  const shape = city
    ? `<circle class="space-hit" cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2}"/>`
    : `<rect class="space-hit" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>`;
  const cubes = FACTIONS.flatMap((f) => Array.from({ length: s.influence[id][f] }, () => f));
  const cols = Math.max(3, Math.floor((w - (city ? 26 : 28)) / 15));
  const cubeX = x + (city ? 18 : 7),
    cubeY = y + (city ? 39 : 19);
  const influence = cubes
    .map(
      (f, i) =>
        `<g class="influence-piece" data-faction="${f}" transform="translate(${cubeX + (i % cols) * 15} ${cubeY + Math.floor(i / cols) * 16})">${cubeArt(f)}</g>`,
    )
    .join('');
  const groups = groupPieces(piecesAt(s, id));
  const tokenCols = Math.max(3, Math.floor((w - 12) / 25));
  const tokenRows = Math.ceil(groups.length / tokenCols);
  const size = tokenRows > 2 ? 20 : 25;
  const tokens = groups
    .map((g, i) =>
      counter(
        g,
        x + (city ? 20 : 15) + (i % tokenCols) * size,
        y + h - 15 - (tokenRows - 1 - Math.floor(i / tokenCols)) * size,
        size,
      ),
    )
    .join('');
  return `<g class="map-space${id === selected ? ' is-selected' : ''}${targets.has(id) ? ' is-target' : ''}" data-space="${html(id)}" role="button" tabindex="0" aria-label="${html(title)}" aria-pressed="${id === selected}"><title>${html(title)}</title>${shape}<g class="space-pieces" aria-hidden="true">${influence}${tokens}</g>${count > sp.population ? `<text x="${x + w - 3}" y="${y + 15}" fill="#aa211c">!</text>` : ''}</g>`;
}
function trackLayer(s: GameState) {
  const pieces = s.pieces
    .flatMap((p) => {
      const point = holdingPoint(p.location);
      return point ? [counter([p], ...point, 29)] : [];
    })
    .join('');
  const pc = Object.entries(PC_ANCHORS)
    .map(([region, [x, y]]) => {
      const control = s.pc[region];
      if (!control.owner) return '';
      return `<g opacity="${control.available ? 1 : 0.46}"><title>${html(REGION_NAMES[region])}：${control.owner} ${control.available ? '议会牌可用' : '议会牌已使用'}</title>${marker(`control-${control.owner.toLowerCase()}`, control.owner, x, y, 38)}</g>`;
    })
    .join('');
  const columns = Math.max(1, Math.ceil(Math.sqrt(s.lingering.length * 2.4)));
  const rows = Math.max(1, Math.ceil(s.lingering.length / columns));
  const cardHeight = Math.min(78, 132 / rows, (340 / columns) * 1.4);
  const cardWidth = cardHeight / 1.4;
  const events = s.lingering
    .map(
      (c, i) =>
        `<g data-card-preview="${c.card}" role="button" tabindex="0" aria-label="持续事件 ${html(CARD[c.card].name)}"><title>${html(CARD[c.card].name)}</title><image href="${CARD[c.card].image}" x="${18 + (i % columns) * (cardWidth + 3)}" y="${927 + Math.floor(i / columns) * cardHeight}" width="${cardWidth}" height="${cardHeight - 3}"/></g>`,
    )
    .join('');
  const turnOrder = s.order
    .map((f, i) =>
      marker(`order-${f.toLowerCase()}`, `${f} 行动顺序`, 1596 + i * 46.5, 752, 34, true),
    )
    .join('');
  const phaseIndex = {
    action: 0,
    'sudden-victory': 1,
    election: 2,
    timeline: 3,
    upkeep: 4,
    order: 4,
    finished: 2,
  }[s.phase];
  const declarations = s.victoryDeclared
    .map((f, i) =>
      marker(
        `victory-${f.toLowerCase()}`,
        `${f} 已声明即时胜利`,
        597 + (s.year - 1919) * 69.5 + (i % 2) * 30,
        120 + Math.floor(i / 2) * 30,
        29,
      ),
    )
    .join('');
  return `${pieces}${pc}${turnOrder}${events}${declarations}
    ${marker('economy', '经济', economyX(s.tracks.economy), 566)}
    ${marker('us', '美国交易', dealsX(s.tracks.us), 795)}
    ${marker('ussr', '苏联交易', dealsX(s.tracks.ussr), 987)}
    ${marker('progress', '进步', 1488, progressY(s.tracks.progress), 30)}
    ${marker('reaction', '反动', 1652, progressY(s.tracks.reaction), 30)}
    ${marker('momentum', '势头', 1407 + FACTIONS.indexOf(s.momentum) * 45.5, 750, 30, true)}
    ${marker(`year-${s.half === 'early' ? 'early' : 'late'}`, s.half === 'early' ? '上半年' : '下半年', 629 + (s.year - 1919) * 69.5, 85, 30)}
    ${marker('sequence', '阶段', 57 + phaseIndex * 50.5, 33, 32)}
    ${s.tracks.dollarDependence ? `<g>${marker('dollar-dependence', `美元依赖 ×${s.tracks.dollarDependence}`, 1638, 518, 36)}<text x="1654" y="507" font-size="12" font-weight="800" stroke="#fff" stroke-width="3" paint-order="stroke">${s.tracks.dollarDependence}</text></g>` : ''}
    ${s.generalStrike ? marker('general-strike', '总罢工生效', 1464, 647, 42) : ''}`;
}
export function tabletop(
  s: GameState,
  selected: string,
  targets: Action[],
  zoom: number,
  focus = false,
) {
  const spaces = new Set(targets.map(actionSpace).filter((id): id is string => !!id));
  return `<div class="board-tools"><div><strong>游戏棋盘</strong><span>点地区查看 · 金色边框为当前行动的合法目标</span></div><div class="zoom-tools"><button id="board-zoom-out" aria-label="缩小棋盘"${zoom <= 1 ? ' disabled' : ''}>−</button><span>${Math.round(zoom * 100)}%</span><button id="board-zoom-in" aria-label="放大棋盘"${zoom >= 2.5 ? ' disabled' : ''}>＋</button><button id="board-fit">适应窗口</button><button id="board-focus">${focus ? '返回全桌' : '专注棋盘'}</button></div></div>
    <div class="board-viewport" id="board-viewport"><div class="board-surface" style="--board-zoom:${zoom}">
    <img class="original-board" src="/assets/board.webp" alt="原版中文游戏棋盘，独立棋子层显示当前局面" draggable="false" />
    <svg class="board-overlay" viewBox="0 0 1800 1167.1875" aria-label="当前棋盘局面">
      ${SPACES.map((sp) => spaceLayer(s, sp.id, selected, spaces)).join('')}
      <g class="track-pieces">${trackLayer(s)}</g>
    </svg></div></div>
    <details class="piece-legend"><summary>棋子图例与摆放说明</summary><div>${Object.entries(
      PIECE_NAMES,
    )
      .map(
        ([kind, name]) =>
          `<span><svg viewBox="0 0 32 32" aria-hidden="true">${pieceArt({ kind: kind as keyof typeof PIECE_NAMES, owner: kind === 'mcs' ? null : ['cadre', 'strike', 'militia'].includes(kind) ? 'KPD' : kind === 'sa' ? 'NSDAP' : kind === 'clique' ? 'RC' : 'Coalition' })}</svg>${name}</span>`,
      )
      .join(
        '',
      )}</div><p>使用原版标记贴图；中产支持为白色棋子，保守派集团为黑色方块。同类叠放时右上角显示数量；自由军团正面不带 F，揭示后显示带 F 的忠诚面。棋子与轨道随局面更新。</p></details>`;
}
export function selectedSpacePanel(s: GameState, selected: string) {
  const sp = SPACE[selected],
    pieces = groupPieces(piecesAt(s, selected));
  return `<section class="selected-space" aria-label="选中地区详情"><div class="selected-space-heading"><div><span>${html(REGION_NAMES[sp.region])}</span><h2>${sp.nameZh}</h2></div><span>人口 ${Object.values(s.influence[selected]).reduce((a, b) => a + b, 0)}/${sp.population}<br/>PV ${sp.politicalValue}</span></div>
    <div class="space-influence">${FACTIONS.map((f) => `<span class="${f}"><svg viewBox="0 0 18 18" aria-hidden="true">${cubeArt(f)}</svg>${f === 'Coalition' ? '联盟' : f} <b>${s.influence[selected][f]}</b></span>`).join('')}</div>
    <details class="space-unit-list"><summary>部队与标记 · ${piecesAt(s, selected).length}枚</summary>${pieces.length ? pieces.map((group) => `<div><svg viewBox="0 0 32 32" aria-hidden="true">${pieceArt(group[0])}</svg><span>${html(pieceName(group[0]))}</span><b>×${group.length}</b></div>`).join('') : '<p>没有部队或功能标记</p>'}</details>
    <p class="space-control">领导权 ${dominance(s, selected) ?? '—'} · 军事优势 ${supremacy(s, selected) ?? '—'}<br/>议会 ${s.pc[sp.region].owner ?? '—'}</p></section>`;
}
export { reserveTrays } from './player-mats.ts';
