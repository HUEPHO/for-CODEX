import {phaseKey,currentActor} from './phase-state.js';
import {activeInteraction} from './interaction-state.js';
import {eventRevealKind} from './event-reveal.js';
import {GROWTH_DATA} from './growth-data.js';
import {setupPending} from './action-policy.js';

// States are immutable checkpoints, never snapshots of this ledger. Keep the
// two boundary checkpoints independently of the bounded single-step window.
export const ROLLBACK_STEPS=12;
export const ROLLBACK_MAX_AGE=30*60*1000;
const SCOPES=['step','phase','turn'];
const NO_HISTORY='还没有可以撤回的操作';
const INFO_BARRIER='已抽牌或揭示隐藏信息';
const OTHER_PLAYER='其他玩家已经接着操作，不能撤回此前操作';
const identityEqual=(a,b)=>!!a&&!!b&&a.seat===b.seat&&a.token===b.token&&a.user===b.user;
const array=value=>Array.isArray(value)?value:[];
const hasNew=(next,previous)=>{const known=new Set(array(previous));return array(next).some(id=>id&&!known.has(id));};
const stepOf=s=>{const q=s.flow?.cardResolution;return q?.steps?.[q.index];};

export function rollbackTurnKey(s,seat=s.current){
 return !Object.values(s.players).some(setupPending)&&s.flow?.step==='actions'&&s.actionTurns&&s.flow.order[s.actionTurns.index%4]===seat?`${s.round}:action:${s.actionTurns.index}`:null;
}
export function rollbackPhaseKey(s,seat=s.current){
 const f=s.flow,base=`${phaseKey(s)}:${seat}`,interaction=activeInteraction(s);
 if(Object.values(s.players).some(setupPending)){
  const p=s.players[seat];return `${s.round}:setup:${seat}:${p?.openingChoices?'opening':p?.assetChoices||p?.objectiveChoices?'draft':'complete'}`;
 }
 if(!f)return base;
 if(interaction?.kind==='sequence'){
  const q=f.cardResolution;return `${base}:action:${s.actionTurns?.index}:card:${q.cardId}:${q.index}:${interaction.actor}`;
 }
 if(interaction?.kind==='growth')return `${base}:growth:${f.pendingGrowth.cardId}:${f.pendingGrowth.stage||'choose'}`;
 if(interaction?.kind==='relation')return `${base}:relation:${s.actionTurns?.index}`;
 if(interaction?.kind==='income')return `${base}:income:${f.pendingIncome.active||'choose'}`;
 if(interaction?.kind==='event'){
  const q=f.eventResolution,c=s.eventBoard?.choice;
  return `${base}:event:${c?.cardId||q?.cardId||''}:${c?.type||q?.stage||'distribution'}`;
 }
 return f.step==='actions'?`${base}:action:${s.actionTurns?.index}:play:${f.turnCards?.length||0}`:base;
}

// Inspect only information-bearing surfaces. No full-state JSON comparison or
// traversal of old checkpoints; cost is linear in the current card collections.
export function rollbackRevealReason(before,after,action={}){
 const event=eventRevealKind(before,after);
 if(event==='sealed')return '秘密投标或随机对手的结果已经揭晓';
 if(event==='random')return '掷骰或随机事件结果已经揭晓';
 const oldQ=before.flow?.cardResolution,nextQ=after.flow?.cardResolution;
 if(nextQ?.context?.inspectedPlayer&&nextQ.context.inspectedPlayer!==oldQ?.context?.inspectedPlayer)return INFO_BARRIER;
 const search=stepOf(after)?.card?.countrySearchRegion;
 if(search&&search!==stepOf(before)?.card?.countrySearchRegion)return INFO_BARRIER;
 if(action.type==='resolveSequenceStep'&&stepOf(before)?.card?.countrySearchRegion&&!action.skip)return '国家牌已检索并重洗';
 const oldReward=before.flow?.eventResolution?.rewardQueue?.[0],newReward=after.flow?.eventResolution?.rewardQueue?.[0];
 if(newReward?.type==='bricsCountry'&&(oldReward?.type!=='bricsCountry'||newReward.owner!==oldReward.owner))return INFO_BARRIER;
 const oldGrowth=before.flow?.pendingGrowth,newGrowth=after.flow?.pendingGrowth;
 if(hasNew(newGrowth?.inspected,oldGrowth?.inspected)||hasNew(newGrowth?.candidates,oldGrowth?.candidates)||hasNew(newGrowth?.drawn,oldGrowth?.drawn))return INFO_BARRIER;
 if(action.type==='useGrowthAbility'){
  const p=before.players[before.current],g=GROWTH_DATA[action.cardId];
  const requested=g?.effect==='leadership'?p.hand.length:['trim','efficiency'].includes(g?.effect)?1:action.count;
  if(requested>0&&p.deck.length+p.discard.length+(g?.effect==='leadership'?p.hand.length:0)>0)return INFO_BARRIER;
 }
 for(const [id,p] of Object.entries(after.players)){
  const old=before.players[id];
  if(!old)continue;
  // The setup draft is generated up front but not displayed until the player
  // commits an opening group. Reselecting A versus B now requires a warning.
  if(old.openingChoices&&!p.openingChoices&&(array(p.assetChoices).length||array(p.objectiveChoices).length))return '开局资产与目标卡已经揭示';
  // Playing, returning a played card, keeping inspected cards and obtaining a
  // public market card do not reveal an unknown hand card by themselves.
  const known=[...array(old.hand),...array(old.played),...array(old.openingChoices).flat(),...array(before.market),...array(oldGrowth?.owner===id?oldGrowth.inspected:[])];
  if(hasNew(p.hand,known)||hasNew(p.assetChoices?.map(c=>c.id),old.assetChoices?.map(c=>c.id))||hasNew(p.objectiveChoices,old.objectiveChoices))return INFO_BARRIER;
  // A redraw can contain exactly the same cards. Drawing still warns,
  // including the automatic new-round draw for all four players.
  if(old.deck?.length>p.deck?.length||action.type==='draw'&&id===before.current||action.type==='nextRound'&&p.hand.length>0)return INFO_BARRIER;
 }
 if(hasNew(after.market,before.market))return '能力市场已补充新牌';
 for(const [id,r] of Object.entries(after.regions)){
  const old=before.regions[id];if(!old)continue;
  const hidden=new Set(old.countryPiles?[...array(old.countryPiles.left).slice(1),...array(old.countryPiles.right).slice(1)]:array(old.deck));
  if(array(r.available).some(card=>hidden.has(card)&&!array(old.available).includes(card)))return '地区商店已揭示新国家牌';
 }
 if(before.eraDeck?.length>after.eraDeck?.length||before.era2Deck?.length>after.era2Deck?.length||hasNew(after.eventBoard?.seen,before.eventBoard?.seen))return '新事件已经揭示';
 return null;
}

