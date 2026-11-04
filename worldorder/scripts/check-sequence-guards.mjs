import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState,applyAction} from '../dist/engine.js';
import {newFlow} from '../dist/flow.js';
import {ACTION_CARDS} from '../dist/basic-actions.js';
import {sequenceStep,sequenceCard} from '../dist/card-sequence.js';
import {renderSequenceStart,renderSequencePanel,renderSequenceReport} from '../dist/card-sequence-ui.js';
import {renderFlow} from '../dist/flow-ui.js';
import {newRoom,changeRoom,playerView} from '../server/rooms.js';
import {roomActor} from '../dist/room-rules.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url))),byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const powers=['US','CN','EU','RU'],cover='cf9aa23c4a315';
const id=name=>Object.keys(ACTION_CARDS).find(id=>ACTION_CARDS[id].name===name&&!ACTION_CARDS[id].source);
const restore=s=>JSON.parse(JSON.stringify(s));
function ready(cardId){
 const owner=ACTION_CARDS[cardId].owner||'US',s=createState(cards,{dd:true,wit:true},()=>0.5);
 for(const p of Object.values(s.players)){p.openingChoices=p.assetChoices=p.objectiveChoices=null;p.money=100;p.resources=Array(7).fill(8);p.smart=0;}
 s.current=owner;s.flow=newFlow([owner,...powers.filter(x=>x!==owner)]);s.actionTurns={index:0,completed:Object.fromEntries(powers.map(x=>[x,0]))};
 s.players[owner].hand=[cover,...(ACTION_CARDS[cardId].source?[]:[cardId])];if(ACTION_CARDS[cardId].source)s.players[owner].assets=[cardId];return s;
}
const start=(s,cardId)=>applyAction(s,{type:'startSequenceCard',cardId,cover});
const step=(s,a)=>applyAction(s,{type:'resolveSequenceStep',...a});
const receipt=(s,owner)=>s.flow.sequenceReports[owner];
function banned(s,cardId,reason){const before=JSON.stringify(s);assert.throws(()=>start(s,cardId),reason);assert.equal(JSON.stringify(s),before);const html=renderSequenceStart(s,cardId,byId);assert.match(html,/禁止打出/);assert.match(html,/<button[^>]*disabled/);assert.throws(()=>applyAction(s,{type:ACTION_CARDS[cardId].source?'asset':'play',id:cardId}),/不能打出/);assert.equal(JSON.stringify(s),before);}

// The latest user ruling rejects the entire card, even before an automatic draw.
let s=ready(id('周密计划'));s.players.US.resources[6]=0;s.players.US.deck=['c4813f7351d34'];banned(s,id('周密计划'),/待命/);
s=ready(id('重审协议'));banned(s,id('重审协议'),/临时影响力/);
for(const full of [true,false]){s=ready('c06283f0fe2f0');s.players.CN.prosperity=full?5:2;s.players.CN.resources[3]=full?10:0;banned(s,'c06283f0fe2f0',/北京共识/);}
for(const [armies,money] of [[1,100],[2,5],[0,100],[2,0]]){s=ready('c75585a29d3f6');s.players.US.resources[6]=armies;s.players.US.money=money;banned(s,'c75585a29d3f6',/禁止不足额/);}
s=ready('ca58c2d75ac35');s.players.US.resources[6]=1;banned(s,'ca58c2d75ac35',/禁止不足额/);
s=ready('c505b0ec5fbae');s.players.CN.money=20;banned(s,'c505b0ec5fbae',/资金需要30/);
s=ready('c9cdadd802619');s.players.US.resources[6]=1;banned(s,'c9cdadd802619',/待命军队需要2/);
s=ready('c78120c3201e6');banned(s,'c78120c3201e6',/临时影响力/);
s=ready('c4ec4c6092f1b');banned(s,'c4ec4c6092f1b',/非初始/);

// Full execution remains legal; a short submission cannot spend or move anything.
s=ready('c75585a29d3f6');s.players.US.resources[6]=2;s=start(s,'c75585a29d3f6');s=step(s,{region:'C'});
let before=JSON.stringify(s);assert.throws(()=>step(s,{moves:[{from:'reserve',to:'C'}]}),/至少/);assert.equal(JSON.stringify(s),before);
s=step(s,{moves:[{from:'reserve',to:'C'},{from:'reserve',to:'C'}]});s=step(restore(s),{region:'C',slot:'permanent'});assert.equal(s.players.US.money,90);assert.equal(s.players.US.resources[5],10);assert.equal(s.current,'CN');
assert.equal(receipt(s,'US').status,'completed');assert.ok(receipt(s,'US').history.some(x=>x.changes.some(c=>c.items.some(i=>i.label==='资金'&&i.delta===-10))));

