import {decisionDefinition} from './event-decision-rules.js';
import {countryInfo} from './country-actions.js';
import {ECONOMY,validateProduction,RESOURCE_LABELS} from './economy.js';
import {resolveBasicEffect} from './basic-actions.js';
import {grantEventEffect} from './event-effects.js';
import {placeEventInfluence} from './event-influence.js';
import {queueChain} from './event-board.js';
import {EVENT_DATA} from './event-data.js';
import {REGIONS,POWERS} from './game-constants.js';
export {decisionDefinition} from './event-decision-rules.js';

export function decisionModel(s,q){
 const definition=decisionDefinition(q?.cardId);
 if(!definition)throw Error('此个人决策尚未登记');
 if(q.owner!==definition.owner||!s.players[q.owner])throw Error('个人决策的所属玩家不符');
 const p=s.players[q.owner],names=new Set(),counts={},allies=[];
 // Index this player's allies once; each discount then uses direct lookups.
 for(const id of p.allies){const info=countryInfo(id);names.add(info.countryName.replace('Kyrgystan','Kyrgyzstan'));counts[info.region]=(counts[info.region]||0)+1;allies.push({id,region:info.region});}
 const cost={money:0,energy:0,diplomacy:0,...definition.cost};
 for(const discount of definition.discounts||[]){
  const count=(discount.regions||[]).reduce((sum,region)=>sum+(counts[region]||0),0)+(discount.countries||[]).reduce((sum,name)=>sum+Number(names.has(name)),0);
  cost.diplomacy-=count*discount.amount;
 }
 cost.diplomacy=Math.max(0,cost.diplomacy);
 let production=null,investment=null;
 if(definition.production){
  validateProduction(p,q.owner);
  const options=p.production.flatMap((current,key)=>current<ECONOMY[q.owner].max[key]?[{key,current,max:ECONOMY[q.owner].max[key]}]:[]);
  production={...definition.production,full:options.length===0,options};
 }
 if(definition.investment){
  const invested=new Set(p.fdi||[]),regions=new Set(definition.investment.regions);
  investment={regions:[...regions],targets:allies.filter(({id,region})=>regions.has(region)&&!invested.has(id)).map(({id})=>id)};
 }
 return {id:q.cardId,key:definition.key,name:definition.name,owner:q.owner,prompt:definition.prompt,met:true,cost,smart:definition.smart||0,production,influence:definition.influence?{...definition.influence}:null,effect:definition.effect||null,otherMoney:(definition.otherMoney||[]).map(entry=>({...entry})),investment,chain:definition.chain?{...definition.chain}:null};
}

function pay(p,cost){
 if(p.money<cost.money||p.resources[0]<cost.energy||p.resources[5]<cost.diplomacy)throw Error('执行事件所需资金、能源或外交不足');
 p.money-=cost.money;p.resources[0]-=cost.energy;p.resources[5]-=cost.diplomacy;
}
function costText(cost){return [[cost.money,'资金'],[cost.energy,'能源'],[cost.diplomacy,'外交']].filter(([n])=>n>0).map(([n,label])=>n+label).join('、')||'0外交';}
function execute(s,q,a,model){
 const p=s.players[q.owner],parts=[];
 if(a.accept){
  pay(p,model.cost);parts.push(`支付${costText(model.cost)}，获得${model.smart} SP`);p.smart+=model.smart;
  if(model.production){
   if(model.production.full)parts.push('全部产能已满，跳过产能提升');
   else{
    const option=model.production.options.find(({key})=>key===a.productionKey);
    if(!option)throw Error('请选择一项未达本国上限的产能');
    p.production[option.key]+=model.production.amount;
    parts.push(`${RESOURCE_LABELS[option.key]}产能提升${model.production.amount}级`);
   }
  }
  if(model.influence){placeEventInfluence(s,q.owner,model.influence.region,a.slot);parts.push(`${REGIONS[model.influence.region]}添加1影响力`);}
  if(model.effect){grantEventEffect(s,q.owner,model.effect,q.cardId);parts.push(`获得${model.name}持续效果`);}
  for(const reward of model.otherMoney){s.players[reward.owner].money+=reward.amount;parts.push(`${POWERS[reward.owner].name}获得${reward.amount}资金`);}
  if(model.investment){
   if(a.invest!==true&&a.invest!==false)throw Error('请选择是否执行可选投资');
   if(a.invest){
    if(!model.investment.targets.includes(a.country))throw Error(`请选择${model.investment.regions.map(region=>REGIONS[region]).join('或')}尚未投资的本方盟国`);
    const result=resolveBasicEffect(s,a,{name:model.name+'投资',effect:'invest',allowedRegions:model.investment.regions});
    q.investment={country:a.country,slot:a.slot,investSP:a.investSP||'',money:result.cost};
    parts.push(`另付${result.cost}资金完成正常投资，添加1影响力${a.investSP?'，另消耗1 SP重整盟国':'，投资后横置盟国'}`);
   }
  }
 }else parts.push('放弃本次可选效果；未支付费用，也不获得相关奖励');
 if(model.chain&&(model.chain.when==='always'||model.chain.when===(a.accept?'accept':'decline'))){
  queueChain(s,model.chain.cardId);parts.push(`${EVENT_DATA[model.chain.cardId].name}登记为下一轮连锁（已出现的不重复加入）`);
 }
 return parts.join('；')+'。';
}

export function resolveDecision(s,q,a,{preview=false}={}){
 if(q?.owner!==s.current)throw Error('请由个人决策所属玩家操作');
 if(a.accept!==true&&a.accept!==false)throw Error('请选择执行或放弃可选效果');
 const model=decisionModel(s,q),copy=structuredClone(s),trial=structuredClone(q);
 // Validate the same deterministic sequence on a disposable state, including
 // normal investment/SP/resilience rules after the decision's own rewards.
 // Keeping the commit in place preserves caller references to the event record.
 const detail=execute(copy,trial,a,model);
 if(!preview)execute(s,q,a,model);
 return detail;
}
