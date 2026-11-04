import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {currentActor} from '../dist/phase-state.js';
import {EVENT_DATA} from '../dist/event-data.js';
import {regionCountries} from '../dist/country-piles.js';
import {initializeEvents,queueChain,prepareNextEvents,continueEventDistribution,syncEventBoard} from '../dist/event-board.js';
import {startEventPhase,canPostponeEvent} from '../dist/event-flow.js';
import {newRoom,changeRoom,playerView,roomView} from '../server/rooms.js';
import {renderRoomFlow} from '../dist/room-ui.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const ids=['US','CN','EU','RU'],crisis='c402371a1ff87',aid='c4bfa45373360',paris='c2bacc7276393',bid='cd771b6a9d234',minsk='c963b6d849299',personal='cb7934569eecb',brexit='c6b05cba7d362';
function fixture(events=[crisis],round=1){
 const s=createState(cards,{wit:true,dd:false},()=>.3);for(const p of Object.values(s.players))p.openingChoices=p.assetChoices=p.objectiveChoices=null;
 s.round=round;s.current='US';s.flow=newFlow(ids,round);s.flow.step='events';s.phase='事件';s.actionTurns={index:16,completed:{US:4,CN:4,EU:4,RU:4}};
 s.eventBoard={round,slots:[null,null,null],personal:Object.fromEntries(ids.map(id=>[id,null])),seen:[...events],queued:[],choice:null,revealQueue:[],distribution:null};s.eventHistory=[];s.eventDiscard=[];s.resolvedEvents=[];s.eraDeck=[];s.era2Deck=[];
 for(const id of events){const c=EVENT_DATA[id];if(c.players.length===1)s.eventBoard.personal[c.players[0]]=id;else s.eventBoard.slots[s.eventBoard.slots.lastIndexOf(null)]=id;}
 syncEventBoard(s);startEventPhase(s);return s;
}
const action=(s,type,fields={})=>applyAction(s,{type,cardId:s.flow?.eventResolution?.cardId,...fields});
const submit=(s,fields={})=>action(s,'submitEvent',fields);
function finish(s){for(let i=0;s.flow?.step==='events'&&i<50;i++){
 if(s.eventBoard.choice){s=action(s,s.eventBoard.choice.type==='personal'?'choosePersonalEvent':'resolveEventReveal',{cardId:s.eventBoard.choice.candidates?.[0],moves:[]});continue;}
 const q=s.flow.eventResolution;s=action(s,q.stage==='result'?'ackEvent':'submitEvent',{accept:false,amount:0,production:[],productionKey:s.players[s.current].production.findIndex(n=>n>1),confirmed:true});
 }assert.equal(s.flow.step,'aftermath');return s;}
