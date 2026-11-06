import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {createTurnNotifier} from '../dist/turn-notification.js';
import {newRoom,changeRoom,playerView} from '../server/rooms.js';
import {currentActor} from '../dist/phase-state.js';
import {startLocalServer} from './dev-local.mjs';

const audio=fs.readFileSync(new URL('../dist/assets/audio/turn-main-star.mp3',import.meta.url));
const provenance=JSON.parse(fs.readFileSync(new URL('../dist/assets/audio/turn-main-star.source.json',import.meta.url),'utf8'));
assert.equal(audio.length,provenance.bytes);
assert.equal(crypto.createHash('sha256').update(audio).digest('hex'),provenance.sha256);

function state(actor='US'){
 return {config:{humans:['US','CN','EU','RU'],wit:false},current:'US',round:1,flow:{step:'actions',order:['US','CN','EU','RU']},actionTurns:{index:['US','CN','EU','RU'].indexOf(actor)}};
}
function snapshot(actor='US',{screen='game',seat='US',code='ABCD',local=false,isSteam=false}={}){
 const s=state(actor);return {screen,state:s,room:local?null:{code,seat,state:s,revision:1},isSteam};
}
function harness({soundReady=Promise.resolve(),resumeReady=null}={}){
 const events=new EventTarget(),calls={created:0,load:0,play:0,close:0,errors:[]};
 let lastSource,lastGain;
 const context={state:'suspended',destination:{},resume(){if(resumeReady)return resumeReady.then(()=>{this.state='running';});this.state='running';return Promise.resolve();},decodeAudioData:async bytes=>({bytes}),createBufferSource(){lastSource={connect(){},disconnect(){},start(){calls.play++;}};return lastSource;},createGain(){lastGain={gain:{value:0},connect(){},disconnect(){}};return lastGain;},close(){calls.close++;this.state='closed';return Promise.resolve();}};
 const notifier=createTurnNotifier({eventTarget:events,createAudioContext(){calls.created++;return context;},loadSound:async()=>{calls.load++;await soundReady;return audio.buffer;},onError:error=>calls.errors.push(error)});
 return {notifier,events,calls,context,get gain(){return lastGain?.gain.value;},async unlock(type='pointerdown'){events.dispatchEvent(new Event(type));await new Promise(resolve=>setImmediate(resolve));}};
}

const h=harness(),update=s=>h.notifier.update(s);
update(snapshot('CN'));update(snapshot('US'));
assert.equal(h.calls.created,0,'no AudioContext before a gesture');
assert.equal(h.calls.play,0,'locked audio does not queue a turn');
await h.unlock();
assert.equal(h.calls.play,0,'unlock does not replay an old turn');
update(snapshot('US'));assert.equal(h.calls.play,0,'repeated poll after unlock stays silent');
update(snapshot('CN'));update(snapshot('US'));assert.equal(h.calls.play,1,'other player to this seat');
update({...snapshot('US'),room:{...snapshot('US').room,revision:98}});
const viewed=snapshot('US');viewed.state.current='EU';update(viewed);
assert.equal(h.calls.play,1,'polls and viewed player changes are silent');
assert.equal(h.gain,.7);

const response=snapshot('CN');response.state.flow.cardResolution={owner:'CN',responder:'US'};
update(snapshot('CN'));update(response);
assert.equal(h.calls.play,2,'named card response uses the shared actor');
const returned=snapshot('CN');returned.state.flow.cardResolution={owner:'CN'};update(returned);
assert.equal(h.calls.play,2,'returning responsibility to another seat stays silent');
const event=snapshot('CN');event.state.eventVersion=1;event.state.config.wit=true;
event.state.flow.step='events';event.state.flow.eventResolution={stage:'bid',bidVersion:1,participants:['US','CN'],done:[]};
update(event);assert.equal(h.calls.play,3,'event bid response uses the shared actor');
event.state.flow.eventResolution.done=['US'];update(event);
assert.equal(h.calls.play,3,'the next participant is not this seat');

