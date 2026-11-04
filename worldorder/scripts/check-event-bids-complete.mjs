import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {startEventPhase} from '../dist/event-flow.js';
import {bidModifier} from '../dist/event-bids.js';
import {renderBidForm,renderBidReward,renderBidSummary} from '../dist/event-bids-ui.js';
import {syncInfluence} from '../dist/world.js';
import {regionCountries,acquireSearchedCountry} from '../dist/country-piles.js';
import {newRoom,changeRoom,playerView,roomView} from '../server/rooms.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c])),ids=['US','CN','EU','RU'];
const ukraine='cd780718be7a6',tech='c16291ef10b12',georgia='cad4342891b33',asia='c7787ad7ef400',georgiaCountry='ce3c745de13c1',kazakhstan='cc9a7e443adf4';
function fixture(cardId,edit=()=>{}){
 const s=createState(cards,{wit:true,dd:false},()=>.3);for(const p of Object.values(s.players)){p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.money=100;p.smart=2;p.vp=0;p.resources[3]=0;p.resources[4]=10;p.resources[5]=10;p.resources[6]=6;p.allies=[];p.fdi=[];p.bases=[];p.growth=[];}
 s.round=3;s.current='US';s.flow=newFlow(ids,3);s.flow.step='events';s.phase='事件';s.actionTurns={index:16,completed:{US:4,CN:4,EU:4,RU:4}};
 s.eventBoard={round:3,slots:[null,null,cardId],personal:{US:null,CN:null,EU:null,RU:null},queued:[],seen:[cardId],choice:null,revealQueue:[],distribution:null};
 s.eraDeck=[];s.era2Deck=[];s.events=[cardId];s.eventHistory=[];s.eventDiscard=[];edit(s);startEventPhase(s);return s;
}
const act=(s,type,fields={})=>applyAction(s,{type,cardId:s.flow.eventResolution.cardId,...fields});
const bid=(s,fields={})=>act(s,'submitEvent',fields),reward=(s,fields={})=>act(s,'resolveEventReward',fields);
function bids(s,offers={}){for(const owner of [...s.flow.eventResolution.participants]){assert.equal(s.current,owner);s=bid(s,offers[owner]||{});}return s;}
function roll(value,fn){const old=Math.random;Math.random=()=>value;try{return fn();}finally{Math.random=old;}}
function rejected(s,type,fields,pattern){const before=JSON.stringify(s);assert.throws(()=>act(s,type,fields),pattern);assert.equal(JSON.stringify(s),before);}
function ally(s,owner,id){for(const r of Object.values(s.regions))if(regionCountries(r).includes(id))acquireSearchedCountry(r,id,()=>.3);s.players[owner].allies.push(id);}

// Russia's European forces move free; reserve/other-region moves and both capped bid resources remain payable.
let s=fixture(ukraine,x=>{x.players.RU.money=0;x.regions.E.armies.RU=2;});
rejected(s,'submitEvent',{moneyUnits:4},/限额/);rejected(s,'submitEvent',{diplomacy:4},/限额/);assert.match(renderBidForm(s,s.flow.eventResolution),/外交投标（最多3）/);
s=bid(s);s=bid(s);s=bid(s);rejected(s,'submitEvent',{armies:{E:1,reserve:1}},/资金不足/);
s=roll(0,()=>bid(s,{armies:{E:2}}));assert.equal(s.current,'RU');assert.equal(s.players.RU.money,0);assert.equal(s.regions.E.armies.RU,0);assert.equal(s.flow.eventResolution.eventArmies.RU,2);
s=reward(JSON.parse(JSON.stringify(s)),{slot:'temporary'});assert.equal(s.regions.E.armies.RU,2);assert.equal(s.players.CN.smart,2);assert.equal(s.players.US.smart,0);assert.equal(s.players.EU.smart,0);
// A printed repeat tie gives full SP and returns forces, with no victory loss/reward.
s=fixture(ukraine);s=roll(0,()=>bids(s,{RU:{armies:{reserve:1}}}));assert.equal(s.flow.eventResolution.winner,null);assert.equal(s.flow.eventResolution.repeat,true);assert.equal(s.players.RU.smart,3);assert.equal(s.regions.E.armies.RU,1);
s=act(s,'ackEvent');assert.ok(s.eventBoard.slots.includes(ukraine));assert.ok(!s.eventDiscard.includes(ukraine));
// Western victory downgrades RU even if it did not contribute; no own reward to a zero-bid teammate.
s=fixture(ukraine,x=>{x.players.RU.smart=0;});const ruStart=s.regions.E.permanent.indexOf('RU');s=roll(.99,()=>bids(s,{US:{diplomacy:1}}));
assert.equal(s.players.US.smart,5);assert.equal(s.players.EU.smart,2);assert.equal(s.players.RU.vp,-2);assert.equal(s.regions.E.permanent[ruStart],null);assert.equal(s.regions.E.temporary.at(-1),'RU');
s=fixture(ukraine);s=roll(0,()=>bids(s,{CN:{diplomacy:2}}));assert.equal(s.players.CN.smart,5);assert.equal(s.flow.eventResolution.stage,'result');assert.equal(s.players.RU.vp,0);

