import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {startEventPhase} from '../dist/event-flow.js';
import {syncInfluence,AREAS} from '../dist/world.js';
import {renderBidForm,renderBidSummary} from '../dist/event-bids-ui.js';
import {loseEventMoney,loseEventResource} from '../dist/event-losses.js';
import {newRoom,changeRoom,playerView,roomView} from '../server/rooms.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),ids=['US','CN','EU','RU'];
const conflict='c2a6d1615b971',piracy='cf00e1c9bdd9c';
function fixture(cardId,edit=()=>{}){
 const s=createState(cards,{wit:true,dd:false},()=>.3);
 for(const p of Object.values(s.players)){p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.money=100;p.smart=2;p.vp=0;p.resources[5]=10;p.resources[6]=6;p.allies=[];p.fdi=[];p.bases=[];}
 s.round=3;s.current='US';s.flow=newFlow(ids,3);s.flow.step='events';s.phase='事件';s.actionTurns={index:16,completed:{US:4,CN:4,EU:4,RU:4}};
 s.eventBoard={round:3,slots:[null,null,cardId],personal:{US:null,CN:null,EU:null,RU:null},queued:[],seen:[cardId],choice:null,revealQueue:[],distribution:null};
 s.eraDeck=[];s.era2Deck=[];s.events=[cardId];s.eventHistory=[];s.eventDiscard=[];edit(s);startEventPhase(s);return s;
}
const act=(s,type,fields={})=>applyAction(s,{type,cardId:s.flow.eventResolution.cardId,...fields});
const bid=(s,fields={})=>act(s,'submitEvent',fields);
function bids(s,offers={}){for(const owner of [...s.flow.eventResolution.participants]){assert.equal(s.current,owner);s=bid(s,offers[owner]||{});}return s;}
function roll(value,fn){const original=Math.random;Math.random=()=>value;try{return fn();}finally{Math.random=original;}}
function rejected(s,fields,pattern){const before=JSON.stringify(s);assert.throws(()=>bid(s,fields),pattern);assert.equal(JSON.stringify(s),before);}
function neutral(s,n){s.regions.N.permanent=s.regions.N.permanent.map(x=>x==='neutral'?null:x);s.regions.N.temporary=Array(n).fill('neutral');syncInfluence(s.regions.N);}

