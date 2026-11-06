import {EVENT_DATA} from './event-data.js';
import {isNonPlayer,isAutoma,isBasicNonPlayer} from './player-configuration.js';
import {automaBidOffer} from './event-automa.js';
import {AUTOMA_PLAYERS} from './automa-data.js';
import {drawNonPlayerBid,nonPlayerBidModifier} from './event-non-player-data.js';
import {drainNonPlayerRewards,resolveNonPlayerRewardChoice} from './non-player-rewards.js';
import {AREAS,alliedCount} from './world.js';
import {countryRegion} from './research.js';
import {investedCountries} from './investment-tokens.js';
import {gainResource,RESOURCE_LABELS} from './economy.js';
import {loseEventMoney,loseEventResource} from './event-losses.js';
import {publicBalances,balanceChanges} from './sequence-progress.js';
import {removeEventInfluence,downgradeEventInfluence,placeEventInfluence,convertEventInfluence} from './event-influence.js';
import {queueChain,addNeutralInfluence} from './event-board.js';
import {countryInfo} from './country-actions.js';
import {resolveBasicEffect} from './basic-actions.js';
import {takeEventCountry} from './event-effect-state.js';
const names={US:'美国',CN:'中国',EU:'欧盟',RU:'俄罗斯'},startingMoney={US:30,CN:20,EU:25,RU:15};
// Only faces with implemented costs AND complete resolution effects belong here.
export const BID_EVENTS={
 cd771b6a9d234:{diplomacy:true,effect:'dollar',tie:'US'},
 c9db977892b0d:{money:999,diplomacy:true,armies:'all',region:'A',effect:'africa'},
 c99fa916aec22:{diplomacy:true,reserveRequired:true,region:'S',effect:'mrca'},
 c25240469d096:{money:2,diplomacy:true,armies:['RU'],region:'E',bonus:{RU:2},tie:'none',effect:'belarus'},
 cbdab09ed1a45:{diplomacy:true,armies:'all',region:'A',bonus:{RU:1},effect:'sahel'},
 c6e3c117f6ac4:{armies:'all',region:'P',freeFrom:{CN:'P'},effect:'southChina'},
 cbb2924757345:{money:2,diplomacy:true,armies:'all',region:'N',bonus:{RU:2},tie:'repeat',effect:'syria'},
 c8b5edd6c7beb:{diplomacy:true,sale:{players:['RU'],max:2,price:15},region:'S',effect:'myanmar'},
 caa9567066a40:{money:3,diplomacy:true,region:'M',effect:'americas'},
 cb888393c6ff9:{diplomacy:true,armies:'all',region:'C',opponent:[1,4],tie:'repeat',effect:'karabakh'},
 c4b796f4206ea:{sale:{players:['US','EU'],max:2,price:15},region:'N',opponent:[1,5],tie:'player',effect:'yemen'},
 cb29f5917c351:{armies:'all',region:'N',opponent:[1,3],tie:'repeat',effect:'libya'},
 c784b257890d8:{armies:'all',region:'N',effect:'isis'},
 cb2c1803ce749:{diplomacy:true,region:'P',effect:'aukus'},
 c2a6d1615b971:{diplomacy:true,sale:{players:['US','RU'],price:15},region:'N',sideModifiers:[{random:[1,3]},{neutral:'N'}],resolution:[
  {side:0,effects:[{type:'smart',target:'winners',amount:{neutral:'N'}},{type:'removeInfluence',player:'neutral',region:'N'}]},
  {side:1,effects:[{type:'smart',target:'winners',amount:3},{type:'neutral',region:'N'}]}
 ]},
 cf00e1c9bdd9c:{armies:'all',region:'A',resolution:[
  {minArmies:3,effects:[{type:'smart',target:'winners',amount:3}]},
  {effects:[{type:'vp',target:'noArmies',amount:-2},{type:'neutral',region:'A'},{type:'loss',player:'EU',money:15},{type:'loss',player:'US',resource:5,amount:2},{type:'loss',player:'CN',money:10},{type:'loss',player:'RU',money:5}]}
 ]},
 cd780718be7a6:{money:3,diplomacy:3,armies:'all',region:'E',freeFrom:{RU:'E'},sideModifiers:[{random:[1,2]}],tie:'repeat',resolution:[
  {side:0,effects:[{type:'smart',target:'winners',amount:3},{type:'loseSmart',player:'RU',amount:2},{type:'downgradeInfluence',player:'RU',region:'E'}]},
  {side:1,effects:[{type:'influence',player:'RU',region:'E'},{type:'smart',player:'CN',amount:2},{type:'loseSmart',player:'US',amount:2},{type:'loseSmart',player:'EU',amount:2}]}
 ]},
 c16291ef10b12:{money:999,individualModifiers:[{resource:3},{growth:true}],tie:'shared',resolution:[
  {tie:true,effects:[{type:'smart',target:'tied',amount:2,vp:2}]},
  {effects:[{type:'smart',target:'winners',amount:3,vp:3}]}
 ]},
 cad4342891b33:{money:2,diplomacy:true,services:true,region:'C',sideModifiers:[{allyCountry:'Georgia'},{allyCountry:'Georgia'}],tie:'RU',resolution:[
  {side:0,effects:[{type:'smart',target:'winners',amount:3}]},
  {side:1,effects:[{type:'influence',player:'RU',region:'C',country:'Georgia'}]}
 ]},
 c7787ad7ef400:{money:999,region:'C',individualModifiers:[{allyRegion:'C'}],opponent:[2,4],tie:'player',resolution:[
  {side:2,effects:[{type:'neutral',region:'C'}]},
  {effects:[{type:'investment',target:'winners',region:'C'}]}
 ]}
};
export function bidModifier(s,id,owner){
 if(isBasicNonPlayer(s,owner))return nonPlayerBidModifier(s,id,owner);
 const d=BID_EVENTS[id],p=s.players[owner];let n=d.bonus?.[owner]||0;
 if(d.effect==='dollar'&&owner==='US')n+=Math.floor(p.money/20);
 if(d.effect==='southChina'&&owner==='US')n+=alliedCount(s,owner,'P');
 if(d.effect==='aukus'&&p.allies.includes('caa7ff0f8b8f4'))n+=2;
 if(['africa','americas'].includes(d.effect)){const region=d.region;n+=alliedCount(s,owner,region)+(isAutoma(s,owner)?p.automa.investments[region]+p.automa.bases[region]:investedCountries(s,owner).filter(cid=>p.allies.includes(cid)&&countryRegion(cid)===region).length+(p.bases||[]).filter(cid=>p.allies.includes(cid)&&countryRegion(cid)===region).length);}
 for(const rule of d.individualModifiers||[])n+=rule.resource!==undefined?p.resources[rule.resource]:rule.growth?p.growth.length:alliedCount(s,owner,rule.allyRegion);
 return n;
}
export function initializeBid(s,q){q.bidVersion=1;q.modifiers=Object.fromEntries(q.participants.map(owner=>[owner,bidModifier(s,q.cardId,owner)]));q.eventArmies={};q.rewardQueue=[];if(q.participants.every(id=>isNonPlayer(s,id)))completeBid(s,q);}
function integer(n,max=999){if(!Number.isInteger(n)||n<0||n>max)throw Error('竞价数量必须是限额内的非负整数');return n;}
export function bidSaleLimit(s,cardId,owner){const sale=BID_EVENTS[cardId].sale;return sale?.players.includes(owner)?Math.min(sale.max??s.players[owner].resources[6],s.players[owner].resources[6]):0;}
export function bidResourceLimit(s,cardId,owner,key){const option=BID_EVENTS[cardId][{4:'services',5:'diplomacy'}[key]];return option===true?s.players[owner].resources[key]:Math.min(option||0,s.players[owner].resources[key]);}
export function bidInvestmentTargets(s,owner,region){return s.players[owner].allies.filter(id=>countryRegion(id)===region);}
export function bidOffer(s,q,owner,a={}){
 const p=s.players[owner],d=BID_EVENTS[q.cardId],moneyUnits=integer(a.moneyUnits??0,d.money||0),diplomacy=integer(a.diplomacy??a.amount??0,bidResourceLimit(s,q.cardId,owner,5)),services=integer(a.services??0,bidResourceLimit(s,q.cardId,owner,4));
 const input=a.armies??{},allowed=d.armies==='all'||d.armies?.includes(owner);if(!input||Array.isArray(input)||typeof input!=='object')throw Error('请选择各来源的军队数量');
 const armies={};let count=0,moveCost=0;
 for(const [from,value] of Object.entries(input)){
  if(from!=='reserve'&&!AREAS[from])throw Error('无效军队来源');
  const n=integer(value,allowed?(from==='reserve'?p.resources[6]:s.regions[from].armies[owner]):0);if(!n)continue;
  armies[from]=n;count+=n;if(d.freeFrom?.[owner]!==from)moveCost+=5*n;
 }
 const soldArmies=integer(a.soldArmies??0,bidSaleLimit(s,q.cardId,owner));
 if(soldArmies+(armies.reserve||0)>p.resources[6])throw Error('待命军队不足，不能同时出售和移动这些军队');
 const total=moneyUnits+diplomacy+services+count+soldArmies,cost=10*moneyUnits+moveCost;
 if(d.reserveRequired&&total>0&&p.resources[6]<1)throw Error('本次竞价至少需要1支待命军队才能参与');
 if(p.money<cost)throw Error('竞价资金不足：需同时支付资金投标及军队移动费用');
 return {moneyUnits,diplomacy,services,armies,count,total,cost,moveCost,soldArmies,saleIncome:soldArmies*(d.sale?.price||0)};
}
function addReceipt(q,s,before,detail,player=null){q.receipts.push({player,detail,changes:balanceChanges(before,publicBalances(s))});}
function loseSP(p,n){const loss=Math.min(p.smart,n);p.smart-=loss;p.vp-=n-loss;}
function finishBid(s,q){
 for(const effect of q.afterRewards||[]){const before=publicBalances(s);addReceipt(q,s,before,downgradeEventInfluence(s,effect.owner,effect.region));}q.afterRewards=[];
 const before=publicBalances(s),region=BID_EVENTS[q.cardId].region,placed=[];
 for(const [owner,n] of Object.entries(q.eventArmies)){if(n){s.regions[region].armies[owner]+=n;placed.push(names[owner]+' '+n+'支');}}
 q.eventArmies={};if(placed.length)addReceipt(q,s,before,`事件牌上的军队进入${AREAS[region].name}：${placed.join('、')}`);
 q.stage='result';
}
function compareSides(s,q,sides,a,b){
 const regions=EVENT_DATA[q.cardId].regions;
 const values=side=>[Math.max(...side.map(p=>regions.reduce((n,r)=>n+s.regions[r].influence[p],0))),Math.max(...side.map(p=>q.before[p].vp)),Math.max(...side.map(p=>s.players[p].money)),Math.max(...side.map(p=>isAutoma(s,p)?AUTOMA_PLAYERS[p].money:startingMoney[p]))];
 const av=values(sides[a]),bv=values(sides[b]);for(let i=0;i<av.length;i++)if(av[i]!==bv[i])return bv[i]-av[i];return 0;
}
function outcome(s,q){
 const d=BID_EVENTS[q.cardId],sides=EVENT_DATA[q.cardId].sides;
 q.sideTotals=sides.map((players,i)=>{
  const total=players.reduce((n,p)=>n+q.submissions[p].total+(q.modifiers[p]||0),0),rule=d.sideModifiers?.[i];
  if(!rule)return {players,total};
  const modifier=rule.random?rule.random[0]+Math.floor(Math.random()*(rule.random[1]-rule.random[0]+1)):rule.allyCountry?Number(players.some(owner=>s.players[owner].allies.some(id=>countryInfo(id).countryName===rule.allyCountry))):s.regions[rule.neutral].influence.neutral;
  return {players,total:total+modifier,modifier,modifierKind:rule.random?'random':rule.allyCountry?'ally':'neutral'};
 });
 if(d.opponent){q.opposingBid=d.opponent[0]+Math.floor(Math.random()*(d.opponent[1]-d.opponent[0]+1));q.sideTotals.push({players:[],total:q.opposingBid,opponent:true});}
 const top=Math.max(...q.sideTotals.map(x=>x.total));q.allZero=top===0;q.tied=q.sideTotals.flatMap((x,i)=>x.total===top?[i]:[]);q.winner=null;
 if(q.allZero)return;
 if(q.tied.length===1)q.winner=q.tied[0];
 else if(names[d.tie])q.winner=sides.findIndex(side=>side.includes(d.tie));
 else if(d.tie==='player')q.winner=q.tied.filter(i=>i<sides.length).sort((a,b)=>compareSides(s,q,sides,a,b))[0];
 else if(!d.tie){q.winner=[...q.tied].sort((a,b)=>compareSides(s,q,sides,a,b))[0];q.tieBreak=true;}
 // Printed no-effect/repeat ties: user ruling grants every player's full bid as SP.
}
function resolveBidLoss(s,effect){
 const p=s.players[effect.player],money=effect.money!==undefined,result=money?loseEventMoney(p,effect.money):loseEventResource(p,effect.resource,effect.amount);
 return `${names[effect.player]}失去${result.lost}${money?'资金':RESOURCE_LABELS[effect.resource]}${result.vp?`；不足${result.shortfall}，失去${result.vp}分`:''}`;
}
function resolveFaceRules(s,q,rules,grant){
 const armies=Object.values(q.eventArmies).reduce((sum,n)=>sum+n,0),rule=rules.find(x=>(x.side===undefined||x.side===q.winner)&&(!x.tie||q.tied.length>1)&&(x.minArmies===undefined||armies>=x.minArmies));
 if(!rule)throw Error('竞价结果缺少对应结算规则');
 const details=[],targets=effect=>effect.player?[effect.player]:effect.target==='winners'?EVENT_DATA[q.cardId].sides[q.winner]||[]:effect.target==='tied'?q.tied.flatMap(i=>EVENT_DATA[q.cardId].sides[i]||[]):effect.target==='noArmies'?q.participants.filter(id=>!q.eventArmies[id]):[];
 for(const effect of rule.effects){
  const amount=typeof effect.amount==='object'?s.regions[effect.amount.neutral].influence.neutral:effect.amount;
  if(effect.type==='smart'){
   for(const owner of targets(effect))if(q.submissions[owner]?.total>0){grant(owner,amount,effect.vp||0);details.push(`${names[owner]}额外获得${amount} SP${effect.vp?`和${effect.vp}分`:''}`);}
  }else if(effect.type==='vp'){
   for(const owner of targets(effect)){s.players[owner].vp+=amount;details.push(`${names[owner]}${amount<0?'失去':'获得'}${Math.abs(amount)}分`);}
  }else if(effect.type==='loseSmart'){
   for(const owner of targets(effect)){loseSP(s.players[owner],amount);details.push(`${names[owner]}失去${amount} SP，不足部分扣分`);}
  }else if(effect.type==='influence'){
   for(const owner of targets(effect))if(q.submissions[owner]?.total>0)q.rewardQueue.push({owner,region:effect.region,type:'influence',...(effect.country?{country:effect.country}:{})});
  }else if(effect.type==='investment'){
   for(const owner of targets(effect))if(q.submissions[owner]?.total>0&&bidInvestmentTargets(s,owner,effect.region).length)q.rewardQueue.push({owner,region:effect.region,type:'investment',optional:true});
  }else if(effect.type==='removeInfluence')details.push(removeEventInfluence(s,effect.player,effect.region));
  else if(effect.type==='downgradeInfluence')details.push(downgradeEventInfluence(s,effect.player,effect.region));
  else if(effect.type==='neutral'){addNeutralInfluence(s,effect.region);details.push(`${AREAS[effect.region].name}添加1点中立影响力`);}
  else if(effect.type==='loss')details.push(resolveBidLoss(s,effect));
  else throw Error('未支持的竞价结果操作');
 }
 return details;
}
function applyFace(s,q){
 const d=BID_EVENTS[q.cardId],sides=EVENT_DATA[q.cardId].sides,won=sides[q.winner]||[],contributed=p=>q.submissions[p]?.total>0;
 const grant=(owner,smart,vp=0)=>{if(contributed(owner)){s.players[owner].smart+=smart;s.players[owner].vp+=vp;}};
 const place=(owner,region,type='influence')=>{if(contributed(owner))q.rewardQueue.push({owner,region,type});};
 const convert=(owner,region,optional=false)=>{if(contributed(owner)&&s.regions[region].temporary.includes(owner))q.rewardQueue.push({owner,region,type:'convert',optional});};
 const effects=[];
 if(q.allZero)return ['所有总投标（含修正）为0，事件无效果'];
 if(q.winner===null&&d.tie!=='shared'){if(d.tie==='repeat')q.repeat=true;return [d.tie==='repeat'?'平局：本次双方按各自投标数获得SP，事件保留到下轮':'平局：本次双方按各自投标数获得SP，无进一步效果'];}
 if(d.resolution)return resolveFaceRules(s,q,d.resolution,grant);
 if(d.effect==='dollar'){
  if(won.includes('US')){grant('US',2,1);s.players.RU.vp--;s.players.CN.vp--;}
  else {grant('RU',2,1);grant('CN',2,1);s.players.US.vp-=2;}
  q.totals={US:q.sideTotals[0].total,RU_CN:q.sideTotals[1].total,modifier:q.modifiers.US};
 }else if(d.effect==='africa')place(won[0],'A','africa');
 else if(d.effect==='mrca'){
  const owner=won[0];if(contributed(owner)){if(isAutoma(s,owner))s.players[owner].money-=10;else s.players[owner].resources[6]--;s.players[owner].money+=10;place(owner,'S');effects.push(`${names[owner]}出售1支待命军队，获得10资金`);}
 }else if(d.effect==='belarus'){
  if(won.includes('RU'))place('RU','E');else{grant('US',1);grant('EU',1);effects.push(removeEventInfluence(s,'RU','E'));}
 }else if(d.effect==='sahel'){
  if(won.includes('EU')){grant('EU',3);loseSP(s.players.RU,1);effects.push('俄罗斯失去1 SP，不足部分失去1分');}
  else {grant('RU',1);convert('RU','A',true);effects.push(removeEventInfluence(s,'EU','A',true));}
 }else if(d.effect==='southChina'){
  if(won.includes('CN'))place('CN','P');else{if(contributed('US'))gainResource(s.players.US,5,alliedCount(s,'US','P'));effects.push(downgradeEventInfluence(s,'CN','P'));}
 }else if(d.effect==='syria'){
  if(won.includes('RU')){grant('RU',3);convert('RU','N');queueChain(s,'c0231330f35ed');effects.push('抵抗轴心崛起加入下一轮（此前已加入则不重复）');}
  else {grant('US',2);grant('EU',2);effects.push(removeEventInfluence(s,'neutral','N'),removeEventInfluence(s,'RU','N'));}
 }else if(d.effect==='myanmar'){
  if(won.includes('US')){grant('US',3);grant('EU',3);}
  else {convert('RU','S',true);if(contributed('CN'))q.rewardQueue.push({owner:'CN',region:'S',type:'paidInfluence',optional:true,money:10,diplomacy:0});}
 }else if(d.effect==='americas'){
  if(won.includes('US')){grant('US',2);convert('US','M',true);}
  else {
   const total=owner=>q.submissions[owner].total+q.modifiers[owner];
   const order=['RU','CN'].filter(owner=>contributed(owner)&&total(owner)>total('US')).sort((a,b)=>Number(won.includes(a))-Number(won.includes(b)));
   for(const owner of order)place(owner,'M');
   q.afterRewards=[{owner:'US',region:'M'}];effects.push('高于美国出价的参与者依次放置影响力，获胜者最后；完成后降低美国1点永久影响力');
  }
 }else if(d.effect==='karabakh'){
  if(won.includes('RU'))place('RU','C');
  else {effects.push(removeEventInfluence(s,'RU','C',true));q.rewardQueue.push({owner:'US',region:'C',type:'paidInfluence',optional:true,money:10,diplomacy:2});}
 }else if(d.effect==='yemen'){
  if(won.length){grant('US',1);grant('EU',1);}
  else {queueChain(s,'c0231330f35ed');effects.push('抵抗轴心崛起加入下一轮（此前已加入则不重复）');}
 }else if(d.effect==='libya'){
  if(won.includes('RU'))place('RU','N');
  else {loseSP(s.players.RU,1);addNeutralInfluence(s,'N');effects.push('俄罗斯失去1 SP（不足扣分）；中东添加1点中立影响力');}
 }else if(d.effect==='isis'){
  const armies=Object.values(q.eventArmies).reduce((sum,n)=>sum+n,0),owner=won[0];
  if(armies>=5){grant(owner,2);if(contributed(owner))gainResource(s.players[owner],5,1);effects.push('事件军队至少5支：赢家额外获得2 SP和1外交');}
  else if(armies>=3){grant(owner,2);queueChain(s,'c0231330f35ed');effects.push('事件军队3～4支：赢家额外获得2 SP；抵抗轴心崛起加入下一轮');}
  else {grant(owner,1);for(const id of q.participants)if(id!==owner)loseSP(s.players[id],2);addNeutralInfluence(s,'N');addNeutralInfluence(s,'N');effects.push('事件军队不足3支：赢家额外获得1 SP，其他玩家各失去2 SP（不足扣分）；中东添加2点中立影响力');}
 }else if(d.effect==='aukus'){
  if(won.includes('US')){addNeutralInfluence(s,'P');effects.push('先在亚太添加1点中立影响力');}
  place(won[0],'P','aukus');
  if(won.includes('US'))q.rewardQueue.push({owner:'CN',region:'P',type:'move',max:2,optional:true});
 }
 return effects;
}
export function submitBid(s,q,a){
 const owner=s.current;q.submissions[owner]=bidOffer(s,q,owner,a);q.done.push(owner);
 completeBid(s,q);
}
function completeBid(s,q){
 if(q.participants.filter(id=>!isNonPlayer(s,id)).every(id=>q.done.includes(id))){
  const rule=BID_EVENTS[q.cardId];
  for(const id of q.participants.filter(id=>isNonPlayer(s,id))){
   if(isAutoma(s,id)){q.submissions[id]=automaBidOffer(s,q,id,rule);if(!q.submissions[id].total)q.modifiers[id]=0;q.done.push(id);s.nonPlayerRandom=(s.nonPlayerRandom||0)+1;continue;}
   const total=drawNonPlayerBid(q.cardId,id),canMove=rule.armies==='all'||rule.armies?.includes(id),multiple=rule.money||rule.diplomacy||rule.services||rule.sale;
   const count=canMove?(multiple?Math.floor(total/2):total):0;
   q.submissions[id]={nonPlayer:true,total,count,armies:{},cost:0,moneyUnits:0,diplomacy:0,services:0,soldArmies:0,saleIncome:0};q.done.push(id);
  }
 }
 if(q.done.length!==q.participants.length)return;
 const before=publicBalances(s);
 for(const id of q.participants){const p=s.players[id],offer=q.submissions[id];p.money-=offer.cost;p.resources[5]-=offer.diplomacy;p.resources[4]-=offer.services||0;
  p.resources[6]-=offer.soldArmies||0;p.money+=offer.saleIncome||0;
  for(const [from,n] of Object.entries(offer.armies)){if(from==='reserve')p.resources[6]-=n;else s.regions[from].armies[id]-=n;}q.eventArmies[id]=offer.count;
 }
 outcome(s,q);
 if(!q.allZero)for(const [i,side] of EVENT_DATA[q.cardId].sides.entries())for(const id of side)s.players[id].smart+=i===q.winner?Math.floor(q.submissions[id].total/2):q.submissions[id].total;
 const effects=applyFace(s,q),winningSide=EVENT_DATA[q.cardId].sides[q.winner],winner=q.winner===null?(BID_EVENTS[q.cardId].tie==='shared'&&!q.allZero?'最高投标平局：所有玩家的基础SP按完整实际投标获得':''):(winningSide?winningSide.map(p=>names[p]).join('与'):'对手出价')+'获胜'+(q.tieBreak?'（按地区影响力、事件前分数、支付后资金及起始资金依次判平）':'');
 q.result=[winner,...effects,'投标费用与基础SP已结算；未出价的获胜成员不领取本方奖励'].filter(Boolean).join('；');
 addReceipt(q,s,before,q.result);
 drainNonPlayerRewards(s,q,finishBid);
}
export function resolveNonPlayerBidReward(s,q,a){resolveNonPlayerRewardChoice(s,q,a);drainNonPlayerRewards(s,q,finishBid);}
export function resolveBidReward(s,q,a){
 const step=q.rewardQueue?.[0];if(q.stage!=='reward'||step?.owner!==s.current)throw Error('请由当前获奖玩家完成选择');
 const before=publicBalances(s);let detail='';
 if(a.skip===true){if(!step.optional)throw Error('此获奖选择必须执行');detail='放弃本次可选效果';}
 else if(step.type==='investment'){
  if(!bidInvestmentTargets(s,step.owner,step.region).includes(a.country))throw Error('请选择本方在事件地区的盟国');
  resolveBasicEffect(s,a,{name:'竞价事件免费投资',effect:'invest',allowedRegions:[step.region],readyTarget:true,investmentLimit:Infinity,fixedInvestmentCost:0});
  detail=`重整并免费投资所选盟国，添加1影响力；${a.investSP==='after'?'支付1 SP再次重整':'投资后横置盟国'}`;
 }
 else if(step.type==='convert'){
  convertEventInfluence(s,step.owner,step.region,a.index);detail=`${AREAS[step.region].name}临时影响力转为永久；不获得槽位分`;
 }else if(step.type==='paidInfluence'){
  const p=s.players[s.current];if(p.money<step.money||p.resources[5]<step.diplomacy)throw Error('付费影响力所需资金或外交不足');
  p.money-=step.money;p.resources[5]-=step.diplomacy;const result=placeEventInfluence(s,step.owner,step.region,a.slot);
  detail=`支付${step.money}资金、${step.diplomacy}外交，在${AREAS[step.region].name}添加1点影响力，获得${result.vp}槽位分`;
 }else if(step.type==='move'){
  const moves=a.moves??{},p=s.players[s.current];if(!moves||Array.isArray(moves)||typeof moves!=='object')throw Error('请选择军队来源');let count=0;
  for(const [from,n] of Object.entries(moves)){
   if(from!=='reserve'&&(!AREAS[from]||from===step.region))throw Error('请选择待命区或其他地区的军队');
   integer(n,from==='reserve'?p.resources[6]:s.regions[from].armies[s.current]);count+=n;
  }
  if(count>step.max)throw Error('移动军队超过本次限额');
  for(const [from,n] of Object.entries(moves)){if(from==='reserve')p.resources[6]-=n;else s.regions[from].armies[s.current]-=n;}s.regions[step.region].armies[s.current]+=count;
  detail=`免费向${AREAS[step.region].name}移动${count}支军队`;
 }else{
  const energy=integer(a.energy??0,step.type==='africa'?3:0),raw=integer(a.raw??0,step.type==='africa'?3:0),p=s.players[s.current],cost=2*(energy+raw);
  if(p.money<cost)throw Error('购买能源和原料所需资金不足');p.money-=cost;const result=placeEventInfluence(s,step.owner,step.region,a.slot);
  const overflow=gainResource(p,0,energy)+gainResource(p,1,raw);detail=`向${AREAS[step.region].name}添加1点${a.slot==='temporary'?'临时':'永久'}影响力，获得${result.vp}槽位分${step.type==='africa'?`；花${cost}资金购买${energy}能源、${raw}原料，超限折现${overflow}资金`:''}`;
  if(a.sellArmy===true){if(step.type!=='aukus'||p.resources[6]<1)throw Error('没有可出售的待命军队或此事件不允许出售');p.resources[6]--;p.money+=10;detail+='；出售1支待命军队，获得10资金';}
  if(step.country){takeEventCountry(s,step.owner,step.country,{clearInvestmentsFromOtherOwner:true,ready:true});detail+='；取得并准备格鲁吉亚，原属于其他玩家时清除原投资指示物';}
 }
 addReceipt(q,s,before,detail,s.current);q.rewardQueue.shift();drainNonPlayerRewards(s,q,finishBid);
}