// Tech modifiers count every consumer good plus every development; they never generate base/own bonus SP.
s=fixture(tech,x=>{x.players.US.resources[3]=3;x.players.US.growth=['one','two'];x.players.CN.resources[3]=1;});assert.equal(bidModifier(s,tech,'US'),5);
s=bids(s,{US:{moneyUnits:1},CN:{moneyUnits:2}});assert.equal(s.players.US.money,90);assert.equal(s.players.US.smart,5);assert.equal(s.players.US.vp,3);assert.equal(s.players.CN.smart,4);
s=fixture(tech,x=>{x.players.US.resources[3]=5;});s=bids(s);assert.equal(s.players.US.smart,2);assert.equal(s.players.US.vp,0);
// Highest ties get full base SP plus 2 SP/2 VP; lower bidders get only their full base SP.
s=fixture(tech);s=bids(s,{US:{moneyUnits:2},EU:{moneyUnits:2},CN:{moneyUnits:1}});assert.equal(s.flow.eventResolution.winner,null);
for(const id of ['US','EU']){assert.equal(s.players[id].smart,6);assert.equal(s.players[id].vp,2);}assert.equal(s.players.CN.smart,3);assert.equal(s.players.CN.vp,0);
s=fixture(tech,x=>{x.players.US.resources[3]=2;});s=bids(s,{CN:{moneyUnits:2}});assert.equal(s.players.US.smart,2);assert.equal(s.players.US.vp,0);assert.equal(s.players.CN.smart,6);assert.equal(s.players.CN.vp,2);
s=fixture(tech);s=bids(s);assert.equal(s.flow.eventResolution.allZero,true);assert.ok(Object.values(s.players).every(p=>p.vp===0&&p.smart===2));

// Georgia supports services as a sealed bid; tied sides favor RU and seizure follows influence choice.
s=fixture(georgia,x=>{ally(x,'EU',georgiaCountry);x.players.EU.fdi=[georgiaCountry,georgiaCountry];x.players.EU.bases=[georgiaCountry];x.players.EU.exhaustedAllies=[georgiaCountry];x.players.US.foreignInvestments=[{host:'EU',country:georgiaCountry}];});
assert.match(renderBidForm(s,s.flow.eventResolution),/服务投标/);rejected(s,'submitEvent',{services:11},/限额/);rejected(s,'submitEvent',{moneyUnits:3},/限额/);
s=bids(s,{US:{services:1},RU:{services:2}});assert.equal(s.flow.eventResolution.sideTotals[0].modifier,1);assert.equal(s.flow.eventResolution.winner,1);assert.equal(s.players.US.resources[4],9);assert.equal(s.players.RU.resources[4],8);
assert.ok(s.players.EU.allies.includes(georgiaCountry));rejected(s,'resolveEventReward',{slot:'no'},/请选择/);
s=reward(JSON.parse(JSON.stringify(s)),{slot:'permanent'});assert.ok(s.players.RU.allies.includes(georgiaCountry));assert.ok(!s.players.EU.allies.includes(georgiaCountry));assert.deepEqual(s.players.EU.fdi,[]);assert.deepEqual(s.players.EU.bases,[]);assert.deepEqual(s.players.US.foreignInvestments,[]);assert.ok(!(s.players.RU.exhaustedAllies||[]).includes(georgiaCountry));
assert.match(renderBidSummary(s.flow.eventResolution),/2服务/);
s=fixture(georgia);s=bids(s,{RU:{services:1}});s=reward(s,{slot:'temporary'});assert.ok(s.players.RU.allies.includes(georgiaCountry));assert.ok(!regionCountries(s.regions.C).includes(georgiaCountry));
s=fixture(georgia,x=>{ally(x,'RU',georgiaCountry);x.players.RU.fdi=[georgiaCountry];x.players.RU.exhaustedAllies=[georgiaCountry];});s=bids(s,{RU:{services:1}});s=reward(s,{slot:'temporary'});assert.deepEqual(s.players.RU.fdi,[georgiaCountry]);assert.deepEqual(s.players.RU.allies,[georgiaCountry]);assert.ok(!s.players.RU.exhaustedAllies.includes(georgiaCountry));
s=fixture(georgia);s=bids(s,{US:{services:1}});assert.equal(s.players.US.smart,5);assert.equal(s.players.EU.smart,2);

