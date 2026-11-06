import {EVENT_EFFECTS,EFFECT_IDS} from './event-effect-rules.js';
import {isNonPlayer} from './player-configuration.js';
import {RESEARCH_DATA} from './research-data.js';
import {countryPiles,syncCountries,acquireSearchedCountry,regionCountries} from './country-piles.js';
export {EVENT_EFFECTS,EFFECT_IDS} from './event-effect-rules.js';
export function hasEventEffect(s,owner,cardId){if(EVENT_EFFECTS[cardId]?.owner!==owner)return false;return (s.eventEffects||[]).some(e=>e.owner===owner&&e.cardId===cardId)||(owner==='global'&&(s.activeEffects||[]).includes(cardId));}
export function grantEventEffect(s,owner,cardId,source){
 if(isNonPlayer(s,owner))return;
 if(EVENT_EFFECTS[cardId]?.owner!==owner)throw Error('持续效果的所属玩家不符');
 s.eventEffects??=[];if(!hasEventEffect(s,owner,cardId))s.eventEffects.push({cardId,owner,source,round:s.round});
 if(owner==='global'){s.activeEffects??=[];if(!s.activeEffects.includes(cardId))s.activeEffects.push(cardId);}
}
export function removeEventEffect(s,cardId){s.eventEffects=(s.eventEffects||[]).filter(e=>e.cardId!==cardId);s.activeEffects=(s.activeEffects||[]).filter(id=>id!==cardId);}
export function eventTradeIssue(s,buyer,seller){return hasEventEffect(s,'global',EFFECT_IDS.sanctions)&&((buyer==='RU'&&['US','EU'].includes(seller))||(seller==='RU'&&['US','EU'].includes(buyer)))?'对俄制裁禁止本次玩家贸易':null;}
export function eventImportSurcharge(s,buyer,seller){return hasEventEffect(s,'global',EFFECT_IDS.tradeWar)&&[buyer,seller].includes('US')&&[buyer,seller].includes('CN')?5:0;}
export function eventThreatLoss(s,player,enemy){if(hasEventEffect(s,'global',EFFECT_IDS.unlimited)&&[player,enemy].includes('RU')&&[player,enemy].includes('CN'))return 0;return hasEventEffect(s,'global',EFFECT_IDS.start)&&[player,enemy].includes('RU')&&[player,enemy].includes('US')?1:2;}

const byName=new Map();for(const [id,c] of Object.entries(RESEARCH_DATA))if(c.countryName){if(!byName.has(c.countryName))byName.set(c.countryName,[]);byName.get(c.countryName).push(id);}
function countryIds(name){const ids=byName.get(name);if(!ids)throw Error('未知事件国家：'+name);return ids;}
function clearCountryMarkers(s,ids){for(const p of Object.values(s.players)){
 for(const key of ['fdi','bases','exhaustedAllies'])p[key]=(p[key]||[]).filter(id=>!ids.includes(id));
 p.foreignInvestments=(p.foreignInvestments||[]).filter(x=>!ids.includes(x.country));
 if(p.countryUnderlays)for(const id of ids)delete p.countryUnderlays[id];
}}
function detachCountry(s,ids){for(const p of Object.values(s.players))p.allies=p.allies.filter(id=>!ids.includes(id));for(const r of Object.values(s.regions)){const piles=countryPiles(r);for(const side of ['left','right'])piles[side]=piles[side].filter(id=>!ids.includes(id));syncCountries(r);}}
export function replaceEventCountry(s,name,replacement){
 const data=RESEARCH_DATA[replacement];if(!data?.countryName)throw Error('事件替换国家资料缺失');const ids=countryIds(name).filter(id=>id!==replacement);let found=false;
 for(const p of Object.values(s.players)){
  for(const key of ['allies','fdi','bases','exhaustedAllies'])p[key]=(p[key]||[]).map(id=>{if(!ids.includes(id))return id;if(key==='allies')found=true;return replacement;});
  p.foreignInvestments=(p.foreignInvestments||[]).map(x=>ids.includes(x.country)?{...x,country:replacement}:x);
  if(p.countryUnderlays)for(const id of ids)if(p.countryUnderlays[id]){p.countryUnderlays[replacement]=p.countryUnderlays[id];delete p.countryUnderlays[id];}
 }
 for(const r of Object.values(s.regions)){const piles=countryPiles(r);let buried=false;for(const side of ['left','right'])piles[side]=piles[side].map((id,i)=>{if(!ids.includes(id))return id;found=true;if(i>0)buried=true;return replacement;});
  if(buried){const pool=[...piles.left,...piles.right];for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}const [first,second,...rest]=pool;r.countryPiles={left:[first,...rest].filter(Boolean),right:second?[second]:[]};s.eventCountryRandom=(s.eventCountryRandom||0)+1;}syncCountries(r);}
 if(!found&&!Object.values(s.players).some(p=>p.allies.includes(replacement))&&!regionCountries(s.regions[data.region]).includes(replacement)){countryPiles(s.regions[data.region]).left.unshift(replacement);syncCountries(s.regions[data.region]);}
 s.effects=(s.effects||[]).filter(id=>id!==replacement);return replacement;
}
export function takeEventCountry(s,owner,name,{ready=true,clearInvestmentsFromOtherOwner=true}={}){
 const ids=countryIds(name),existing=Object.entries(s.players).find(([,p])=>p.allies.some(id=>ids.includes(id)));
 const region=RESEARCH_DATA[ids[0]].region,r=s.regions[region],pool=regionCountries(r);
 const id=existing?.[1].allies.find(id=>ids.includes(id))||pool.find(id=>ids.includes(id))||ids.find(id=>!RESEARCH_DATA[id].starting);
 if(!id)throw Error('没有可获得的事件国家');
 if(existing?.[0]===owner){if(ready)s.players[owner].exhaustedAllies=(s.players[owner].exhaustedAllies||[]).filter(x=>x!==id);return id;}
 if(pool.includes(id)){acquireSearchedCountry(r,id);s.eventCountryRandom=(s.eventCountryRandom||0)+1;}
 if(clearInvestmentsFromOtherOwner)clearCountryMarkers(s,[id]);detachCountry(s,[id]);s.players[owner].allies.push(id);
 if(!ready){s.players[owner].exhaustedAllies??=[];s.players[owner].exhaustedAllies.push(id);}
 s.effects=(s.effects||[]).filter(x=>x!==id);return id;
}
export function releaseEventCountry(s,owner,name,{pile='left'}={}){
 if(!['left','right'].includes(pile))throw Error('国家牌堆无效');const ids=countryIds(name),id=s.players[owner].allies.find(id=>ids.includes(id));if(!id)return null;
 clearCountryMarkers(s,[id]);detachCountry(s,[id]);const r=s.regions[RESEARCH_DATA[id].region];countryPiles(r)[pile].unshift(id);syncCountries(r);return id;
}
export function removeEventCountry(s,name){const ids=countryIds(name);clearCountryMarkers(s,ids);detachCountry(s,ids);s.removedCountries=[...new Set([...(s.removedCountries||[]),...ids])];}
