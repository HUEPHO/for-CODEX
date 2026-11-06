import {activeInteraction} from './interaction-state.js';
import {currentActor,aftermathSteps} from './phase-state.js';
import {setupPending} from './action-policy.js';
import {researchCanAutoStart} from './research.js';
import {AREAS} from './world.js';
import {handleFlow} from './flow.js';
import {handleEventAction} from './event-flow.js';
import {recordSettlementAction} from './settlement-journal.js';
import {recordObjectiveProgress} from './objective-progress.js';
import {isNonPlayer} from './player-configuration.js';
import {clearNonPlayerEconomy} from './non-player.js';

// This projection also runs on seat views: use public ownership and counts,
// never inspect another player's hidden cards or execute their effects here.
export function nextAutomaticFlowAction(s){
 const f=s.flow;if(!f||Object.values(s.players).some(setupPending))return null;
 const interaction=activeInteraction(s);
 if(interaction?.kind==='income'&&isNonPlayer(s,interaction.actor)&&s.flow.pendingIncome.active==='ceeOffer')return {type:'resolveIncomeEffect',effectId:'c09c854e149a8',choice:'decline'};
 if(interaction)return interaction.kind==='event'&&!s.eventBoard.choice&&f.eventResolution?.stage==='result'?{type:'ackEvent',cardId:f.eventResolution.cardId}:null;
 const actor=currentActor(s);if(!actor)return null;
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
 let action;
 while(s.current===currentActor(s)&&(action=nextAutomaticFlowAction(s))){
  const before=structuredClone(s);
  if(!handleEventAction(s,action))handleFlow(s,action);
  clearNonPlayerEconomy(s);
  recordSettlementAction(before,s,action);
  recordObjectiveProgress(before,s);
 }
 return s;
}
