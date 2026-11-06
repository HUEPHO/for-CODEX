import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {startEventPhase,handleEventAction} from '../dist/event-flow.js';
import {AGREEMENT_EVENTS,agreementEnough} from '../dist/event-agreements.js';
import {roomActionIssue} from '../dist/action-policy.js';
import {newRoom,changeRoom,playerView} from '../server/rooms.js';
import {renderFocus} from '../dist/economy-ui.js';
import {renderOriginalBoard} from '../dist/original-board.js';
import {renderAgreementForm} from '../dist/event-agreements-ui.js';
import {EFFECT_IDS} from '../dist/event-effect-rules.js';
import {prepareFocus,resolveFocus} from '../dist/economy.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const seats=['US','CN','EU','RU'],ids=Object.fromEntries(Object.entries(AGREEMENT_EVENTS).map(([id,r])=>[r.key,id]));
function base(){
 const s=createState(cards,{wit:true,dd:true},()=>.3);
 for(const p of Object.values(s.players)){p.assetChoices=p.objectiveChoices=p.openingChoices=null;p.resources=[5,5,5,5,5,10,4];p.money=100;p.smart=5;p.vp=0;p.growth=[];}
 for(const r of Object.values(s.regions))for(const owner of seats)r.armies[owner]=0;
 s.flow=newFlow(seats,2);s.round=2;s.flow.step='focus';s.phase='准备';s.current='US';s.eventEffects=[];s.activeEffects=[];
 s.eventBoard={round:2,slots:[null,null,null],personal:Object.fromEntries(seats.map(x=>[x,null])),queued:[],seen:[],choice:null,revealQueue:[],distribution:null};
 return s;
}
function fixture(key){
 const s=base(),cardId=ids[key];s.phase='事件';s.flow.step='events';s.eventBoard.slots=[null,null,cardId];s.events=[cardId];
 if(key==='afghan')s.regions.C.armies.US=2;
 startEventPhase(s);assert.equal(s.flow.eventResolution.agreementVersion,2);return s;
}
function command(s,owner,a){
 const next=structuredClone(s);next.current=owner;
 const action={type:'submitEvent',cardId:s.flow.eventResolution.cardId,...a};
 const issue=roomActionIssue(s,owner,action);if(issue)throw Error(issue);
 handleEventAction(next,action);return next;
}
const offer=(s,owner,a)=>command(s,owner,{type:'updateAgreement',...a});
const confirm=(s,owner,a={})=>command(s,owner,{accept:true,...s.flow.eventResolution.submissions[owner],...a});
const reject=(s,owner)=>command(s,owner,{accept:false});

// Focus is committed in two persisted steps. Production cannot repeat upgrades,
// and changing the focus after the first step cannot exploit different tracks.
let s=base();assert.match(renderFocus(s,byId),/data-focus="外交焦点"/);
s=applyAction(s,{type:'focus',focus:'外交焦点'});
const money=s.players.US.money,level=s.players.US.production[5];
s=applyAction(s,{type:'prepareFocus',upgrades:[5]});
assert.equal(s.players.US.money,money-8);assert.equal(s.players.US.production[5],level+1);
assert.ok(s.flow.focusProduction);assert.match(renderFocus(s,byId),/domestic-production-matrix/);
assert.throws(()=>applyAction(s,{type:'prepareFocus',upgrades:[5]}),/已进入生产/);
assert.throws(()=>applyAction(s,{type:'focus',focus:'军事焦点'}),/已进入生产/);
const waitingFocus=structuredClone(s);s=JSON.parse(JSON.stringify(s));
assert.throws(()=>applyAction(s,{type:'confirmFocus',quantities:[1,0,0,0,0,0,0]}),/该焦点不能/);
s=applyAction(s,{type:'confirmFocus',quantities:[0,0,0,0,0,2,0],upgrades:[5]});
assert.equal(s.players.US.money,money-8-6);assert.equal(s.players.US.production[5],level+1);assert.equal(s.flow.focusProduction,undefined);assert.equal(s.current,'CN');
for(const focus of ['内政焦点','军事焦点']){const t=base();t.players.US.focus=focus;t.flow.focusProduction=prepareFocus(t,{});const n=[0,0,0,0,0,0,0];n[focus==='军事焦点'?6:3]=1;resolveFocus(t,{quantities:n});assert.equal(t.players.US.resources[focus==='军事焦点'?6:3],focus==='军事焦点'?5:6);}

