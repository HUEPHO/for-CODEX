import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {startEventPhase} from '../dist/event-flow.js';
import {EVENT_DATA} from '../dist/event-data.js';
import {RESEARCH_DATA} from '../dist/research-data.js';
import {SPECIAL_PERSONAL_EVENTS,SPECIAL_COUNTRIES,specialEventPreview} from '../dist/event-special-personal.js';
import {renderSpecialPersonalEvent} from '../dist/event-special-personal-ui.js';
import {regionCountries} from '../dist/country-piles.js';
import {hasEventEffect} from '../dist/event-effect-state.js';
import {playerView} from '../server/rooms.js';
import {currentActor} from '../dist/phase-state.js';
import {actionAccess} from '../dist/action-policy.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),seats=['US','CN','EU','RU'];
const AFGHAN='c0a692aca2850',COVID='c52e84cdecbe6',BREXIT='c6b05cba7d362',KOREA='cb7934569eecb',CROATIA='cda82df9a0c65',CRIMEA='c2356e9f50f6e';
const country=name=>Object.keys(RESEARCH_DATA).find(id=>RESEARCH_DATA[id].countryName===name&&!RESEARCH_DATA[id].starting);
function fixture(cardId,edit=()=>{}){
 const s=createState(cards,{wit:true,dd:true},()=>.3);
 for(const p of Object.values(s.players)){
  p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.hand=['cf9aa23c4a315'];p.deck=['c89c153d80dbd'];p.allies=[];p.fdi=[];p.bases=[];p.exhaustedAllies=[];p.growth=[];
  p.money=60;p.vp=10;p.smart=0;p.resources=[5,5,5,5,5,10,3];p.production=Array(7).fill(1);p.prosperity=0;p.objectiveHistory={productionGains:Array(7).fill(0),prosperityGains:0};
 }
 for(const r of Object.values(s.regions))for(const id of seats)r.armies[id]=0;
 s.round=4;s.phase='事件';s.initialOrder=seats;s.flow=newFlow(seats,4);s.flow.step='events';s.actionTurns={index:16,completed:{US:4,CN:4,EU:4,RU:4}};
 s.eraDeck=[];s.era2Deck=[];s.eventHistory=[];s.eventDiscard=[];
 const data=EVENT_DATA[cardId],owner=data.players.length===1?data.players[0]:null;
 s.eventBoard={round:4,slots:owner?[null,null,null]:[null,null,cardId],personal:Object.fromEntries(seats.map(id=>[id,id===owner?cardId:null])),seen:[cardId],queued:[],choice:null,revealQueue:[],distribution:null};
 s.events=owner?[]:[cardId];edit(s);startEventPhase(s);return s;
}
const act=(s,type,fields={})=>applyAction(s,{type,cardId:s.flow.eventResolution?.cardId,...fields});
const submit=(s,fields={})=>act(s,'submitEvent',fields);
function rejects(s,fields,pattern){const before=JSON.stringify(s);assert.throws(()=>submit(s,fields),pattern);assert.equal(JSON.stringify(s),before,'Invalid special event mutated source');}
for(const id of Object.keys(SPECIAL_PERSONAL_EVENTS)){
 const s=fixture(id);assert.equal(s.flow.eventResolution.mode,'special');assert.match(renderSpecialPersonalEvent(s,s.flow.eventResolution),/personal-event-form/);
 assert.equal(actionAccess(playerView(s,s.current),{type:'resource',key:'money',delta:1},s.current).allowed,false);
}

// COVID processes each player separately, charges only the selected payment,
// uses the old prosperity space's printed VP, and clamps prosperity at zero.
let s=fixture(COVID,s=>{s.players.US.prosperity=2;s.players.CN.prosperity=3;s.players.RU.prosperity=5;}),next;
rejects(s,{payment:'invalid'},/选择/);const before=JSON.stringify(s);assert.match(specialEventPreview(s,s.flow.eventResolution,{payment:'money'}),/20资金/);assert.equal(JSON.stringify(s),before);
next=submit(s,{payment:'money'});assert.equal(next.players.US.money,40);assert.equal(next.players.US.prosperity,1);assert.equal(next.players.US.vp,10);assert.equal(currentActor(next),'CN');
next=submit(JSON.parse(JSON.stringify(next)),{payment:'none'});assert.equal(next.players.CN.vp,5);assert.equal(next.players.CN.prosperity,2);
next=submit(next,{payment:'service'});assert.equal(next.players.EU.resources[4],4);assert.equal(next.players.EU.prosperity,0);assert.equal(next.players.EU.vp,10);
next=submit(next,{payment:'none'});assert.equal(next.players.RU.vp,0);assert.equal(next.players.RU.prosperity,4);assert.equal(next.flow.eventResolution.stage,'result');assert.equal(next.flow.eventResolution.receipts.length,4);
rejects(next,{payment:'none'},/已结算/);
s=fixture(COVID,s=>{s.players.US.money=19;s.players.US.resources[4]=0;});rejects(s,{payment:'money'},/不足/);rejects(s,{payment:'service'},/不足/);next=submit(s,{payment:'none'});assert.equal(next.players.US.vp,10);

