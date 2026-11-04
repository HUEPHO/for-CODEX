// Public pile sizes are already preserved by playerView: only the top identity
// and array length are used here. Never read the hidden entries behind a top.
export function publicCountrySupply(region={}){
 const available=Array.isArray(region.available)?region.available.filter(id=>typeof id==='string'):[];
 const piles=region.countryPiles;
 if(piles){
  const tops=['left','right'].flatMap(pile=>Array.isArray(piles[pile])&&piles[pile].length?[{id:piles[pile][0],pile,count:piles[pile].length}]:[]);
  const used=new Set();
  return available.map(id=>{
   const index=tops.findIndex((entry,i)=>entry.id===id&&!used.has(i));
   if(index<0)return {id,pile:null,count:null};
   used.add(index);return tops[index];
  });
 }
 // Older saves kept the hidden left-pile remainder in deck and a single right
 // face in available[1]. Reading its length also works with null-redacted decks.
 return available.map((id,index)=>({id,pile:index===0?'left':index===1?'right':null,count:index===0?(Array.isArray(region.deck)?region.deck.length+1:null):index===1?1:null}));
}
