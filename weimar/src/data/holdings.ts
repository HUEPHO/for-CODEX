import type { Holding, PieceKind, Faction } from '../engine/types.ts';
export const HOLDINGS: Holding[] = [];
function group(
  group: string,
  label: string,
  kind: PieceKind,
  owner: Faction | null,
  levels: number[],
  track?: Holding['track'],
) {
  for (const level of levels)
    HOLDINGS.push({
      id: `@${group}:${level}`,
      label: `${label} ${level}`,
      kind,
      owner,
      group,
      level,
      track,
    });
}
group('reform', '进步 / 改革', 'reform', 'Coalition', [2, 3, 4, 5], 'progress');
group('progress', '进步 / 黄色杠杆', 'leverage', 'Coalition', [2, 3, 4, 5]);
group('reaction', '反动 / 黑色杠杆', 'leverage', 'RC', [2, 3, 4, 5]);
group('reaction-assassination', '反动 / 暗杀', 'assassination', null, [2], 'reaction');
group('reaction-cadre', '反动 / NSDAP 干部', 'cadre', 'NSDAP', [3, 4], 'reaction');
group('reaction-clique', '反动 / 保守派集团', 'clique', 'RC', [5], 'reaction');
group('mcs', '进步与反动 / 中产支持', 'mcs', null, [1, 2, 3, 4, 5]);
group('economy-mcs', '经济 / 中产支持', 'mcs', null, [1, 9], 'economy');
group('us', '美国协定 / 黄色杠杆', 'leverage', 'Coalition', [1, 2, 3, 4, 5], 'us');
group('ussr-yellow', '苏联协定 / 黄色杠杆', 'leverage', 'Coalition', [2, 4], 'ussr');
group('ussr-black', '苏联协定 / 黑色杠杆', 'leverage', 'RC', [1, 3], 'ussr');
group('ussr-cadre', '苏联协定 / KPD 干部', 'cadre', 'KPD', [2, 4, 5], 'ussr');
group('ussr-army', '苏联协定 / 国防军', 'reichswehr', 'Coalition', [1, 3, 5], 'ussr');
group('kpd-cadre', 'KPD / 干部', 'cadre', 'KPD', [1, 2]);
group('kpd-strike', 'KPD / 罢工', 'strike', 'KPD', [1, 2, 3, 4]);
group('nsdap-cadre', 'NSDAP / 干部', 'cadre', 'NSDAP', [1, 2, 3]);
group('nsdap-assassination', 'NSDAP / 暗杀', 'assassination', null, [1]);
group('rc-economic', 'RC / 经济影响力', 'leverage', 'RC', [1, 2, 3, 4]);
group('rc-clique', 'RC / 保守派集团', 'clique', 'RC', [1, 2]);
group('rc-assassination', 'RC / 暗杀', 'assassination', null, [1]);
export const HOLDING: Record<string, Holding> = Object.fromEntries(HOLDINGS.map((h) => [h.id, h]));
export const isDeployedTrack = (location: string) =>
  location.startsWith('@progress:') ||
  location.startsWith('@reaction:') ||
  location.startsWith('@economy:');
