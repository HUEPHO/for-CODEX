import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {createSteamTransport} from '../server/steam-native.js';
import {SteamSession} from '../server/steam-session.js';
import {createSteamStore} from '../server/steam-store.js';
import {startSteamServer} from '../server/steam-http.js';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function launchSteam({openBrowser=false,port=0,appId=480,dataDirectory=resolve(root,'.local/steam')}={}){
 let transport,session,initError='';
 try{
  transport=await createSteamTransport({appId});
  const cards=JSON.parse(await readFile(resolve(root,'dist/cards.json'),'utf8'));
  session=new SteamSession({transport,cards,store:createSteamStore(resolve(dataDirectory,transport.selfId))});
 }catch(error){initError=error.message;transport?.close();}
 let server;
 try{server=await startSteamServer({session,initError,port});}
 catch(error){session?.close();transport?.close();throw error;}
 console.log('World Order · Steam 四人联机');
 console.log(session?'已连接 Steam；在游戏大厅创建房间或输入数字房间号加入。':initError);
 console.log('本机游戏地址：'+server.url);
 console.log('把大厅的数字房间号发给其他玩家，不要分享这个本机地址。');
 console.log('关闭启动器会断开 Steam；房主退出后本局停止。');
 if(openBrowser&&process.platform==='win32')execFile('rundll32.exe',['url.dll,FileProtocolHandler',server.url],()=>{});
 let closed=false;
 return {...server,session,async close(){if(closed)return;closed=true;await server.close();await session?.close();transport?.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const app=await launchSteam({openBrowser:!process.argv.includes('--no-open'),port:Number(process.env.WORLD_ORDER_STEAM_PORT||0),appId:Number(process.env.WORLD_ORDER_STEAM_APP_ID||480)});
  const stop=()=>app.close().finally(()=>process.exit(0));process.once('SIGINT',stop);process.once('SIGTERM',stop);
 }catch(error){console.error(error.message);process.exit(1);}
}
