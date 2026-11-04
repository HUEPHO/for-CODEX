import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {startEventPhase} from '../dist/event-flow.js';
import {EVENT_DATA} from '../dist/event-data.js';
import {personalEventPreview} from '../dist/event-personal.js';
import {decisionModel} from '../dist/event-decision.js';
import {renderPersonalEvent} from '../dist/event-personal-ui.js';
import {hasEventEffect} from '../dist/event-effects.js';
import {ECONOMY} from '../dist/economy.js';
import {RESEARCH_DATA} from '../dist/research-data.js';
import {countryInfo} from '../dist/country-actions.js';
import {syncInfluence} from '../dist/world.js';
import {currentActor} from '../dist/phase-state.js';
import {actionAccess} from '../dist/action-policy.js';
import {newRoom,changeRoom,roomView,playerView} from '../server/rooms.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const seats=['US','CN','EU','RU'],RCEP='c171711d668df',SAUDI_IRAN='cf7279a3c54ad',ABRAHAM='cc241e068f335',USMCA='c98613bb22860',CONFLICT='c2a6d1615b971';
const country=(name,starting=false)=>Object.keys(RESEARCH_DATA).find(id=>RESEARCH_DATA[id].countryName===name&&!!RESEARCH_DATA[id].starting===starting);
const japan=country('Japan'),canada=country('Canada'),sudan=country('Sudan'),resilience='cc77fe93f8768';
assert.equal(countryInfo(sudan).region,'A','The Sudan counterexample must be outside the Middle East');
function fixture(cardId,edit=()=>{}){
 const s=createState(cards,{wit:true,dd:true},()=>.3);
 for(const p of Object.values(s.players)){
  p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.hand=['cf9aa23c4a315'];p.deck=['c89c153d80dbd'];
  p.allies=[];p.fdi=[];p.bases=[];p.exhaustedAllies=[];p.growth=[];p.money=60;p.vp=0;p.smart=0;
  p.resources=[3,3,3,3,3,10,3];p.production=Array(7).fill(1);
 }
 s.round=4;s.phase='事件';s.initialOrder=seats;s.flow=newFlow(seats,4);s.flow.step='events';
 s.actionTurns={index:16,completed:{US:4,CN:4,EU:4,RU:4}};s.eraDeck=[];s.era2Deck=[];s.eventHistory=[];s.eventDiscard=[];
 const owner=EVENT_DATA[cardId].players[0];
 s.eventBoard={round:4,slots:[null,null,null],personal:Object.fromEntries(seats.map(id=>[id,id===owner?cardId:null])),seen:[cardId],queued:[],choice:null,revealQueue:[],distribution:null};
 s.events=[];edit(s);startEventPhase(s);return s;
}
const act=(s,type,fields={})=>applyAction(s,{type,cardId:s.flow.eventResolution?.cardId,...fields});
const submit=(s,fields={})=>act(s,'submitEvent',fields);
function rejects(s,fields,pattern){const snapshot=JSON.stringify(s);assert.throws(()=>submit(s,fields),pattern);assert.equal(JSON.stringify(s),snapshot,'Rejected decision mutated the original state');}
function balances(s){return Object.fromEntries(seats.map(id=>{const p=s.players[id];return [id,{money:p.money,vp:p.vp,smart:p.smart,resources:p.resources,production:p.production,fdi:p.fdi,exhausted:p.exhaustedAllies}];}));}
function accept(s,fields={}){return submit(s,{accept:true,productionKey:0,slot:'temporary',invest:false,...fields});}

