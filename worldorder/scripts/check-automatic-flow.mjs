import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const repo=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const load=name=>import(pathToFileURL(path.join(repo,name)));
const {createState,applyAction}=await load('dist/engine.js');
const {newFlow}=await load('dist/flow.js');
const {currentActor}=await load('dist/phase-state.js');
const {nextAutomaticFlowAction,advanceAutomaticFlow}=await load('dist/automatic-flow.js');
const {investmentPreview,threatPreview,scoringPreview,smartPreview}=await load('dist/world.js');
const {startEventPhase,canPostponeEvent}=await load('dist/event-flow.js');
const {syncEventBoard}=await load('dist/event-board.js');
const {EVENT_DATA}=await load('dist/event-data.js');
const {eventRevealKind}=await load('dist/event-reveal.js');
const {rollbackRevealReason}=await load('dist/rollback-state.js');
const {newRoom,changeRoom,roomView,playerView}=await load('server/rooms.js');
const cards=JSON.parse(fs.readFileSync(path.join(repo,'dist/cards.json')));
const ids=['US','CN','EU','RU'],who=Object.fromEntries(ids.map(id=>[id,{user:'page7-auto',token:'page7-'+id}]));
const passed=[];
function fixture(round=2,{dd=false,wit=true}={}){
 const s=createState(cards,{dd,wit},()=>.3);
 for(const p of Object.values(s.players)){p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.assets=[];p.hand=[];p.played=[];p.discard=[];p.vp=20;p.money=100;}
 s.round=round;s.current='US';s.flow=newFlow(ids,round);s.phase='余波';s.flow.step='aftermath';
 s.actionTurns={index:16,completed:{US:4,CN:4,EU:4,RU:4}};
 for(const r of Object.values(s.regions)){r.engage=Object.fromEntries(ids.map(id=>[id,0]));r.armies=Object.fromEntries(ids.map(id=>[id,0]));}
 s.eventBoard.choice=null;return s;
}
function assertStable(s){const serialized=JSON.stringify(s),copy=JSON.parse(serialized);advanceAutomaticFlow(copy);assert.equal(JSON.stringify(copy),serialized);}
function assertProjection(s,expected){
 const original=JSON.stringify(s);assert.deepEqual(nextAutomaticFlowAction(s),expected);
 for(const id of ids){const view=playerView(s,id),before=JSON.stringify(view);assert.deepEqual(nextAutomaticFlowAction(view),expected);assert.equal(JSON.stringify(view),before);}
 assert.equal(JSON.stringify(s),original);
}
function eventFixture(events,round=4){
 const s=fixture(round);s.flow.step='events';s.phase='事件';s.eventHistory=[];s.eventDiscard=[];s.resolvedEvents=[];s.eraDeck=[];s.era2Deck=[];
 s.eventBoard={round,slots:[null,null,null],personal:Object.fromEntries(ids.map(id=>[id,null])),seen:[...events],queued:[],choice:null,revealQueue:[],distribution:null};
 for(const id of events){const c=EVENT_DATA[id];if(c.players.length===1)s.eventBoard.personal[c.players[0]]=id;else s.eventBoard.slots[s.eventBoard.slots.lastIndexOf(null)]=id;}
 syncEventBoard(s);startEventPhase(s);return s;
}
function roomFor(s){const room=newRoom('AUTO07',who.US,cards,s.config);room.status='playing';room.seats=structuredClone(who);room.state=s;return room;}
let serial=0;
function send(room,action){const seat=currentActor(room.state),command={id:'auto-'+ ++serial,op:'action',gameRevision:room.gameRevision,action};return {room:changeRoom(room,who[seat],command,cards),seat,command};}

// A single defense decision crosses the round boundary, draws and updates all
// seven country piles, then stops at the first actual order choice.
let s=fixture();s.flow.order=['CN','EU','RU','US'];s.flow.checks=['投资回报','繁荣提升'];s.flow.threatDone=['CN','EU','RU'];s.current='US';s.regions.M.engage.US=1;s.regions.M.armies.CN=2;

