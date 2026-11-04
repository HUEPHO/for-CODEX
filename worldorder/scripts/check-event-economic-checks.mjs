import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {startEventPhase} from '../dist/event-flow.js';
import {EVENT_DATA} from '../dist/event-data.js';
import {economicCheckCondition,resolveEconomicCheck} from '../dist/event-economic-checks.js';
import {renderEconomicCheckEvent} from '../dist/event-economic-checks-ui.js';
import {resolveBasicEffect} from '../dist/basic-actions.js';
import {investmentPreview,syncInfluence} from '../dist/world.js';
import {hasEventEffect,eventTradeRegions} from '../dist/event-effects.js';
import {tradeCapacity} from '../dist/trade.js';
import {newRoom,changeRoom,playerView} from '../server/rooms.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const ids=['US','CN','EU','RU'],ceta='c1def0449fb8a',cpec='c84925e4d16b2',pak='cd3e3a0f1fe94',pakUpgrade='cf9017c518b87',canada='c5edff473d37a',brazil='cb4eb4d5ab2b9';
function fixture(cardId,edit=()=>{}){
 const s=createState(cards,{wit:true,dd:false},()=>.3);
 for(const p of Object.values(s.players)){p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.money=100;p.resources=[8,8,5,5,5,10,6];p.allies=[];p.fdi=[];p.bases=[];p.exhaustedAllies=[];p.smart=0;p.vp=0;p.focus=null;p.growth=[];}
 s.round=4;s.flow=newFlow(ids,4);s.flow.step='events';s.phase='事件';s.initialOrder=ids;s.actionTurns={index:16,completed:{US:4,CN:4,EU:4,RU:4}};
 const owner=EVENT_DATA[cardId].players[0];s.current=owner;
 s.eventBoard={round:4,slots:[null,null,null],personal:Object.fromEntries(ids.map(id=>[id,id===owner?cardId:null])),queued:[],seen:[cardId],choice:null,revealQueue:[],distribution:null};
 s.events=[];s.eraDeck=[];s.era2Deck=[];s.eventHistory=[];s.eventDiscard=[];
 if(cardId===ceta)s.players.EU.allies=[canada,brazil];else{s.players.CN.allies=[pak];s.players.CN.fdi=[pak];}
 edit(s);startEventPhase(s);assert.equal(s.flow.eventResolution.mode,'personal');return s;
}
const submit=(s,a={})=>applyAction(s,{type:'submitEvent',cardId:s.flow.eventResolution.cardId,...a});
function rejects(s,a,re){const before=JSON.stringify(s);assert.throws(()=>submit(s,a),re);assert.equal(JSON.stringify(s),before);assert.throws(()=>resolveEconomicCheck(s,s.flow.eventResolution,a),re);assert.equal(JSON.stringify(s),before);}
// Intervention costs precede the reward. Normal discounts, marker limits,
// influence and growth are delegated to the existing intervention executor.
let s=fixture(ceta,s=>{s.players.EU.allies=[canada];});let next=submit(s,{accept:true});assert.equal(next.players.EU.smart,0);assert.equal(next.eventEffects,undefined);
s=fixture(ceta);const initial=JSON.stringify(s);
assert.match(resolveEconomicCheck(s,s.flow.eventResolution,{accept:true,slot:'permanent'},{preview:true}),/支付4外交/);assert.equal(JSON.stringify(s),initial);
rejects(s,{accept:true,slot:'permanent',engageSP:1},/SP/);rejects(s,{accept:true,slot:'permanent',region:'E'},/只能介入美洲/);
next=submit(s,{accept:true,slot:'permanent'});assert.equal(next.players.EU.resources[5],6);assert.equal(next.players.EU.smart,1);assert.equal(next.players.EU.vp,1);assert.equal(next.regions.M.engage.EU,s.regions.M.engage.EU+1);assert.ok(hasEventEffect(next,'EU','c7111682c7ac8'));assert.deepEqual(eventTradeRegions(next,'EU'),['M']);assert.deepEqual(eventTradeRegions(next,'US'),[]);
assert.equal(submit(s,{accept:false}).eventEffects,undefined);assert.equal(submit(s,{accept:false}).players.EU.smart,0);
s=fixture(ceta,s=>{s.players.EU.smart=1;s.players.EU.resources[5]=0;});next=submit(s,{accept:true,slot:'temporary',engageSP:1,exhaust:[canada]});assert.equal(next.players.EU.smart,1);assert.deepEqual(next.players.EU.exhaustedAllies,[canada]);assert.equal(next.players.EU.resources[5],0);
s=fixture(ceta,s=>{s.players.EU.resources[5]=3;});rejects(s,{accept:true,slot:'temporary'},/外交不足/);
s=fixture(ceta,s=>{s.regions.E.engage.EU=3;});rejects(s,{accept:true,slot:'temporary'},/标记已用完/);next=submit(s,{accept:true,slot:'temporary',moveFrom:'E'});assert.equal(next.regions.E.engage.EU,2);assert.equal(next.regions.M.engage.EU,1);
s=fixture(ceta,s=>{s.regions.M.permanent.fill('US');syncInfluence(s.regions.M);});rejects(s,{accept:true,slot:'permanent'},/满/);
s=fixture(ceta,s=>{s.players.EU.growth=['cc77fe93f8768'];s.regions.M.temporary=['EU'];syncInfluence(s.regions.M);});next=submit(s,{accept:true,slot:'temporary',resilience:{timing:'before',index:0}});assert.equal(next.players.EU.growthUsed.cc77fe93f8768,4);assert.equal(next.regions.M.permanent.filter(x=>x==='EU').length,s.regions.M.permanent.filter(x=>x==='EU').length+1);
// The new trade agreement is owner-scoped and uses the same displayed-country
// capacity rules as existing agreements, including deduplication.
const cap=tradeCapacity(next,'EU');assert.deepEqual(cap,tradeCapacity({...next,eventEffects:[]},'EU',{virtualRegions:['M']}));assert.deepEqual(cap,tradeCapacity(next,'EU',{virtualRegions:['M']}));
// CPEC's mandatory SP comes first, and can pay for readying the ally. A second
// investment must remain a second token through income and country upgrades.
s=fixture(cpec,s=>{s.players.CN.fdi=[];});next=submit(s,{accept:true});assert.equal(next.players.CN.smart,0);assert.deepEqual(next.players.CN.fdi,[]);
s=fixture(cpec);next=submit(s,{accept:false});assert.equal(next.players.CN.smart,2);assert.equal(next.players.CN.money,100);assert.equal(next.players.CN.resources[5],10);assert.deepEqual(next.players.CN.fdi,[pak]);
const beforeCpec=JSON.stringify(s);assert.match(resolveEconomicCheck(s,s.flow.eventResolution,{accept:true,country:pak,slot:'temporary'},{preview:true}),/增加一份投资/);assert.equal(JSON.stringify(s),beforeCpec);
next=submit(s,{accept:true,country:pak,slot:'temporary'});assert.equal(next.players.CN.smart,2);assert.equal(next.players.CN.money,85);assert.equal(next.players.CN.resources[5],8);assert.deepEqual(next.players.CN.fdi,[pak,pak]);assert.deepEqual(next.players.CN.exhaustedAllies,[pak]);assert.equal(investmentPreview(next,'CN').fdi,8);
next=JSON.parse(JSON.stringify(next));assert.equal(economicCheckCondition(next,next.flow.eventResolution).count,2);assert.throws(()=>submit(next,{accept:false}),/已结算/);
next.current='CN';next.regions.S.countryPiles={left:[pakUpgrade],right:[]};next.regions.S.available=[pakUpgrade];next.regions.S.deck=[];
resolveBasicEffect(next,{country:pakUpgrade,slot:'temporary'},{name:'结盟',effect:'relations'});assert.deepEqual(next.players.CN.fdi,[pakUpgrade,pakUpgrade]);assert.equal(investmentPreview(next,'CN').fdi,12);assert.equal(economicCheckCondition(next,next.flow.eventResolution).count,2);
s=fixture(cpec,s=>{s.players.CN.exhaustedAllies=[pak];});rejects(s,{accept:true,country:pak,slot:'temporary'},/未横置/);next=submit(s,{accept:true,country:pak,slot:'temporary',investSP:'before'});assert.equal(next.players.CN.smart,1);assert.deepEqual(next.players.CN.exhaustedAllies,[pak]);assert.deepEqual(next.players.CN.fdi,[pak,pak]);
s=fixture(cpec);next=submit(s,{accept:true,country:pak,slot:'temporary',investSP:'after'});assert.equal(next.players.CN.smart,1);assert.deepEqual(next.players.CN.exhaustedAllies,[]);
s=fixture(cpec,s=>{s.players.CN.resources[5]=1;});rejects(s,{accept:true,country:pak,slot:'temporary'},/2外交/);assert.equal(submit(s,{accept:false}).players.CN.smart,2);
s=fixture(cpec,s=>{s.players.CN.money=14;});rejects(s,{accept:true,country:pak,slot:'temporary'},/资金不足/);rejects(s,{accept:true,country:canada,slot:'temporary'},/巴基斯坦/);
s=fixture(cpec,s=>{s.players.CN.fdi=[pak,pak];});next=submit(s,{accept:true,country:pak,slot:'temporary'});assert.equal(next.players.CN.fdi.length,3);
// Saved results retain investment receipts; masked views render public choices,
// room authority rejects other seats and repeat command ids pay only once.
const identity=Object.fromEntries(ids.map(id=>[id,{user:'economic-test',token:id}]));let room=newRoom('ECONCHECK',identity.US,cards,{wit:true,dd:false});room.status='playing';room.seats=identity;room.state=fixture(cpec);
const command={op:'action',id:'cpec-1',gameRevision:room.gameRevision,action:{type:'submitEvent',cardId:cpec,accept:true,country:pak,slot:'temporary'}};
assert.throws(()=>changeRoom(room,identity.EU,command,cards),/等待中国/);room=changeRoom(room,identity.CN,command,cards);assert.equal(changeRoom(room,identity.CN,command,cards),room);assert.equal(room.state.players.CN.fdi.length,2);
let saved=JSON.parse(JSON.stringify(room.state));saved=applyAction(saved,{type:'ackEvent',cardId:cpec});assert.equal(saved.eventHistory[0].investment.country,pak);assert.equal(saved.eventHistory[0].investment.money,15);
for(const card of [ceta,cpec]){s=fixture(card);const view=playerView(s,EVENT_DATA[card].players[0]);assert.match(renderEconomicCheckEvent(view,view.flow.eventResolution,byId),/personal-event-form/);assert.deepEqual(economicCheckCondition(view,view.flow.eventResolution),economicCheckCondition(s,s.flow.eventResolution));}
console.log('Passed CETA/CPEC: condition, optional rewards, SP timing, normal fees, exhaustion, marker movement, resilience, trade effect, multiple FDI income/upgrade, atomic rollback, reload and room retries.');
