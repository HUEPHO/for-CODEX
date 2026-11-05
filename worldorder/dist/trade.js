import {allocateRegionalExports} from './regional-trade.js';
import {eventTradeIssue,eventImportSurcharge} from './event-effect-state.js';
import {validateSP} from './smart-power.js';
import {countryInfo} from './country-actions.js';
import {COUNTRY_TRADE} from './trade-data.js';
import {COMMERCE,TRADE_LIMITS} from './commerce.js';
import {gainResource} from './economy.js';
import {eventTradeRegions,eventExportMultiplier} from './event-effects.js';
export const EXPORT_PRICE=[5,5,5,15,15,0,20],IMPORT_PRICE=[3,3,3,10,10];
export function tradeCapacity(s,player,card={},regions=[],primaryResource){
 const p=s.players[player],exports=Array(7).fill(0),imports=Array(5).fill(0),byRegion=Object.fromEntries(Object.keys(s.regions).map(id=>[id,{exports:Array(7).fill(0),imports:Array(5).fill(0)}]));
 const extra=[...regions,...(card.virtualRegions||[]),...eventTradeRegions(s,player)].flatMap(region=>s.regions[region]?.available||[]).filter(id=>!countryInfo(id).blockedPowers.includes(player));
 for(const id of [...new Set([...p.allies,...extra])]){
  const region=countryInfo(id).region;if(card.tradeOnlyRegions&&!card.tradeOnlyRegions.includes(region))continue;
  for(const cid of [id,...(p.allies.includes(id)?p.countryUnderlays?.[id]||[]:[])]){const c=COUNTRY_TRADE[cid];if(!c)throw Error('该盟国贸易符号尚未录入');
   for(const [direction,total] of [['exports',exports],['imports',imports]])for(const key of c[direction]){const base=(card.doublePrimary&&p.allies.includes(id)&&key===primaryResource&&key<2)||(card.doubleEnergy&&key===0)?2:1,n=Math.max(base,direction==='exports'?eventExportMultiplier(s,player,cid):1);total[key]+=n;byRegion[region][direction][key]+=n;}
  }
 }
 return {exports,imports,byRegion};
}
function quantity(n){if(!Number.isInteger(n)||n<0||n>999)throw Error('贸易数量必须为非负整数');return n;}
function exportAllocation(row,capacity,required){
 if(row.regions===undefined){if(required)throw Error('本牌请按出口目的地区分配数量');return null;}
 if(!row.regions||typeof row.regions!=='object'||Array.isArray(row.regions))throw Error('出口地区分配无效');
 let total=0;const result={};for(const [region,value] of Object.entries(row.regions)){const n=quantity(value);if(!capacity.byRegion[region]||n>capacity.byRegion[region].exports[row.key])throw Error('出口数量超过该地区国家需求');result[region]=n;total+=n;}
 if(total!==row.quantity)throw Error('各地区出口数量之和必须等于本项出口总量');return result;
}
export function tradePreview(s,a,card){if(card.doublePrimary&&![0,1].includes(a.primaryResource))throw Error('能源巨擘请选择能源或原材料');if(!s.tradeVersion)throw Error('请先确认各方贸易卡正反面，启用贸易记录');const tradeRegions=a.tradeRegions??[];if(!Array.isArray(tradeRegions)||new Set(tradeRegions).size!==tradeRegions.length||tradeRegions.some(id=>!s.regions[id]))throw Error('SP贸易需选择不同的有效地区');if(card.tradeOnlyRegions&&tradeRegions.some(id=>!card.tradeOnlyRegions.includes(id)))throw Error('本牌仅能与所选地区的国家贸易');const smartCost=validateSP(s,tradeRegions.length);const players=structuredClone(s.players),actor=s.current,p=players[actor],capacity=tradeCapacity(s,actor,card,tradeRegions,a.primaryResource),requestedExports=a.exports||[],imp=a.imports||[],limits=TRADE_LIMITS[actor],used=new Set(),exportsByRegion=Object.fromEntries(Object.keys(s.regions).map(id=>[id,Array(7).fill(0)]));
 let exp=requestedExports;
 if(a.rewardRegions!==undefined){if(!card.regionalInfluence||!Array.isArray(a.rewardRegions))throw Error('奖励地区选择无效');if(a.rewardRegions.length)exp=allocateRegionalExports(exp,capacity,card.regionalInfluence,a.rewardRegions);}
 if(!Array.isArray(exp)||!Array.isArray(imp)||exp.length>limits.exports||imp.length>limits.imports)throw Error('超出本国贸易交易次数');if(card.maxTradeTypes&&exp.length+imp.length>card.maxTradeTypes)throw Error('本牌只能交易'+card.maxTradeTypes+'种资源（进口或出口）');let revenue=0,expense=0,diplomacy=0,overflow=0;const transactions=[];
 for(const row of exp){const k=row.key,n=quantity(row.quantity);if(!Number.isInteger(k)||![0,1,2,3,4,6].includes(k)||n<1||used.has(k))throw Error('每种资源在本次贸易中只能交易一次');used.add(k);if(n>capacity.exports[k])throw Error('出口数量超过盟国需求');if(p.resources[k]<n)throw Error('出口库存不足（军队只能出售待命区的）');const allocation=exportAllocation(row,capacity,!!card.regionalInfluence&&a.rewardRegions===undefined);if(allocation)for(const [region,count] of Object.entries(allocation))exportsByRegion[region][k]=count;p.resources[k]-=n;p.money+=n*EXPORT_PRICE[k];revenue+=n*EXPORT_PRICE[k];transactions.push({direction:'export',key:k,quantity:n,...(allocation?{regions:allocation}:{})});}
 for(const row of imp){const k=row.key;if(!Number.isInteger(k)||k<0||k>4||used.has(k))throw Error('不能重复交易或进口已出口的资源');used.add(k);const country=quantity(row.countryQuantity||0),sources=row.players||{};if(Object.keys(sources).some(id=>!players[id]||id===actor))throw Error('进口交易对象无效');if(country>capacity.imports[k])throw Error('从盟国进口数量超限');let total=country;const purchases=[];
  for(const [seller,n0] of Object.entries(sources)){const n=quantity(n0);if(!n)continue;if(card.playersTrade===false)throw Error('本牌仅与所选地区国家贸易，不能向玩家进口');const issue=eventTradeIssue(s,actor,seller);if(issue)throw Error(issue);const cfg=COMMERCE[seller];if(!cfg.resources.includes(k)||n>cfg.quantity)throw Error('超出贸易协定允许的玩家进口额度');const vendor=players[seller];if(!Array.isArray(vendor.commerce)||vendor.commerce.length!==cfg.count)throw Error('对方贸易卡记录无效');const available=vendor.commerce.find(c=>c.ready);if(available)available.ready=false;else{if(vendor.resources[k]<n)throw Error('对方没有足够库存或可用贸易卡');vendor.resources[k]-=n;}purchases.push({seller,quantity:n});total+=n;if(seller!=='RU'||n===3)diplomacy=1;
  }
  if(total<1)throw Error('进口数量至少为1');const cost=total*IMPORT_PRICE[k]+purchases.reduce((sum,buy)=>sum+eventImportSurcharge(s,actor,buy.seller),0);if(p.money<cost)throw Error('进口资金不足');p.money-=cost;expense+=cost;for(const buy of purchases)players[buy.seller].money+=buy.quantity*IMPORT_PRICE[k];overflow+=gainResource(p,k,total);transactions.push({direction:'import',key:k,quantity:total,country,purchases});
 }
 gainResource(p,5,diplomacy);const currencyBonus=(card.currencyBonus||0)*imp.length;p.money+=currencyBonus;
 const goods=quantity(a.factoryGoods||0);if(goods){if(!card.factory||goods>2||goods>p.production[3])throw Error('世界工厂最多生产2消费品，且不能超过产能');if(p.resources[0]<goods||p.resources[1]<goods)throw Error('世界工厂生产所需能源或原料不足');p.resources[0]-=goods;p.resources[1]-=goods;overflow+=gainResource(p,3,goods);for(const c of p.commerce)c.ready=true;}
 const exportRevenueByRegion=Object.fromEntries(Object.entries(exportsByRegion).map(([region,counts])=>[region,counts.reduce((n,count,key)=>n+count*EXPORT_PRICE[key],0)]));
 const bonus=card.regionalInfluence,bonusRegions=bonus?(bonus.regions||Object.keys(s.regions)).filter(region=>exportRevenueByRegion[region]>=(bonus.minimumRevenue||0)&&Object.entries(bonus.requirements||{}).every(([key,n])=>exportsByRegion[region]?.[key]>=n)):[];
 return {...(card.doublePrimary?{primaryResource:a.primaryResource}:{}),name:card.name,effect:'trade',cost:expense,vp:0,players,smartCost,revenue,expense,diplomacy,overflow,currencyBonus,factoryGoods:goods,transactions,exportsByRegion,exportRevenueByRegion,bonusRegions};
}
export function applyTrade(s,result){for(const [id,projected] of Object.entries(result.players)){const p=s.players[id];p.money=projected.money;p.resources=projected.resources;p.commerce=projected.commerce;}}