// All confirmed, too little: hold forever, retain costs and confirmation across
// reload. Updating the final contribution then pays exactly once.
s=fixture('tradeWar');s=offer(s,'CN',{diplomacy:1});s=offer(s,'US',{diplomacy:1});
s=confirm(s,'US');s=confirm(s,'CN');
assert.equal(s.flow.eventResolution.stage,'agreement');assert.equal(s.players.US.resources[5],10);assert.equal(s.eventEffects.length,0);
assert.match(renderAgreementForm(s,s.flow.eventResolution),/已全部确认，出资尚未满足/);
const waitingAgreement=structuredClone(s);s=JSON.parse(JSON.stringify(s));
s=command(s,'CN',{type:'updateAgreement',operation:'unconfirm'});assert.equal(s.flow.eventResolution.submissions.CN.diplomacy,1);
s=offer(s,'US',{diplomacy:4});assert.equal(s.flow.eventResolution.stage,'agreement');
s=confirm(s,'CN');assert.equal(s.flow.eventResolution.stage,'result');assert.equal(s.players.US.resources[5],6);assert.equal(s.players.CN.resources[5],9);
assert.throws(()=>command(s,'CN',{type:'updateAgreement',diplomacy:5}));
s=waitingAgreement;s=offer(s,'CN',{diplomacy:4});assert.equal(s.flow.eventResolution.stage,'result');assert.equal(s.players.CN.resources[5],6);

// Refusal is an explicit decision, never inferred from zero or insufficient bids.
s=fixture('tradeWar');s=confirm(s,'US');s=confirm(s,'CN');assert.equal(s.flow.eventResolution.stage,'agreement');
s=reject(s,'CN');assert.equal(s.flow.eventResolution.agreement.success,false);assert.ok(s.eventEffects.some(e=>e.cardId===EFFECT_IDS.tradeWar));assert.equal(s.players.US.resources[5],10);
s=fixture('siberia');s.players.RU.money=0;s=reject(s,'CN');assert.equal(s.flow.eventResolution.stage,'result');
for(const key of ['imec','brics','ttip','libya','start','minsk']){
 s=fixture(key);for(const owner of s.flow.eventResolution.participants)s=confirm(s,owner);
 assert.equal(s.flow.eventResolution.stage,'agreement',key+' must wait on zero');
 assert.equal(agreementEnough(s.flow.eventResolution),false);
}

// Exact shared totals stay exact; excess can be reduced after confirmation.
s=fixture('minsk');s=confirm(s,'EU',{diplomacy:4});s=confirm(s,'RU',{diplomacy:2});assert.equal(s.flow.eventResolution.stage,'agreement');
s=offer(s,'EU',{diplomacy:3});assert.equal(s.flow.eventResolution.agreement.success,true);assert.equal(s.players.EU.vp,2);
s=fixture('iran');s=reject(s,'CN');s=reject(s,'RU');assert.equal(s.flow.eventResolution.stage,'agreement');
s=confirm(s,'US',{diplomacy:4});s=confirm(s,'EU',{diplomacy:1});assert.equal(s.flow.eventResolution.agreement.success,true);assert.equal(s.players.RU.vp,0);
s=fixture('iran');s=reject(s,'CN');s=reject(s,'RU');s=reject(s,'US');assert.equal(s.flow.eventResolution.agreement.success,false);

