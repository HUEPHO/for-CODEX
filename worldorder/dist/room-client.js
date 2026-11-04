import {SteamBridgeClient,steamMode,normalizeLobbyId} from './steam-client.js';
const TAB_KEY='world-order-room-tab-v1';
// getRandomValues is available on local HTTP as well as HTTPS. randomUUID is
// secure-context-only and used to prevent the entire table from loading there.
const uniqueId=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
export const roomLink=(code,seat)=>{
 if(steamMode())return normalizeLobbyId(code);
 const url=new URL(location.href);url.search='';url.hash='';
 url.searchParams.set('room',code);if(seat)url.searchParams.set('seat',seat);return url.href;
};
export function normalizeCode(code){return String(code||'').trim().toUpperCase().replace(/\s/g,'');}
export class RoomClient{
 constructor({onChange,onStatus}){
  this.onChange=onChange;this.onStatus=onStatus;this.room=null;this.busy=false;this.status='online';
  this.isSteam=steamMode();this.steamStatus=this.isSteam?{ready:false,connected:false,members:[]}:null;this.steamEpoch=0;
  if(this.isSteam)this.bridge=new SteamBridgeClient();
  this.channel=!this.isSteam&&typeof BroadcastChannel==='function'?new BroadcastChannel('world-order-rooms-v1'):null;
  if(this.channel)this.channel.onmessage=e=>{if(e.data?.code===this.room?.code)this.sync();};
  window.addEventListener('focus',()=>this.sync());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.sync();});
  window.addEventListener('online',()=>this.sync());
 }
 async initialize(){
  if(this.isSteam){
   try{this.bridge.initialize();this.acceptSteam(await this.bridge.request('/room'),'local');}
   catch(error){this.steamFailure(error);}
   this.schedule();return;
  }
  try{this.token=sessionStorage.getItem(TAB_KEY);}catch{}
  this.token||=uniqueId();
  // Duplicating a tab may copy sessionStorage. A live document exclusively owns
  // its token; a duplicate receives a new one, while refresh restores its seat.
  if(navigator.locks){
   for(let attempt=0;attempt<2;attempt++){
    const acquired=await new Promise(resolve=>{
     navigator.locks.request('world-order-tab-'+this.token,{ifAvailable:true},lock=>{
      if(!lock){resolve(false);return;}
      resolve(true);return new Promise(release=>{this.release=release;});
     }).catch(()=>resolve(true));
    });
    if(acquired)break;this.token=uniqueId();
   }
  }
  try{sessionStorage.setItem(TAB_KEY,this.token);}catch{}
 }
 setStatus(status){this.status=status;this.onStatus?.(status,this.busy);}
 steamConnection(){return this.steamStatus?.ready&&(!this.steamStatus.lobbyId||this.steamStatus.connected)?'online':'offline';}
 acceptSteam(result,cause='remote'){
  const previousLobby=this.steamStatus?.lobbyId;
  if(result.status)this.steamStatus=result.status;
  if(result.room)this.accept(result.room,cause);
  else if(result.room===null&&(this.room||previousLobby!==this.steamStatus?.lobbyId)){this.room=null;this.onChange(null,cause);}
  this.setStatus(this.steamConnection());
 }
 steamFailure(error){
  if(error.steamStatus)this.steamStatus=error.steamStatus;
  else this.steamStatus={...this.steamStatus,error:error.message,...([401,403].includes(error.status)&&!this.room?{ready:false,connected:false}:{})};
  if(error.room)this.accept(error.room,'remote');
  if(error.transient||!error.status)this.steamStatus={...this.steamStatus,connected:false,error:error.message};
  this.setStatus(error.transient||!error.status?'offline':this.steamConnection());
 }
 async steamWrite(path,body,{retry=false}={}){
  if(this.busy)throw Error('上一步正在保存，请稍候');
  if(path!=='/command')this.steamEpoch++;
  this.busy=true;this.setStatus(path==='/command'?'saving':'connecting');
  try{
   let result;
   try{result=await this.bridge.request(path,body);}catch(error){if(!retry||!error.transient)throw error;result=await this.bridge.request(path,body);}
   this.acceptSteam(result,'local');return this.room;
  }catch(error){this.steamFailure(error);throw error;}
  finally{this.busy=false;this.setStatus(this.status==='saving'||this.status==='connecting'?this.steamConnection():this.status);this.schedule();}
 }
 accept(next,cause='remote'){
  if(this.room&&this.room.code===next.code&&this.room.revision>next.revision)return;
  // Snapshot expiry changes the permitted rollback without changing the game
  // revision. Deliver this small metadata update so the UI cannot keep an
  // expired undo button enabled until its next failed submission.
  const rollbackChanged=this.room?.canUndo!==next.canUndo||['step','phase','turn'].some(scope=>{
   const old=this.room?.rollback?.[scope],current=next.rollback?.[scope];return old?.available!==current?.available||old?.reason!==current?.reason;
  });
  const changed=!this.room||this.room.code!==next.code||this.room.revision!==next.revision||this.room.seat!==next.seat||rollbackChanged;
  this.room=next;this.setStatus(this.isSteam?this.steamConnection():'online');if(changed)this.onChange(next,cause);
 }
 async request(path,command){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
   const response=await fetch('/api/rooms'+path,{method:command?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,
    headers:{'X-Room-Token':this.token,...(command?{'Content-Type':'application/json'}:{})},...(command?{body:JSON.stringify(command)}:{})});
   if(!response.headers.get('content-type')?.includes('application/json'))throw Error('房间连接中断，请刷新已登录的游戏页面后重试');
   const result=await response.json();
   if(!response.ok){const error=Error(result.error||'房间暂时无法连接');error.status=response.status;error.room=result.room;throw error;}
   return result;
  }catch(error){if(!error.status){const failure=Error('连接中断，正在重连；未确认的操作请核对局面后重试');failure.transient=true;throw failure;}throw error;}
  finally{clearTimeout(timer);}
 }
 async write(path,command){
  // Both command IDs and creation codes are idempotent on the server.
  try{return await this.request(path,command);}catch(error){if(!error.transient)throw error;return this.request(path,command);}
 }
 async create(config){
  if(this.isSteam){if(!this.steamStatus.ready)throw Error(this.steamStatus.error||'Steam 尚未连接，请先启动 Steam 并登录');return this.steamWrite('/create',{config});}
  if(this.busy)throw Error('上一步正在保存，请稍候');
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',code=Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>chars[n%chars.length]).join('');
  this.busy=true;this.setStatus('saving');
  try{const result=await this.write('',{code,config});this.accept(result.room,'local');this.navigate(code);this.schedule();return result.room;}
  finally{this.busy=false;this.setStatus(this.status==='saving'?'online':this.status);}
 }
 async connect(code){
  if(this.isSteam){if(!this.steamStatus.ready)throw Error(this.steamStatus.error||'Steam 尚未连接，请先启动 Steam 并登录');return this.steamWrite('/join',{lobbyId:normalizeLobbyId(code)});}
  code=normalizeCode(code);if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code))throw Error('请输入6位房间号');
  if(this.busy)throw Error('上一步正在保存，请稍候');
  this.busy=true;this.setStatus('connecting');
  try{const result=await this.request('/'+code);this.accept(result.room,'local');this.navigate(code);this.schedule();return result.room;}
  finally{this.busy=false;this.setStatus(this.status==='connecting'?'online':this.status);}
 }
 navigate(code){window.history.replaceState(null,'',roomLink(code));}
 async send(op,fields={}){
  if(this.busy)throw Error('上一步正在保存，请稍候');
  if(!this.room)throw Error('请先创建或加入房间');
  const code=this.room.code;
  const command={id:uniqueId(),op,gameRevision:this.room.gameRevision,seatRevision:this.room.seatRevision,...fields};
  if(this.isSteam){if(this.status==='offline'||!this.steamStatus.connected)throw Error('Steam 房主尚未连接，请同步成功后操作');return this.steamWrite('/command',command,{retry:true});}
  this.busy=true;this.setStatus('saving');
  try{const result=await this.write('/'+code,command);this.accept(result.room,'local');this.channel?.postMessage({code});return result.room;}
  catch(error){if(error.room)this.accept(error.room,'remote');if(error.transient)this.setStatus('offline');throw error;}
  finally{this.busy=false;this.setStatus(this.status==='saving'?'online':this.status);this.schedule();}
 }
 schedule(){clearTimeout(this.timer);if(this.room||(this.isSteam&&this.bridge.token))this.timer=setTimeout(()=>this.sync(),document.hidden?3000:1200);}
 async sync(){
  if(this.isSteam){
   if(this.busy||this.polling||!this.bridge.token)return;
   this.polling=true;const epoch=this.steamEpoch;
   try{const result=await this.bridge.request('/room');if(epoch===this.steamEpoch)this.acceptSteam(result);}catch(error){if(epoch===this.steamEpoch)this.steamFailure(error);}
   finally{this.polling=false;this.schedule();}return;
  }
  if(!this.room||this.busy||this.polling)return;
  const code=this.room.code;this.polling=true;
  try{const result=await this.request('/'+code);if(this.room?.code===code)this.accept(result.room);}
  catch{if(this.room?.code===code)this.setStatus('offline');}
  finally{this.polling=false;this.schedule();}
 }
 async leave(){if(this.isSteam)return this.steamWrite('/leave',{});await this.send('leave');this.disconnect();}
 disconnect(){clearTimeout(this.timer);this.room=null;const url=new URL(location.href);url.searchParams.delete('room');url.searchParams.delete('seat');window.history.replaceState(null,'',url);this.onChange(null,'local');this.setStatus('online');}
 async recent(){return this.isSteam?[]:(await this.request('')).rooms;}
}
