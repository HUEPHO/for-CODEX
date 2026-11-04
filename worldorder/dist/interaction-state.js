import {incomeRuleActor} from './event-income-rules.js';
// Read-only projection over existing saved workflows. No reducers, UI or I/O.
// Nested growth/relation choices suspend, rather than replace, a card sequence.
export const EVENT_ACTIONS=Object.freeze(['resolveEventReward','submitEvent','ackEvent','postponeEvent','choosePersonalEvent','resolveEventReveal']);
export const EVENT_MANUAL_ACTIONS=Object.freeze(['resource','adjustProduction','adjustEventProsperity','region','worldInfluence','engageToken','exhaustAlly','readyAlly','toggleFDI','toggleBase','toggleCommerce']);
export function eventActor(s){
 if(s.eventBoard?.choice)return s.eventBoard.choice.owner;
 const q=s.flow?.eventResolution;if(!q)return null;
 if(q.stage==='reward')return q.rewardQueue[0]?.owner||null;
 return (q.stage==='result'?q.participants[0]:q.participants[q.done.length])||null;
}
export const incomeEffectActor=incomeRuleActor;
export function inEventInteraction(s){return !!(s.eventVersion&&(s.eventBoard?.choice||s.flow?.step==='events'));}
export function manualEventOpen(s,seat=s.current){const q=s.flow?.eventResolution;return !!(inEventInteraction(s)&&q?.mode==='manual'&&q.stage!=='result'&&!s.eventBoard?.choice&&!q.done.includes(seat));}
const definitions=[
 {kind:'event',present:inEventInteraction,actor:eventActor,owner:s=>s.eventBoard?.choice?.owner||s.flow?.eventResolution?.owner,shared:true,label:'完成当前事件',issue:'请先完成当前事件；自动结算期间不能另行调整资源或推进阶段',allows:(s,type,seat)=>type==='switch'||EVENT_ACTIONS.includes(type)||manualEventOpen(s,seat)&&EVENT_MANUAL_ACTIONS.includes(type)},
 {kind:'income',present:s=>!!s.flow?.pendingIncome,actor:incomeEffectActor,owner:s=>s.flow.pendingIncome.owner,shared:true,label:'完成持续事件收益',issue:'基础投资收益已领取，请先完成持续事件收益及他方回应',actions:['resolveIncomeEffect','switch']},
 {kind:'growth',present:s=>!!s.flow?.pendingGrowth,actor:s=>s.flow.pendingGrowth.owner,label:'完成发展牌选择',issue:'请先完成发展牌的手牌选择',actions:['finishGrowthAbility']},
 {kind:'relation',present:s=>!!s.flow?.pendingRelation,actor:s=>s.flow.pendingRelation.owner,label:'完成追加结盟',issue:'请先完成或跳过开放外交追加结盟',actions:['resolveOpenDiplomacy','skipOpenDiplomacy','useGrowthAbility','finishGrowthAbility']},
 {kind:'sequence',present:s=>!!s.flow?.cardResolution,actor:s=>s.flow.cardResolution.responder||s.flow.cardResolution.owner,owner:s=>s.flow.cardResolution.owner,label:'完成卡牌后续效果',issue:'请先完成当前卡牌的分段效果',actions:['resolveSequenceStep','manualSequence','resolveOpenDiplomacy','skipOpenDiplomacy','initializeCommerce','useGrowthAbility','finishGrowthAbility']}
];
export function activeInteraction(s){
 const definition=definitions.find(d=>d.present(s));if(!definition)return null;
 const actor=definition.actor(s),owner=definition.owner?.(s)||actor;
 return {kind:definition.kind,actor,owner,shared:!!definition.shared,label:definition.kind==='sequence'&&owner!==actor?'等待被点名玩家回应':definition.label};
}
export function pendingActionIssue(s,type,seat=s.current){
 for(const d of definitions){
  if(!d.present(s))continue;
  if(!(d.allows?d.allows(s,type,seat):d.actions.includes(type)))return d.issue;
  // Event commands are dispatched before action-phase continuations, including
  // reveal choices suspended over legacy saves. Keep that boundary intact.
  if(d.kind==='event'&&EVENT_ACTIONS.includes(type))return null;
 }
 return null;
}
