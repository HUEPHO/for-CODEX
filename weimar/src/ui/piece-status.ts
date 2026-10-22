import { HOLDING, isDeployedTrack } from '../data/holdings.ts';
import { available } from '../engine/rules.ts';
import { FACTIONS } from '../engine/types.ts';
import type { GameState, Piece } from '../engine/types.ts';
import type { CounterStatus } from './pieces.ts';

/** Public supply availability, independent of whose turn it is. */
export function pieceStatus(s: GameState, p: Piece): CounterStatus {
  if (HOLDING[p.location]?.group === 'mcs') {
    const left = available(s, p, 'Coalition');
    const right = available(s, p, 'RC');
    return {
      availability: left && right ? 'full' : left ? 'left' : right ? 'right' : 'none',
      label: `进步侧（联盟 / KPD）${left ? '可用' : '待解锁'}；反动侧（NSDAP / RC）${right ? '可用' : '待解锁'}`,
    };
  }
  const usable = p.location.startsWith('mat:') || FACTIONS.some((f) => available(s, p, f));
  return {
    availability: usable ? 'full' : 'none',
    label: usable
      ? '可用'
      : HOLDING[p.location] && !isDeployedTrack(p.location)
        ? '待解锁'
        : '已部署',
  };
}
