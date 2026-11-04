import {countryInfo} from './country-actions.js';
import {effectPreview,resolveBasicEffect} from './basic-actions.js';
import {grantEventEffect} from './event-effects.js';
import {placeEventInfluence} from './event-influence.js';
import {EVENT_CHAINS,queueChain} from './event-board.js';
import {EVENT_DATA} from './event-data.js';
import {publicBalances,balanceChanges} from './sequence-progress.js';
import {DECISION_RULES} from './event-decision-rules.js';
import {decisionDefinition,decisionModel,resolveDecision} from './event-decision.js';
import {MILITARY_EVENTS,militaryCondition,resolveMilitary} from './event-military.js';
import {ECONOMIC_CHECK_EVENTS,economicCheckCondition,resolveEconomicCheck} from './event-economic-checks.js';

const families={
 decision:{events:DECISION_RULES,condition:(s,q)=>{const model=decisionModel(s,q);return {...model,...model.cost,detail:model.prompt};},resolve:resolveDecision},
 military:{events:MILITARY_EVENTS,condition:militaryCondition,resolve:resolveMilitary},
 economic:{events:ECONOMIC_CHECK_EVENTS,condition:economicCheckCondition,resolve:resolveEconomicCheck}
};
const handlers=Object.fromEntries(Object.entries(families).flatMap(([family,handler])=>Object.keys(handler.events).map(id=>[id,{family,...handler}])));
export function personalEventFamily(id){return handlers[id]?.family||null;}
export const PERSONAL_EVENTS={...Object.fromEntries(Object.keys(handlers).map(id=>[id,handlers[id].events[id]?.key||handlers[id].family])),ca8e271f31adf:'aiib',c72c028872d0f:'cafta',ce6ac843efc6e:'turkstream',c4f52659f1ea9:'pivot',cd84688476fde:'tpp'};
const caftaCountries=['Cambodia','Indonesia','Myanmar','Philippines','Singapore','Thailand','Vietnam'];
const allyNames=(s,owner)=>new Set(s.players[owner].allies.map(id=>countryInfo(id).countryName.replace('Kyrgystan','Kyrgyzstan')));
const aiibCard={name:'AIIB投资',effect:'invest',readyTarget:true};
function integer(n,max){if(!Number.isInteger(n)||n<0||n>max)throw Error('请选择限额内的非负整数');return n;}
export function personalCondition(s,q){
 if(handlers[q.cardId])return handlers[q.cardId].condition(s,q);
 const p=s.players[q.owner],allies=allyNames(s,q.owner),kind=PERSONAL_EVENTS[q.cardId];
 if(kind==='aiib')return {met:p.money>=50,detail:`当前${p.money}资金；需要至少50资金。`};
 if(kind==='cafta'){const count=caftaCountries.filter(name=>allies.has(name)).length;return {met:count>0,count,detail:`符合名单的盟国有${count}个，获得${count*2} SP。`};}
 if(kind==='pivot'){const us=s.regions.P.influence.US,cn=s.regions.P.influence.CN;return {met:us<cn||p.vp<s.players.CN.vp,detail:`亚太影响力：美国${us}、中国${cn}；分数：美国${p.vp}、中国${s.players.CN.vp}。任一项美国较低即满足条件。`};}
 if(kind==='turkstream')return {met:true,money:10,diplomacy:allies.has('Turkey')?0:3};
 if(kind==='tpp')return {met:true,money:0,diplomacy:Math.max(0,6-p.allies.filter(id=>['M','P'].includes(countryInfo(id).region)).length)};
 throw Error('此个人事件尚未接入');
}
export function aiibTargets(s,owner){return s.players[owner].allies.filter(id=>!(s.players[owner].fdi||[]).includes(id));}
export function personalInvestmentTargets(s,q){return decisionDefinition(q.cardId)?decisionModel(s,q).investment?.targets||[]:aiibTargets(s,q.owner).filter(id=>PERSONAL_EVENTS[q.cardId]!=='tpp'||['M','P'].includes(countryInfo(id).region));}
function invest(s,q,a,preview,card){
 const result=preview?effectPreview(s,a,card):resolveBasicEffect(s,a,card);
 if(!preview)q.investment={country:a.country,slot:a.slot,investSP:a.investSP||'',money:result.cost};
 return result;
}
function pay(s,owner,cost){const p=s.players[owner];if(p.money<cost.money||p.resources[0]<(cost.energy||0)||p.resources[5]<cost.diplomacy)throw Error('执行事件所需资金、能源或外交不足');p.money-=cost.money;p.resources[0]-=cost.energy||0;p.resources[5]-=cost.diplomacy;}
function moveToPacific(s,owner,moves){
 if(!moves||typeof moves!=='object'||Array.isArray(moves))throw Error('请选择移入亚太的军队来源');
 const p=s.players[owner];let count=0;
 for(const [from,n] of Object.entries(moves)){
  if(from!=='reserve'&&(!s.regions[from]||from==='P'))throw Error('只能从待命区或亚太之外移入');
  integer(n,2);if(n>(from==='reserve'?p.resources[6]:s.regions[from].armies[owner]))throw Error('所选来源的军队不足');count+=n;
 }
 if(count>2)throw Error('重返亚太最多移动2支军队');
 if(p.money<count*5)throw Error('移动军队所需资金不足');
 p.money-=count*5;
 for(const [from,n] of Object.entries(moves)){if(from==='reserve')p.resources[6]-=n;else s.regions[from].armies[owner]-=n;}
 s.regions.P.armies[owner]+=count;p.smart+=count;return count;
}
// Preview performs the exact deterministic work on a copy. Random choices are
// made only by the authoritative submit, after all costs and targets validate.
function resolvePersonal(s,q,a,{preview=false}={}){
 if(handlers[q.cardId])return handlers[q.cardId].resolve(s,q,a,{preview});
 const kind=PERSONAL_EVENTS[q.cardId],owner=q.owner,p=s.players[owner],condition=personalCondition(s,q);
 if(!condition.met)return '未满足牌面条件，本事件无后续效果。';
 if(kind==='cafta'){
  p.smart+=condition.count*2;grantEventEffect(s,owner,'c5e448d194d63',q.cardId);queueChain(s,'c171711d668df');
  return `${condition.detail}获得CAFTA协议；区域全面经济伙伴关系登记为下一轮连锁（已出现的不重复加入）。`;
 }
 if(kind==='pivot'){
  const count=moveToPacific(s,owner,a.moves||{}),candidates=EVENT_CHAINS[q.cardId].filter(id=>s.chain.includes(id)&&!s.eventBoard.seen.includes(id));
  let chain=null;if(!preview&&candidates.length){chain=candidates[Math.floor(Math.random()*candidates.length)];queueChain(s,chain);q.randomChain=chain;}
  return `支付${count*5}资金，移入亚太${count}支军队并获得${count} SP；${preview?'提交时随机加入一张尚未出现的指定连锁':chain?'下一轮连锁：'+EVENT_DATA[chain].name:'指定连锁均已出现，无新连锁'}。`;
 }
 if(a.accept!==true&&a.accept!==false)throw Error('请选择执行或放弃可选效果');
 if(!a.accept){if(kind==='tpp')queueChain(s,'c171711d668df');return '放弃本次可选效果；未支付费用，也不获得相关奖励。'+(kind==='tpp'?'区域全面经济伙伴关系登记为下一轮连锁（已出现的不重复加入）。':'');}
 if(kind==='aiib'){
  if(!aiibTargets(s,owner).includes(a.country))throw Error('请选择本方尚未投资的盟国');
  pay(s,owner,{money:0,diplomacy:2});
  const result=invest(s,q,a,preview,aiibCard);
  return `支付2外交和${result.cost}资金，重整并投资所选盟国，添加1影响力${a.investSP==='after'?'；另付1 SP在投资后重整':'；投资后横置该盟国'}。`;
 }
 pay(s,owner,condition);
 if(kind==='tpp'){
  p.smart+=3;grantEventEffect(s,owner,'cd3f9ccd1ba13',q.cardId);let detail=`支付${condition.diplomacy}外交，获得3 SP和跨太平洋伙伴关系协定持续贸易效果。`;
  if(a.invest===true){
   if(!personalInvestmentTargets(s,q).includes(a.country))throw Error('请选择美洲或亚太尚未投资的本方盟国');
   const result=invest(s,q,a,preview,{name:'TPP投资',effect:'invest',allowedRegions:['M','P']});
   detail+=`另付${result.cost}资金完成正常投资，添加1影响力${a.investSP?'，另消耗1 SP重整盟国':''}。`;
  }else if(a.invest!==false)throw Error('请选择是否执行可选投资');
  return detail;
 }
 placeEventInfluence(s,owner,'N',a.slot);
 const energy=integer(a.energy??0,Math.min(5,p.resources[0]));p.resources[0]-=energy;p.money+=5*energy;
 return `先支付10资金和${condition.diplomacy}外交，在中东添加1影响力；再出售${energy}能源，获得${energy*5}资金。`;
}
export function personalEventPreview(s,q,a){if(handlers[q.cardId])return handlers[q.cardId].resolve(s,q,a,{preview:true});const copy=structuredClone(s);return resolvePersonal(copy,copy.flow.eventResolution,a,{preview:true});}
export function submitPersonalEvent(s,q,a){
 if(q.stage!=='resolve'||q.owner!==s.current||q.done.length)throw Error('当前不能结算本方个人事件');
 const before=publicBalances(s),detail=resolvePersonal(s,q,a);
 q.done.push(q.owner);q.stage='result';q.result=detail;q.receipts.push({player:q.owner,detail,changes:balanceChanges(before,publicBalances(s))});
 s.log=[EVENT_DATA[q.cardId].name+'：'+detail,...s.log].slice(0,30);
}
