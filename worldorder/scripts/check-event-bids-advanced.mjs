import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {startEventPhase} from '../dist/event-flow.js';
import {EVENT_DATA} from '../dist/event-data.js';
import {AREAS,syncInfluence} from '../dist/world.js';
import {bidModifier} from '../dist/event-bids.js';
import {renderBidForm,renderBidReward,renderBidSummary} from '../dist/event-bids-ui.js';
import {newRoom,changeRoom,playerView,roomView} from '../server/rooms.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),ids=['US','CN','EU','RU'];
const myanmar='c8b5edd6c7beb',americas='caa9567066a40',karabakh='cb888393c6ff9',yemen='c4b796f4206ea',libya='cb29f5917c351',isis='c784b257890d8',aukus='cb2c1803ce749';
function fixture(cardId,edit=()=>{}){
 const s=createState(cards,{wit:true,dd:false},()=>.3);for(const p of Object.values(s.players)){p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.money=100;p.resources[5]=10;p.resources[6]=6;p.allies=[];p.fdi=[];p.bases=[];}
 s.round=3;s.current='US';s.flow=newFlow(ids,3);s.flow.step='events';s.phase='事件';s.actionTurns={index:16,completed:{US:4,CN:4,EU:4,RU:4}};
 s.eventBoard={round:3,slots:[null,null,null],personal:{US:null,CN:null,EU:null,RU:null},queued:[],seen:[cardId],choice:null,revealQueue:[],distribution:null};
 const owners=EVENT_DATA[cardId].players;if(owners.length===1)s.eventBoard.personal[owners[0]]=cardId;else s.eventBoard.slots[2]=cardId;
 s.eraDeck=[];s.era2Deck=[];s.events=s.eventBoard.slots.filter(Boolean);s.eventHistory=[];s.eventDiscard=[];edit(s);startEventPhase(s);return s;
}
const act=(s,type,fields={})=>applyAction(s,{type,cardId:s.flow.eventResolution.cardId,...fields});
const bid=(s,a={})=>act(s,'submitEvent',a),reward=(s,a={})=>act(s,'resolveEventReward',a);
function bids(s,offers={}){for(const owner of [...s.flow.eventResolution.participants]){assert.equal(s.current,owner);s=bid(s,offers[owner]||{});}return s;}
function roll(value,fn){const original=Math.random;Math.random=()=>value;try{return fn();}finally{Math.random=original;}}
function rejected(s,type,fields,pattern){const before=JSON.stringify(s);assert.throws(()=>act(s,type,fields),pattern);assert.equal(JSON.stringify(s),before);}
// Selling as a bid is restricted to the printed player and reserve stock; even a losing sale pays its income.
let s=fixture(myanmar);rejected(s,'submitEvent',{soldArmies:1},/限额/);s=bid(s);s=bid(s);s=bid(s);rejected(s,'submitEvent',{soldArmies:3},/限额/);rejected(s,'submitEvent',{armies:{reserve:1}},/限额/);
s=fixture(myanmar,s=>{s.players.RU.money=0;s.regions.S.temporary=['RU'];syncInfluence(s.regions.S);});s=bids(s,{US:{diplomacy:1},RU:{soldArmies:2},CN:{diplomacy:1}});
assert.equal(s.players.RU.money,30);assert.equal(s.players.RU.resources[6],4);assert.equal(s.players.RU.smart,3);assert.equal(s.current,'RU');assert.equal(s.flow.eventResolution.eventArmies.RU,0);
s=reward(s,{index:0});assert.equal(s.current,'CN');assert.equal(s.players.RU.vp,0);assert.match(renderBidReward(playerView(s,'CN'),s.flow.eventResolution),/支付10资金/);
s=reward(JSON.parse(JSON.stringify(s)),{slot:'permanent'});assert.equal(s.players.CN.money,90);assert.equal(s.players.CN.vp,1);assert.equal(s.regions.S.armies.RU,0);
s=fixture(myanmar,s=>{s.players.CN.money=9;});s=bids(s,{RU:{soldArmies:2},CN:{diplomacy:1}});assert.equal(s.current,'CN');rejected(s,'resolveEventReward',{slot:'temporary'},/资金或外交不足/);s=reward(s,{skip:true});assert.equal(s.players.CN.money,9);
s=fixture(myanmar);s=bids(s,{US:{diplomacy:3},RU:{soldArmies:1}});assert.equal(s.players.RU.money,115);assert.equal(s.players.RU.smart,3);assert.equal(s.players.US.smart,6);assert.equal(s.players.EU.smart,2);
// Multi-winner placement is ordered; US downgrade happens only AFTER both awards, including after reload.
s=fixture(americas,s=>{s.regions.M.temporary=['US','EU','US','CN'];syncInfluence(s.regions.M);});rejected(s,'submitEvent',{moneyUnits:4},/限额/);
s=bids(s,{US:{diplomacy:1},RU:{diplomacy:3},CN:{diplomacy:2}});assert.equal(s.current,'CN');const usStart=s.regions.M.permanent.indexOf('US');assert.ok(usStart>=0);
s=reward(s,{slot:'temporary'});assert.equal(s.current,'RU');assert.equal(s.regions.M.permanent[usStart],'US');s=reward(JSON.parse(JSON.stringify(s)),{slot:'temporary'});
assert.deepEqual(s.regions.M.temporary,['US','CN','CN','RU']);assert.equal(s.regions.M.permanent[usStart],null);assert.ok(s.regions.M.ignoredStartingSlots.includes(usStart));
s=fixture(americas,s=>{s.regions.M.temporary=['US'];syncInfluence(s.regions.M);});s=bids(s,{US:{diplomacy:2}});assert.equal(s.players.US.smart,5);s=reward(s,{skip:true});assert.deepEqual(s.regions.M.temporary,['US']);
const americanCountry=cards.find(c=>c.type==='country'&&c.region==='M').id;
s=fixture(americas,s=>{s.players.US.allies=[americanCountry];s.players.US.fdi=[americanCountry,americanCountry];s.players.US.bases=[americanCountry];});assert.equal(bidModifier(s,americas,'US'),4);s=bids(s);assert.equal(s.flow.eventResolution.stage,'result');assert.equal(s.players.US.smart,2);
// Opposing bids draw once only at reveal, can span every printed value, and player-favored ties use winner SP.
for(let n=1;n<=5;n++){s=fixture(yemen);s=roll((n-.5)/5,()=>bids(s,{US:{soldArmies:2},EU:{soldArmies:2}}));assert.equal(s.flow.eventResolution.opposingBid,n);assert.equal(s.players.US.money,130);assert.equal(s.players.US.resources[6],4);assert.equal(s.regions.N.armies.US,0);assert.equal(s.players.US.smart,4);assert.equal(s.flow.eventResolution.winner,n<=4?0:1);assert.equal(s.eventBoard.queued.includes('c0231330f35ed'),n===5);}
s=fixture(yemen);s=bid(s,{soldArmies:1});assert.equal(s.flow.eventResolution.opposingBid,undefined);assert.equal(s.players.US.money,100);assert.equal(s.players.US.resources[6],6);assert.deepEqual(playerView(s,'EU').flow.eventResolution.submissions,{});
s=roll(0,()=>bid(s));assert.equal(s.flow.eventResolution.opposingBid,1);assert.equal(s.players.US.smart,3);assert.equal(s.players.EU.smart,2);assert.match(renderBidSummary(s.flow.eventResolution),/对手出价合计 1/);
s=fixture(yemen);assert.match(renderBidForm(s,s.flow.eventResolution),/出售待命军队投标/);s=roll(0,()=>bids(s));assert.ok(s.eventBoard.queued.includes('c0231330f35ed'));
// Karabakh: a non-participant owns the optional response, and forces wait on the event until it is resolved.
s=fixture(karabakh);const ruStart=s.regions.C.permanent.indexOf('RU');s=roll(.99,()=>bid(s,{armies:{reserve:1}}));assert.equal(s.current,'US');assert.equal(s.regions.C.permanent[ruStart],'neutral');assert.equal(s.regions.C.armies.RU,0);assert.equal(s.players.RU.money,95);
rejected(s,'resolveEventReward',{slot:'not-a-slot'},/请选择/);s=reward(JSON.parse(JSON.stringify(s)),{slot:'temporary'});assert.equal(s.players.US.money,90);assert.equal(s.players.US.resources[5],8);assert.equal(s.regions.C.armies.RU,1);assert.equal(s.flow.eventResolution.stage,'result');
s=fixture(karabakh,s=>{s.players.US.money=9;});s=roll(.99,()=>bid(s));rejected(s,'resolveEventReward',{slot:'permanent'},/不足/);s=reward(s,{skip:true});assert.equal(s.players.US.money,9);
s=fixture(karabakh);s=roll(.3,()=>bid(s,{armies:{reserve:2}}));assert.equal(s.flow.eventResolution.opposingBid,2);assert.equal(s.flow.eventResolution.repeat,true);assert.equal(s.players.RU.smart,4);assert.equal(s.regions.C.armies.RU,2);s=act(s,'ackEvent');assert.equal(s.eventBoard.personal.RU,karabakh);
s=fixture(karabakh);s=roll(0,()=>bid(s,{diplomacy:2}));assert.equal(s.current,'RU');s=reward(s,{slot:'permanent'});assert.equal(s.players.RU.vp,1);
// Libya loss at SP zero still applies the VP shortfall and neutral placement; ties retain the event.
s=fixture(libya,s=>{s.players.RU.smart=0;s.regions.N.permanent=s.regions.N.permanent.map(x=>x||'CN');s.regions.N.temporary=Array(AREAS.N.temp.length).fill('US');syncInfluence(s.regions.N);});s=roll(.99,()=>bid(s));assert.equal(s.players.RU.vp,-1);assert.equal(s.regions.N.temporary.at(-1),'neutral');
s=fixture(libya);s=roll(.4,()=>bid(s,{armies:{reserve:2}}));assert.equal(s.flow.eventResolution.opposingBid,2);assert.equal(s.flow.eventResolution.repeat,true);assert.equal(s.players.RU.smart,4);assert.equal(s.regions.N.armies.RU,2);
s=fixture(libya);s=roll(0,()=>bid(s,{armies:{reserve:2}}));s=reward(s,{slot:'permanent'});assert.equal(s.players.RU.vp,1);
// Islamic State branches use all forces on the event, not just the winner's bid; all-zero skips effects.
for(const n of [0,1,3,5]){s=fixture(isis,x=>{x.players.CN.smart=0;});const beforeNeutral=s.regions.N.influence.neutral;s=bids(s,{US:{armies:{reserve:n}}});assert.equal(s.regions.N.armies.US,n);assert.equal(s.flow.eventResolution.stage,'result');assert.equal(s.players.US.smart,n===0?2:2+Math.floor(n/2)+(n===1?1:2));assert.equal(s.players.CN.vp,n===1?-2:0);assert.equal(s.regions.N.influence.neutral,beforeNeutral+(n===1?2:0));assert.equal(s.eventBoard.queued.includes('c0231330f35ed'),n===3);}
s=fixture(isis,s=>{s.players.US.resources[5]=9;});s=bids(s,{US:{armies:{reserve:3}},EU:{armies:{reserve:2}}});assert.equal(s.players.US.resources[5],10);assert.equal(s.players.US.smart,5);assert.equal(s.eventBoard.queued.length,0);
// AUKUS: neutral placement precedes the US award; optional sale and free CN response use their own seats.
s=fixture(aukus,s=>{s.players.US.allies=['caa7ff0f8b8f4'];s.players.CN.money=0;s.regions.N.armies.CN=1;});assert.equal(s.flow.eventResolution.modifiers.US,2);s=bids(s,{US:{diplomacy:1},EU:{diplomacy:2}});assert.equal(s.regions.P.permanent[2],'neutral');assert.equal(s.current,'US');
s=reward(s,{slot:'permanent',sellArmy:true});assert.equal(s.regions.P.permanent[3],'US');assert.equal(s.players.US.money,110);assert.equal(s.players.US.resources[6],5);assert.equal(s.current,'CN');assert.ok(!s.flow.eventResolution.participants.includes('CN'));assert.match(renderBidReward(playerView(s,'CN'),s.flow.eventResolution),/免费向亚太/);
rejected(s,'resolveEventReward',{moves:{reserve:3}},/超过/);rejected(s,'resolveEventReward',{moves:{P:1}},/其他地区/);s=reward(JSON.parse(JSON.stringify(s)),{moves:{reserve:1,N:1}});assert.equal(s.players.CN.money,0);assert.equal(s.regions.P.armies.CN,2);assert.equal(s.regions.N.armies.CN,0);
s=fixture(aukus,s=>{s.players.EU.resources[6]=0;});s=bids(s,{EU:{diplomacy:1}});rejected(s,'resolveEventReward',{slot:'permanent',sellArmy:true},/待命军队/);s=reward(s,{slot:'permanent'});assert.equal(s.flow.eventResolution.stage,'result');assert.equal(s.regions.P.influence.neutral,0);
// Server authority, duplicate commands, persisted opponent draw and undo protection after a solo reveal.
const who=Object.fromEntries(ids.map(id=>[id,{user:'advanced-bids',token:id}]));let room=newRoom('BDA444',who.RU,cards,{wit:true});room.state=fixture(karabakh);room.status='playing';room.seats=structuredClone(who);
const command={id:'reveal',op:'action',gameRevision:room.gameRevision,action:{type:'submitEvent',cardId:karabakh,armies:{reserve:1}}};room=roll(.99,()=>changeRoom(room,who.RU,command,cards));const saved=JSON.stringify(room);room=roll(0,()=>changeRoom(room,who.RU,command,cards));assert.equal(JSON.stringify(room),saved);assert.equal(roomView(room,who.RU).canUndo,false);assert.equal(roomView(room,who.US).actor,'US');
assert.throws(()=>changeRoom(room,who.RU,{id:'bad',op:'action',gameRevision:room.gameRevision,action:{type:'resolveEventReward',cardId:karabakh,skip:true}},cards),/等待/);
room=changeRoom(room,who.US,{id:'answer',op:'action',gameRevision:room.gameRevision,action:{type:'resolveEventReward',cardId:karabakh,skip:true}},cards);assert.equal(room.state.flow.eventResolution.opposingBid,4);assert.equal(room.state.regions.C.armies.RU,1);
console.log('Advanced bids passed: army sales, sealed random opponents and tie rules, seven complete faces, ordered multiple rewards, neutral placement, non-participant responses, save/restore, replay protection and seat authority.');
