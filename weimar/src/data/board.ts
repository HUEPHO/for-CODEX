import raw from './generated/spaces.json' with { type: 'json' };
import type { SpaceDefinition } from '../engine/types.ts';

// Connections are the printed black lines, NOT geographic border adjacency.
const links = [
  ['Schleswig-Holstein', 'Hamburg'],
  ['Schleswig-Holstein', 'Mecklenburg'],
  ['Hamburg', 'Provinz Hannover'],
  ['Oldenburg', 'Provinz Hannover'],
  ['Oldenburg', 'Provinz Westfalen'],
  ['Mecklenburg', 'Pommern'],
  ['Mecklenburg', 'Provinz Hannover'],
  ['Mecklenburg', 'Provinz Sachsen'],
  ['Pommern', 'Ostpreussen'],
  ['Pommern', 'Posen-Westpreussen'],
  ['Pommern', 'Brandenburg'],
  ['Ostpreussen', 'Posen-Westpreussen'],
  ['Posen-Westpreussen', 'Brandenburg'],
  ['Posen-Westpreussen', 'Niederschlesien'],
  ['Provinz Hannover', 'Provinz Sachsen'],
  ['Provinz Hannover', 'Waldeck and Lippe'],
  ['Provinz Hannover', 'Braunschweig and Anhalt'],
  ['Provinz Sachsen', 'Berlin'],
  ['Provinz Sachsen', 'Braunschweig and Anhalt'],
  ['Provinz Sachsen', 'Sachsen'],
  ['Berlin', 'Brandenburg'],
  ['Brandenburg', 'Sachsen'],
  ['Brandenburg', 'Niederschlesien'],
  ['Provinz Westfalen', 'Waldeck and Lippe'],
  ['Provinz Westfalen', 'Koeln'],
  ['Koeln', 'Rheinprovinz'],
  ['Waldeck and Lippe', 'Hessenprovinz'],
  ['Braunschweig and Anhalt', 'Hessenprovinz'],
  ['Braunschweig and Anhalt', 'Thueringen'],
  ['Sachsen', 'Niederschlesien'],
  ['Sachsen', 'Thueringen'],
  ['Sachsen', 'Bayern'],
  ['Niederschlesien', 'Oberschlesien'],
  ['Rheinprovinz', 'Hessenprovinz'],
  ['Rheinprovinz', 'Hessen'],
  ['Hessenprovinz', 'Hessen'],
  ['Hessen', 'Baden'],
  ['Hessen', 'Bayern'],
  ['Thueringen', 'Bayern'],
  ['Baden', 'Wuerttemberg'],
  ['Wuerttemberg', 'Bayern'],
  ['Bayern', 'Muenchen'],
];
const names = [
  '石勒苏益格—荷尔斯泰因',
  '梅克伦堡',
  '波美拉尼亚',
  '波森—西普鲁士',
  '东普鲁士',
  '奥尔登堡',
  '汉诺威省',
  '萨克森省',
  '勃兰登堡',
  '威斯特法伦省',
  '瓦尔德克与利珀',
  '不伦瑞克与安哈尔特',
  '萨克森',
  '下西里西亚',
  '上西里西亚',
  '莱茵省',
  '黑森省',
  '图林根',
  '黑森',
  '巴登',
  '符腾堡',
  '巴伐利亚',
  '汉堡',
  '柏林',
  '科隆',
  '慕尼黑',
];
export const SPACES: SpaceDefinition[] = raw.map((s, i) => ({
  ...s,
  nameZh: names[i],
  adjacent: links.filter((e) => e.includes(s.id)).map((e) => (e[0] === s.id ? e[1] : e[0])),
}));
export const SPACE = Object.fromEntries(SPACES.map((s) => [s.id, s]));
export const REGIONS = [
  'Hamburg',
  'Muenchen',
  'Koeln',
  'Berlin',
  'Bayern',
  'NorthernStates',
  'SouthernStates',
  'Preussen',
];
export const REGION_NAMES: Record<string, string> = {
  Hamburg: '汉堡',
  Muenchen: '慕尼黑',
  Koeln: '科隆',
  Berlin: '柏林',
  Bayern: '巴伐利亚',
  NorthernStates: '北部诸邦',
  SouthernStates: '南部诸邦',
  Preussen: '普鲁士诸省',
};
export function distance(from: string, to: string): number {
  if (!SPACE[from] || !SPACE[to]) return Infinity;
  const seen = new Set([from]);
  let frontier = [from],
    depth = 0;
  while (frontier.length) {
    if (frontier.includes(to)) return depth;
    frontier = frontier
      .flatMap((id) => SPACE[id].adjacent)
      .filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    depth++;
  }
  return Infinity;
}
