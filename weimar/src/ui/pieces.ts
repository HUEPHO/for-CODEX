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

/** Original TTS faces. Only the physical tile outline is clipped. */
export function tokenArt(asset: string, round = false) {
  return `<image href="/assets/tokens/${asset}.png" x="1" y="1" width="30" height="30" style="clip-path:${round ? 'circle(48% at 50% 50%)' : 'inset(1% round 8%)'}"/>`;
}

/** Never inspect an unrevealed unit's allegiance. */
export function pieceArt(p: Pick<Piece, 'kind' | 'owner' | 'side' | 'revealed'>) {
  switch (p.kind) {
    case 'leverage':
      return tokenArt(`leverage-${p.owner === 'RC' ? 'rc' : 'coalition'}`, true);
    case 'cadre':
      return tokenArt(`cadre-${p.owner === 'NSDAP' ? 'nsdap' : 'kpd'}`, true);
    case 'reform':
      return tokenArt('reform');
    case 'strike':
      return tokenArt(p.side === 'uprising' ? 'uprising' : 'strike');
    case 'assassination':
      return tokenArt(`assassination-${p.side === 'right' ? 'right' : 'left'}`);
    case 'freikorps':
      return tokenArt(
        !p.revealed ? 'freikorps-hidden' : p.owner === 'RC' ? 'freikorps-rogue' : 'freikorps-loyal',
      );
    case 'reichswehr':
    case 'militia':
    case 'sa':
      return tokenArt(p.kind);
    // These components have no printed face: match the physical pawn/block.
    case 'mcs':
      return `<g stroke="#777" stroke-width=".7"><path d="M12 12q-4 6-4 16q8 4 16 0q0-10-4-16z" fill="#eee"/><circle cx="16" cy="7" r="5" fill="#fff"/><path d="M19 14q3 5 3 13q-2 2-4 2" fill="none" stroke="#ccc" stroke-width="2"/></g>`;
    case 'clique':
      return `<g stroke="#1c1b1b" stroke-width=".7" stroke-linejoin="round"><path d="M2 12l8-6 20 4-8 6z" fill="#3a3839"/><path d="M2 12l20 4v12L2 24z" fill="#242223"/><path d="M22 16l8-6v12l-8 6z" fill="#4b4849"/></g>`;
  }
}
export function cubeArt(faction: Faction) {
  return `<g stroke="#39352a" stroke-width=".65" stroke-linejoin="round"><path d="M1 5L6 1h10l-5 4z" fill="${COLORS[faction]}"/><path d="M1 5h10v11H1z" fill="${COLORS[faction]}"/><path d="M11 5l5-4v11l-5 4z" fill="${COLORS[faction]}"/><path d="M1 5L6 1h10l-5 4z" fill="white" opacity=".28"/><path d="M11 5l5-4v11l-5 4z" fill="black" opacity=".22"/></g>`;
}
/** Reuse the emblem portion of the original control token, without its caption. */
export function factionEmblem(faction: Faction, x: number, y: number, size: number) {
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="24 21 132 89" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><image href="/assets/tokens/control-${faction.toLowerCase()}.png" width="179" height="179"/></svg>`;
}
export interface CounterStatus {
  availability: 'none' | 'full' | 'left' | 'right';
  label?: string;
}
export function availabilityBorder(availability: CounterStatus['availability'], round = false) {
  if (availability === 'none') return '';
  const shape =
    availability === 'left'
      ? '<path d="M16 -1H3Q-1 -1 -1 3V29Q-1 33 3 33H16"/>'
      : availability === 'right'
        ? '<path d="M16 -1H29Q33 -1 33 3V29Q33 33 29 33H16"/>'
        : round
          ? '<circle cx="16" cy="16" r="17"/>'
          : '<rect x="-1" y="-1" width="34" height="34" rx="4"/>';
  return `<g class="availability-border" data-availability="${availability}" aria-hidden="true">${shape}</g>`;
}
export function groupPieces(pieces: Piece[]) {
  const groups = new Map<string, Piece[]>();
  for (const p of pieces) {
    const key = `${p.kind}:${p.owner}:${p.side ?? ''}:${!!p.revealed}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.values()];
}
export function counter(pieces: Piece[], x: number, y: number, size = 28, status?: CounterStatus) {
  const p = pieces[0];
  return `<g class="physical-piece" transform="translate(${x - size / 2} ${y - size / 2}) scale(${size / 32})" data-pieces="${html(pieces.map((v) => v.id).join(' '))}"><title>${html(pieceName(p))} ×${pieces.length}${status?.label ? ` · ${html(status.label)}` : ''}</title>${pieceArt(p)}${status ? availabilityBorder(status.availability, p.kind === 'cadre' || p.kind === 'leverage') : ''}${pieces.length > 1 ? `<circle cx="28" cy="4" r="7" fill="#fff9e9" stroke="#292c30"/><text x="28" y="7" text-anchor="middle" font-size="10" font-weight="800" fill="#202321">${pieces.length}</text>` : ''}</g>`;
}