// Afghanistan: 30 + 0 is a valid common payment. Otherwise no promised money
// is spent, both participants lose SP, and all Central-Asian troops must leave.
s=fixture(AFGHAN,s=>{s.regions.C.armies.US=3;s.regions.C.armies.EU=2;});next=submit(s,{amount:30});assert.equal(next.players.US.money,60);assert.equal(next.current,'EU');
next=submit(next,{amount:0});assert.equal(next.players.US.money,30);assert.equal(next.players.EU.money,60);assert.equal(next.players.US.smart,1);assert.equal(next.players.EU.smart,1);assert.equal(next.regions.C.armies.US,3);assert.equal(next.flow.eventResolution.stage,'result');
next=submit(s,{amount:5});next=submit(next,{amount:0});assert.equal(next.players.US.money,60);assert.equal(next.players.US.vp,9);assert.equal(next.players.EU.vp,9);assert.equal(next.flow.eventResolution.specialPhase,'withdraw');assert.equal(next.current,'US');
rejects(next,{withdrawals:{E:2}},/全部/);rejects(next,{withdrawals:{C:3}},/关注范围/);
next=submit(next,{withdrawals:{M:1,E:2}});assert.equal(next.current,'EU');assert.equal(next.regions.M.armies.US,1);assert.equal(next.regions.E.armies.US,2);
next=submit(JSON.parse(JSON.stringify(next)),{withdrawals:{E:2}});assert.equal(next.regions.C.armies.US,0);assert.equal(next.regions.C.armies.EU,0);assert.equal(next.regions.E.armies.EU,2);assert.equal(next.regions.C.influence.neutral,s.regions.C.influence.neutral+1);assert.equal(next.flow.eventResolution.stage,'result');
s=fixture(AFGHAN,s=>{s.players.US.smart=2;});next=submit(s,{});assert.equal(next.players.US.smart,0);assert.equal(next.players.US.vp,9);assert.equal(next.players.EU.vp,7);assert.equal(next.regions.C.influence.neutral,s.regions.C.influence.neutral+1);assert.equal(next.flow.eventResolution.stage,'result');

// Brexit retains paid normal relations, optional ally exhaustion and SP costs.
s=fixture(BREXIT);next=submit(s,{accept:true});assert.equal(next.players.EU.resources[5],4);assert.equal(next.players.EU.smart,3);assert.equal(next.players.EU.vp,12);assert.equal(regionCountries(next.regions.E).includes(SPECIAL_COUNTRIES.UK),false);
next=submit(s,{accept:false,relate:false});assert.equal(next.regions.E.influence.EU,s.regions.E.influence.EU-1);assert.equal(next.regions.E.influence.neutral,s.regions.E.influence.neutral+1);assert.equal(next.regions.E.countryPiles.left[0],SPECIAL_COUNTRIES.UK);
next=submit(s,{accept:false,relate:true});assert.ok(next.players.EU.allies.includes(SPECIAL_COUNTRIES.UK));assert.equal(next.players.EU.resources[5],7);assert.equal(regionCountries(next.regions.E).includes(SPECIAL_COUNTRIES.UK),false);
s=fixture(BREXIT,s=>{s.players.EU.resources[5]=0;s.players.EU.smart=3;});next=submit(s,{accept:false,relate:true,relationSP:3});assert.equal(next.players.EU.smart,0);assert.ok(next.players.EU.allies.includes(SPECIAL_COUNTRIES.UK));
s.players.EU.smart=2;rejects(s,{accept:false,relate:true,relationSP:3},/不足/);rejects(s,{accept:true},/不足/);

