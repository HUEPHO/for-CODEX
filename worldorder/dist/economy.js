import {refreshCommerce} from './commerce.js';
import {hasGrowth} from './growth-effects.js';
import {resolveQuickResponse} from './growth-focus.js';
// Printed player-board economy, verified against all four supplied board images.
export const RESOURCE_LABELS=['能源','原料','粮食','消费品','服务','外交','军队'];
export const FOCUSES=['内政焦点','外交焦点','军事焦点'];
export const ECONOMY={
 US:{max:[5,4,5,5,5,5,5],upgrade:8,ready:[1,4,2],vp:[2,3,4,5,8],money:[10,15,20,30,0]},
 CN:{max:[2,4,5,5,3,5,5],upgrade:6,ready:[1,4,2],vp:[3,4,5,8,11],money:[5,10,15,20,0]},
 EU:{max:[2,3,5,5,5,5,5],upgrade:7,ready:[2,5,3],vp:[2,4,6,9,12],money:[10,15,20,30,0]},
 RU:{max:[6,5,5,3,3,5,5],upgrade:6,ready:[1,4,2],vp:[3,4,5,7,10],money:[5,10,15,20,0]}
};
function integer(n){if(!Number.isInteger(n)||n<0)throw Error('数量必须为非负整数');return n;}
export function validateProduction(p,id){if(!Array.isArray(p.production)||p.production.length!==7||p.production.some((n,k)=>!Number.isSafeInteger(n)||n<0||!p.debugProduction&&(n<1||n>ECONOMY[id].max[k])))throw Error('生产轨记录无效');}
export function gainResource(p,key,n){integer(n);if(!Number.isInteger(key)||key<0||key>6)throw Error('无效资源');if(key===6){p.resources[key]+=n;return 0;}const excess=Math.max(0,p.resources[key]+n-10);p.resources[key]=Math.min(10,p.resources[key]+n);const money=key===5?0:excess*(key<3?3:10);p.money+=money;return money;}
export function producePrimary(s){let overflow=0;for(const [id,p] of Object.entries(s.players)){validateProduction(p,id);for(let k=0;k<3;k++){overflow+=gainResource(p,k,p.production[k]);refreshCommerce(p,id,k);}}return overflow;}
export function focusOptions(id,focus,p=null,round=0){const index=FOCUSES.indexOf(focus);if(index<0)throw Error('无效焦点');return {ready:ECONOMY[id].ready[index]+(p&&hasGrowth(p,round,'ready')?1:0),upgrades:index===0?[0,1,2,3,4,5,6]:[index===1?5:6],maxUpgrades:id==='CN'&&index===0?2:1,produce:index===0?[3,4]:[index===1?5:6]};}
export function focusCost(id,focus,upgrades=[]){const options=focusOptions(id,focus);if(!Array.isArray(upgrades)||new Set(upgrades).size!==upgrades.length||upgrades.length>options.maxUpgrades||upgrades.some(k=>!options.upgrades.includes(k)))throw Error('产能升级选择无效，不能重复升级同一种');return upgrades.length===2?15:upgrades.length*ECONOMY[id].upgrade;}
export function resolveFocus(s,a){
 const id=s.current,p=s.players[id],options=focusOptions(id,p.focus,p,s.round);validateProduction(p,id);
 const quickResponse=resolveQuickResponse(s,a.quickResponse);
 const ready=a.ready||[],upgrades=a.upgrades||[],quantities=a.quantities||Array(7).fill(0);
 if(!Array.isArray(ready)||new Set(ready).size!==ready.length||ready.length>options.ready||ready.some(x=>!p.allies.includes(x)||!(p.exhaustedAllies||[]).includes(x)))throw Error('请选择限额内、属于自己的已横置盟国');
 if(!Array.isArray(quantities)||quantities.length!==7)throw Error('生产数量无效');
 quantities.forEach((n,k)=>{integer(n);if(n&&!options.produce.includes(k))throw Error('该焦点不能生产这种资源');});
 const cost=focusCost(id,p.focus,upgrades);if(p.money<cost)throw Error('升级产能所需资金不足');
 for(const k of upgrades)if(p.production[k]>=ECONOMY[id].max[k])throw Error('该产能已达本国上限');
 p.exhaustedAllies=(p.exhaustedAllies||[]).filter(x=>!ready.includes(x));p.money-=cost;
 let overflow=0;for(const k of upgrades){p.production[k]++;if(k<3)overflow+=gainResource(p,k,1);}
 // Printed focus order: ready allies, optional upgrades, then secondary production.
 for(const k of options.produce){const n=quantities[k];if(n>p.production[k])throw Error('生产数量超过当前产能');
  if(k===5){if(p.money<n*3)throw Error('生产外交所需资金不足');p.money-=n*3;}
  else {const requirements=k===3?[0,1]:k===4?[0,2]:[1,2];if(requirements.some(j=>p.resources[j]<n))throw Error('生产所需初级资源不足');for(const j of requirements)p.resources[j]-=n;}
  overflow+=gainResource(p,k,n);if(n>0)refreshCommerce(p,id,k);
 }
 return {cost,ready:ready.length,overflow,produced:quantities,quickResponse};
}
export function prosperityOffer(p,id,round=0,fixedCost){const level=p.prosperity;if(!Number.isInteger(level)||level<0||level>5)throw Error('繁荣轨记录无效');const living=hasGrowth(p,round,'living')?1:0;return level===5?null:{cost:Math.max(0,(fixedCost??level+2)-living),vp:ECONOMY[id].vp[level]+living,money:ECONOMY[id].money[level]};}
export function resolveProsperity(s,improve,fixedCost){const p=s.players[s.current];if(typeof improve!=='boolean')throw Error('请选择提升或跳过');if(!improve)return null;const offer=prosperityOffer(p,s.current,s.round,fixedCost);if(!offer)throw Error('繁荣已达最高等级');if(p.resources[3]<offer.cost)throw Error('消费品不足');p.resources[3]-=offer.cost;p.vp+=offer.vp;p.money+=offer.money;p.prosperity++;return offer;}
