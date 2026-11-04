export function countryPiles(r){if(!r.countryPiles)r.countryPiles={left:[r.available[0],...r.deck].filter(Boolean),right:r.available[1]?[r.available[1]]:[]};return r.countryPiles;}
export function syncCountries(r){const piles=countryPiles(r);if(!piles.left.length&&piles.right.length>1)piles.left.push(piles.right.shift());if(!piles.right.length&&piles.left.length>1)piles.right.push(piles.left.shift());r.available=[piles.left[0],piles.right[0]].filter(Boolean);r.deck=piles.left.slice(1);}
export function acquireCountry(r,id){const piles=countryPiles(r);const pile=[piles.left,piles.right].find(p=>p[0]===id);if(!pile)throw Error('国家牌已不在展示区');pile.shift();syncCountries(r);}

// Both piles may contain buried cards. r.deck only mirrors the left pile, so
// searches and reshuffles must use the complete pool without mutating previews.
export function regionCountries(r){if(!r)return [];return r.countryPiles?[...r.countryPiles.left,...r.countryPiles.right]:[r.available[0],...r.deck,r.available[1]].filter(Boolean);}
export function acquireSearchedCountry(r,id,rng=Math.random){
 const pool=regionCountries(r),index=pool.indexOf(id);if(index<0)throw Error('该国已不在所选地区的国家牌中');pool.splice(index,1);
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 const [first,second,...rest]=pool;r.countryPiles={left:[first,...rest].filter(Boolean),right:second?[second]:[]};syncCountries(r);
}

export function revealCountry(r){const piles=countryPiles(r);if(piles.left.length)piles.right.unshift(piles.left.shift());if(!piles.left.length&&piles.right.length){piles.left=piles.right;piles.right=[];if(piles.left.length>1)piles.right.push(piles.left.shift());}syncCountries(r);}