// The 2024 North Korea is an extra country; ordinary North Korea and the
// original owner's investment and base remain untouched.
const ordinaryKorea=country('North Korea');s=fixture(KOREA,s=>{s.players.CN.allies=[ordinaryKorea];s.players.CN.fdi=[ordinaryKorea];s.players.CN.bases=[ordinaryKorea];});
next=submit(s,{accept:true});assert.equal(next.players.RU.money,50);assert.equal(next.players.RU.resources[0],3);assert.equal(next.players.RU.resources[5],8);assert.equal(next.players.RU.smart,2);assert.equal(next.regions.E.armies.RU,1);assert.equal(next.players.RU.resources[6],3);
assert.ok(next.players.RU.allies.includes(SPECIAL_COUNTRIES.KOREA));assert.deepEqual(next.players.CN.allies,[ordinaryKorea]);assert.deepEqual(next.players.CN.fdi,[ordinaryKorea]);assert.deepEqual(next.players.CN.bases,[ordinaryKorea]);
next=submit(s,{accept:false});assert.equal(next.players.RU.money,60);assert.deepEqual(next.players.RU.allies,[]);s.players.RU.resources[0]=1;rejects(s,{accept:true},/不足/);

// Croatia removes its own state and foreign investments, not European armies.
const croatia=country('Croatia');s=fixture(CROATIA,s=>{s.players.EU.allies=[croatia];s.players.EU.fdi=[croatia];s.players.EU.bases=[croatia];s.players.EU.exhaustedAllies=[croatia];s.players.EU.prosperity=1;s.players.EU.objectiveHistory.prosperityGains=1;s.players.US.foreignInvestments=[{host:'EU',country:croatia}];s.regions.E.armies.EU=2;});
next=submit(s,{slot:'temporary'});assert.equal(next.players.EU.smart,2);assert.equal(next.regions.E.influence.EU,s.regions.E.influence.EU+1);assert.deepEqual(next.players.EU.allies,[]);assert.deepEqual(next.players.EU.bases,[]);assert.deepEqual(next.players.EU.fdi,[]);assert.deepEqual(next.players.US.foreignInvestments,[]);assert.equal(next.regions.E.armies.EU,2);
s=fixture(CROATIA);next=submit(s,{});assert.equal(next.players.EU.smart,0);assert.equal(next.regions.E.influence.EU,s.regions.E.influence.EU);
s=fixture(CROATIA,s=>{s.players.EU.allies=[croatia];delete s.players.EU.objectiveHistory;});rejects(s,{slot:'temporary'},/旧存档/);
next=submit(s,{slot:'temporary',prosperityImproved:true});assert.equal(next.players.EU.smart,2);assert.match(next.flow.eventResolution.submissions.EU,/曾提升/);
next=submit(s,{prosperityImproved:false});assert.equal(next.players.EU.smart,0);assert.deepEqual(next.players.EU.allies,[croatia]);
s=fixture(CROATIA,s=>{s.players.EU.allies=[croatia];s.players.EU.objectiveHistory.progressHistoryComplete=true;});next=submit(s,{});assert.equal(next.players.EU.smart,0);

// Crimea's refusal remains resolvable without two affordable armies. It still
// downgrades influence, activates sanctions, queues Minsk and returns RU's Ukraine.
s=fixture(CRIMEA,s=>{s.regions.E.temporary=['RU'];});next=submit(s,{accept:true,convert:true,index:0});assert.equal(next.players.RU.resources[5],5);assert.equal(next.players.RU.smart,2);assert.equal(next.regions.E.temporary.includes('RU'),false);
const ukraine=country('Ukraine');s=fixture(CRIMEA,s=>{s.players.RU.allies=[ukraine];s.players.RU.fdi=[ukraine];s.players.RU.money=4;s.players.RU.resources[6]=0;});
next=submit(s,{accept:false,moves:{}});assert.equal(next.players.RU.money,4);assert.equal(next.regions.E.armies.RU,0);assert.equal(hasEventEffect(next,'global','cc83057306d10'),true);assert.deepEqual(next.eventBoard.queued,['c963b6d849299']);assert.deepEqual(next.players.RU.allies,[]);assert.deepEqual(next.players.RU.fdi,[]);assert.equal(next.regions.E.countryPiles.left[0],SPECIAL_COUNTRIES.UKRAINE);
s=fixture(CRIMEA,s=>{s.players.RU.money=7;s.players.RU.resources[6]=3;});rejects(s,{accept:false,moves:{}},/移动1/);next=submit(s,{accept:false,moves:{reserve:1}});assert.equal(next.players.RU.money,2);assert.equal(next.players.RU.resources[6],2);assert.equal(next.regions.E.armies.RU,1);
const restored=act(JSON.parse(JSON.stringify(next)),'ackEvent');assert.equal(restored.eventHistory[0].receipts.length,1);
console.log('Special events: six engine paths, shared handoffs, normal costs, revised countries, declines, caps, rollback and persisted completion passed.');