export function createRollback(reason=NO_HISTORY){return {version:1,nextId:1,owner:null,steps:[],phase:null,turn:null,blockedPhase:null,blockedTurn:null,reason};}
function validLedger(ledger){return ledger?.version===1&&Array.isArray(ledger.steps);}
function recent(entry,now){return !!entry&&now-entry.at<=ROLLBACK_MAX_AGE;}
const windowKey=s=>`${s.round}:${s.flow?.step}:${s.actionTurns?.index}`;
const warnEntry=(entry,warning)=>entry?{...entry,warning:entry.warning||warning}:entry;
function handoffFor(ledger,identity,state){
 const h=ledger?.handoff;
 return h&&state&&h.window===windowKey(state)&&identityEqual(h.owner,identity)?h:null;
}

export function recordRollback(ledger,before,after,{seat=before.current,user='',token='',action={},now=Date.now()}={}){
 const owner={seat,user,token},same=validLedger(ledger)&&identityEqual(ledger.owner,owner);
 const next=same?{...ledger,steps:ledger.steps.filter(entry=>recent(entry,now))}:createRollback(ledger?.owner?OTHER_PLAYER:NO_HISTORY);
 // Only the immediately preceding action turn can be reopened by agreement.
 // A new game command invalidates a pending request, never silently approving
 // the changed board. The previous checkpoint survives the next player's work.
 next.request=null;
 next.handoff=ledger?.handoff?.window===windowKey(after)?ledger.handoff:null;
 if(next.handoff&&seat!==next.handoff.owner.seat&&seat!==next.handoff.approver)next.handoff=null;
 next.owner=owner;
 const phase=rollbackPhaseKey(before,seat),turn=rollbackTurnKey(before,seat);
 // Switching responders cannot turn the remainder of an action into a new
 // whole-action checkpoint. Only its real owner at its untouched start can.
 const untouchedTurn=!before.flow?.turnCards?.length&&!before.flow?.cardResolution&&!before.flow?.pendingGrowth&&!before.flow?.pendingRelation&&!before.flow?.battlefieldReturn;
 if(!same&&turn){
  if(ledger?.blockedTurn?.key===turn)next.blockedTurn=ledger.blockedTurn;
  else if(!untouchedTurn)next.blockedTurn={key:turn,reason:OTHER_PLAYER};
 }
 if(next.phase?.phaseKey===phase&&!recent(next.phase,now))next.blockedPhase={key:phase,reason:'本阶段起点快照已超过30分钟'};
 if(next.turn?.turnKey===turn&&!recent(next.turn,now))next.blockedTurn={key:turn,reason:'本方行动起点快照已超过30分钟'};
 if(turn&&!next.turn&&!untouchedTurn&&!next.blockedTurn)next.blockedTurn={key:turn,reason:'缺少本方完整行动开始时的快照'};
 const barrier=rollbackRevealReason(before,after,action);
 if(barrier){
  // Information cannot be forgotten, but the user permits undo after a warning.
  // Mark only checkpoints that cross this reveal; later safe steps stay quiet.
  next.steps=next.steps.map(entry=>warnEntry(entry,barrier));
  next.phase=warnEntry(next.phase,barrier);next.turn=warnEntry(next.turn,barrier);
  if(next.handoff)next.handoff={...next.handoff,entry:warnEntry(next.handoff.entry,barrier)};
 }
 const entry={id:next.nextId++,at:now,state:before,phaseKey:phase,turnKey:turn,...(barrier?{warning:barrier}:{})};
 if(next.phase?.phaseKey!==phase||!recent(next.phase,now))next.phase=next.blockedPhase?.key===phase?null:entry;
 if(!turn)next.turn=null;
 else if(next.turn?.turnKey!==turn||!recent(next.turn,now))next.turn=next.blockedTurn?.key===turn?null:entry;
 next.steps=[...next.steps,entry].slice(-ROLLBACK_STEPS);
 if(turn&&windowKey(before)!==windowKey(after)&&next.turn?.turnKey===turn){
  next.handoff={owner,entry:next.turn,window:windowKey(after),approver:currentActor(after)};
 }
 return next;
}

