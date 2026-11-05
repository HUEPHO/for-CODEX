import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {newRoom,changeRoom,roomView} from '../server/rooms.js';
import {createRollback,recordRollback,rollbackAvailability,ROLLBACK_MAX_AGE} from '../dist/rollback-state.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
const seats=['US','CN','EU','RU'],who=Object.fromEntries(seats.map(seat=>[seat,{user:'restart-'+seat,token:'token-'+seat}]));
const domestic='cf9aa23c4a315';let serial=0;
function fixture(){
 const room=newRoom('REPLAY',who.US,cards,{dd:true,wit:false});
 const state=createState(cards,{dd:true,wit:false},()=>.5);
 for(const p of Object.values(state.players)){
  p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.hand=[domestic];p.deck=['c17bf3b6aa665'];p.discard=[];p.money=100;
 }
 state.flow=newFlow(seats);state.initialOrder=seats;state.actionTurns={index:0,completed:Object.fromEntries(seats.map(id=>[id,0]))};
 return {...room,state,status:'playing',seats:{...who}};
}
const command=(r,op,extra={})=>({id:'restart-'+ ++serial,op,gameRevision:r.gameRevision,...extra});
const send=(r,seat,op,extra={})=>changeRoom(r,who[seat],command(r,op,extra),cards);
const act=(r,seat,action)=>send(r,seat,'action',{action});
const money=(r,seat,count=1)=>{for(let i=0;i<count;i++)r=act(r,seat,{type:'resource',key:'money',delta:1});return r;};
const pass=(r,seat)=>act(r,seat,{type:'passTurn',cardId:domestic});
const request=r=>send(r,'US','requestTurnRestart');
const reply=(r,seat,accept)=>send(r,seat,'respondTurnRestart',{requestId:r.rollback.request.id,accept});

// No direct scope (including the old topbar/phase route) can bypass consent.
let r=fixture(),start=structuredClone(r.state);
r=money(r,'US',2);r=pass(r,'US');
for(const scope of ['step','phase','turn'])assert.throws(()=>send(r,'US','undo',{scope}),/其他玩家|对方同意/);
assert.equal(roomView(r,who.US).rollback.turn.requiresConsent,true);
r=money(r,'CN',3);const beforeRequest=r.state,revision=r.gameRevision;r=request(r);
assert.equal(r.state,beforeRequest);assert.equal(r.gameRevision,revision);
const requestId=r.rollback.request.id;
assert.equal(roomView(r,who.US).restartRequest.canCancel,true);
assert.equal(roomView(r,who.CN).restartRequest.canRespond,true);
assert.equal(roomView(r,who.EU).restartRequest.canRespond,false);
for(const seat of ['US','EU','RU'])assert.throws(()=>reply(r,seat,true),/只有被请求/);
assert.throws(()=>changeRoom(r,{user:'spectator',token:'spectator'},command(r,'respondTurnRestart',{requestId,accept:true}),cards),/入座/);
assert.throws(()=>send(r,'CN','respondTurnRestart',{requestId:'stale',accept:true}),/失效/);
const serialized=JSON.parse(JSON.stringify(r));
assert.ok(!JSON.stringify(roomView(serialized,who.US)).includes('token-'));
assert.ok(!JSON.stringify(roomView(serialized,who.US)).includes('turnKey'));
r=reply(serialized,'CN',false);assert.deepEqual(r.state,beforeRequest);assert.equal(r.rollback.request,null);
r=request(r);r=send(r,'US','cancelTurnRestart',{requestId:r.rollback.request.id});assert.equal(r.rollback.request,null);
r=request(r);const approve=command(r,'respondTurnRestart',{requestId:r.rollback.request.id,accept:true});
r=changeRoom(r,who.CN,approve,cards);assert.deepEqual(r.state,start);assert.equal(r.gameRevision,revision+1);
assert.equal(changeRoom(r,who.CN,approve,cards),r);assert.equal(r.rollback.request,undefined);

// Continuing to play invalidates the old request. A fresh request includes the
// new operations, including a warning for any newly revealed private cards.
r=pass(fixture(),'US');r=request(r);const oldReply=command(r,'respondTurnRestart',{requestId:r.rollback.request.id,accept:true});
r=act(r,'CN',{type:'draw'});assert.equal(r.rollback.request,null);
assert.throws(()=>changeRoom(r,who.CN,oldReply,cards),/局面已更新/);
assert.throws(()=>send(r,'CN','respondTurnRestart',{requestId:oldReply.requestId,accept:true}),/失效/);
assert.match(roomView(r,who.US).rollback.turn.warning,/隐藏信息/);
r=request(r);assert.match(roomView(r,who.CN).restartRequest.warning,/隐藏信息/);
r=reply(r,'CN',true);assert.deepEqual(r.state,start);

// Replacing seats, resetting/debugging, expiry or advancing another full turn
// cannot leave an old approval capable of rewriting an unrelated board.
r=request(pass(fixture(),'US'));
const expired=structuredClone(r);expired.rollback.handoff.entry.at=Date.now()-ROLLBACK_MAX_AGE-1;
assert.equal(roomView(expired,who.US).restartRequest,null);assert.throws(()=>reply(expired,'CN',true),/失效/);
const taken=changeRoom(r,{...who.CN,token:'new-tab'},command(r,'join',{seat:'CN',takeover:true}),cards);
assert.equal(roomView(taken,who.US).restartRequest,null);
const nextTurn=pass(r,'CN');assert.equal(roomView(nextTurn,who.US).rollback.turn.available,false);
assert.equal(roomView(nextTurn,who.US).restartRequest,null);
const debug=send(r,'US','debug',{action:{type:'setValues',player:'US',values:{money:120}}});
assert.equal(roomView(debug,who.US).restartRequest,null);

// Actual draw + a safe later operation: warn only when crossing the reveal.
r=fixture();r=money(r,'US');r=act(r,'US',{type:'draw'});
assert.match(roomView(r,who.US).rollback.step.warning,/隐藏信息/);
r=money(r,'US');assert.equal(roomView(r,who.US).rollback.step.warning,null);
assert.match(roomView(r,who.US).rollback.turn.warning,/隐藏信息/);
r=send(r,'US','undo',{scope:'turn'});assert.deepEqual(r.state,start);
const before=fixture().state,after=structuredClone(before);after.eventCountryRandom=1;
const identity={seat:'US',...who.US};
const ledger=recordRollback(createRollback(),before,after,{...identity,action:{type:'resolveEventReveal'}});
assert.equal(rollbackAvailability(ledger,identity).step.available,true);
assert.match(rollbackAvailability(ledger,identity).step.warning,/掷骰|随机/);
console.log('Action rollback passed: own step/turn, handoff consent, reject/cancel, hostile/stale/retried replies, full-state restoration, private draw/random warnings, expiry, seat takeover and persistence.');