update(snapshot('CN',{screen:'lobby'}));update(snapshot('US',{screen:'lobby'}));
update(snapshot('US'));assert.equal(h.calls.play,3,'hall updates and returning to the game establish a silent baseline');
update(snapshot('CN'));update(snapshot('US'));assert.equal(h.calls.play,4);
update(snapshot('CN',{seat:null}));update(snapshot('US',{seat:null}));update(snapshot('US'));
assert.equal(h.calls.play,4,'spectating and joining an occupied turn are silent');
update(snapshot('CN',{code:'OTHER'}));update(snapshot('US'));
assert.equal(h.calls.play,4,'changing room does not sound');
update(snapshot('US',{seat:'CN'}));update(snapshot('CN',{seat:'CN'}));
assert.equal(h.calls.play,5,'changed seat gets a fresh baseline, then its own next turn');

update(snapshot('CN'));const automa=snapshot('US');automa.state.config.humans=['CN'];automa.state.config.automas={US:'normal',EU:'normal',RU:'normal'};
update(automa);assert.equal(h.calls.play,5,'advanced automa actor never sounds');
const basic=snapshot('US');basic.state.config.humans=['CN','EU'];update(snapshot('CN'));update(basic);
assert.equal(h.calls.play,5,'basic non-player actor never sounds');

update(snapshot('US',{local:true}));
update(snapshot('CN',{local:true}));assert.equal(h.calls.play,6,'local hotseat sounds on a new human actor');
const localView=snapshot('CN',{local:true});localView.state.current='RU';update(localView);
assert.equal(h.calls.play,6,'local hotseat switching viewed player is silent');
const localAutoma=snapshot('US',{local:true});localAutoma.state.config.humans=['CN'];localAutoma.state.config.automas={US:'hard'};update(localAutoma);
assert.equal(h.calls.play,6,'local advanced actor is silent');
update(snapshot('CN',{local:true}));assert.equal(h.calls.play,7,'local human resumes after an automa');
update(snapshot('US',{local:true,isSteam:true}));update(snapshot('CN',{local:true,isSteam:true}));
assert.equal(h.calls.play,7,'Steam without a seated room does not act as local hotseat');
update(snapshot('US',{screen:'room'}));update(snapshot('CN',{screen:'room'}));
assert.equal(h.calls.play,7,'room preparation is silent');

const reload=harness();await reload.unlock('keydown');reload.notifier.update(snapshot('US'));
assert.equal(reload.calls.play,0,'reload during own turn does not sound');
reload.notifier.update(snapshot('CN'));reload.notifier.update(snapshot('US'));assert.equal(reload.calls.play,1);
reload.notifier.destroy();await reload.unlock();reload.notifier.update(snapshot('CN'));reload.notifier.update(snapshot('US'));
assert.equal(reload.calls.play,1);assert.equal(reload.calls.created,1);assert.equal(reload.calls.close,1);

h.context.state='suspended';update(snapshot('CN'));update(snapshot('US'));assert.equal(h.calls.play,7,'suspended audio is not replayed');
await h.unlock('keydown');update(snapshot('US'));assert.equal(h.calls.play,7);
update(snapshot('CN'));update(snapshot('US'));assert.equal(h.calls.play,8,'new gesture resumes future audio');
assert.equal(h.calls.load,1);assert.equal(h.calls.created,1);assert.deepEqual(h.calls.errors,[]);
h.notifier.destroy();

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
const soundLoad=deferred(),audioResume=deferred(),firstGesture=harness({soundReady:soundLoad.promise,resumeReady:audioResume.promise});
firstGesture.notifier.update(snapshot('US',{local:true}));
const gesture=firstGesture.unlock();
firstGesture.notifier.update(snapshot('CN',{local:true}));
await gesture;assert.equal(firstGesture.calls.play,0,'new turn waits for audio loading');
soundLoad.resolve();await new Promise(resolve=>setImmediate(resolve));
assert.equal(firstGesture.calls.play,0,'decoded audio also waits for the gesture resume');
audioResume.resolve();await new Promise(resolve=>setImmediate(resolve));
assert.equal(firstGesture.calls.play,1,'first gesture can advance the turn before decoding/resume finishes');
firstGesture.notifier.update(snapshot('CN',{local:true}));assert.equal(firstGesture.calls.play,1,'ready callback and poll play once');
firstGesture.notifier.destroy();

