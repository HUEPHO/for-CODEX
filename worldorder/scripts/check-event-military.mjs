import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {startEventPhase} from '../dist/event-flow.js';
import {EVENT_DATA} from '../dist/event-data.js';
import {MILITARY_EVENTS,militaryCondition,resolveMilitary} from '../dist/event-military.js';
import {renderPersonalEvent} from '../dist/event-personal-ui.js';
import {personalEventPreview} from '../dist/event-personal.js';
import {RESEARCH_DATA} from '../dist/research-data.js';
import {playerView} from '../server/rooms.js';
import {actionAccess} from '../dist/action-policy.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),seats=['US','CN','EU','RU'];
const ALLIANCE='c1b3f3035a3cf',QUAD='c870029980e16',RESPONSE='ca5b5108041b5',PESCO='cc9cdee5577c2';
const korea=Object.keys(RESEARCH_DATA).find(id=>RESEARCH_DATA[id].countryName==='South Korea'&&!RESEARCH_DATA[id].starting);
function fixture(cardId,edit=()=>{}){
 const s=createState(cards,{wit:true,dd:true},()=>.3);
 for(const p of Object.values(s.players)){
  p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.hand=['cf9aa23c4a315'];p.deck=['c89c153d80dbd'];
  p.allies=[];p.fdi=[];p.bases=[];p.exhaustedAllies=[];p.growth=[];p.money=60;p.vp=0;p.smart=0;
  p.resources=[3,3,3,3,3,10,3];p.production=Array(7).fill(1);
 }
 for(const region of Object.values(s.regions))for(const owner of seats)region.armies[owner]=0;
 s.round=4;s.phase='事件';s.initialOrder=seats;s.flow=newFlow(seats,4);s.flow.step='events';
 s.actionTurns={index:16,completed:{US:4,CN:4,EU:4,RU:4}};s.eraDeck=[];s.era2Deck=[];s.eventHistory=[];s.eventDiscard=[];
 const owner=EVENT_DATA[cardId].players[0];
 s.eventBoard={round:4,slots:[null,null,null],personal:Object.fromEntries(seats.map(id=>[id,id===owner?cardId:null])),seen:[cardId],queued:[],choice:null,revealQueue:[],distribution:null};
 s.events=[];edit(s);startEventPhase(s);return s;
}
const act=(s,type,fields={})=>applyAction(s,{type,cardId:s.flow.eventResolution?.cardId,...fields});
const submit=(s,fields={})=>act(s,'submitEvent',fields);
const accept=(s,fields={})=>submit(s,{accept:true,slot:'temporary',moves:{},...fields});
function rejects(s,fields,pattern){const snapshot=JSON.stringify(s);assert.throws(()=>accept(s,fields),pattern);assert.equal(JSON.stringify(s),snapshot,'Rejected event consumed fees, armies or rewards');}

for(const id of Object.keys(MILITARY_EVENTS)){
 const s=fixture(id),snapshot=JSON.stringify(s),owner=EVENT_DATA[id].players[0];
 assert.equal(s.flow.eventResolution.mode,'personal');
 assert.match(renderPersonalEvent(s,s.flow.eventResolution),/military-accept/);
 assert.equal(actionAccess(playerView(s,owner),{type:'resource',key:'money',delta:1},owner).allowed,false);
 const declined=submit(s,{accept:false,moves:'invalid',quantity:-9,slot:'invalid'});
 assert.deepEqual(declined.players[owner].resources,s.players[owner].resources);assert.equal(declined.players[owner].money,60);assert.equal(declined.players[owner].smart,0);
 assert.deepEqual(declined.eventBoard.queued,[]);assert.equal(declined.flow.eventResolution.stage,'result');assert.equal(JSON.stringify(s),snapshot);
 assert.throws(()=>submit(s,{}),/选择/);
}

// Both troops are required, and the ordinary movement fee is additional to
// diplomatic costs. An event card accepts troops from its own eventual region.
let s=fixture(ALLIANCE,s=>{s.regions.E.armies.US=1;}),next=accept(s,{moves:{reserve:1,E:1}});
assert.equal(next.players.US.money,50);assert.equal(next.players.US.resources[5],8);assert.equal(next.players.US.resources[6],2);assert.equal(next.players.US.smart,1);
assert.equal(next.regions.E.armies.US,0);assert.equal(next.regions.P.armies.US,2);assert.equal(next.regions.P.influence.US,s.regions.P.influence.US+1);assert.deepEqual(next.eventBoard.queued,[RESPONSE]);
rejects(s,{moves:{reserve:1}},/必须移动2/);rejects(s,{moves:{reserve:3}},/军队|移动/);rejects(s,{moves:{A:2}},/不足/);
rejects(s,{moves:{reserve:2},destination:'N'},/目的地/);rejects(s,{moves:{reserve:2},slot:'invalid'},/影响力/);
s=fixture(ALLIANCE,s=>{s.players.US.money=9;});rejects(s,{moves:{reserve:2}},/资金不足/);
s=fixture(ALLIANCE,s=>{s.players.US.resources[5]=1;});rejects(s,{moves:{reserve:2}},/不足/);
s=fixture(ALLIANCE,s=>{s.players.US.allies=[korea];s.players.US.resources[5]=0;s.players.US.resources[6]=0;s.regions.P.armies.US=2;});
next=accept(s,{moves:{P:2}});assert.equal(next.regions.P.armies.US,2);assert.equal(next.players.US.resources[6],0);assert.equal(next.players.US.money,50);assert.equal(next.players.US.resources[5],0);

