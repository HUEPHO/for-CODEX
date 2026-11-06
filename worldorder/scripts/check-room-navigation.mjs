// Node-only navigation/protocol regression. No browser, DOM driver or UI
// interaction is used; visual and live form preservation are separate checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {initialRoomScreen,resolvedRoomScreen,roomScreenUrl} from '../dist/room-navigation.js';
import {RoomClient} from '../dist/room-client.js';
import {roomApi} from '../server/index.js';

const rootUrl='https://world-order.test/';
for(const [suffix,expected] of [
 ['', 'lobby'],['?room=ABC234','game'],['?screen=lobby','lobby'],
 ['?room=ABC234&screen=room','room'],['?room=ABC234&screen=game','game'],
 ['?room=ABC234&screen=invalid','game'],['?screen=invalid','lobby'],
])assert.equal(initialRoomScreen(rootUrl+suffix),expected);
const seated={code:'ABC234',status:'playing',seat:'US',state:{}};
assert.equal(resolvedRoomScreen('lobby',seated),'lobby');
assert.equal(resolvedRoomScreen('room',seated),'room');
assert.equal(resolvedRoomScreen('game',seated),'game');
assert.equal(resolvedRoomScreen('game',{...seated,state:null,status:'lobby'}),'room');
assert.equal(resolvedRoomScreen('game',{...seated,seat:null,state:null}),'room');
assert.equal(resolvedRoomScreen('game',null),'game');
assert.equal(resolvedRoomScreen('game',null,{steam:true}),'lobby');
const original=new URL(rootUrl+'?room=ABC234&seat=CN&keep=1#reference');
for(const screen of ['lobby','room','game']){
 const changed=new URL(roomScreenUrl(original.href,screen));
 assert.equal(changed.searchParams.get('screen'),screen);
 assert.equal(changed.searchParams.get('room'),'ABC234');
 assert.equal(changed.searchParams.get('seat'),'CN');
 assert.equal(changed.searchParams.get('keep'),'1');
 assert.equal(changed.hash,'#reference');
}
assert.equal(original.searchParams.has('screen'),false);

// Execute the actual app functions in a small Node context. These tests target
// the two integration risks that the pure route module alone cannot catch:
// connect() removing the screen URL, and hidden tables resuming automatic work.
const appSource=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
function appFunction(start,next){
 const from=appSource.indexOf(start),to=appSource.indexOf(next,from);
 assert.ok(from>=0&&to>from,'App function boundaries changed: '+start);
 return appSource.slice(from,to);
}
const navigationFunctions=[
 appFunction('function resumeAutomaticFlow(){','function handCardStatus('),
 appFunction('function showRoomScreen(screen){','async function refreshRecentRooms('),
 appFunction('async function init(){','function handleFlowClick('),
].join('\n');
for(const inRoom of [false,true]){
 const activity={actions:[],renders:0,persists:0};
 const context={URL,room:null,ready:false,automaticResumePending:true,roomScreen:'lobby',
  location:{href:rootUrl+(inRoom?'?room=ABC234&screen=lobby':'')},
  state:null,POWERS:{US:{}},title:card=>card.name,
  fetch:async()=>({ok:true,json:async()=>[{id:'example',name:'Example'}]}),
  installPowerLabels(){},readLocalState:()=>({current:'US'}),registerTools(){},
  persist(){activity.persists++;},render(){activity.renders++;},
  document:{querySelectorAll:()=>[]},roomScreenUrl,
  flowActor:()=> 'US',nextAutomaticFlowAction:()=>({type:'confirmCountries'}),
  act(action){activity.actions.push(action);},
  toast(message){throw Error(message);},openRoomDialog(){throw Error('Unexpected connection failure');},
  $(){throw Error('Unexpected app error branch');},
 };
 context.currentScreen=()=>resolvedRoomScreen(context.roomScreen,context.room);
 context.window={history:{replaceState(_state,_title,url){context.location.href=String(url);}}};
 context.roomClient={isSteam:false,busy:false,status:'online',initialize:async()=>{},connect:async code=>{
  context.room={code,status:'playing',seat:'US',actor:'US',state:{current:'US'}};
  // The real RoomClient.navigate uses an invite link with its own query.
  context.location.href=rootUrl+'?room='+code;
 }};
 vm.createContext(context);vm.runInContext(navigationFunctions,context);
 await context.init();
 assert.equal(initialRoomScreen(context.location.href),'lobby','Reload must preserve the explicit hall route after connecting');
 assert.equal(activity.actions.length,0,'Loading a hall must not advance a saved local or room game');
 assert.equal(context.automaticResumePending,true,'The deferred automatic step must remain available');
 context.resumeAutomaticFlow();assert.equal(activity.actions.length,0);
 context.showRoomScreen('game');
 assert.equal(initialRoomScreen(context.location.href),'game');
 assert.equal(activity.actions.length,1,'Returning to the table must resume its pending automatic step');
 assert.equal(context.automaticResumePending,false);
 context.resumeAutomaticFlow();assert.equal(activity.actions.length,1,'Do not repeat the resumed step');
}

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
const sqlite=new DatabaseSync(':memory:');
sqlite.exec(fs.readFileSync(new URL('../drizzle/0000_nebulous_mercury.sql',import.meta.url),'utf8'));
const db={prepare(sql){return {bind(...values){const statement=sqlite.prepare(sql);return {
 async first(){return statement.get(...values)||null;},
 async all(){return {results:statement.all(...values)};},
 async run(){return {meta:{changes:Number(statement.run(...values).changes)}};},
 };}};}};
