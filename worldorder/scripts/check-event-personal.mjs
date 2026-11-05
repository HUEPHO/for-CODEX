import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {startEventPhase,canPostponeEvent} from '../dist/event-flow.js';
import {EVENT_DATA} from '../dist/event-data.js';
import {EVENT_CHAINS} from '../dist/event-board.js';
import {personalEventPreview} from '../dist/event-personal.js';
import {hasEventEffect,grantEventEffect} from '../dist/event-effects.js';
import {renderPersonalEvent} from '../dist/event-personal-ui.js';
import {renderEventEffects} from '../dist/event-effects-ui.js';
import {renderTradeForm} from '../dist/trade-ui.js';
import {renderEventPanel} from '../dist/event-ui.js';
import {tradeCapacity,tradePreview} from '../dist/trade.js';
import {countryInfo} from '../dist/country-actions.js';
import {RESEARCH_DATA} from '../dist/research-data.js';
import {syncInfluence} from '../dist/world.js';
import {newRoom,changeRoom,roomView,playerView} from '../server/rooms.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c])),ids=['US','CN','EU','RU'];
const aiib='ca8e271f31adf',eaeu='c7e6c1d828339',cafta='c72c028872d0f',turk='ce6ac843efc6e',pivot='c4f52659f1ea9';
const country=(name,starting=false)=>Object.keys(RESEARCH_DATA).find(id=>RESEARCH_DATA[id].countryName===name&&!!RESEARCH_DATA[id].starting===starting);
function fixture(cardId,edit=()=>{}){
 const s=createState(cards,{wit:true,dd:false},()=>.3);for(const p of Object.values(s.players)){p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.money=100;p.resources=[8,8,5,5,5,10,6];p.allies=[];p.fdi=[];p.bases=[];p.exhaustedAllies=[];p.vp=0;}
 s.round=3;s.flow=newFlow(ids,3);s.flow.step='events';s.phase='事件';s.initialOrder=ids;s.actionTurns={index:16,completed:{US:4,CN:4,EU:4,RU:4}};
 const owner=EVENT_DATA[cardId].players[0];s.current=owner;
 s.eventBoard={round:3,slots:[null,null,null],personal:Object.fromEntries(ids.map(id=>[id,id===owner?cardId:null])),queued:[],seen:[cardId],choice:null,revealQueue:[],distribution:null};
 s.events=[];s.eraDeck=[];s.era2Deck=[];s.eventHistory=[];s.eventDiscard=[];edit(s);startEventPhase(s);return s;
}
const act=(s,type,fields={})=>applyAction(s,{type,cardId:s.flow.eventResolution.cardId,...fields}),submit=(s,a={})=>act(s,'submitEvent',a);
function rejects(s,a,pattern){const before=JSON.stringify(s);assert.throws(()=>submit(s,a),pattern);assert.equal(JSON.stringify(s),before);}
const tai=country('Thailand'),kz=country('Kazakhstan'),kg=country('Kyrgystan'),turkey=country('Turkey');
assert.ok(tai&&kz&&kg&&turkey);
// AIIB checks the threshold before payment; preparation, normal costs, FDI,
// exhaustion and influence are one atomic action, with ordinary SP/growth hooks.
let s=fixture(aiib,s=>{s.players.CN.money=49;});s=submit(s,{accept:true});assert.equal(s.players.CN.money,49);assert.match(s.flow.eventResolution.result,/未满足/);
s=fixture(aiib,s=>{s.players.CN.money=50;s.players.CN.allies=[tai];s.players.CN.exhaustedAllies=[tai];});
const before=JSON.stringify(s);assert.match(personalEventPreview(s,s.flow.eventResolution,{accept:true,country:tai,slot:'permanent'}),/重整并投资/);assert.equal(JSON.stringify(s),before);
rejects(s,{accept:true,country:kz,slot:'temporary'},/本方/);rejects(s,{accept:true,country:tai,slot:'bad'},/影响力/);
let next=submit(s,{accept:true,country:tai,slot:'permanent'});assert.equal(next.players.CN.money,50-countryInfo(tai).investmentCost);assert.equal(next.players.CN.resources[5],8);assert.deepEqual(next.players.CN.fdi,[tai]);assert.deepEqual(next.players.CN.exhaustedAllies,[tai]);assert.equal(next.players.CN.vp,1);assert.equal(next.players.CN.smart,2);assert.ok(!canPostponeEvent(next));assert.throws(()=>submit(next,{accept:true}),/已结算/);
next=submit(JSON.parse(before),{accept:true,country:tai,slot:'temporary',investSP:'after'});assert.deepEqual(next.players.CN.exhaustedAllies,[]);assert.equal(next.players.CN.smart,1);
assert.equal(next.flow.eventResolution.investment.country,tai);assert.match(renderEventPanel(next,byId),/投资盟国/);assert.equal(act(JSON.parse(JSON.stringify(next)),'ackEvent').eventHistory[0].investment.country,tai);
s.players.CN.fdi=[tai];rejects(s,{accept:true,country:tai,slot:'temporary'},/尚未投资/);next=submit(s,{accept:false});assert.equal(next.players.CN.resources[5],10);assert.equal(next.players.CN.money,50);
s=fixture(aiib,s=>{s.players.CN.resources[5]=1;s.players.CN.allies=[tai];});rejects(s,{accept:true,country:tai,slot:'temporary'},/不足/);assert.equal(submit(s,{accept:false}).players.CN.resources[5],1);
s=fixture(aiib,s=>{s.players.CN.allies=[tai];s.players.CN.smart=0;s.regions.P.permanent.fill('EU');});rejects(s,{accept:true,country:tai,slot:'permanent'},/满/);rejects(s,{accept:true,country:tai,slot:'temporary',investSP:'after'},/SP/);
assert.match(renderPersonalEvent(playerView(s,'CN'),s.flow.eventResolution,byId),/泰国/);assert.match(renderEventPanel(s,byId),/自动结算/);
// EAEU recognizes both printed allies, applies the discount once per country,
// and grants a permanent, owner-scoped, idempotent effect record.
for(let n=0;n<=2;n++){
 s=fixture(eaeu,s=>{s.players.RU.money=10;s.players.RU.resources[0]=2;s.players.RU.resources[5]=2-n;s.players.RU.allies=[kz,kg].slice(0,n);});
 next=submit(s,{accept:true,slot:'temporary'});assert.equal(next.players.RU.money,0);assert.equal(next.players.RU.resources[0],0);assert.equal(next.players.RU.resources[5],0);assert.equal(next.players.RU.smart,4);assert.equal(next.regions.C.influence.RU,s.regions.C.influence.RU+1);assert.ok(hasEventEffect(next,'RU','c93edef6ccf8a'));
 grantEventEffect(next,'RU','c93edef6ccf8a',eaeu);assert.equal(next.eventEffects.length,1);assert.ok(!hasEventEffect(next,'CN','c93edef6ccf8a'));assert.match(renderEventEffects(next),/俄罗斯/);
}
s=fixture(eaeu,s=>{s.players.RU.resources[0]=1;});rejects(s,{accept:true,slot:'temporary'},/不足/);assert.equal(submit(s,{accept:false}).eventEffects,undefined);
// TurkStream pays before selling; sales cannot fund the activation. Turkey
// waives diplomacy, not the 10 money. Invalid counts roll back the whole choice.
s=fixture(turk,s=>{s.players.RU.money=9;});rejects(s,{accept:true,slot:'temporary',energy:5},/不足/);
s=fixture(turk,s=>{s.players.RU.money=10;s.players.RU.allies=[turkey];s.players.RU.resources[5]=0;});rejects(s,{accept:true,slot:'temporary',energy:6},/限额/);rejects(s,{accept:true,slot:'temporary',energy:-1},/限额/);
next=submit(s,{accept:true,slot:'temporary',energy:5});assert.equal(next.players.RU.money,25);assert.equal(next.players.RU.resources[0],3);assert.equal(next.players.RU.resources[5],0);assert.equal(next.regions.N.influence.RU,s.regions.N.influence.RU+1);
s=fixture(turk);next=submit(s,{accept:true,slot:'permanent',energy:0});assert.equal(next.players.RU.resources[5],7);assert.equal(next.players.RU.money,90);
// CAFTA counts the named allied countries,
// queues only its named chain and exposes eligible live market symbols for free.
s=fixture(cafta);next=submit(s);assert.equal(next.eventEffects,undefined);assert.equal(next.eventBoard.queued.length,0);
s=fixture(cafta,s=>{s.players.CN.allies=[tai,country('Vietnam')];});
next=submit(s);assert.equal(next.players.CN.smart,6);assert.ok(hasEventEffect(next,'CN','c5e448d194d63'));assert.deepEqual(next.eventBoard.queued,['c171711d668df']);
let saved=JSON.parse(JSON.stringify(next));assert.ok(hasEventEffect(saved,'CN','c5e448d194d63'));saved=act(saved,'ackEvent');assert.equal(saved.flow.step,'aftermath');assert.ok(saved.eventHistory[0].receipts[0].detail.includes('CAFTA'));
s=fixture(cafta,s=>{s.players.CN.allies=[tai];s.eventBoard.seen.push('c171711d668df');});assert.equal(submit(s).eventBoard.queued.length,0);
// Effect capacities use currently displayed cards, preserve flag/region limits,
// avoid duplicates with SP or card-provided regions, and leave ownership alone.
s=fixture(cafta,s=>{s.players.CN.allies=[tai];});s=submit(s);s.players.CN.allies=[];s.regions.P.available=[country('Indonesia')];s.regions.S.available=[country('Myanmar')];
const virtualCap=tradeCapacity(s,'CN'),explicitCap=tradeCapacity({...s,eventEffects:[]},'CN',{virtualRegions:['P','S']});assert.deepEqual(virtualCap,explicitCap);assert.deepEqual(tradeCapacity(s,'CN',{virtualRegions:['P','S']},['P','S']),virtualCap);assert.deepEqual(s.players.CN.allies,[]);
assert.deepEqual(tradeCapacity(s,'US'),tradeCapacity({...s,eventEffects:[]},'US'));
s.regions.P.available=[];assert.deepEqual(tradeCapacity(s,'CN').byRegion.P.exports,Array(7).fill(0));
assert.deepEqual(tradeCapacity(s,'CN',{tradeOnlyRegions:['N']}).exports,Array(7).fill(0));
s.regions.P.available=[country('Indonesia')];const key=tradeCapacity(s,'CN').exports.findIndex(n=>n>0);s.current='CN';const trade=tradePreview(s,{exports:[{key,quantity:1}]},{name:'国际贸易'});assert.equal(trade.smartCost,0);assert.equal(trade.transactions[0].quantity,1);assert.equal(s.players.CN.smart,4);
const html=renderTradeForm(s,'c0297b4923ea2',{name:'世界工厂'});assert.match(html,/CAFTA协议/);assert.ok(!html.includes('data-trade-region="P"'));assert.ok(!html.includes('data-trade-region="S"'));
// EAEU doubles only the printed countries' export symbols, including underlays.
// Import symbols and unrelated allies retain their normal values.
s=fixture(eaeu,s=>{s.players.RU.allies=[country('Belarus')];s.players.RU.countryUnderlays={[country('Belarus')]:[country('Belarus',true)]};});s=submit(s,{accept:true,slot:'temporary'});
const base=tradeCapacity({...s,eventEffects:[]},'RU'),doubled=tradeCapacity(s,'RU');assert.deepEqual(doubled.exports,base.exports.map(n=>n*2));assert.deepEqual(doubled.imports,base.imports);
for(const primaryResource of [0,1]){const energyGiant=tradeCapacity(s,'RU',{doublePrimary:true},[],primaryResource);assert.deepEqual(energyGiant.exports,doubled.exports);assert.deepEqual(energyGiant.imports,base.imports.map((n,k)=>k===primaryResource?n*2:n));}
s.players.RU.allies=[country('Iran')];s.players.RU.countryUnderlays={};assert.deepEqual(tradeCapacity(s,'RU'),tradeCapacity({...s,eventEffects:[]},'RU'));
// Pivot: either lower influence or score qualifies; movements validate before
// RNG, no move still queues a chain, and all three choices can be drawn.
s=fixture(pivot);next=submit(s,{moves:{reserve:2}});assert.equal(next.players.US.money,100);assert.equal(next.flow.eventResolution.randomChain,undefined);
for(let i=0;i<3;i++){
 s=fixture(pivot,s=>{s.players.CN.vp=1;});let draws=0;const original=Math.random;Math.random=()=>{draws++;return (i+.5)/3;};
 try{personalEventPreview(s,s.flow.eventResolution,{moves:{reserve:2}});assert.equal(draws,0);next=submit(s,{moves:{reserve:2}});assert.equal(draws,1);}finally{Math.random=original;}
 assert.equal(next.players.US.money,90);assert.equal(next.players.US.resources[6],4);assert.equal(next.players.US.smart,4);assert.equal(next.regions.P.armies.US,2);assert.equal(next.flow.eventResolution.randomChain,EVENT_CHAINS[pivot][i]);
 const loaded=JSON.parse(JSON.stringify(next));assert.deepEqual(loaded.eventBoard.queued,next.eventBoard.queued);assert.throws(()=>submit(loaded),/已结算/);
 const finished=act(loaded,'ackEvent');assert.equal(finished.eventHistory[0].randomChain,EVENT_CHAINS[pivot][i]);
}
s=fixture(pivot,s=>{s.regions.P.temporary=['CN'];syncInfluence(s.regions.P);s.players.US.money=9;});rejects(s,{moves:{reserve:2}},/资金不足/);rejects(s,{moves:{P:1}},/亚太之外/);rejects(s,{moves:{reserve:1,E:2}},/军队不足/);next=submit(s,{moves:{}});assert.equal(next.eventBoard.queued.length,1);assert.equal(next.players.US.smart,2);
s=fixture(pivot,s=>{s.players.CN.vp=1;s.eventBoard.seen.push(...EVENT_CHAINS[pivot]);});next=submit(s);assert.equal(next.flow.eventResolution.randomChain,undefined);assert.equal(next.eventBoard.queued.length,0);
// Old in-progress manual events stay manual; new automatic ones disallow
// arbitrary resource edits, and postponement pays once without an event reward.
s=fixture(eaeu);next=act(s,'postponeEvent');assert.equal(next.players.RU.smart,1);assert.equal(next.eventEffects,undefined);assert.equal(next.eventBoard.personal.RU,eaeu);
s=fixture(eaeu);assert.throws(()=>act(s,'resource',{key:'money',delta:1}),/自动结算/);s.flow.eventResolution.mode='manual';s.flow.eventResolution.participants=['RU','US','CN','EU'];next=submit(s,{confirmed:true});assert.equal(next.players.RU.money,100);assert.equal(next.eventEffects,undefined);
// Real room command authority, retries, views and the random undo barrier.
const identity=Object.fromEntries(ids.map(id=>[id,{user:'personal-test',token:id}]));let room=newRoom('PERTEST',identity.US,cards,{wit:true,dd:false});room.status='playing';room.seats=identity;
room.state=fixture(aiib,s=>{s.players.CN.allies=[tai];});let command={op:'action',id:'aiib-1',gameRevision:room.gameRevision,action:{type:'submitEvent',cardId:aiib,accept:true,country:tai,slot:'temporary'}};
assert.throws(()=>changeRoom(room,identity.US,command,cards),/等待中国/);next=changeRoom(room,identity.CN,command,cards);assert.equal(changeRoom(next,identity.CN,command,cards),next);assert.equal(next.state.players.CN.fdi.length,1);assert.equal(playerView(next.state,'US').current,'US');assert.ok(roomView(next,identity.CN).canUndo);
room.state=fixture(pivot,s=>{s.players.CN.vp=1;});command={op:'action',id:'pivot-1',gameRevision:room.gameRevision,action:{type:'submitEvent',cardId:pivot,moves:{reserve:1}}};room=changeRoom(room,identity.US,command,cards);
assert.equal(changeRoom(room,identity.US,command,cards),room);assert.equal(roomView(room,identity.US).canUndo,false);assert.throws(()=>changeRoom(room,identity.US,{op:'undo',id:'undo-pivot',gameRevision:room.gameRevision},cards),/随机事件/);
const roundtrip=JSON.parse(JSON.stringify(room));assert.equal(roomView(roundtrip,identity.US).canUndo,false);assert.equal(roundtrip.state.flow.eventResolution.randomChain,room.state.flow.eventResolution.randomChain);
console.log('Passed five personal events: conditions, optional costs, investment/exhaustion/SP, movement, chains, persistent trade effects, rollback, reload, old manual saves, room authority, retries and random-reveal undo.');
