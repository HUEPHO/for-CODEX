import {createRequire} from 'node:module';
const require=createRequire(new URL('../steam/package.json',import.meta.url));
try{
 const steam=require('steamworks.js');
 console.log('Steam 原生模块加载成功：steamworks.js '+require('steamworks.js/package.json').version+'，'+process.platform+'/'+process.arch+'，Node '+process.version);
 if(process.argv.includes('--login')){
  try{const client=steam.init(Number(process.env.WORLD_ORDER_STEAM_APP_ID||480));console.log('Steam 登录连接成功：'+client.localplayer.getName());process.exit(0);}
  catch(error){console.error('Steam 登录连接未完成：'+error.message);process.exit(2);}
 }
}catch(error){console.error('Steam 原生模块加载失败：'+error.message);process.exitCode=1;}