const saved=Object.fromEntries(['window','document','location','fetch','BroadcastChannel'].map(key=>[key,globalThis[key]]));
const requests=[],clients=[];
globalThis.location={href:rootUrl};
globalThis.window={addEventListener(){},history:{replaceState(_state,_title,url){globalThis.location.href=String(url);}}};
globalThis.document={addEventListener(){},hidden:false};
globalThis.BroadcastChannel=undefined;
globalThis.fetch=async(url,options={})=>{
 const request=new Request(new URL(url,globalThis.location.href),{...options,headers:{...options.headers,'oai-authenticated-user-id':'navigation-check'}});
 requests.push({method:request.method,url:request.url,command:options.body?JSON.parse(options.body):null});
 return roomApi(request,{DB:db},cards);
};
const newClient=(token=crypto.randomUUID())=>{const client=new RoomClient({onChange(){},onStatus(){}});client.token=token;clients.push(client);return client;};
const stored=code=>sqlite.prepare('SELECT data FROM rooms WHERE code = ?').get(code).data;
const mutations=()=>requests.filter(request=>request.method==='POST').length;
function navigate(client,screen){
 const previous=client.room,token=client.token,records=stored(previous.code),count=requests.length;
 window.history.replaceState(null,'',roomScreenUrl(location.href,screen));
 const resolved=resolvedRoomScreen(screen,client.room);
 assert.equal(client.room,previous,'Navigation must keep the connected room object');
 assert.equal(client.token,token,'Navigation must preserve the tab identity');
 assert.equal(requests.length,count,'Navigation must not fetch or submit commands');
 assert.equal(stored(previous.code),records,'Navigation must not rewrite the room');
 assert.equal(new URL(location.href).searchParams.get('room'),previous.code);
 return resolved;
}
try{
 const host=newClient(),guest=newClient();
 await host.create({automatonMode:'advanced',automaDifficulty:'hard',humans:['US','CN'],dd:true,wit:false});
 const code=host.room.code;
 assert.equal(host.room.seat,'US');assert.equal(host.room.status,'lobby');
 assert.deepEqual(host.room.config.automas,{EU:'hard',RU:'hard'});
 assert.equal(navigate(host,'lobby'),'lobby');
 // A remote seat can change while the host remains on the same lobby route.
 const hostHallUrl=location.href;
 await guest.connect(code);await guest.send('join',{seat:'CN'});
 // Each real tab owns a separate location; restore the host's test context.
 location.href=hostHallUrl;await host.sync();
 assert.equal(initialRoomScreen(location.href),'lobby');
 assert.equal(resolvedRoomScreen('lobby',host.room),'lobby');
 assert.equal(host.room.seats.CN.occupied,true);
 assert.equal(navigate(host,'room'),'room');
 await host.send('start');
 assert.equal(host.room.status,'playing');assert.equal(host.room.seat,'US');
 const gameRevision=host.room.gameRevision,seatRevision=host.room.seatRevision,state=structuredClone(host.room.state),record=stored(code),postCount=mutations();
 assert.equal(navigate(host,'lobby'),'lobby');assert.equal(navigate(host,'room'),'room');assert.equal(navigate(host,'game'),'game');
 assert.equal(host.room.gameRevision,gameRevision);assert.equal(host.room.seatRevision,seatRevision);assert.deepEqual(host.room.state,state);
 const recent=await host.recent();assert.ok(recent.some(room=>room.code===code));
 await host.connect(code.toLowerCase());
 assert.equal(host.room.seat,'US');assert.equal(host.room.gameRevision,gameRevision);assert.deepEqual(host.room.state,state);
 const refreshed=newClient(host.token);await refreshed.connect(code);
 assert.equal(refreshed.room.seat,'US');assert.equal(refreshed.room.gameRevision,gameRevision);assert.deepEqual(refreshed.room.state,state);
 assert.equal(stored(code),record);assert.equal(mutations(),postCount,'Returning/reconnecting/recent-list must be read-only');
 // Creating another room uses its own state. It must never reset the old
 // room or release the host's old seat, which remains recoverable by GET.
 await host.create({automatonMode:'basic',humans:['US','RU'],dd:false,wit:false});
 const basic=host.room.code;
 assert.equal(host.room.config.automatonMode,'basic');assert.deepEqual(host.room.config.humans,['US','RU']);
 assert.equal(host.room.seats.CN.nonPlayer,true);assert.equal(host.room.seats.RU.nonPlayer,false);
 assert.equal(stored(code),record);await host.connect(code);assert.equal(host.room.seat,'US');assert.deepEqual(host.room.state,state);
 await host.create({automatonMode:'none',humans:['US','CN','EU','RU'],dd:false,wit:false});
 assert.equal(host.room.config.automatonMode,'none');assert.ok(Object.values(host.room.seats).every(seat=>!seat.nonPlayer));
 assert.ok((await host.recent()).some(room=>room.code===basic));assert.equal(stored(code),record);
 assert.ok(!requests.some(request=>['leave','reset'].includes(request.command?.op)));
 console.log('Room navigation passed (Node only): URL/screens, all three creation modes, real RoomClient/API/SQLite, read-only hall/current/game transitions, remote-seat sync, same-seat reconnect, recent rooms and preservation of existing games.');
}finally{
 for(const client of clients){clearTimeout(client.timer);client.room=null;}
 for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
 sqlite.close();
}
