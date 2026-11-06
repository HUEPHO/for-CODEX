import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {isAutoma,POWER_IDS} from '../dist/player-configuration.js';
import {publicBalances} from '../dist/sequence-progress.js';
import {automaBidOffer,spendAutomaEventSmart} from '../dist/event-automa.js';
import {BID_EVENTS,bidModifier,initializeBid,submitBid} from '../dist/event-bids.js';
import {AGREEMENT_EVENTS,initializeAgreement,updateAgreement,resolveNonPlayerAgreementChoice} from '../dist/event-agreements.js';
import {startEventPhase,handleEventAction,nextAutomaEventAction} from '../dist/event-flow.js';
import {continueEventDistribution} from '../dist/event-board.js';
import {drainNonPlayerRewards,resolveNonPlayerRewardChoice} from '../dist/non-player-rewards.js';
import {gainResource} from '../dist/economy.js';
import {loseEventResource} from '../dist/event-losses.js';
import {syncInfluence} from '../dist/world.js';
import {beginIncomeEffects,nextAutomaIncomeAction,resolveIncomeEffect} from '../dist/event-income.js';
import {grantEventEffect} from '../dist/event-effect-state.js';
import {nextAutomaEffectAction,useEventEffect} from '../dist/event-effect-actions.js';
import {NON_PLAYER_EVENT_BIDS} from '../dist/event-non-player-data.js';
import {EVENT_DATA} from '../dist/event-data.js';
import {eventTestAction} from './event-test-actions.mjs';
import {eventActor} from '../dist/interaction-state.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
function fixture(humans=['US','CN','EU']){
 const s=createState(cards,{humans,automatonMode:'advanced',dd:true,wit:true},()=>.4);
 for(const p of Object.values(s.players)){p.assetChoices=p.objectiveChoices=p.openingChoices=null;p.money=100;if(!p.automa)p.resources.fill(10);}
 s.current=humans[0];s.flow=newFlow(POWER_IDS);s.flow.step='events';s.phase='事件';s.eraDeck=[];s.era2Deck=[];
 s.eventBoard={round:1,slots:[null,null,null],personal:Object.fromEntries(POWER_IDS.map(id=>[id,null])),queued:[],seen:[],choice:null,revealQueue:[],distribution:null};
 return s;
}
function question(s,cardId){return {cardId,participants:EVENT_DATA[cardId].players,stage:'bid',done:[],submissions:{},receipts:[],before:publicBalances(s),chains:[]};}
let s=fixture(),q=question(s,'cbb2924757345');
// Mixed bids spend diplomacy at its real converted cost and move existing
// event-region armies before drawing supply. No reserve economy is invented.
s.regions.N.armies.RU=1;
let offer=automaBidOffer(s,q,'RU',BID_EVENTS[q.cardId],5);
assert.equal(offer.cost,25);assert.equal(offer.total,5);assert.equal(offer.count,2);assert.deepEqual(offer.armies,{N:1});
s.players.RU.money=24;offer=automaBidOffer(s,q,'RU',BID_EVENTS[q.cardId],5);assert.equal(offer.total,0);assert.equal(offer.cost,0);
s=fixture(['CN','EU','RU']);s.players.US.money=85;
assert.equal(bidModifier(s,'cd771b6a9d234','US'),4,'Automa uses current money, not printed basic +2');
s.players.US.automa.investments.A=2;s.players.US.automa.bases.A=1;
assert.equal(bidModifier(s,'c9db977892b0d','US'),3);
s=fixture(['US','CN','RU']);s.regions.N.armies.EU=1;q=question(s,'cbb2924757345');
const random=Math.random;Math.random=()=>.9;
try{
 initializeBid(s,q);assert.equal(q.submissions.EU,undefined);
 for(const id of ['US','RU']){s.current=id;submitBid(s,q,{diplomacy:0});}
 assert.equal(q.submissions.EU.total,4);assert.equal(q.submissions.EU.cost,20);assert.equal(s.players.EU.money,80);
 assert.ok(s.players.EU.resources.every(n=>n===0));assert.equal(s.regions.N.armies.EU,2);
 // An automa with a drawn zero contributes nothing, including its modifier.
 s=fixture(['CN','EU','RU']);s.players.US.money=100;q=question(s,'cd771b6a9d234');Math.random=()=>0;initializeBid(s,q);
 for(const id of ['RU','CN']){s.current=id;submitBid(s,q,{diplomacy:0});}
 assert.equal(q.submissions.US.total,0);assert.equal(q.modifiers.US,0);
 // All-automa agreement promises resolve without a nonexistent human seat.
 s=fixture(['CN']);q=question(s,'cf0d87e580c4a');Math.random=()=>.4;initializeAgreement(s,q);
 assert.equal(q.agreement.success,false);assert.equal(s.players.US.money,100);assert.equal(s.players.EU.money,100);
 s=fixture(['CN']);q=question(s,'cf0d87e580c4a');Math.random=()=>.6;initializeAgreement(s,q);
 assert.equal(q.agreement.success,true);assert.equal(s.players.US.money,80);assert.equal(s.players.EU.money,80);assert.equal(q.nonPlayerChoice.type,'ttip');
 resolveNonPlayerAgreementChoice(s,q,{face:'exchange'});resolveNonPlayerAgreementChoice(s,q,{face:'exchange'});
 assert.equal(q.stage,'result');assert.equal(s.eventEffects.filter(e=>e.face==='exchange').length,2);
 // Human agreements continue waiting if confirmed but underfunded.
 s=fixture();q=question(s,'c300aaac6d226');Math.random=()=>.4;initializeAgreement(s,q);s.current='CN';updateAgreement(s,q,{type:'submitEvent',accept:true,diplomacy:1});
 assert.equal(q.stage,'agreement');assert.equal(s.players.RU.money,100);
 updateAgreement(s,q,{type:'updateAgreement',accept:true,diplomacy:3});assert.equal(q.agreement.success,true);assert.equal(s.players.RU.money,85,'5 diplomacy and two paid moves');
 // Paid reward choices retain the exact contribution already paid.
 s=fixture();s.regions.E.temporary=['RU'];syncInfluence(s.regions.E);q=question(s,'c8c95b49f81e7');Math.random=()=>.1;initializeAgreement(s,q);s.current='EU';updateAgreement(s,q,{type:'submitEvent',accept:true});
 assert.equal(s.players.RU.money,80);assert.equal(q.nonPlayerChoice.type,'nordstream');resolveNonPlayerAgreementChoice(s,q,{skip:true});assert.equal(s.players.RU.money,95);
 // Resource gains/losses use the conversion table; private inventories stay empty.
 const p=s.players.RU,money=p.money;gainResource(p,0,2);gainResource(p,5,2);gainResource(p,4,1);assert.equal(p.money,money+26);loseEventResource(p,5,2);assert.equal(p.money,money+16);assert.ok(p.resources.every(n=>n===0));
 // Advanced crisis uses its actual starting money and does lower prosperity.
 s=fixture(['CN','EU','RU']);s.players.US.money=50;s.players.US.prosperity=2;s.eventBoard.slots[2]='c402371a1ff87';startEventPhase(s);s.current='US';let a=nextAutomaEventAction(s);assert.ok(a);handleEventAction(s,a);assert.equal(s.players.US.prosperity,1);assert.equal(s.players.US.vp,8);
 // COVID's printed tick always accepts the cheapest affordable cost.
 s=fixture(['CN','EU','RU']);s.players.US.prosperity=3;s.eventBoard.slots[2]='c52e84cdecbe6';startEventPhase(s);s.current='US';a=nextAutomaEventAction(s);assert.equal(a.payment,'service');handleEventAction(s,a);assert.equal(s.players.US.money,90);assert.equal(s.players.US.prosperity,2);assert.equal(s.players.US.vp,10);
 // Personal events never grant printed resources or slot VP; the one point
 // below is solely the separate end-of-event-phase SP conversion.
 s=fixture();s.eventBoard.personal.RU='cb7934569eecb';const before=Object.values(s.regions).reduce((n,r)=>n+r.influence.RU,0);startEventPhase(s);
 assert.equal(Object.values(s.regions).reduce((n,r)=>n+r.influence.RU,0),before+1);assert.equal(s.players.RU.money,100);assert.equal(s.players.RU.vp,11);assert.equal(s.players.RU.smart,1);
 s=fixture(['US','CN','RU']);s.eraDeck=['cda82df9a0c65'];s.eventBoard.distribution={kind:'round',round:1,remaining:1,chains:[]};const europe=JSON.stringify(s.regions.E);continueEventDistribution(s,()=>.4);assert.equal(JSON.stringify(s.regions.E),europe,'Advanced personal reveal must not search or shuffle Croatia');
 s=fixture();s.players.RU.smart=7;spendAutomaEventSmart(s);assert.equal(s.players.RU.smart,4);assert.equal(s.players.RU.vp,13);
 // Converted persistent incomes select the higher actual cash result.
 s=fixture(['US']);s.flow.step='aftermath';s.current='CN';grantEventEffect(s,'CN','ccd84d77f9734');beginIncomeEffects(s,'CN',{});a=nextAutomaIncomeAction(s);assert.equal(a.choice,'energy');resolveIncomeEffect(s,a);assert.equal(s.players.CN.money,106);
 s=fixture(['US']);s.flow.step='actions';s.actionTurns={index:s.flow.order.indexOf('CN')};s.current='CN';grantEventEffect(s,'CN','c0a8f33fb6048');a=nextAutomaEffectAction(s);assert.ok(a);useEventEffect(s,a);assert.equal(s.players.CN.money,105);assert.equal(s.players.RU.money,109);assert.equal(nextAutomaEffectAction(s),null);
 // An optional placement that would remove its own influence is skipped
 // before charging. Other independent rewards can still resolve normally.
 s=fixture();s.regions.C.permanent.fill('CN');s.regions.C.temporary=['RU','US','CN','EU'];syncInfluence(s.regions.C);q={rewardQueue:[{owner:'RU',region:'C',type:'paidInfluence',optional:true,money:10,diplomacy:2}],receipts:[]};drainNonPlayerRewards(s,q,()=>{});assert.equal(s.players.RU.money,100);assert.match(q.receipts[0].detail,/无合法/);
 // Every printed public bid/agreement configuration with one automa may
 // finish or wait only for an actual human's optional contribution/choice.
 let cases=0;
 for(const [cardId,owners] of Object.entries(NON_PLAYER_EVENT_BIDS))for(const owner of Object.keys(owners)){
  s=fixture(POWER_IDS.filter(id=>id!==owner));s.round=s.flow.round=2;for(const p of Object.values(s.players))p.money=1000;
  for(const r of Object.values(s.regions)){r.armies[owner]=2;r.temporary=[owner];syncInfluence(r);}
  s.eventBoard.slots[2]=cardId;s.eventBoard.nonPlayerAfghan={[owner]:1};Math.random=()=>.5;startEventPhase(s);
  let steps=0;
  while(s.flow.eventResolution&&steps++<25){
   q=s.flow.eventResolution;
   if(q.stage==='agreement'&&!q.nonPlayerChoice){const human=q.participants.find(id=>!isAutoma(s,id)&&q.submissions[id].accept!==false);if(human){s.current=human;handleEventAction(s,{type:'submitEvent',cardId,accept:false});continue;}}
   if(q.nonPlayerChoice){const step=q.nonPlayerChoice;a={type:'resolveNonPlayerChoice',cardId};if(step.optional||step.type==='nordstream')a.skip=true;else if(step.type==='ttip')a.face='exchange';else if(step.type==='convert')Object.assign(a,step.targets[0]);else if(step.type==='disarm')a.placements={[step.regions[0]]:1};else throw Error('Unhandled test reward '+step.type);}
   else a=nextAutomaEventAction(s)||eventTestAction(s);
   handleEventAction(s,a);
  }
  assert.ok(steps<25,cardId+' stalled');assert.ok(s.players[owner].resources.every(n=>n===0));cases++;
 }
 let accepted=0;
 for(const [cardId,rule] of Object.entries(AGREEMENT_EVENTS))for(const owner of Object.keys(NON_PLAYER_EVENT_BIDS[cardId])){
  s=fixture(POWER_IDS.filter(id=>id!==owner));for(const p of Object.values(s.players))p.money=1000;
  for(const r of Object.values(s.regions))for(const id of POWER_IDS)r.armies[id]=2;
  s.eventBoard.nonPlayerAfghan={[owner]:1};q=question(s,cardId);s.flow.eventResolution=q;Math.random=()=>.5;initializeAgreement(s,q);
  if(q.nonPlayerChoice?.source==='agreementOffer')resolveNonPlayerAgreementChoice(s,q,{placements:{[q.nonPlayerChoice.regions[0]]:1}});
  const humans=q.participants.filter(id=>id!==owner),npc=q.submissions[owner];
  assert.ok(npc.accept,cardId+' advanced accepted test draw');
  let remaining=Math.max(0,(rule.diplomacy||0)-npc.diplomacy-Object.values(q.submissions).reduce((n,o)=>n+o.credit,0));
  const offers=Object.fromEntries(humans.map(id=>{const minimum=rule.fixed||q.submissions[id].credit||rule.money?0:rule.diplomacy?1:0;remaining-=minimum;return [id,{money:rule.fixed?.money||0,diplomacy:rule.fixed?.diplomacy||minimum,armies:{}}];}));
  offers[humans[0]].money=rule.fixed?.money??Math.max(0,(rule.money||0)-npc.money);offers[humans[0]].diplomacy+=Math.max(0,remaining);
  if(rule.armies==='event')offers[humans[0]].armies={reserve:Math.max(0,(rule.minimumArmies||0)-npc.count)};
  if(rule.armies==='supply')for(const id of humans)offers[id].armies={E:1};
  for(const id of humans){s.current=id;updateAgreement(s,q,{type:'submitEvent',accept:true,...offers[id]});}
  assert.equal(q.agreement?.success,true,cardId+' '+owner);
  let steps=0;
  while(q.stage!=='result'){
   assert.ok(steps++<12,cardId+' reward stalled');s.current=eventActor(s);
   if(q.nonPlayerChoice){const step=q.nonPlayerChoice;a={type:'resolveNonPlayerChoice',cardId};if(step.type==='bricsCountry')a.country=step.countries[0];else if(step.optional||step.type==='nordstream')a.skip=true;else if(step.type==='ttip')a.face='exchange';else if(step.type==='convert')Object.assign(a,step.targets[0]);else throw Error('Unexpected agreement reward '+step.type);}
   else a=eventTestAction(s);
   handleEventAction(s,a);
  }
  assert.ok(s.players[owner].resources.every(n=>n===0));accepted++;
 }
 console.log(`Automa WIT checks passed: converted costs/rewards, real modifiers, zero/insufficient bids, agreements, crisis/COVID, personal influence, SP, persistent income, ${cases} printed configurations and ${accepted} accepted agreement configurations.`);
}finally{Math.random=random;}
