import {currentActor} from './phase-state.js';
import {humanPlayers} from './player-configuration.js';

// BGA's public default yourturn sound is main_Star. Keep a local copy so play
// does not depend on BGA availability or disclose this game's activity to it.
const SOUND_URL=new URL('./assets/audio/turn-main-star.mp3',import.meta.url);
async function loadTurnSound(){
 const response=await fetch(SOUND_URL);
 if(!response.ok)throw Error(`提示音加载失败：${response.status}`);
 return response.arrayBuffer();
}
function browserAudioContext(){
 const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
 return AudioContext?new AudioContext():null;
}
function turnTarget({screen,state,room,isSteam=false}){
 if(screen!=='game'||!state||room&&(!room.state||!room.seat)||isSteam&&!room)return null;
 const actor=currentActor(state);
 const turn=state.flow?.step==='actions'?`${state.round}:${state.actionTurns.index}`:null;
 return {scope:room?`${room.code}:${room.seat}`:'local',actor,turn,audible:humanPlayers(state).includes(actor)&&(!room||room.seat===actor)};
}

// Call after the rendered state/room changes. The first snapshot, including a
// return from the hall or a new seat, establishes a silent baseline. In local
// hotseat play the actual actor matters; changing the viewed player does not.
export function createTurnNotifier({eventTarget=globalThis.document,createAudioContext=browserAudioContext,loadSound=loadTurnSound,onError=error=>console.warn('回合提示音不可用',error)}={}){
 let previous=null,context=null,buffer=null,loading=null,unlocking=null,pending=null,destroyed=false;
 const sameTarget=(a,b)=>a&&b&&a.scope===b.scope&&a.actor===b.actor&&a.turn===b.turn;
 function playPending(){
  if(destroyed||!pending||!buffer||context?.state!=='running')return;
  const target=pending;pending=null;
  if(!sameTarget(previous,target)||!previous.audible)return;
  const source=context.createBufferSource();source.buffer=buffer;
  const gain=context.createGain();gain.gain.value=.7;
  source.connect(gain);gain.connect(context.destination);
  source.onended=()=>{source.disconnect();gain.disconnect();};
  source.start();
 }
 function unlock(){
  if(destroyed)return;
  context??=createAudioContext();
  if(!context||unlocking||context.state==='running'&&buffer)return;
  const resumed=context.state==='running'?Promise.resolve():context.resume();
  if(!loading)loading=loadSound().then(bytes=>context.decodeAudioData(bytes)).then(decoded=>{if(!destroyed)buffer=decoded;}).catch(error=>{loading=null;throw error;});
  unlocking=Promise.all([resumed,loading]).then(()=>{unlocking=null;playPending();}).catch(error=>{unlocking=null;pending=null;if(!destroyed)onError(error);});
 }
 eventTarget?.addEventListener('pointerdown',unlock,{capture:true});
 eventTarget?.addEventListener('keydown',unlock,{capture:true});
 return {
  update(snapshot){
   if(destroyed)return;
   const next=turnTarget(snapshot),changed=previous&&next&&previous.scope===next.scope&&(previous.actor!==next.actor||next.turn&&previous.turn!==next.turn);
   if(pending&&(!sameTarget(next,pending)||!next.audible))pending=null;
   previous=next;
   // Only a transition after a gesture may wait for audio. Keep the newest
   // current target; never replay a historical turn after a later unlock.
   if(changed&&next.audible&&(unlocking||buffer&&context?.state==='running'))pending=next;
   playPending();
  },
  destroy(){
   destroyed=true;previous=null;pending=null;
   eventTarget?.removeEventListener('pointerdown',unlock,{capture:true});
   eventTarget?.removeEventListener('keydown',unlock,{capture:true});
   if(context)context.close().catch(onError);
  }
 };
}
