export const DEBUG_CARD_TYPES=new Set(['ability','asset']);

// The catalogue contains both physical copies of market cards. Debug only
// needs one picker entry per printed card; the normal supply stays intact.
export function debugCardCatalog(cards){
 const seen=new Set();
 return cards.filter(card=>{
  if(!DEBUG_CARD_TYPES.has(card.type))return false;
  const key=JSON.stringify([card.type,card.module,card.owner,card.name]);
  if(seen.has(key))return false;
  seen.add(key);return true;
 });
}
