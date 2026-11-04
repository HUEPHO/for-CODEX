import {ABILITY_TYPES,TWO_TYPE_CHOICE} from './ability-types.js';
import {gainResource,RESOURCE_LABELS} from './economy.js';

export const TYPE_REWARDS={diplomatic:{name:'外交',key:5,amount:2},economic:{name:'经济',key:3,amount:1},military:{name:'军事',key:6,amount:1},domestic:{name:'内政',key:4,amount:1}};
export function resourceEfficiencyPreview(id,chosenTypes){
 let types=ABILITY_TYPES[id];if(!types)throw Error('此牌尚未核对类型图标，不能自动兑换资源');
 if(TWO_TYPE_CHOICE.has(id)){
  if(!Array.isArray(chosenTypes)||chosenTypes.length!==2||new Set(chosenTypes).size!==2||chosenTypes.some(type=>!types.includes(type)))throw Error('战略再评估必须选择两种不同类型的奖励');
  types=chosenTypes;
 }
 const totals=new Map();for(const type of types){const {key,amount}=TYPE_REWARDS[type];totals.set(key,(totals.get(key)||0)+amount);}
 return [...totals].map(([key,amount])=>({key,amount}));
}
export function applyResourceEfficiency(p,rewards){let overflow=0;for(const {key,amount} of rewards)overflow+=gainResource(p,key,amount);return {rewards,overflow};}
export function rewardSummary(rewards){return rewards.map(({key,amount})=>amount+RESOURCE_LABELS[key]).join('、');}
