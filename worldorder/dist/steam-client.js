const TOKEN_KEY='world-order-steam-bridge-v1';
const validToken=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{24,256}$/.test(value);

export function steamMode(href=globalThis.location?.href){return new URL(href||'http://localhost/').searchParams.get('steam')==='1';}
export function normalizeLobbyId(value){
 const id=String(value??'').trim();
 if(!/^[0-9]{17,20}$/.test(id))throw Error('请输入17至20位数字的 Steam 房间号');
 return id;
}

// This credential belongs only to the local launcher. It is never an invite,
// command identity or Steam ID, and is deliberately removed from the URL.
export class SteamBridgeClient{
 constructor({fetcher=globalThis.fetch.bind(globalThis),storage=globalThis.sessionStorage,location=globalThis.location,history=globalThis.window?.history}={}){
  this.fetcher=fetcher;this.storage=storage;this.location=location;this.history=history;
 }
 initialize(){
  const url=new URL(this.location.href),fragment=url.hash.slice(1);
  if(fragment){
   url.hash='';this.history?.replaceState(null,'',url.href);
   if(validToken(fragment)){this.token=fragment;try{this.storage?.setItem(TOKEN_KEY,fragment);}catch{}}
  }
  if(!this.token){try{const saved=this.storage?.getItem(TOKEN_KEY);if(validToken(saved))this.token=saved;}catch{}}
  if(!this.token)throw Error('缺少本机 Steam 启动凭据。请从 World Order Steam 启动器重新打开页面。');
 }
 async request(path,body){
  if(!this.token)throw Error('请从 World Order Steam 启动器打开游戏。');
  // Native Lobby creation/join can take 20 seconds, followed by the host
  // handshake. Keep the browser timeout outside that bounded bridge work.
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),40000);
  try{
   const response=await this.fetcher('/api/steam'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:controller.signal,
    headers:{'X-Steam-Bridge':this.token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
   if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Steam 本机连接没有返回有效响应');
   const result=await response.json();
   if(!response.ok){const error=Error(result.error||'Steam 房间暂时无法连接');error.status=response.status;error.room=result.room;error.steamStatus=result.status;error.transient=[503,504].includes(response.status);throw error;}
   return result;
  }catch(error){
   if(error.status)throw error;
   const failure=Error('Steam 本机连接中断，请保持启动器运行；未确认的操作会在重连后同步。');failure.transient=true;throw failure;
  }finally{clearTimeout(timer);}
 }
}