// Team modifiers are added once after reveal, not once per player and never to SP.
for(let n=1;n<=3;n++){
 let s=fixture(conflict,x=>neutral(x,2));s=roll((n-.5)/3,()=>bids(s,{US:{diplomacy:5},EU:{diplomacy:1}}));
 assert.equal(s.flow.eventResolution.sideTotals[0].modifier,n);assert.equal(s.flow.eventResolution.sideTotals[0].total,6+n);
 assert.equal(s.flow.eventResolution.sideTotals[1].modifier,2);assert.equal(s.flow.eventResolution.sideTotals[1].total,2);
 assert.equal(s.players.US.smart,6);assert.equal(s.players.EU.smart,4);assert.equal(s.players.RU.smart,2);assert.equal(s.players.CN.smart,2);
 assert.equal(s.regions.N.influence.neutral,1);assert.match(renderBidSummary(s.flow.eventResolution),/阵营随机修正/);
}
let s=fixture(conflict,x=>neutral(x,2));
assert.match(renderBidForm(s,s.flow.eventResolution),/全阵营只加一次/);
assert.match(renderBidForm(s,s.flow.eventResolution),/id="bid-sold-armies"[^>]*max="6"/);
rejected(s,{soldArmies:7},/限额/);rejected(s,{armies:{reserve:1}},/限额/);
s=bid(s,{soldArmies:3});assert.equal(s.players.US.resources[6],6);assert.equal(s.players.US.money,100);
assert.equal(s.flow.eventResolution.sideTotals,undefined);assert.deepEqual(playerView(s,'CN').flow.eventResolution.submissions,{});
rejected(s,{soldArmies:1},/限额/);s=bid(s);rejected(s,{soldArmies:1},/限额/);s=bid(s,{diplomacy:1});s=roll(0,()=>bid(JSON.parse(JSON.stringify(s)),{soldArmies:1}));
assert.equal(s.players.US.money,145);assert.equal(s.players.US.resources[6],3);assert.equal(s.players.RU.money,115);assert.equal(s.players.RU.resources[6],5);
assert.equal(s.players.US.smart,5);assert.equal(s.players.EU.smart,4);assert.equal(s.players.RU.smart,3);assert.equal(s.regions.N.armies.US,0);
// Sales are not capped at two when the face has no cap and never require cash up front.
s=fixture(conflict,x=>{x.players.US.money=0;neutral(x,0);});s=roll(0,()=>bids(s,{US:{soldArmies:6}}));assert.equal(s.players.US.money,90);assert.equal(s.players.US.resources[6],0);
// Only contributing teammates get their own reward. Global influence changes still happen.
s=fixture(conflict,x=>neutral(x,2));s=roll(.99,()=>bids(s,{EU:{diplomacy:1}}));assert.equal(s.players.US.smart,2);assert.equal(s.players.EU.smart,4);assert.equal(s.regions.N.influence.neutral,1);
s=fixture(conflict,x=>neutral(x,3));s=roll(0,()=>bids(s,{RU:{diplomacy:1}}));assert.equal(s.players.RU.smart,5);assert.equal(s.players.CN.smart,2);assert.equal(s.regions.N.influence.neutral,4);
s=fixture(conflict,x=>neutral(x,3));s=roll(0,()=>bids(s));assert.equal(s.flow.eventResolution.winner,1);assert.ok(Object.values(s.players).every(p=>p.smart===2));assert.equal(s.regions.N.influence.neutral,4);
// A full neutral queue removes its leftmost cube, before considering permanent cubes.
s=fixture(conflict,x=>{neutral(x,2);x.regions.N.permanent[3]='neutral';syncInfluence(x.regions.N);});
s=roll(.99,()=>bids(s,{US:{diplomacy:2}}));assert.deepEqual(s.regions.N.temporary,['neutral']);assert.equal(s.regions.N.permanent[3],'neutral');assert.equal(s.players.US.smart,6);

// Forced cash shortages use the confirmed ceiling convention; resources lose one VP per missing unit.
for(const [shortfall,vp] of [[0,0],[1,1],[4,1],[5,1],[6,2],[10,2],[11,3],[15,3]]){
 const p={money:15-shortfall,vp:7};assert.deepEqual(loseEventMoney(p,15),{lost:15-shortfall,shortfall,vp});assert.equal(p.money,0);assert.equal(p.vp,7-vp);
}
const resourcePlayer={resources:[0,0,0,0,0,1,0],vp:2};assert.deepEqual(loseEventResource(resourcePlayer,5,2),{lost:1,shortfall:1,vp:1});assert.equal(resourcePlayer.vp,1);
// At least three total armies gives only the winning player +3 SP. All-zero has no losses or neutral cube.
for(const offers of [{US:{armies:{reserve:3}}},{US:{armies:{reserve:1}},EU:{armies:{reserve:1}},RU:{armies:{reserve:1}}}]){
 s=fixture(piracy,x=>{x.regions.A.temporary=['US','US'];syncInfluence(x.regions.A);});const beforeNeutral=s.regions.A.influence.neutral;
 s=bids(s,offers);assert.equal(s.flow.eventResolution.winner,0);assert.equal(s.players.US.smart,5+Math.floor(offers.US.armies.reserve/2));assert.equal(s.players.US.resources[5],10);
 assert.equal(s.regions.A.influence.neutral,beforeNeutral);assert.equal(s.players.CN.money,100);assert.equal(s.players.CN.vp,0);
 for(const id of ids){const n=offers[id]?.armies.reserve||0;assert.equal(s.players[id].money,100-5*n);assert.equal(s.regions.A.armies[id],n);}
}
s=fixture(piracy);const beforePlayers=structuredClone(s.players),beforeRegion=structuredClone(s.regions.A);s=bids(s);assert.equal(s.flow.eventResolution.allZero,true);assert.deepEqual(s.players,beforePlayers);assert.deepEqual(s.regions.A,beforeRegion);
// Payment happens before losses. Army contributors avoid the printed two VP loss, including a loser.
s=fixture(piracy,x=>{x.players.US.resources[5]=1;x.players.EU.money=16;x.players.CN.money=9;x.players.RU.money=0;});
s=bids(s,{US:{armies:{reserve:1}},EU:{armies:{reserve:1}}});
assert.equal(s.players.US.resources[5],0);assert.equal(s.players.US.vp,-1);assert.equal(s.players.EU.money,0);assert.equal(s.players.EU.vp,-1);
assert.equal(s.players.CN.money,0);assert.equal(s.players.CN.vp,-3);assert.equal(s.players.RU.money,0);assert.equal(s.players.RU.vp,-3);
assert.equal(s.regions.A.armies.US,1);assert.equal(s.regions.A.armies.EU,1);assert.equal(s.flow.eventResolution.stage,'result');
assert.match(s.flow.eventResolution.result,/不足4，失去1分/);assert.equal(s.regions.A.influence.neutral,1);
// Neutral insertion follows the common permanent-first rule, then the temporary queue.
s=fixture(piracy,x=>{x.regions.A.permanent=['CN','CN'];x.regions.A.temporary=Array(AREAS.A.temp.length).fill('US');syncInfluence(x.regions.A);});
s=bids(s,{CN:{armies:{reserve:1}}});assert.equal(s.regions.A.temporary.at(-1),'neutral');assert.deepEqual(s.regions.A.permanent,['CN','CN']);
s=fixture(piracy,x=>{x.players.US.money=4;});rejected(s,{armies:{reserve:1}},/资金不足/);rejected(s,{soldArmies:1},/限额/);

