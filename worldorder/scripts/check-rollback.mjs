import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {newRoom,changeRoom,roomView} from '../server/rooms.js';
import {createRollback,recordRollback,restoreRollback,rollbackAvailability,rollbackRevealReason,rollbackTurnKey,ROLLBACK_STEPS,ROLLBACK_MAX_AGE} from '../dist/rollback-state.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
const seats=['US','CN','EU','RU'],who=Object.fromEntries(seats.map(seat=>[seat,{user:'rollback-test',token:'private-'+seat}]));
const identity=seat=>({seat,...who[seat]});
const domestic='cf9aa23c4a315',ally='c534f4023459a';
let serial=0;
function fixture(){
 const s=createState(cards,{dd:true,wit:false},()=>.5);
 for(const p of Object.values(s.players)){
  p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.hand=[domestic,ally];p.deck=['c17bf3b6aa665'];p.discard=[];p.money=100;p.resources=Array(7).fill(10);
 }
 s.flow=newFlow(seats);s.initialOrder=seats;s.actionTurns={index:0,completed:Object.fromEntries(seats.map(id=>[id,0]))};
 return s;
}
function roomFixture(){const r=newRoom('RBACK2',who.US,cards,{dd:true,wit:false});r.state=fixture();r.status='playing';r.seats={...who};return r;}
function cmd(r,op,extra={}){return {id:String(++serial),op,gameRevision:r.gameRevision,...extra};}
function act(r,seat,action){return changeRoom(r,who[seat],cmd(r,'action',{action,seatRevision:r.seatRevisions[seat]}),cards);}
function undo(r,seat,scope){return changeRoom(r,who[seat],cmd(r,'undo',{scope}),cards);}
function avail(r,seat){return roomView(r,who[seat]).rollback;}

// Asset/objective candidates are generated up front, but the opening screen
// first reveals them after A/B is committed. The draft may be edited; the
// already-informed player cannot go back and select another opening group.
let setup=newRoom('SETUP2',who.US,cards,{dd:true,wit:false});setup.status='playing';setup.seats={...who};
// Legacy A/B drafts still need the first-reveal barrier. New fixed-hand drafts
// are exercised with selectAssetDiscard in check-opening-ui.mjs.
delete setup.state.openingHandVersion;
for(const p of Object.values(setup.state.players)){p.openingChoices=[[...p.hand],[...p.deck]];p.hand=[];p.deck=[];}
const concealedSetup=roomView(setup,who.US);
assert.ok(concealedSetup.state.players.US.openingChoices);assert.equal(concealedSetup.state.players.US.assetChoices,null);assert.equal(concealedSetup.state.players.US.objectiveChoices,null);
assert.equal(concealedSetup.seats.US.setupDone,false);assert.equal(concealedSetup.state.players.US.setupPending,true);
setup=act(setup,'US',{type:'chooseOpening',group:0});
assert.deepEqual(roomView(setup,who.US).state.players.US.assetChoices,setup.state.players.US.assetChoices);
assert.deepEqual(roomView(setup,who.US).state.players.US.objectiveChoices,setup.state.players.US.objectiveChoices);
assert.equal(avail(setup,'US').step.available,false);assert.equal(avail(setup,'US').phase.available,false);
assert.throws(()=>undo(setup,'US','step'),/资产与目标卡已经揭示/);
setup=act(setup,'US',{type:'toggleAssetSelection',id:setup.state.players.US.assetChoices[0].id});
assert.equal(avail(setup,'US').phase.available,true);assert.equal(avail(setup,'US').turn.available,false);
setup=undo(setup,'US','phase');assert.equal(setup.state.players.US.openingChoices,null);assert.deepEqual(setup.state.players.US.assetSelection,[]);
const prematureFlow=structuredClone(setup.state);prematureFlow.flow=newFlow(seats);prematureFlow.actionTurns={index:0,completed:{}};
assert.equal(rollbackTurnKey(prematureFlow,'US'),null);

