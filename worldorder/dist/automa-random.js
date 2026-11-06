import {AUTOMA_DECISIONS} from './automa-data.js';
import {AUTO_INFLUENCE_CARDS} from './auto-influence-data.js';
export function automaShuffle(values,rng=Math.random){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function drawAutomaCard(s,kind,owner,rng=Math.random){
 const pile=s.automaDecks[kind];if(!pile.deck.length){pile.deck=automaShuffle(pile.discard,rng);pile.discard=[];}
 const id=pile.deck.shift();pile.discard.push(id);s.automaDecks.drawCount++;
 if(owner){s.players[owner].automa[kind==='decision'?'lastDecision':'lastInfluence']=id;}
 s.automaDecks.history.push({round:s.round,kind,owner,id});s.automaDecks.history=s.automaDecks.history.slice(-40);
 return kind==='decision'?AUTOMA_DECISIONS[id-1]:AUTO_INFLUENCE_CARDS[id];
}
// Printed A/B and I/II/III randomizers. More options are partitioned recursively.
export function chooseAutoma(s,owner,options){
 if(!options.length)return null;if(options.length===1)return options[0];
 const card=drawAutomaCard(s,'decision',owner);
 if(options.length===2)return options[card.binary==='A'?0:1];
 if(options.length===3)return options[card.ternary-1];
 const middle=Math.ceil(options.length/2);return chooseAutoma(s,owner,card.binary==='A'?options.slice(0,middle):options.slice(middle));
}
export function chooseAutomaRegion(s,owner,regions){
 if(!regions.length)return null;
 // Every region occurs in the printed deck for each power; rejected cards are
 // discarded, so exhausting the deck uses the standard reshuffle rule.
 while(true){const card=drawAutomaCard(s,'influence',owner),region=card.rows.find(row=>row.owner===owner).region;if(regions.includes(region))return region;}
}
