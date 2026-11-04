// The six printed right-arrow cards, visually checked against all 48 supplied
// starter faces on 2026-09-21. Same-name copies can have different arrow marks.
export const BEGINNER_SOURCE_IDS={
 US:[44103,44310,44600,44806,45007,45204],
 CN:[41701,41800,41907,42005,42111,42703],
 EU:[45306,45407,45508,45911,46204,46403],
 RU:[42911,43001,43109,43205,43306,43403],
};
export function beginnerOpening(starters,owner){
 const sources=BEGINNER_SOURCE_IDS[owner];
 const hand=sources?.map(source=>starters.find(c=>c.sourceCardId===source)?.id);
 if(!hand||hand.length!==6||hand.some(id=>!id)||new Set(hand).size!==6||starters.length!==12)throw Error('新手起始牌目录不完整：'+owner);
 return {hand,deck:starters.filter(c=>!hand.includes(c.id)).map(c=>c.id)};
}