// Four server seats: sealed sales, wrong actor/revision, one random draw, persistence, replay and history.
const who=Object.fromEntries(ids.map(id=>[id,{user:'final-bids',token:id}]));let room=newRoom('BDF444',who.US,cards,{wit:true});room.state=fixture(conflict,x=>neutral(x,2));room.status='playing';room.seats=structuredClone(who);let serial=0;
function send(owner,fields={}){const command={id:String(++serial),op:'action',gameRevision:room.gameRevision,action:{type:'submitEvent',cardId:conflict,...fields}};room=changeRoom(room,who[owner],command,cards);return command;}
assert.throws(()=>send('CN',{diplomacy:1}),/等待/);const early=send('US',{soldArmies:3});assert.deepEqual(roomView(room,who.EU).state.flow.eventResolution.submissions,{});
assert.throws(()=>changeRoom(room,who.CN,{id:'stale',op:'action',gameRevision:early.gameRevision,action:{type:'submitEvent',cardId:conflict}},cards),/更新|版本|变化/);
send('CN');send('EU',{diplomacy:1});let draws=0;const original=Math.random;Math.random=()=>{draws++;return .99;};let command;
try{command=send('RU',{soldArmies:1});}finally{Math.random=original;}
assert.equal(draws,1);assert.equal(room.state.flow.eventResolution.sideTotals[0].modifier,3);assert.equal(roomView(room,who.RU).canUndo,false);
room=JSON.parse(JSON.stringify(room));const snapshot=JSON.stringify(room);room=roll(0,()=>changeRoom(room,who.RU,command,cards));assert.equal(JSON.stringify(room),snapshot);
assert.throws(()=>send('RU',{soldArmies:1}),/等待|已结算/);
room=changeRoom(room,who.US,{id:'ack',op:'action',gameRevision:room.gameRevision,action:{type:'ackEvent',cardId:conflict}},cards);
assert.equal(room.state.eventHistory.at(-1).sideTotals[0].modifier,3);assert.equal(room.state.eventHistory.at(-1).submissions.US.soldArmies,3);
console.log('Final bids passed: team-only random/neutral modifiers, uncapped printed sales, no-contribution rewards, ordered neutral changes, piracy army thresholds and post-payment losses, confirmed cash shortage rounding, four-seat secrecy/revision/replay and saved reveal history.');
