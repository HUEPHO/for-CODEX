import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {startEventPhase} from '../dist/event-flow.js';
import {BID_EVENTS,bidOffer,bidModifier} from '../dist/event-bids.js';
import {removeEventInfluence,downgradeEventInfluence} from '../dist/event-influence.js';
import {AREAS,changeInfluence,emptyPermanentSlot,scoringPreview,syncInfluence} from '../dist/world.js';
import {renderWorldRegion} from '../dist/world-ui.js';
import {renderRoomFlow} from '../dist/room-ui.js';
import {newRoom,changeRoom,playerView,roomView} from '../server/rooms.js';
import {currentActor} from '../dist/phase-state.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c])),ids=['US','CN','EU','RU'];
const africa='c9db977892b0d',mrca='c99fa916aec22',belarus='c25240469d096',sahel='cbdab09ed1a45',sea='c6e3c117f6ac4',syria='cbb2924757345';
function fixture(cardId,edit=()=>{}){
 const s=createState(cards,{wit:true,dd:false},()=>.3);for(const p of Object.values(s.players)){p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.money=100;p.resources[5]=10;p.resources[6]=6;p.allies=[];p.fdi=[];p.bases=[];}
 s.round=3;s.current='US';s.flow=newFlow(ids,3);s.flow.step='events';s.phase='事件';s.actionTurns={index:16,completed:{US:4,CN:4,EU:4,RU:4}};
 s.eventBoard={round:3,slots:[null,null,cardId],personal:{US:null,CN:null,EU:null,RU:null},queued:[],seen:[cardId],choice:null,revealQueue:[],distribution:null};s.eraDeck=[];s.era2Deck=[];s.events=[cardId];s.eventHistory=[];s.eventDiscard=[];edit(s);startEventPhase(s);return s;
}
const act=(s,type,fields={})=>applyAction(s,{type,cardId:s.flow.eventResolution.cardId,...fields});
const bid=(s,fields={})=>act(s,'submitEvent',fields),reward=(s,fields={})=>act(s,'resolveEventReward',fields);
function bids(s,offers){for(const owner of [...s.flow.eventResolution.participants]){assert.equal(s.current,owner);s=bid(s,offers[owner]||{});}return s;}
function rejected(s,action,pattern){const before=JSON.stringify(s);assert.throws(()=>act(s,action.type||'submitEvent',action),pattern);assert.equal(JSON.stringify(s),before);}
// Removal priority, neutral replacement, retired setup slots and normal action placement/scoring.
let s=fixture(belarus),r=s.regions.E;r.temporary=['CN','RU','US','RU'];r.permanent[3]='RU';syncInfluence(r);
removeEventInfluence(s,'RU','E');assert.deepEqual(r.temporary,['CN','US','RU']);removeEventInfluence(s,'RU','E');assert.deepEqual(r.temporary,['CN','US']);removeEventInfluence(s,'RU','E');assert.equal(r.permanent[2],null);assert.deepEqual(r.ignoredStartingSlots,[2]);assert.equal(emptyPermanentSlot(r),4);
s.current='US';changeInfluence(s,{region:'E',operation:'placePermanent'});assert.equal(r.permanent[2],null);assert.equal(r.permanent[4],'US');r.permanent[5]=r.permanent[6]='EU';syncInfluence(r);assert.equal(scoringPreview(s).regions.find(x=>x.region==='E').eligible,true);assert.match(renderWorldRegion(s,'E'),/停用起始槽/);
removeEventInfluence(s,'RU','E',true);assert.equal(r.permanent[3],'neutral');assert.deepEqual(r.ignoredStartingSlots,[2]);
// Downgrade removes the preferred starting cube; a full temporary queue is preserved unchanged.
s=fixture(sea);r=s.regions.P;r.temporary=['US','RU','EU','US'];const temp=[...r.temporary];downgradeEventInfluence(s,'CN','P');assert.deepEqual(r.temporary,temp);assert.equal(r.permanent[0],null);assert.deepEqual(r.ignoredStartingSlots,[0]);
s=fixture(sea);r=s.regions.P;const vp=s.players.CN.vp;downgradeEventInfluence(s,'CN','P');assert.deepEqual(r.temporary,['CN']);assert.equal(s.players.CN.vp,vp);
s=fixture(sea);delete s.eventVersion;s.current='CN';changeInfluence(s,{region:'P',operation:'remove',kind:'permanent',index:0});assert.equal(emptyPermanentSlot(s.regions.P),0);assert.equal(s.regions.P.ignoredStartingSlots,undefined);
// Costs are combined, capped per printed face and atomically rejected before revealing or paying.
s=fixture(belarus);rejected(s,{moneyUnits:3},/限额/);rejected(s,{armies:{reserve:1}},/限额/);rejected(s,{diplomacy:-1},/限额/);rejected(s,{armies:{bogus:1}},/无效/);
s=fixture(africa,s=>{s.players.US.money=14;});rejected(s,{moneyUnits:1,armies:{reserve:1}},/资金不足/);rejected(s,{armies:{reserve:7}},/限额/);
s=fixture(mrca,s=>{s.players.US.resources[6]=0;});rejected(s,{diplomacy:1},/待命军队/);s=bid(s);assert.equal(s.current,'EU');
// One mixed bid: no payment until the final reveal. Army stays on the event through the reward choice.
s=fixture(africa);const initial=structuredClone(s.players.US);s=bid(s,{moneyUnits:1,diplomacy:1,armies:{reserve:1}});assert.deepEqual(s.players.US,initial);assert.deepEqual(playerView(s,'CN').flow.eventResolution.submissions,{});assert.equal(playerView(s,'US').flow.eventResolution.submissions.US.total,3);assert.match(renderRoomFlow(playerView(s,'CN'),byId),/资金投标单位/);
s=bid(JSON.parse(JSON.stringify(s)));s=bid(s);s=bid(s);assert.equal(s.flow.eventResolution.stage,'reward');assert.equal(s.current,'US');assert.equal(s.players.US.money,85);assert.equal(s.players.US.resources[5],9);assert.equal(s.players.US.resources[6],5);assert.equal(s.regions.A.armies.US,0);assert.equal(s.flow.eventResolution.eventArmies.US,1);assert.equal(playerView(s,'CN').flow.eventResolution.submissions.US.total,3);assert.equal(s.players.US.smart,3);
rejected(s,{type:'submitEvent',diplomacy:9},/获奖选择/);rejected(s,{type:'resolveEventReward',slot:'temporary',energy:4},/限额/);
s=reward(JSON.parse(JSON.stringify(s)),{slot:'permanent',energy:3,raw:2});assert.equal(s.players.US.money,75);assert.equal(s.players.US.resources[0],6);assert.equal(s.players.US.resources[1],4);assert.equal(s.players.US.vp,1);assert.equal(s.regions.A.armies.US,1);assert.deepEqual(s.flow.eventResolution.eventArmies,{});assert.equal(s.flow.eventResolution.stage,'result');rejected(s,{type:'resolveEventReward',slot:'temporary'},/选择/);
// Purchase overflow cannot fund that same purchase. Normal resource overflow is still applied afterward.
s=fixture(africa,s=>{s.players.US.money=4;s.players.US.resources[0]=10;s.players.US.resources[1]=10;});s=bids(s,{US:{diplomacy:1}});rejected(s,{type:'resolveEventReward',slot:'permanent',energy:3},/资金不足/);s=reward(s,{slot:'permanent',energy:2});assert.equal(s.players.US.money,6);
// Zero actual bid with a modifier may win, but gets no own rewards. All-zero without modifiers has no effects.
s=fixture(africa,s=>{s.players.EU.allies=cards.filter(c=>c.type==='startingCountry'&&c.owner==='EU'&&c.region==='A').map(c=>c.id);});assert.ok(s.flow.eventResolution.modifiers.EU>0);s=bids(s,{});assert.equal(s.flow.eventResolution.stage,'result');assert.equal(s.players.EU.vp,0);
s=fixture(africa);s=bids(s,{});assert.equal(s.flow.eventResolution.allZero,true);assert.equal(s.flow.eventResolution.stage,'result');assert.ok(Object.values(s.players).every(p=>p.smart===2));
// MRCA requires a reserve unit to bid, only the winner sells one, and placement follows the sale.
s=fixture(mrca);s=bids(s,{US:{diplomacy:2},EU:{diplomacy:1}});assert.equal(s.players.US.money,110);assert.equal(s.players.US.resources[6],5);assert.equal(s.players.EU.resources[6],6);assert.equal(s.players.EU.smart,3);s=reward(s,{slot:'temporary'});assert.equal(s.regions.S.temporary.at(-1),'US');assert.equal(s.players.US.vp,4);
// Explicit no-effect tie: all costs paid, full own bid as SP, no influence change.
s=fixture(belarus);const board=structuredClone(s.regions.E);s=bids(s,{US:{diplomacy:1},EU:{diplomacy:1}});assert.equal(s.flow.eventResolution.winner,null);assert.equal(s.players.US.smart,3);assert.equal(s.players.EU.smart,3);assert.equal(s.players.RU.smart,2);assert.deepEqual(s.regions.E,board);
// Teammate zero contribution earns no own reward; opponent's influence is still removed.
s=fixture(belarus);s=bids(s,{US:{diplomacy:3}});assert.equal(s.players.US.smart,4);assert.equal(s.players.EU.smart,2);assert.equal(s.regions.E.permanent[2],null);assert.deepEqual(s.regions.E.ignoredStartingSlots,[2]);
// Sahel optional conversion at a full permanent track does not score or evict, replacement stays in place.
s=fixture(sahel,s=>{s.regions.A.permanent=['US','CN'];s.regions.A.temporary=['EU','RU'];syncInfluence(s.regions.A);});s=bids(s,{RU:{diplomacy:1}});assert.equal(s.current,'RU');assert.equal(s.regions.A.temporary[0],'neutral');assert.equal(s.players.RU.smart,3);s=reward(s,{index:1});assert.deepEqual(s.regions.A.extraPermanent,['RU']);assert.equal(s.players.RU.vp,0);
s=fixture(sahel,s=>{s.regions.A.temporary=['RU','EU'];syncInfluence(s.regions.A);});s=bids(s,{RU:{diplomacy:1}});s=reward(s,{skip:true});assert.deepEqual(s.regions.A.temporary,['RU','neutral']);
s=fixture(sahel,s=>{s.players.RU.smart=0;});s=bids(s,{EU:{diplomacy:2}});assert.equal(s.players.RU.vp,-1);assert.equal(s.players.RU.smart,0);assert.equal(s.players.EU.smart,6);
// Chinese South China Sea fleet is free only from Asia Pacific. Other origins still require money.
s=fixture(sea,s=>{s.regions.P.armies.CN=2;s.players.CN.money=0;});s=bid(s);rejected(s,{armies:{reserve:1}},/资金不足/);s=bid(s,{armies:{P:2}});assert.equal(s.players.CN.money,0);assert.equal(s.regions.P.armies.CN,0);assert.equal(s.flow.eventResolution.stage,'reward');s=reward(s,{slot:'temporary'});assert.equal(s.regions.P.armies.CN,2);
s=fixture(sea,s=>{s.regions.P.temporary=['US','RU','EU','US'];});s=bids(s,{US:{armies:{reserve:1}}});assert.equal(s.flow.eventResolution.stage,'result');assert.equal(s.regions.P.permanent[0],null);assert.deepEqual(s.regions.P.temporary,['US','RU','EU','US']);assert.equal(s.regions.P.armies.US,1);
// Syria ties retain the event, give full SP, and return all forces before the next round.
s=fixture(syria);s=bids(s,{US:{armies:{reserve:1}},EU:{diplomacy:1}});assert.equal(s.flow.eventResolution.repeat,true);assert.equal(s.players.US.smart,3);assert.equal(s.players.EU.smart,3);assert.equal(s.regions.N.armies.US,1);s=act(s,'ackEvent');assert.equal(s.eventBoard.slots[0],syria);assert.ok(!s.eventDiscard.includes(syria));
s=fixture(syria,s=>{s.regions.N.temporary=['RU','US'];syncInfluence(s.regions.N);});s=bids(s,{RU:{diplomacy:1}});assert.equal(s.flow.eventResolution.stage,'reward');assert.ok(s.eventBoard.queued.includes('c0231330f35ed'));rejected(s,{type:'resolveEventReward',skip:true},/必须/);s=reward(s,{index:0});assert.equal(s.players.RU.vp,0);assert.equal(s.regions.N.permanent[3],'RU');
// Default tie order: regional influence, pre-event VP, money AFTER payment, then starting money.
for(const [setup,winner] of [
 [s=>{s.regions.A.temporary=['CN','CN'];syncInfluence(s.regions.A);},'CN'],
 [s=>{s.regions.A.temporary=[];syncInfluence(s.regions.A);s.players.RU.vp=1;},'RU'],
 [s=>{s.regions.A.temporary=[];syncInfluence(s.regions.A);s.players.US.money=30;s.players.CN.money=40;s.players.EU.money=10;s.players.RU.money=10;},'US'],
 [s=>{s.regions.A.temporary=[];syncInfluence(s.regions.A);},'US']]){
 s=fixture(africa,setup);s=bids(s,{US:{diplomacy:2},CN:{moneyUnits:2},EU:{diplomacy:2},RU:{diplomacy:2}});assert.equal(currentActor(s),winner);
}
// A saved numeric-format bid continues through the legacy resolver without replaying effects.
s=fixture('cd771b6a9d234');delete s.flow.eventResolution.bidVersion;s=bid(s,{amount:1});s=bid(JSON.parse(JSON.stringify(s)),{amount:2});s=bid(s,{amount:1});assert.equal(s.flow.eventResolution.stage,'result');assert.equal(s.players.US.resources[5],9);assert.equal(s.players.CN.resources[5],8);assert.equal(s.players.US.smart,4);assert.equal(s.players.US.vp,1);assert.equal(s.flow.eventResolution.submissions.US,1);
// Actual room reveal enters a reward stage; no undo of the reveal or secrecy leak across seats.
const who=Object.fromEntries(ids.map(id=>[id,{user:'bid-room',token:id}]));let room=newRoom('BID444',who.US,cards,{wit:true});room.state=fixture(africa);room.status='playing';room.seats=structuredClone(who);let serial=0;
function send(owner,action){const c={id:String(++serial),op:'action',gameRevision:room.gameRevision,action};room=changeRoom(room,who[owner],c,cards);return c;}
for(const owner of ids)send(owner,{type:'submitEvent',cardId:africa,diplomacy:owner==='US'?1:0});assert.equal(room.state.flow.eventResolution.stage,'reward');assert.equal(roomView(room,who.RU).canUndo,false);assert.throws(()=>changeRoom(room,who.RU,{id:'undo-reveal',op:'undo',gameRevision:room.gameRevision},cards),/已经.*揭晓/);assert.throws(()=>send('CN',{type:'resolveEventReward',cardId:africa,slot:'permanent'}),/等待/);
const c=send('US',{type:'resolveEventReward',cardId:africa,slot:'permanent'}),before=JSON.stringify(room);room=changeRoom(room,who.US,c,cards);assert.equal(JSON.stringify(room),before);
send('US',{type:'ackEvent',cardId:africa});const saved=JSON.parse(JSON.stringify(room.state)).eventHistory.at(-1);assert.equal(saved.bidVersion,1);assert.equal(saved.submissions.US.total,1);assert.equal(saved.modifiers.US,0);assert.equal(saved.sideTotals[0].total,1);
console.log('Event bids passed: combined/limited costs, private source selections, reveal lock, held armies and rewards, zero bids, team rewards, explicit tie SP/repeat, all four tiebreaks, retired starting slots, scoring/placement, neutral replacement, full-track downgrade and overflow conversion.');