// Central Asia compares THREE sides once. A lower human above the random bid does not also win.
s=fixture(asia,x=>{ally(x,'RU',kazakhstan);x.players.RU.money=30;x.players.RU.fdi=[kazakhstan];x.players.RU.exhaustedAllies=[kazakhstan];});
s=roll(0,()=>bids(s,{RU:{moneyUnits:3},CN:{moneyUnits:3}}));assert.equal(s.flow.eventResolution.opposingBid,2);assert.equal(s.flow.eventResolution.winner,0);assert.equal(s.players.CN.smart,5);assert.equal(s.current,'RU');
assert.match(renderBidReward(playerView(s,'RU'),s.flow.eventResolution,byId),/哈萨克斯坦/);rejected(s,'resolveEventReward',{country:georgiaCountry,slot:'permanent'},/本方/);
s=reward(JSON.parse(JSON.stringify(s)),{country:kazakhstan,slot:'permanent'});assert.equal(s.players.RU.money,0);assert.deepEqual(s.players.RU.fdi,[kazakhstan,kazakhstan]);assert.ok(s.players.RU.exhaustedAllies.includes(kazakhstan));assert.equal(s.players.RU.vp,1);
// The random opponent loses a tie; among tied humans the normal influence/VP/cash order applies.
s=fixture(asia,x=>{ally(x,'RU',kazakhstan);});s=roll(0,()=>bids(s,{RU:{moneyUnits:1}}));assert.equal(s.flow.eventResolution.winner,0);s=reward(s,{skip:true});assert.deepEqual(s.players.RU.fdi,[]);
s=fixture(asia);s=roll(.99,()=>bids(s,{RU:{moneyUnits:2},CN:{moneyUnits:2}}));assert.equal(s.flow.eventResolution.winner,2);assert.equal(s.regions.C.influence.neutral,1);assert.equal(s.players.RU.smart,4);assert.equal(s.players.CN.smart,4);
s=fixture(asia);s=roll(0,()=>bids(s,{RU:{moneyUnits:3},CN:{moneyUnits:3}}));assert.equal(s.flow.eventResolution.winner,0);assert.equal(s.flow.eventResolution.stage,'result'); // RU starts with more Central Asian influence, but owns no eligible ally.

// Real room authority, secrecy, persistence and replay of an optional, repeated free investment.
const who=Object.fromEntries(ids.map(id=>[id,{user:'complete-bids',token:id}]));let room=newRoom('BDC444',who.US,cards,{wit:true});room.state=fixture(asia,x=>{ally(x,'RU',kazakhstan);});room.status='playing';room.seats=structuredClone(who);let serial=0;
function send(owner,type,fields={}){const command={id:String(++serial),op:'action',gameRevision:room.gameRevision,action:{type,cardId:asia,...fields}};room=changeRoom(room,who[owner],command,cards);return command;}
send('CN','submitEvent');assert.deepEqual(playerView(room.state,'RU').flow.eventResolution.submissions,{});roll(0,()=>send('RU','submitEvent',{moneyUnits:3}));assert.equal(roomView(room,who.CN).actor,'RU');assert.equal(roomView(room,who.RU).canUndo,false);
assert.throws(()=>send('CN','resolveEventReward',{skip:true}),/等待/);room=JSON.parse(JSON.stringify(room));const command=send('RU','resolveEventReward',{country:kazakhstan,slot:'temporary',investSP:'after'}),snapshot=JSON.stringify(room);
room=changeRoom(room,who.RU,command,cards);assert.equal(JSON.stringify(room),snapshot);assert.ok(!(room.state.players.RU.exhaustedAllies||[]).includes(kazakhstan));assert.equal(room.state.players.RU.smart,2);
// Searching Georgia reshuffles a hidden country deck; a resolved search cannot be undone to reroll it.
let gRoom=newRoom('BDG444',who.US,cards,{wit:true});gRoom.state=fixture(georgia);gRoom.status='playing';gRoom.seats=structuredClone(who);
for(const owner of [...gRoom.state.flow.eventResolution.participants])gRoom=changeRoom(gRoom,who[owner],{id:'bid-'+owner,op:'action',gameRevision:gRoom.gameRevision,action:{type:'submitEvent',cardId:georgia,services:owner==='RU'?1:0}},cards);
const take={id:'georgia',op:'action',gameRevision:gRoom.gameRevision,action:{type:'resolveEventReward',cardId:georgia,slot:'temporary'}};gRoom=changeRoom(gRoom,who.RU,take,cards);
assert.equal(roomView(gRoom,who.RU).canUndo,false);assert.throws(()=>changeRoom(gRoom,who.RU,{id:'undo-search',op:'undo',gameRevision:gRoom.gameRevision},cards),/随机/);
const taken=JSON.stringify(gRoom);gRoom=changeRoom(gRoom,who.RU,take,cards);assert.equal(JSON.stringify(gRoom),taken);
console.log('Remaining bids passed: Ukraine caps/free Europe movement/repeat and both victories; tech additive modifiers and highest-tie rewards; Georgia service bidding, transfer and cleanup; three-sided Central Asia random tie, repeated free investment, masked room response and replay.');
