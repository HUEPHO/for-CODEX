import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createState} from '../dist/engine.js';
import {applyDebugAction} from '../dist/debug-mode.js';
import {debugCardCatalog} from '../dist/debug-card-catalog.js';
import {validateProduction,producePrimary} from '../dist/economy.js';
import {newRoom,changeRoom,roomView} from '../server/rooms.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url),'utf8'));
const seats=['US','CN','EU','RU'],identities=Object.fromEntries(seats.map(id=>[id,{user:'debug-check',token:id}]));
const starter=cards.find(c=>c.type==='starter'&&c.owner==='CN'),ability=cards.find(c=>c.type==='ability'&&c.module==='dd'),asset=cards.find(c=>c.type==='asset'&&c.owner==='RU');
let s=createState(cards,{dd:false,wit:false},()=>.5);
const before=JSON.stringify(s),turn=s.current;
const catalog=debugCardCatalog(cards),market=catalog.filter(c=>c.type==='ability');
assert.ok(!catalog.some(c=>c.type==='starter'));
assert.equal(market.length,new Set(cards.filter(c=>c.type==='ability').map(c=>c.name)).size,'One entry per market card, not per physical copy');
assert.throws(()=>applyDebugAction(s,{type:'addCard',player:'US',cardId:starter.id},cards),/请选择/);
s=applyDebugAction(s,{type:'addCard',player:'US',cardId:ability.id},cards);
assert.equal(s.players.US.hand.at(-1),ability.id,'Disabled expansion cards are available for debug');
s.players.US.usedAssets.push(asset.id);
s=applyDebugAction(s,{type:'addCard',player:'US',cardId:asset.id},cards);
assert.ok(s.players.US.assets.includes(asset.id));assert.ok(!s.players.US.usedAssets.includes(asset.id));
assert.throws(()=>applyDebugAction(s,{type:'addCard',player:'US',cardId:asset.id},cards),/已有/);
assert.equal(s.current,turn);assert.deepEqual(s.regions,JSON.parse(before).regions);
s=applyDebugAction(s,{type:'setValues',player:'CN',values:{money:234,smart:12,vp:-3,'resources.0':37,'resources.6':12,'production.0':9,'production.1':0}},cards);
assert.equal(s.players.CN.resources[0],37);assert.equal(s.players.CN.money,234);assert.equal(s.players.CN.production[0],9);
validateProduction(s.players.CN,'CN');producePrimary(structuredClone(s));
assert.throws(()=>validateProduction({...s.players.CN,debugProduction:false},'CN'),/生产轨/,'Ordinary games keep their production limits');
for(const action of [
 {type:'setValues',player:'CN',values:{'resources.0':-1}},
 {type:'setValues',player:'CN',values:{money:1.5}},
 {type:'setValues',player:'CN',values:{money:NaN}},
 {type:'setValues',player:'CN',values:{money:20,'resources.7':2}},
 {type:'setValues',player:'CN',values:{money:20,hand:[]}},
 {type:'addCard',player:'US',cardId:cards.find(c=>c.type==='event').id},
 {type:'addCard',player:'not-a-seat',cardId:starter.id}
]){const snapshot=JSON.stringify(s);assert.throws(()=>applyDebugAction(s,action,cards));assert.equal(JSON.stringify(s),snapshot);}
let room=newRoom('DEBUG2',identities.US,cards,{dd:true,wit:true});room.state=s;room.status='playing';room.seats=structuredClone(identities);
let serial=0;const command=action=>({id:String(++serial),op:'debug',gameRevision:room.gameRevision,action});
const action={type:'setValues',player:'RU',values:{money:98,'resources.1':20}};
assert.throws(()=>changeRoom(room,identities.CN,command(action),cards),/房主/);
assert.throws(()=>changeRoom(room,identities.US,{...command(action),gameRevision:-1},cards),/局面已更新/);
const cmd=command(action),old=JSON.stringify(room);const next=changeRoom(room,identities.US,cmd,cards);
assert.equal(JSON.stringify(room),old,'Authority reducer is atomic');room=next;
assert.equal(room.state.players.RU.money,98);assert.equal(room.state.current,turn);assert.equal(room.gameRevision,1);
assert.equal(changeRoom(room,identities.US,cmd,cards),room,'Retries do not apply twice');
assert.deepEqual(roomView(room,identities.US).state.players.RU.hand,Array(room.state.players.RU.hand.length).fill(null));
assert.equal(roomView(room,identities.RU).state.players.RU.money,98);
assert.throws(()=>changeRoom(room,identities.US,{...command(action),op:'action'},cards),'Debug does not bypass ordinary action policy');
const noSeat={...room,seats:{...room.seats,US:null}};assert.throws(()=>changeRoom(noSeat,identities.US,command(action),cards),/入座/);
console.log('Debug checks passed: all card sources, assets/reactivation, uncapped values, normal production limits, atomic validation, host/seat/revision gates, retry safety and private hands.');