// Expectations below are literal outcomes from the four card faces, rather
// than recomputing the new decision registry's formulas inside the test.
for(const cardId of [RCEP,SAUDI_IRAN,ABRAHAM,USMCA]){
 const s=fixture(cardId),snapshot=JSON.stringify(s);
 assert.equal(s.flow.eventResolution.mode,'personal');
 assert.throws(()=>submit(s,{}),/选择/);
 const next=submit(s,{accept:false,productionKey:99,slot:'invalid',invest:true,country:'invalid'});
 assert.deepEqual(balances(next),balances(s));
 assert.deepEqual(next.eventBoard.queued,cardId===ABRAHAM?[CONFLICT]:[]);
 assert.equal(next.eventEffects,undefined,'None of these four decisions grants a persistent effect');
 assert.equal(next.flow.eventResolution.stage,'result');
 assert.equal(JSON.stringify(s),snapshot);
 assert.throws(()=>act(s,'resource',{key:'money',delta:1}),/自动结算/);
 assert.equal(actionAccess(playerView(s,EVENT_DATA[cardId].players[0]),{type:'resource',key:'money',delta:1},EVENT_DATA[cardId].players[0]).allowed,false);
}

// RCEP counts only Asia-Pacific allies, subtracts once per ally and floors at
// zero. Accepting the agreement does not force its subsequent investment.
for(const [names,diplomacy] of [
 [[],5],[['Japan'],4],[['Canada'],5],
 [['Japan','South Korea','New Zealand','Singapore','Thailand'],0],
 [['Japan','South Korea','New Zealand','Singapore','Thailand','Indonesia'],0]
]){
 const s=fixture(RCEP,s=>{s.players.CN.allies=names.map(name=>country(name));s.players.CN.resources[5]=diplomacy;}),next=accept(s);
 assert.equal(next.players.CN.resources[5],0);assert.equal(next.players.CN.money,60);assert.equal(next.players.CN.smart,2);
 assert.deepEqual(next.players.CN.production,[2,1,1,1,1,1,1]);
 assert.deepEqual(next.players.CN.resources.slice(0,5),s.players.CN.resources.slice(0,5),'An event upgrade does not produce a resource');
 assert.equal(next.players.CN.objectiveHistory.productionGains[0],1);
 assert.deepEqual(next.regions.P,s.regions.P,'No investment means no RCEP influence reward');
 assert.deepEqual(next.players.CN.fdi,[]);assert.deepEqual(next.eventBoard.queued,[]);
}
let s=fixture(RCEP,s=>{s.players.CN.resources[5]=4;});rejects(s,{accept:true,productionKey:0,invest:false},/不足/);
s=fixture(RCEP);rejects(s,{accept:true,productionKey:0},/投资|选择/);
for(const key of [undefined,null,-1,7,1.5,'1'])rejects(s,{accept:true,productionKey:key,invest:false},/产能|选择/);
s.players.CN.production[0]=ECONOMY.CN.max[0];rejects(s,{accept:true,productionKey:0,invest:false},/产能|上限/);

// Investment is an ordinary paid action after the event's SP reward. Its new
// SP may ready an exhausted ally; illegal targets/costs roll back everything.
s=fixture(RCEP,s=>{s.players.CN.allies=[japan,canada];s.players.CN.exhaustedAllies=[japan];s.players.CN.money=countryInfo(japan).investmentCost;});
rejects(s,{accept:true,productionKey:1,invest:true,country:japan,slot:'temporary'},/未横置/);
rejects(s,{accept:true,productionKey:1,invest:true,country:canada,slot:'temporary'},/亚太|允许|请选择/);
const investment={accept:true,productionKey:1,invest:true,country:japan,slot:'temporary',investSP:'before'};
let next=submit(s,investment);
assert.equal(next.players.CN.resources[5],6);assert.equal(next.players.CN.money,0);assert.equal(next.players.CN.smart,1);
assert.deepEqual(next.players.CN.fdi,[japan]);assert.deepEqual(next.players.CN.exhaustedAllies,[japan]);
assert.equal(next.players.CN.vp,4);assert.equal(next.regions.P.influence.CN,s.regions.P.influence.CN+1);
assert.deepEqual(next.players.CN.production,[1,2,1,1,1,1,1]);assert.equal(next.flow.eventResolution.investment.country,japan);
const previewBefore=JSON.stringify(s);assert.match(personalEventPreview(s,s.flow.eventResolution,investment),/投资/);assert.equal(JSON.stringify(s),previewBefore);
next=act(JSON.parse(JSON.stringify(next)),'ackEvent');assert.equal(next.eventHistory[0].investment.country,japan);assert.equal(next.flow.step,'aftermath');
s.players.CN.money--;rejects(s,investment,/投资资金不足/);assert.equal(accept(s).players.CN.smart,2);
s=fixture(RCEP,s=>{s.players.CN.allies=[japan];s.players.CN.fdi=[japan];});rejects(s,{...investment,investSP:''},/尚未投资|未投资/);
s=fixture(RCEP,s=>{s.players.CN.allies=[japan];});next=submit(s,{...investment,investSP:'after'});assert.deepEqual(next.players.CN.exhaustedAllies,[]);assert.equal(next.players.CN.smart,1);
s=fixture(RCEP,s=>{s.players.CN.allies=[japan];s.players.CN.growth=[resilience];s.regions.P.temporary=['CN'];syncInfluence(s.regions.P);});
next=submit(s,{...investment,investSP:'',resilience:{timing:'before',index:0}});
assert.equal(next.players.CN.growthUsed[resilience],4);assert.equal(next.regions.P.permanent.filter(id=>id==='CN').length,2);assert.deepEqual(next.regions.P.temporary,['CN']);assert.equal(next.players.CN.vp,4);

