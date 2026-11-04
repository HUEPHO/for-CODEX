import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startSteamServer} from '../server/steam-http.js';
import {createSteamStore} from '../server/steam-store.js';

let room={code:'109775243456789012',revision:0,seat:'US',state:{hand:['test-private-card']}},commands=0;
const session={status:()=>({ready:true,connected:true,steamId:'76561198000000001',lobbyId:room?.code,members:[]}),getRoom:()=>room,
 async create(config){room={...room,config};return room;},async join(id){room.code=id;return room;},async leave(){room=null;},
 async command(c){if(c.op==='denied')throw Object.assign(Error('不是你的行动'),{status:403});commands++;return room;}};
const token='x'.repeat(64),app=await startSteamServer({session,token});
const request=(path,body,headers={})=>fetch(app.origin+path,{method:body?'POST':'GET',headers:{'X-Steam-Bridge':token,...(body?{'Content-Type':'application/json',Origin:app.origin}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});
try{
 const page=await fetch(app.origin+'/?steam=1');assert.equal(page.status,200);assert.match(await page.text(),/app\.js/);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 for(const path of ['/api/steam/status','/api/steam/room','/api/rooms','/missing']){
  const denied=await fetch(app.origin+path);assert.ok([401,404].includes(denied.status));assert.ok(!(await denied.text()).includes('test-private-card'));
 }
 const cross=await request('/api/steam/room',null,{Origin:'https://foreign.example'});assert.equal(cross.status,403);assert.equal((await cross.json()).room,undefined);
 const host=await new Promise((accept,reject)=>{const req=httpRequest(app.origin+'/api/steam/status',{headers:{Host:'foreign.example','X-Steam-Bridge':token}},res=>{let raw='';res.on('data',part=>raw+=part);res.on('end',()=>accept({status:res.statusCode,body:raw}));});req.on('error',reject);req.end();});
 assert.equal(host.status,403);assert.ok(!host.body.includes('test-private-card'));
 const state=await request('/api/steam/room');assert.equal((await state.json()).room.seat,'US');
 const noOrigin=await fetch(app.origin+'/api/steam/command',{method:'POST',headers:{'X-Steam-Bridge':token,'Content-Type':'application/json'},body:'{}'});assert.equal(noOrigin.status,403);assert.equal(commands,0);
 assert.equal((await request('/api/steam/command',{id:'request-1',op:'action'})).status,200);assert.equal(commands,1);
 assert.equal((await request('/api/steam/command',{op:'denied'})).status,403);assert.equal(commands,1);
 assert.equal((await request('/api/steam/command',{id:'too-large',data:'x'.repeat(66000)})).status,413);assert.equal(commands,1);
 assert.equal((await request('/api/steam/join',{lobbyId:'76561198000000002'})).status,200);
 assert.equal((await request('/api/steam/join',{lobbyId:'ABC123'})).status,400);
 for(const path of ['/server/steam-session.js','/.local/last-room.json','/steam/node_modules/steamworks.js/index.js'])assert.equal((await fetch(app.origin+path)).status,404);
 await request('/api/steam/leave',{});assert.equal((await (await request('/api/steam/room')).json()).room,null);
}finally{await app.close();}
const unavailable=await startSteamServer({token,initError:'请打开 Steam'});
try{const status=await fetch(unavailable.origin+'/api/steam/status',{headers:{'X-Steam-Bridge':token}});assert.equal((await status.json()).ready,false);}finally{await unavailable.close();}
const broken=await startSteamServer({token,session:{status(){throw Error('损坏局面');},getRoom(){throw Error('损坏局面');}}});
try{const response=await fetch(broken.origin+'/api/steam/status',{headers:{'X-Steam-Bridge':token}});assert.equal(response.status,400);assert.equal((await response.json()).room,undefined);}finally{await broken.close();}
const directory=await mkdtemp(join(tmpdir(),'world-order-steam-store-'));
try{
 const store=createSteamStore(directory);assert.equal(await store.load(),null);
 await Promise.all([store.save({room:{revision:1}}),store.save({room:{revision:2}})]);assert.equal((await store.load()).room.revision,2);
 const file=join(directory,'last-room.json'),saved=JSON.parse(await readFile(file,'utf8'));saved.savedAt-=31*60*1000;await writeFile(file,JSON.stringify(saved));assert.equal(await store.load(),null);
 await writeFile(file,'{broken');assert.equal(await store.load(),null);
}finally{await rm(directory,{recursive:true,force:true});}
console.log('Steam HTTP passed: loopback/token/origin isolation, no unauthenticated view leaks, bounded commands, safe static files, unavailable Steam and atomic short-lived autosnapshots.');
