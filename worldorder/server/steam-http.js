import {createServer} from 'node:http';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const STATIC_ROOT=fileURLToPath(new URL('../dist/',import.meta.url));
const MAX_BODY=65536;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff'};
const failure=(message,status=400)=>Object.assign(Error(message),{status});
function authorized(actual,expected){
 if(typeof actual!=='string')return false;
 const a=Buffer.from(actual),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);
}
async function readBody(req){
 if(!req.headers['content-type']?.toLowerCase().startsWith('application/json'))throw failure('操作必须使用JSON格式',415);
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw failure('操作内容过长',413);chunks.push(chunk);}
 try{const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body;}
 catch{throw failure('操作内容无效');}
}

// Only serves public assets and this computer's redacted view. It deliberately
// has no path to /api/rooms or the development adapter's fixed identity.
export async function startSteamServer({session=null,initError='',port=0,token=randomBytes(32).toString('hex'),staticDirectory=STATIC_ROOT}={}){
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('无效的本机端口');
 if(!/^[\w-]{24,128}$/.test(token))throw Error('无效的本机连接令牌');
 const root=resolve(staticDirectory);let origin;
 const status=()=>session?session.status():{ready:false,connected:false,name:'',steamId:'',lobbyId:'',hostId:'',isHost:false,members:[],error:initError||'Steam 尚未初始化，请先打开 Steam 并登录，再重新启动游戏。'};
 const payload=()=>({room:session?.getRoom()||null,status:status()});
 const server=createServer(async(req,res)=>{
  const send=(code,body,type='application/json; charset=utf-8')=>{res.writeHead(code,{'Content-Type':type});res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));};
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
  let localAccess=false;
  try{
   if(req.headers.host!==new URL(origin).host)throw failure('请使用启动器给出的本机地址',403);
   const url=new URL(req.url,origin);
   if(url.origin!==origin||req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&req.headers.origin!==origin))throw failure('请在本机游戏页面操作',403);
   if(url.pathname.startsWith('/api/')){
    if(!authorized(req.headers['x-steam-bridge'],token))throw failure('本机连接已失效，请使用启动器显示的完整地址重新打开',401);
    localAccess=true;
    if(req.method==='GET'&&url.pathname==='/api/steam/status')return send(200,{...status(),room:session?.getRoom()||null});
    if(req.method==='GET'&&url.pathname==='/api/steam/room')return send(200,payload());
    if(!['/api/steam/create','/api/steam/join','/api/steam/command','/api/steam/leave'].includes(url.pathname))throw failure('没有此联机接口',404);
    if(req.method!=='POST')throw failure('不支持此请求',405);
    if(req.headers.origin!==origin)throw failure('操作必须来自本机游戏页面',403);
    const body=await readBody(req);
    if(!session)throw failure(status().error,503);
    switch(url.pathname){
     case '/api/steam/create':await session.create(body.config);break;
     case '/api/steam/join':if(!/^\d{15,20}$/.test(body.lobbyId||''))throw failure('请输入完整的 Steam 数字房间号');await session.join(body.lobbyId);break;
     case '/api/steam/command':await session.command(body);break;
     case '/api/steam/leave':await session.leave();break;
    }
    return send(200,payload());
   }
   if(!['GET','HEAD'].includes(req.method))throw failure('不支持此请求',405);
   let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{throw failure('无效路径',400);}
   const parts=pathname.split(/[\\/]/).filter(Boolean);
   if(parts.some(part=>part.startsWith('.'))||['client','server'].includes(parts[0]))throw failure('文件不存在',404);
   const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
   if(!path.startsWith(root+sep)||!(await stat(path)).isFile())throw failure('文件不存在',404);
   send(200,req.method==='HEAD'?'':await readFile(path),MIME[extname(path)]||'application/octet-stream');
  }catch(error){
   if(res.headersSent){res.destroy();return;}
   const code=['ENOENT','ENOTDIR'].includes(error.code)?404:Number.isInteger(error.status)&&error.status>=400&&error.status<=599?error.status:400;
   let current={};if(localAccess){try{current=payload();}catch{}}
   send(code,{error:code===404?'文件或接口不存在':error.message||'Steam 操作失败',...current});
  }
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 await new Promise((accept,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);origin='http://127.0.0.1:'+server.address().port;accept();});});
 let closed=false;
 return {origin,url:origin+'/?steam=1#'+token,async close(){if(closed)return;closed=true;await new Promise((accept,reject)=>server.close(error=>error?reject(error):accept()));}};
}
