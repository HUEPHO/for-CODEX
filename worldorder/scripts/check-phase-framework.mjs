import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {currentActor,aftermathSteps,settlementProgress,phaseStatus} from '../dist/phase-state.js';
import {newRoom,changeRoom,roomView} from '../server/rooms.js';
import {renderRoomFlow} from '../dist/room-ui.js';
import {objectivePreview} from '../dist/objectives.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const seats=['US','CN','EU','RU'],identities=Object.fromEntries(seats.map(id=>[id,{user:'framework-test',token:id}]));
let serial=0;
function fixture(round=3,step='aftermath'){
 const s=createState(cards,{dd:true,wit:true,executive:true},()=>.3);
 // This suite deliberately covers legacy four-seat event checkpoints.
 delete s.eventVersion;delete s.eventBoard;
 for(const p of Object.values(s.players)){p.objectives=p.objectiveChoices.slice(0,2);p.openingChoices=p.assetChoices=p.objectiveChoices=null;}
 s.current='US';s.round=round;s.flow=newFlow(seats,round);s.flow.step=step;s.phase=step==='events'?'事件':'余波';
 if(step==='aftermath')s.flow.checks=aftermathSteps(s).slice(0,4);
 const room=newRoom('FRAME6',identities.US,cards,s.config);room.status='playing';room.state=s;room.seats={...identities};return room;
}
let room=fixture();
const command=action=>({id:String(++serial),op:'action',gameRevision:room.gameRevision,action});
function send(action,seat=currentActor(room.state)){const c=command(action);room=changeRoom(room,identities[seat],c,cards);return c;}
const task=(extra={})=>({type:'settlePhaseTask',taskId:settlementProgress(room.state).key,confirmed:true,...extra});
function rejected(action,seat='US',pattern){const before=JSON.stringify(room);assert.throws(()=>changeRoom(room,identities[seat],command(action),cards),pattern);assert.equal(JSON.stringify(room),before);}
// Old states need no migration write or invented award history just to display them.
const beforeRender=JSON.stringify(room);
for(const seat of seats)assert.match(renderRoomFlow(roomView(room,identities[seat]).state,byId),/整局进度/);
assert.equal(JSON.stringify(room),beforeRender);assert.equal(phaseStatus(room.state).progress,0);
const first=room.state.players.US.objectives[0];
rejected(task({cardId:first,points:7,scoreMode:'apply'}),'CN',/正在等待/);
for(const extra of [{confirmed:false},{taskId:'old'},{cardId:room.state.players.CN.objectives[0]},{scoreMode:'unknown'}])rejected(task({cardId:first,scoreMode:'apply',...extra}));
rejected({type:'confirmAftermath',step:'目标卡计分',confirmed:true},'US',/依次/);
const startVP=room.state.players.US.vp,points=objectivePreview(room.state,first).points,retry=send(task({cardId:first,points:99,scoreMode:'apply'}));
assert.equal(room.state.players.US.vp,startVP+points);assert.equal(currentActor(room.state),'CN');
const after=JSON.stringify(room);room=changeRoom(room,identities.US,retry,cards);assert.equal(JSON.stringify(room),after);
rejected({type:'resource',key:'vp',delta:1},'US');
// Undo restores both the score and its consumed-objective marker.
room=changeRoom(room,identities.US,{id:String(++serial),op:'undo',gameRevision:room.gameRevision},cards);
assert.equal(room.state.players.US.vp,startVP);assert.equal(room.state.players.US.scoredObjectives,undefined);
send(task({cardId:first,points:7,scoreMode:'apply'}));room=JSON.parse(JSON.stringify(room));
assert.equal(settlementProgress(room.state).done.length,1);
const cnVP=room.state.players.CN.vp;
send(task({cardId:room.state.players.CN.objectives[0],points:5,scoreMode:'recorded'}));assert.equal(room.state.players.CN.vp,cnVP);
for(const seat of ['EU','RU'])send(task({cardId:room.state.players[seat].objectives[0],points:0,scoreMode:'apply'}));
assert.equal(room.state.flow.settlement,null);assert.equal(room.state.settlementHistory.length,1);assert.equal(aftermathSteps(room.state)[room.state.flow.checks.length],'Smart Power计分');
const other=roomView(room,identities.CN).state;
assert.ok(!JSON.stringify(other.players.US.scoredObjectives).includes(first));
assert.ok(!JSON.stringify(other.settlementJournal).includes(first));assert.ok(!JSON.stringify(other.settlementHistory).includes(first));
// Round six can consume only the remaining objective, and retains the round-three record.
room.state.round=room.state.flow.round=6;room.state.flow.checks=aftermathSteps(room.state).slice(0,4);room.state.current='US';
rejected(task({cardId:first,points:7,scoreMode:'apply'}),'US',/尚未结算/);
for(const seat of seats)send(task({cardId:room.state.players[seat].objectives[1],points:1,scoreMode:'apply'}));
room.state.finalRegionWins=Object.fromEntries(seats.map(id=>[id,0]));
send({type:'scoreSmart'});assert.equal(room.state.flow.step,'ended');assert.equal(currentActor(room.state),null);
assert.deepEqual(room.state.finalAwards.US,{assets:0,executive:3});assert.equal(room.state.settlementJournal.at(-1).finalAwards.US.executive,3);
assert.match(renderRoomFlow(roomView(room,identities.US).state,byId),/已计入总分的终局奖励/);
rejected({type:'scoreSmart'});rejected({type:'nextRound'});
// Events use the same checkpoint but never infer or reapply event rewards.
room=fixture(4,'events');const originalMoney=room.state.players.US.money;
rejected({type:'confirmEvents',confirmed:true},'US',/依次/);
send({type:'resource',key:'money',delta:1});const eventTask=task();send(eventTask);
assert.equal(room.state.players.US.money,originalMoney+1);assert.equal(currentActor(room.state),'CN');
rejected({type:'resource',key:'money',delta:1},'US');
send({type:'resource',key:'money',delta:1},'EU');
room=JSON.parse(JSON.stringify(room));for(const seat of ['CN','EU','RU'])send(task(),seat);
assert.equal(room.state.flow.step,'aftermath');assert.equal(room.state.settlementHistory[0].done.length,4);
rejected(eventTask);assert.equal(room.state.settlementJournal.filter(row=>row.title==='确认本方事件结果').length,4);
// Shared actor validation also protects direct engine calls outside action/research phases.
const wrong=structuredClone(room.state);wrong.current='CN';assert.throws(()=>applyAction(wrong,{type:'resolveInvestments'}),/当前轮到/);
console.log('Phase framework passed: shared ownership, four-seat checkpoints, old-save rendering, restore/undo/retry, manual vs applied points, objective reuse/privacy, event receipts, and final award guards.');
