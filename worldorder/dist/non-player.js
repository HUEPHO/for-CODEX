import {humanPlayers,isNonPlayer,isBasicNonPlayer,POWER_IDS} from './player-configuration.js';
import {AUTO_INFLUENCE_CARDS} from './auto-influence-data.js';
import {AREAS,emptyPermanentSlot,syncInfluence} from './world.js';

export function placeNonPlayerInfluence(s,owner,region){
 const r=s.regions[region],slot=emptyPermanentSlot(r);
 if(slot>=0)r.permanent[slot]=owner;
 else{if(r.temporary.length===AREAS[region].temp.length)r.temporary.shift();r.temporary.push(owner);}
 syncInfluence(r);
}
export function initializeAutoInfluence(s,rng){
 if(!POWER_IDS.some(id=>isBasicNonPlayer(s,id)))return;
 const deck=AUTO_INFLUENCE_CARDS.map(c=>c.id);
 for(let i=deck.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
 s.autoInfluence={faceUp:deck.splice(0,2),deck,discard:[],history:[]};
}
// NPPs have map pieces, but never keep a player economy (WIT pp.15–16).
// Event reducers can share their board effects; resource rewards are discarded.
export function clearNonPlayerEconomy(s){
 for(const [id,p] of Object.entries(s.players))if(isBasicNonPlayer(s,id)){
  p.money=0;p.vp=0;p.smart=0;p.prosperity=0;p.resources.fill(0);p.production.fill(0);
 }
}
export function resolveAutoInfluence(s){
 const auto=s.autoInfluence;if(!auto)return;
 const actions=[];
 for(const id of auto.faceUp)for(const row of AUTO_INFLUENCE_CARDS[id].rows){
  if(!isBasicNonPlayer(s,row.owner))continue;
  placeNonPlayerInfluence(s,row.owner,row.region);
  if(row.army)s.regions[row.region].armies[row.owner]++;
  let traded=false;
  if(row.trade&&!isNonPlayer(s,row.trade)){
   const p=s.players[row.trade],card=p.commerce.find(c=>c.ready);
   if(card){card.ready=false;p.money+=10;traded=true;}
  }
  actions.push({...row,traded});
 }
 auto.history.push({round:s.round,cards:[...auto.faceUp],actions});auto.discard.push(...auto.faceUp);auto.faceUp=auto.deck.splice(0,2);
 s.log=[`基础自动机 · ${actions.map(a=>`${a.owner}在${AREAS[a.region].name}添加影响力${a.army?'和1军队':''}${a.traded?'；'+a.trade+'翻面1张贸易卡，获得10资金':''}`).join('；')}`,...s.log].slice(0,30);
}
