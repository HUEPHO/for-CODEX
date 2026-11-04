import {countryInfo} from './country-actions.js';
import {ECONOMY,validateProduction} from './economy.js';
import {productionPreview,applyProduction} from './domestic-actions.js';
import {reinforcementPreview,applyReinforcement} from './military.js';
import {placeEventInfluence} from './event-influence.js';
import {queueChain} from './event-board.js';
import {REGIONS} from './game-constants.js';

// Printed differences are data; all four decisions share cost, production,
// movement, reward and preview execution in their printed order.
export const MILITARY_EVENTS=Object.freeze({
 c1b3f3035a3cf:{owner:'US',name:'美国—日本—韩国同盟',cost:{money:0,services:0,diplomacy:2},discountCountry:'South Korea',eventTransfer:true,minMoves:2,maxMoves:2,destinations:['P'],moveCost:5,smart:1,influence:true,chain:'ca5b5108041b5'},
 c870029980e16:{owner:'US',name:'四方安全会谈',cost:{money:10,services:1,diplomacy:1},minMoves:1,maxMoves:1,destinations:['P','S'],ignoreBase:true,moveCost:5,smart:3,influence:true,chain:'ca5b5108041b5'},
 ca5b5108041b5:{owner:'CN',name:'中国的战略应对',cost:{money:20,services:0,diplomacy:2},produce:true,minMoves:0,maxMoves:3,destinations:['P'],moveCost:5,smart:0,influence:true},
 cc9cdee5577c2:{owner:'EU',name:'永久结构性合作（PESCO）',cost:{money:20,services:1,diplomacy:0},produce:true,upgrade:true,minMoves:0,maxMoves:3,destinations:['E'],moveCost:0,smart:3,influence:false}
});
function integer(n,max){if(!Number.isInteger(n)||n<0||n>max)throw Error('请选择限额内的非负整数军队数量');return n;}
export function militaryCondition(s,q){
 const rule=MILITARY_EVENTS[q?.cardId];
 if(!rule||q.owner!==rule.owner||!s.players[q.owner])throw Error('军事事件的所属玩家不符');
 const p=s.players[q.owner],cost={...rule.cost};
 if(rule.discountCountry&&p.allies.some(id=>countryInfo(id).countryName===rule.discountCountry))cost.diplomacy=0;
 if(rule.produce)validateProduction(p,q.owner);
 const production=rule.produce?{current:p.production[6],limit:Math.min(ECONOMY[q.owner].max[6],p.production[6]+Number(!!rule.upgrade)),full:p.production[6]===ECONOMY[q.owner].max[6]}:null;
 return {...rule,cost,production,met:true,detail:`支付${cost.money}资金、${cost.services}服务、${cost.diplomacy}外交；${rule.moveCost?'每支移动另付5资金':'移动免费'}。`};
}
function pay(p,cost){
 if(p.money<cost.money||p.resources[4]<cost.services||p.resources[5]<cost.diplomacy)throw Error('执行事件所需资金、服务或外交不足');
 p.money-=cost.money;p.resources[4]-=cost.services;p.resources[5]-=cost.diplomacy;
}
function selectedMoves(s,q,a,model){
 const destination=a.destination??model.destinations[0];
 if(!model.destinations.includes(destination))throw Error('请选择事件允许的军队目的地');
 const quantities=a.moves??{};
 if(!quantities||typeof quantities!=='object'||Array.isArray(quantities))throw Error('请选择各来源的军队数量');
 const moves=[];
 for(const [from,n] of Object.entries(quantities)){
  if(from!=='reserve'&&!Object.hasOwn(REGIONS,from))throw Error('无效军队来源');
  integer(n,model.maxMoves);
  if(n&&!model.eventTransfer&&from===destination)throw Error('出发地和目的地不能相同');
  const available=from==='reserve'?s.players[q.owner].resources[6]:s.regions[from].armies[q.owner];
  if(n>available)throw Error('所选来源的军队不足');
  for(let i=0;i<n;i++)moves.push({from,to:destination});
 }
 if(moves.length<model.minMoves||moves.length>model.maxMoves)throw Error(model.minMoves===model.maxMoves?`本事件必须移动${model.minMoves}支军队才能领取奖励`:`本事件最多移动${model.maxMoves}支军队`);
 return {destination,moves};
}
function moveArmies(s,q,selection,model){
 const p=s.players[q.owner],{moves,destination}=selection;
 if(model.eventTransfer){
  // The event card is an additional region (WIT p.10), so armies already
  // in Asia-Pacific can go onto the card and return after its resolution.
  const cost=moves.length*model.moveCost;
  if(p.money<cost)throw Error('移动军队所需资金不足');
  p.money-=cost;
  for(const {from} of moves){if(from==='reserve')p.resources[6]--;else s.regions[from].armies[q.owner]--;}
  s.regions[destination].armies[q.owner]+=moves.length;
  return cost;
 }
 const result=reinforcementPreview(s,{moves},{name:model.name,armyGain:0,minMoves:model.minMoves,maxMoves:model.maxMoves,moveCost:model.moveCost,onlyDestination:destination,...(model.ignoreBase?{destinationOverride:destination}:{})});
 applyReinforcement(s,result);return result.cost;
}
function execute(s,q,a,model){
 if(!a.accept)return '放弃本次可选效果；未支付费用，也不获得奖励或加入连锁。';
 const p=s.players[q.owner],parts=[];
 pay(p,model.cost);parts.push(`支付${model.cost.money}资金、${model.cost.services}服务、${model.cost.diplomacy}外交`);
 if(model.smart){p.smart+=model.smart;parts.push(`获得${model.smart} SP`);}
 if(model.upgrade){
  if(model.production.full)parts.push('军队产能已满，跳过提升并继续其余效果');
  else{p.production[6]++;parts.push('军队产能提升1');}
 }
 if(model.produce){
  const quantity=integer(a.quantity??0,model.production.limit);
  const result=productionPreview(s,quantity?[{key:6,quantity}]:[],1);applyProduction(s,result);
  parts.push(`支付${quantity}原料和${quantity}粮食，生产${quantity}支军队`);
 }
 const selection=selectedMoves(s,q,a,model),cost=moveArmies(s,q,selection,model);
 parts.push(`${cost?'另付'+cost+'资金':'免费'}移动${selection.moves.length}支军队${model.eventTransfer?'至事件牌，结算后进入':'至'}${REGIONS[selection.destination]}`);
 if(model.influence){placeEventInfluence(s,q.owner,selection.destination,a.slot);parts.push('该地区添加1影响力');}
 if(model.chain){queueChain(s,model.chain);parts.push('中国的战略应对登记为下一轮连锁（已出现的不重复加入）');}
 return parts.join('；')+'。';
}
export function resolveMilitary(s,q,a,{preview=false}={}){
 if(q?.owner!==s.current)throw Error('请由军事事件所属玩家操作');
 if(a.accept!==true&&a.accept!==false)throw Error('请选择执行或放弃可选效果');
 const model=militaryCondition(s,q),copy=structuredClone(s),detail=execute(copy,structuredClone(q),a,model);
 if(!preview)execute(s,q,a,model);
 return detail;
}
