import {isNonPlayer,isAutoma} from './player-configuration.js';
import {placeNonPlayerInfluence} from './non-player.js';
import {placeAutomaInfluence,planAutomaInfluence,applyAutomaInfluence,militaryAutomaRegions} from './automa-board.js';
import {chooseAutomaRegion} from './automa-random.js';
import {countryInfo} from './country-actions.js';
import {regionCountries,acquireSearchedCountry} from './country-piles.js';
import {activateTTIP} from './event-effect-actions.js';
import {takeEventCountry} from './event-effect-state.js';
import {AREAS,changeInfluence} from './world.js';
import {ECONOMY} from './economy.js';

const record=(q,owner,detail)=>q.receipts.push({player:owner,detail:'基础自动机 · '+detail,changes:[]});
function convert(s,owner,region,index){const actor=s.current;s.current=owner;changeInfluence(s,{region,operation:'convert',index});s.current=actor;}
function automaRecord(q,owner,detail){q.receipts.push({player:owner,detail:'高级自动机 · '+detail,changes:[]});}
function placeArmies(s,step,a){
 const {owner,type}=step,placements=a.placements,p=s.players[owner];
 if(!placements||typeof placements!=='object'||Array.isArray(placements))throw Error('请选择军队目的地');
 const allowed=step.region?[step.region]:step.regions||(type==='withdraw'?Object.keys(AREAS).filter(region=>AREAS[region].interest.includes(owner)):Object.keys(AREAS));
 let count=0;for(const [region,n] of Object.entries(placements)){if(!allowed.includes(region)||!Number.isInteger(n)||n<0)throw Error('无效的军队分配');count+=n;}
 if(count>step.max||type==='withdraw'&&(count!==step.max||s.regions.C.armies[owner]<count))throw Error('军队数量不符合事件要求');
 const cost=isAutoma(s,owner)?count*(step.moveCost||0):0;if(p.money<cost)throw Error('调遣军队所需资金不足');
 p.money-=cost;if(type==='withdraw')s.regions.C.armies[owner]-=step.max;
 for(const [region,n] of Object.entries(placements))s.regions[region].armies[owner]+=n;
}
function automaReward(s,q,step){
 const {owner,region,type}=step,p=s.players[owner];
 if(['influence','paidInfluence','africa','aukus'].includes(type)){
  const cost=(step.money||0)+5*(step.diplomacy||0);
  if(p.money<cost){automaRecord(q,owner,'无法支付可选影响力费用，放弃');return true;}
  const plan=planAutomaInfluence(s,owner,region);
  if(type==='paidInfluence'&&!plan){automaRecord(q,owner,'无合法影响力位置，放弃可选付费效果');return true;}
  p.money-=cost;if(plan)applyAutomaInfluence(s,owner,plan);
  if(type==='africa'){const amount=Math.min(6,Math.floor(p.money/2));p.money+=amount;}
  if(step.country)takeEventCountry(s,owner,step.country,{clearInvestmentsFromOtherOwner:true,ready:true});
  automaRecord(q,owner,`${AREAS[region].name}${plan?'添加影响力':'无合法位置，未添加影响力'}${cost?'，支付'+cost+'资金':''}`);return true;
 }
 if(type==='investment'){p.automa.investments[region]++;placeAutomaInfluence(s,owner,region);automaRecord(q,owner,`${AREAS[region].name}添加1投资标记和影响力`);return true;}
 if(type==='bricsCountry'){
  const names=new Set(['Egypt','Ethiopia','Iran','Saudi Arabia','UAE']);
  const targets=Object.values(s.regions).flatMap(regionCountries).filter(id=>{const c=countryInfo(id),old=p.allies.find(cid=>countryInfo(cid).countryName===c.countryName);return names.has(c.countryName)&&!c.blockedPowers.includes(owner)&&(!old||countryInfo(old).starting);});
  if(!targets.length)return true;
  q.nonPlayerChoice={...step,source:'reward',automa:true,countries:targets};return false;
 }
 if(['convert','nordstream'].includes(type)){
  const regions=step.regions||[region],targets=regions.flatMap(region=>s.regions[region].temporary.flatMap((id,index)=>id===owner?[{region,index}]:[]));
  if(!targets.length){if(type==='nordstream')p.money+=15;return true;}
  if(targets.length===1&&type==='convert'){convert(s,owner,targets[0].region,targets[0].index);automaRecord(q,owner,'临时影响力转为永久');return true;}
  q.nonPlayerChoice={...step,source:'reward',automa:true,targets};return false;
 }
 if(type==='move'||type==='withdraw'||type==='place'){
  const cost=step.moveCost||0,count=Math.min(step.max,cost?Math.floor(p.money/cost):step.max);
  if(type==='withdraw')s.regions.C.armies[owner]-=step.max;
  for(let i=0;i<count;i++){
   const excluded=type==='withdraw'?Object.keys(AREAS).filter(r=>!AREAS[r].interest.includes(owner)):[];
   const targets=region?[region]:militaryAutomaRegions(s,owner,false,excluded);
   const target=chooseAutomaRegion(s,owner,targets);if(!target)break;
   s.regions[target].armies[owner]++;p.money-=cost;
  }
  automaRecord(q,owner,type==='withdraw'?`撤回中亚${step.max}支军队`:`从补给移动${count}支军队，支付${count*cost}资金`);return true;
 }
 if(type==='ttip'){q.nonPlayerChoice={...step,source:'reward',automa:true};return false;}
 throw Error('高级自动机事件奖励尚未登记：'+type);
}
export function drainNonPlayerRewards(s,q,finish){
 while(q.rewardQueue.length&&isNonPlayer(s,q.rewardQueue[0].owner)){
  const step=q.rewardQueue[0],{owner,region,type}=step;
  if(isAutoma(s,owner)){if(!automaReward(s,q,step))return;q.rewardQueue.shift();continue;}
  if(['influence','paidInfluence','africa','aukus'].includes(type)){
   placeNonPlayerInfluence(s,owner,region);record(q,owner,`在${AREAS[region].name}添加影响力`);
  }else if(['investment','bricsCountry'].includes(type))record(q,owner,'不取得盟国或资源奖励');
  else if(['convert','nordstream'].includes(type)){
   const regions=step.regions||[region],targets=regions.flatMap(region=>s.regions[region].temporary.flatMap((id,index)=>id===owner?[{region,index}]:[]));
   if(targets.length===1&&!step.optional&&type!=='nordstream'){convert(s,owner,targets[0].region,targets[0].index);record(q,owner,'临时影响力转为永久');}
   else if(targets.length){q.nonPlayerChoice={...step,source:'reward',targets};return;}
  }else if(['move','withdraw','place','ttip'].includes(type)){
   q.nonPlayerChoice={...step,source:'reward',regions:step.regions||(type==='withdraw'?Object.keys(AREAS).filter(r=>AREAS[r].interest.includes(owner)):Object.keys(AREAS))};return;
  }else throw Error('非玩家事件奖励尚未登记：'+type);
  q.rewardQueue.shift();
 }
 if(q.rewardQueue.length)q.stage='reward';else finish(s,q);
}
export function resolveNonPlayerRewardChoice(s,q,a){
 const step=q.nonPlayerChoice;if(!step||step.source!=='reward')throw Error('当前没有非玩家棋盘选择');
 const {owner,type}=step;
 if(isAutoma(s,owner)){
  if(a.skip){if(!step.optional&&type!=='nordstream')throw Error('本项高级自动机效果必须执行');if(type==='nordstream')s.players[owner].money+=15;}
  else if(['convert','nordstream'].includes(type)){
   if(!step.targets.some(t=>t.region===a.region&&t.index===a.index))throw Error('请选择允许转换的临时影响力');convert(s,owner,a.region,a.index);
  }else if(type==='bricsCountry'){
   if(!step.countries.includes(a.country))throw Error('请选择协议允许的国家');
   const c=countryInfo(a.country),p=s.players[owner];acquireSearchedCountry(s.regions[c.region],a.country);p.allies=p.allies.filter(id=>countryInfo(id).countryName!==c.countryName);p.allies.push(a.country);s.eventCountryRandom=(s.eventCountryRandom||0)+1;
  }else if(['move','withdraw','place'].includes(type))placeArmies(s,step,a);
  else if(type==='ttip'){
   const actor=s.current;s.current=owner;
   try{activateTTIP(s,owner,{face:a.face,productionKey:a.productionKey,source:q.cardId});}finally{s.current=actor;}
  }else throw Error('此高级自动机奖励没有人工选择');
  automaRecord(q,owner,a.skip?type==='nordstream'?'选择获得15资金':'放弃可选效果':'已完成奖励选择与对应费用');delete q.nonPlayerChoice;q.rewardQueue.shift();return;
 }
 if(a.skip){if(!step.optional&&type!=='nordstream')throw Error('本项非玩家效果必须执行');}
 else if(['convert','nordstream'].includes(type)){
  if(!step.targets.some(t=>t.region===a.region&&t.index===a.index))throw Error('请选择允许转换的临时影响力');
  convert(s,owner,a.region,a.index);
 }else if(type==='ttip'){
  if(!['investment','exchange'].includes(a.face))throw Error('请选择协议的一面');
  if(a.face==='investment'){
   const partner=owner==='US'?'EU':'US',p=s.players[partner],choices=isNonPlayer(s,partner)?[]:p.production.flatMap((n,k)=>n<ECONOMY[partner].max[k]?[k]:[]);
   if(choices.length&&!choices.includes(a.productionKey))throw Error('请选择玩家可提升的产能');
   if(choices.length)p.production[a.productionKey]++;
   placeNonPlayerInfluence(s,owner,owner==='US'?'E':'M');
  }
 }else if(['move','withdraw','place'].includes(type))placeArmies(s,step,a);
 else throw Error('非玩家事件选择尚未登记：'+type);
 record(q,owner,a.skip?'放弃可选棋盘效果':'已完成棋盘效果选择；不支付或领取资源');
 delete q.nonPlayerChoice;q.rewardQueue.shift();
}
