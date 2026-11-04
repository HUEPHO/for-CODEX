import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {startEventPhase} from '../dist/event-flow.js';
import {EVENT_DATA} from '../dist/event-data.js';
import {countryInfo} from '../dist/country-actions.js';
import {RESEARCH_DATA} from '../dist/research-data.js';
import {hasEventEffect,grantEventEffect} from '../dist/event-effects.js';
import {incomeEffectActor} from '../dist/event-income.js';
import {currentActor,aftermathSteps} from '../dist/phase-state.js';
import {renderRoomFlow} from '../dist/room-ui.js';
import {renderIncomeHistory} from '../dist/event-income-ui.js';
import {renderPersonalEvent} from '../dist/event-personal-ui.js';
import {tradeCapacity,tradePreview} from '../dist/trade.js';
import {newRoom,changeRoom,roomView,playerView} from '../server/rooms.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const CEE_EVENT='c0e00a3125aa7',IRAN_EVENT='c2885a67a8cb7',TPP_EVENT='cd84688476fde',CEE='c09c854e149a8',IRAN='ccd84d77f9734',TPP='cd3f9ccd1ba13',ids=['US','CN','EU','RU'];
const country=(name,starting=false)=>Object.keys(RESEARCH_DATA).find(id=>RESEARCH_DATA[id].countryName===name&&!!RESEARCH_DATA[id].starting===starting);
function base(){const s=createState(cards,{wit:true,dd:true},()=>.3);for(const p of Object.values(s.players)){p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.allies=[];p.fdi=[];p.bases=[];p.exhaustedAllies=[];p.money=60;p.vp=0;p.smart=0;p.resources=[1,2,2,2,2,6,1];}s.round=3;s.phase='事件';s.initialOrder=ids;s.flow=newFlow(ids,3);s.flow.step='events';s.actionTurns={index:16,completed:{US:4,CN:4,EU:4,RU:4}};s.eraDeck=[];s.era2Deck=[];s.eventHistory=[];s.eventDiscard=[];return s;}
function event(cardId,edit=()=>{}){const s=base(),owner=EVENT_DATA[cardId].players[0];s.eventBoard={round:3,slots:[null,null,null],personal:Object.fromEntries(ids.map(id=>[id,id===owner?cardId:null])),seen:[cardId],queued:[],choice:null,revealQueue:[],distribution:null};s.events=[];edit(s);startEventPhase(s);return s;}
function income(effects=[CEE,IRAN],edit=()=>{},order=['CN','EU','US','RU']){const s=base();s.phase='余波';s.flow=newFlow(order,3);s.flow.step='aftermath';s.current=order[0];s.eventBoard.choice=null;s.eventBoard.distribution=null;for(const id of effects)grantEventEffect(s,'CN',id,id===CEE?CEE_EVENT:IRAN_EVENT);edit(s);return s;}
const act=(s,type,fields={})=>applyAction(s,{type,...fields}),submit=(s,a={})=>act(s,'submitEvent',{cardId:s.flow.eventResolution.cardId,...a}),effect=(s,effectId,choice)=>act(s,'resolveIncomeEffect',{effectId,choice});
function rejects(s,type,a,pattern){const before=JSON.stringify(s);assert.throws(()=>act(s,type,a),pattern);assert.equal(JSON.stringify(s),before);}
function result(s,a){return submit(s,{accept:true,slot:'temporary',...a});}
// Event payments, optional declines, and ownership are verified through the
// same full engine entry point that the server uses.
let s=event(CEE_EVENT,s=>{s.players.CN.money=25;s.players.CN.resources[5]=2;s.players.EU.money=0;});let next=result(s);
assert.equal(next.players.CN.money,0);assert.equal(next.players.CN.resources[5],0);assert.equal(next.players.CN.smart,1);assert.equal(next.players.EU.money,10);assert.ok(hasEventEffect(next,'CN',CEE));assert.equal(next.regions.E.influence.CN,s.regions.E.influence.CN+1);
s.players.CN.money=24;rejects(s,'submitEvent',{cardId:CEE_EVENT,accept:true,slot:'temporary'},/不足/);assert.equal(submit(s,{accept:false}).players.EU.money,0);
s=event(IRAN_EVENT,s=>{s.players.CN.allies=[country('Iran')];s.players.CN.money=20;s.players.CN.resources[5]=0;});next=result(s);assert.equal(next.players.CN.money,0);assert.equal(next.players.CN.smart,2);assert.ok(hasEventEffect(next,'CN',IRAN));
s=event(IRAN_EVENT);next=result(s);assert.equal(next.players.CN.resources[5],4);assert.equal(next.players.CN.money,40);assert.match(renderPersonalEvent(s,s.flow.eventResolution,byId),/有伊朗盟国/);
// TPP is a decision, including when its diplomatic price reaches zero. Joining
// and optionally investing are distinct from declining the entire agreement.
s=event(TPP_EVENT);next=result(s,{invest:false});assert.equal(next.players.US.resources[5],0);assert.equal(next.players.US.smart,3);assert.ok(hasEventEffect(next,'US',TPP));assert.equal(next.eventBoard.queued.length,0);
next=submit(s,{accept:false});assert.deepEqual(next.eventBoard.queued,['c171711d668df']);assert.equal(next.eventEffects,undefined);assert.equal(next.players.US.resources[5],6);
s=event(TPP_EVENT,s=>{s.players.US.allies=['Canada','Mexico','Japan','South Korea','Australia','New Zealand'].map(name=>country(name));s.players.US.resources[5]=0;});next=result(s,{invest:false});assert.equal(next.players.US.smart,3);assert.equal(next.players.US.resources[5],0);
const japan=country('Japan');s=event(TPP_EVENT,s=>{s.players.US.allies=[japan];s.players.US.exhaustedAllies=[japan];s.players.US.resources[5]=5;s.players.US.money=countryInfo(japan).investmentCost;});
rejects(s,'submitEvent',{cardId:TPP_EVENT,accept:true,invest:true,country:japan,slot:'temporary'},/未横置/);
next=result(s,{invest:true,country:japan,investSP:'before'});assert.equal(next.players.US.smart,2);assert.equal(next.players.US.money,0);assert.deepEqual(next.players.US.fdi,[japan]);assert.deepEqual(next.players.US.exhaustedAllies,[japan]);assert.equal(next.flow.eventResolution.investment.country,japan);
s.players.US.money--;rejects(s,'submitEvent',{cardId:TPP_EVENT,accept:true,invest:true,country:japan,investSP:'before',slot:'temporary'},/投资资金不足/);assert.equal(result(s,{invest:false}).players.US.smart,3);
// The granted TPP effect immediately enables only its two regions, respects
// prohibited alliances and shares de-duplication with SP/card-based capacity.
s=event(TPP_EVENT);s=result(s,{invest:false});s.players.US.allies=[];s.regions.M.available=[country('Canada')];s.regions.P.available=[country('Japan'),country('North Korea')];
const cap=tradeCapacity(s,'US'),without=tradeCapacity({...s,eventEffects:[]},'US',{virtualRegions:['M','P']});assert.deepEqual(cap,without);assert.deepEqual(tradeCapacity(s,'US',{virtualRegions:['M','P']},['M','P']),cap);
s.regions.P.available=[country('North Korea')];const remainingCap=tradeCapacity(s,'US');assert.deepEqual(remainingCap.byRegion.P.exports,Array(7).fill(0));assert.equal(tradePreview(s,{exports:[{key:remainingCap.exports.findIndex(n=>n>0),quantity:1}]},{name:'贸易'}).smartCost,0);
// Start in an actual newly granted event, acknowledge it, then use its income
// effect in the ensuing aftermath. Base income cannot be claimed twice.
s=event(IRAN_EVENT,s=>{s.flow.order=['CN','EU','US','RU'];s.players.CN.allies=[japan];s.players.CN.fdi=[japan];});s=result(s);s=act(s,'ackEvent',{cardId:IRAN_EVENT});assert.equal(s.phase,'余波');const oldMoney=s.players.CN.money;
s=act(s,'resolveInvestments');assert.equal(s.players.CN.money,oldMoney+2*countryInfo(japan).countryValue);assert.equal(s.flow.investmentDone.length,0);assert.equal(currentActor(s),'CN');const firstIncome=s.players.CN.money;
rejects(s,'resolveInvestments',{},/基础投资收益已领取/);rejects(s,'resource',{key:'money',delta:1},/持续事件收益/);rejects(s,'resolveProsperity',{improve:false},/持续事件收益/);rejects(s,'resolveIncomeEffect',{effectId:CEE,choice:'offer'},/不属于/);
s=effect(JSON.parse(JSON.stringify(s)),IRAN,'energy');assert.equal(s.players.CN.money,firstIncome);assert.equal(s.players.CN.resources[0],3);assert.deepEqual(s.flow.investmentDone,['CN']);assert.equal(currentActor(s),'EU');assert.equal(s.incomeEffectHistory.length,1);assert.equal(s.players.CN.objectiveHistory.bestFdiReturn,2*countryInfo(japan).countryValue);
// Multiple effects allow owner-selected order. Ordinary capacity overflow is
// paid correctly, and obtaining a resource does not ready commodity cards.
s=income([CEE,IRAN],s=>{s.players.CN.resources[0]=9;s.players.CN.money=0;s.players.EU.money=10;});s=act(s,'resolveInvestments');s=effect(s,IRAN,'energy');assert.equal(s.players.CN.resources[0],10);assert.equal(s.players.CN.money,3);assert.equal(s.flow.pendingIncome.remaining.length,1);assert.equal(currentActor(s),'CN');
rejects(s,'resolveIncomeEffect',{effectId:IRAN,choice:'money'},/已经结算/);s=effect(s,CEE,'offer');assert.equal(currentActor(s),'EU');assert.equal(incomeEffectActor(playerView(s,'US')),'EU');
const euView=renderRoomFlow(playerView(s,'EU'),byId),cnView=renderRoomFlow(playerView(s,'CN'),byId);assert.match(euView,/欧盟操作/);assert.match(cnView,/data-income-choice="buy" disabled/);
next=effect(JSON.parse(JSON.stringify(s)),CEE,'buy');assert.equal(next.players.EU.money,0);assert.equal(next.players.CN.money,13);assert.equal(next.players.EU.resources[3],3);assert.equal(next.players.CN.resources[3],2);assert.equal(next.players.CN.commerce.filter(c=>c.ready).length,1);assert.equal(next.players.CN.resources[5],6);assert.equal(next.flow.pendingIncome,null);assert.deepEqual(next.flow.investmentDone,['CN']);assert.equal(next.incomeEffectHistory[0].receipts.length,3);assert.match(renderIncomeHistory(next),/翻用中国第1张贸易卡/);
// Declining hands control back to China, which must pay actual goods before
// receiving 15; empty stock still leaves the guaranteed 5-money choice.
s=effect(s,CEE,'decline');assert.equal(currentActor(s),'CN');s=effect(s,CEE,'goods');assert.equal(s.players.CN.resources[3],1);assert.equal(s.players.CN.money,18);assert.equal(s.players.EU.money,10);assert.equal(s.players.CN.commerce.filter(c=>c.ready).length,2);
for(const fail of ['money','commerce']){
 s=income([CEE],s=>{s.players.CN.resources[3]=0;if(fail==='money')s.players.EU.money=9;else s.players.CN.commerce.forEach(c=>c.ready=false);});s=act(s,'resolveInvestments');s=effect(s,CEE,'offer');const cnMoney=s.players.CN.money;
 rejects(s,'resolveIncomeEffect',{effectId:CEE,choice:'buy'},fail==='money'?/资金不足/:/没有可翻用/);assert.match(renderRoomFlow(playerView(s,'EU'),byId),/当前不能购买/);
 s=effect(s,CEE,'decline');rejects(s,'resolveIncomeEffect',{effectId:CEE,choice:'goods'},/没有可支付/);s=effect(s,CEE,'money');assert.equal(s.players.CN.money,cnMoney+5);
}
s=income([CEE],s=>{s.players.EU.resources[3]=10;s.players.EU.money=10;});s=act(s,'resolveInvestments');s=effect(s,CEE,'offer');s=effect(s,CEE,'buy');assert.equal(s.players.EU.resources[3],10);assert.equal(s.players.EU.money,10);assert.equal(s.players.EU.commerce.filter(c=>c.ready).length,2);
// EU can respond even after finishing its own income. CN finishing last only
// advances the overall step after every effect, and each effect returns next round.
s=income([CEE,IRAN],()=>{},['EU','US','RU','CN']);for(let i=0;i<4;i++)s=act(s,'resolveInvestments');assert.deepEqual(s.flow.investmentDone,['EU','US','RU']);s=effect(s,CEE,'offer');assert.equal(currentActor(s),'EU');s=effect(s,CEE,'buy');assert.equal(aftermathSteps(s)[s.flow.checks.length],'投资回报');s=effect(s,IRAN,'money');assert.equal(aftermathSteps(s)[s.flow.checks.length],'繁荣提升');assert.equal(currentActor(s),'EU');assert.equal(s.flow.pendingIncome,null);
const allHistory=s.incomeEffectHistory.length;s.round=4;s.flow.round=4;s.flow.checks=[];s.flow.investmentDone=[];for(let i=0;i<4;i++)s=act(s,'resolveInvestments');s=effect(s,IRAN,'money');s=effect(s,CEE,'offer');s=effect(s,CEE,'decline');s=effect(s,CEE,'money');assert.equal(s.incomeEffectHistory.length,allHistory+1);assert.equal(s.incomeEffectHistory.at(-1).round,4);
s=income([]);s=act(s,'resolveInvestments');assert.equal(s.flow.pendingIncome,undefined);assert.equal(s.current,'EU');
// Real room retries must not double-pay or flip another commodity card. A
// seat cannot impersonate the responder or escape into manual resource edits.
const who=Object.fromEntries(ids.map(id=>[id,{user:'income-test',token:id}]));let room=newRoom('INC222',who.US,cards,{wit:true,dd:true});room.status='playing';room.seats=who;room.state=income([CEE,IRAN]);let n=0;
function send(seat,action){const cmd={op:'action',id:String(++n),gameRevision:room.gameRevision,action};room=changeRoom(room,who[seat],cmd,cards);return cmd;}
send('CN',{type:'resolveInvestments'});assert.throws(()=>send('EU',{type:'resolveIncomeEffect',effectId:CEE,choice:'offer'}),/等待中国/);send('CN',{type:'resolveIncomeEffect',effectId:CEE,choice:'offer'});
assert.throws(()=>send('CN',{type:'resolveIncomeEffect',effectId:CEE,choice:'buy'}),/等待欧盟/);assert.throws(()=>send('EU',{type:'resource',key:'money',delta:10}),/持续事件收益/);
let command=send('EU',{type:'resolveIncomeEffect',effectId:CEE,choice:'buy'});const snapshot=JSON.stringify(room);assert.equal(changeRoom(room,who.EU,command,cards),room);assert.equal(JSON.stringify(room),snapshot);assert.equal(roomView(room,who.CN).actor,'CN');room=JSON.parse(snapshot);
command=send('CN',{type:'resolveIncomeEffect',effectId:IRAN,choice:'money'});assert.equal(changeRoom(room,who.CN,command,cards),room);assert.equal(room.state.flow.pendingIncome,null);assert.equal(room.state.players.CN.money,75);assert.equal(room.state.players.EU.money,50);assert.equal(room.state.settlementJournal.filter(r=>r.title==='结算持续事件收益').length,3);
for(const seat of ids){const view=roomView(room,who[seat]);assert.ok(renderRoomFlow(view.state,byId));for(const other of ids.filter(id=>id!==seat))assert.ok(view.state.players[other].hand.every(id=>id===null));}
console.log('Passed three linked events and income effects: event-to-aftermath, TPP optional investment/trade, owner-selected order, EU response/decline/fallback, caps, once-per-round, rollback, reload, room authority and retry accounting.');
