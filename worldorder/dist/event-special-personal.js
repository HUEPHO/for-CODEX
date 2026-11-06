import {ECONOMY} from './economy.js';
import {countryInfo} from './country-actions.js';
import {resolveBasicEffect} from './basic-actions.js';
import {AREAS} from './world.js';
import {reinforcementPreview,applyReinforcement} from './military.js';
import {placeEventInfluence,removeEventInfluence,downgradeEventInfluence,convertEventInfluence} from './event-influence.js';
import {addNeutralInfluence,queueChain} from './event-board.js';
import {grantEventEffect,replaceEventCountry,takeEventCountry,releaseEventCountry,removeEventCountry} from './event-effect-state.js';
import {publicBalances,balanceChanges} from './sequence-progress.js';
import {REGIONS,POWERS} from './game-constants.js';

export const SPECIAL_PERSONAL_EVENTS=Object.freeze({
 c0a692aca2850:{key:'afghan'},c52e84cdecbe6:{key:'covid'},c6b05cba7d362:{key:'brexit'},
 cb7934569eecb:{key:'korea'},cda82df9a0c65:{key:'croatia'},c2356e9f50f6e:{key:'crimea'}
});
export const SPECIAL_COUNTRIES={UK:'c2172fd0f8650',KOREA:'c11dd78abad1e',UKRAINE:'cf7c0ffc48316'};
const kind=q=>SPECIAL_PERSONAL_EVENTS[q?.cardId]?.key;
function integer(n,max){if(!Number.isInteger(n)||n<0||n>max)throw Error('请输入限额内的非负整数');return n;}
function loseSP(p,amount){const spent=Math.min(p.smart,amount);p.smart-=spent;p.vp-=amount-spent;}
function pay(p,{money=0,energy=0,services=0,diplomacy=0}){
 if(p.automa){const cost=money+3*energy+10*services+5*diplomacy;if(p.money<cost)throw Error('高级自动机执行事件所需资金不足');p.money-=cost;return;}
 if(p.money<money||p.resources[0]<energy||p.resources[4]<services||p.resources[5]<diplomacy)throw Error('执行事件所需资金或资源不足');
 p.money-=money;p.resources[0]-=energy;p.resources[4]-=services;p.resources[5]-=diplomacy;
}
function accept(a){if(typeof a.accept!=='boolean')throw Error('请选择执行或拒绝事件提议');return a.accept;}
export function initializeSpecialEvent(s,q){
 if(kind(q)==='afghan'){
  q.specialPhase='offer';q.afghanPresent=q.participants.some(id=>s.regions.C.armies[id]>0);
 }
}
export function specialEventModel(s,q){
 const id=s.current,p=s.players[id],key=kind(q);if(!key)throw Error('特殊事件尚未登记');
 const model={key,owner:id,phase:q.specialPhase||'resolve'};
 if(key==='covid')return {...model,prosperity:p.prosperity,loss:p.prosperity?ECONOMY[id].vp[p.prosperity-1]:0};
 if(key==='croatia'){
  const country=p.allies.find(cid=>countryInfo(cid).countryName==='Croatia'),history=p.objectiveHistory;
  // Positive recorded/current progress proves an increase. Only a complete
  // history can prove there has never been one in a legacy save.
  const improved=history?.prosperityGains>0||p.prosperity>0?true:history?.progressHistoryComplete===true?false:null;
  return {...model,country,improved,historyKnown:improved!==null};
 }
 if(key==='afghan')return {...model,present:q.afghanPresent??q.participants.some(owner=>s.regions.C.armies[owner]>0),armies:s.regions.C.armies[id],destinations:Object.entries(AREAS).filter(([,area])=>area.interest.includes(id)).map(([region])=>region)};
 if(key==='crimea')return {...model,temporary:s.regions.E.temporary.flatMap((owner,index)=>owner===id?[index]:[]),movable:Math.min(2,Math.floor(p.money/5),p.resources[6]+Object.values(s.regions).reduce((n,r)=>n+r.armies[id],0))};
 return model;
}
function receipt(s,q,before,detail,owner=s.current){q.receipts.push({player:owner,detail,changes:balanceChanges(before,publicBalances(s))});}
function finishParticipant(q,id,detail){q.done.push(id);if(q.done.length===q.participants.length){q.stage='result';q.result=detail;}}
function resolveAfghan(s,q,a,model){
 const id=s.current,p=s.players[id],before=publicBalances(s);
 if(!model.present){
  for(const owner of q.participants)loseSP(s.players[owner],3);
  addNeutralInfluence(s,'C');q.done=[...q.participants];q.stage='result';q.result='美欧均无中亚军队：双方各失去3 SP，不足部分扣分；中亚加入1中立影响力。';receipt(s,q,before,q.result,null);return q.result;
 }
 if(model.phase==='offer'){
  const amount=integer(a.amount??0,Math.min(30,p.money));
  q.submissions[id]=amount;q.done.push(id);
  let detail=`${POWERS[id].name}承诺支付${amount}资金；全员提交后检查合计是否恰为30。`;
  if(q.done.length===q.participants.length){
   if(q.participants.reduce((n,owner)=>n+q.submissions[owner],0)===30){
    for(const owner of q.participants){pay(s.players[owner],{money:q.submissions[owner]});s.players[owner].smart++;}
    q.stage='result';q.result=detail='共同支付30资金，美欧各获得1 SP，保留中亚军队。';
   }else{
    for(const owner of q.participants)loseSP(s.players[owner],1);
    q.specialPhase='withdraw';q.done=[];detail='未共同支付30资金：不扣承诺资金，双方各失去1 SP，不足部分扣分；依次免费撤回中亚的全部军队。';
   }
  }
  receipt(s,q,before,detail,q.done.length===q.participants.length||q.specialPhase==='withdraw'?null:id);return detail;
 }
 const withdrawals=a.withdrawals??{};if(!withdrawals||Array.isArray(withdrawals)||typeof withdrawals!=='object')throw Error('请选择撤军目的地区域与数量');
 const moves=[];for(const [to,n] of Object.entries(withdrawals)){if(!model.destinations.includes(to))throw Error('撤军只能进入本方关注范围内的地区');integer(n,model.armies);for(let i=0;i<n;i++)moves.push({from:'C',to});}
 if(moves.length!==model.armies)throw Error('必须撤回本方在中亚的全部军队');
 const result=reinforcementPreview(s,{moves},{armyGain:0,minMoves:model.armies,maxMoves:model.armies,moveCost:0});applyReinforcement(s,result);
 const detail=`${POWERS[id].name}免费从中亚撤回${moves.length}支军队。`;finishParticipant(q,id,detail);
 if(q.stage==='result'){addNeutralInfluence(s,'C');q.result='双方完成撤军，中亚加入1中立影响力。';}
 receipt(s,q,before,detail+(q.stage==='result'?'中亚加入1中立影响力。':''));return detail;
}
function crimeaMoves(s,q,a,model){
 const p=s.players[s.current],counts=a.moves??{};if(!counts||Array.isArray(counts)||typeof counts!=='object')throw Error('请选择移至事件牌的军队来源');
 let total=0;for(const [from,n] of Object.entries(counts)){
  if(from!=='reserve'&&!Object.hasOwn(REGIONS,from))throw Error('无效军队来源');integer(n,2);
  if(n>(from==='reserve'?p.resources[6]:s.regions[from].armies[s.current]))throw Error('所选来源军队不足');total+=n;
 }
 if(total!==model.movable)throw Error(`必须尽量移动${model.movable}支可负担的军队`);
 pay(p,{money:total*5});
 for(const [from,n] of Object.entries(counts)){if(from==='reserve')p.resources[6]-=n;else s.regions[from].armies[s.current]-=n;}
 s.regions.E.armies[s.current]+=total;return total;
}
function execute(s,q,a){
 const id=s.current,p=s.players[id],model=specialEventModel(s,q),before=publicBalances(s);let detail='';
 if(model.key==='afghan')return resolveAfghan(s,q,a,model);
 if(model.key==='covid'){
  if(!['money','service','none'].includes(a.payment))throw Error('请选择支付20资金、1服务或不支付');
  if(a.payment==='money')pay(p,{money:20});else if(a.payment==='service')pay(p,{services:1});else p.vp-=model.loss;
  p.prosperity=Math.max(0,p.prosperity-1);detail=`${a.payment==='money'?'支付20资金':a.payment==='service'?'支付1服务':'不支付，失去'+model.loss+'分'}；繁荣降低1级（最低为0）。`;
 }else if(model.key==='brexit'){
  if(accept(a)){pay(p,{diplomacy:6});p.smart+=3;p.vp+=2;detail='支付6外交，获得3 SP和2分。';}
  else{
   detail=removeEventInfluence(s,id,'E',true)+'；';replaceEventCountry(s,'United Kingdom',SPECIAL_COUNTRIES.UK);
   if(typeof a.relate!=='boolean')throw Error('请选择是否立即与英国改善关系');
   if(a.relate){const result=resolveBasicEffect(s,{...a,country:SPECIAL_COUNTRIES.UK,openDiplomacy:false},{name:'英国脱欧后改善关系',effect:'relations',targetCountry:SPECIAL_COUNTRIES.UK});detail+=`支付${result.cost}外交及${result.smartCost||0} SP，与英国改善关系。`;}
   else detail+='英国加入欧洲左侧国家牌堆顶部。';
  }
 }else if(model.key==='korea'){
  if(accept(a)){
   pay(p,{money:10,energy:2,diplomacy:2});p.smart+=2;s.regions.E.armies[id]++;
   takeEventCountry(s,id,'North Korea (2024)',{ready:true});
   detail='支付10资金、2能源、2外交，获得2 SP；从供应向欧洲放置1支军队，获得朝鲜（2024）盟国。';
  }else detail='不执行俄朝同盟，不支付费用或获得奖励。';
 }else if(model.key==='croatia'){
  let improved=model.improved;
  if(model.country&&improved===null){
   if(typeof a.prosperityImproved!=='boolean')throw Error('旧存档没有完整繁荣历史，请确认本局是否曾提升繁荣');
   improved=a.prosperityImproved;q.submissions[id]=improved?'旧存档确认：本局曾提升繁荣':'旧存档确认：本局未提升繁荣';
  }
  if(model.country&&improved){placeEventInfluence(s,id,'E',a.slot);p.smart+=2;removeEventCountry(s,'Croatia');detail='拥有克罗地亚且曾提升繁荣：欧洲增加1影响力，获得2 SP；克罗地亚移出游戏。';}
  else detail='未同时满足拥有克罗地亚及至少提升过1次繁荣，本事件无后续效果。';
 }else if(model.key==='crimea'){
  if(accept(a)){
   pay(p,{diplomacy:5});p.smart+=2;detail='支付5外交，获得2 SP。';
   if(typeof a.convert!=='boolean')throw Error('请选择是否转换欧洲临时影响力');
   if(a.convert){if(!model.temporary.includes(a.index))throw Error('请选择本方欧洲临时影响力');convertEventInfluence(s,id,'E',a.index);detail+='将所选临时影响力转换为永久影响力。';}
  }else{
   const moved=crimeaMoves(s,q,a,model);detail=`支付${moved*5}资金，将${moved}支军队移到事件牌，结算后进入欧洲；`+downgradeEventInfluence(s,id,'E')+'；';
   grantEventEffect(s,'global','cc83057306d10',q.cardId);queueChain(s,'c963b6d849299');replaceEventCountry(s,'Ukraine',SPECIAL_COUNTRIES.UKRAINE);releaseEventCountry(s,'RU','Ukraine',{pile:'left'});
   detail+='对俄制裁生效，明斯克协议加入下一轮；乌克兰替换为2014版，若原属俄罗斯则退回欧洲左堆顶。';
  }
 }
 receipt(s,q,before,detail);finishParticipant(q,id,detail);return detail;
}
function guard(s,q){if(q.stage!=='resolve'||!q.participants.includes(s.current)||q.done.includes(s.current)||q.participants.find(id=>!q.done.includes(id))!==s.current)throw Error('请由当前尚未结算的事件参与方操作');}
export function specialEventPreview(s,q,a){guard(s,q);const copy=structuredClone(s),trial=structuredClone(q);return execute(copy,trial,a);}
export function submitSpecialEvent(s,q,a){guard(s,q);specialEventPreview(s,q,a);return execute(s,q,a);}
