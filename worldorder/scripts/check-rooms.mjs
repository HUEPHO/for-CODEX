import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {newRoom,changeRoom,roomView,seatFor,playerView} from '../server/rooms.js';
import {roomApi} from '../server/index.js';
import {roomActor} from '../dist/room-rules.js';
import {newFlow,aftermathSteps} from '../dist/flow.js';
import {renderRoomFlow} from '../dist/room-ui.js';
import {RoomClient} from '../dist/room-client.js';
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
const byId=Object.fromEntries(cards.map(c=>[c.id,c]));
const ids=['US','CN','EU','RU'];
const clients=Object.fromEntries(ids.map(seat=>[seat,{user:'same-account',token:'token-'+seat}]));
let serial=0,room=newRoom('ABC234',clients.US,cards,{dd:true,wit:true});
function command(op,extra={}){return {id:String(++serial),op,gameRevision:room.gameRevision,...extra};}
function act(seat,action){room=changeRoom(room,clients[seat],command('action',{action,seatRevision:room.seatRevisions[seat]}),cards);}
assert.throws(()=>changeRoom(room,clients.US,command('start'),cards),/全部入座/);
for(const seat of ids.slice(1))room=changeRoom(room,clients[seat],command('join',{seat}),cards);
assert.throws(()=>changeRoom(room,{user:'same-account',token:'fifth'},command('join',{seat:'CN'}),cards),/已有人/);
room=changeRoom(room,clients.US,command('start'),cards);
const before=room.gameRevision;
for(const seat of ids){
 const draft=command('action',{action:{type:'selectAssetDiscard',id:room.state.players[seat].assetChoices[0].id},gameRevision:before,seatRevision:0});
 room=changeRoom(room,clients[seat],draft,cards); // Parallel setup is per-seat, not last-write-wins.
 const after=JSON.stringify(room);room=changeRoom(room,clients[seat],draft,cards);assert.equal(JSON.stringify(room),after);
}
for(const seat of ids){
 const p=room.state.players[seat];
 act(seat,{type:'selectObjectiveDiscard',id:p.objectiveChoices[0]});
 act(seat,{type:'chooseAssets'});
}
assert.ok(room.state.flow);assert.equal(room.state.current,roomActor(room.state));
for(const seat of ids){
 const view=roomView(room,clients[seat]);assert.equal(view.seat,seat);assert.equal(view.state.current,seat);
 assert.ok(renderRoomFlow(view.state,byId));
 assert.deepEqual(view.state.players[seat].hand,room.state.players[seat].hand);
 assert.ok(view.state.players[seat].deck.every(id=>id===null));
 for(const other of ids.filter(id=>id!==seat)){
  assert.ok(view.state.players[other].hand.every(id=>id===null));
  assert.deepEqual(view.state.players[other].assets,room.state.players[other].assets);
  assert.ok(view.state.players[other].objectives.every(id=>id===null));
 }
 assert.ok(!JSON.stringify(view).includes('token-'));
}
const actor=roomActor(room.state),wrong=ids.find(id=>id!==actor),initialMoney=room.state.players[actor].money;
assert.throws(()=>act(actor,{type:'endAction'}),/请先出牌/);
assert.throws(()=>act(wrong,{type:'resource',key:'money',delta:1}),/正在等待/);
assert.throws(()=>act(actor,{type:'switch',player:wrong}),/固定操作/);
assert.throws(()=>act(actor,{type:'region',region:'E',player:wrong,kind:'armies',delta:1}),/本方驻军/);
const stale=command('action',{action:{type:'resource',key:'money',delta:1}});
act(actor,{type:'passTurn',cardId:room.state.players[actor].hand[0]});
assert.equal(room.state.players[actor].money,initialMoney+10);assert.equal(room.state.actionTurns.index,1);
assert.throws(()=>changeRoom(room,clients[actor],stale,cards),/局面已更新/);
assert.equal(roomView(room,clients[actor]).canUndo,true);
room=changeRoom(room,clients[actor],command('undo'),cards);
assert.equal(room.state.actionTurns.index,0);assert.equal(room.state.players[actor].money,initialMoney);
// Responder ownership interrupts the usual action order without changing any tab's seat.
room.state.flow.cardResolution={owner:actor,responder:wrong,round:1,turnIndex:0,cardId:'test',index:0,steps:[{type:'response',player:wrong,upToMoney:10}],context:{}};
room.state.current=wrong;
assert.equal(roomActor(room.state),wrong);
assert.throws(()=>act(actor,{type:'resolveSequenceStep',accept:false}),/正在等待/);
// A real response effect continues through the existing engine using a supported asset.
delete room.state.flow.cardResolution;room.state.current=actor;
const original=structuredClone(room.state);
original.flow.cardResolution={owner:actor,index:0,steps:[{type:'copyAbility'}],context:{inspectedPlayer:wrong}};
assert.deepEqual(playerView(original,actor).players[wrong].hand,original.players[wrong].hand);
assert.ok(playerView(original,ids.find(id=>![actor,wrong].includes(id))).players[wrong].hand.every(id=>id===null));
original.flow.cardResolution.steps=[{type:'effect',card:{countrySearchRegion:'E'}}];
assert.deepEqual(playerView(original,actor).regions.E.countryPiles,original.regions.E.countryPiles);
for(const phase of ['events','countries','production','roundEnd']){const s=structuredClone(room.state);delete s.eventVersion;delete s.eventBoard;s.flow.step=phase;assert.equal(roomActor(s),s.flow.order[0]);}
for(const phase of ['research','focus','order']){const s=structuredClone(room.state);s.flow.step=phase;s.flow.index=2;s.flow.checks=['a','b'];s.flow.draft={queue:ids};assert.equal(roomActor(s),phase==='order'?'EU':s.flow.order[2]);}
for(const [step,key] of [['投资回报','investmentDone'],['繁荣提升','prosperityDone'],['威胁结算','threatDone']]){const s=structuredClone(room.state);s.flow.step='aftermath';s.flow.checks=aftermathSteps(s).slice(0,aftermathSteps(s).indexOf(step));s.flow[key]=s.flow.order.slice(0,2);assert.equal(roomActor(s),s.flow.order[2]);}
// A complete BRICS card crosses from Russia's tab to China's and then resumes.
room.state.current='RU';room.state.flow=newFlow(['RU','US','CN','EU']);room.state.initialOrder=['RU','US','CN','EU'];room.state.actionTurns={index:0,completed:{US:0,CN:0,EU:0,RU:0}};
room.state.players.RU.assets=['c22451cc98803'];room.state.players.RU.money=100;
const cover=room.state.players.RU.hand[0];
act('RU',{type:'startSequenceCard',cardId:'c22451cc98803',cover});
assert.ok(!roomView(room,clients.US).state.flow.turnCards.includes(cover));
act('RU',{type:'resolveSequenceStep',regions:['M','A']});
act('RU',{type:'resolveSequenceStep',region:'M',slot:'temporary'});
act('RU',{type:'resolveSequenceStep',region:'A',slot:'temporary'});
assert.equal(roomActor(room.state),'CN');
for(const seat of ids){const view=roomView(room,clients[seat]);assert.equal(view.state.current,seat);assert.ok(renderRoomFlow(view.state,byId));}
assert.match(renderRoomFlow(roomView(room,clients.RU).state,byId),/等待玩家回应/);
assert.throws(()=>act('RU',{type:'resolveSequenceStep',accept:false}),/正在等待/);
act('CN',{type:'resolveSequenceStep',accept:false});
assert.equal(room.state.actionTurns.completed.RU,1);assert.equal(room.state.actionTurns.completed.CN,0);assert.equal(roomActor(room.state),'US');
const old=clients.CN;room=changeRoom(room,{user:old.user,token:'replacement'},command('join',{seat:'CN',takeover:true}),cards);assert.equal(seatFor(room,old),null);
assert.throws(()=>changeRoom(room,{user:'other-account',token:'intruder'},command('join',{seat:'CN',takeover:true}),cards),/已有人/);
console.log('Room rules: four independent seats, simultaneous private setup, fixed views, turn/response authority, privacy exceptions, stale actions, idempotency, undo and seat recovery passed.');

