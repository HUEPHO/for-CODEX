import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {ABILITY_TYPES} from '../dist/ability-types.js';
import {resourceEfficiencyPreview} from '../dist/growth-resource.js';
import {growthAbilityPreview} from '../dist/growth-active.js';
import {renderGrowthPending} from '../dist/growth-active-ui.js';
import {newRoom,changeRoom,playerView} from '../server/rooms.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
const efficiency='c142f2edba533',domestic='cf9aa23c4a315',trade='c89c153d80dbd',strategy='c09eff717eed0';
function fixture(){
 const s=createState(cards,{dd:true,wit:true});s.growth=cards.filter(c=>c.type==='growth').map(c=>c.id);for(const p of Object.values(s.players))p.openingChoices=p.assetChoices=p.objectiveChoices=null;
 s.round=3;s.current='US';s.flow=newFlow(['US','CN','EU','RU'],3);s.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};
 Object.assign(s.players.US,{growth:['c74931cfb3833','c0ec0ed27c8bf'],hand:[domestic,trade],deck:[strategy],discard:[],resources:[2,2,1,9,5,9,0],money:100});return s;
}
const faceIds=cards.filter(c=>['starter','ability'].includes(c.type)).map(c=>c.id);
assert.equal(faceIds.length,122);assert.deepEqual(Object.keys(ABILITY_TYPES).sort(),faceIds.sort());
assert.deepEqual(resourceEfficiencyPreview('c005fe582851b'),[{key:5,amount:4}]);
assert.deepEqual(resourceEfficiencyPreview('c42bce4822a20'),[{key:3,amount:2}]);
assert.deepEqual(resourceEfficiencyPreview('c1572d344b120'),[{key:5,amount:2},{key:3,amount:1}]);
assert.deepEqual(resourceEfficiencyPreview('cc5811cf03bcd'),[{key:5,amount:2},{key:6,amount:1}]);
assert.throws(()=>resourceEfficiencyPreview(strategy),/两种/);
assert.throws(()=>resourceEfficiencyPreview(strategy,['military','military']),/两种/);
assert.deepEqual(resourceEfficiencyPreview(strategy,['economic','military']),[{key:3,amount:1},{key:6,amount:1}]);

