import {ECONOMY,validateProduction} from './economy.js';

export function industryEligible(s){const p=s.players[s.current];validateProduction(p,s.current);return p.production.map((n,k)=>n<ECONOMY[s.current].max[k]?k:null).filter(k=>k!==null);}
export function validateIndustry(s,upgrades){const eligible=industryEligible(s);if(!Array.isArray(upgrades)||new Set(upgrades).size!==upgrades.length||upgrades.length!==Math.min(2,eligible.length)||upgrades.some(k=>!eligible.includes(k)))throw Error('产业发展需选择两种未达上限的不同产能（不足两种时选全部可提升项）');}
export function finishIndustry(s,a){
 validateIndustry(s,a.upgrades);
 for(const key of a.upgrades)s.players[s.current].production[key]++;
 s.flow.pendingGrowth=null;
 return {name:'产业发展',industry:true,upgrades:a.upgrades};
}