// Real SQLite runs the production prepared statements and its conditional writes.
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../drizzle/0000_nebulous_mercury.sql',import.meta.url),'utf8'));
const db={prepare(sql){return {bind(...values){const statement=sqlite.prepare(sql);return {
 async first(){await Promise.resolve();return statement.get(...values)||null;},
 async all(){await Promise.resolve();return {results:statement.all(...values)};},
 async run(){await Promise.resolve();return {meta:{changes:Number(statement.run(...values).changes)}};}
 };}};}};
const tokens=ids.map(()=>crypto.randomUUID());
async function api(i,path,body){const request=new Request('https://world-order.test/api/rooms'+path,{method:body?'POST':'GET',headers:{'oai-authenticated-user-id':'owner','X-Room-Token':tokens[i],...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const result=await roomApi(request,{DB:db},cards);return {status:result.status,...await result.json()};}
const create={code:'TEST23',config:{dd:false,wit:false}};
assert.equal((await api(0,'',create)).status,201);assert.equal((await api(0,'',create)).room.code,'TEST23');
const joined=await Promise.all(ids.slice(1).map((seat,i)=>api(i+1,'/TEST23',{op:'join',seat,id:'join-'+seat})));
assert.ok(joined.every(r=>r.status===200));
let latest=(await api(0,'/TEST23')).room;assert.ok(ids.every(id=>latest.seats[id].occupied));
assert.equal((await api(1,'/TEST23',{op:'start',id:'not-host'})).status,403);
latest=(await api(0,'/TEST23',{op:'start',id:'start'})).room;
const drafts=await Promise.all(ids.map((_,i)=>api(i,'/TEST23')));
const choices=await Promise.all(ids.map((seat,i)=>api(i,'/TEST23',{op:'action',id:'draft-'+seat,gameRevision:latest.gameRevision,seatRevision:0,action:{type:'selectAssetDiscard',id:drafts[i].room.state.players[seat].assetChoices[0].id}})));
assert.ok(choices.every(r=>r.status===200));
const stored=JSON.parse(sqlite.prepare('SELECT data FROM rooms WHERE code = ?').get('TEST23').data);
assert.ok(ids.every(id=>stored.state.players[id].hand.length===6));
const competing=await Promise.all([0,0].map((i,n)=>api(i,'/TEST23',{op:'action',id:'select-'+n,seatRevision:1,action:{type:'selectAssetDiscard',id:stored.state.players.US.assetChoices[n].id}})));
assert.deepEqual(competing.map(r=>r.status).sort(),[200,409]);
assert.equal((await api(0,'/ZZZZZZ')).status,404);
const anonymous=await roomApi(new Request('https://world-order.test/api/rooms'),{DB:db},cards);assert.equal(anonymous.status,401);
assert.equal((await api(0,'')).rooms.length,1);
// Exercise the shipped async client against the same API, without a browser or
// a second implementation of the room protocol.
const originalGlobals=Object.fromEntries(['window','document','location','fetch','BroadcastChannel'].map(key=>[key,globalThis[key]]));
globalThis.window={addEventListener(){},history:{replaceState(){}}};
globalThis.document={addEventListener(){},hidden:false};
globalThis.location={href:'https://world-order.test/'};globalThis.BroadcastChannel=undefined;
globalThis.fetch=(url,options={})=>roomApi(new Request(new URL(url,location.href),{...options,headers:{...options.headers,'oai-authenticated-user-id':'owner'}}),{DB:db},cards);
const tabs=[];
try{
 for(const i of [0,1,2,3,2]){
  const tab=new RoomClient({onChange(){},onStatus(){}});tab.token=tokens[i];tabs.push(tab);
  await tab.connect('TEST23');assert.equal(tab.room.seat,ids[i]);assert.equal(tab.room.state.current,ids[i]);
 }
 const p=tabs[0].room.state.players.US,target=p.assetChoices.find(c=>!p.assetSelection.length||p.assetSelection.includes(c.id)).id;
 await tabs[0].send('action',{action:{type:'selectAssetDiscard',id:target}});
 for(const tab of tabs)await tab.sync();
 assert.equal(tabs[0].room.state.players.US.assetSelection.length,2);
 for(let i=0;i<4;i++){assert.equal(tabs[i].room.state.current,ids[i]);assert.equal(tabs[i].room.gameRevision,tabs[0].room.gameRevision);}
 // Time alone may expire an automatic rollback checkpoint. Same-revision
 // polling must deliver availability/reason updates without fabricating a
 // game mutation; an unchanged following poll should remain quiet.
 const deliveries=[],expiryTab=new RoomClient({onChange:view=>deliveries.push(view),onStatus(){}});tabs.push(expiryTab);
 const fresh={...tabs[0].room,canUndo:true,rollback:{step:{available:true,reason:null},phase:{available:true,reason:null},turn:{available:false,reason:'未处于行动阶段'}}};
 expiryTab.accept(fresh);
 const expired={...fresh,canUndo:false,rollback:{...fresh.rollback,step:{available:false,reason:'自动快照已过期'},phase:{available:false,reason:'自动快照已过期'}}};
 expiryTab.accept(expired);
 assert.equal(deliveries.length,2);assert.equal(deliveries[1].gameRevision,fresh.gameRevision);assert.equal(deliveries[1].rollback.step.available,false);
 expiryTab.accept(structuredClone(expired));assert.equal(deliveries.length,2);
}finally{
 for(const tab of tabs){clearTimeout(tab.timer);tab.room=null;}
 for(const [key,value] of Object.entries(originalGlobals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
}
sqlite.close();
console.log('Room API + SQLite + shipped clients: authentication, durable creation, concurrent joins/drafts, collisions, four fixed views, refresh and synchronization passed.');