let s=fixture();const purchase={type:'playBasicCard',cardId:domestic,domestic:'growth',growthId:efficiency,primary:[2,2,1]};
for(const primary of [undefined,[],[2,2,0],[3,1,1],[2,2,-1],[1.5,2.5,1],{0:2,1:2,2:1}]){
 const before=JSON.stringify(s);assert.throws(()=>applyAction(s,{...purchase,primary}),/支付合计5份/);assert.equal(JSON.stringify(s),before);
}
let n=applyAction(s,purchase);assert.deepEqual(n.players.US.resources.slice(0,3),[0,0,0]);assert.equal(n.players.US.resources[4],2);assert.equal(n.players.US.vp,3);assert.equal(n.current,'CN');assert.ok(n.players.US.played.includes(domestic));
s=fixture();s.players.US.growth.push(efficiency);
for(const step of ['focus','research','events','aftermath','roundEnd']){s.flow.step=step;assert.throws(()=>growthAbilityPreview(s,efficiency),/仅能在行动/);}
s.flow.step='actions';s.round=s.flow.round=2;assert.throws(()=>growthAbilityPreview(s,efficiency),/第3轮/);s.round=s.flow.round=3;
n=applyAction(s,{type:'useGrowthAbility',cardId:efficiency});assert.equal(n.flow.pendingGrowth.choose,1);assert.deepEqual(n.flow.pendingGrowth.drawn,[strategy]);assert.equal(n.actionTurns.index,0);
assert.throws(()=>applyAction(n,{type:'endAction'}),/先完成/);assert.throws(()=>applyAction(n,{type:'finishGrowthAbility',cards:[strategy]}),/两种/);
const hidden=playerView(n,'CN');assert.deepEqual(hidden.flow.pendingGrowth,{owner:'US'});assert.ok(!hidden.players.US.hand.includes(strategy));assert.ok(renderGrowthPending(playerView(n,'US'),Object.fromEntries(cards.map(c=>[c.id,c]))).includes('战略再评估'));
assert.match(renderGrowthPending(hidden,{}),/等待对方/);
n=JSON.parse(JSON.stringify(n));n=applyAction(n,{type:'finishGrowthAbility',cards:[strategy],rewardTypes:['economic','military']});assert.equal(n.players.US.resources[3],10);assert.equal(n.players.US.resources[6],1);assert.equal(n.players.US.money,100);assert.equal(n.players.US.discard.at(-1),strategy);assert.equal(n.flow.pendingGrowth,null);assert.equal(n.actionTurns.index,0);
assert.throws(()=>applyAction(n,{type:'finishGrowthAbility',cards:[strategy],rewardTypes:['economic','military']}));assert.throws(()=>applyAction(n,{type:'useGrowthAbility',cardId:efficiency}),/已经使用/);
// Printed duplicates, mixed types, all four types, and resource overflow.
for(const [cardId,delta,money] of [['c005fe582851b',[0,0,0,0,0,1,0],0],['c42bce4822a20',[0,0,0,1,0,0,0],10],['cc5811cf03bcd',[0,0,0,0,0,1,1],0],[domestic,[0,0,0,0,1,0,0],0]]){
 s=fixture();s.players.US.growth.push(efficiency);s.players.US.hand=[cardId];const initial=[...s.players.US.resources];
 n=applyAction(s,{type:'useGrowthAbility',cardId:efficiency});n=applyAction(n,{type:'finishGrowthAbility',cards:[cardId]});assert.deepEqual(n.players.US.resources,initial.map((v,k)=>v+delta[k]));assert.equal(n.players.US.money,100+money);
}
s=fixture();s.players.US.growth.push(efficiency);s.players.US.deck=[];s.players.US.discard=[trade];n=applyAction(s,{type:'useGrowthAbility',cardId:efficiency});assert.deepEqual(n.flow.pendingGrowth.drawn,[trade]);assert.deepEqual(n.players.US.discard,[]);
s.players.US.discard=[];const before=JSON.stringify(s);assert.throws(()=>applyAction(s,{type:'useGrowthAbility',cardId:efficiency}),/无法抽牌/);assert.equal(JSON.stringify(s),before);
s=fixture();s.players.US.growth.push(efficiency);s.flow.extraCard={owner:'US',cardId:domestic};n=applyAction(s,{type:'useGrowthAbility',cardId:efficiency});assert.throws(()=>applyAction(n,{type:'finishGrowthAbility',cards:[domestic]}),/必须保留/);
// Real room handler: valid owner, opaque choices, stable serialized pending state and idempotent command.
const identity={user:'dd-choice-owner',token:'owner'};let room=newRoom('DCHO33',identity,cards,{});room.status='playing';room.state=fixture();room.state.players.US.growth.push(efficiency);
const start={id:'draw-once',op:'action',gameRevision:room.gameRevision,action:{type:'useGrowthAbility',cardId:efficiency}};
room=changeRoom(room,identity,start,cards);room=JSON.parse(JSON.stringify(room));const started=JSON.stringify(room);room=changeRoom(room,identity,start,cards);assert.equal(JSON.stringify(room),started);
const finish={id:'reward-once',op:'action',gameRevision:room.gameRevision,action:{type:'finishGrowthAbility',cards:[strategy],rewardTypes:['economic','military']}};
room=changeRoom(room,identity,finish,cards);const finished=JSON.stringify(room);room=changeRoom(room,identity,finish,cards);assert.equal(JSON.stringify(room),finished);assert.equal(room.state.players.US.resources[6],1);
console.log('D&D growth choices passed: 122 printed type faces, primary payment rollback, action timing, draw/reshuffle, private persisted choice, duplicate/mixed type rewards, caps, required-card protection and room retry.');

