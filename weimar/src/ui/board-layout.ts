// Coordinates are measured on the original Chinese board, in a 1800 × 1167 viewBox.
// Keep the supplied board.webp intact; only the separate pieces/interaction layer moves.
export interface BoardArea {
  x: number;
  y: number;
  w: number;
  h: number;
  city?: boolean;
  valueLeft?: boolean;
}
export const BOARD_AREAS: Record<string, BoardArea> = {
  'Schleswig-Holstein': { x: 570, y: 213, w: 80, h: 70, valueLeft: true },
  Mecklenburg: { x: 740, y: 278, w: 80, h: 68 },
  Pommern: { x: 928, y: 236, w: 80, h: 68 },
  'Posen-Westpreussen': { x: 1072, y: 280, w: 79, h: 66 },
  Ostpreussen: { x: 1339, y: 150, w: 94, h: 84 },
  Oldenburg: { x: 416, y: 352, w: 80, h: 70 },
  'Provinz Hannover': { x: 523, y: 345, w: 103, h: 75, valueLeft: true },
  'Provinz Sachsen': { x: 750, y: 373, w: 108, h: 76, valueLeft: true },
  Brandenburg: { x: 953, y: 373, w: 86, h: 76 },
  'Provinz Westfalen': { x: 382, y: 456, w: 165, h: 128 },
  'Waldeck and Lippe': { x: 587, y: 454, w: 81, h: 65 },
  'Braunschweig and Anhalt': { x: 727, y: 472, w: 80, h: 66 },
  Sachsen: { x: 860, y: 500, w: 95, h: 81 },
  Niederschlesien: { x: 1085, y: 474, w: 98, h: 80 },
  Oberschlesien: { x: 1248, y: 526, w: 81, h: 66 },
  Rheinprovinz: { x: 343, y: 629, w: 165, h: 128, valueLeft: true },
  Hessenprovinz: { x: 592, y: 546, w: 98, h: 78 },
  Thueringen: { x: 733, y: 579, w: 81, h: 68 },
  Hessen: { x: 593, y: 659, w: 82, h: 69 },
  Baden: { x: 435, y: 896, w: 97, h: 77, valueLeft: true },
  Wuerttemberg: { x: 568, y: 801, w: 95, h: 80 },
  Bayern: { x: 695, y: 763, w: 165, h: 127, valueLeft: true },
  Hamburg: { x: 580, y: 265, w: 108, h: 108, city: true },
  Berlin: { x: 832, y: 329, w: 128, h: 128, city: true },
  Koeln: { x: 326, y: 548, w: 108, h: 108, city: true },
  Muenchen: { x: 727, y: 875, w: 108, h: 108, city: true },
};
export const PC_ANCHORS: Record<string, [number, number]> = {
  Hamburg: [521, 252],
  NorthernStates: [728, 200],
  Berlin: [860, 211],
  Preussen: [1240, 344],
  Koeln: [282, 555],
  SouthernStates: [362, 812],
  Bayern: [911, 791],
  Muenchen: [696, 979],
};
export const economyX = (level: number) => 1415 + (level - 1) * 39.5;
export const dealsX = (level: number) => 1153 + (level - 1) * 46;
export const progressY = (level: number) => 1040 - (level - 1) * 44.5;

export function holdingPoint(location: string): [number, number] | undefined {
  const [group, value] = location.split(':');
  const n = Number(value);
  switch (group) {
    case '@reform':
      return [1417, progressY(n)];
    case '@progress':
      return [1529, progressY(n)];
    case '@reaction':
      return [1607, progressY(n)];
    case '@mcs':
      return [1567, progressY(n)];
    case '@reaction-assassination':
    case '@reaction-cadre':
    case '@reaction-clique':
      return [1733, progressY(n)];
    case '@economy-mcs':
      return [n === 1 ? 1417 : 1728, 519];
    case '@economy':
      return [economyX(n), 608];
    case '@us':
      return [dealsX(n), 748];
    case '@ussr-yellow':
    case '@ussr-army':
      return [dealsX(n), 944];
    case '@ussr-black':
    case '@ussr-cadre':
      return [dealsX(n), 1033];
    default:
      return undefined;
  }
}