for(const [label,next] of [
 ['hall',snapshot('US',{screen:'lobby'})],
 ['another actor',snapshot('CN')],
 ['another room',snapshot('US',{code:'NEXT'})],
 ['unseated',snapshot('US',{seat:null})]
]){
 const ready=deferred(),waiting=harness({soundReady:ready.promise});
 waiting.notifier.update(snapshot('CN'));const gesture=waiting.unlock();waiting.notifier.update(snapshot('US'));
 waiting.notifier.update(next);await gesture;ready.resolve();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(waiting.calls.play,0,`audio loading must not revive a reminder after ${label}`);
 waiting.notifier.destroy();
}
const hiddenLoad=deferred(),historical=harness({soundReady:hiddenLoad.promise});
historical.notifier.update(snapshot('CN'));historical.notifier.update(snapshot('US'));
await historical.unlock();hiddenLoad.resolve();await new Promise(resolve=>setImmediate(resolve));
assert.equal(historical.calls.play,0,'even delayed readiness cannot replay a transition before the gesture');
historical.notifier.destroy();

// One human + three automas can advance a full set of turns in one server
// command. Its before/after actor is the same, but this is a new human action.
const cards=JSON.parse(fs.readFileSync(new URL('../dist/cards.json',import.meta.url)));
const identity={user:'turn-audio-check',token:'host'};
let game=newRoom('TURNTEST',identity,cards,{automatonMode:'advanced',humans:['US'],automaDifficulty:'normal',dd:true,wit:false}),serial=0;
game=changeRoom(game,identity,{id:'start',op:'start'},cards);
function command(action){game=changeRoom(game,identity,{id:`action-${++serial}`,op:'action',action,gameRevision:game.gameRevision,seatRevision:game.seatRevisions.US},cards);}
command({type:'selectAssetDiscard',id:game.state.players.US.assetChoices[2].id});
command({type:'selectObjectiveDiscard',id:game.state.players.US.objectiveChoices[2]});
command({type:'chooseAssets'});
const solo=harness();await solo.unlock();
const roomSnapshot=()=>{const s=playerView(game.state,'US');return {screen:'game',state:s,room:{...game,state:s,seat:'US'}};};
solo.notifier.update(roomSnapshot());
const before=game.state.actionTurns.index;
assert.equal(currentActor(game.state),'US');
command({type:'passTurn',cardId:game.state.players.US.hand[0]});
assert.equal(currentActor(game.state),'US');assert.equal(game.state.actionTurns.index,before+4);
solo.notifier.update(roomSnapshot());assert.equal(solo.calls.play,1,'same human gets the next action after three automatic turns');
solo.notifier.update(roomSnapshot());assert.equal(solo.calls.play,1,'same command/poll does not replay');
const sequence=roomSnapshot();sequence.state.flow.cardResolution={owner:'US',index:0};
solo.notifier.update(sequence);sequence.state.flow.cardResolution.index=1;solo.notifier.update(sequence);
assert.equal(solo.calls.play,1,'own sequence steps in this action do not sound');
solo.notifier.destroy();

const directory=fs.mkdtempSync(path.join(os.tmpdir(),'world-order-audio-check-'));
let server;
try{
 server=await startLocalServer({port:0,dataDirectory:directory});
 const response=await fetch(server.origin+'/assets/audio/turn-main-star.mp3');
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'audio/mpeg');
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),audio,'local server delivers the exact audio asset');
}finally{
 await server?.close();
 assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert.ok(path.basename(directory).startsWith('world-order-audio-check-'));
 fs.rmSync(directory,{recursive:true,force:true});
}
console.log('Turn notification checks passed: real actor/response projection, one-human/three-automa server command, room seats, hotseat, hall/refresh/poll silence, first-gesture loading/resume race and stale reminder cancellation, BGA audio served with its MIME type.');