// Saudi-Iran has two independent two-diplomacy discounts and no chain.
for(const [names,diplomacy] of [[[],4],[['Iran'],2],[['Saudi Arabia'],2],[['Iran','Saudi Arabia'],0]]){
 s=fixture(SAUDI_IRAN,s=>{s.players.CN.allies=names.map(name=>country(name));s.players.CN.resources[5]=diplomacy;});next=accept(s);
 assert.equal(next.players.CN.resources[5],0);assert.equal(next.players.CN.smart,2);assert.equal(next.players.CN.money,60);
 assert.equal(next.regions.N.influence.CN,s.regions.N.influence.CN+1);assert.equal(next.players.CN.vp,5);assert.deepEqual(next.eventBoard.queued,[]);
}
s=fixture(SAUDI_IRAN,s=>{s.players.CN.resources[5]=3;});rejects(s,{accept:true,slot:'temporary'},/不足/);

// Abraham's regional and named-country discounts add independently. Sudan
// contributes its printed named-country discount despite being in Africa.
for(const [names,diplomacy] of [
 [[],6],[['Saudi Arabia'],5],[['Israel'],4],[['Sudan'],5],
 [['Israel','Sudan','UAE'],1],[['Israel','Sudan','UAE','Egypt'],0],
 [['Israel','Sudan','UAE','Egypt','Jordan'],0]
]){
 s=fixture(ABRAHAM,s=>{s.players.US.allies=names.map(name=>country(name));s.players.US.resources[5]=diplomacy;});next=accept(s);
 assert.equal(next.players.US.resources[5],0);assert.equal(next.players.US.smart,2);assert.equal(next.players.US.vp,5);
 assert.equal(next.regions.N.influence.US,s.regions.N.influence.US+1);assert.deepEqual(next.eventBoard.queued,[CONFLICT]);
 assert.equal(next.eventBoard.seen.filter(id=>id===CONFLICT).length,1);assert.ok(!next.chain.includes(CONFLICT));
 assert.throws(()=>submit(next,{accept:true,slot:'temporary'}),/已结算/);
}
s=fixture(ABRAHAM,s=>{s.players.US.resources[5]=5;});rejects(s,{accept:true,slot:'temporary'},/不足/);
for(const accepted of [true,false]){
 s=fixture(ABRAHAM,s=>{s.eventBoard.seen.push(CONFLICT);s.chain=s.chain.filter(id=>id!==CONFLICT);});
 assert.deepEqual(submit(s,{accept:accepted,slot:'temporary'}).eventBoard.queued,[],'An already seen chain must not be re-added');
}