// One atomic room command restores the whole stage; revisions and receipts
// remain monotonic, and an earlier returned room has not been mutated.
let r=roomFixture(),initial=r;
r=act(r,'US',{type:'resource',key:'money',delta:1});
r=act(r,'US',{type:'resource',key:'money',delta:1});
assert.equal(initial.state.players.US.money,100);assert.equal(r.state.players.US.money,102);
assert.equal(r.rollback.steps[0].state,initial.state);
const beforeUndo=r.gameRevision,undoCommand=cmd(r,'undo',{scope:'phase'});
r=changeRoom(r,who.US,undoCommand,cards);
assert.equal(r.state.players.US.money,100);assert.equal(r.gameRevision,beforeUndo+1);
assert.equal(changeRoom(r,who.US,undoCommand,cards),r);
assert.throws(()=>changeRoom(r,who.US,{...cmd(r,'undo'),gameRevision:beforeUndo},cards),/局面已更新/);

// A full action includes its end, but ceases to be available as soon as the
// next player actually commits an operation.
r=act(r,'US',{type:'passTurn',cardId:domestic});
assert.equal(r.state.actionTurns.index,1);assert.equal(avail(r,'US').turn.available,true);
r=undo(r,'US','turn');assert.equal(r.state.actionTurns.index,0);assert.equal(r.state.players.US.money,100);
r=act(r,'US',{type:'passTurn',cardId:domestic});
r=act(r,'CN',{type:'passTurn',cardId:domestic});
assert.equal(avail(r,'US').turn.available,false);
assert.throws(()=>undo(r,'US','turn'),/其他玩家/);
r=undo(r,'CN','turn');assert.equal(r.state.actionTurns.index,1);
assert.equal(avail(r,'US').turn.available,false);

// Retain the stage/action start even when the short single-step ring fills.
r=roomFixture();const start=r.state;
for(let i=0;i<ROLLBACK_STEPS+5;i++)r=act(r,'US',{type:'resource',key:'money',delta:1});
assert.equal(r.rollback.steps.length,ROLLBACK_STEPS);assert.equal(r.rollback.turn.state,start);
assert.equal(r.rollback.phase.state,start);assert.ok(r.rollback.steps.every(entry=>!entry.state.rollback));
r=JSON.parse(JSON.stringify(r));assert.equal(avail(r,'US').turn.available,true);
const wire=JSON.stringify(roomView(r,who.US));assert.ok(!wire.includes('private-'));assert.ok(!wire.includes('nextId'));assert.ok(!wire.includes('phaseKey'));
r=undo(r,'US','turn');assert.equal(r.state.players.US.money,100);

// Actual draws seal all earlier checkpoints. Safe later operations may be
// stepped back, while a whole action cannot cross its draw.
r=roomFixture();r=act(r,'US',{type:'resource',key:'money',delta:1});r=act(r,'US',{type:'draw'});
assert.equal(avail(r,'US').step.available,false);assert.equal(avail(r,'US').turn.available,false);
assert.throws(()=>undo(r,'US','turn'),/新信息/);
r=act(r,'US',{type:'resource',key:'money',delta:1});assert.equal(avail(r,'US').step.available,true);assert.equal(avail(r,'US').turn.available,false);
r=undo(r,'US','step');assert.equal(r.state.players.US.money,101);assert.equal(r.state.players.US.hand.length,3);

// Real country acquisition reveals the replacement top card and is sealed.
r=roomFixture();const country=r.state.regions.M.available[0];
r=act(r,'US',{type:'playBasicCard',cardId:ally,country,slot:'temporary'});
assert.equal(r.state.players.US.allies.includes(country),true);assert.equal(avail(r,'US').turn.available,false);
assert.match(avail(r,'US').turn.reason,/国家牌/);

// Seat replacement never inherits another tab's checkpoints; legacy history
// without the new disclosure metadata is intentionally not trusted.
r=roomFixture();r=act(r,'US',{type:'resource',key:'money',delta:1});
r=changeRoom(r,{user:who.US.user,token:'replacement'},cmd(r,'join',{seat:'US',takeover:true}),cards);
assert.equal(roomView(r,{user:who.US.user,token:'replacement'}).canUndo,false);
assert.throws(()=>undo(r,'US','step'),/接管/);
const legacy=roomFixture();delete legacy.rollback;legacy.history=[{state:fixture(),seat:'US',...who.US}];
assert.equal(roomView(legacy,who.US).canUndo,false);

