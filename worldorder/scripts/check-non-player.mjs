import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {currentActor,aftermathSteps,settlementProgress} from '../dist/phase-state.js';
import {humanPlayers,isNonPlayer,POWER_IDS} from '../dist/player-configuration.js';
import {resolveAutoInfluence} from '../dist/non-player.js';
import {majorityStandings,scoringPreview,winners,smartPreview,syncInfluence} from '../dist/world.js';
import {tradePreview,applyTrade} from '../dist/trade.js';
import {startEventPhase} from '../dist/event-flow.js';
import {EVENT_DATA} from '../dist/event-data.js';
import {NON_PLAYER_EVENT_BIDS} from '../dist/event-non-player-data.js';
import {eventTestAction,incomeTestAction} from './event-test-actions.mjs';
import {newRoom,changeRoom,playerView,roomView} from '../server/rooms.js';
import {ECONOMY} from '../dist/economy.js';
import {AGREEMENT_EVENTS} from '../dist/event-agreements.js';
import {BID_EVENTS} from '../dist/event-bids.js';
import {rollbackRevealReason} from '../dist/rollback-state.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
function fixture(humans=['US','CN'],wit=false,dd=false){
 const s=createState(cards,{humans,wit,dd},()=>.4);
 for(const p of Object.values(s.players)){p.objectives=p.objectiveChoices?.slice(0,2)||[];p.assetChoices=p.objectiveChoices=null;p.assetSelection=[];p.objectiveSelection=[];}
 s.flow=newFlow(humans);s.initialOrder=[...humans];s.current=humans[0];s.actionTurns={index:0,completed:Object.fromEntries(POWER_IDS.map(id=>[id,0]))};
 if(wit){s.eventBoard.choice=null;s.eventBoard.distribution=null;s.eventBoard.revealQueue=[];}
 return s;
}
export function nppChoiceAction(s){
 const q=s.flow.eventResolution,step=q.nonPlayerChoice,a={type:'resolveNonPlayerChoice',cardId:q.cardId};
 if(step.optional||step.type==='nordstream')return {...a,skip:true};
 if(step.type==='ttip'){const partner=step.owner==='US'?'EU':'US';return {...a,face:'investment',productionKey:s.players[partner].production.findIndex((n,k)=>n<ECONOMY[partner].max[k])};}
 if(step.type==='convert')return {...a,...step.targets[0]};
 return {...a,placements:{[step.regions[0]]:step.type==='disarm'?1:step.type==='withdraw'?step.max:0}};
}
function assertNpp(s){for(const id of POWER_IDS.filter(id=>isNonPlayer(s,id))){const p=s.players[id];assert.equal(p.money,0);assert.equal(p.vp,0);assert.equal(p.smart,0);assert.ok(p.resources.every(n=>n===0));assert.equal(p.hand.length,0);}}
for(const humans of [['US','CN'],['EU','RU'],['US','CN','RU'],POWER_IDS]){
 const s=createState(cards,{humans,dd:false,wit:false},()=>.4);assert.equal(s.growth.length,{2:12,3:18,4:20}[humans.length]);
 assert.equal(s.autoInfluence?.faceUp.length||0,humans.length<4?2:0);assertNpp(s);
}
assert.throws(()=>createState(cards,{humans:['US','EU']}),/双人/);assert.throws(()=>createState(cards,{humans:['CN']}),/2至4/);
let s=fixture();s.autoInfluence.faceUp=[0,1];const npcBefore=structuredClone(s.players.RU);resolveAutoInfluence(s);
assert.equal(s.regions.E.armies.EU,1);assert.equal(s.regions.A.armies.RU,1);assert.equal(s.players.US.money,40);assert.equal(s.players.US.commerce.filter(c=>c.ready).length,1);assert.deepEqual(s.players.RU,npcBefore);
const restored=JSON.parse(JSON.stringify(s));assert.deepEqual(restored.autoInfluence,s.autoInfluence);
for(const c of s.players.EU.commerce)c.ready=false;s.players.US.money=100;
const trade=tradePreview(s,{imports:[{key:3,players:{EU:1}}]},{name:'trade'});assert.equal(trade.diplomacy,0);applyTrade(s,trade);assert.equal(s.players.EU.money,0);assert.equal(s.players.US.resources[3],4);
s.players.US.money=s.players.CN.money=100;assert.ok(majorityStandings(s).money.every(x=>x.vp===0));s.players.US.money++;assert.equal(majorityStandings(s).money[0].vp,2);s.players.US.smart=5;assert.equal(smartPreview(s).US,3);
s.round=6;s.players.RU.vp=999;assert.equal(scoringPreview(s).totals.RU,0);s.finalRegionWins={US:0,CN:0,EU:9,RU:9};assert.ok(!winners(s).includes('RU'));
// Authority, privacy and revision checks use the human seat set.
const who={US:{user:'npp',token:'host'},CN:{user:'npp',token:'guest'},RU:{user:'npp',token:'rogue'}};
let room=newRoom('NPPTEST',who.US,cards,{humans:['US','CN'],wit:false});
assert.throws(()=>changeRoom(room,who.RU,{id:'bad',op:'join',seat:'RU'},cards),/自动机/);
room=changeRoom(room,who.CN,{id:'join',op:'join',seat:'CN'},cards);room=changeRoom(room,who.US,{id:'start',op:'start'},cards);assert.equal(room.status,'playing');assert.ok(roomView(room,who.US).seats.RU.nonPlayer);assert.ok(playerView(room.state,'US').autoInfluence.deck.every(id=>id===null));
// Six rounds with every legal 2/3-player combination, with and without WIT.
const combinations=[['US','CN'],['US','RU'],['EU','CN'],['EU','RU'],...POWER_IDS.map(omit=>POWER_IDS.filter(id=>id!==omit))];
let rounds=0,events=0;
const games=[...combinations.flatMap(humans=>[false,true].map(wit=>({humans,wit}))),...[['US','CN'],['CN','EU','RU']].map(humans=>({humans,wit:true,dd:true}))];
for(const {humans,wit,dd} of games){
 s=fixture(humans,wit,dd);let steps=0;
 while(s.flow.step!=='ended'){
  assert.ok(steps++<600,JSON.stringify({humans,wit,flow:s.flow}));s.current=currentActor(s);assert.ok(humans.includes(s.current),'Never wait for an absent seat');let a;
  if(s.eventBoard?.choice)a=eventTestAction(s);
  else if(s.flow.step==='actions')a={type:'passTurn',cardId:s.players[s.current].hand[0]};
  else if(s.flow.step==='research')a={type:'finishResearch'};
  else if(s.flow.step==='events'){events++;a=s.flow.eventResolution.nonPlayerChoice?nppChoiceAction(s):eventTestAction(s);}
  else if(s.flow.step==='order')a={type:'chooseOrderSlot',slot:s.flow.draft.slots.indexOf(null)};
  else if(s.flow.step==='focus')a={type:'confirmFocus',ready:[],upgrades:[],quantities:Array(7).fill(0)};
  else if(s.flow.pendingIncome)a=incomeTestAction(s);
  else if(settlementProgress(s)?.kind==='objectives')a={type:'settlePhaseTask',taskId:settlementProgress(s).key,confirmed:true,cardId:s.players[s.current].objectives.find(id=>!s.players[s.current].scoredObjectives?.some(c=>c.cardId===id)),scoreMode:'apply'};
  else if(s.flow.step==='aftermath'){
   const step=aftermathSteps(s)[s.flow.checks.length];
   a=step==='繁荣提升'?{type:'resolveProsperity',improve:false}:step==='威胁结算'?{type:'resolveThreat',defend:[]}:step==='投资回报'?{type:'resolveInvestments',withdraw:{}}:null;
  }
  assert.ok(a,JSON.stringify(s.flow));
  try{s=applyAction(s,a);}catch(error){error.message+=JSON.stringify({humans,wit,round:s.round,step:s.flow.step,a,q:s.flow.eventResolution});throw error;}
  assertNpp(s);s=JSON.parse(JSON.stringify(s));
 }
 assert.equal(s.autoInfluence.history.length,6);rounds+=6;
}
let faces=0;
const originalRandom=Math.random;Math.random=()=>.5;
try{
 // Iran: fixed NPP offers cannot leave an all-human refusal waiting forever.
 s=fixture(['US','CN'],true);s.flow.step='events';s.phase='事件';s.eraDeck=[];s.era2Deck=[];
 s.eventBoard={round:1,slots:[null,null,'ccb7c1841e070'],personal:{US:null,CN:null,EU:null,RU:null},queued:[],seen:[],choice:null,revealQueue:[],distribution:null};
 const beforeIran=structuredClone(s);startEventPhase(s);assert.match(rollbackRevealReason(beforeIran,s),/随机/);
 assert.ok(['EU','RU'].every(id=>s.flow.eventResolution.submissions[id].accept));
 s=applyAction(s,{type:'submitEvent',cardId:'ccb7c1841e070',accept:false});s.current='CN';
 s=applyAction(s,{type:'submitEvent',cardId:'ccb7c1841e070',accept:false});assert.equal(s.eventHistory.find(q=>q.cardId==='ccb7c1841e070').agreement.success,false);
 // Newly revealed auto-influence cards warn on undo, while the public effects do not.
 s=fixture();const beforeInfluence=structuredClone(s);resolveAutoInfluence(s);assert.match(rollbackRevealReason(beforeInfluence,s),/自动影响力/);
 // The BRICS response is mandatory for the basic non-player, without a money fee.
 s=fixture(['US','CN']);s.current='CN';s.flow.order=['CN','US'];s.players.CN.assets=['c505b0ec5fbae'];s.players.CN.money=100;s.players.CN.hand=['cf9aa23c4a315'];
 s=applyAction(s,{type:'startSequenceCard',cardId:'c505b0ec5fbae',cover:'cf9aa23c4a315'});
 s=applyAction(s,{type:'resolveSequenceStep',regions:['M','A']});
 s=applyAction(s,{type:'resolveSequenceStep',region:'M',slot:'temporary'});
 const russiaInfluence=s.regions.S.influence.RU;s=applyAction(s,{type:'resolveSequenceStep',region:'A',slot:'temporary'});
 assert.equal(s.regions.S.influence.RU,russiaInfluence+1);assert.equal(s.flow.cardResolution,null);assertNpp(s);
 // A CEE offer to the absent EU declines automatically and returns the real choice to China.
 s=fixture(['US','CN'],true);s.current='CN';s.flow.order=['CN','US'];s.flow.step='aftermath';s.flow.checks=[];
 s.eventEffects=[{owner:'CN',cardId:'c09c854e149a8'}];s.flow.pendingIncome={round:s.round,owner:'CN',base:{fdi:0,engage:0},remaining:['c09c854e149a8'],active:null,receipts:[]};
 s=applyAction(s,{type:'resolveIncomeEffect',effectId:'c09c854e149a8',choice:'offer'});assert.equal(s.flow.pendingIncome.active,'ceeFallback');assert.equal(currentActor(s),'CN');assertNpp(s);
 // Automatic choices keep normal seat/revision/idempotency validation;
 // client-supplied targets cannot control the non-player's script.
 s=fixture(['US','CN'],true);s.flow.step='events';s.phase='事件';s.regions.E.armies.RU=2;
 s.eventBoard={round:1,slots:[null,null,'ce9e1586521dc'],personal:{US:null,CN:null,EU:null,RU:null},queued:[],seen:[],choice:null,revealQueue:[],distribution:null};startEventPhase(s);
 room={...room,state:s};const delegated={id:'npp-disarm',op:'action',gameRevision:room.gameRevision,action:{type:'resolveNonPlayerChoice',cardId:'ce9e1586521dc',placements:{E:1}}};
 assert.throws(()=>changeRoom(room,who.CN,delegated,cards),/正在等待/);
 const ignored=changeRoom(room,who.US,{...delegated,action:{...delegated.action,placements:{E:999}}},cards);assert.equal(ignored.state.flow.eventResolution.submissions.RU.count,1);
 const afterChoice=changeRoom(room,who.US,delegated,cards);assert.equal(afterChoice.state.flow.eventResolution.submissions.RU.armies.E,1);
 assert.deepEqual(changeRoom(afterChoice,who.US,delegated,cards),afterChoice);
 assert.throws(()=>changeRoom(afterChoice,who.US,{...delegated,id:'stale-npp'},cards),/局面已更新/);
 assert.deepEqual(JSON.parse(JSON.stringify(afterChoice)).state.flow.eventResolution,afterChoice.state.flow.eventResolution);
 for(const [cardId,bids] of Object.entries(NON_PLAYER_EVENT_BIDS))for(const npc of Object.keys(bids)){
  const humans=POWER_IDS.filter(id=>id!==npc);s=fixture(humans,true);s.round=s.flow.round=2;
  for(const id of humans){s.players[id].money=1000;s.players[id].resources.fill(20);}
  for(const r of Object.values(s.regions)){r.armies[npc]=1;r.armies[humans[0]]=1;r.temporary=[npc];syncInfluence(r);}
  s.flow.step='events';s.phase='事件';s.eraDeck=[];s.era2Deck=[];
  s.eventBoard={round:2,slots:[null,null,cardId],personal:Object.fromEntries(POWER_IDS.map(id=>[id,null])),queued:[],seen:[cardId],choice:null,revealQueue:[],distribution:null,nonPlayerAfghan:{[npc]:1}};
  startEventPhase(s);const q=s.flow.eventResolution;
  if(BID_EVENTS[cardId])assert.equal(q.submissions[npc],undefined,'NPC bids remain undrawn until humans submit');
  if(q.agreementVersion){
   const rule=AGREEMENT_EVENTS[cardId],players=q.participants.filter(id=>!isNonPlayer(s,id)),npcOffer=q.submissions[npc];
   let money=Math.max(0,(rule.money||0)-npcOffer.money),dip=Math.max(0,(rule.diplomacy||0)-npcOffer.diplomacy-Object.values(q.submissions).reduce((n,o)=>n+o.credit,0)),armies=Math.max(0,(rule.minimumArmies||0)-npcOffer.count);
   q.testOffers={};
   for(const id of players){const minimum=rule.fixed||q.submissions[id].credit||rule.money?0:rule.diplomacy?1:0;q.testOffers[id]={money:rule.fixed?.money||0,diplomacy:rule.fixed?.diplomacy||minimum,armies:{}};dip-=minimum;}
   q.testOffers[players[0]].money=rule.fixed?.money??money;q.testOffers[players[0]].diplomacy+=Math.max(0,dip);
   if(rule.armies==='event')q.testOffers[players[0]].armies={reserve:armies};
   if(rule.armies==='supply')for(const id of players){s.regions.E.armies[id]=1;q.testOffers[id].armies={E:1};}
  }
  let steps=0;
  while(!s.eventHistory.some(e=>e.cardId===cardId)){
   assert.ok(steps++<20,cardId+' '+npc+' stuck');s.current=currentActor(s);assert.ok(humans.includes(s.current));
   const q=s.flow.eventResolution;let a=q.nonPlayerChoice?nppChoiceAction(s):q.agreementVersion&&q.stage==='agreement'?{type:'submitEvent',cardId,accept:true,...q.testOffers[s.current]}:eventTestAction(s);
   try{s=applyAction(s,a);}catch(error){error.message+=' '+JSON.stringify({cardId,npc,a,q});throw error;}
   assertNpp(s);
  }
  const history=s.eventHistory.find(e=>e.cardId===cardId);if(AGREEMENT_EVENTS[cardId])assert.equal(history.agreement.success,true,cardId+' '+npc);
  if(BID_EVENTS[cardId])assert.equal(history.submissions[npc].nonPlayer,true);faces++;
 }
}finally{Math.random=originalRandom;}
console.log(`NPP checks passed: setup/supply, influence/army/trade, 2-player scoring, authoritative seats/privacy, ${rounds} simulated rounds, ${events} WIT steps, ${faces} printed bid/accepted-agreement NPP cases.`);
