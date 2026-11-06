import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {POWER_IDS} from '../dist/player-configuration.js';
import {startEventPhase,handleEventAction} from '../dist/event-flow.js';
import {nextAutomaticFlowAction,advanceAutomaticFlow} from '../dist/automatic-flow.js';
import {nonPlayerDecision} from '../dist/non-player-decisions.js';
import {resolveNonPlayerRewardChoice,drainNonPlayerRewards} from '../dist/non-player-rewards.js';
import {AREAS,syncInfluence} from '../dist/world.js';
import {newRoom,changeRoom,playerView} from '../server/rooms.js';
import {eventActor} from '../dist/interaction-state.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
const START='ce9e1586521dc',NORD='c8c95b49f81e7';
function fixture(humans=['CN'],mode='advanced'){
 const s=createState(cards,{humans,automatonMode:mode,dd:true,wit:true},()=>.4);
 for(const p of Object.values(s.players)){p.assetChoices=p.objectiveChoices=p.openingChoices=null;if(!p.nonPlayer)p.money=100;if(!p.automa&&!p.nonPlayer)p.resources.fill(10);}
 s.current=humans[0];s.flow=newFlow(mode==='advanced'?POWER_IDS:humans);s.flow.step='events';s.phase='事件';s.eraDeck=[];s.era2Deck=[];
 s.eventBoard={round:1,slots:[null,null,null],personal:Object.fromEntries(POWER_IDS.map(id=>[id,null])),queued:[],seen:[],choice:null,revealQueue:[],distribution:null};
 return s;
}
function start(s,id){s.eventBoard.slots[2]=id;startEventPhase(s);return s.flow.eventResolution;}
function reward(s,step){const q={cardId:'cf0d87e580c4a',rewardQueue:[step],nonPlayerChoice:{...step,source:'reward'},receipts:[]};const before=JSON.stringify(s),a=nonPlayerDecision(s,q);assert.equal(JSON.stringify(s),before,'Policy must not mutate state or reveal cards');resolveNonPlayerRewardChoice(s,q,a);assert.equal(q.nonPlayerChoice,undefined);return a;}
const originalRandom=Math.random;Math.random=()=>0;
try{
 // Reopen an actual saved disarm prompt in a single-CN-human room. The
 // sanitized view can request continuation without inspecting hidden decks.
 let s=fixture();s.regions.E.armies.US=2;s.regions.E.armies.RU=2;start(s,START);
 assert.equal(s.flow.eventResolution.nonPlayerChoice.type,'disarm');
 s=JSON.parse(JSON.stringify(s));const view=playerView(s,'CN'),beforeView=JSON.stringify(view),a=nextAutomaticFlowAction(view);
 assert.deepEqual(a,{type:'resolveNonPlayerChoice',cardId:START});assert.equal(JSON.stringify(view),beforeView);
 const identity={user:'automa-decisions',token:'cn-test'},room=newRoom('AI1122',identity,cards,s.config);room.status='playing';room.seats={CN:identity};room.state=s;
 const command={id:'resume-old-disarm',op:'action',gameRevision:room.gameRevision,action:{...a,placements:{E:999}}};
 const after=changeRoom(room,identity,command,cards),history=after.state.eventHistory.find(e=>e.cardId===START);
 assert.equal(history.agreement.success,true);assert.equal(history.submissions.US.count,1);assert.equal(history.submissions.RU.count,1);
 assert.equal(after.state.regions.E.armies.US,1);assert.equal(after.state.regions.E.armies.RU,1);
 for(const owner of ['US','RU'])assert.equal(history.receipts.flatMap(r=>r.changes).filter(c=>c.player===owner).flatMap(c=>c.items).filter(i=>i.label==='资金').reduce((n,i)=>n+i.delta,0),-5,'Agreement charges one converted diplomacy');
 assert.deepEqual(changeRoom(after,identity,command,cards),after,'Retry must not remove another army');
 assert.throws(()=>changeRoom(after,identity,{...command,id:'stale'},cards),/局面已更新/);

 // A second human can have been the prior actor: internal continuation must
 // cross to the existing first-human proxy, then stop at the real decision.
 s=fixture(['US','CN']);s.regions.N.armies.RU=2;start(s,START);s.current='CN';advanceAutomaticFlow(s);
 assert.equal(s.flow.eventResolution.nonPlayerChoice,undefined);assert.equal(s.flow.eventResolution.submissions.RU.count,1);
 assert.equal(s.flow.eventResolution.stage,'agreement');assert.equal(s.current,'US');assert.equal(s.regions.N.armies.RU,2,'Promise is not charged before agreement');

 // A human EU acceptance opens RU's reward while CN is the first human.
 // The whole non-player continuation runs inside the same authoritative turn.
 s=fixture(['CN','EU']);s.regions.E.temporary=['RU','CN','RU'];syncInfluence(s.regions.E);start(s,NORD);s.current='EU';
 handleEventAction(s,{type:'submitEvent',cardId:NORD,accept:true});assert.equal(s.flow.eventResolution.nonPlayerChoice.type,'nordstream');
 advanceAutomaticFlow(s);const nord=s.eventHistory.find(e=>e.cardId===NORD);assert.ok(nord);assert.equal(s.regions.E.temporary.filter(id=>id==='RU').length,1);

 for(const mode of ['advanced','basic']){
  const humans=mode==='advanced'?['CN']:['US','CN'];s=fixture(humans,mode);
  // Mandatory withdrawal moves every actual army and never fabricates a
  // reserve; voluntary paid deployment is capped by the automa's real cash.
  s.regions.C.armies.EU=3;let armyTotal=Object.values(s.regions).reduce((n,r)=>n+r.armies.EU,0);
  reward(s,{owner:'EU',type:'withdraw',max:3,regions:['E','N','A']});assert.equal(s.regions.C.armies.EU,0);assert.equal(Object.values(s.regions).reduce((n,r)=>n+r.armies.EU,0),armyTotal);
  s.players.RU.money=mode==='advanced'?7:0;const old=s.regions.P.armies.RU;
  let decision=reward(s,{owner:'RU',type:'move',region:'P',max:2,moveCost:5});assert.equal(s.regions.P.armies.RU-old,mode==='advanced'?1:2);assert.equal(s.players.RU.money,mode==='advanced'?2:0);
  reward(s,{owner:'RU',type:'place',regions:['N'],max:1});assert.ok(s.regions.N.armies.RU>=1);
  s.regions.E.temporary=['RU','CN','RU'];syncInfluence(s.regions.E);
  decision=reward(s,{owner:'RU',type:'convert',targets:[{region:'E',index:2},{region:'E',index:0}]});assert.equal(decision.index,0);assert.deepEqual(s.regions.E.temporary,['CN','RU']);
  s.players.RU.money=mode==='advanced'?0:0;
  decision=reward(s,{owner:'RU',type:'nordstream',targets:[{region:'E',index:1}]});assert.equal(decision.skip,mode==='advanced'?true:undefined);assert.equal(s.players.RU.money,mode==='advanced'?15:0);
  // TTIP holder chooses its face and a legal partner production key. These
  // are the holder's card choices, not a separate human response.
  const owner='EU',partner=s.players.US,production=[...partner.production];s.players[owner].money=mode==='advanced'?30:0;
  decision=reward(s,{owner,type:'ttip'});assert.equal(decision.face,'investment');
  if(!partner.automa)assert.equal(partner.production.reduce((a,b)=>a+b,0)-production.reduce((a,b)=>a+b,0),1);
  if(mode==='advanced')assert.equal(s.players[owner].money,5);
 }
 s=fixture(['US']);s.players.EU.money=24;assert.equal(reward(s,{owner:'EU',type:'ttip'}).face,'exchange');assert.equal(s.players.EU.money,24);
 s=fixture();const q={rewardQueue:[{owner:'RU',type:'bricsCountry',optional:true}],receipts:[]};drainNonPlayerRewards(s,q,()=>{});assert.ok(q.nonPlayerChoice.countries.length);
 const previous=s.players.RU.allies.length,choice=nonPlayerDecision(s,q);assert.ok(q.nonPlayerChoice.countries.includes(choice.country));resolveNonPlayerRewardChoice(s,q,choice);assert.equal(s.players.RU.allies.length,previous+1);
 // Script routing keeps event ownership; unrelated human seats gain no
 // authority to settle or alter the automa's actual event offer.
 s=fixture(['US','CN']);s.regions.E.armies.RU=1;start(s,START);assert.equal(eventActor(s),'US');
 s.current='CN';assert.throws(()=>handleEventAction(s,{type:'resolveNonPlayerChoice',cardId:START}),/责任玩家/);
 console.log('Non-player decisions passed: saved single-CN prompt, second-human continuation, authoritative targets/fees, no early agreement charge, all seven choice types, basic+advanced, view purity, retry/version and seat restrictions.');
}finally{Math.random=originalRandom;}