// QUAD has no base requirement in South Asia, but still pays 5 to move its
// one troop in addition to the printed 10 money, 1 service and 1 diplomacy.
s=fixture(QUAD);next=accept(s,{moves:{reserve:1},destination:'S'});
assert.equal(next.players.US.money,45);assert.equal(next.players.US.resources[4],2);assert.equal(next.players.US.resources[5],9);assert.equal(next.players.US.smart,3);
assert.equal(next.regions.S.armies.US,1);assert.equal(next.regions.S.influence.US,s.regions.S.influence.US+1);assert.deepEqual(next.players.US.bases,[]);assert.deepEqual(next.eventBoard.queued,[RESPONSE]);
rejects(s,{moves:{reserve:2},destination:'S'},/限额|必须移动1/);rejects(s,{moves:{},destination:'S'},/必须移动1/);
s=fixture(QUAD,s=>{s.players.US.money=14;});rejects(s,{moves:{reserve:1},destination:'S'},/资金不足/);
s=fixture(QUAD,s=>{s.regions.S.armies.US=1;});rejects(s,{moves:{S:1},destination:'S'},/不能相同/);

// Production occurs before movement; newly produced armies are eligible.
// Every army consumes raw materials + food, then its movement costs 5 money.
s=fixture(RESPONSE,s=>{s.players.CN.production[6]=3;s.players.CN.resources[6]=0;});next=accept(s,{quantity:3,moves:{reserve:3}});
assert.equal(next.players.CN.money,25);assert.equal(next.players.CN.resources[5],8);assert.equal(next.players.CN.resources[1],0);assert.equal(next.players.CN.resources[2],0);
assert.equal(next.players.CN.resources[6],0);assert.equal(next.regions.P.armies.CN,3);assert.equal(next.regions.P.influence.CN,s.regions.P.influence.CN+1);assert.equal(next.players.CN.smart,0);
rejects(s,{quantity:4,moves:{}},/限额/);rejects(s,{quantity:1,moves:{reserve:2}},/不足/);rejects(s,{quantity:3,moves:{reserve:3},slot:'invalid'},/影响力/);
s=fixture(RESPONSE,s=>{s.players.CN.money=20;s.players.CN.resources[1]=s.players.CN.resources[2]=s.players.CN.resources[6]=0;});
next=accept(s,{quantity:0,moves:{}});assert.equal(next.players.CN.money,0);assert.equal(next.regions.P.influence.CN,s.regions.P.influence.CN+1);
rejects(s,{quantity:1,moves:{}},/初级资源不足/);
s=fixture(RESPONSE,s=>{s.players.CN.money=24;});rejects(s,{quantity:0,moves:{reserve:1}},/资金不足/);

// PESCO upgrades before production, then grants free movement. The clarified
// cap case skips the upgrade, and zero production remains a legal selection.
s=fixture(PESCO);next=accept(s,{quantity:2,moves:{reserve:3}});
assert.equal(next.players.EU.money,40);assert.equal(next.players.EU.resources[4],2);assert.equal(next.players.EU.smart,3);assert.equal(next.players.EU.production[6],2);
assert.equal(next.players.EU.resources[1],1);assert.equal(next.players.EU.resources[2],1);assert.equal(next.players.EU.resources[6],2);assert.equal(next.regions.E.armies.EU,3);
assert.equal(next.regions.E.influence.EU,s.regions.E.influence.EU);assert.equal(next.players.EU.objectiveHistory.productionGains[6],1);
s=fixture(PESCO,s=>{s.players.EU.production[6]=5;s.players.EU.resources[1]=s.players.EU.resources[2]=0;s.players.EU.money=20;});
next=accept(s,{quantity:0,moves:{reserve:3}});assert.equal(next.players.EU.money,0);assert.equal(next.players.EU.production[6],5);assert.equal(next.players.EU.smart,3);assert.equal(next.regions.E.armies.EU,3);
assert.equal(next.players.EU.objectiveHistory.productionGains[6],0);assert.deepEqual(next.eventBoard.queued,[]);
rejects(s,{quantity:1,moves:{}},/初级资源不足/);rejects(s,{quantity:0,moves:{reserve:4}},/限额/);
for(const moves of [[],{reserve:-1},{reserve:1.5},{bad:0}])rejects(s,{moves},/选择|无效/);

// Rendering and preview share execution validation; preview is read-only,
// rejected commits leave the source unchanged, and saved results cannot pay twice.
s=fixture(RESPONSE,s=>{s.players.CN.production[6]=2;});const fields={accept:true,quantity:2,moves:{reserve:2},slot:'temporary'};
const snapshot=JSON.stringify(s),detail=personalEventPreview(s,s.flow.eventResolution,fields);
assert.match(detail,/生产2支军队/);assert.equal(JSON.stringify(s),snapshot);assert.equal(militaryCondition(s,s.flow.eventResolution).production.limit,2);
next=submit(JSON.parse(snapshot),fields);assert.equal(next.flow.eventResolution.result,detail);assert.equal(next.flow.eventResolution.receipts.length,1);
assert.throws(()=>submit(next,fields),/已结算/);
const after=act(JSON.parse(JSON.stringify(next)),'ackEvent');assert.equal(after.eventHistory[0].receipts.length,1);assert.equal(after.flow.step,'aftermath');
const forged={...s.flow.eventResolution,owner:'US'};assert.throws(()=>resolveMilitary(s,forged,fields),/所属玩家/);
console.log('Military events: four real engine paths, optional declines, exact movement costs, production order/caps, rollback, preview and save-resume passed.');