// USMCA's Canada exception waives diplomacy only, including its starting
// country face. Mexico is not a diplomacy waiver, and income cannot prepay.
for(const [allies,diplomacy] of [[[],2],[[country('Mexico')],2],[[canada],0],[[country('Canada',true)],0]]){
 s=fixture(USMCA,s=>{s.players.US.allies=allies;s.players.US.money=15;s.players.US.resources[5]=diplomacy;});next=accept(s,{productionKey:6});
 assert.equal(next.players.US.money,0);assert.equal(next.players.US.resources[5],0);assert.equal(next.players.US.smart,2);
 assert.equal(next.players.US.production[6],2);assert.equal(next.players.US.resources[6],3);
 assert.equal(next.regions.M.influence.US,s.regions.M.influence.US+1);assert.equal(next.players.US.vp,4);assert.deepEqual(next.eventBoard.queued,[]);
}
s=fixture(USMCA,s=>{s.players.US.money=14;s.players.US.allies=[canada];});rejects(s,{accept:true,productionKey:0,slot:'temporary'},/不足/);
s=fixture(USMCA,s=>{s.players.US.resources[5]=1;});rejects(s,{accept:true,productionKey:0,slot:'temporary'},/不足/);
s=fixture(USMCA);rejects(s,{accept:true,productionKey:0,slot:'invalid'},/影响力/);
s.regions.M.permanent.fill('EU');syncInfluence(s.regions.M);rejects(s,{accept:true,productionKey:0,slot:'permanent'},/满/);

// User ruling: if EVERY production track is full, accepting still pays and
// awards SP/the remaining rewards, while no production choice is required.
for(const cardId of [RCEP,USMCA]){
 const owner=EVENT_DATA[cardId].players[0];s=fixture(cardId,s=>{s.players[owner].production=[...ECONOMY[owner].max];});
 next=accept(s,{productionKey:undefined});
 assert.deepEqual(next.players[owner].production,ECONOMY[owner].max);assert.equal(next.players[owner].smart,2);
 assert.equal(next.players[owner].money,cardId===USMCA?45:60);assert.equal(next.players[owner].resources[5],cardId===USMCA?8:5);
 assert.deepEqual(next.players[owner].objectiveHistory.productionGains,Array(7).fill(0));
 if(cardId===USMCA)assert.equal(next.regions.M.influence.US,s.regions.M.influence.US+1);
}

// Migrated decisions retain their old personal-mode contract, owners,
// side payments and persistent-effect identifiers.
for(const [cardId,owner,money,energy,diplomacy,smart,region,effectId] of [
 ['c7e6c1d828339','RU',10,2,2,2,'C','c93edef6ccf8a'],
 ['c0e00a3125aa7','CN',25,0,2,1,'E','c09c854e149a8'],
 ['c2885a67a8cb7','CN',20,0,2,2,'N','ccd84d77f9734']
]){
 s=fixture(cardId);next=accept(s);
 assert.equal(next.players[owner].money,60-money);assert.equal(next.players[owner].resources[0],3-energy);assert.equal(next.players[owner].resources[5],10-diplomacy);
 assert.equal(next.players[owner].smart,smart);assert.equal(next.regions[region].influence[owner],s.regions[region].influence[owner]+1);
 assert.equal(next.players.EU.money,cardId==='c0e00a3125aa7'?70:60);assert.ok(hasEventEffect(next,owner,effectId));assert.equal(next.flow.eventResolution.mode,'personal');
}

