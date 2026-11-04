import assert from 'node:assert/strict';
import {SteamBridgeClient,normalizeLobbyId} from '../dist/steam-client.js';
import {RoomClient,roomLink} from '../dist/room-client.js';
import {renderRoomEntry,renderRoomLobby} from '../dist/room-ui.js';

const token='a'.repeat(64),lobbyId='109775241234567890',steamId='76561198000000001';
const memory=new Map(),storage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
const location={href:'http://127.0.0.1:8790/?steam=1#'+token};
const history={replaceState(_state,_title,url){location.href=String(url);}};
const bridge=new SteamBridgeClient({storage,location,history,fetcher:async()=>{throw Error('unexpected request');}});
bridge.initialize();assert.equal(bridge.token,token);assert.equal(new URL(location.href).hash,'');
assert.equal([...memory.values()][0],token);
const refreshed=new SteamBridgeClient({storage,location,history});refreshed.initialize();assert.equal(refreshed.token,token);
assert.throws(()=>new SteamBridgeClient({storage:{getItem(){return null;}},location,history}).initialize(),/启动器/);
assert.equal(normalizeLobbyId(' '+lobbyId+' '),lobbyId);
for(const invalid of ['ABC234','123','1e18','123456789012345678901','1234567890123456x'])assert.throws(()=>normalizeLobbyId(invalid),/数字/);

const previous=Object.fromEntries(['window','document','location','sessionStorage','fetch','BroadcastChannel'].map(key=>[key,globalThis[key]]));
globalThis.window={history,addEventListener(){}};globalThis.document={hidden:false,addEventListener(){}};
globalThis.location=location;globalThis.sessionStorage=storage;globalThis.BroadcastChannel=undefined;
const status={ready:true,name:'测试<玩家>',steamId,lobbyId:null,hostId:null,isHost:false,connected:false,members:[],error:null};
const base={code:'STEAM2',revision:1,gameRevision:0,seatRevision:0,status:'lobby',seat:'US',isHost:true,config:{dd:true},actor:null,state:null,canUndo:false,
 seats:Object.fromEntries(['US','CN','EU','RU'].map(seat=>[seat,{occupied:seat==='US',mine:seat==='US',setupDone:false}]))};
let remoteRoom=null,currentStatus={...status},failCommand=false,delayed=null;
const requests=[],clients=[];
globalThis.fetch=async function(url,options={}){
 assert.equal(this,globalThis,'The native browser fetch function requires the Window receiver');
 const body=options.body?JSON.parse(options.body):null;
 requests.push({url,options,body});assert.equal(options.headers['X-Steam-Bridge'],token);
 assert.ok(!options.headers['X-Room-Token']);assert.ok(!String(url).includes(token));
 if(url==='/api/steam/room'&&delayed)return delayed;
 if(url==='/api/steam/create'){assert.deepEqual(body,{config:{dd:true}});remoteRoom={...base};currentStatus={...status,lobbyId,hostId:steamId,isHost:true,connected:true};}
 else if(url==='/api/steam/join'){assert.equal(body.lobbyId,lobbyId);remoteRoom={...base,seat:null,isHost:false};currentStatus={...status,lobbyId,hostId:'76561198000000002',connected:true};}
 else if(url==='/api/steam/command'){
  if(failCommand){failCommand=false;return Response.json({error:'回执超时',status:currentStatus},{status:504});}
  remoteRoom={...remoteRoom,revision:remoteRoom.revision+1,seat:body.seat||remoteRoom.seat};
 }else if(url==='/api/steam/leave'){remoteRoom=null;currentStatus={...status};}
 return Response.json({room:remoteRoom,status:currentStatus});
};
try{
 const changes=[],client=new RoomClient({onChange:view=>changes.push(view),onStatus(){}});clients.push(client);
 await client.initialize();assert.equal(client.isSteam,true);assert.equal(client.status,'online');assert.equal(client.room,null);
 await client.create({dd:true});assert.equal(client.room.seat,'US');assert.equal(client.steamStatus.lobbyId,lobbyId);
 assert.equal(roomLink(lobbyId,'CN'),lobbyId,'Steam invite must not contain local HTTP URL or credential');
 currentStatus={...currentStatus,connected:false,error:'房主断开'};
 await client.sync();assert.equal(client.status,'offline');assert.equal(client.room.seat,'US');
 const prior=requests.length;await assert.rejects(client.send('start'),/房主尚未连接/);assert.equal(requests.length,prior);
 currentStatus={...currentStatus,connected:true,error:null};await client.sync();assert.equal(client.status,'online');
 failCommand=true;await client.send('start');const sent=requests.filter(item=>item.url==='/api/steam/command');
 assert.equal(sent.length,2);assert.equal(sent[0].body.id,sent[1].body.id,'Retry must use the same command ID');assert.equal(client.room.revision,2);
 currentStatus={...currentStatus,connected:false,error:'原房主连接中断'};
 await client.sync();assert.equal(client.status,'offline','Cached room must not overwrite disconnected Steam status');
 currentStatus={...currentStatus,connected:true,error:null};await client.sync();
 let resolveOld;const staleRoom=remoteRoom,staleStatus=currentStatus;
 delayed=new Promise(resolve=>{resolveOld=resolve;});const poll=client.sync();await client.leave();
 resolveOld(Response.json({room:staleRoom,status:staleStatus}));await poll;delayed=null;
 assert.equal(client.room,null,'A delayed poll from the previous lobby must not reconnect after leaving');
 await client.connect(lobbyId);assert.equal(client.room.seat,null);await client.send('join',{seat:'CN'});assert.equal(client.room.seat,'CN');
 const beforeInvalid=requests.length;await assert.rejects(client.connect('ABC234'),/数字/);assert.equal(requests.length,beforeInvalid);
 const replay=new RoomClient({onChange(){},onStatus(){}});clients.push(replay);await replay.initialize();assert.equal(replay.room.seat,'CN');
 const entry=renderRoomEntry({dd:true},'',{steam:status});
 assert.match(entry,/Steam 房间号/);assert.match(entry,/maxlength="20"/);assert.ok(!entry.includes('四个势力')&&!entry.includes('四标签页'));
 const html=renderRoomLobby({...base,code:lobbyId},{steam:{...currentStatus,name:'<script>unsafe</script>',lobbyId,members:[{steamId,name:'<img onerror=1>',connected:true,seat:'US'}]}});
 assert.match(html,/复制房间号/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img onerror=1&gt;/);
 assert.ok(!html.includes('target="_blank"')&&!html.includes('http://127.0.0.1')&&!html.includes(token));
 memory.clear();const unlaunched=new RoomClient({onChange(){},onStatus(){}});clients.push(unlaunched);
 const fetchCount=requests.length;await unlaunched.initialize();assert.equal(unlaunched.status,'offline');assert.equal(requests.length,fetchCount);assert.match(unlaunched.steamStatus.error,/启动器/);
 console.log('Steam client passed: local-only launch credential, numeric invites, refresh, create/join/seat commands, cached-view offline blocking, same-ID retry, stale poll after leave and escaped Steam lobby UI.');
}finally{
 for(const client of clients)clearTimeout(client.timer);
 for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
}
