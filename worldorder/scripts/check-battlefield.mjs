import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {ASSET_STOCK} from '../dist/asset-stock.js';
import {boxedAssets} from '../dist/growth-battlefield.js';
import {requiredGrowthCards} from '../dist/growth-active.js';
import {renderGrowthPending} from '../dist/growth-active-ui.js';
import {newRoom,changeRoom,playerView} from '../server/rooms.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const battle='c2b12b9e97150',domestic='cf9aa23c4a315',trade='c89c153d80dbd',weapon='c9cdadd802619',rapid='c5897c7e5dfcb',brics='c505b0ec5fbae';
const buy={type:'playBasicCard',cardId:domestic,domestic:'growth',growthId:battle};
const step=(s,a)=>applyAction(s,{type:'resolveSequenceStep',slot:'temporary',...a});
const keep=s=>applyAction(s,{type:'finishGrowthAbility',cards:[s.flow.pendingGrowth.candidates[0]]});
const use=(s,id)=>applyAction(s,{type:'finishGrowthAbility',assetId:id});
const skip=s=>applyAction(s,{type:'finishGrowthAbility',skip:true});
function fixture(owner='US',round=3){
 const s=createState(cards,{dd:true,wit:false,executive:true});s.growth=cards.filter(c=>c.type==='growth').map(c=>c.id);
 for(const p of Object.values(s.players))p.openingChoices=p.assetChoices=p.objectiveChoices=null;
 const order=[owner,...['US','CN','EU','RU'].filter(id=>id!==owner)];s.round=round;s.current=owner;s.flow=newFlow(order,round);s.initialOrder=order;s.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};
 Object.assign(s.players[owner],{growth:['c74931cfb3833','cfeb2319d6850','ca11b52d5e0ad'],hand:[domestic,trade],deck:[],discard:[],resources:[5,5,5,8,10,9,8],money:100,assets:owner==='US'?[weapon]:owner==='CN'?[rapid,brics]:[]});return s;
}
assert.equal(Object.keys(ASSET_STOCK).length,32);
for(const c of cards.filter(c=>c.type==='asset'))assert.deepEqual(ASSET_STOCK[c.id],{owner:c.owner,module:c.module,vp:c.vp});
for(const round of [1,3,4,6]){
 let s=fixture('US',round);const boxed=boxedAssets(s);s=applyAction(s,buy);
 assert.equal(s.flow.pendingGrowth.stage,'keep');assert.equal(s.current,'US');assert.equal(s.actionTurns.index,0);assert.equal(s.players.US.money,85);assert.equal(s.players.US.resources[4],6);assert.equal(s.players.US.vp,5);assert.deepEqual(s.players.US.hand,[trade]);
 const ids=s.flow.pendingGrowth.candidates;assert.equal(new Set(ids).size,2);assert.ok(ids.every(id=>boxed.includes(id)));
 assert.deepEqual(playerView(s,'CN').flow.pendingGrowth,{owner:'US'});assert.match(renderGrowthPending(playerView(s,'US'),byId),/立即选择/);assert.match(renderGrowthPending(playerView(s,'CN'),byId),/等待对方/);
 assert.throws(()=>applyAction(s,{type:'endAction'}),/先完成/);assert.throws(()=>applyAction(s,{type:'finishGrowthAbility',cards:[weapon]}),/本次抽到/);
 s=keep(JSON.parse(JSON.stringify(s)));assert.equal(s.players.US.vp,5+ASSET_STOCK[ids[0]].vp);assert.ok(s.players.US.assets.includes(ids[0]));assert.equal(s.flow.pendingGrowth.candidates,undefined);
 assert.throws(()=>applyAction(s,{type:'finishGrowthAbility',cards:[ids[0]]}),/未使用/);
 s=skip(s);assert.equal(s.actionTurns.index,1);assert.equal(s.current,'CN');assert.equal(s.flow.pendingGrowth,null);
 assert.throws(()=>skip(s),/没有本方/);
}
// Refuse a purchase with too few boxed cards before any cost/card consumption.
let s=fixture();s.players.US.usedAssets=boxedAssets(s).slice(1);let before=JSON.stringify(s);assert.throws(()=>applyAction(s,buy),/不足2张/);assert.equal(JSON.stringify(s),before);
// Box reconstruction respects enabled modules, excludes chosen and used assets,
// and includes the discarded setup candidate after the setup choice is finished.
s=fixture();s.config.dd=false;assert.ok(boxedAssets(s).every(id=>ASSET_STOCK[id].module==='base'));s.config.dd=true;
assert.equal(boxedAssets(s).length,7);s.players.US.usedAssets=['cd9aca36eefd7'];assert.equal(boxedAssets(s).length,6);
// Existing owned asset is eligible. Its own costs remain; no covered hand card.
s=keep(applyAction(fixture(),buy));const hand=[...s.players.US.hand],vp=s.players.US.vp;
const denied=structuredClone(s);denied.players.US.resources[6]=1;before=JSON.stringify(denied);assert.throws(()=>use(denied,weapon),/不能使用/);assert.equal(JSON.stringify(denied),before);
assert.throws(()=>use(s,brics),/本方未使用/);assert.throws(()=>use(s,'ceee39575b136'),/未使用/);
s=use(s,weapon);assert.deepEqual(s.players.US.hand,hand);assert.deepEqual(s.players.US.played,[domestic]);assert.ok(s.players.US.usedAssets.includes(weapon));assert.equal(s.actionTurns.index,0);assert.ok(s.flow.battlefieldReturn);
assert.deepEqual(playerView(s,'CN').flow.battlefieldReturn,{owner:'US'});
s=step(JSON.parse(JSON.stringify(s)),{region:'M'});assert.equal(s.actionTurns.index,1);assert.equal(s.players.US.money,105);assert.equal(s.players.US.resources[6],6);assert.ok(s.players.US.vp>vp);assert.equal(s.flow.battlefieldReturn,undefined);
// A newly retained asset can be used immediately, including with zero hand cards.
s=fixture();s.players.US.assets=[];s.players.US.usedAssets=boxedAssets(s).filter(id=>![weapon,'ca58c2d75ac35'].includes(id));s.players.US.hand=[domestic];s=applyAction(s,buy);s=applyAction(s,{type:'finishGrowthAbility',cards:[weapon]});s=use(s,weapon);s=step(s,{region:'M'});assert.equal(s.players.US.hand.length,0);assert.equal(s.actionTurns.index,1);
// Nested real asset: research champion buys the growth after production.
s=fixture();s.players.US.assets=['cd9aca36eefd7',weapon];s=applyAction(s,{type:'startSequenceCard',cardId:'cd9aca36eefd7',cover:domestic});s=step(s,{domestic:'produce',steps:[]});
s=step(s,{domestic:'growth',growthId:battle});assert.equal(s.flow.cardResolution.cardId,'cd9aca36eefd7');assert.equal(s.flow.cardResolution.index,2);s=use(keep(s),weapon);s=step(s,{region:'M'});assert.equal(s.actionTurns.index,1);assert.deepEqual(s.players.US.hand,[trade]);assert.deepEqual(s.players.US.faceDownPlayed,[domestic]);assert.equal(s.flow.cardResolution,null);
// A parent sequence with later steps resumes the exact saved index, once.
s=fixture();s.players.US.played=[domestic];s.players.US.hand=[trade];s.flow.turnCards=[domestic];s.flow.cardResolution={owner:'US',round:3,turnIndex:0,cardId:'cd9aca36eefd7',steps:[{type:'effect',card:{effect:'domestic',domesticMode:'growth'}},{type:'gain',gain:{money:7}}],index:0,context:{},history:[]};
s=step(s,{domestic:'growth',growthId:battle});s=use(keep(s),weapon);s=step(s,{region:'M'});assert.equal(s.players.US.money,112);assert.equal(s.actionTurns.index,1);assert.equal(s.flow.sequenceReports.US.cardId,'cd9aca36eefd7');assert.ok(s.flow.sequenceReports.US.history.some(row=>row.title==='战役优势即时资产 · 添加影响力'&&row.changes.some(change=>change.items.some(item=>item.label==='资金'&&item.delta===20))));
// Free rapid industrialization grants an optional play; it does not lose the
// suspended parent sequence or consume a second normal action.
for(const decline of [true,false]){
 s=keep(applyAction(fixture('CN'),buy));s=use(s,rapid);s=step(s,{upgrades:[0,1]});assert.ok(s.flow.extraCard);assert.ok(s.flow.battlefieldReturn);assert.equal(s.current,'CN');
 s=decline?applyAction(s,{type:'endAction'}):applyAction(s,{type:'playBasicCard',cardId:trade,transactions:[]});
 assert.equal(s.actionTurns.index,1);assert.equal(s.flow.battlefieldReturn,undefined);assert.equal(s.players.CN.hand.length,decline?1:0);
}
// Temporary foreign-player response retains the owning action and parent frame.
s=use(keep(applyAction(fixture('CN'),buy)),brics);s=step(s,{regions:['M','A']});s=step(s,{region:'M'});s=step(s,{region:'A'});assert.equal(s.current,'RU');assert.equal(s.flow.cardResolution.owner,'CN');assert.deepEqual(playerView(s,'RU').flow.battlefieldReturn,{owner:'CN'});s=step(JSON.parse(JSON.stringify(s)),{accept:false});assert.equal(s.actionTurns.index,1);assert.equal(s.current,'US');
// Mandatory researched card in the parent is not offered early or discarded by
// an active ability while the free asset resolves; restore it after completion.
s=keep(applyAction(fixture(),buy));s.flow.extraQueue=[{source:'ability',name:'测试指定出牌',cardId:trade,required:true}];s=use(s,weapon);assert.ok(requiredGrowthCards(s).includes(trade));s=step(s,{region:'M'});assert.equal(s.flow.extraCard.cardId,trade);assert.equal(s.actionTurns.index,0);assert.throws(()=>applyAction(s,{type:'endAction'}),/指定牌/);s=applyAction(s,{type:'playBasicCard',cardId:trade,transactions:[]});assert.equal(s.actionTurns.index,1);
// An optional extra play already queued by the parent is restored too.
s=keep(applyAction(fixture(),buy));s.flow.extraQueue=[{source:'ability',name:'原卡后续出牌',required:false}];
s=use(s,weapon);s=step(s,{region:'M'});assert.equal(s.flow.extraCard.name,'原卡后续出牌');assert.equal(s.actionTurns.index,0);s=applyAction(s,{type:'endAction'});assert.equal(s.actionTurns.index,1);
// Real room commands: retries after reload cannot draw again or double score.
const identity={user:'battlefield-owner',token:'owner'};let room=newRoom('BATL34',identity,cards,{});room.status='playing';room.state=fixture();
const purchase={id:'buy-once',op:'action',gameRevision:room.gameRevision,action:buy};room=changeRoom(room,identity,purchase,cards);const bought=JSON.stringify(room);room=changeRoom(JSON.parse(bought),identity,purchase,cards);assert.equal(JSON.stringify(room),bought);
const choice={id:'keep-once',op:'action',gameRevision:room.gameRevision,action:{type:'finishGrowthAbility',cards:[room.state.flow.pendingGrowth.candidates[0]]}};room=changeRoom(room,identity,choice,cards);const saved=JSON.stringify(room);room=changeRoom(JSON.parse(saved),identity,choice,cards);assert.equal(JSON.stringify(room),saved);
console.log('Battlefield advantage passed: immediate purchase in rounds 1/3/4/6, boxed stock/old saves, private persisted choice, printed points once, existing/new free asset, own costs, no cover, nested sequence resumption, bonus play/decline, foreign response, required-card protection, parent extra play and room retries.');
