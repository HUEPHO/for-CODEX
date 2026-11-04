// Standalone HTML + room server. Local by default; shared LAN access requires
// an explicit bind address and browser-facing origin. No fixed developer user.
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,stat,realpath} from 'node:fs/promises';
import {dirname,extname,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {roomApi} from '../server/index.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const COOKIE='world_order_web_guest_v1',BODY_LIMIT=65536;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff'};
function storage(sqlite){return {prepare(sql){return {bind(...values){const statement=sqlite.prepare(sql);return {async first(){return statement.get(...values)??null;},async all(){return {results:statement.all(...values)};},async run(){return {meta:{changes:Number(statement.run(...values).changes)}};}};}};}};}
async function migrate(sqlite){
 sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY NOT NULL)');
 const journal=JSON.parse(await readFile(resolve(root,'drizzle/meta/_journal.json'),'utf8'));
 for(const {tag} of journal.entries){
  if(sqlite.prepare('SELECT name FROM local_migrations WHERE name = ?').get(tag))continue;
  const sql=await readFile(resolve(root,'drizzle',tag+'.sql'),'utf8');sqlite.exec('BEGIN IMMEDIATE');
  try{sqlite.exec(sql);sqlite.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(tag);sqlite.exec('COMMIT');}
  catch(error){sqlite.exec('ROLLBACK');throw error;}
 }
}
async function signingKey(directory){
 const filename=resolve(directory,'.guest-signing-key');
 try{await writeFile(filename,randomBytes(32),{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}
 const key=await readFile(filename);if(key.length!==32)throw Error('访客身份密钥文件无效，请保留数据目录并检查备份。');return key;
}
function guest(cookieHeader,key,secure){
 const value=String(cookieHeader||'').split(';').map(part=>part.trim()).find(part=>part.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
 const match=/^([A-Za-z0-9_-]{32})\.([A-Za-z0-9_-]{43})$/.exec(value);
 const sign=id=>createHmac('sha256',key).update('world-order-web-guest-v1:'+id).digest('base64url');
 if(match&&timingSafeEqual(Buffer.from(match[2]),Buffer.from(sign(match[1]))))return {user:'web-guest:'+match[1]};
 const id=randomBytes(24).toString('base64url');
 return {user:'web-guest:'+id,cookie:COOKIE+'='+id+'.'+sign(id)+'; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000'+(secure?'; Secure':'')};
}
async function send(res,response,{head=false,cookie}={}){
 const headers=Object.fromEntries(response.headers);if(cookie)headers['Set-Cookie']=cookie;
 headers['X-Content-Type-Options']='nosniff';headers['Referrer-Policy']='same-origin';
 res.writeHead(response.status,headers);res.end(head?undefined:Buffer.from(await response.arrayBuffer()));
}
const errorResponse=(error,status)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
function body(req){
 if(Number(req.headers['content-length'])>BODY_LIMIT){const error=Error('操作内容过长');error.status=413;req.resume();return Promise.reject(error);}
 return new Promise((accept,reject)=>{
  const chunks=[];let size=0,settled=false;
  req.on('data',chunk=>{
   if(settled)return;size+=chunk.length;
   if(size>BODY_LIMIT){settled=true;const error=Error('操作内容过长');error.status=413;reject(error);return;}
   chunks.push(chunk);
  });
  req.on('end',()=>{if(!settled){settled=true;accept(chunks.length?Buffer.concat(chunks):undefined);}});
  req.on('error',()=>{if(!settled){settled=true;const error=Error('请求未完整接收');error.status=400;reject(error);}});
 });
}

export async function startWebServer({port=8787,host='127.0.0.1',publicOrigin='',dataDirectory=resolve(root,'.web'),staticDirectory=resolve(root,'dist')}={}){
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('网页服务端口无效');
 const loopback=['127.0.0.1','localhost','::1'].includes(host);
 if(!loopback&&!publicOrigin)throw Error('共享网页服务必须显式设置 PUBLIC_ORIGIN，例如 http://192.168.1.10:8787');
 let origin='';
 if(publicOrigin){
  const url=new URL(publicOrigin);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||['0.0.0.0','[::]'].includes(url.hostname))throw Error('PUBLIC_ORIGIN 必须是浏览器访问的完整 HTTP/HTTPS 源，不含路径或凭据');
  origin=url.origin;
 }
 const staticRoot=await realpath(resolve(staticDirectory)),dataRoot=resolve(dataDirectory);
 if(dataRoot===staticRoot||dataRoot.startsWith(staticRoot+sep))throw Error('网页存档目录必须放在公开静态文件目录之外');
 await mkdir(dataRoot,{recursive:true});
 const key=await signingKey(dataRoot),databasePath=resolve(dataRoot,'rooms.sqlite');
 const sqlite=new DatabaseSync(databasePath);
 try{sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');await migrate(sqlite);}catch(error){sqlite.close();throw error;}
 const env={DB:storage(sqlite)};
 const server=createServer(async(req,res)=>{
  try{
   if(req.headers.host!==new URL(origin).host)return await send(res,errorResponse('请使用配置的网页地址访问',403));
   const url=new URL(req.url,origin);
   if(url.origin!==origin)return await send(res,errorResponse('请求来源无效',403));
   if(url.pathname.startsWith('/api/rooms')){
    // Validate the browser origin before issuing or using a guest identity.
    if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&req.headers.origin!==origin)return await send(res,errorResponse('请从同一个游戏网站操作房间',403));
    const identity=guest(req.headers.cookie,key,url.protocol==='https:');
    const headers=new Headers();
    for(const name of ['content-type','x-room-token','origin','sec-fetch-site'])if(req.headers[name])headers.set(name,String(req.headers[name]));
    // Incoming oai-authenticated-user-id (or proxy identity headers) is never trusted.
    headers.set('oai-authenticated-user-id',identity.user);
    // Bind each browser tab token to its authenticated guest. Reusing another
    // visitor's client token must not match that visitor's stored seat token.
    const tabToken=headers.get('x-room-token');
    if(/^[\w-]{32,80}$/.test(tabToken||''))headers.set('x-room-token',createHmac('sha256',key).update('world-order-web-tab-v1:'+identity.user+':'+tabToken).digest('hex'));
    const bytes=await body(req);
    const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&bytes?{body:bytes}:{})});
    return await send(res,await roomApi(request,env),{head:req.method==='HEAD',cookie:identity.cookie});
   }
   if(!['GET','HEAD'].includes(req.method))return await send(res,errorResponse('不支持此请求',405));
   let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return await send(res,errorResponse('文件路径无效',400));}
   const parts=pathname.split(/[\\/]/).filter(Boolean);
   if(parts.some(part=>part.startsWith('.'))||['client','server'].includes(parts[0]))return await send(res,errorResponse('文件不存在',404));
   const filename=resolve(staticRoot,'.'+(pathname==='/'?'/index.html':pathname));
   if(!filename.startsWith(staticRoot+sep)||!(await stat(filename)).isFile())return await send(res,errorResponse('文件不存在',404));
   const target=await realpath(filename);
   if(!target.startsWith(staticRoot+sep))return await send(res,errorResponse('文件不存在',404));
   const bytes=req.method==='HEAD'?null:await readFile(target);
   // Establish the browser identity with the HTML response, before app.js can
   // issue concurrent room-list/create requests. Assets never rotate cookies.
   const cookie=extname(target)==='.html'&&['/','/index.html'].includes(pathname)?guest(req.headers.cookie,key,url.protocol==='https:').cookie:undefined;
   return await send(res,new Response(bytes,{headers:{'Content-Type':mime[extname(target)]||'application/octet-stream','Cache-Control':'no-store'}}),{head:req.method==='HEAD',cookie});
  }catch(error){
   if(res.headersSent){res.destroy();return;}
   const status=error.status||(['ENOENT','ENOTDIR'].includes(error.code)?404:500);
   await send(res,errorResponse(status===413?'操作内容过长':status===404?'文件不存在':status===400?'请求未完整接收':'网页服务暂时不可用',status));
  }
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 try{await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);origin||='http://'+(host==='::1'?'[::1]':host)+':'+server.address().port;accept();});});}
 catch(error){sqlite.close();throw error;}
 let stopped=false;
 return {origin,databasePath,async close(){if(stopped)return;stopped=true;await new Promise((accept,reject)=>server.close(error=>error?reject(error):accept()));sqlite.close();}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const service=await startWebServer({port:Number(process.env.PORT||process.env.WORLD_ORDER_PORT||8787),host:process.env.HOST||'127.0.0.1',publicOrigin:process.env.PUBLIC_ORIGIN||'',dataDirectory:process.env.WORLD_ORDER_DATA||resolve(root,'.web')});
  console.log('World Order 网页端：'+service.origin);
  console.log('在浏览器打开地址，创建房间后分享页面中的房间链接。');
  console.log('房间存档与访客身份密钥：'+dirname(service.databasePath));
  const stop=()=>service.close().catch(()=>{console.error('网页服务关闭失败');process.exitCode=1;});
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
 }catch(error){console.error(error.message);process.exitCode=1;}
}
