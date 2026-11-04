import {build} from 'esbuild';
import {cp,mkdir,readdir,rm,readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url),dist=new URL('dist/',root);
// dist's authored static files stay in place; generated Worker/client output is ignored.
for(const dir of ['client','server','.openai'])await rm(new URL(dir,dist),{recursive:true,force:true});
await mkdir(new URL('client/',dist),{recursive:true});
for(const entry of await readdir(dist,{withFileTypes:true})){
 if(['client','server','.openai'].includes(entry.name))continue;
 await cp(new URL(entry.name,dist),new URL('client/'+entry.name,dist),{recursive:true});
}
await build({entryPoints:[new URL('server/index.js',root).pathname],outfile:new URL('server/index.js',dist).pathname,bundle:true,format:'esm',platform:'browser',target:'es2022',legalComments:'none'});
await mkdir(new URL('.openai/',dist),{recursive:true});
await cp(new URL('.openai/hosting.json',root),new URL('.openai/hosting.json',dist));
await cp(new URL('drizzle/',root),new URL('.openai/drizzle/',dist),{recursive:true});
const manifest=JSON.parse(await readFile(new URL('.openai/hosting.json',dist),'utf8'));
if(manifest.static||manifest.d1!=='DB')throw Error('房间发布必须包含 DB 与 Worker');
console.log('Room Worker, existing game assets and database migrations are ready.');
