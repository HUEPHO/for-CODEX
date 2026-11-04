import {AGREEMENT_EVENTS,initializeAgreement,submitAgreement,resolveAgreementReward} from './event-agreements.js';
import {SPECIAL_PERSONAL_EVENTS,initializeSpecialEvent,submitSpecialEvent} from './event-special-personal.js';
import {removeEventEffect} from './event-effect-state.js';
import {BID_EVENTS,initializeBid,submitBid,resolveBidReward} from './event-bids.js';
import {PERSONAL_EVENTS,submitPersonalEvent} from './event-personal.js';
import {EVENT_DATA} from './event-data.js';
import {EVENT_CHAINS,prepareNextEvents,choosePersonalEvent,resolveEventReveal,queueChain,removeCurrentEvent} from './event-board.js';
import {gainResource} from './economy.js';
import {publicBalances,balanceChanges} from './sequence-progress.js';
import {EVENT_ACTIONS,eventActor} from './interaction-state.js';
export {EVENT_ACTIONS,eventActor} from './interaction-state.js';
export const AUTO_EVENTS={...Object.fromEntries(Object.keys(AGREEMENT_EVENTS).map(id=>[id,'agreement'])),...Object.fromEntries(Object.keys(SPECIAL_PERSONAL_EVENTS).map(id=>[id,'special'])),...Object.fromEntries(Object.keys(PERSONAL_EVENTS).map(id=>[id,'personal'])),...Object.fromEntries(Object.keys(BID_EVENTS).map(id=>[id,'bid'])),c4bfa45373360:'aid',c2bacc7276393:'paris',c402371a1ff87:'crisis',cd771b6a9d234:'bid',c963b6d849299:'agreement'};
export const REPEAT_EVENTS=['cd780718be7a6','cb29f5917c351','cbb2924757345','cb888393c6ff9'];
const START_MONEY={US:30,CN:20,EU:25,RU:15};
function log(s,text){s.log=[text,...s.log].slice(0,30);}
function finishDistribution(s){
 if(s.flow?.step==='events'&&s.flow.eventRound?.complete&&!s.eventBoard.distribution){s.flow.step='aftermath';s.flow.checks=[];s.phase='余波';s.current=s.flow.order[0];}
 else if(eventActor(s))s.current=eventActor(s);
}
function nextEvent(s){
 const f=s.flow,b=s.eventBoard,processed=f.eventRound.processed;
 const id=[...b.slots].reverse().find(Boolean)||f.order.map(owner=>b.personal[owner]).find(id=>id&&!processed.includes(id));
 if(!id){f.eventResolution=null;f.eventRound.complete=true;prepareNextEvents(s);finishDistribution(s);return;}
 const data=EVENT_DATA[id],mode=AUTO_EVENTS[id]||'manual',owner=data.players.length===1?data.players[0]:null;
 // Unsupported faces use four explicit acknowledgements, including affected non-flagged players.
 const participants=mode==='manual'?(owner?[owner,...f.order.filter(p=>p!==owner)]:[...f.order]):f.order.filter(p=>data.players.includes(p));
 f.eventResolution={cardId:id,mode,stage:mode==='bid'||mode==='agreement'?mode:'resolve',participants,owner,done:[],submissions:{},before:publicBalances(s),receipts:[],chains:[],repeat:false};
 if(mode==='bid'&&BID_EVENTS[id])initializeBid(s,f.eventResolution);
 if(mode==='agreement'&&AGREEMENT_EVENTS[id])initializeAgreement(s,f.eventResolution);
 if(mode==='special')initializeSpecialEvent(s,f.eventResolution);
 s.current=eventActor(s);
}
export function startEventPhase(s){if(!s.eventVersion)return;s.flow.eventRound={round:s.round,processed:[],complete:false};nextEvent(s);}
export function canPostponeEvent(s){const q=s.flow?.eventResolution;return !!q&&q.owner===s.current&&!q.done.length&&!q.manualStarted&&q.stage!=='result'&&s.round<6&&!EVENT_DATA[q.cardId].notPostponable&&s.players[s.current].smart>=1;}
function integer(n,max=999){if(!Number.isInteger(n)||n<0||n>max)throw Error('请输入限额内的非负整数');return n;}
function lowerProduction(p,key){
 const options=p.production.map((n,k)=>n>1?k:null).filter(k=>k!==null);
 if(!options.length)return false;
 if(!options.includes(key))throw Error('请选择可降低的产能');p.production[key]--;return true;
}
function settleSealed(s,q){
 const bid=id=>q.submissions[id]||0,kind=q.mode;
 if(kind==='agreement'){
  const agree=bid('EU')>0&&bid('RU')>0&&bid('EU')+bid('RU')===5;
  if(agree){for(const id of q.participants){s.players[id].resources[5]-=bid(id);s.players[id].smart+=bid(id);s.players[id].vp+=2;}removeEventEffect(s,'cc83057306d10');}
  else {for(const id of q.participants)s.players[id].vp-=2;queueChain(s,'cd780718be7a6');}
  q.result=agree?'达成明斯克协议：双方支付承诺的外交，各获2分并按支付数量获得SP。':'协议未达成：双方不支付外交，各失去2分；俄罗斯入侵乌克兰加入连锁。';
 }else{
  const modifier=Math.floor(q.before.US.money/20),us=bid('US')+modifier,other=bid('RU')+bid('CN');
  for(const id of q.participants)s.players[id].resources[5]-=bid(id);
  q.totals={US:us,RU_CN:other,modifier};
  if(us===0&&other===0)q.result='全部投标与修正均为0：事件弃置，无效果。';
  else {
   const usWins=us>=other;
   for(const id of q.participants){const wins=(id==='US')===usWins;s.players[id].smart+=wins?Math.floor(bid(id)/2):bid(id);if(wins&&bid(id)>0){s.players[id].smart+=2;s.players[id].vp++;}}
   if(usWins){s.players.RU.vp--;s.players.CN.vp--;}else s.players.US.vp-=2;
   q.result=`${usWins?'美国获胜（平局亦由美国获胜）':'俄罗斯与中国获胜'}；所有投标已支付，SP及牌面奖励已结算。未投标的获胜方不领取本方奖励。`;
  }
 }
 q.receipts.push({player:null,detail:q.result,changes:balanceChanges(q.before,publicBalances(s))});
}
function submit(s,a,q){
 const id=s.current,p=s.players[id],before=publicBalances(s);let detail='';
 if(q.agreementVersion){submitAgreement(s,q,a);s.current=eventActor(s);return;}
 if(q.mode==='special'){submitSpecialEvent(s,q,a);s.current=eventActor(s);return;}
 if(q.mode==='personal'){submitPersonalEvent(s,q,a);s.current=eventActor(s);return;}
 if(q.mode==='bid'&&q.bidVersion){
  submitBid(s,q,a);log(s,q.stage==='bid'?id+'已提交秘密投标，等待其余参与方':q.result);s.current=eventActor(s);return;
 }
 if(q.mode==='bid'||q.mode==='agreement'){
  const n=integer(a.amount,q.mode==='agreement'?Math.min(4,p.resources[5]):p.resources[5]);
  if(q.mode==='agreement'&&q.done.length&&n>0&&q.submissions[q.done[0]]>0&&n+q.submissions[q.done[0]]!==5)throw Error('同意协议时双方必须合计支付恰好5外交；也可填0表示不参与');
  q.submissions[id]=n;q.done.push(id);
  log(s,`${id}已提交${q.mode==='bid'?'秘密投标':'协议提案'}，等待其余参与方`);
  if(q.done.length===q.participants.length){settleSealed(s,q);q.stage='result';log(s,q.result);}s.current=eventActor(s);return;
 }
 if(q.mode==='aid'){
  const n=integer(a.amount,Math.min(Math.floor(p.money/10),p.resources[2]));p.money-=10*n;p.resources[2]-=n;gainResource(p,5,2*n);p.smart+=n;detail=`援助${n}次；支付${10*n}资金、${n}粮食，获得${2*n}外交（超限舍弃）、${n} SP`;
 }else if(q.mode==='paris'){
  const keys=a.production||[];if(!Array.isArray(keys)||keys.length>2||new Set(keys).size!==keys.length||keys.some(k=>!Number.isInteger(k)||k<0||k>6||p.production[k]<=1))throw Error('请选择至多两种可实际降低的产能');
  for(const k of keys)p.production[k]--;gainResource(p,5,2*keys.length);p.vp+=keys.length;detail=`降低${keys.length}种产能，获得${2*keys.length}外交（超限舍弃）、${keys.length}分`;
 }else if(q.mode==='crisis'){
  if(p.money>=START_MONEY[id]*2){p.vp+=2;detail='资金至少为初始资金两倍：获得2分';}
  else {const lowered=lowerProduction(p,a.productionKey);detail=lowered?'降低所选产能1级':'全部产能已处于最低值，保持不变';if(p.money<=START_MONEY[id]){p.prosperity=Math.max(0,p.prosperity-1);p.vp-=2;detail+='；繁荣降低1级（最低为0），失去2分';}}
 }else{
  if(a.confirmed!==true)throw Error('请核对并手动完成本张事件中涉及本方的效果');
  const chains=a.chains||[];if(!Array.isArray(chains)||chains.some(id=>!(EVENT_CHAINS[q.cardId]||[]).includes(id)))throw Error('所选连锁不属于此事件');
  if(new Set([...q.chains,...chains]).size>1)throw Error('每张事件最多触发1张连锁，请仅选择一项');
  if((chains.length||q.chains.length)&&(a.repeat||q.repeat))throw Error('不能同时登记再次结算和触发后续连锁，请核对牌面条件');
  for(const cid of chains)if(!q.chains.includes(cid)){q.chains.push(cid);queueChain(s,cid);}
  if(a.repeat===true){if(!REPEAT_EVENTS.includes(q.cardId))throw Error('此事件没有再次结算的平局条款');q.repeat=true;}
  detail='已人工完成并核对本方效果；程序不再次扣费或发奖';
 }
 q.receipts.push({player:id,detail,changes:balanceChanges(before,publicBalances(s))});q.done.push(id);
 log(s,`${id} · ${EVENT_DATA[q.cardId].name}：${detail}`);
 if(q.done.length===q.participants.length){q.stage='result';q.result=q.mode==='manual'?'四方已确认人工结算；请核对结果后继续。':'本张事件已自动结算；请勿重复扣费或领奖。';if(q.mode==='manual')q.receipts.push({player:null,detail:'本张事件期间人工调整合计',changes:balanceChanges(q.before,publicBalances(s))});}
 s.current=eventActor(s);
}
export function handleEventAction(s,a){
 if(!s.eventVersion||!EVENT_ACTIONS.includes(a.type))return false;
 if(eventActor(s)!==s.current)throw Error('请由当前事件责任玩家操作');
 if(a.type==='choosePersonalEvent'||a.type==='resolveEventReveal'){
  if(a.type==='choosePersonalEvent')choosePersonalEvent(s,a);else resolveEventReveal(s,a);finishDistribution(s);return true;
 }
 const q=s.flow?.eventResolution;if(s.flow?.step!=='events'||!q||a.cardId!==q.cardId)throw Error('当前事件已变化，请刷新后操作');
 if(a.type==='resolveEventReward'){if(q.agreementVersion)resolveAgreementReward(s,q,a);else resolveBidReward(s,q,a);s.current=eventActor(s);return true;}
 if(a.type==='postponeEvent'){
  if(!canPostponeEvent(s))throw Error('本事件当前不能延期（已开始结算、禁止延期、第6轮或SP不足）');
  s.players[s.current].smart--;s.flow.eventRound.processed.push(q.cardId);s.eventHistory.push({round:s.round,cardId:q.cardId,mode:'postponed',receipts:[{player:s.current,detail:'支付1 SP，延期到下轮',changes:balanceChanges(q.before,publicBalances(s))}]});
  log(s,`${s.current} · 支付1 SP，延期${EVENT_DATA[q.cardId].name}`);nextEvent(s);return true;
 }
 if(a.type==='ackEvent'){
  if(q.stage!=='result')throw Error('请先完成本事件的所有参与方结算');
  s.eventHistory.push({round:s.round,cardId:q.cardId,mode:q.mode,receipts:q.receipts,result:q.result,...(q.agreementVersion?{agreementVersion:q.agreementVersion,agreement:q.agreement,agreementRandom:q.agreementRandom}:{}),...(q.investment?{investment:q.investment}:{}),submissions:q.submissions,totals:q.totals,...(q.randomChain?{randomChain:q.randomChain}:{}),...(q.bidVersion?{bidVersion:q.bidVersion,modifiers:q.modifiers,sideTotals:q.sideTotals,winner:q.winner}: {})});
  removeCurrentEvent(s,q.cardId,{repeat:q.repeat});s.flow.eventRound.processed.push(q.cardId);nextEvent(s);return true;
 }
 if(q.stage==='result')throw Error('本事件已结算，请核对后继续');
 if(q.stage==='reward')throw Error('投标已揭晓，请先完成获奖选择');submit(s,a,q);return true;
}