// Stage scopes follow the current sequence step, while the action checkpoint
// covers every safe step (including extra plays) by the same owner.
let s=fixture(),ledger=createRollback(),clock=1000;
function record(next,seat='US',action={}){ledger=recordRollback(ledger,s,next,{...identity(seat),action,now:++clock});s=next;}
let next=structuredClone(s);next.flow.turnCards=[domestic];next.flow.cardResolution={owner:'US',cardId:domestic,index:0,steps:[{type:'influence'},{type:'influence'}],context:{}};record(next);
const phaseStart=s;
next=structuredClone(s);next.players.US.money--;record(next);
next=structuredClone(s);next.players.US.money--;next.flow.cardResolution.index=1;record(next);
assert.equal(restoreRollback(ledger,identity('US'),'phase',clock).state.players.US.money,phaseStart.players.US.money);
assert.equal(restoreRollback(ledger,identity('US'),'turn',clock).state.flow.cardResolution,undefined);
next=structuredClone(s);next.flow.cardResolution.responder='CN';record(next);
next=structuredClone(s);delete next.flow.cardResolution.responder;record(next,'CN');
assert.equal(rollbackAvailability(ledger,identity('CN'),clock).turn.available,false);
next=structuredClone(s);next.players.US.money--;record(next,'US');
assert.equal(rollbackAvailability(ledger,identity('US'),clock).turn.available,false);
assert.equal(rollbackAvailability(ledger,identity('US'),clock).step.available,true);

// Disclosure surfaces: peek-only effects, hand swaps, private strategic
// candidates, market refill, events, sealed bids and country-deck search.
const probes=[
 ['hand',s=>s.players.US.hand.push('unseen')],
 ['peek',s=>s.flow.pendingGrowth={owner:'US',inspected:['unseen']}],
 ['asset',s=>s.flow.pendingGrowth={owner:'US',candidates:['unseen']}],
 ['opponent',s=>s.flow.cardResolution={index:0,steps:[{type:'copyAbility'}],context:{inspectedPlayer:'CN'}}],
 ['country search',s=>s.flow.cardResolution={index:0,steps:[{type:'effect',card:{countrySearchRegion:'E'}}],context:{}}],
 ['BRICS search',s=>s.flow.eventResolution={rewardQueue:[{type:'bricsCountry',owner:'RU'}]}],
 ['market',s=>s.market.push(s.marketDeck.shift())],
 ['event',s=>s.eventBoard={seen:['new-event']}],
 ['random',s=>s.eventCountryRandom=1]
];
for(const [label,mutate] of probes){const before=fixture(),after=structuredClone(before);mutate(after);assert.ok(rollbackRevealReason(before,after),label);}
s=fixture();s.flow.eventResolution={mode:'bid',stage:'bid'};next=structuredClone(s);next.flow.eventResolution.stage='result';assert.match(rollbackRevealReason(s,next),/秘密投标/);
// Keeping an already inspected card reveals nothing new and is undoable.
s=fixture();s.flow.pendingGrowth={owner:'US',inspected:['known']};next=structuredClone(s);next.players.US.hand.push('known');next.flow.pendingGrowth=null;
assert.equal(rollbackRevealReason(s,next,{type:'finishGrowthAbility'}),null);

// An expired start must not silently become a partial phase/action rollback.
s=fixture();next=structuredClone(s);next.players.US.money++;
ledger=recordRollback(createRollback(),s,next,{...identity('US'),now:1});
assert.equal(rollbackAvailability(ledger,identity('US'),ROLLBACK_MAX_AGE+2).turn.available,false);
s=next;next=structuredClone(s);next.players.US.money++;
ledger=recordRollback(ledger,s,next,{...identity('US'),now:ROLLBACK_MAX_AGE+3});
assert.equal(rollbackAvailability(ledger,identity('US'),ROLLBACK_MAX_AGE+3).turn.available,false);
assert.equal(rollbackAvailability(ledger,identity('US'),ROLLBACK_MAX_AGE+3).step.available,true);
console.log('Rollback passed: bounded immutable checkpoints, phase/action restore, disclosures, intervening responders, privacy, persistence, identity takeover, expiry, monotonic revisions and retry receipts.');
