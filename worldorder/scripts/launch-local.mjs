// The desktop shortcut must never silently open a server from another checkout.
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {startLocalServer} from './dev-local.mjs';

const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const samePath=(a,b)=>(process.platform==='win32'?resolve(a).toLowerCase():resolve(a))===(process.platform==='win32'?resolve(b).toLowerCase():resolve(b));
export async function readLaunchConfig(filename=resolve(root,'.local/launch-config.json')){
 let config;
 try{config=JSON.parse(await readFile(filename,'utf8'));}
 catch(error){if(error.code==='ENOENT')return {};throw error;}
 if(!config||typeof config!=='object'||Array.isArray(config)||typeof config.dataDirectory!=='string'||!config.dataDirectory.trim())throw Error('本地启动配置的 dataDirectory 必须是存档目录。');
 return {dataDirectory:resolve(dirname(filename),config.dataDirectory)};
}
export async function inspectLocalServer(origin){
 let response;
 try{response=await fetch(origin+'/__local-info',{signal:AbortSignal.timeout(2000)});}
 catch(error){if(error.cause?.code==='ECONNREFUSED')return null;throw Error('无法确认现有本地服务，请检查端口后重试。',{cause:error});}
 if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))return {application:'unknown'};
 const info=await response.json();
 return info&&typeof info.sourceRoot==='string'&&typeof info.dbPath==='string'?info:{application:'unknown'};
}
export async function launchLocal({port=8787,dataDirectory,openBrowser=true}={}){
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('本地端口无效');
 const origin='http://127.0.0.1:'+port,existing=port?await inspectLocalServer(origin):null;
 let service=null,info;
 if(existing){
  if(existing.application!=='world-order-local')throw Error(`端口 ${port} 已被旧版或其他服务占用，尚未打开网页。请先关闭该服务，再从本文件夹启动。`);
  if(!samePath(existing.sourceRoot,root))throw Error(`端口 ${port} 正在运行另一份 World Order：${existing.sourceRoot}。当前源码是 ${root}。尚未打开旧页面；请先关闭原服务，再启动本文件夹。原存档位于 ${existing.dbPath}。`);
  if(dataDirectory&&!samePath(existing.dbPath,resolve(dataDirectory,'rooms.sqlite')))throw Error(`当前服务使用另一存档：${existing.dbPath}。请先关闭它，再使用配置的存档目录启动。`);
  info={...existing,origin};
 }else{
  service=await startLocalServer({port,dataDirectory});
  info={application:'world-order-local',sourceRoot:root,dbPath:service.databasePath,origin:service.origin};
 }
 console.log(`World Order：${info.origin}`);
 console.log(`当前源码：${info.sourceRoot}`);
 console.log(`房间存档：${info.dbPath}`);
 if(openBrowser&&process.platform==='win32'){
  const browser=spawn('rundll32.exe',['url.dll,FileProtocolHandler',info.origin],{windowsHide:true,stdio:'ignore'});
  browser.on('error',error=>console.error('打开浏览器失败，请手动打开上面的网址：'+error.message));
 }
 return {service,info};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const config=await readLaunchConfig();
  const {service}=await launchLocal({port:Number(process.env.WORLD_ORDER_PORT||8787),dataDirectory:process.env.WORLD_ORDER_DATA||config.dataDirectory});
  if(service){
   console.log('保持此窗口运行。关闭窗口或按 Ctrl+C 停止本地房间服务。');
   const stop=()=>service.close().catch(error=>{console.error(error.message);process.exitCode=1;});
   process.once('SIGINT',stop);process.once('SIGTERM',stop);
  }
 }catch(error){console.error(error.message);process.exitCode=1;}
}
