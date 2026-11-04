// Conservative choices for flow regression only. Manual faces are acknowledged,
// so a completed simulation is not evidence that their printed effects are automatic.
import {specialEventModel} from '../dist/event-special-personal.js';
import {bidInvestmentTargets} from '../dist/event-bids.js';
import {agreementCountryTargets} from '../dist/event-agreements.js';
import {incomeChoiceModel} from '../dist/event-income-rules.js';

function rewardAction(s,q){
 const step=q.rewardQueue[0],action={type:'resolveEventReward',cardId:q.cardId};
 if(step.optional)return {...action,skip:true};
 if(q.agreementVersion){
  if(step.type==='ttip')return {...action,face:'exchange'};
  if(step.type==='nordstream')return {...action,choice:'diplomacy'};
  if(step.type==='move')return {...action,moves:[]};
  if(step.type==='bricsCountry')return {...action,country:agreementCountryTargets(s,step.owner)[0]};
  if(step.type==='convert'){
   const region=step.regions.find(id=>s.regions[id].temporary.includes(step.owner));
   if(!region)throw Error('Regression driver: required agreement conversion has no legal target');
   return {...action,region,index:s.regions[region].temporary.indexOf(step.owner)};
  }
  throw Error('Regression driver: unsupported required agreement reward '+step.type);
 }
 if(step.type==='investment')return {...action,country:bidInvestmentTargets(s,step.owner,step.region)[0],slot:'temporary'};
 if(step.type==='move')return {...action,moves:{}};
 return {...action,slot:'temporary',index:s.regions[step.region].temporary.indexOf(step.owner),energy:0,raw:0};
}
export function eventTestAction(s){
 const choice=s.eventBoard.choice;
 if(choice)return choice.type==='personal'?{type:'choosePersonalEvent',cardId:choice.candidates[0]}:{type:'resolveEventReveal',moves:[]};
 const q=s.flow.eventResolution;
 if(q.stage==='reward')return rewardAction(s,q);
 if(q.stage==='result')return {type:'ackEvent',cardId:q.cardId};
 const action={type:'submitEvent',cardId:q.cardId,accept:false,moves:{},amount:0,production:[],productionKey:s.players[s.current].production.findIndex(n=>n>1),confirmed:true};
 if(q.agreementVersion)return {type:'submitEvent',cardId:q.cardId,accept:false};
 if(q.mode==='special'){
  const model=specialEventModel(s,q);
  if(model.key==='covid')return {...action,payment:'none'};
  if(model.key==='brexit')return {...action,relate:false};
  if(model.key==='croatia'){
   if(model.country&&!model.historyKnown)throw Error('Regression driver: Croatia needs genuine prosperity history confirmation');
   return {...action,slot:'temporary'};
  }
  if(model.key==='afghan'&&model.phase==='withdraw')return {...action,withdrawals:{[model.destinations[0]]:model.armies}};
  if(model.key==='crimea'){
   let remaining=model.movable;const moves={};
   for(const from of ['reserve',...Object.keys(s.regions)]){
    const available=from==='reserve'?s.players[s.current].resources[6]:s.regions[from].armies[s.current],n=Math.min(remaining,available);
    if(n)moves[from]=n;remaining-=n;if(!remaining)break;
   }
   if(remaining)throw Error('Regression driver: Crimea forced movement cannot be filled');
   return {...action,moves};
  }
 }
 return action;
}

export function incomeTestAction(s){
 const model=incomeChoiceModel(s);if(!model||model.issue)throw Error('Regression driver: '+(model?.issue||'no pending income'));
 const options=model.groups.filter(group=>!group.issue).flatMap(group=>group.options).filter(option=>!option.issue);
 const option=options.find(option=>option.choice==='decline')||options.find(option=>option.choice==='money')||options[0];
 if(!option)throw Error('Regression driver: no legal income choice');
 return {type:'resolveIncomeEffect',effectId:option.effectId,choice:option.choice};
}
