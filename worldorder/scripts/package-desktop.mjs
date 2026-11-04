import {mkdir,cp,copyFile,readdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

// Electron distribution must be downloaded from the official 44.4.5 release
// and verified against SHASUMS256.txt before this script is run.
const root=fileURLToPath(new URL('../',import.meta.url));
const [electronDirectory,output,rcedit]=process.argv.slice(2);
if(!electronDirectory||!output)throw Error('Usage: node scripts/package-desktop.mjs <verified-electron-directory> <new-output-directory>');
const target=resolve(output),appRoot=join(target,'resources/app');
await mkdir(dirname(target),{recursive:true});await mkdir(target);
for(const file of await readdir(resolve(electronDirectory)))await cp(join(resolve(electronDirectory),file),join(target,file),{recursive:true,force:false,errorOnExist:true});
await rename(join(target,'electron.exe'),join(target,'World Order.exe'));
if(rcedit){
  const png=await readFile(join(root,'desktop/icon.png')),header=Buffer.alloc(22);
  header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
  const ico=join(target,'World Order.ico');await writeFile(ico,Buffer.concat([header,png]));
  execFileSync(resolve(rcedit),[join(target,'World Order.exe'),'--set-icon',ico,'--set-file-version','0.7.0.0','--set-product-version','0.7.0.0','--set-version-string','ProductName','World Order','--set-version-string','FileDescription','World Order','--set-version-string','OriginalFilename','World Order.exe','--set-version-string','CompanyName','World Order'],{windowsHide:true});
}
await mkdir(appRoot,{recursive:true});
await writeFile(join(appRoot,'package.json'),JSON.stringify({name:'world-order-desktop',productName:'World Order',version:'0.7.0',private:true,type:'module',main:'desktop/main.cjs'},null,2));
for(const folder of ['desktop','server','drizzle'])await cp(join(root,folder),join(appRoot,folder),{recursive:true});
await mkdir(join(appRoot,'dist'));
for(const file of await readdir(join(root,'dist'),{withFileTypes:true})){
  if(file.isFile())await copyFile(join(root,'dist',file.name),join(appRoot,'dist',file.name));
  else if(file.name==='assets')await cp(join(root,'dist/assets'),join(appRoot,'dist/assets'),{recursive:true});
}
await mkdir(join(appRoot,'scripts'));
for(const file of ['dev-local.mjs','start-steam.mjs'])await copyFile(join(root,'scripts',file),join(appRoot,'scripts',file));
await mkdir(join(appRoot,'runtime'));await copyFile(join(root,'runtime/node.exe'),join(appRoot,'runtime/node.exe'));
await copyFile(join(root,'desktop/licenses/Node.txt'),join(appRoot,'runtime/LICENSE.txt'));
await mkdir(join(appRoot,'steam'));
await copyFile(join(root,'steam/package.json'),join(appRoot,'steam/package.json'));
await cp(join(root,'steam/licenses'),join(appRoot,'steam/licenses'),{recursive:true});
const source=join(root,'steam/node_modules/steamworks.js'),destination=join(appRoot,'steam/node_modules/steamworks.js');
await mkdir(destination,{recursive:true});
for(const file of await readdir(source))if(['package.json','index.js','README.md','LICENSE'].includes(file)||file.endsWith('.d.ts'))await copyFile(join(source,file),join(destination,file));
await cp(join(source,'dist/win64'),join(destination,'dist/win64'),{recursive:true});
await writeFile(join(target,'开始游戏.txt'),'World Order · Windows 客户端预览版 0.7\n\n双击 World Order.exe 启动。整个文件夹须保持完整，无需安装 Node 或打开浏览器。\n\n本机对局：四位真人在同一台电脑轮流操作。右侧势力按钮打开实时玩家面板；用手牌左侧的“本机操作者”下拉框切换，或按“切到当前操作方”（开局为“下一位选牌”）。\nSteam 联机：先登录 Steam，再从主菜单进入；仍使用测试 App ID 480，跨电脑四人联机待实测。\nF11 / Alt+Enter：全屏切换。游戏菜单可返回主菜单、查看说明、布置新对局和退出。\n\n桌面使用滚轮上下浏览：手牌与玩家原图在最上方；下方为事件、公开牌区、七个地区和能力卡牌商店。只有右侧四方概况与顶部横向操作栏固定。地区依次为欧洲、中东、中亚／美洲、非洲、南亚、亚太；底部入口打开全局发展牌。盟国消耗后翻到原版背面，融合盟国显示金框与叠牌。改善关系时直接点击可用盟国选择减费，再点取消；最终确认后才实际消耗。点击玩家、事件或牌面查看浮层，再次点击原入口可关闭。\n\n开局点击战略资产与目标卡的图片，各弃掉一张。第一轮固定六张新手牌。点击手牌选择行动，在棋盘点选合法目标后确认；资产要求盖牌时，点击手牌选择要盖放的牌。贸易区按六类资源分列，设置进出口数量后确认结算。\n\n进度保存在 %APPDATA%\\World Order。请勿删除该目录。旧版文件夹、原浏览器存档及原房间数据库保留。切换版本前先退出旧客户端，避免单实例锁把新启动转回旧窗口。\n\n当前为桌面客户端预览版，沿用已有规则与卡牌，支持四位真人，未加入 AI 对手。房主退出客户端会中断 Steam 对局。\n');
await writeFile(join(target,'BUILD.json'),JSON.stringify({version:'0.7.0',electron:'44.4.5',electronZipSha256:'11c395820a5aaa8ebcc0686b476d0ac98a730274ebfbdc8cf5538a7c2815cb5d',node:process.version,built:new Date().toISOString(),privateUserDataIncluded:false},null,2));
const hashes=[];
async function walk(dir,prefix=''){for(const f of await readdir(dir,{withFileTypes:true})){const p=join(dir,f.name),name=prefix+f.name;if(f.isDirectory())await walk(p,name+'/');else hashes.push(createHash('sha256').update(await readFile(p)).digest('hex')+'  '+name);}}
await walk(target);await writeFile(join(target,'SHA256SUMS.txt'),hashes.sort().join('\n')+'\n');
console.log(JSON.stringify({directory:target,files:hashes.length}));
