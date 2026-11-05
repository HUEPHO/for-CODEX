import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SteamSession} from '../server/steam-session.js';

const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
const seats=['US','CN','EU','RU'],ids=seats.map((_,i)=>'7656119800000000'+i);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const flush=()=>delay(10);
class MockNetwork{
 transports=new Map();members=new Set();lobbyId='109775242400000001';hostId=null;ownerId=null;epoch='test-session-epoch-1';packets=[];drop=()=>false;
 context(){return {lobbyId:this.lobbyId,hostId:this.hostId,ownerId:this.ownerId,epoch:this.epoch,connected:true,hostPresent:this.members.has(this.hostId),members:[...this.members].map(id=>({id,name:'玩家'+ids.indexOf(id)}))};}
 change(){for(const transport of this.transports.values())for(const fn of transport.changes)fn();}
 transport(id){
  const net=this,t={selfId:id,name:'玩家'+ids.indexOf(id),messages:new Set(),changes:new Set(),joined:false,
   context(){return this.joined?net.context():null;},
   async createLobby(){assert.equal(net.hostId,null);net.hostId=id;net.ownerId=id;this.joined=true;net.members.add(id);net.change();return this.context();},
   async joinLobby(lobbyId){assert.equal(lobbyId,net.lobbyId);this.joined=true;net.members.add(id);net.change();return this.context();},
   async leaveLobby(){this.joined=false;net.members.delete(id);if(net.ownerId===id)net.ownerId=[...net.members][0]||null;net.change();},
   send(peerId,message){
    if(!this.joined||!net.members.has(peerId))return false;
    const packet={from:id,to:peerId,message:structuredClone(message)};net.packets.push(packet);
    if(!net.drop(packet))queueMicrotask(()=>net.inject(id,peerId,packet.message));return true;
   },
   onMessage(fn){this.messages.add(fn);return()=>this.messages.delete(fn);},onChange(fn){this.changes.add(fn);return()=>this.changes.delete(fn);},
   close(){void this.leaveLobby();},
  };net.transports.set(id,t);return t;
 }
 inject(from,to,message){for(const fn of this.transports.get(to)?.messages||[])fn(from,structuredClone(message));}
}
const network=new MockNetwork(),saved=[];
const keepAlive=setInterval(()=>{},1000);
let storageFailure=false;
const store={async save(snapshot){if(storageFailure)throw Error('test disk failure');saved.push(structuredClone(snapshot));},async load(){return saved.at(-1);}};
const sessions=ids.map(id=>new SteamSession({transport:network.transport(id),cards,store:id===ids[0]?store:undefined,heartbeatMs:40,offlineMs:350,retryMs:70,requestMs:1200,tickMs:10}));
let serial=0;
const command=(session,op,extra={})=>{const view=session.getRoom();return {id:'test-'+(++serial),op,gameRevision:view?.gameRevision||0,seatRevision:view?.seatRevision||0,...extra};};
const send=(i,op,extra={})=>sessions[i].command(command(sessions[i],op,extra));
const act=(i,action)=>send(i,'action',{action});
const envelope=(type,extra={})=>({v:1,lobbyId:network.lobbyId,hostId:ids[0],epoch:network.epoch,type,...extra});

