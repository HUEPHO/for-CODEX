// Bounded standalone-web transport checks, not another full game/rule suite.
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {startWebServer} from './start-web.mjs';

const directory=await mkdtemp(join(tmpdir(),'world-order-web-check-'));
const users=Object.fromEntries(['US','CN','EU','RU'].map(seat=>[seat,{token:randomUUID(),cookie:''}]));
let app;
try{
 await assert.rejects(()=>startWebServer({host:'0.0.0.0',port:0,dataDirectory:directory}),/PUBLIC_ORIGIN/);
 await assert.rejects(()=>startWebServer({publicOrigin:'http://localhost:8787/path',port:0,dataDirectory:directory}),/PUBLIC_ORIGIN/);
 app=await startWebServer({port:0,dataDirectory:directory});
 async function api(user,path='',command,extra={}){
  const response=await fetch(app.origin+'/api/rooms'+path,{method:command?'POST':'GET',headers:{'X-Room-Token':user.token,...(user.cookie?{Cookie:user.cookie}:{}),...(command?{'Content-Type':'application/json'}:{}),...extra},...(command?{body:JSON.stringify(command)}:{})});
  const setCookie=response.headers.get('set-cookie');
  if(setCookie){assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Lax/);user.cookie=setCookie.split(';')[0];}
  return {response,data:await response.json()};
 }
 async function ok(user,path='',command){const {response,data}=await api(user,path,command);assert.ok(response.ok,JSON.stringify(data));return data;}
 const html=await fetch(app.origin);assert.equal(html.status,200);assert.match(await html.text(),/app\.js/);
 const initialCookie=html.headers.get('set-cookie');assert.match(initialCookie,/HttpOnly/);users.US.cookie=initialCookie.split(';')[0];
 const htmlAgain=await fetch(app.origin+'/index.html',{method:'HEAD',headers:{Cookie:users.US.cookie}});assert.equal(htmlAgain.status,200);assert.equal(htmlAgain.headers.get('set-cookie'),null,'Reload keeps the established HTML visitor identity');
 const firstHead=await fetch(app.origin+'/index.html',{method:'HEAD'});assert.match(firstHead.headers.get('set-cookie'),/HttpOnly/,'Successful HTML HEAD can establish a visitor before any API requests');
 const asset=await fetch(app.origin+'/assets/board-US.webp');assert.equal(asset.headers.get('content-type'),'image/webp');assert.ok((await asset.arrayBuffer()).byteLength>1000);assert.equal(asset.headers.get('set-cookie'),null,'Asset requests do not issue or rotate visitor cookies');
 assert.equal((await fetch(app.origin+'/server/index.js')).status,404);
 assert.equal((await fetch(app.origin+'/.guest-signing-key')).status,404);
 assert.equal((await fetch(app.origin+'/%2e%2e%5c.web%5crooms.sqlite')).status,404);
 assert.equal((await fetch(app.origin+'/api/rooms')).status,401);
 const invalidHost=await new Promise((accept,reject)=>{const req=httpRequest(app.origin+'/api/rooms',{headers:{Host:'other.example','X-Room-Token':users.US.token}},res=>{res.resume();res.on('end',()=>accept(res.statusCode));});req.on('error',reject);req.end();});
 assert.equal(invalidHost,403);
 const cross=await api(users.US,'',undefined,{Origin:'https://other.example'});assert.equal(cross.response.status,403);assert.equal(cross.response.headers.get('set-cookie'),null);
 const crossSite=await api(users.US,'',undefined,{'Sec-Fetch-Site':'cross-site'});assert.equal(crossSite.response.status,403);
 const oversized=await fetch(app.origin+'/api/rooms',{method:'POST',headers:{'Content-Type':'application/json','X-Room-Token':users.US.token},body:JSON.stringify({padding:'x'.repeat(66000)})});assert.equal(oversized.status,413);
 const cookieBeforeApi=users.US.cookie;
 const [creation,initialList]=await Promise.all([api(users.US,'',{code:'WEB822',config:{dd:false,wit:false}}),api(users.US)]);
 assert.equal(creation.response.status,201);assert.equal(initialList.response.status,200);assert.equal(creation.response.headers.get('set-cookie'),null);assert.equal(initialList.response.headers.get('set-cookie'),null);assert.equal(users.US.cookie,cookieBeforeApi,'Parallel initial list/create requests keep the identity already issued by HTML');
 const created=creation.data.room;
 assert.equal(created.seat,'US');assert.equal(created.isHost,true);assert.ok(users.US.cookie);
 for(const seat of ['CN','EU','RU'])assert.equal((await ok(users[seat],'/WEB822',{id:randomUUID(),op:'join',seat})).room.seat,seat);
 assert.equal(new Set(Object.values(users).map(user=>user.cookie)).size,4,'Different browser visitors receive distinct signed identities');
 assert.equal((await ok(users.CN)).rooms.length,0,'Guest cannot list another guest’s created rooms');
 assert.equal((await ok(users.US)).rooms[0].code,'WEB822');
 const guestId=users.US.cookie.split('=')[1].split('.')[0];
 const stranger={token:users.US.token,cookie:users.CN.cookie};
 const forged=(await api(stranger,'/WEB822',undefined,{'oai-authenticated-user-id':'web-guest:'+guestId})).data.room;
 assert.equal(forged.seat,null);assert.equal(forged.isHost,false);
 const takeover=await api(stranger,'/WEB822',{id:randomUUID(),op:'join',seat:'US',takeover:true},{'oai-authenticated-user-id':'web-guest:'+guestId});assert.equal(takeover.response.status,409,'Client-supplied identity cannot take over another browser’s seat');
 const tampered={token:users.US.token,cookie:users.US.cookie.slice(0,-1)+(users.US.cookie.endsWith('A')?'B':'A')};
 assert.equal((await ok(tampered,'/WEB822')).room.seat,null,'Invalid cookie signature cannot resume a seat');
 assert.equal((await ok(users.US,'/WEB822')).room.seat,'US','Existing valid cookie remains usable after forgery attempts');
 const playing=(await ok(users.US,'/WEB822',{id:randomUUID(),op:'start'})).room;assert.equal(playing.status,'playing');
 const before=(await ok(users.US,'/WEB822')).room;
 assert.ok(before.state.players.US.hand.every(Boolean));assert.deepEqual(before.state.players.CN.hand,Array(6).fill(null));
 const selected=(await ok(users.US,'/WEB822',{id:randomUUID(),op:'action',gameRevision:before.gameRevision,seatRevision:before.seatRevision,action:{type:'selectAssetDiscard',id:before.state.players.US.assetChoices[0].id}})).room;
 const observed=(await ok(users.CN,'/WEB822')).room;assert.equal(observed.revision,selected.revision,'Other browser sees committed changes through the existing HTTP API');
 assert.equal(observed.state.players.US.assetChoices,null,'Other browser receives no hidden draft');
 const keyBefore=await readFile(join(directory,'.guest-signing-key'));
 await app.close();app=await startWebServer({port:0,dataDirectory:directory});
 assert.deepEqual(await readFile(join(directory,'.guest-signing-key')),keyBefore,'Signing identity survives server restart');
 const resumed=(await ok(users.US,'/WEB822')).room;assert.equal(resumed.seat,'US');assert.equal(resumed.isHost,true);assert.equal(resumed.revision,selected.revision);assert.deepEqual(resumed.state.players.US.assetSelection,selected.state.players.US.assetSelection);
 assert.equal((await ok(users.CN,'/WEB822')).room.seat,'CN');
 const newTab={cookie:users.US.cookie,token:randomUUID()};
 const reclaimed=(await ok(newTab,'/WEB822',{id:randomUUID(),op:'join',seat:'US',takeover:true})).room;assert.equal(reclaimed.seat,'US');assert.equal(reclaimed.isHost,true);assert.equal((await ok(users.US,'/WEB822')).room.seat,null,'Own guest can recover a closed tab without granting recovery to other guests');
 const explicitOrigin=app.origin,explicitPort=Number(new URL(explicitOrigin).port);await app.close();
 app=await startWebServer({port:explicitPort,host:'0.0.0.0',publicOrigin:explicitOrigin,dataDirectory:directory});
 assert.equal(app.origin,explicitOrigin);assert.equal((await ok(newTab,'/WEB822')).room.seat,'US','Explicit shared binding uses its configured origin and the same persistent identities');
 console.log('Web server passed: static HTML/assets, explicit bind/origin, distinct signed guest cookies, four seats, client-identity spoofing and tampered-cookie rejection, same-origin/body/path checks, shared updates and private drafts, SQLite plus guest-key restart, same-browser seat recovery.');
}finally{
 if(app)await app.close();
 // Only remove the exact temporary directory created by this test.
 assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('world-order-web-check-'));
 await rm(directory,{recursive:true,force:true});
}
