// Local convenience launcher. The game itself runs in an ordinary browser.
import {startWebServer} from './start-web.mjs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const port=Number(process.env.WORLD_ORDER_PORT||8787);
try{
 const server=await startWebServer({port,host:'127.0.0.1',dataDirectory:process.env.WORLD_ORDER_DATA||fileURLToPath(new URL('../.web/',import.meta.url))});
 console.log(`World Order 网页版：${server.origin}`);
 console.log('保持此窗口运行。关闭窗口或按 Ctrl+C 停止房间服务器。');
 if(process.platform==='win32'){
  const opener=spawn('rundll32.exe',['url.dll,FileProtocolHandler',server.origin],{windowsHide:true,stdio:'ignore'});
  opener.on('error',()=>console.log('请在浏览器打开上面的网址。'));
 }
 const stop=()=>server.close().catch(error=>{console.error(error.message);process.exitCode=1;});
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
}catch(error){console.error('启动失败：'+error.message);process.exitCode=1;}
