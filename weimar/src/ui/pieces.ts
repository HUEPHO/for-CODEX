import type { Faction, Piece, PieceKind } from '../engine/types.ts';

export const html = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export const COLORS: Record<Faction | 'neutral', string> = {
  Coalition: '#ecd13b',
  KPD: '#d82f35',
  NSDAP: '#ad7045',
  RC: '#292c30',
  neutral: '#eee8d8',
};
export const PIECE_NAMES: Record<PieceKind, string> = {
  leverage: '杠杆',
  cadre: '干部',
  reform: '改革',
  strike: '罢工',
  assassination: '暗杀',
  clique: '保守派集团',
  mcs: '中产支持',
  freikorps: '自由军团',
  reichswehr: '国防军',
  militia: '工人民兵',
  sa: '冲锋队',
};
export function pieceName(p: Piece) {
  return `${p.owner ?? '中立'} ${p.kind === 'strike' && p.side === 'uprising' ? '起义' : PIECE_NAMES[p.kind]}${p.kind === 'freikorps' ? (p.revealed ? '（已揭示）' : '（未揭示）') : ''}${p.kind === 'assassination' && p.side ? `（${p.side === 'left' ? '左翼' : '右翼'}）` : ''}`;
}

/** Original vector drawings. Never inspect an unrevealed unit's allegiance. */
export function pieceArt(p: Pick<Piece, 'kind' | 'owner' | 'side' | 'revealed'>) {
  const color = COLORS[p.owner ?? 'neutral'];
  const ink = p.owner === 'RC' || p.owner === 'KPD' ? '#fff7dc' : '#202321';
  const round = ['leverage', 'mcs', 'clique'].includes(p.kind);
  const base = round
    ? `<circle cx="16" cy="17" r="14" fill="#000" opacity=".28"/><circle cx="16" cy="15" r="13.5" fill="${color}" stroke="#faf3d8" stroke-width="1.6"/><circle cx="16" cy="15" r="11.3" fill="none" stroke="${ink}" stroke-width=".6"/>`
    : `<rect x="2" y="3" width="29" height="29" rx="3" fill="#000" opacity=".28"/><rect x="1" y="1" width="29" height="29" rx="3" fill="${color}" stroke="#faf3d8" stroke-width="1.5"/><rect x="3.3" y="3.3" width="24.4" height="24.4" rx="1.5" fill="none" stroke="${ink}" stroke-width=".6"/>`;
  const text = (label: string, y = 20, size = 13) =>
    `<text x="15.5" y="${y}" text-anchor="middle" fill="${ink}" font-size="${size}" font-weight="800" font-family="Arial,Microsoft YaHei,sans-serif">${label}</text>`;
  let icon: string;
  switch (p.kind) {
    case 'leverage':
      icon = `<path d="M8 21L22 10M8 21h7M22 10v7M9 11h6" fill="none" stroke="${ink}" stroke-width="2.4"/>`;
      break;
    case 'mcs':
      icon = `<g fill="${ink}"><circle cx="16" cy="10" r="3"/><circle cx="9" cy="13" r="2.5"/><circle cx="23" cy="13" r="2.5"/><path d="M11 23v-5q5-8 10 0v5zM5 22v-5q4-4 7 0v5zM20 22v-5q4-4 7 0v5z"/></g>`;
      break;
    case 'clique':
      icon = `<g fill="none" stroke="${ink}" stroke-width="2"><circle cx="12" cy="13" r="4"/><circle cx="20" cy="13" r="4"/><circle cx="16" cy="20" r="4"/></g>`;
      break;
    case 'cadre':
      icon = `<path d="M9 25V7h14l-4 5 4 5H10" fill="none" stroke="${ink}" stroke-width="2"/>`;
      break;
    case 'reform':
      icon = `<path d="M8 7h16v18H8zM11 11h10M11 15h10M11 19h7" fill="none" stroke="${ink}" stroke-width="1.6"/>`;
      break;
    case 'assassination':
      icon = `<circle cx="16" cy="15" r="7" fill="none" stroke="${ink}" stroke-width="1.8"/><path d="M16 4v22M5 15h22" stroke="${ink}" stroke-width="1.5"/>`;
      break;
    case 'strike':
      icon = text(p.side === 'uprising' ? '起' : '罢');
      break;
    case 'freikorps':
      icon = `<path d="M8 15q0-9 8-9t8 9H6v3h19v-3M16 7v8" fill="${ink}" stroke="${ink}" stroke-width="1.5"/>${text(p.revealed ? 'FK' : '?', 26, 9)}`;
      break;
    case 'reichswehr':
      icon = `<path d="M7 7h18v12H7zM7 7l18 12M25 7L7 19" fill="none" stroke="${ink}" stroke-width="1.6"/>${text('RW', 27, 8)}`;
      break;
    case 'militia':
      icon = `<path d="M9 8l13 14M22 8L9 22M6 9l4-4M21 5l5 5" stroke="${ink}" stroke-width="2.8"/>`;
      break;
    case 'sa':
      icon = `<path d="M10 6h12l-5 8h6L11 27l4-11H8z" fill="${ink}"/>`;
      break;
  }
  return base + icon;
}
export function cubeArt(faction: Faction) {
  return `<g stroke="#39352a" stroke-width=".65" stroke-linejoin="round"><path d="M1 5L6 1h10l-5 4z" fill="${COLORS[faction]}"/><path d="M1 5h10v11H1z" fill="${COLORS[faction]}"/><path d="M11 5l5-4v11l-5 4z" fill="${COLORS[faction]}"/><path d="M1 5L6 1h10l-5 4z" fill="white" opacity=".28"/><path d="M11 5l5-4v11l-5 4z" fill="black" opacity=".22"/></g>`;
}
export function groupPieces(pieces: Piece[]) {
  const groups = new Map<string, Piece[]>();
  for (const p of pieces) {
    const key = `${p.kind}:${p.owner}:${p.side ?? ''}:${!!p.revealed}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.values()];
}
export function counter(pieces: Piece[], x: number, y: number, size = 28) {
  const p = pieces[0];
  return `<g class="physical-piece" transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 32})" data-pieces="${html(pieces.map((v) => v.id).join(' '))}"><title>${html(pieceName(p))} ×${pieces.length}</title>${pieceArt(p)}${pieces.length > 1 ? `<circle cx="28" cy="4" r="7" fill="#fff9e9" stroke="#292c30"/><text x="28" y="7" text-anchor="middle" font-size="10" font-weight="800" fill="#202321">${pieces.length}</text>` : ''}</g>`;
}
