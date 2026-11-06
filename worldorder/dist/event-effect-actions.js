import {EVENT_EFFECTS,EFFECT_IDS,grantEventEffect,hasEventEffect,eventTradeIssue,eventImportSurcharge} from './event-effect-state.js';
import {gainResource,ECONOMY} from './economy.js';
import {placeEventInfluence} from './event-influence.js';
import {currentActor} from './phase-state.js';
import {isNonPlayer,isBasicNonPlayer,isAutoma} from './player-configuration.js';
import {placeAutomaInfluence} from './automa-board.js';
const ttipIds={US:EFFECT_IDS.ttipUS,EU:EFFECT_IDS.ttipEU};
export function activateTTIP(s,owner,{face,productionKey,slot='permanent',source,preview=false}={}){
 if(preview)return activateTTIP(structuredClone(s),owner,{face,productionKey,slot,source});
 if(!ttipIds[owner]||!['investment','exchange'].includes(face))throw Error('请选择TTIP协议的投资面或交易面');
 const existing=(s.eventEffects||[]).find(e=>e.cardId===ttipIds[owner]&&e.owner===owner);if(existing?.face)throw Error('本TTIP协议已经选择一面');
 const p=s.players[owner],partner=owner==='US'?'EU':'US',other=s.players[partner];
 if(face==='investment'){
  if(p.money<25)throw Error('TTIP投资面需要25资金');
  const choices=isNonPlayer(s,partner)?[]:other.production.flatMap((n,k)=>n<ECONOMY[partner].max[k]?[k]:[]);
  if(choices.length&&!choices.includes(productionKey))throw Error('请选择对方可提升的产能');
  if(!['permanent','temporary'].includes(slot))throw Error('请选择影响力槽位');
  p.money-=25;if(choices.length)other.production[productionKey]++;
  if(isAutoma(s,owner))placeAutomaInfluence(s,owner,owner==='US'?'E':'M');else placeEventInfluence(s,owner,owner==='US'?'E':'M',slot);
 }
 grantEventEffect(s,owner,ttipIds[owner],source);(s.eventEffects.find(e=>e.cardId===ttipIds[owner]&&e.owner===owner)).face=face;
 return face==='investment'?'支付25资金，添加影响力并提升对方产能；以后投资回报获得6资金。':'选择交易面，每轮一次向对方支付10资金，获得外交及所选资源。';
}
export function eventEffectOptions(s,owner){return (s.eventEffects||[]).filter(e=>e.owner===owner&&EVENT_EFFECTS[e.cardId]?.owner===owner&&EVENT_EFFECTS[e.cardId]?.active&&(EVENT_EFFECTS[e.cardId].active!=='ttip'||e.face==='exchange')).map(e=>({effectId:e.cardId,name:EVENT_EFFECTS[e.cardId].name,keys:EVENT_EFFECTS[e.cardId].active==='pipeline'?[0]:owner==='US'?[2,3,4]:[0,1,2,3,4],used:e.usedRound===s.round}));}
export function nextAutomaEffectAction(s){
 const owner=s.current;if(!isAutoma(s,owner)||s.flow?.step==='ended'||currentActor(s)!==owner)return null;
 for(const option of eventEffectOptions(s,owner).filter(option=>!option.used)){
  const pipeline=EVENT_EFFECTS[option.effectId].active==='pipeline',seller=pipeline?'RU':owner==='US'?'EU':'US';
  const cost=(pipeline?9:10)+eventImportSurcharge(s,owner,seller);
  if(eventTradeIssue(s,owner,seller)||s.players[owner].money<cost||pipeline&&!isNonPlayer(s,seller)&&!s.players[seller].commerce.some(c=>c.ready))continue;
  const key=option.keys.find(key=>key>=3)??option.keys[0],income=(key<3?9:10)+5;
  if(income>cost)return {type:'useEventEffect',effectId:option.effectId,resourceKey:key};
 }
 return null;
}
export function useEventEffect(s,a,{preview=false}={}){
 if(preview)return useEventEffect(structuredClone(s),a);
 const owner=s.current,p=s.players[owner],e=(s.eventEffects||[]).find(e=>e.cardId===a.effectId&&e.owner===owner),rule=EVENT_EFFECTS[a.effectId];
 if(!e||rule?.owner!==owner||!rule?.active||rule.active==='ttip'&&e.face!=='exchange')throw Error('本方没有可主动使用的此项效果');
 if(s.flow?.step==='ended'||currentActor(s)!==owner)throw Error('请在本方操作时使用持续效果');
 if(e.usedRound===s.round)throw Error('本效果本轮已经使用');
 const pipeline=rule.active==='pipeline',seller=pipeline?'RU':owner==='US'?'EU':'US',issue=eventTradeIssue(s,owner,seller);
 if(issue)throw Error(issue);
 const key=pipeline?0:a.resourceKey,allowed=pipeline?[0]:owner==='US'?[2,3,4]:[0,1,2,3,4];if(!allowed.includes(key))throw Error('请选择协议允许的资源');
 const cost=(pipeline?9:10)+eventImportSurcharge(s,owner,seller);if(p.money<cost)throw Error('资金不足');
 const npc=isNonPlayer(s,seller),cardIndex=pipeline?s.players.RU.commerce?.findIndex(c=>c.ready):-1;if(pipeline&&!npc&&!(cardIndex>=0))throw Error('俄罗斯没有可翻用的贸易卡');
 p.money-=cost;if(!isBasicNonPlayer(s,seller))s.players[seller].money+=pipeline?9:10;if(pipeline&&!npc)s.players.RU.commerce[cardIndex].ready=false;
 const quantity=key<3?3:1;gainResource(p,key,quantity);gainResource(p,5,1);e.usedRound=s.round;
 const detail=`${rule.name}：支付${cost}资金，获得${quantity}份资源和1外交；本轮已使用。`;s.log=[detail,...s.log].slice(0,30);return detail;
}
