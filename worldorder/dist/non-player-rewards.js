import {isNonPlayer} from './player-configuration.js';
import {placeNonPlayerInfluence} from './non-player.js';
import {AREAS,changeInfluence} from './world.js';
import {ECONOMY} from './economy.js';

const record=(q,owner,detail)=>q.receipts.push({player:owner,detail:'基础自动机 · '+detail,changes:[]});
function convert(s,owner,region,index){const actor=s.current;s.current=owner;changeInfluence(s,{region,operation:'convert',index});s.current=actor;}
export function drainNonPlayerRewards(s,q,finish){
 while(q.rewardQueue.length&&isNonPlayer(s,q.rewardQueue[0].owner)){
  const step=q.rewardQueue[0],{owner,region,type}=step;
  if(['influence','paidInfluence','africa','aukus'].includes(type)){
   placeNonPlayerInfluence(s,owner,region);record(q,owner,`在${AREAS[region].name}添加影响力`);
  }else if(['investment','bricsCountry'].includes(type))record(q,owner,'不取得盟国或资源奖励');
  else if(['convert','nordstream'].includes(type)){
   const regions=step.regions||[region],targets=regions.flatMap(region=>s.regions[region].temporary.flatMap((id,index)=>id===owner?[{region,index}]:[]));
   if(targets.length===1&&!step.optional&&type!=='nordstream'){convert(s,owner,targets[0].region,targets[0].index);record(q,owner,'临时影响力转为永久');}
   else if(targets.length){q.nonPlayerChoice={...step,source:'reward',targets};return;}
  }else if(['move','withdraw','ttip'].includes(type)){
   q.nonPlayerChoice={...step,source:'reward',regions:step.regions||(type==='withdraw'?Object.keys(AREAS).filter(r=>AREAS[r].interest.includes(owner)):Object.keys(AREAS))};return;
  }else throw Error('非玩家事件奖励尚未登记：'+type);
  q.rewardQueue.shift();
 }
 if(q.rewardQueue.length)q.stage='reward';else finish(s,q);
}
export function resolveNonPlayerRewardChoice(s,q,a){
 const step=q.nonPlayerChoice;if(!step||step.source!=='reward')throw Error('当前没有非玩家棋盘选择');
 const {owner,type}=step;
 if(a.skip){if(!step.optional&&type!=='nordstream')throw Error('本项非玩家效果必须执行');}
 else if(['convert','nordstream'].includes(type)){
  if(!step.targets.some(t=>t.region===a.region&&t.index===a.index))throw Error('请选择允许转换的临时影响力');
  convert(s,owner,a.region,a.index);
 }else if(type==='ttip'){
  if(!['investment','exchange'].includes(a.face))throw Error('请选择协议的一面');
  if(a.face==='investment'){
   const partner=owner==='US'?'EU':'US',p=s.players[partner],choices=p.production.flatMap((n,k)=>n<ECONOMY[partner].max[k]?[k]:[]);
   if(choices.length&&!choices.includes(a.productionKey))throw Error('请选择玩家可提升的产能');
   if(choices.length)p.production[a.productionKey]++;
   placeNonPlayerInfluence(s,owner,owner==='US'?'E':'M');
  }
 }else{
  const placements=a.placements;
  if(!placements||typeof placements!=='object'||Array.isArray(placements))throw Error('请选择军队目的地');
  let count=0;for(const [region,n] of Object.entries(placements)){if(!step.regions.includes(region)||!Number.isInteger(n)||n<0)throw Error('无效的军队分配');count+=n;}
  if(count>step.max||type==='withdraw'&&count!==step.max)throw Error('军队数量不符合事件要求');
  if(type==='withdraw')s.regions.C.armies[owner]-=step.max;
  for(const [region,n] of Object.entries(placements))s.regions[region].armies[owner]+=n;
 }
 record(q,owner,a.skip?'放弃可选棋盘效果':'已完成棋盘效果选择；不支付或领取资源');
 delete q.nonPlayerChoice;q.rewardQueue.shift();
}
