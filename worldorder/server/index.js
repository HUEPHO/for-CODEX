import cards from '../dist/cards.json' with {type:'json'};
import {newRoom,changeRoom,roomView,RoomError} from './rooms.js';
import {roomDatabase} from './room-db.js';

const CODE=/^[A-HJ-NP-Z2-9]{6}$/;
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function identity(request){
 const user=request.headers.get('oai-authenticated-user-id');
 if(!user)throw new RoomError('请在已登录的游戏页面中进入房间',401);
 const token=request.headers.get('X-Room-Token');
 if(!/^[\w-]{32,80}$/.test(token||''))throw new RoomError('标签页身份已失效，请刷新页面',401);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 return {user,token:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')};
}
function code(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>chars[n%chars.length]).join('');}
async function body(request){
 if(!request.headers.get('content-type')?.includes('application/json'))throw new RoomError('请求格式无效',415);
 const input=await request.text();if(input.length>65536)throw new RoomError('操作内容过长',413);
 try{const data=JSON.parse(input);if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data;}catch{throw new RoomError('操作内容无效');}
}
export async function roomApi(request,env,catalog=cards){
 let db,id,room;
 try{
  const url=new URL(request.url);
  if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')&&request.headers.get('origin')!==url.origin)throw new RoomError('请在游戏页面中操作房间',403);
  id=await identity(request);db=roomDatabase(env);
  const match=url.pathname.match(/^\/api\/rooms(?:\/([A-HJ-NP-Z2-9]{6}))?$/);
  if(!match)throw new RoomError('房间地址无效',404);
  if(!match[1]){
   if(request.method==='GET')return json({rooms:await db.list(id.user)});
   if(request.method!=='POST')throw new RoomError('不支持此请求',405);
   const command=await body(request);
   // Creation has a client-generated room code, making a lost response safe to retry.
   const roomCode=command.code||code();if(!CODE.test(roomCode))throw new RoomError('房间号无效');
   room=newRoom(roomCode,id,catalog,command.config);
   if(!await db.insert(room)){
    room=await db.get(roomCode);
    if(room.host.user!==id.user||room.host.token!==id.token)throw new RoomError('房间号已被使用，请重新创建',409);
   }
   return json({room:roomView(room,id)},201);
  }
  room=await db.get(match[1]);if(!room)throw new RoomError('没有找到这个房间，请核对房间号',404);
  if(request.method==='GET')return json({room:roomView(room,id)});
  if(request.method!=='POST')throw new RoomError('不支持此请求',405);
  const command=await body(request);
  for(let attempt=0;attempt<4;attempt++){
   const next=changeRoom(room,id,command,catalog);
   if(next===room||await db.replace(room,next))return json({room:roomView(next,id)});
   room=await db.get(match[1]);
  }
  throw new RoomError('其他玩家正在操作，本次操作未执行，请重试',409);
 }catch(error){
  const status=error instanceof RoomError?error.status:400;
  if(!(error instanceof RoomError)&&/D1|SQLITE|database|binding/i.test(error.message)){
   console.error('Room storage failure',error.message);return json({error:'房间暂时无法保存，你的操作尚未确认，请稍后重试'},503);
  }
  return json({error:error.message||'房间暂时不可用',...(room&&id?{room:roomView(room,id)}:{})},status);
 }
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/rooms'))return roomApi(request,env);
  if(env.ASSETS)return env.ASSETS.fetch(request);
  return new Response('页面暂时无法读取，请刷新重试',{status:503});
 }
};
