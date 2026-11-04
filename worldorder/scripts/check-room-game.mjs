// Full games through room commands: catches phase ownership bugs that pure
// engine simulations miss. Optional output directory stores review positions.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {newRoom,changeRoom,roomView} from '../server/rooms.js';
import {roomActor,SEATS} from '../dist/room-rules.js';
import {aftermathSteps} from '../dist/flow.js';
import {renderRoomFlow} from '../dist/room-ui.js';
import {researchCost} from '../dist/research.js';
import {settlementProgress} from '../dist/phase-state.js';
import {eventTestAction,incomeTestAction} from './event-test-actions.mjs';

const cards=JSON.parse(readFileSync(new URL('../dist/cards.json',import.meta.url)));
const byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const identities=Object.fromEntries(SEATS.map(seat=>[seat,{user:'room-game-check',token:'test-'+seat}]));
const output=process.argv[2];if(output)mkdirSync(output,{recursive:true});
for(const expanded of [false,true]){
 let room=newRoom('GAME26',identities.US,cards,{dd:expanded,wit:expanded,executive:expanded});
 let serial=0,commands=0;const scored=[];
 function send(seat,op,fields={}){
  const view=roomView(room,identities[seat]);
  room=changeRoom(room,identities[seat],{id:String(++serial),op,gameRevision:view.gameRevision,seatRevision:view.seatRevision,...fields},cards);
  commands++;
 }
 function act(seat,action){send(seat,'action',{action});}
 function current(action){const actor=roomActor(room.state);assert.ok(actor);act(actor,action);}
 function views(){
  for(const seat of SEATS){
   const view=roomView(room,identities[seat]);assert.equal(view.state.current,seat);
   assert.ok(renderRoomFlow(view.state,byId));
   for(const other of SEATS.filter(id=>id!==seat))assert.ok(view.state.players[other].hand.every(card=>card===null));
  }
 }
 for(const seat of SEATS.slice(1))send(seat,'join',{seat});send('US','start');
 for(const seat of SEATS){
  act(seat,{type:'chooseOpening',group:0});
  for(const card of room.state.players[seat].assetChoices.slice(0,2))act(seat,{type:'toggleAssetSelection',id:card.id});
  for(const id of room.state.players[seat].objectiveChoices?.slice(0,2)||[])act(seat,{type:'toggleObjectiveSelection',id});
  act(seat,{type:'chooseAssets'});
 }
 for(let round=1;round<=6;round++){
  assert.equal(room.state.round,round);assert.equal(room.state.flow.step,'actions');views();
  const order=[...room.state.flow.order];
  for(let turn=0;turn<16;turn++){
   assert.equal(roomActor(room.state),order[turn%4]);
   const actor=order[turn%4],before=room.state.players[actor].money;
   current({type:'passTurn',cardId:room.state.players[actor].hand[0]});
   assert.equal(room.state.players[actor].money,before+10);
  }
  assert.deepEqual(room.state.actionTurns.completed,{US:4,CN:4,EU:4,RU:4});
  if(round<6){
   assert.equal(room.state.flow.step,'research');
   for(const actor of order){
    assert.equal(roomActor(room.state),actor);views();current({type:'startResearch'});
    const affordable=room.state.market.find(id=>researchCost(id)<=room.state.flow.research.remaining);
    if(affordable){current({type:'researchBuy',id:affordable});assert.equal(room.state.players[actor].deck[0],affordable);}
    current({type:'finishResearch'});assert.equal(room.state.players[actor].hand.length,0);
   }
  }
  if(expanded){assert.equal(room.state.flow.step,'events');let count=0;while(room.state.flow.step==='events'){assert.ok(count++<70);views();current(eventTestAction(room.state));}}
  assert.equal(room.state.flow.step,'aftermath');
  for(const step of aftermathSteps(room.state)){
   assert.equal(aftermathSteps(room.state)[room.state.flow.checks.length],step);views();
   if(step==='投资回报'||step==='威胁结算'||step==='繁荣提升'){
    for(const actor of order){
     assert.equal(roomActor(room.state),actor);views();
     current(step==='投资回报'?{type:'resolveInvestments'}:step==='威胁结算'?{type:'resolveThreat'}:{type:'resolveProsperity',improve:false});
     if(step==='投资回报'){
      let choices=0;
      while(room.state.flow.pendingIncome){assert.ok(choices++<20,'Income continuation did not complete');views();current(incomeTestAction(room.state));}
     }
    }
   }else if(step==='地区与多数计分'){
    if(output)writeFileSync(resolve(output,`${expanded?'expanded':'base'}-round-${round}.json`),JSON.stringify(room.state));
    current({type:'scoreWorld'});scored.push(round);
   }else if(step==='目标卡计分'){
    for(let i=0;i<4;i++){
     views();const p=room.state.players[roomActor(room.state)];
     current({type:'settlePhaseTask',taskId:settlementProgress(room.state).key,cardId:p.objectives.find(id=>!(p.scoredObjectives||[]).some(row=>row.cardId===id)),points:0,scoreMode:'apply',confirmed:true});
    }
   }else if(step==='Smart Power计分')current({type:'scoreSmart'});
   else current({type:'confirmAftermath',step,confirmed:true});
  }
  if(round===6){
   assert.equal(room.state.flow.step,'ended');assert.equal(roomActor(room.state),null);views();
   assert.throws(()=>act(order[0],{type:'nextRound'}));break;
  }
  current({type:'nextRound'});views();current({type:'confirmCountries'});
  const queue=[...room.state.flow.draft.queue];
  for(let i=0;i<4;i++){assert.equal(roomActor(room.state),queue[i]);views();current({type:'chooseOrderSlot',slot:3-i});}
  assert.deepEqual(room.state.flow.order,[...queue].reverse());
  current({type:'confirmProduction'});
  for(const actor of room.state.flow.order){assert.equal(roomActor(room.state),actor);views();current({type:'confirmFocus',ready:[],upgrades:[],quantities:Array(7).fill(0)});}
 }
 assert.deepEqual(scored,[3,6]);
 console.log(`Passed ${expanded?'expanded':'base'} room game: ${commands} commands, six rounds, four private views, all phase owners, research purchases, final scoring.`);
}
