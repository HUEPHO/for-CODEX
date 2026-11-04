// Development only: authored dist/ assets and the real room API on one origin.
// Production is still built by scripts/build.mjs and authenticated by Sites.
import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {roomApi} from './server/index.js';
import {developmentDatabase} from './scripts/development-db.mjs';
const root=fileURLToPath(new URL('./',import.meta.url));
export default defineConfig({
 root:fileURLToPath(new URL('./dist/',import.meta.url)),
 cacheDir:root+'node_modules/.vite',
 server:{host:'127.0.0.1',allowedHosts:['terminal.local'],fs:{allow:[root+'dist']}},
 plugins:[{name:'world-order-development-rooms',async configureServer(server){
  const database=await developmentDatabase(root);
  server.httpServer?.once('close',()=>database.close());
  server.middlewares.use(async(req,res,next)=>{
   if(!req.url?.startsWith('/api/rooms'))return next();
   try{
    const headers=new Headers();
    for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
    headers.set('oai-authenticated-user-id','world-order-local-development');
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>65536){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
    const request=new Request(new URL(req.url,'http://'+req.headers.host),{method:req.method,headers,
     ...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const response=await roomApi(request,{DB:database.DB});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
   }catch(error){console.error('Development room API:',error.message);res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'开发房间暂时不可用'}));}
  });
 }}],
});