assertProjection(s,null);
const before=structuredClone(s),roomBefore=roomFor(s),result=send(roomBefore,{type:'resolveThreat',defend:['M']});
s=result.room.state;assert.equal(s.round,3);assert.equal(s.flow.step,'order');assert.equal(s.flow.draft.slots.filter(x=>x===null).length,4);
for(const p of Object.values(s.players))assert.equal(p.hand.length,6);
assert.equal(s.settlementJournal.filter(r=>r.title==='结算威胁').length,1);
assert.match(rollbackRevealReason(before,s,{type:'resolveThreat'}),/隐藏信息|新国家/);
assert.ok(roomView(result.room,who[result.seat]).rollback.step.warning);
assert.equal(changeRoom(result.room,who[result.seat],result.command,cards),result.room);
for(const id of ids){const view=roomView(result.room,who[id]);assert.equal(view.actor,currentActor(s));for(const other of ids.filter(x=>x!==id))assert.ok(view.state.players[other].hand.every(x=>x===null));}
assertStable(s);passed.push('one authoritative command: defense → next round → draw → country update → order; private views, retry, warning, refresh');

// Third chosen position has only one remaining legal slot. Fill it and run
// the one deterministic production step; do not choose anyone's focus.
s=fixture();s.phase='准备';s.flow.step='order';s.flow.draft={queue:[...ids],slots:['US','CN',null,null]};s.flow.index=2;s.current='EU';
const stock=structuredClone(s.players);s=applyAction(s,{type:'chooseOrderSlot',slot:3});
assert.deepEqual(s.flow.order,['US','CN','RU','EU']);assert.equal(s.flow.step,'focus');assert.equal(s.current,'US');
for(const id of ids)for(let k=0;k<3;k++)assert.equal(s.players[id].resources[k],Math.min(10,stock[id].resources[k]+stock[id].production[k]));
assert.equal(s.settlementJournal.filter(r=>r.title==='初级生产').length,1);assertStable(s);passed.push('unique final order position and primary production once; stop at focus');

s=fixture();s.players.US.fdi=[s.players.US.allies[0]];const cash=Object.fromEntries(ids.map(id=>[id,s.players[id].money])),income=investmentPreview(s,'US').total;
assertProjection(s,{type:'resolveInvestments',withdraw:{}});advanceAutomaticFlow(s);
assert.deepEqual(s.flow.investmentDone,ids);assert.equal(s.flow.checks[0],'投资回报');assert.equal(s.players.US.money,cash.US+income);assert.equal(s.settlementJournal.filter(r=>r.title==='结算投资回报').length,4);assertProjection(s,null);assertStable(s);
passed.push('automatic no-withdrawal investment for four players once; prosperity remains a choice');

s=fixture();s.eventEffects=[{cardId:'ccd84d77f9734',owner:'CN'}];advanceAutomaticFlow(s);
assert.equal(s.flow.pendingIncome.owner,'CN');assert.deepEqual(s.flow.investmentDone,['US']);assert.equal(s.current,'CN');assertProjection(s,null);assertStable(s);
passed.push('stop at pending continuous income, before later players');

s=fixture();s.flow.checks=['投资回报','繁荣提升'];s.regions.E.engage.EU=1;s.regions.N.armies.RU=3;
const expected=Object.fromEntries(['US','CN'].map(id=>[id,threatPreview(s,id)]));advanceAutomaticFlow(s);
assert.deepEqual(s.flow.threatDone,['US','CN']);assert.equal(s.current,'EU');for(const id of ['US','CN']){assert.deepEqual(s.flow.threatResults[id],expected[id]);assert.equal(s.players[id].vp,20-expected[id].total);}
assertProjection(s,null);assertStable(s);passed.push('automatic undefendable threats saved once; stop before defense markers');

s=fixture();s.flow.checks=['投资回报'];for(const p of Object.values(s.players))p.prosperity=5;s.regions.E.engage.US=1;
advanceAutomaticFlow(s);assert.deepEqual(s.flow.prosperityDone,ids);assert.equal(s.flow.checks[1],'繁荣提升');assert.equal(s.current,'US');assertProjection(s,null);assertStable(s);
passed.push('full prosperity skipped for all players; defense still offered');

s=fixture(6);s.flow.checks=['投资回报','繁荣提升','威胁结算'];const world=scoringPreview(s),smart=smartPreview(s);
assertProjection(s,{type:'scoreWorld'});s=applyAction(s,{type:'scoreWorld'});assert.equal(s.flow.step,'ended');assert.equal(s.scoringHistory.length,1);
for(const id of ids)assert.equal(s.players[id].vp,20+world.totals[id]+smart[id]);
assert.deepEqual(s.flow.checks,['投资回报','繁荣提升','威胁结算','地区与多数计分','Smart Power计分']);assertStable(s);
assert.equal(s.settlementJournal.filter(r=>['地区与多数计分','SP计分'].includes(r.title)).length,2);passed.push('world and SP scoring + final awards once, final state stable');

