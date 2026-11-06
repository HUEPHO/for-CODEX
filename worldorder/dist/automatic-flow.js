import {nextAutomaIncomeAction} from './event-income.js';
import {nextAutomaEffectAction,useEventEffect} from './event-effect-actions.js';
import {activeInteraction} from './interaction-state.js';
import {currentActor,aftermathSteps,settlementProgress} from './phase-state.js';
import {setupPending} from './action-policy.js';
import {researchCanAutoStart} from './research.js';
import {AREAS} from './world.js';
import {handleFlow} from './flow.js';
import {handleEventAction,nextAutomaEventAction} from './event-flow.js';
import {recordSettlementAction} from './settlement-journal.js';
import {recordObjectiveProgress} from './objective-progress.js';
import {isBasicNonPlayer,isAutoma} from './player-configuration.js';
import {clearNonPlayerEconomy} from './non-player.js';

// This projection also runs on seat views: use public ownership and counts,
// never inspect another player's hidden cards or execute their effects here.
export function nextAutomaticFlowAction(s){
 const f=s.flow;if(!f||Object.values(s.players).some(setupPending))return null;
 const interaction=activeInteraction(s);
 if(interaction?.kind==='income'&&isBasicNonPlayer(s,interaction.actor)&&s.flow.pendingIncome.active==='ceeOffer')return {type:'resolveIncomeEffect',effectId:'c09c854e149a8',choice:'decline'};
 if(interaction?.kind==='income'&&isAutoma(s,interaction.actor))return nextAutomaIncomeAction(s);
 if(interaction?.kind==='event'){const auto=nextAutomaEventAction(s);if(auto)return auto;}
 if(interaction)return interaction.kind==='event'&&!s.eventBoard.choice&&f.eventResolution?.stage==='result'?{type:'ackEvent',cardId:f.eventResolution.cardId}:null;
 const actor=currentActor(s);if(!actor)return null;
 if(isAutoma(s,actor)){
  const effect=nextAutomaEffectAction(s);if(effect)return effect;
  if(f.step==='actions')return {type:'automaAction'};
  if(f.step==='research')return {type:'automaResearch'};
  if(f.step==='focus')return {type:'confirmFocus'};
  if(f.step==='order')return {type:'chooseOrderSlot',slot:f.draft.slots.lastIndexOf(null)};
  if(settlementProgress(s)?.kind==='objectives')return {type:'settlePhaseTask',taskId:settlementProgress(s).key,confirmed:true};
  if(f.step==='aftermath'&&aftermathSteps(s)[f.checks.length]==='繁荣提升')return {type:'resolveProsperity',improve:true};
 }
 if(researchCanAutoStart(s))return {type:'startResearch'};
 if(f.step==='roundEnd')return {type:'nextRound'};
 if(f.step==='countries')return {type:'confirmCountries'};
 if(f.step==='order'){
  const empty=f.draft.slots.flatMap((id,slot)=>id===null?[slot]:[]);
  return empty.length===1?{type:'chooseOrderSlot',slot:empty[0]}:null;
 }
 if(f.step==='production')return s.economyVersion?{type:'confirmProduction'}:null;
 if(f.step!=='aftermath')return null;
 const step=aftermathSteps(s)[f.checks.length];
 if(step==='繁荣提升')return s.economyVersion&&s.players[actor].prosperity===5?{type:'resolveProsperity',improve:false}:null;
 if(!s.worldVersion)return null;
 if(step==='投资回报')return Object.values(s.regions).some(r=>r.engage[actor]>0)?null:{type:'resolveInvestments',withdraw:{}};
 if(step==='威胁结算')return Object.entries(AREAS).some(([id,a])=>a.interest.includes(actor)&&s.regions[id].engage[actor]>0)?null:{type:'resolveThreat',defend:[]};
 if(step==='地区与多数计分')return {type:'scoreWorld'};
 if(step==='Smart Power计分'&&s.config.wit)return {type:'scoreSmart'};
 return null;
}

// Only the authoritative full state reaches this executor. Each command moves
// to the next phase/player; stop as soon as any player has a real choice.
export function advanceAutomaticFlow(s){
 while(true){
  const actor=currentActor(s);
  if(s.current!==actor){if(!isAutoma(s,actor)&&!s.flow?.eventResolution?.nonPlayerChoice)break;s.current=actor;}
  const action=nextAutomaticFlowAction(s);if(!action)break;
  const before=structuredClone(s);
  if(action.type==='useEventEffect')useEventEffect(s,action);
  else if(!handleEventAction(s,action))handleFlow(s,action);
  clearNonPlayerEconomy(s);
  recordSettlementAction(before,s,action);
  recordObjectiveProgress(before,s);
 }
 return s;
}