// Navy rejects an unaffordable second region before committing that selection.
s=ready('ca58c2d75ac35');s.players.US.resources[6]=2;s.players.US.money=30;s=start(s,'ca58c2d75ac35');before=JSON.stringify(s);
assert.throws(()=>step(s,{regions:['E','N']}),/资金不足/);assert.equal(JSON.stringify(s),before);
s=step(s,{regions:['E']});s=step(s,{moves:[{from:'reserve',to:'E'},{from:'reserve',to:'E'}]});s=step(restore(s),{region:'E',slot:'temporary'});assert.equal(s.players.US.money,10);assert.equal(s.current,'CN');

// Voluntary extra play is still allowed, including old saves with required=true.
s=ready(id('探索新方案'));s.players.US.deck=['c4813f7351d34'];s=start(s,id('探索新方案'));assert.equal(s.flow.extraCard.required,false);s.flow.extraCard.required=true;
assert.match(renderFlow(s,byId),/结束本次行动/);s=applyAction(restore(s),{type:'endAction'});assert.equal(s.current,'CN');assert.equal(s.players.US.money,100);

// Normal draw + action survives refresh and is journaled without hidden card IDs.
s=ready(id('周密计划'));s.players.US.deck=['c4813f7351d34'];s=start(s,id('周密计划'));assert.equal(sequenceCard(s).effect,'base');
const view=playerView(s,'CN');assert.ok(view.players.US.hand.every(x=>x===null));assert.ok(!JSON.stringify(view.flow.cardResolution.history).includes('c4813f7351d34'));
s=step(restore(s),{country:'c5bc763998f23',send:1,slot:'temporary'});assert.equal(s.players.US.money,90);assert.equal(s.players.US.deck.length,0);assert.match(renderSequenceReport({...s,current:'US'}),/已结算/);

// Manual fallback preserves the already issued gain and a durable remaining list.
s=ready('c8a402f5325e9');s=start(s,'c8a402f5325e9');assert.equal(s.players.EU.money,120);s=applyAction(s,{type:'manualSequence'});
assert.equal(receipt(s,'EU').status,'manual');assert.equal(receipt(s,'EU').remaining[0].type,'effect');assert.match(renderSequenceReport(restore(s)),/尚未自动结算/);
assert.equal(receipt(s,'EU').history.find(x=>x.title==='领取牌面收益').changes[0].items.find(x=>x.label==='资金').delta,20);
// Legacy saves are not given invented receipts or reissued rewards.
s=ready(id('周密计划'));s=start(s,id('周密计划'));delete s.flow.cardResolution.history;s=applyAction(restore(s),{type:'manualSequence'});assert.equal(receipt(s,'US').history[0].status,'legacy');

// Room commands: no mutation on a forbidden start, named responder only,
// persistence, deduplicated payment, and stale command rejection.
const clients=Object.fromEntries(powers.map(x=>[x,{user:'guard-check',token:'guard-'+x}]));let room=newRoom('GRD234',clients.US,cards,{dd:true,wit:true}),serial=0;
const command=(op,extra={})=>({id:String(++serial),op,gameRevision:room.gameRevision,...extra});
for(const seat of powers.slice(1))room=changeRoom(room,clients[seat],command('join',{seat}),cards);room=changeRoom(room,clients.US,command('start'),cards);
room.state=ready('c505b0ec5fbae');room.state.players.CN.money=20;before=JSON.stringify(room);
assert.throws(()=>changeRoom(room,clients.CN,command('action',{action:{type:'startSequenceCard',cardId:'c505b0ec5fbae',cover}}),cards),/不能打出/);assert.equal(JSON.stringify(room),before);
room.state.players.CN.money=100;
const act=(seat,action)=>{const cmd=command('action',{action});room=changeRoom(room,clients[seat],cmd,cards);return cmd;};
act('CN',{type:'startSequenceCard',cardId:'c505b0ec5fbae',cover});
const paidCommand=act('CN',{type:'resolveSequenceStep',regions:['M','A']});assert.equal(room.state.players.CN.money,70);
const paidState=JSON.stringify(room);room=changeRoom(restore(room),clients.CN,paidCommand,cards);assert.equal(JSON.stringify(room),paidState);
const stale=command('action',{action:{type:'resolveSequenceStep',region:'A',slot:'temporary'}});
act('CN',{type:'resolveSequenceStep',region:'M',slot:'temporary'});room=restore(room);assert.throws(()=>changeRoom(room,clients.CN,stale,cards),/更新/);
act('CN',{type:'resolveSequenceStep',region:'A',slot:'temporary'});assert.equal(roomActor(room.state),'RU');
assert.throws(()=>act('CN',{type:'resolveSequenceStep',accept:false}),/等待/);assert.throws(()=>act('RU',{type:'manualSequence'}),/回应/);
act('RU',{type:'resolveSequenceStep',accept:true,region:'S',slot:'temporary'});assert.equal(room.state.players.CN.money,70);assert.equal(room.state.players.RU.money,80);assert.equal(room.state.actionTurns.index,1);assert.equal(receipt(room.state,'CN').status,'completed');
console.log('Passed whole-card guards, immutable rejection, full military payments/rewards, voluntary extra play, saved receipts/manual remainder, legacy saves, room response authority, deduplication and hidden-hand privacy.');
