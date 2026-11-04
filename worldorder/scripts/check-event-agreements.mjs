import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {startEventPhase} from '../dist/event-flow.js';
import {EVENT_DATA} from '../dist/event-data.js';
import {AGREEMENT_EVENTS,agreementOffer,agreementRewardPreview,agreementCountryTargets} from '../dist/event-agreements.js';
import {renderAgreementForm,renderAgreementReward,renderAgreementSummary} from '../dist/event-agreements-ui.js';
import {hasEventEffect,EFFECT_IDS} from '../dist/event-effect-state.js';
import {RESEARCH_DATA} from '../dist/research-data.js';
import {syncInfluence} from '../dist/world.js';
import {ECONOMY} from '../dist/economy.js';
import {newRoom,changeRoom,playerView,roomView} from '../server/rooms.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c])),ids=['US','CN','EU','RU'];
const id=Object.fromEntries(Object.entries(AGREEMENT_EVENTS).map(([id,r])=>[r.key,id]));
const country=name=>Object.keys(RESEARCH_DATA).find(id=>RESEARCH_DATA[id].countryName===name&&!RESEARCH_DATA[id].starting);
function fixture(key,edit=()=>{}){
 const cardId=id[key],s=createState(cards,{wit:true,dd:true},()=>.3);
 for(const p of Object.values(s.players)){p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.money=100;p.resources=[5,5,5,5,5,10,5];p.allies=[];p.exhaustedAllies=[];p.fdi=[];p.bases=[];p.smart=0;p.vp=0;p.growth=[];p.prosperity=0;}
 for(const r of Object.values(s.regions))for(const owner of ids)r.armies[owner]=0;
 s.round=4;s.flow=newFlow(ids,4);s.flow.step='events';s.phase='事件';s.actionTurns={index:16,completed:{US:4,CN:4,EU:4,RU:4}};
 s.eventBoard={round:4,slots:[null,null,cardId],personal:Object.fromEntries(ids.map(x=>[x,null])),queued:[],seen:[cardId],choice:null,revealQueue:[],distribution:null};s.events=[cardId];s.eraDeck=[];s.era2Deck=[];s.eventHistory=[];s.eventDiscard=[];s.eventEffects=[];s.activeEffects=[];
 edit(s);startEventPhase(s);assert.equal(s.flow.eventResolution.agreementVersion,1);return s;
}
const act=(s,type,a={})=>applyAction(s,{type,cardId:s.flow.eventResolution.cardId,...a});
const submit=(s,a)=>act(s,'submitEvent',a),reward=(s,a)=>act(s,'resolveEventReward',a);
function agree(s,offers){for(const owner of [...s.flow.eventResolution.participants]){assert.equal(s.current,owner);s=submit(s,offers[owner]||{accept:false});}return s;}
function rejects(s,a,re,type='submitEvent'){const before=JSON.stringify(s);assert.throws(()=>act(s,type,a),re);assert.equal(JSON.stringify(s),before);}
const yes=diplomacy=>({accept:true,diplomacy});
// Promises remain free until all participants decide. NATO moves armies onto
// the card then into the region once; an insufficient total invokes failure.
let s=fixture('libya');const initialMoney=s.players.US.money;s=submit(s,{accept:true,armies:{reserve:2}});assert.equal(s.players.US.money,initialMoney);assert.equal(s.players.US.resources[6],5);
s=submit(s,{accept:true,armies:{reserve:1}});assert.equal(s.players.US.money,90);assert.equal(s.players.EU.money,95);assert.equal(s.players.US.smart,4);assert.equal(s.players.EU.smart,2);assert.equal(s.regions.N.armies.US,2);assert.equal(s.regions.N.armies.EU,1);assert.deepEqual(s.eventBoard.queued,['cb29f5917c351']);assert.equal(s.flow.eventResolution.stage,'result');
s=fixture('libya');const neutral=s.regions.N.influence.neutral;s=agree(s,{US:{accept:true,armies:{reserve:1}},EU:{accept:true,armies:{reserve:1}}});assert.equal(s.players.US.money,100);assert.equal(s.players.US.vp,-2);assert.equal(s.players.EU.vp,-2);assert.equal(s.regions.N.influence.neutral,neutral+1);assert.equal(s.players.US.resources[6],5);
s=fixture('libya',s=>{s.players.US.money=4;});rejects(s,{accept:true,armies:{reserve:1}},/不足/);rejects(s,{accept:true,armies:{}},/必须实际出资/);
// IMEC counts printed ally discounts as that player's paid diplomacy and keeps
// money a shared total, not an invented fixed 10-money cost per participant.
s=fixture('imec',s=>{s.players.US.allies=[country('India')];s.players.EU.allies=[country('Israel'),country('UAE')];s.regions.E.temporary=['EU'];s.regions.E.permanent.fill('US');syncInfluence(s.regions.E);});
s=agree(s,{US:{accept:true,money:20,diplomacy:1},EU:{accept:true,money:0,diplomacy:0}});assert.equal(s.players.US.money,80);assert.equal(s.players.EU.money,100);assert.equal(s.players.US.smart,4);assert.equal(s.players.US.vp,4);assert.equal(s.players.EU.smart,2);assert.equal(s.flow.eventResolution.rewardQueue[0].owner,'EU');
let before=JSON.stringify(s);assert.match(agreementRewardPreview(s,s.flow.eventResolution,{region:'E',index:0}),/转为永久/);assert.equal(JSON.stringify(s),before);s=reward(s,{region:'E',index:0});assert.deepEqual(s.regions.E.extraPermanent,['EU']);assert.equal(s.players.EU.vp,0);
s=agree(fixture('imec'),{US:{accept:true,money:10,diplomacy:1},EU:{accept:true,money:10,diplomacy:2}});assert.equal(s.flow.eventResolution.agreement.success,false);assert.equal(s.players.US.money,100);
// BRICS uses contribution order, can search buried eligible cards, and grants
// only cards still on the board. Search/reveal is recorded for the undo barrier.
const egypt=country('Egypt'),ethiopia=country('Ethiopia'),iran=country('Iran');
s=fixture('brics',s=>{s.regions.N.countryPiles={left:[country('Iraq'),egypt,iran],right:[country('Qatar')]};s.regions.N.available=[country('Iraq'),country('Qatar')];s.regions.N.deck=[egypt,iran];s.regions.A.countryPiles={left:[ethiopia],right:[]};s.regions.A.available=[ethiopia];s.regions.A.deck=[];});
s=agree(s,{RU:yes(2),CN:yes(3)});assert.equal(s.current,'CN');assert.equal(s.players.CN.smart,3);assert.equal(s.players.RU.smart,2);assert.ok(agreementCountryTargets(s,'CN').includes(egypt));
before=JSON.stringify(s);assert.match(agreementRewardPreview(s,s.flow.eventResolution,{country:egypt}),/免费/);assert.equal(JSON.stringify(s),before);
s=reward(s,{country:egypt});assert.ok(s.players.CN.allies.includes(egypt));assert.equal(s.players.CN.resources[5],7);assert.equal(s.players.CN.vp,0);assert.equal(s.flow.eventResolution.agreementRandom,1);assert.equal(s.current,'RU');rejects(s,{country:egypt},/指定国家/,'resolveEventReward');s=reward(s,{skip:true});assert.equal(s.flow.eventResolution.stage,'result');
// Trade war and unlimited partnership pay each contributor's own amount.
s=agree(fixture('tradeWar'),{US:yes(1),CN:yes(4)});assert.equal(s.players.US.smart,1);assert.equal(s.players.CN.smart,4);assert.equal(s.players.CN.vp,4);assert.equal(hasEventEffect(s,'global',EFFECT_IDS.tradeWar),false);
s=agree(fixture('tradeWar'),{US:yes(1),CN:{accept:false}});assert.equal(s.players.US.resources[5],10);assert.equal(s.players.US.prosperity,0);assert.equal(s.players.US.vp,-1);assert.ok(hasEventEffect(s,'global',EFFECT_IDS.tradeWar));
s=agree(fixture('unlimited'),{RU:yes(1),CN:yes(3)});assert.equal(s.players.RU.smart,1);assert.equal(s.players.CN.vp,3);assert.equal(hasEventEffect(s,'global',EFFECT_IDS.unlimited),false);
const mover=s.current;s=reward(s,{moves:[{from:'reserve',to:'M',spendSP:true}]});assert.equal(s.players[mover].money,95);assert.equal(s.players[mover].smart,(mover==='CN'?3:1)-1);s=reward(s,{skip:true});assert.ok(hasEventEffect(s,'global',EFFECT_IDS.unlimited));
// Fixed agreements require both parties, preserve actual costs, and apply
// continuous effects only after all printed reward choices finish.
s=agree(fixture('siberia'),{RU:{accept:true},CN:{accept:true}});for(const owner of ['RU','CN']){assert.equal(s.players[owner].money,85);assert.equal(s.players[owner].resources[5],9);assert.equal(s.players[owner].smart,3);}assert.ok(hasEventEffect(s,'CN',EFFECT_IDS.siberia));
s=agree(fixture('siberia'),{RU:{accept:false},CN:{accept:true}});assert.equal(s.players.CN.money,100);assert.equal(s.eventEffects.length,0);
s=agree(fixture('nordstream',s=>{s.players.EU.resources[5]=5;s.players.RU.resources[5]=5;s.regions.E.temporary=['RU'];s.regions.E.permanent.fill('EU');syncInfluence(s.regions.E);}),{RU:{accept:true},EU:{accept:true}});assert.equal(s.players.EU.resources[5],5);assert.equal(s.players.RU.resources[5],3);assert.equal(hasEventEffect(s,'EU',EFFECT_IDS.nordstream),false);s=reward(s,{choice:'convert',region:'E',index:0});assert.deepEqual(s.regions.E.extraPermanent,['RU']);assert.ok(hasEventEffect(s,'EU',EFFECT_IDS.nordstream));
s=agree(fixture('nordstream'),{RU:{accept:true},EU:{accept:true}});s=reward(s,{choice:'diplomacy'});assert.equal(s.players.RU.resources[5],10);
// START returns armies to the supply, not the player's reserve, and each side
// must return at least one map army. There is no ordinary movement cost.
s=fixture('start',s=>{s.regions.E.armies.US=2;s.regions.P.armies.RU=1;});rejects(s,{accept:true,armies:{reserve:1}},/允许的地区/);rejects(s,{accept:true,armies:{}},/每方至少/);
s=agree(s,{US:{accept:true,armies:{E:2}},RU:{accept:true,armies:{P:1}}});assert.equal(s.players.US.resources[6],5);assert.equal(s.regions.E.armies.US,0);assert.equal(s.players.US.money,100);assert.equal(s.players.US.vp,4);assert.equal(s.players.RU.vp,2);assert.ok(hasEventEffect(s,'global',EFFECT_IDS.start));
// A four-party agreement needs two contributors, not unanimous agreement.
// Nonparticipants gain no reward; printed NPP ranges do not cap humans.
s=agree(fixture('iran'),{US:yes(4),EU:yes(1)});assert.ok(s.flow.eventResolution.agreement.success);assert.equal(s.players.US.smart,4);assert.equal(s.players.US.vp,2);assert.equal(s.players.EU.vp,2);assert.equal(s.players.RU.vp,0);assert.equal(s.players.CN.resources[5],10);
s=fixture('iran');const usInfluence=s.regions.N.influence.US,cnInfluence=s.regions.N.influence.CN;s=agree(s,{US:yes(5)});assert.equal(s.flow.eventResolution.agreement.success,false);assert.equal(s.players.US.resources[5],10);assert.equal(s.players.US.vp,0-usInfluence);assert.equal(s.players.CN.vp,0-cnInfluence);
// TTIP records each selected face. Free exchange remains available when the
// player cannot afford the investment face; no agreement rewards are replayed.
s=agree(fixture('ttip',s=>{s.players.US.money=0;s.players.EU.money=25;}),{US:yes(3),EU:yes(5)});assert.equal(s.players.US.smart,1);assert.equal(s.players.EU.smart,2);assert.equal(s.current,'US');rejects(s,{face:'investment',productionKey:0,slot:'temporary'},/25资金/,'resolveEventReward');s=reward(s,{face:'exchange'});assert.equal(s.eventEffects.find(e=>e.cardId===EFFECT_IDS.ttipUS).face,'exchange');
const oldProduction=s.players.US.production[0];s=reward(s,{face:'investment',productionKey:0,slot:'temporary'});assert.equal(s.players.EU.money,0);assert.equal(s.players.US.production[0],oldProduction+1);assert.equal(s.eventEffects.find(e=>e.cardId===EFFECT_IDS.ttipEU).face,'investment');
s=agree(fixture('ttip',s=>{s.players.EU.production=[...ECONOMY.EU.max];}),{US:yes(4),EU:yes(4)});s=reward(s,{face:'investment',slot:'temporary'});assert.deepEqual(s.players.EU.production,ECONOMY.EU.max);s=reward(s,{face:'exchange'});
// Generic protocol invariants: strict contribution choice, no early charge,
// historical result survives reload, old manual saves remain manual.
for(const key of Object.keys(id)){
 s=fixture(key);rejects(s,{accept:'yes'},/请选择/);assert.match(renderAgreementForm(s,s.flow.eventResolution),/agreement-form/);
 s=agree(s,{});assert.equal(s.flow.eventResolution.stage,'result');assert.match(renderAgreementSummary(s.flow.eventResolution),/未达成/);s=JSON.parse(JSON.stringify(s));assert.throws(()=>submit(s,{accept:false}),/已结算/);
 s=act(s,'ackEvent');assert.equal(s.eventHistory[0].agreementVersion,1);
}
s=fixture('siberia');s.flow.eventResolution.mode='manual';delete s.flow.eventResolution.agreementVersion;s.flow.eventResolution.stage='resolve';s.flow.eventResolution.participants=ids;s.current=ids[0];for(const owner of ids)s=submit(s,{confirmed:true});assert.equal(s.players.CN.money,100);assert.equal(s.eventEffects.length,0);
// Room seat authority and command-id retries preserve publicly visible offers.
const identity=Object.fromEntries(ids.map(owner=>[owner,{user:'agreement-test',token:owner}]));let room=newRoom('AGREEMENTS',identity.US,cards,{wit:true,dd:true});room.status='playing';room.seats=identity;room.state=fixture('ttip');
const command={op:'action',id:'agreement-1',gameRevision:room.gameRevision,action:{type:'submitEvent',cardId:id.ttip,...yes(4)}};assert.throws(()=>changeRoom(room,identity.CN,command,cards),/等待美国/);room=changeRoom(room,identity.US,command,cards);assert.equal(changeRoom(room,identity.US,command,cards),room);assert.equal(room.state.players.US.resources[5],10);assert.equal(playerView(room.state,'EU').flow.eventResolution.submissions.US.diplomacy,4);
room=changeRoom(room,identity.EU,{op:'action',id:'agreement-2',gameRevision:room.gameRevision,action:{type:'submitEvent',cardId:id.ttip,...yes(4)}},cards);assert.match(renderAgreementReward(playerView(room.state,'US'),room.state.flow.eventResolution,byId),/TTIP/);assert.equal(roomView(room,identity.US).actor,'US');
room.state=agree(fixture('brics',s=>{s.regions.N.countryPiles={left:[country('Iraq'),egypt],right:[country('Qatar')]};s.regions.N.available=[country('Iraq'),country('Qatar')];s.regions.N.deck=[egypt];s.regions.A.countryPiles={left:[ethiopia],right:[]};s.regions.A.available=[ethiopia];s.regions.A.deck=[];}),{CN:yes(3),RU:yes(2)});
assert.equal(playerView(room.state,'CN').regions.N.countryPiles.left[1],egypt);assert.equal(playerView(room.state,'RU').regions.N.countryPiles.left[1],null);assert.ok(agreementCountryTargets(playerView(room.state,'CN'),'CN').includes(egypt));
for(const [owner,chosen] of [['CN',egypt],['RU',ethiopia]]){
 room=changeRoom(room,identity[owner],{op:'action',id:'search-'+owner,gameRevision:room.gameRevision,action:{type:'resolveEventReward',cardId:id.brics,country:chosen}},cards);
 assert.equal(roomView(room,identity[owner]).canUndo,false);assert.throws(()=>changeRoom(room,identity[owner],{op:'undo',id:'undo-'+owner,gameRevision:room.gameRevision},cards),/随机事件/);
}
assert.equal(room.state.flow.eventResolution.agreementRandom,2);
console.log('Passed 10 shared agreements: public promises, contribution eligibility, exact/minimum totals, no NPP caps, conditional payment, military supply, SP/failure, effects, reward ownership, TTIP faces, BRICS search, reload, legacy manual saves and room retries.');
