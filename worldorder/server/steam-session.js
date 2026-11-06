import {randomUUID} from 'node:crypto';
import {newRoom,changeRoom,roomView,playerView,RoomError,seatFor} from './rooms.js';

const PROTOCOL=1,MAX_PACKET=512*1024,MAX_COMMAND=64*1024;
const STEAM_ID=/^\d{1,20}$/,REQUEST_ID=/^[A-Za-z0-9_-]{1,80}$/;
const identity=id=>({user:'steam:'+id,token:'steam:'+id});
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const bytes=value=>{try{return Buffer.byteLength(JSON.stringify(value));}catch{return Infinity;}};
const fail=(message,status=400,transient=false)=>Object.assign(new RoomError(message,status),{transient});
const VIEW_KEYS=new Set(['code','revision','gameRevision','seatRevision','status','seat','isHost','config','actor','seats','canUndo','rollback','restartRequest','state']);
const packetKeys=new Set(['v','lobbyId','hostId','epoch','type','requestId','command','room','ok','error','status','name','members']);
const SEATS=['US','CN','EU','RU'];
const revision=value=>Number.isSafeInteger(value)&&value>=0;
function restoredRoom(snapshot,context,selfId){
 const room=snapshot?.room;
 try{
  if(!plain(room)||room.version!==1||room.code!==context.lobbyId||!revision(room.revision)||!revision(room.gameRevision)||!['lobby','playing'].includes(room.status)||!plain(room.seats)||!plain(room.seatRevisions)||!Array.isArray(room.receipts)||room.receipts.length>64||!plain(room.state)||room.state.version!==2||!plain(room.state.players)||!plain(room.state.regions)||!plain(room.state.config)||!plain(room.rollback))throw Error();
  if(room.host?.user!=='steam:'+selfId||room.host?.token!=='steam:'+selfId)throw Error();
  if(room.receipts.some(r=>!plain(r)||typeof r.id!=='string'||!REQUEST_ID.test(r.id)||typeof r.user!=='string'||r.token!==r.user||!/^steam:\d{1,20}$/.test(r.user)))throw Error();
  for(const region of ['M','E','C','N','A','S','P']){
   const r=room.state.regions[region];
   if(!plain(r)||!Array.isArray(r.available)||!Array.isArray(r.deck)||!Array.isArray(r.permanent)||!Array.isArray(r.temporary)||!plain(r.armies)||!plain(r.influence))throw Error();
  }
  const users=new Set();
  for(const seat of SEATS){
   const owner=room.seats[seat],player=room.state.players[seat];
   if(!revision(room.seatRevisions[seat])||!plain(player)||!['hand','deck','played','objectives','resources','production'].every(k=>Array.isArray(player[k])))throw Error();
   if(owner!==null){
    if(!plain(owner)||typeof owner.user!=='string'||!/^steam:\d{1,20}$/.test(owner.user)||owner.token!==owner.user||users.has(owner.user))throw Error();
    users.add(owner.user);roomView(room,owner);
   }
   // Exercise redaction even when a seat is currently empty: a corrupt hand,
   // hidden queue or workflow must be rejected before getRoom/status can use it.
   playerView(room.state,seat);
  }
  roomView(room,identity(selfId));return structuredClone(room);
 }catch{throw fail('原房主自动快照已损坏，无法恢复这局游戏',503);}
}

/** Fixed-host Steam session. Only this module owns the authoritative room.
 * Transport supplies authenticated peer IDs; payloads never select an identity.
 * A save completes before a successful result or any new snapshot is sent.
 */