// Room-level path: USMCA -> RCEP -> aftermath, with actual hidden hands and
// decks. Reload preserves the pending choice; retries do not award twice.
const who=Object.fromEntries(seats.map(id=>[id,{user:'decision-check',token:id}]));
let room=newRoom('DEC222',who.US,cards,{wit:true,dd:true});room.status='playing';room.seats=who;
room.state=fixture(USMCA,s=>{s.eventBoard.personal.CN=RCEP;s.eventBoard.seen.push(RCEP);s.players.CN.allies=[japan];});let serial=0;
function send(seat,action){const command={op:'action',id:String(++serial),gameRevision:room.gameRevision,action};room=changeRoom(room,who[seat],command,cards);return command;}
function denied(seat,action,pattern){const before=JSON.stringify(room);assert.throws(()=>send(seat,action),pattern);assert.equal(JSON.stringify(room),before);}
function checkViews(){
 const original=JSON.stringify(room.state);
 for(const seat of seats){
  const view=roomView(room,who[seat]);assert.equal(view.actor,currentActor(room.state));
  assert.deepEqual(decisionModel(view.state,view.state.flow.eventResolution),decisionModel(room.state,room.state.flow.eventResolution),'Decision options must agree on private player views');
  assert.ok(renderPersonalEvent(view.state,view.state.flow.eventResolution,byId));
  for(const other of seats){assert.ok(view.state.players[other].deck.every(id=>id===null));if(other!==seat)assert.ok(view.state.players[other].hand.every(id=>id===null));}
  assert.equal(actionAccess(view.state,{type:'resource',key:'money',delta:1},seat).allowed,false);
 }
 assert.equal(JSON.stringify(room.state),original);
}
checkViews();denied('CN',{type:'submitEvent',cardId:USMCA,accept:true,productionKey:0,slot:'temporary'},/等待美国/);
denied('US',{type:'resource',key:'money',delta:1},/自动结算/);
room=JSON.parse(JSON.stringify(room));let command=send('US',{type:'submitEvent',cardId:USMCA,accept:true,productionKey:0,slot:'temporary'});
let snapshot=JSON.stringify(room);assert.equal(changeRoom(room,who.US,command,cards),room);assert.equal(JSON.stringify(room),snapshot);
denied('US',{type:'submitEvent',cardId:USMCA,accept:true,productionKey:0,slot:'temporary'},/已结算/);
send('US',{type:'ackEvent',cardId:USMCA});assert.equal(roomView(room,who.CN).actor,'CN');assert.equal(room.state.flow.eventResolution.cardId,RCEP);checkViews();
denied('US',{type:'submitEvent',cardId:RCEP,accept:true,productionKey:1,invest:false},/等待中国/);
denied('CN',{type:'submitEvent',cardId:USMCA,accept:true,productionKey:1,invest:false},/已变化/);
room=JSON.parse(JSON.stringify(room));command=send('CN',{type:'submitEvent',cardId:RCEP,accept:true,productionKey:1,invest:true,country:japan,slot:'temporary'});
assert.equal(changeRoom(room,who.CN,command,cards),room);assert.deepEqual(room.state.players.CN.fdi,[japan]);assert.equal(room.state.players.CN.smart,2);
const stale={op:'action',id:'stale-ack',gameRevision:room.gameRevision-1,action:{type:'ackEvent',cardId:RCEP}};
snapshot=JSON.stringify(room);assert.throws(()=>changeRoom(room,who.CN,stale,cards),/已更新|刷新/);assert.equal(JSON.stringify(room),snapshot);
send('CN',{type:'ackEvent',cardId:RCEP});assert.equal(room.state.phase,'余波');assert.equal(room.state.flow.step,'aftermath');
assert.deepEqual(room.state.eventHistory.map(q=>q.cardId),[USMCA,RCEP]);assert.equal(room.state.eventHistory[1].investment.country,japan);
assert.equal(room.state.players.US.money,45);assert.equal(room.state.players.CN.money,60-countryInfo(japan).investmentCost);
assert.deepEqual(room.state.eventHistory.map(q=>q.receipts.length),[1,1],'Each event must keep exactly one authoritative payment/reward receipt');

// A save already being resolved manually remains manual after the registry
// gains an automatic definition, preventing automatic double-payment.
s=fixture(USMCA);s.flow.eventResolution.mode='manual';s.flow.eventResolution.participants=seats;
next=submit(s,{confirmed:true});assert.deepEqual(balances(next),balances(s));assert.equal(next.flow.eventResolution.stage,'resolve');
console.log('Passed four decision events: literal printed costs and stacked discounts, production/full-track ruling, optional paid investment and new SP, resilience, chains, migrated grants, atomic rejection, room handoff/privacy, reload/retry and legacy manual saves.');