try{
 const lobby=await sessions[0].create({dd:true,wit:true});assert.equal(lobby.seat,'US');assert.equal(saved.length,1);
 await assert.rejects(sessions[0].create({}),/先离开/);
 await assert.rejects(send(0,'start'),/四名 Steam 玩家/);
 for(let i=1;i<4;i++){const joined=await sessions[i].join(network.lobbyId);assert.equal(joined.seat,null);await send(i,'join',{seat:seats[i]});}
 await assert.rejects(send(1,'join',{seat:'RU'}),/已经入座/);
 await assert.rejects(send(1,'start'),/创建房间/);
 assert.equal(sessions[0].status().members.filter(m=>m.connected).length,4);
 await send(0,'start');await flush();
 for(let i=0;i<4;i++){
  const view=sessions[i].getRoom();assert.equal(view.seat,seats[i]);assert.equal(view.state.current,seats[i]);
  for(const other of seats.filter(s=>s!==seats[i])){assert.ok(view.state.players[other].hand.every(x=>x===null));assert.equal(view.state.players[other].openingChoices,null);}
  assert.ok(view.state.players[seats[i]].assetChoices);assert.equal(view.state.players[seats[i]].openingChoices,null);
  assert.equal(view.history,undefined);assert.equal(view.receipts,undefined);assert.equal(view.host,undefined);
 }
 // Real simultaneous setup and the existing room rules remain authoritative.
 await Promise.all(sessions.map((s,i)=>act(i,{type:'selectAssetDiscard',id:s.getRoom().state.players[seats[i]].assetChoices[0].id})));
 for(let i=0;i<4;i++){
  const p=sessions[i].getRoom().state.players[seats[i]];
  await act(i,{type:'selectObjectiveDiscard',id:p.objectiveChoices[0]});
  await act(i,{type:'chooseAssets'});
 }
 await flush();
 for(let i=0;i<4;i++){
  const view=sessions[i].getRoom(),actual=saved.at(-1).room;
  assert.deepEqual(view.state.players[seats[i]].hand,actual.state.players[seats[i]].hand);
  for(const other of seats.filter(s=>s!==seats[i]))assert.ok(view.state.players[other].objectives.every(x=>x===null));
 }
 let actor=seats.indexOf(sessions[0].getRoom().actor),wrong=(actor+1)%4;
 await assert.rejects(act(wrong,{type:'resource',key:'money',delta:1}),/正在等待/);
 const state=sessions[actor].getRoom().state,money=state.players[seats[actor]].money;
 const first=command(sessions[actor],'action',{action:{type:'passTurn',cardId:state.players[seats[actor]].hand[0]}});
 const stale=command(sessions[wrong],'action',{action:{type:'resource',key:'money',delta:1}});
 await sessions[actor].command(first);const revision=sessions[actor].getRoom().gameRevision;
 await sessions[actor].command(first);assert.equal(sessions[actor].getRoom().gameRevision,revision);
 assert.equal(sessions[actor].getRoom().state.players[seats[actor]].money,money+10);
 await assert.rejects(sessions[wrong].command(stale),/局面已更新/);
 await assert.rejects(send(actor,'undo',{scope:'turn'}),/对方同意/);
 const approver=seats.indexOf(sessions[actor].getRoom().actor);
 await send(actor,'requestTurnRestart');await flush();
 await send(approver,'respondTurnRestart',{requestId:sessions[approver].getRoom().restartRequest.id,accept:true});await flush();
 assert.equal(sessions[actor].getRoom().state.players[seats[actor]].money,money);

 // A successful durable write is the only point after which a result is sent.
 const before=sessions[actor].getRoom();storageFailure=true;
 await assert.rejects(act(actor,{type:'passTurn',cardId:before.state.players[seats[actor]].hand[0]}),/disk failure|保存失败/);
 storageFailure=false;assert.equal(sessions[0].getRoom().revision,before.revision);

 // Client command acknowledgement must survive snapshots/heartbeats and retry
 // the same ID. Choose a nonhost actor by completing any initial host action.
 if(actor===0){await act(actor,{type:'passTurn',cardId:sessions[actor].getRoom().state.players[seats[actor]].hand[0]});actor=seats.indexOf(sessions[0].getRoom().actor);}
 assert.notEqual(actor,0);
 const preRetry=sessions[actor].getRoom(),retryCommand=command(sessions[actor],'action',{action:{type:'passTurn',cardId:preRetry.state.players[seats[actor]].hand[0]}});
 network.drop=p=>p.to===ids[actor]&&p.message.type==='result'&&p.message.requestId===retryCommand.id;
 let resolved=false;const pending=sessions[actor].command(retryCommand).then(view=>{resolved=true;return view;});
 await delay(180);assert.equal(resolved,false,'unrelated snapshots/pongs cannot confirm an action');
 assert.equal(sessions[actor].getRoom().state.players[seats[actor]].money,preRetry.state.players[seats[actor]].money+10);
 network.drop=()=>false;await pending;
 assert.ok(network.packets.filter(p=>p.from===ids[actor]&&p.message.type==='command'&&p.message.requestId===retryCommand.id).length>=2);
 assert.equal(sessions[actor].getRoom().state.players[seats[actor]].money,preRetry.state.players[seats[actor]].money+10);

 // Forged sender/host/epoch, stale snapshots, extra identity fields and oversized
 // payloads must not modify either the authoritative state or a client view.
 const target=sessions[2],baseline=target.getRoom(),fake={...baseline,revision:baseline.revision+5000};
 network.inject(ids[1],ids[2],envelope('snapshot',{room:fake}));
 network.inject('76561198999999999',ids[2],envelope('snapshot',{room:fake}));
 network.inject(ids[0],ids[2],{...envelope('snapshot',{room:fake}),epoch:'old-session-epoch'});
 network.inject(ids[0],ids[2],envelope('snapshot',{room:{...baseline,revision:0}}));
 network.inject(ids[0],ids[2],envelope('snapshot',{room:fake,name:'x'.repeat(513*1024)}));
 assert.equal(target.getRoom().revision,baseline.revision);
 await assert.rejects(target.command({...command(target,'join',{seat:'EU'}),identity:{user:'steam:'+ids[0]}}),/不能指定玩家身份/);
 const hostRevision=sessions[0].getRoom().revision;
 network.inject('76561198999999999',ids[0],envelope('command',{requestId:'evil',command:{id:'evil',op:'reset',gameRevision:sessions[0].getRoom().gameRevision}}));
 await flush();assert.equal(sessions[0].getRoom().revision,hostRevision);
 assert.equal(sessions[2].status().members.find(m=>m.steamId===ids[1]).connected,true);

 // One peer losing its data channel cannot falsely mark the other peers offline.
 network.drop=p=>p.from===ids[3]||p.to===ids[3];await delay(420);
 assert.equal(sessions[3].status().connected,false);
 assert.equal(sessions[0].status().members.find(m=>m.steamId===ids[3]).connected,false);
 assert.equal(sessions[0].status().members.find(m=>m.steamId===ids[1]).connected,true);
 await assert.rejects(send(3,'join',{seat:'RU'}),error=>error.status===503);
 network.drop=()=>false;await delay(100);assert.equal(sessions[3].status().connected,true);

 // A request which exhausts all acknowledgements reports a timeout, but keeping
 // its ID for a later retry still cannot execute that accepted command twice.
 const timedCommand=command(sessions[3],'join',{seat:'RU'});
 network.drop=p=>p.to===ids[3]&&p.message.type==='result'&&p.message.requestId===timedCommand.id;
 await assert.rejects(sessions[3].command(timedCommand),error=>error.status===504&&error.transient);
 const timedRevision=sessions[3].getRoom().revision;
 network.drop=()=>false;await sessions[3].command(timedCommand);
 assert.equal(sessions[3].getRoom().revision,timedRevision);

 // Returning the same authenticated Steam account restores its reserved seat,
 // without accepting an old tab token or sending any other seat's private view.
 const reconnectSeat=sessions[3].getRoom().seat;
 await sessions[3].leave();assert.equal(sessions[0].status().members.length,3);
 assert.equal(sessions[0].getRoom().seats.RU.occupied,true);
 const rejoined=await sessions[3].join(network.lobbyId);assert.equal(rejoined.seat,reconnectSeat);
 assert.ok(rejoined.state.players.US.hand.every(x=>x===null));

 // The optional original-host restore uses only the exact Lobby/epoch snapshot.
 // A prepared secret-bidding state exercises the same per-seat projection over
 // actual session messages, including the host browser's own redacted view.
 const recoveryNetwork=new MockNetwork(),checkpoint=structuredClone(saved.at(-1));
 checkpoint.room.state.flow.step='events';
 checkpoint.room.state.flow.eventResolution={mode:'bid',stage:'bid',participants:seats,done:['US'],submissions:{US:{bid:3},CN:{bid:5}}};
 recoveryNetwork.hostId=ids[0];recoveryNetwork.ownerId=ids[0];recoveryNetwork.members.add(ids[0]);
 const recovery=[];
 try{
  for(let i=0;i<4;i++){
   const transport=recoveryNetwork.transport(ids[i]);if(i===0)transport.joined=true;
   recovery.push(new SteamSession({transport,cards,store:i===0?{async load(){return checkpoint;},async save(){}}:undefined}));
   const view=await recovery[i].join(recoveryNetwork.lobbyId);
   assert.equal(view.seat,seats[i]);
   assert.deepEqual(Object.keys(view.state.flow.eventResolution.submissions),i<2?[seats[i]]:[]);
   assert.ok(view.state.players[seats[(i+1)%4]].hand.every(x=>x===null));
  }
 }finally{for(const session of recovery)session.close();}
 const damagedNetwork=new MockNetwork();damagedNetwork.hostId=ids[0];damagedNetwork.ownerId=ids[0];damagedNetwork.members.add(ids[0]);
 const damagedTransport=damagedNetwork.transport(ids[0]);damagedTransport.joined=true;
 const damaged=structuredClone(checkpoint);damaged.room.state.players.CN.played=null;
 const rejectedRecovery=new SteamSession({transport:damagedTransport,cards,store:{async load(){return damaged;}}});
 try{
  await assert.rejects(rejectedRecovery.join(damagedNetwork.lobbyId),error=>error.status===503&&/损坏/.test(error.message));
  assert.equal(rejectedRecovery.getRoom(),null);assert.equal(rejectedRecovery.status().connected,false);
 }finally{rejectedRecovery.close();}

 // Every state-bearing packet is a single roomView for its actual destination.
 for(const packet of network.packets.filter(p=>p.message.room)){
  const view=packet.message.room;
  assert.equal(view.host,undefined);assert.equal(view.receipts,undefined);assert.equal(view.history,undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(packet.message))<=512*1024);
  if(view.state)for(const seat of seats.filter(s=>s!==view.seat))assert.ok(view.state.players[seat].hand.every(x=>x===null));
 }

 // Steam automatically changes Lobby owner; that must never migrate game
 // authority, even if the original host subsequently returns to the Lobby.
 await sessions[0].leave();await flush();
 for(const session of sessions.slice(1)){assert.equal(session.status().connected,false);await assert.rejects(session.command(command(session,'undo')),/原房主已离开/);}
 assert.equal(network.ownerId,ids[1]);
 network.members.add(ids[0]);network.ownerId=ids[0];network.transports.get(ids[0]).joined=true;network.change();
 assert.equal(sessions[1].status().connected,false);
 assert.ok(saved.every(snapshot=>snapshot.lobbyId===network.lobbyId&&snapshot.hostId===ids[0]&&snapshot.epoch===network.epoch&&snapshot.room.state));
 console.log('Steam session: four real room-engine seats, private setup/views, authority, durable saves, exact command retries, stale/forged/oversized messages, same-account reconnect, heartbeat presence and fixed-host shutdown passed.');
}finally{clearInterval(keepAlive);for(const session of sessions)session.close();}