const cooperation='cfeb2319d6850',ally='cb427f6dd4283';
s=fixture();s.players.US.growth=['c74931cfb3833'];n=applyAction(s,{...purchase,growthId:cooperation,primary:undefined});assert.equal(n.players.US.vp,3);assert.equal(n.players.US.resources[4],3);assert.equal(n.players.US.resources[5],8);
s=fixture();s.players.US.growth=[cooperation];s.players.US.deck=[domestic,trade,strategy];s.players.US.hand=[];
n=applyAction(s,{type:'useGrowthAbility',cardId:cooperation,ally});assert.deepEqual(n.players.US.hand,[]);assert.deepEqual(n.flow.pendingGrowth.inspected,[domestic,trade]);assert.deepEqual(n.players.US.deck,[strategy]);assert.ok(n.players.US.exhaustedAllies.includes(ally));assert.deepEqual(playerView(n,'CN').flow.pendingGrowth,{owner:'US'});
let viewed=JSON.parse(JSON.stringify(n));const unselected=JSON.stringify(viewed);
for(const topOrder of [[],[domestic,domestic],[strategy]])assert.throws(()=>applyAction(viewed,{type:'finishGrowthAbility',cards:[trade],topOrder}),/排列/);
assert.equal(JSON.stringify(viewed),unselected);n=applyAction(viewed,{type:'finishGrowthAbility',cards:[trade],topOrder:[domestic]});assert.deepEqual(n.players.US.hand,[trade]);assert.deepEqual(n.players.US.deck,[domestic,strategy]);assert.equal(n.actionTurns.index,0);assert.throws(()=>applyAction(n,{type:'useGrowthAbility',cardId:cooperation,ally}),/已经使用/);
// No cards are ever inspected from the hand/played zone. Existing deck comes
// first, then discarded cards are shuffled to fill as many slots as possible.
s=fixture();s.players.US.growth=[cooperation];s.players.US.deck=[domestic];s.players.US.discard=[trade];s.players.US.hand=[strategy];s.players.US.played=['c005fe582851b'];
n=applyAction(s,{type:'useGrowthAbility',cardId:cooperation,ally});assert.deepEqual(n.flow.pendingGrowth.inspected,[domestic,trade]);assert.deepEqual(n.players.US.hand,[strategy]);assert.deepEqual(n.players.US.played,['c005fe582851b']);assert.deepEqual(n.players.US.discard,[]);
s.players.US.deck=[];n=applyAction(s,{type:'useGrowthAbility',cardId:cooperation,ally});assert.deepEqual(n.flow.pendingGrowth.inspected,[trade]);n=applyAction(n,{type:'finishGrowthAbility',cards:[trade],topOrder:[]});assert.deepEqual(n.players.US.hand,[strategy,trade]);
s.players.US.discard=[];assert.throws(()=>applyAction(s,{type:'useGrowthAbility',cardId:cooperation,ally}),/至少有1张/);assert.equal(s.players.US.growthUsed?.[cooperation],undefined);assert.ok(!s.players.US.exhaustedAllies?.includes(ally));
s=fixture();s.players.US.growth=[cooperation];s.players.US.exhaustedAllies=[ally];assert.throws(()=>applyAction(s,{type:'useGrowthAbility',cardId:cooperation,ally}),/未横置/);
for(const step of ['research','focus','events','aftermath']){s.flow.step=step;assert.throws(()=>growthAbilityPreview(s,cooperation),/仅能在行动/);}
// Three inspected cards exercise real reordering, not only the two-card case.
const highAlly=cards.find(c=>c.type==='country'&&c.notes.split('-').at(-2)==='3')?.id;
assert.ok(highAlly);s=fixture();s.players.US.growth=[cooperation];s.players.US.allies=[highAlly];s.players.US.hand=[];s.players.US.deck=[domestic,trade,strategy,'c005fe582851b'];
n=applyAction(s,{type:'useGrowthAbility',cardId:cooperation,ally:highAlly});assert.equal(n.flow.pendingGrowth.inspected.length,3);n=applyAction(n,{type:'finishGrowthAbility',cards:[domestic],topOrder:[strategy,trade]});assert.deepEqual(n.players.US.deck,[strategy,trade,'c005fe582851b']);
console.log('Allied cooperation passed: printed purchase cost, ready ally, private inspected zone, deck/discard shortfall ruling, exact reorder validation, persistence, once-per-round and action-only timing.');
