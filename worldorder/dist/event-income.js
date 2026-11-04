import {gainResource} from './economy.js';
import {publicBalances,balanceChanges} from './sequence-progress.js';
import {incomeEffects,incomeChoicePlan,incomePlanReceipt} from './event-income-rules.js';
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
  if(operation.delta<0){p.resources[operation.key]+=operation.delta;return 0;}
  return gainResource(p,operation.key,operation.delta);
 }
 throw Error('持续收益包含未接入的结算操作');
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
