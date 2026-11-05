import {applyAction,createState} from '../dist/engine.js';
import {applyDebugAction,DEBUG_ROLLBACK_REASON} from '../dist/debug-mode.js';
import {debugModeIssue} from '../dist/action-policy.js';
import {countryPileContents} from '../dist/country-pile-view.js';
import {createRollback,recordRollback,restoreRollback,rollbackAvailability,requestTurnRestart,respondTurnRestart,cancelTurnRestart,turnRestartRequestView} from '../dist/rollback-state.js';
import {SEATS,SETUP_ACTIONS,setupPending,assertRoomAction,roomActor} from '../dist/room-rules.js';

export class RoomError extends Error{
 constructor(message,status=400){super(message);this.status=status;}
}
export function seatFor(room,identity){
 return SEATS.find(id=>room.seats[id]?.token===identity.token&&room.seats[id]?.user===identity.user)||null;
}
export const isHost=(room,identity)=>room.host.token===identity.token&&room.host.user===identity.user;
export function newRoom(code,identity,cards,config,now=Date.now()){
 const seats=Object.fromEntries(SEATS.map(id=>[id,null]));seats.US={...identity};
 return {code,version:1,revision:0,gameRevision:0,seatRevisions:Object.fromEntries(SEATS.map(id=>[id,0])),
  host:{...identity},seats,status:'lobby',state:createState(cards,config),rollback:createRollback(),history:[],receipts:[],createdAt:now,updatedAt:now};
}
function ensureFresh(room,seat,command){
 if(command.op==='action'&&SETUP_ACTIONS.has(command.action?.type)){
  if(command.seatRevision!==room.seatRevisions[seat])throw new RoomError('本方选牌已更新，请查看最新选择后重试',409);
 }else if(command.gameRevision!==room.gameRevision)throw new RoomError('局面已更新，本次操作未执行，请查看最新局面后重试',409);
}
export function changeRoom(room,identity,command,cards,now=Date.now()){
 if(!command||typeof command.id!=='string'||command.id.length>80)throw new RoomError('操作编号无效');
 // A retry after a lost response must never pay, draw or advance a second time.
 if(room.receipts.some(r=>r.id===command.id&&r.token===identity.token&&r.user===identity.user))return room;
 // Reducers clone only the live state. Historical states are immutable and
 // never cloned recursively with every command or nested inside snapshots.
 const next={...room,seats:{...room.seats},seatRevisions:{...room.seatRevisions},receipts:[...room.receipts],history:[]},seat=seatFor(room,identity);
 const host=isHost(room,identity);
 switch(command.op){
  case 'join':{
   const target=command.seat;
   if(!SEATS.includes(target))throw new RoomError('请选择有效势力');
   if(seat&&seat!==target)throw new RoomError('本标签页已经入座；请先离开当前席位');
   const occupant=next.seats[target];
   if(occupant?.token!==identity.token&&occupant){
    if(!command.takeover||occupant.user!==identity.user)throw new RoomError('该势力已有人入座，请选择空位',409);
    if(occupant.token===next.host.token&&next.host.user===identity.user)next.host={...identity};
    next.rollback=createRollback('席位已接管，旧标签页的撤回快照已清除');
   }
   next.seats[target]={...identity};break;
  }
  case 'leave':if(seat){next.seats[seat]=null;next.rollback=createRollback('席位已离开，撤回快照已清除');}break;
  case 'start':{
   if(!host)throw new RoomError('由创建房间的标签页开始对局',403);
   if(room.status!=='lobby')throw new RoomError('对局已经开始');
   if(SEATS.some(id=>!room.seats[id]))throw new RoomError('四个势力全部入座后即可开始');
   next.status='playing';next.rollback=createRollback();next.gameRevision++;break;
  }
  case 'reset':{
   if(!host)throw new RoomError('只有房主可以重新布置房间',403);
   if(command.gameRevision!==room.gameRevision)throw new RoomError('局面已更新，请重新确认布置',409);
   next.state=createState(cards,command.config);next.status='lobby';next.rollback=createRollback();next.gameRevision++;
   for(const id of SEATS)next.seatRevisions[id]++;break;
  }
  case 'undo':{
   if(!seat)throw new RoomError('你的席位已离开或被接管，请重新入座',403);
   ensureFresh(room,seat,command);
   try{const restored=restoreRollback(room.rollback,{seat,...identity},command.scope||'step',now,room.state);next.state=restored.state;next.rollback=restored.rollback;}
   catch(error){throw new RoomError(error.message);}
   next.gameRevision++;
   for(const id of SEATS)next.seatRevisions[id]++;break;
  }
  case 'requestTurnRestart':case 'respondTurnRestart':case 'cancelTurnRestart':{
   if(room.status!=='playing'||!seat)throw new RoomError('请先进入对局并入座',403);
   ensureFresh(room,seat,command);
   const actor={seat,...identity};
   if(command.op==='requestTurnRestart'){
    const target=rollbackAvailability(room.rollback,actor,now,room.state).turn.approver;
    next.rollback=requestTurnRestart(room.rollback,actor,room.seats[target]?{seat:target,...room.seats[target]}:null,room.state,command.id,now);
   }else if(command.op==='cancelTurnRestart')next.rollback=cancelTurnRestart(room.rollback,actor,room.state,command.requestId,now);
   else{
    const restored=respondTurnRestart(room.rollback,actor,room.state,command.requestId,command.accept,now);
    next.state=restored.state;next.rollback=restored.rollback;
    if(command.accept){next.gameRevision++;for(const id of SEATS)next.seatRevisions[id]++;}
   }
   break;
  }
  case 'debug':{
   const issue=debugModeIssue({isHost:host,seat,status:room.status});
   if(issue)throw new RoomError(issue,403);
   if(command.gameRevision!==room.gameRevision)throw new RoomError('局面已更新，请重新读取后调整',409);
   next.state=applyDebugAction(room.state,command.action,cards);
   next.rollback=createRollback(DEBUG_ROLLBACK_REASON);next.gameRevision++;
   for(const id of SEATS)next.seatRevisions[id]++;
   break;
  }
  case 'action':{
   if(room.status!=='playing')throw new RoomError('请等待房主开始对局');
   if(!seat)throw new RoomError('你的席位已离开或被接管，请重新入座',403);
   ensureFresh(room,seat,command);assertRoomAction(room.state,seat,command.action);
   const input={...room.state,current:seat};
   const updated=applyAction(input,command.action);
   // Choosing a view is never a shared game mutation. Restore the engine's
   // actual actor after simultaneous setup or a manual event adjustment.
   updated.current=roomActor(updated)||room.state.current;
   next.rollback=recordRollback(room.rollback,room.state,updated,{seat,...identity,action:command.action,now});
   next.state=updated;next.gameRevision++;next.seatRevisions[seat]++;break;
  }
  default:throw new RoomError('未知房间操作');
 }
 next.revision++;next.updatedAt=now;
 next.receipts.push({id:command.id,...identity});next.receipts=next.receipts.slice(-64);
 return next;
}
const hidden=arr=>Array.isArray(arr)?Array(arr.length).fill(null):arr;
export function playerView(source,seat){
 const s=structuredClone(source),q=source.flow?.cardResolution,step=q?.steps[q.index];
 const inspected=q?.owner===seat&&step?.type==='copyAbility'?q.context.inspectedPlayer:null;
 for(const [id,p] of Object.entries(s.players)){
  p.setupPending=setupPending(p);p.deck=hidden(p.deck);
  if(id===seat){
   // These random drafts are generated on setup, but become information for
   // this player only after the opening-hand group has been committed.
   if(p.openingChoices){p.assetChoices=null;p.objectiveChoices=null;p.assetSelection=[];p.objectiveSelection=[];}
   continue;
  }
  if(id!==inspected)p.hand=hidden(p.hand);
  // Chosen strategic assets are face up; only the unconfirmed draft is private.
  p.objectives=hidden(p.objectives);
  if(p.scoredObjectives)p.scoredObjectives=p.scoredObjectives.map(({cardId,tasks,...entry})=>entry);
  p.openingChoices=null;p.assetChoices=null;p.objectiveChoices=null;p.assetSelection=[];p.objectiveSelection=[];
  p.played=p.played.map(card=>(p.faceDownPlayed||[]).includes(card)?null:card);p.faceDownPlayed=[];
 }
 if(s.flow?.turnCards){
  const covered=new Set(Object.entries(source.players).filter(([id])=>id!==seat).flatMap(([,p])=>p.faceDownPlayed||[]));
  s.flow.turnCards=s.flow.turnCards.map(card=>covered.has(card)?null:card);
 }
 for(const key of ['marketDeck','eraDeck','era2Deck'])s[key]=hidden(s[key]);
 const searched=q?.owner===seat&&step?.type==='effect'?step.card.countrySearchRegion:null;
 for(const [id,r] of Object.entries(s.regions)){
  r.publicCountryPiles=countryPileContents(source.regions[id]);
  const eventReward=s.flow?.eventResolution?.rewardQueue?.[0];
  if(id===searched||eventReward?.type==='bricsCountry'&&eventReward.owner===seat&&['N','A'].includes(id))continue;
  r.deck=hidden(r.deck);
  if(r.countryPiles)for(const pile of ['left','right'])r.countryPiles[pile]=r.countryPiles[pile].map((card,i)=>i===0?card:null);
 }
 if(s.flow?.battlefieldReturn&&s.flow.battlefieldReturn.owner!==seat)s.flow.battlefieldReturn={owner:s.flow.battlefieldReturn.owner};
 if(s.flow?.pendingGrowth?.owner!==seat&&s.flow?.pendingGrowth)s.flow.pendingGrowth={owner:s.flow.pendingGrowth.owner};
 const event=s.flow?.eventResolution;
 if(event?.mode==='bid'&&event.stage==='bid')event.submissions=Object.fromEntries(Object.entries(event.submissions).filter(([id])=>id===seat));
 s.current=seat;return s;
}
export function roomView(room,identity){
 const seat=seatFor(room,identity),rollback=rollbackAvailability(room.rollback,{seat,...identity},Date.now(),room.state);
 return {code:room.code,revision:room.revision,gameRevision:room.gameRevision,seatRevision:seat?room.seatRevisions[seat]:0,
  status:room.status,seat,isHost:isHost(room,identity),config:room.state.config,actor:roomActor(room.state),
  seats:Object.fromEntries(SEATS.map(id=>[id,{occupied:!!room.seats[id],mine:room.seats[id]?.user===identity.user,setupDone:!setupPending(room.state.players[id])}])),
  canUndo:!!seat&&rollback.step.available,rollback,restartRequest:turnRestartRequestView(room.rollback,{seat,...identity},room.state),
  state:room.status==='playing'&&seat?playerView(room.state,seat):null};
}