// Army contributions retain actual source validation and the supply distinction.
s=fixture('libya');s.regions.E.armies.US=1;s=confirm(s,'US',{armies:{reserve:1,E:1}});s=confirm(s,'EU',{armies:{reserve:1}});
assert.equal(s.regions.N.armies.US,2);assert.equal(s.regions.E.armies.US,0);assert.equal(s.players.US.resources[6],3);assert.equal(s.players.US.money,90);
s=fixture('start');s.regions.E.armies.US=1;s.regions.P.armies.RU=1;s=confirm(s,'US',{armies:{E:1}});s=confirm(s,'RU',{armies:{P:1}});
assert.equal(s.players.US.resources[6],4);assert.equal(s.regions.E.armies.US,0);
s=fixture('afghan');s=confirm(s,'US',{money:0});s=confirm(s,'EU',{money:20});assert.equal(s.flow.eventResolution.stage,'agreement');
s=offer(s,'EU',{money:30});assert.equal(s.players.EU.money,70);assert.equal(s.players.US.money,100);assert.equal(s.regions.C.armies.US,2);
s=fixture('afghan');s=reject(s,'EU');assert.equal(s.flow.eventResolution.stage,'reward');
s=command(s,'US',{type:'resolveEventReward',moves:[{from:'C',to:'E'},{from:'C',to:'M'}]});assert.equal(s.flow.eventResolution.stage,'result');assert.equal(s.regions.C.armies.US,0);assert.equal(s.players.US.money,100);

// Existing reward branches still run after live agreement settlement.
s=fixture('siberia');s=confirm(s,'CN');s=confirm(s,'RU');assert.equal(s.players.CN.money,85);assert.equal(s.flow.eventResolution.stage,'result');
s=fixture('nordstream');s=confirm(s,'EU');s=confirm(s,'RU');s=command(s,'RU',{type:'resolveEventReward',choice:'diplomacy'});assert.equal(s.flow.eventResolution.stage,'result');assert.ok(s.eventEffects.some(e=>e.cardId===EFFECT_IDS.nordstream));
s=fixture('ttip');s=confirm(s,'US',{diplomacy:4});s=confirm(s,'EU',{diplomacy:4});for(const owner of ['US','EU'])s=command(s,owner,{type:'resolveEventReward',face:'exchange'});assert.equal(s.eventEffects.length,2);
s=fixture('brics');s=confirm(s,'CN',{diplomacy:3});s=confirm(s,'RU',{diplomacy:2});for(const owner of ['CN','RU'])s=command(s,owner,{type:'resolveEventReward',skip:true});assert.equal(s.flow.eventResolution.stage,'result');
s=fixture('imec');s.players.US.allies=[];s.players.EU.allies=[];s=confirm(s,'US',{money:10,diplomacy:2});s=confirm(s,'EU',{money:10,diplomacy:2});assert.equal(s.flow.eventResolution.agreement.success,true);assert.equal(s.players.US.money,90);
s=fixture('unlimited');s=confirm(s,'CN',{diplomacy:1});s=confirm(s,'RU',{diplomacy:3});for(const owner of ['CN','RU'])s=command(s,owner,{type:'resolveEventReward',skip:true});assert.equal(s.flow.eventResolution.stage,'result');assert.ok(s.eventEffects.some(e=>e.cardId===EFFECT_IDS.unlimited));

// Legacy in-progress agreements still accept the former sequential commands.
s=fixture('tradeWar');s.flow.eventResolution.agreementVersion=1;s.flow.eventResolution.submissions={};s.flow.eventResolution.done=[];
s=confirm(s,'US',{diplomacy:2});s=confirm(s,'CN',{diplomacy:3});assert.equal(s.flow.eventResolution.agreement.success,true);

