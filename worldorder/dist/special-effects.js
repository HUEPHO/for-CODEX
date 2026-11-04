import {AREAS,changeInfluence} from './world.js';
import {gainResource,ECONOMY,validateProduction} from './economy.js';
import {placementPreview,placeWithResilience} from './growth-triggers.js';

export function payCardCost(s,cost={}){const p=s.players[s.current];if(p.money<(cost.money||0))throw Error('牌面效果所需资金不足');for(const [key,n] of Object.entries(cost.resources||{}))if(p.resources[key]<n)throw Error('牌面效果所需资源不足');p.money-=cost.money||0;for(const [key,n] of Object.entries(cost.resources||{}))p.resources[key]-=n;}
export function gainCardResources(s,gain={}){const p=s.players[s.current];p.money+=gain.money||0;p.vp+=gain.vp||0;for(const [key,n] of Object.entries(gain.resources||{}))gainResource(p,Number(key),n);}
export function allowedSpecialRegion(step,region){return !!AREAS[region]&&(!step.region||step.region===region)&&(!step.regions||step.regions.includes(region))&&step.excludeRegion!==region;}
function prepareInfluence(s,a,step){
 if(!allowedSpecialRegion(step,a.region))throw Error('请选择本段允许的地区');
 if(step.permanent&&a.slot!=='permanent')throw Error('本牌必须添加永久影响力');
 if(step.resetBefore){if(!Number.isInteger(a.resetIndex)||s.regions[a.region].temporary[a.resetIndex]!==s.current)throw Error('请选择本地区的一个本方临时影响力先重置');}
 payCardCost(s,step.cost);gainCardResources(s,step.gain);
 if(step.resetBefore)changeInfluence(s,{operation:'reset',region:a.region,index:a.resetIndex});
 if(step.supplyArmies)s.regions[a.region].armies[s.current]+=step.supplyArmies;
 return {region:a.region,influence:true,permanentOverflow:!!step.permanent,cost:step.cost||{},gain:step.gain||{},supplyArmies:step.supplyArmies||0,resetBefore:!!step.resetBefore};
}
export function influenceEffectPreview(s,a,step){const copy=structuredClone(s),result=prepareInfluence(copy,a,step);result.vp=placementPreview(copy,a,result);return result;}
export function resolveInfluenceEffect(s,a,step){const result=influenceEffectPreview(s,a,step);prepareInfluence(s,a,step);placeWithResilience(s,a,result);return result;}
export function industrializePreview(s,a){const p=s.players[s.current],upgrades=a.upgrades;validateProduction(p,s.current);if(!Array.isArray(upgrades)||![2,3].includes(upgrades.length)||new Set(upgrades).size!==upgrades.length||upgrades.some(k=>!Number.isInteger(k)||k<0||k>6||p.production[k]>=ECONOMY[s.current].max[k]))throw Error('请选择2或3种不同且未达上限的资源产能');const cost=upgrades.length===2?10:20;if(p.money<cost)throw Error('提升产能所需资金不足');return {cost,vp:3,production:p.production.map((n,k)=>n+(upgrades.includes(k)?1:0))};}
export function resolveIndustrialize(s,a){const result=industrializePreview(s,a),p=s.players[s.current];p.money-=result.cost;p.vp+=result.vp;p.production=result.production;return result;}