// Existing manual saves and every meaningful choice are preserved.
for(const [step,checks,field] of [['production',[],'economyVersion'],['aftermath',[],'worldVersion'],['aftermath',['投资回报','繁荣提升','威胁结算'],'worldVersion']]){
 s=fixture(3);s.flow.step=step;s.flow.checks=checks;delete s[field];assertProjection(s,null);assertStable(s);
}
s=fixture();s.flow.step='events';delete s.eventVersion;assertProjection(s,null);assertStable(s);
s=eventFixture(['cbb2924757345']);s.flow.eventResolution.mode='manual';s.flow.eventResolution.stage='resolve';delete s.flow.eventResolution.bidVersion;assertProjection(s,null);assertStable(s);
s=eventFixture(['ca8e271f31adf']);assert.ok(canPostponeEvent(s));assertProjection(s,null);assertStable(s);
s=fixture();s.regions.M.engage.US=1;assertProjection(s,null);assertStable(s);
s=fixture();s.flow.checks=['投资回报'];s.players.US.resources[3]=0;assertProjection(s,null);assertStable(s);
s=fixture();s.flow.step='focus';assertProjection(s,null);assertStable(s);
passed.push('legacy manual events/production/world scoring, postponable personal events, withdrawal, poor prosperity and focus remain decisions');

// Switching views never performs a pending automatic step, and direct
// advance does not claim the authoritative actor on a non-actor view.
s=fixture();s.flow.step='roundEnd';const switchBefore=structuredClone(s);s=applyAction(s,{type:'switch',player:'CN'});assert.equal(s.flow.step,'roundEnd');assert.equal(s.round,2);assert.equal(s.current,'CN');assertStable(s);assert.equal(s.players.US.money,switchBefore.players.US.money);
passed.push('view switching and non-actor state never trigger automation');

// Final sealed bid immediately archives its reveal and opens the next BID
// event. Looking only at the final stage="bid" would miss this warning.
const bid='cd771b6a9d234',nextBid='c25240469d096';let room=roomFor(eventFixture([bid,nextBid]));
while(room.state.flow.eventResolution.cardId===bid){const q=room.state.flow.eventResolution,old=room.state;const sent=send(room,{type:'submitEvent',cardId:bid,amount:1});room=sent.room;
 if(room.state.flow.eventResolution.cardId!==bid){assert.equal(room.state.flow.eventResolution.stage,'bid');assert.equal(eventRevealKind(old,room.state),'sealed');assert.match(roomView(room,who[sent.seat]).rollback.step.warning,/秘密|隐藏/);}
 else {assert.equal(eventRevealKind(old,room.state),null);const other=ids.find(id=>!room.state.flow.eventResolution.done.includes(id));assert.deepEqual(playerView(room.state,other).flow.eventResolution.submissions,{});}
}
assert.equal(room.state.eventHistory.length,1);assert.equal(room.state.eventHistory[0].cardId,bid);assert.ok(room.state.eventHistory[0].submissions.US);assertProjection(room.state,null);assertStable(room.state);
passed.push('event results archive automatically; next bid stays secret and requires input; sealed undo warning retained');

// A random chain is also archived in the same submission. History preserves
// its reveal marker, but acknowledging an already-revealed result is quiet.
s=eventFixture(['c4f52659f1ea9']);s.players.CN.vp=30;const randomBefore=structuredClone(s);
s=applyAction(s,{type:'submitEvent',cardId:'c4f52659f1ea9',moves:{}});
assert.ok(s.eventHistory[0].randomChain);assert.equal(eventRevealKind(randomBefore,s),'random');assert.match(rollbackRevealReason(randomBefore,s,{type:'submitEvent'}),/随机/);
const known=eventFixture(['c4f52659f1ea9']);known.flow.eventResolution.stage='result';known.flow.eventResolution.done=['US'];known.flow.eventResolution.result='already shown';known.flow.eventResolution.randomChain='c171711d668df';
const knownAfter=structuredClone(known);advanceAutomaticFlow(knownAfter);assert.equal(eventRevealKind(known,knownAfter),null);
const agreementBefore=eventFixture(['c963b6d849299']);agreementBefore.flow.eventResolution.stage='reward';
const agreementAfter=structuredClone(agreementBefore);agreementAfter.eventHistory.push({...agreementAfter.flow.eventResolution,agreementRandom:1});agreementAfter.flow.eventResolution=null;assert.equal(eventRevealKind(agreementBefore,agreementAfter),'random');
passed.push('archived random-chain/agreement reveals warn; archiving an already known result does not warn again');

console.log(JSON.stringify({passed:true,checks:passed},null,2));