// Authoritative room checks: both parties may update concurrently, outsiders
// cannot; revisions, idempotency, public views, resources and reload stay intact.
const identity=Object.fromEntries(seats.map(owner=>[owner,{user:'page-eight',token:owner}]));
let room=newRoom('PAGEEIGHT',identity.US,cards,{wit:true,dd:true});room.status='playing';room.seats=identity;room.state=fixture('tradeWar');
const cmd=(id,action)=>({op:'action',id,gameRevision:room.gameRevision,action:{type:'updateAgreement',cardId:ids.tradeWar,...action}});
assert.equal(roomActionIssue(room.state,'CN',{type:'updateAgreement'}),null);
assert.ok(roomActionIssue(room.state,'EU',{type:'updateAgreement'}));
const first=cmd('first',{diplomacy:1}),stale=cmd('stale',{diplomacy:2});room=changeRoom(room,identity.CN,first,cards);
assert.equal(changeRoom(room,identity.CN,first,cards),room);assert.throws(()=>changeRoom(room,identity.US,stale,cards));
assert.equal(playerView(room.state,'US').flow.eventResolution.submissions.CN.diplomacy,1);
assert.deepEqual(playerView(room.state,'US').players.CN.hand,room.state.players.CN.hand.map(()=>null));
room=changeRoom(room,identity.US,cmd('us',{type:'submitEvent',accept:true,diplomacy:1}),cards);
room=changeRoom(room,identity.CN,cmd('cn',{type:'submitEvent',accept:true,diplomacy:1}),cards);
room=JSON.parse(JSON.stringify(room));assert.equal(room.state.flow.eventResolution.stage,'agreement');
const before=JSON.stringify(room);assert.throws(()=>changeRoom(room,identity.CN,cmd('invalid',{diplomacy:11}),cards));assert.equal(JSON.stringify(room),before);
const finish=cmd('finish',{diplomacy:4});room=changeRoom(room,identity.CN,finish,cards);assert.equal(changeRoom(room,identity.CN,finish,cards),room);
assert.equal(room.state.players.CN.resources[5],6);assert.equal(room.state.eventHistory.filter(e=>e.cardId===ids.tradeWar).length,1);

const board=base();board.eventEffects=[{owner:'global',cardId:EFFECT_IDS.sanctions},{owner:'CN',cardId:EFFECT_IDS.siberia}];board.activeEffects=[EFFECT_IDS.sanctions,EFFECT_IDS.tradeWar];
const html=renderOriginalBoard(board,byId);assert.equal((html.match(/class="public-effect-empty"/g)||[]).length,4);assert.match(html,/公共事件效果/);
if(process.argv.includes('--fixtures')){
 fs.mkdirSync(new URL('../.local/page-eight/',import.meta.url),{recursive:true});
 const focus=base();focus.players.US.exhaustedAllies=[...focus.players.US.allies];focus.players.US.growth=[cards.find(c=>c.type==='growth').id];
 const research=base();research.flow.step='research';research.phase='研究';research.flow.research={remaining:8,spent:0,consumedAllies:[],cards:[]};
 const owned=research.growth.filter(id=>byId[id].level===1).slice(0,2);for(const [index,id] of owned.entries()){research.players[index?'EU':'US'].growth.push(id);research.growth.splice(research.growth.indexOf(id),1);}
 const military=base();military.flow.step='events';military.phase='事件';military.eventBoard.slots=[null,null,'c1b3f3035a3cf'];military.regions.E.armies.US=2;startEventPhase(military);
 const reveal=base();reveal.eventBoard.choice={type:'reveal',owner:'US',cardId:ids.afghan};
 const crimea=base();crimea.flow.step='events';crimea.phase='事件';crimea.eventBoard.slots=[null,null,'c2356e9f50f6e'];crimea.regions.E.armies.RU=2;startEventPhase(crimea);
 for(const [key,value] of Object.entries({military,reveal,start:fixture('start'),libya:fixture('libya'),focus,production:waitingFocus,agreement:waitingAgreement,board,research,crimea,afghan:fixture('afghan'),iran:fixture('iran')}))fs.writeFileSync(new URL('../.local/page-eight/'+key+'.json',import.meta.url),JSON.stringify(value));
}
console.log('Page eight checks passed: focus persistence, all-confirmed waiting, editable public offers, refusal thresholds, exact totals, armies, legacy compatibility, room authority/revisions/retries/privacy, automatic settlement once.');
