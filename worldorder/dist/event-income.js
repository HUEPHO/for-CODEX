import {gainResource} from './economy.js';
import {publicBalances,balanceChanges} from './sequence-progress.js';
import {incomeEffects,incomeChoicePlan,incomePlanReceipt,incomeChoiceModel} from './event-income-rules.js';
import {isAutoma} from './player-configuration.js';
import {AUTOMA_EVENT_RESOURCE_MONEY} from './event-automa.js';
export {incomeEffects,ceePurchaseIssue} from './event-income-rules.js';
export {incomeEffectActor} from './interaction-state.js';

export function beginIncomeEffects(s,owner,base){
 const remaining=incomeEffects(s,owner);if(!remaining.length)return false;
 s.flow.pendingIncome={round:s.round,owner,base,remaining,active:null,receipts:[]};return true;
}

function applyIncomeOperation(s,operation){
 const p=s.players[operation.player];
 if(operation.type==='money'){p.money+=operation.delta;return 0;}
 if(operation.type==='useCommerce'){p.commerce[operation.index].ready=false;return 0;}
 if(operation.type==='resource'){
  if(operation.delta<0){if(p.automa)p.money+=operation.delta*AUTOMA_EVENT_RESOURCE_MONEY[operation.key];else p.resources[operation.key]+=operation.delta;return 0;}
  return gainResource(p,operation.key,operation.delta);
 }
 throw Error('持续收益包含未接入的结算操作');
}

export function nextAutomaIncomeAction(s){
 const model=incomeChoiceModel(s);if(!model||model.issue||!isAutoma(s,model.actor))return null;
 // The offer itself remains a real response for a human partner. On the
 // automa's side compare immediate cash after the prescribed conversions.
 if(model.active==='ceeOffer')return {type:'resolveIncomeEffect',effectId:'c09c854e149a8',choice:'decline'};
 const choices=model.groups.flatMap(group=>group.options.filter(option=>!option.issue).map(option=>{
  const action={type:'resolveIncomeEffect',effectId:option.effectId,choice:option.choice},plan=incomeChoicePlan(s,action);
  const value=plan.operations.filter(op=>op.player===model.actor).reduce((sum,op)=>sum+(op.type==='money'?op.delta:op.type==='resource'?op.delta*AUTOMA_EVENT_RESOURCE_MONEY[op.key]:0),0);
  return {action,value};
 }));
 choices.sort((a,b)=>b.value-a.value);return choices[0]?.action||null;
}

export function resolveIncomeEffect(s,a){
 // Resolve and validate the entire choice before touching money, stock or logs.
 const plan=incomeChoicePlan(s,a),q=s.flow.pendingIncome,before=publicBalances(s);
 const results=plan.operations.map(operation=>applyIncomeOperation(s,operation));
 const detail=incomePlanReceipt(plan,results);
 q.active=plan.nextActive;
 q.receipts.push({effectId:a.effectId,player:s.current,detail,changes:balanceChanges(before,publicBalances(s))});
 if(plan.done)q.remaining=q.remaining.filter(id=>id!==a.effectId);
 const complete=q.remaining.length===0,owner=q.owner;
 if(complete){s.incomeEffectHistory??=[];s.incomeEffectHistory.push(structuredClone(q));s.flow.pendingIncome=null;}
 return {owner,complete,detail};
}
