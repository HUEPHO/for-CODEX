import { REGION_NAMES } from '../data/board.ts';
import { previewElection } from '../engine/elections.ts';
import { FACTIONS } from '../engine/types.ts';
import type { ElectionResult, FactionValues, GameState } from '../engine/types.ts';
import { COLORS, html, tokenArt } from './pieces.ts';

function scoreRow(id: string, label: string, totals: FactionValues, y: number, blocked = false) {
  const highest = Math.max(...FACTIONS.map((f) => totals[f]));
  const leaders = FACTIONS.filter((f) => highest > 0 && totals[f] === highest);
  const national = id === 'national';
  return `<g class="pv-row${national ? ' pv-national-row' : ''}${blocked ? ' pv-blocked-row' : ''}" data-pv-region="${id}" role="row" transform="translate(0 ${y})">
    <rect class="pv-row-background" x="1" width="330" height="${national ? 25 : 22}"/>
    <text class="pv-region-name" x="10" y="15.5" role="rowheader">${html(label)}${blocked ? '<tspan class="pv-blocked-label" dx="4">停选</tspan>' : ''}</text>
    ${FACTIONS.map((f, i) => {
      const leading = !blocked && leaders.includes(f);
      const label = `${f}：${totals[f]} PV${blocked ? '（暗杀或起义导致区域停选）' : leading ? `（${leaders.length > 1 ? '并列' : ''}最高）` : ''}`;
      const x = 146 + i * 50;
      return `<g class="pv-cell${leading ? ' is-highest' : ''}" data-pv-faction="${f}" data-pv="${totals[f]}" role="cell" aria-label="${label}"><title>${label}</title>
        ${leading ? `<rect class="pv-highest-fill" x="${x - 22}" y="2" width="44" height="19" rx="3"/>` : ''}
        <text class="pv-value" x="${x - (leading ? 5 : 0)}" y="16">${totals[f]}</text>${leading ? `<text class="pv-star" x="${x + 12}" y="15">★</text>` : ''}</g>`;
    }).join('')}
  </g>`;
}

function regionalTable(election: ElectionResult) {
  // Cover the printed election-region legend, clear of East Prussia and the economy track.
  return `<g class="pv-table" transform="translate(1440 140)" role="table" aria-label="实时区域与全国PV">
    <title>各区域按当前局面计票；全国总PV包含势头、中产支持、进步及生效事件／剧本修正，不含选举时自愿转让。</title>
    <rect class="pv-table-paper" width="332" height="272" rx="4"/>
    <path class="pv-table-heading" d="M4 0H328Q332 0 332 4V27H0V4Q0 0 4 0Z"/>
    <text class="pv-table-title" x="10" y="19">区域 PV</text><text class="pv-live-label" x="322" y="18">实时计票</text>
    <g class="pv-column-headings" role="row"><text x="10" y="44" role="columnheader">选举区域</text>
      ${FACTIONS.map((f, i) => `<g><rect x="${124 + i * 50}" y="29" width="44" height="3" fill="${COLORS[f]}"/><text x="${146 + i * 50}" y="45" text-anchor="middle" role="columnheader">${f === 'Coalition' ? '联盟' : f}</text></g>`).join('')}
    </g>
    ${election.regions.map((r, i) => scoreRow(r.region, REGION_NAMES[r.region], r.totals, 51 + i * 22, r.blocked)).join('')}
    ${scoreRow('national', '全国总 PV', election.totals, 227)}
    <text class="pv-table-note" x="10" y="265">★ 最高 · 并列同标 · 全国含加成</text>
  </g>`;
}

function nationalTrack(totals: FactionValues) {
  const tick = (value: number) => Math.max(0, Math.min(40, value));
  return `<g class="pv-track" role="group" aria-label="全国总PV轨道">${FACTIONS.map((f) => {
    const value = totals[f],
      position = tick(value);
    const group = FACTIONS.filter((other) => tick(totals[other]) === position);
    const index = group.indexOf(f);
    const anchor = 53.5 + position * 42.4;
    const size = group.length === 1 ? 26 : 20;
    const x = anchor + (group.length === 1 ? 0 : index % 2 ? 10 : -10);
    const y = group.length <= 2 ? 1096 : 1080 + Math.floor(index / 2) * 20;
    const outside = value !== position;
    const label = `${f} 全国总PV：${value}${outside ? '（超出印刷0–40刻度，端点下方显示实际值）' : ''}`;
    return `<g class="pv-score-marker" data-pv-faction="${f}" data-pv="${value}" data-pv-tick="${position}" role="img" aria-label="${label}"><title>${label}</title>
      <path class="pv-score-pointer" d="M${x} ${y + size / 2 - 1}L${anchor} 1112" stroke="${COLORS[f]}"/>
      <g transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 32})">${tokenArt(`pv-${f.toLowerCase()}`)}</g>
      ${outside ? `<g class="pv-overflow-value" transform="translate(${x} ${group.length <= 2 ? 1152 : 1145 + Math.floor(index / 2) * 14})"><rect x="-11" y="-7" width="22" height="14" rx="3"/><text y="4">${value}</text></g>` : ''}
    </g>`;
  }).join('')}</g>`;
}

/** One live election preview drives both displays; no election or state mutation. */
export function pvBoard(s: GameState) {
  const election = previewElection(s);
  return `${regionalTable(election)}${nationalTrack(election.totals)}`;
}