export function rollbackAvailability(ledger,identity,now=Date.now(),state){
 const own=validLedger(ledger)&&identityEqual(ledger.owner,identity);
 return Object.fromEntries(SCOPES.map(scope=>{
  const handoff=scope==='turn'?handoffFor(ledger,identity,state):null;
  if(handoff){
   const reason=recent(handoff.entry,now)?null:'这份自动快照已超过30分钟，不能再撤回';
   return [scope,{available:!reason,reason,warning:handoff.entry.warning||null,requiresConsent:handoff.approver!==identity.seat,approver:handoff.approver}];
  }
  const entry=scope==='step'?ledger?.steps?.at(-1):ledger?.[scope];
  let reason=null;
  if(!own)reason=ledger?.owner?OTHER_PLAYER:ledger?.reason||NO_HISTORY;
  else if(!entry)reason=scope==='turn'?(ledger.blockedTurn?.reason||'当前没有可撤回的本方完整行动'):scope==='phase'?(ledger.blockedPhase?.reason||ledger.reason):ledger.reason;
  else if(!recent(entry,now))reason='这份自动快照已超过30分钟，不能再撤回';
  else if(state&&entry.turnKey&&entry.turnKey!==rollbackTurnKey(state,identity.seat))reason='已进入其他玩家回合，请申请重新开始整个回合';
  return [scope,{available:!reason,reason,warning:entry?.warning||null}];
 }));
}

export function restoreRollback(ledger,identity,scope='step',now=Date.now(),state){
 if(!SCOPES.includes(scope))throw Error('无效的撤回范围');
 const availability=rollbackAvailability(ledger,identity,now,state)[scope];
 if(!availability.available)throw Error(availability.reason);
 if(availability.requiresConsent)throw Error('已进入其他玩家回合，需要对方同意重新开始整个回合');
 const handoff=scope==='turn'?handoffFor(ledger,identity,state):null;
 if(handoff)return {state:structuredClone(handoff.entry.state),rollback:createRollback()};
 const target=scope==='step'?ledger.steps.at(-1):ledger[scope];
 const next={...ledger,request:null,steps:ledger.steps.filter(entry=>entry.id<target.id),phase:ledger.phase?.id<target.id?ledger.phase:null,turn:ledger.turn?.id<target.id?ledger.turn:null};
 return {state:structuredClone(target.state),rollback:next};
}

export function requestTurnRestart(ledger,identity,approver,state,id,now=Date.now()){
 const option=rollbackAvailability(ledger,identity,now,state).turn;
 if(!option.available)throw Error(option.reason);
 if(!option.requiresConsent)throw Error('当前可以直接重新开始整个回合');
 if(ledger.request&&recent(ledger.handoff?.entry,now))throw Error('已有重开申请，请先处理或取消');
 if(!approver||approver.seat!==option.approver)throw Error('请等待对方入座后再申请');
 return {...ledger,request:{id,owner:identity,approver}};
}
export function turnRestartRequestView(ledger,identity,state,now=Date.now()){
 const request=ledger?.request,h=ledger?.handoff;
 if(!request||!h||h.window!==windowKey(state)||!recent(h.entry,now))return null;
 return {id:request.id,owner:request.owner.seat,approver:request.approver.seat,warning:h.entry.warning||null,
  canRespond:identityEqual(request.approver,identity),canCancel:identityEqual(request.owner,identity)};
}
export function respondTurnRestart(ledger,identity,state,id,accept,now=Date.now()){
 const request=turnRestartRequestView(ledger,identity,state,now);
 if(!request||request.id!==id)throw Error('重开申请已失效，请重新申请');
 if(!request.canRespond)throw Error('只有被请求的玩家可以同意或拒绝');
 if(typeof accept!=='boolean')throw Error('请选择同意或拒绝');
 return accept?{state:structuredClone(ledger.handoff.entry.state),rollback:createRollback()}:{state,rollback:{...ledger,request:null}};
}
export function cancelTurnRestart(ledger,identity,state,id,now=Date.now()){
 const request=turnRestartRequestView(ledger,identity,state,now);
 if(!request||request.id!==id)throw Error('重开申请已失效');
 if(!request.canCancel)throw Error('只有申请者可以取消申请');
 return {...ledger,request:null};
}
