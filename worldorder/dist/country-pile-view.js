import {RESEARCH_DATA} from './research-data.js';

// The left pile exposes its contents, never its draw order. Equal levels use a
// stable identity tie-break so a client cannot infer order from the projection.
export function countryPileContents(region){
 if(region.publicCountryPiles)return region.publicCountryPiles;
 const piles=region.countryPiles||{left:[region.available?.[0],...(region.deck||[])].filter(Boolean),right:[region.available?.[1]].filter(Boolean)};
 return {
  left:piles.left.filter(Boolean).slice().sort((a,b)=>(RESEARCH_DATA[a]?.countryValue||0)-(RESEARCH_DATA[b]?.countryValue||0)||a.localeCompare(b)),
  right:piles.right.filter(Boolean).slice(),
 };
}
