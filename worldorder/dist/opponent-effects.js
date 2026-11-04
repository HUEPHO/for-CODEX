import {AREAS} from './world.js';
import {payCardCost} from './special-effects.js';
import {countryRegion} from './research.js';
export function readyRegionalAllies(s,player,region){const p=s.players[player];return p.allies.filter(id=>countryRegion(id)===region&&!(p.exhaustedAllies||[]).includes(id));}
export function opponentOrder(s,owner){const order=s.flow.order,index=order.indexOf(owner);return [...order.slice(index+1),...order.slice(0,index)];}
export function exhaustResponse(s,a,step){if(s.current!==step.player||!readyRegionalAllies(s,step.player,step.region).includes(a.country))throw Error('请由当前回应玩家选择自己的当地未横置盟国');const p=s.players[step.player];p.exhaustedAllies??=[];p.exhaustedAllies.push(a.country);}
export function otherArmyTargets(s,region){return Object.keys(s.players).filter(id=>id!==s.current&&(s.regions[region]?.armies[id]||0)>0);}
export function returnArmyPreview(s,a,step){if(!AREAS[step.region]||!otherArmyTargets(s,step.region).includes(a.targetPlayer))throw Error('请选择该地区仍有驻军的另一位玩家');payCardCost(structuredClone(s),step.cost);return {player:a.targetPlayer,region:step.region,cost:step.cost};}
export function resolveReturnArmy(s,a,step){const result=returnArmyPreview(s,a,step);payCardCost(s,step.cost);s.regions[result.region].armies[result.player]--;s.players[result.player].resources[6]++;return result;}
