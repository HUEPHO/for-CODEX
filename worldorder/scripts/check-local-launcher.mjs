import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {launchLocal,readLaunchConfig,inspectLocalServer} from './launch-local.mjs';

const directory=await mkdtemp(join(tmpdir(),'world-order-launch-')),token=randomUUID();
let app,fake;
async function fakeServer(info){
 const server=createServer((_req,res)=>{res.writeHead(info?200:404,{'Content-Type':info?'application/json':'text/plain'});res.end(info?JSON.stringify(info):'Old server');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server;
}
async function api(origin,path,body){const response=await fetch(origin+'/api/rooms'+path,{method:body?'POST':'GET',headers:{'X-Room-Token':token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.ok(response.ok,await response.clone().text());return response.json();}
try{
 const configFile=join(directory,'launch-config.json');assert.deepEqual(await readLaunchConfig(configFile),{});
 await writeFile(configFile,JSON.stringify({dataDirectory:'preserved-rooms'}));const config=await readLaunchConfig(configFile);assert.equal(config.dataDirectory,join(directory,'preserved-rooms'));
 let launch=await launchLocal({port:0,dataDirectory:config.dataDirectory,openBrowser:false});app=launch.service;
 const {info}=launch,port=Number(new URL(info.origin).port);assert.equal(info.dbPath,join(config.dataDirectory,'rooms.sqlite'));
 const remote=await inspectLocalServer(info.origin);assert.equal(remote.application,'world-order-local');assert.equal(remote.sourceRoot,resolve('.'));assert.equal(remote.dbPath,info.dbPath);
 assert.equal((await fetch(info.origin+'/__local-info',{method:'POST'})).status,405);
 const room=(await api(info.origin,'',{code:'LAUNCH',config:{dd:false,wit:false}})).room;
 const reused=await launchLocal({port,dataDirectory:config.dataDirectory,openBrowser:false});assert.equal(reused.service,null);assert.deepEqual(reused.info,info);
 await assert.rejects(()=>launchLocal({port,dataDirectory:join(directory,'different-save'),openBrowser:false}),/另一存档/);
 await app.close();app=null;
 launch=await launchLocal({port:0,...await readLaunchConfig(configFile),openBrowser:false});app=launch.service;assert.equal(launch.info.dbPath,info.dbPath);
 const resumed=(await api(launch.info.origin,'/LAUNCH')).room;assert.equal(resumed.code,room.code);assert.equal(resumed.revision,room.revision);
 await app.close();app=null;
 fake=await fakeServer({application:'world-order-local',sourceRoot:resolve(directory,'another-checkout'),dbPath:join(directory,'old','rooms.sqlite')});
 await assert.rejects(()=>launchLocal({port:fake.address().port,openBrowser:false}),/另一份 World Order/);assert.ok(fake.listening);await new Promise(resolve=>fake.close(resolve));fake=null;
 fake=await fakeServer(null);await assert.rejects(()=>launchLocal({port:fake.address().port,openBrowser:false}),/旧版或其他服务占用/);assert.ok(fake.listening);
 await writeFile(configFile,JSON.stringify({dataDirectory:''}));await assert.rejects(()=>readLaunchConfig(configFile),/dataDirectory/);
 console.log('Launcher checks passed: source identity, same-source reuse, old/foreign server refusal without stopping it, explicit database mismatch rejection, and saved-room restoration through a persistent data-directory configuration.');
}finally{
 if(app)await app.close();if(fake)await new Promise(resolve=>fake.close(resolve));
 assert.equal(dirname(directory),resolve(tmpdir()));assert.ok(basename(directory).startsWith('world-order-launch-'));await rm(directory,{recursive:true,force:true});
}