export class SteamSession{
 #transport;#cards;#store;#context=null;#room=null;#view=null;#pending=new Map();#seen=new Map();#names=new Map();
 #queue=Promise.resolve();#queued=0;#timer;#unsubscribers=[];#generation=0;#closed=false;#changing=false;#leaving=false;#hostGone=false;#error='';#remoteMembers=[];
 #now;#heartbeatMs;#offlineMs;#retryMs;#requestMs;#lastHeartbeat=0;
 constructor({transport,cards,store,now=Date.now,heartbeatMs=5000,offlineMs=16000,retryMs=1800,requestMs=10000,tickMs=500}){
  this.#transport=transport;this.#cards=cards;this.#store=store;this.#now=now;
  this.#heartbeatMs=heartbeatMs;this.#offlineMs=offlineMs;this.#retryMs=retryMs;this.#requestMs=requestMs;
  this.#unsubscribers=[transport.onMessage((peerId,message)=>this.#receive(String(peerId),message)),transport.onChange(()=>this.#changed())];
  this.#timer=setInterval(()=>this.#tick(),tickMs);this.#timer.unref?.();this.#changed();
 }
 #trustedContext(){
  const c=this.#transport.context();
  if(!c)return null;
  if(!STEAM_ID.test(String(c.lobbyId))||!STEAM_ID.test(String(c.hostId))||typeof c.epoch!=='string'||c.epoch.length<8||c.epoch.length>128||!Array.isArray(c.members)||c.members.length>4)return null;
  const members=c.members.map(m=>({id:String(m.id??m.steamId),name:String(m.name||'').slice(0,80)}));
  if(members.some(m=>!STEAM_ID.test(m.id))||new Set(members.map(m=>m.id)).size!==members.length)return null;
  return {...c,lobbyId:String(c.lobbyId),hostId:String(c.hostId),members};
 }
 #same(a,b){return !!a&&!!b&&a.lobbyId===b.lobbyId&&a.hostId===b.hostId&&a.epoch===b.epoch;}
 #self(){return String(this.#transport.selfId||'');}
 #host(){return this.#context?.hostId===this.#self();}
 #changed(){
  if(this.#closed||this.#leaving)return;
  const next=this.#trustedContext();
  if(!next){if(this.#context)this.#error='Steam Lobby 连接已断开，请重新加入原房间';return;}
  if(!this.#context){this.#context=next;this.#lastHeartbeat=0;}
  else if(!this.#same(this.#context,next)){this.#error='Steam 会话已改变，请重新加入房间';return;}
  else this.#context=next;
  if(next.hostPresent===false||!next.members.some(m=>m.id===next.hostId)||next.ownerId&&String(next.ownerId)!==next.hostId){
   this.#hostGone=true;this.#error='原房主已离开，对局暂停；本局不会转移房主';this.#rejectPending(fail(this.#error,503,true));
  }
  for(const id of this.#seen.keys())if(!next.members.some(m=>m.id===id))this.#seen.delete(id);
 }
 #connected(){
  const live=this.#trustedContext();
  return !this.#closed&&!this.#leaving&&!this.#hostGone&&!!live&&live.connected!==false&&this.#same(this.#context,live)&&live.members.some(m=>m.id===this.#self())&&live.members.some(m=>m.id===live.hostId)&&(!live.ownerId||String(live.ownerId)===live.hostId)&&(this.#host()?!!this.#room:this.#now()-(this.#seen.get(live.hostId)??-Infinity)<this.#offlineMs);
 }
 status(){
  this.#changed();const c=this.#context,connected=this.#connected();
  return {ready:!this.#closed&&STEAM_ID.test(this.#self()),name:String(this.#transport.name||'').slice(0,80),steamId:this.#self(),
   lobbyId:c?.lobbyId||null,hostId:c?.hostId||null,isHost:!!c&&this.#host(),connected,
   members:(c?.members||[]).map(m=>{const remote=this.#remoteMembers.find(r=>r.steamId===m.id);return {steamId:m.id,name:this.#names.get(m.id)||remote?.name||m.name||'Steam 用户 '+m.id.slice(-6),
    connected:m.id===this.#self()?connected:this.#host()?connected&&this.#now()-(this.#seen.get(m.id)??-Infinity)<this.#offlineMs:connected&&(m.id===c.hostId||!!remote?.connected),
    ...(this.#room?{seat:seatFor(this.#room,identity(m.id))}:remote?{seat:remote.seat}:{})};}),
   ...(this.#error?{error:this.#error}:c&&!connected?{error:'正在等待房主连接，暂时不能操作'}:{})};
 }
 getRoom(){
  if(this.#host()&&this.#room)this.#view=roomView(this.#room,identity(this.#self()));
  return this.#view?structuredClone(this.#view):null;
 }
 #clear(reason='已离开 Steam 房间'){
  this.#generation++;this.#rejectPending(fail(reason,503,true));this.#context=null;this.#room=null;this.#view=null;
  this.#seen.clear();this.#names.clear();this.#remoteMembers=[];this.#hostGone=false;this.#error='';this.#lastHeartbeat=0;
 }
 async create(config){
  if(this.#closed)throw fail('Steam 会话已关闭');
  if(this.#changing||this.#context||this.#transport.context())throw fail('请先离开当前 Steam 房间，再创建新房间',409);
  this.#changing=true;
  try{
   await this.#transport.createLobby();this.#changed();
   if(!this.#context||!this.#host()||this.#hostGone)throw fail('Steam 房间创建失败',503,true);
   const room=newRoom(this.#context.lobbyId,identity(this.#self()),this.#cards,config,this.#now());
   await this.#save(room);this.#room=room;this.#view=roomView(room,identity(this.#self()));this.#error='';return this.getRoom();
  }catch(error){await this.#transport.leaveLobby().catch(()=>{});this.#clear();throw error;}
  finally{this.#changing=false;}
 }
 async join(lobbyId){
  lobbyId=String(lobbyId||'').trim();if(!STEAM_ID.test(lobbyId))throw fail('请输入有效的 Steam 房间号');
  if(this.#closed)throw fail('Steam 会话已关闭');
  if(this.#changing)throw fail('正在连接 Steam 房间，请稍候',409);
  if(this.#context&&this.#context.lobbyId!==lobbyId)throw fail('请先离开当前 Steam 房间',409);
  if(this.#context?.lobbyId===lobbyId&&this.#connected())return this.refresh();
  this.#changing=true;
  try{
   await this.#transport.joinLobby(lobbyId);this.#changed();
   if(this.#context?.lobbyId!==lobbyId||this.#hostGone)throw fail(this.#error||'Steam 房间连接失败',503,true);
   if(this.#host()&&!this.#room){
    const saved=await this.#store?.load?.();
    if(!saved||!this.#same(saved,this.#context))throw fail('找不到原房主的自动快照，本局不能转移房主',503);
    this.#room=restoredRoom(saved,this.#context,this.#self());
   }
   return await this.refresh();
  }finally{this.#changing=false;}
 }
 async leave(){
  // Keep the authoritative seat reserved, so the same Steam account can rejoin.
  // Releasing a seat explicitly is a normal `leave` room command.
  this.#leaving=true;this.#clear();try{await this.#transport.leaveLobby();return null;}finally{this.#clear();this.#leaving=false;}
 }
 async refresh(){
  this.#changed();if(!this.#context||this.#hostGone)throw fail(this.#error||'请先加入 Steam 房间',503,true);
  if(this.#host()){
   if(!this.#room)throw fail('房主正在准备对局，请稍候',503,true);
   this.#error='';return this.getRoom();
  }
  return this.#request('refresh',randomUUID());
 }
 async command(command){
  this.#changed();this.#validateCommand(command);
  if(!this.#connected())throw fail(this.#error||'与房主的连接已中断，请等待重连',503,true);
  if(this.#host())return this.#enqueue(()=>this.#apply(this.#self(),command));
  return this.#request('command',command.id,command);
 }
 #validateCommand(command){
  if(!plain(command)||typeof command.id!=='string'||!REQUEST_ID.test(command.id)||typeof command.op!=='string'||bytes(command)>MAX_COMMAND)throw fail('Steam 操作内容无效或过大');
  if(['user','token','steamId','sender','identity'].some(key=>key in command))throw fail('Steam 操作不能指定玩家身份',403);
 }
 #enqueue(fn){
  if(this.#queued>=64)return Promise.reject(fail('房主正在处理其他操作，请稍后重试',429,true));
  this.#queued++;const generation=this.#generation;
  const run=this.#queue.then(()=>{if(generation!==this.#generation)throw fail('Steam 会话已结束',503,true);return fn(generation);}).finally(()=>this.#queued--);
  this.#queue=run.catch(()=>{});return run;
 }
 async #save(room){
  if(!this.#store)return;
  try{await this.#store.save({lobbyId:this.#context.lobbyId,hostId:this.#context.hostId,epoch:this.#context.epoch,room});}
  catch{throw fail('房主自动快照保存失败，请稍后重试',503,true);}
 }
 async #apply(peerId,command){
  this.#changed();if(!this.#host()||!this.#room||!this.#connected()||!this.#context.members.some(m=>m.id===peerId))throw fail('Steam 成员或房主连接已失效',403);
  this.#validateCommand(command);
  const generation=this.#generation;let next;
  // Check the domain receipt before new-command constraints: a lost start
  // acknowledgement remains a successful retry if someone has since gone away.
  if(command.op==='start'&&!this.#room.receipts.some(r=>r.id===command.id&&r.user==='steam:'+peerId&&r.token==='steam:'+peerId)){
   const online=this.#context.members.filter(m=>m.id===this.#self()||this.#now()-(this.#seen.get(m.id)??-Infinity)<this.#offlineMs);
   if((this.#room.state.config.humans||['US','CN','EU','RU']).some(id=>{const seat=this.#room.seats[id];return !seat||!online.some(m=>seat.user==='steam:'+m.id);}))throw fail('所选 Steam 玩家全部在线并入座后才能开始',409);
  }
  try{next=changeRoom(this.#room,identity(peerId),command,this.#cards,this.#now());}
  catch(error){throw error.status?error:fail(error.message||'这次操作不符合游戏规则');}
  if(next!==this.#room){
   await this.#save(next);
   if(generation!==this.#generation)throw fail('保存期间 Steam 房间已离线，请重新连接后核对局面',503,true);
   this.#room=next;
   if(!this.#connected())throw fail('保存期间 Steam 房间已离线，请重新连接后核对局面',503,true);
  }
  this.#broadcast();this.#error='';return roomView(this.#room,identity(peerId));
 }
 #packet(type,extra={}){const c=this.#context;return {v:PROTOCOL,lobbyId:c.lobbyId,hostId:c.hostId,epoch:c.epoch,type,...extra};}
 #send(peerId,type,extra={}){
  if(!this.#context||this.#closed||this.#hostGone)return false;
  const packet=this.#packet(type,extra);if(bytes(packet)>MAX_PACKET)return false;
  try{return this.#transport.send(peerId,packet)!==false;}catch{return false;}
 }
 #snapshot(peerId){if(this.#room)this.#send(peerId,'snapshot',{room:roomView(this.#room,identity(peerId)),members:this.status().members});}
 #broadcast(){
  this.#view=roomView(this.#room,identity(this.#self()));
  for(const m of this.#context.members)if(m.id!==this.#self())this.#snapshot(m.id);
 }
 #request(type,id,command){
  if(this.#pending.has(id))return this.#pending.get(id).promise;
  if(this.#pending.size>=16)throw fail('Steam 操作正在等待确认，请稍候',429,true);
  const entry={type,id,command,start:this.#now(),last:0};
  entry.promise=new Promise((resolve,reject)=>{entry.resolve=resolve;entry.reject=reject;});
  this.#pending.set(id,entry);this.#transmit(entry);return entry.promise;
 }
 #transmit(entry){
  entry.last=this.#now();this.#send(this.#context.hostId,entry.type,{requestId:entry.id,...(entry.command?{command:entry.command}:{}),name:String(this.#transport.name||'').slice(0,80)});
 }
 #rejectPending(error){for(const entry of this.#pending.values())entry.reject(error);this.#pending.clear();}
 #validPacket(peerId,message){
  const c=this.#context;
  return c&&!this.#hostGone&&plain(message)&&bytes(message)<=MAX_PACKET&&Object.keys(message).every(k=>packetKeys.has(k))&&message.v===PROTOCOL&&message.lobbyId===c.lobbyId&&message.hostId===c.hostId&&message.epoch===c.epoch&&c.members.some(m=>m.id===peerId)&&peerId!==this.#self()&&['ping','pong','refresh','command','snapshot','result'].includes(message.type)&&(!('requestId'in message)||typeof message.requestId==='string'&&REQUEST_ID.test(message.requestId));
 }
 #validView(view){return plain(view)&&Object.keys(view).every(k=>VIEW_KEYS.has(k))&&view.code===this.#context.lobbyId&&Number.isSafeInteger(view.revision)&&view.revision>=0&&Number.isSafeInteger(view.gameRevision)&&plain(view.seats)&&[null,'US','CN','EU','RU'].includes(view.seat)&&['lobby','playing'].includes(view.status);}
 #accept(view){
  if(!this.#validView(view))return false;
  if(this.#view&&view.revision<this.#view.revision)return false;
  this.#view=structuredClone(view);return true;
 }
 #receive(peerId,message){
  this.#changed();if(!this.#validPacket(peerId,message))return;
  if(!this.#host()&&peerId!==this.#context.hostId)return;
  this.#seen.set(peerId,this.#now());this.#error='';
  if(typeof message.name==='string')this.#names.set(peerId,message.name.slice(0,80));
  if(message.type==='ping'){
   this.#send(peerId,'pong');if(this.#host()&&this.#room)this.#snapshot(peerId);return;
  }
  if(message.type==='pong')return;
  if(this.#host()){
   if(!['refresh','command'].includes(message.type)||!REQUEST_ID.test(message.requestId||''))return;
   const generation=this.#generation;
   this.#enqueue(async()=>{
    try{
     if(!this.#room)throw fail('房主正在准备对局，请稍候',503,true);
     let view;
     if(message.type==='command'){
      this.#validateCommand(message.command);if(message.command.id!==message.requestId)throw fail('操作编号与 Steam 请求不一致');
      view=await this.#apply(peerId,message.command);
     }else view=roomView(this.#room,identity(peerId));
     if(generation===this.#generation)this.#send(peerId,'result',{requestId:message.requestId,ok:true,room:view,members:this.status().members});
    }catch(error){if(generation===this.#generation)this.#send(peerId,'result',{requestId:message.requestId,ok:false,error:error.status?error.message:'房主保存失败，请稍后重试',status:error.status||503,...(this.#room?{room:roomView(this.#room,identity(peerId))}:{})});}
   }).catch(error=>{if(generation===this.#generation)this.#send(peerId,'result',{requestId:message.requestId,ok:false,error:error.message,status:error.status||503});});return;
  }
  if(Array.isArray(message.members)&&message.members.length<=4&&message.members.every(m=>plain(m)&&STEAM_ID.test(m.steamId)&&typeof m.name==='string'&&m.name.length<=80&&typeof m.connected==='boolean'&&[null,'US','CN','EU','RU',undefined].includes(m.seat)))this.#remoteMembers=message.members;
  if(message.type==='snapshot'){this.#accept(message.room);return;}
  if(message.type==='result'){
   const entry=this.#pending.get(message.requestId);if(!entry)return;
   if(typeof message.ok!=='boolean'||message.room&&!this.#validView(message.room))return;
   if(message.ok&&!message.room)return;
   if(message.room)this.#accept(message.room);
   this.#pending.delete(message.requestId);
   if(message.ok)entry.resolve(this.getRoom());
   else entry.reject(Object.assign(fail(typeof message.error==='string'?message.error.slice(0,500):'房主拒绝了这次操作',Number.isInteger(message.status)?message.status:400,message.status>=500),{room:this.getRoom()}));
  }
 }
 #tick(){
  if(this.#closed)return;this.#changed();const c=this.#context;if(!c||this.#hostGone)return;
  const now=this.#now();
  if(now-this.#lastHeartbeat>=this.#heartbeatMs){
   this.#lastHeartbeat=now;
   if(this.#host()){for(const m of c.members)if(m.id!==this.#self())this.#send(m.id,'ping',{name:String(this.#transport.name||'').slice(0,80)});}
   else this.#send(c.hostId,'ping',{name:String(this.#transport.name||'').slice(0,80)});
  }
  for(const [id,entry] of this.#pending){
   if(now-entry.start>=this.#requestMs){this.#pending.delete(id);entry.reject(fail('Steam 操作尚未收到确认，请核对局面后重试；重试不会重复扣费',504,true));}
   else if(now-entry.last>=this.#retryMs)this.#transmit(entry);
  }
 }
 close(){
  if(this.#closed)return;this.#closed=true;clearInterval(this.#timer);for(const unsubscribe of this.#unsubscribers)unsubscribe?.();
  this.#rejectPending(fail('Steam 会话已关闭',503,true));this.#generation++;this.#transport.close();
 }
}