assert.equal(Object.keys(EVENT_DATA).length,60);
for(const era of ['I','II','chain'])assert.equal(cards.filter(c=>c.type==='event'&&c.era===era).length,era==='chain'?16:22);
for(const c of cards.filter(c=>c.type==='event'))assert.equal(c.name,EVENT_DATA[c.id].name);
// Real setup: both public slots, at most one personal each, and every physical card accounted for.
for(let seed=1;seed<=80;seed++){
 let n=seed;const rng=()=>{n=(n*1664525+1013904223)>>>0;return n/2**32;};const s=createState(cards,{wit:true,dd:false},rng),b=s.eventBoard;
 assert.equal(s.events.length,2);assert.equal(b.slots[0],null);assert.equal(b.choice,null);
 assert.ok(s.events.every(id=>EVENT_DATA[id].players.length>1));
 assert.ok(Object.entries(b.personal).every(([owner,id])=>!id||EVENT_DATA[id].players[0]===owner));
 const stock=[...s.eraDeck,...s.era2Deck,...s.chain,...s.events,...Object.values(b.personal).filter(Boolean),...s.eventDiscard];assert.equal(stock.length,60);assert.equal(new Set(stock).size,60);
}
// Setup duplicate personals discard the new one; turnings replace immediately.
let s=fixture();s.eraDeck=[personal,'c2356e9f50f6e','c0f88810dea36',aid];s.chain=cards.filter(c=>c.era==='chain').map(c=>c.id);initializeEvents(s,()=>0);
assert.equal(s.eventBoard.personal.RU,personal);assert.ok(s.eventDiscard.includes('c2356e9f50f6e'));assert.ok(s.eventDiscard.includes('c0f88810dea36'));assert.equal(s.events.length,2);assert.ok(!s.events.includes('c0f88810dea36'));
// Right-to-left public resolution precedes the owner's personal event.
s=fixture([aid,paris,personal]);assert.equal(s.flow.eventResolution.cardId,aid);for(let i=0;i<4;i++)s=submit(s,{amount:0});s=action(s,'ackEvent');assert.equal(s.flow.eventResolution.cardId,paris);for(let i=0;i<4;i++)s=submit(s,{production:[]});s=action(s,'ackEvent');assert.equal(s.current,'RU');assert.ok(canPostponeEvent(s));
let before=structuredClone(s);s=action(s,'postponeEvent');assert.equal(s.flow.step,'aftermath');assert.equal(s.players.RU.smart,before.players.RU.smart-1);assert.equal(s.eventBoard.personal.RU,personal);
for(const round of [1,6]){s=fixture([brexit],round);assert.equal(canPostponeEvent(s),false);assert.throws(()=>action(s,'postponeEvent'));}s=fixture([personal],6);assert.equal(canPostponeEvent(s),false);s=finish(s);assert.ok(s.eventDiscard.includes(personal));
// Money exactly at starting value uses the lower branch. Minimum tracks never block forced effects.
s=fixture();for(const p of Object.values(s.players)){p.production=Array(7).fill(1);p.prosperity=0;}
const vp=s.players.US.vp;s=submit(s);assert.equal(s.players.US.vp,vp-2);assert.equal(s.players.US.prosperity,0);assert.deepEqual(s.players.US.production,Array(7).fill(1));s=finish(s);
s=fixture();s.players.US.money=60;s=submit(s);assert.equal(s.players.US.vp,2);
s=fixture();s.players.US.money=31;assert.throws(()=>submit(s),/选择/);s=submit(s,{productionKey:0});assert.equal(s.players.US.production[0],2);assert.equal(s.players.US.vp,0);assert.equal(s.players.US.prosperity,0);
// Voluntary Paris costs must really be paid; bad/duplicate choices roll back atomically.
s=fixture([paris]);s.players.US.resources[5]=9;before=JSON.stringify(s);assert.throws(()=>submit(s,{production:[0,0]}));assert.equal(JSON.stringify(s),before);s=submit(s,{production:[0,1]});assert.equal(s.players.US.vp,2);assert.equal(s.players.US.resources[5],10);
s=fixture([aid]);s.players.US.money=25;s.players.US.resources[2]=1;before=JSON.stringify(s);assert.throws(()=>submit(s,{amount:2}));assert.equal(JSON.stringify(s),before);s=submit(s,{amount:1});assert.equal(s.players.US.money,15);assert.equal(s.players.US.resources[2],0);assert.equal(s.players.US.smart,3);
// Secret bids: no balance change until reveal, only own submission in private views, persisted across reload.
s=fixture([bid],4);s.players.US.money=40;startEventPhase(s);const initial=structuredClone(s.players);s=submit(s,{amount:1});assert.deepEqual(s.players,initial);assert.deepEqual(playerView(s,'CN').flow.eventResolution.submissions,{});assert.equal(playerView(s,'US').flow.eventResolution.submissions.US.total,1);assert.throws(()=>action(s,'resource',{key:5,delta:1}),/当前事件/);
assert.match(renderRoomFlow(playerView(s,'US'),byId),/秘密投标/);s=submit(JSON.parse(JSON.stringify(s)),{amount:2});s=submit(s,{amount:1});assert.equal(s.flow.eventResolution.stage,'result');assert.deepEqual(s.flow.eventResolution.totals,{US:3,RU_CN:3,modifier:2});assert.equal(s.players.US.vp,1);assert.equal(s.players.RU.vp,-1);assert.equal(s.players.CN.vp,-1);assert.equal(s.players.CN.smart,initial.CN.smart+2);assert.equal(s.players.US.resources[5],initial.US.resources[5]-1);assert.equal(playerView(s,'EU').flow.eventResolution.submissions.US.total,1);assert.throws(()=>submit(s,{amount:1}),/已结算/);
s=action(s,'ackEvent');assert.equal(s.eventHistory.length,1);assert.equal(s.flow.step,'aftermath');
// Modifier-only win gives no own rewards; all zero discards without even penalties.
for(const money of [0,20]){s=fixture([bid],4);s.players.US.money=money;startEventPhase(s);for(let i=0;i<3;i++)s=submit(s,{amount:0});assert.equal(s.players.US.vp,0);assert.equal(s.players.US.smart,2);assert.equal(s.players.RU.vp,money?-1:0);}
s=fixture([bid],4);s.players.US.money=0;startEventPhase(s);s=submit(s,{amount:0});s=submit(s,{amount:1});s=submit(s,{amount:0});assert.equal(s.players.CN.vp,1);assert.equal(s.players.RU.vp,0);assert.equal(s.players.US.vp,-2);
// Agreement exact contribution, decline does not pay, chain is unique.
s=fixture([minsk]);s.activeEffects=['cc83057306d10'];s=submit(s,{amount:2});before=JSON.stringify(s);assert.throws(()=>submit(s,{amount:1}),/恰好5/);assert.equal(JSON.stringify(s),before);s=submit(s,{amount:3});assert.equal(s.players.EU.smart,4);assert.equal(s.players.RU.smart,5);assert.equal(s.players.EU.vp,2);assert.deepEqual(s.activeEffects,[]);
s=fixture([minsk]);const dip=s.players.EU.resources[5];s=submit(s,{amount:2});s=submit(s,{amount:0});assert.equal(s.players.EU.resources[5],dip);assert.equal(s.players.EU.vp,-2);assert.ok(s.eventBoard.queued.includes('cd780718be7a6'));assert.equal(queueChain(s,'cd780718be7a6'),false);
// Round 3 refill uses Era II, chain at left, duplicate personal choice blocks next phase.
s=fixture([],3);s.flow.step='events';s.flow.eventRound.complete=true;s.eventBoard.personal.RU=personal;s.eventBoard.queued=[minsk];s.era2Deck=['ce6ac843efc6e',bid,'ce97d5ccaf589'];s.eraDeck=[aid];prepareNextEvents(s);assert.equal(s.eventBoard.slots[0],minsk);assert.equal(s.eventBoard.choice.owner,'RU');s.current='RU';s=action(s,'choosePersonalEvent',{cardId:personal});assert.ok(s.eventDiscard.includes('ce6ac843efc6e'));assert.equal(s.flow.step,'aftermath');assert.equal(s.eraDeck[0],aid);assert.deepEqual(s.eventBoard.slots,[minsk,'ce97d5ccaf589',bid]);
// Reveal movement reserves all fees/armies atomically and resumes both owners after reload.
s=fixture([],3);s.flow.step='events';s.flow.eventRound.complete=true;s.era2Deck=['c0a692aca2850',bid];prepareNextEvents(s);s.current=currentActor(s);assert.equal(s.current,'US');s.players.US.money=9;before=JSON.stringify(s);assert.throws(()=>action(s,'resolveEventReveal',{moves:['reserve','reserve']}),/资金不足/);assert.equal(JSON.stringify(s),before);s=action(s,'resolveEventReveal',{moves:['reserve']});assert.equal(s.current,'EU');s=action(JSON.parse(JSON.stringify(s)),'resolveEventReveal',{moves:[]});assert.equal(s.flow.step,'aftermath');assert.equal(s.regions.C.armies.US,1);assert.equal(s.players.US.money,4);
// Axis turning is immediate and neutral influence uses permanent slots first, then the temporary queue.
for(const full of [false,true]){s=fixture();s.eventBoard.slots=[null,null,null];s.eventBoard.distribution={kind:'round',round:2,remaining:0,chains:['c0231330f35ed']};if(full){s.regions.N.permanent.fill('US');s.regions.N.temporary=['US','CN','EU','RU','US'];}const old=s.regions.N.influence.neutral;continueEventDistribution(s,()=>0);assert.ok(s.eventDiscard.includes('c0231330f35ed'));if(full)assert.equal(s.regions.N.temporary.at(-1),'neutral');else assert.equal(s.regions.N.influence.neutral,old+1);}
// Real room commands, stale requests, idempotent final reveal and forbidden undo after disclosure.
const who=Object.fromEntries(ids.map(id=>[id,{user:'wit-check',token:id}]));let room=newRoom('EVT001',who.US,cards,{wit:true,dd:false});room.status='playing';room.seats=structuredClone(who);room.state=fixture([bid],4);let serial=0;
function command(seat,a){const c={id:String(++serial),op:'action',gameRevision:room.gameRevision,action:a};room=changeRoom(room,who[seat],c,cards);return c;}
assert.throws(()=>command('CN',{type:'submitEvent',cardId:bid,amount:1}),/等待/);
command('US',{type:'submitEvent',cardId:bid,amount:1});command('CN',{type:'submitEvent',cardId:bid,amount:1});const c=command('RU',{type:'submitEvent',cardId:bid,amount:1});before=JSON.stringify(room);room=changeRoom(room,who.RU,c,cards);assert.equal(JSON.stringify(room),before);assert.equal(roomView(room,who.RU).canUndo,false);assert.throws(()=>changeRoom(room,who.RU,{id:'undo-final',op:'undo',gameRevision:room.gameRevision},cards),/已经.*揭晓/);
// Manual fallback remains usable, but cannot retroactively alter a confirmed seat.
s=fixture([personal]);s.flow.eventResolution.mode='manual';s=action(s,'adjustEventProsperity',{delta:-1});assert.equal(s.players.RU.prosperity,0);s=action(s,'adjustEventProsperity',{delta:1});assert.equal(s.players.RU.prosperity,1);assert.equal(canPostponeEvent(s),false);assert.throws(()=>action(s,'postponeEvent'),/不能延期/);s=submit(s,{confirmed:true});s.current='RU';assert.throws(()=>action(s,'adjustEventProsperity',{delta:1}),/当前事件/);
// An old save already resolving Pivot manually retains its four-seat workflow.
s=fixture(['c4f52659f1ea9']);s.flow.eventResolution.mode='manual';s.flow.eventResolution.participants=[...ids];before=JSON.stringify(s);assert.throws(()=>submit(s,{confirmed:true,chains:['cd84688476fde','c870029980e16']}),/最多触发1/);assert.equal(JSON.stringify(s),before);s=submit(s,{confirmed:true,chains:['cd84688476fde']});assert.deepEqual(s.eventBoard.queued,['cd84688476fde']);assert.throws(()=>submit(s,{confirmed:true,chains:['c870029980e16']}),/最多触发1/);
// Explicit repeat is distinct from re-triggering a once-per-game chain.
s=fixture(['cbb2924757345']);s.flow.eventResolution.mode='manual';s.flow.eventResolution.stage='resolve';delete s.flow.eventResolution.bidVersion;s=submit(s,{confirmed:true,repeat:true});assert.throws(()=>submit(s,{confirmed:true,chains:['c0231330f35ed']}),/不能同时/);s=finish(s);assert.equal(s.eventBoard.slots[0],'cbb2924757345');assert.ok(!s.eventDiscard.includes('cbb2924757345'));
// Croatia reveal searches the full board pile, preserves all countries and promotes its card.
s=fixture();const countries=regionCountries(s.regions.E).sort();s.eraDeck=['cda82df9a0c65',aid,paris];initializeEvents(s,()=>.2);assert.equal(s.regions.E.countryPiles.left[0],'c8ec654f26579');assert.deepEqual(regionCountries(s.regions.E).sort(),countries);
console.log('WIT passed: 60 faces/eras, 80 setup inventories, right-to-left/personal order, floors, choices, sealed bids, exact agreement, postponement, unique/single chains and repeats, era transition, reveal movement/Croatia, neutral placement, manual fallback, room privacy/retry/undo.');
