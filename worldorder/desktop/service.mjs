import {resolve} from 'node:path';
import {startLocalServer} from '../scripts/dev-local.mjs';
import {launchSteam} from '../scripts/start-steam.mjs';

// The pipe belongs to the desktop parent. Closing it also closes the server,
// including when the parent crashes or Windows terminates the game window.
let service, stopping=false;
async function stop() {
  if(stopping)return;stopping=true;
  const deadline=setTimeout(()=>process.exit(1),4000);deadline.unref();
  try{await service?.close();}finally{process.exit(0);}
}
process.stdin.resume();process.stdin.once('end',stop);
process.once('SIGTERM',stop);process.once('SIGINT',stop);
try {
  const [mode,directory,port]=process.argv.slice(2);
  if(!['local','steam'].includes(mode)||!directory)throw Error('Invalid desktop service configuration');
  // Steam startup logs contain the bridge URL; keep it off stdout, which is our
  // parent protocol. Only the ready message carries the URL to the native host.
  console.log=()=>{};
  service=mode==='steam'
    ?await launchSteam({port:Number(port),dataDirectory:resolve(directory,'steam')})
    :await startLocalServer({port:Number(port),dataDirectory:resolve(directory,'local')});
  if(stopping){await service.close();process.exit(0);}
  process.stdout.write(JSON.stringify({ready:true,url:service.url||service.origin})+'\n');
}catch(error){
  process.stdout.write(JSON.stringify({error:error.code==='EADDRINUSE'?'游戏端口被占用，请关闭其他 World Order 客户端后重试。':error.message})+'\n');
  await stop();
}
