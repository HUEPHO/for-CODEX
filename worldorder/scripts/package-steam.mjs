import {mkdir,cp,copyFile,readdir,readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

// Builds into a fresh directory only. Never copies .local, databases, room
// snapshots, tokens or developer dependencies into a distributable client.
if(process.platform!=='win32'||process.arch!=='x64')throw Error('请在 Windows x64 下打包已验证的 Node 运行时');
const root=fileURLToPath(new URL('../',import.meta.url));
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z/,'Z');
const target=resolve(process.argv[2]||join(root,'.local/releases','WorldOrder-Steam-'+stamp));
await mkdir(dirname(target),{recursive:true});
await mkdir(target); // EEXIST is intentional: do not overwrite a prior release.
await mkdir(join(target,'dist'));await mkdir(join(target,'server'));await mkdir(join(target,'scripts'));
for(const file of await readdir(join(root,'dist'),{withFileTypes:true})){
 if(file.isFile())await copyFile(join(root,'dist',file.name),join(target,'dist',file.name));
 else if(file.name==='assets')await cp(join(root,'dist/assets'),join(target,'dist/assets'),{recursive:true,dereference:true,errorOnExist:true,force:false});
}
for(const file of ['rooms.js','steam-http.js','steam-native.js','steam-session.js','steam-store.js'])await copyFile(join(root,'server',file),join(target,'server',file));
for(const file of ['start-steam.mjs','check-steam-runtime.mjs'])await copyFile(join(root,'scripts',file),join(target,'scripts',file));
await copyFile(join(root,'Start-Steam.bat'),join(target,'Start-Steam.bat'));
await copyFile(join(root,'steam/README.txt'),join(target,'README.txt'));
await writeFile(join(target,'package.json'),JSON.stringify({name:'world-order-steam',private:true,type:'module',version:'0.3.0'},null,2)+'\n');
await mkdir(join(target,'steam'));await copyFile(join(root,'steam/package.json'),join(target,'steam/package.json'));
await cp(join(root,'steam/licenses'),join(target,'steam/licenses'),{recursive:true});
const require=createRequire(new URL('../steam/package.json',import.meta.url)),moduleRoot=dirname(require.resolve('steamworks.js/package.json'));
const moduleTarget=join(target,'steam/node_modules/steamworks.js');await mkdir(moduleTarget,{recursive:true});
for(const file of await readdir(moduleRoot)){if(['package.json','index.js','README.md','LICENSE'].includes(file)||file.endsWith('.d.ts'))await copyFile(join(moduleRoot,file),join(moduleTarget,file));}
await cp(join(moduleRoot,'dist/win64'),join(moduleTarget,'dist/win64'),{recursive:true});
await mkdir(join(target,'runtime'));await copyFile(process.execPath,join(target,'runtime/node.exe'));
const hashes=[];let size=0;
async function inventory(dir,prefix=''){
 for(const file of await readdir(dir,{withFileTypes:true})){
  const relative=prefix+file.name,path=join(dir,file.name);
  if(file.isDirectory())await inventory(path,relative+'/');
  else{const bytes=await readFile(path);size+=(await stat(path)).size;hashes.push(createHash('sha256').update(bytes).digest('hex')+'  '+relative);}
 }
}
await inventory(target);
await writeFile(join(target,'SHA256SUMS.txt'),hashes.sort().join('\n')+'\n');
console.log(JSON.stringify({directory:target,files:hashes.length,bytes:size,node:process.version,steamworks:require('steamworks.js/package.json').version}));
