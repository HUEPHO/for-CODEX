import {mkdir,cp,copyFile,readdir,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url)),target=resolve(process.argv[2]||'');
if(!process.argv[2])throw Error('Usage: node scripts/package-web.mjs <new-output-directory>');
await mkdir(target);
await mkdir(join(target,'dist'));
for(const entry of await readdir(join(root,'dist'),{withFileTypes:true})){
 if(entry.isFile())await copyFile(join(root,'dist',entry.name),join(target,'dist',entry.name));
 else if(entry.name==='assets')await cp(join(root,'dist/assets'),join(target,'dist/assets'),{recursive:true});
}
for(const folder of ['server','drizzle'])await cp(join(root,folder),join(target,folder),{recursive:true});
await mkdir(join(target,'scripts'));
for(const name of ['start-web.mjs','launch-web.mjs'])await copyFile(join(root,'scripts',name),join(target,'scripts',name));
await mkdir(join(target,'runtime'));
await copyFile(join(root,'runtime/node.exe'),join(target,'runtime/node.exe'));
await copyFile(join(root,'desktop/licenses/Node.txt'),join(target,'runtime/LICENSE.txt'));
await writeFile(join(target,'package.json'),JSON.stringify({name:'world-order-web',version:'0.8.0',private:true,type:'module',engines:{node:'>=24.0.0'},scripts:{start:'node scripts/start-web.mjs'}},null,2));
await writeFile(join(target,'启动网页版.cmd'),'@echo off\r\ncd /d "%~dp0"\r\n"%~dp0runtime\\node.exe" "%~dp0scripts\\launch-web.mjs"\r\nif errorlevel 1 pause\r\n');
await copyFile(join(root,'docs/web-package-readme.txt'),join(target,'使用说明.txt'));
await writeFile(join(target,'.gitignore'),'data/\n.web/\n.env\n');
await writeFile(join(target,'BUILD.json'),JSON.stringify({version:'0.8.0',variant:'html-web',built:new Date().toISOString(),node:process.version,privateUserDataIncluded:false},null,2));
const hashes=[];
async function walk(dir,prefix=''){for(const e of await readdir(dir,{withFileTypes:true})){const name=prefix+e.name,p=join(dir,e.name);if(e.isDirectory())await walk(p,name+'/');else hashes.push(createHash('sha256').update(await readFile(p)).digest('hex')+'  '+name);}}
await walk(target);await writeFile(join(target,'SHA256SUMS.txt'),hashes.sort().join('\n')+'\n');
console.log(JSON.stringify({directory:target,files:hashes.length}));
