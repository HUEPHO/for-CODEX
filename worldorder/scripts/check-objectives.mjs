import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {OBJECTIVE_DATA} from '../dist/objective-data.js';
import {objectivePreview,resolveObjective} from '../dist/objectives.js';
import {COUNTRY_TRADE} from '../dist/trade-data.js';
import {countryRegion} from '../dist/research.js';
import {settlementProgress} from '../dist/phase-state.js';
import {newRoom,changeRoom,roomView} from '../server/rooms.js';
import {renderPhaseSettlement} from '../dist/phase-ui.js';
import {INITIAL_PRODUCTION,OBJECTIVE_PROGRESS_BASIS,recordObjectiveProgress} from '../dist/objective-progress.js';
import {specialEventModel} from '../dist/event-special-personal.js';
import {ECONOMY} from '../dist/economy.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),seats=['US','CN','EU','RU'];
function fixture(){
 const s=createState(cards,{dd:true,wit:true},()=>.3);
 for(const [id,p] of Object.entries(s.players)){p.objectives=Object.keys(OBJECTIVE_DATA).filter(cid=>OBJECTIVE_DATA[cid].owner===id).slice(0,2);p.openingChoices=p.assetChoices=p.objectiveChoices=null;}
 s.current='US';s.round=3;s.flow=newFlow(seats,3);s.flow.step='aftermath';s.flow.checks=['投资回报','繁荣提升','威胁结算','地区与多数计分'];s.phase='余波';return s;
}
let s=fixture();
assert.equal(Object.keys(OBJECTIVE_DATA).length,32);
assert.deepEqual(new Set(Object.keys(OBJECTIVE_DATA)),new Set(cards.filter(c=>c.type==='objective').map(c=>c.id)));
// Every face can evaluate both thresholds on a full state and a redacted player view.
for(const round of [3,6])for(const [id,card] of Object.entries(OBJECTIVE_DATA)){
 s.round=round;s.current=card.owner;const result=objectivePreview(s,id);assert.equal(result.tasks.length,3);assert.ok([0,1,2,3,4,5,6,7,9].includes(result.points));
 const room=newRoom('OBJTEST',{user:'test',token:card.owner},cards,s.config);room.status='playing';room.state=s;room.seats=Object.fromEntries(seats.map(seat=>[seat,seat===card.owner?{user:'test',token:card.owner}:null]));
 assert.deepEqual(objectivePreview(roomView(room,{user:'test',token:card.owner}).state,id),result);
}
s=fixture();s.current='US';
// Strict comparisons fail ties; 'most' ignores army tiebreakers and neutral cubes.
Object.assign(s.regions.M.influence,{US:3,CN:3,EU:0,RU:0});Object.assign(s.regions.E.influence,{US:2,CN:0,EU:2,RU:0,neutral:5});s.regions.E.armies.EU=9;s.regions.P.influence.US=3;
let r=objectivePreview(s,'c3a1f3d04f69d');assert.deepEqual(r.tasks.map(t=>t.met),[false,true,true]);assert.equal(r.points,4);
s.round=6;assert.equal(objectivePreview(s,'c3a1f3d04f69d').points,2);
// Russia needs to beat either named rival, and its Central Asian task compares their sum.
s.current='RU';s.round=3;Object.assign(s.regions.E.influence,{RU:2,US:1,EU:4});assert.equal(objectivePreview(s,'c7f989b04d4ff').tasks[1].met,true);
Object.assign(s.regions.C.influence,{RU:3,US:1,CN:2,EU:0});assert.equal(objectivePreview(s,'c9e34c90c88b3').tasks[1].met,false);s.regions.C.influence.RU=4;assert.equal(objectivePreview(s,'c9e34c90c88b3').tasks[1].met,true);
// Cards in all four owned ability zones count; trashed cards, countries and assets don't.
s.current='US';Object.assign(s.players.US,{hand:Array(4).fill(null),deck:Array(5).fill(null),discard:Array(3).fill(null),played:Array(4).fill(null),trash:Array(10).fill(null)});
assert.equal(objectivePreview(s,'cd0a93915b9e4').tasks[1].value,16);
// Stacked trade symbols remain visible, but a country with two qualifying symbols counts once.
s=fixture();s.current='CN';const exportCard=cards.find(c=>COUNTRY_TRADE[c.id]?.exports.includes(3));const underlay=cards.find(c=>c.id!==exportCard.id&&COUNTRY_TRADE[c.id]?.exports.length);
s.players.CN.allies=[exportCard.id];s.players.CN.countryUnderlays={[exportCard.id]:[underlay.id]};r=objectivePreview(s,'ccd05575411b9');
assert.equal(r.tasks[0].value,COUNTRY_TRADE[exportCard.id].exports.length+COUNTRY_TRADE[underlay.id].exports.length);assert.equal(r.tasks[1].value,1);
// FDI country objectives count countries once; regional majorities count individual markers.
s.players.CN.fdi=[exportCard.id,exportCard.id];const foreign=cards.find(c=>c.type==='country'&&c.id!==exportCard.id);s.players.US.allies=[foreign.id];s.players.CN.foreignInvestments=[{host:'US',country:foreign.id},{host:'US',country:foreign.id}];
assert.equal(objectivePreview(s,'cc98959e1210e').tasks[1].value,2);assert.ok(objectivePreview(s,'c06699171a812').tasks[1].value>=1);
s.players.US.allies=[];assert.equal(objectivePreview(s,'cc98959e1210e').tasks[1].value,1);
// Historical return tracks FDI only, even after those investments disappear.
s=fixture();s.current='CN';s.flow.order=['CN','US','EU','RU'];s.flow.checks=[];s.players.CN.fdi=s.players.CN.allies.slice(0,2);s.regions.S.engage.CN=2;
s=applyAction(s,{type:'resolveInvestments',withdraw:{S:2}});const best=s.players.CN.objectiveHistory.bestFdiReturn;assert.ok(best>0);s.players.CN.fdi=[];s.current='CN';s.players.CN.objectiveHistory.bestFdiReturn=20;
assert.equal(objectivePreview(s,'c06699171a812').tasks[2].met,true);s.round=6;assert.equal(objectivePreview(s,'c06699171a812').tasks[2].met,true);
delete s.players.CN.objectiveHistory;assert.equal(objectivePreview(s,'c06699171a812').points,null);assert.throws(()=>resolveObjective(s,'c06699171a812'),/历史/);
assert.equal(resolveObjective(s,'c06699171a812',{2:true}).tasks[2].manualHistory,true);
// Confirmed net basis: 2 -> 3 -> 2 contributes zero, regardless of recorded gains.
assert.equal(OBJECTIVE_PROGRESS_BASIS,'net');
s=fixture();for(const delta of [1,-1])s=applyAction(s,{type:'adjustProduction',key:1,delta});
assert.equal(s.players.US.objectiveHistory.productionGains[1],1);assert.equal(s.players.US.production[1],2);
assert.equal(objectivePreview(s,'c2f5c4cd5cf4c').tasks[2].value,0);
assert.equal(resolveObjective(s,'c2f5c4cd5cf4c',{2:true}).tasks[2].met,false);
assert.doesNotMatch(renderPhaseSettlement(s),/计分口径.*确认/);
// Aggregate progress offsets losses on other tracks before applying its floor.
s=applyAction(s,{type:'adjustProduction',key:0,delta:-1});s=applyAction(s,{type:'adjustProduction',key:2,delta:1});
assert.equal(objectivePreview(s,'c2f5c4cd5cf4c').tasks[2].value,0);
s=applyAction(s,{type:'adjustProduction',key:2,delta:1});
assert.equal(objectivePreview(s,'c2f5c4cd5cf4c').tasks[2].value,1);assert.equal(objectivePreview(s,'c2f5c4cd5cf4c').tasks[2].met,false);
s=applyAction(s,{type:'adjustProduction',key:3,delta:1});
assert.equal(objectivePreview(s,'c2f5c4cd5cf4c').tasks[2].met,true);
s.round=6;assert.equal(objectivePreview(s,'c2f5c4cd5cf4c').tasks[2].met,false);
// All eleven affected objectives resolve at both rounds without progress history.
const progressTask=t=>t.metric==='prosperity'||t.metric.startsWith('production');
const progressObjectives=Object.entries(OBJECTIVE_DATA).filter(([,card])=>card.tasks.some(progressTask));assert.equal(progressObjectives.length,11);
for(const round of [3,6])for(const [id,card] of progressObjectives)for(const recorded of [true,false]){
 s=fixture();s.round=round;s.current=card.owner;const p=s.players[card.owner];p.production=[...INITIAL_PRODUCTION[card.owner]];p.prosperity=0;
 if(recorded){p.objectiveHistory.productionGains=Array(7).fill(9);p.objectiveHistory.prosperityGains=9;}else delete p.objectiveHistory;
 const result=resolveObjective(s,id);
 for(const [index,task] of card.tasks.entries())if(progressTask(task)){
  assert.equal(result.tasks[index].value,0,card.name);assert.equal(result.tasks[index].met,false,card.name);assert.equal(result.tasks[index].rulePending,undefined);
 }
 assert.notEqual(result.points,null);
 p.production=[...ECONOMY[card.owner].max];p.prosperity=5;
 const completed=resolveObjective(s,id);
 for(const [index,task] of card.tasks.entries())if(progressTask(task))assert.equal(completed.tasks[index].met,true,card.name);
}
// Current prosperity counts, while Croatia still remembers a past increase after a loss.
s=fixture();s.current='EU';let before=structuredClone(s);s.players.EU.prosperity=3;recordObjectiveProgress(before,s);
assert.equal(objectivePreview(s,'c9605624cbc07').tasks[0].met,true);
before=structuredClone(s);s.players.EU.prosperity=0;recordObjectiveProgress(before,s);
assert.equal(objectivePreview(s,'c9605624cbc07').tasks[0].met,false);assert.equal(s.players.EU.objectiveHistory.prosperityGains,3);
assert.equal(specialEventModel(s,{cardId:'cda82df9a0c65'}).improved,true);
// Server controls points, preserves checkpoints and strips task details from other views.
s=fixture();const identities=Object.fromEntries(seats.map(id=>[id,{user:'objective-test',token:id}]));let room=newRoom('OBJTEST',identities.US,cards,s.config);room.status='playing';room.seats=identities;room.state=s;
const first=s.players.US.objectives[0],expected=objectivePreview(s,first).points;
const command={op:'action',id:'score-once',gameRevision:0,action:{type:'settlePhaseTask',taskId:settlementProgress(s).key,confirmed:true,cardId:first,points:99,scoreMode:'apply'}};
room=changeRoom(room,identities.US,command,cards);assert.equal(room.state.players.US.vp,expected);assert.equal(room.state.settlementJournal.at(-1).points,expected);assert.equal(room.state.settlementJournal.at(-1).mode,'automatic');
assert.equal(changeRoom(room,identities.US,command,cards),room);room=JSON.parse(JSON.stringify(room));assert.equal(settlementProgress(room.state).done.length,1);
const other=roomView(room,identities.CN).state;assert.ok(!JSON.stringify(other.players.US.scoredObjectives).includes('tasks'));assert.ok(!JSON.stringify(other).includes(first));
const ui=renderPhaseSettlement(roomView(room,identities.CN).state);assert.match(ui,/自动核对/);assert.doesNotMatch(ui,/settlement-points/);
console.log('Objectives passed: all 32 faces / both rounds / redacted previews; 11 net-progress objectives, cross-track losses, retained Croatia/FDI history, comparisons, card zones, stacked exports, server scoring, retries, persistence and privacy.');
