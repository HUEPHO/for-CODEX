import {AREAS,IDS,syncInfluence} from './world.js';
import {countryRegion} from './research.js';
import {allowedSpecialRegion,payCardCost,gainCardResources} from './special-effects.js';
import {resolveProsperity,gainResource} from './economy.js';

export function beijingPreview(s){const copy=structuredClone(s),p=copy.players[copy.current],offer=resolveProsperity(copy,true),before=p.resources[5];gainResource(p,5,p.prosperity);return {...offer,level:p.prosperity,diplomacy:p.prosperity,receivedDiplomacy:p.resources[5]-before};}
export function resolveBeijing(s){const result=beijingPreview(s);resolveProsperity(s,true);gainResource(s.players[s.current],5,result.diplomacy);return result;}

export function aidAllies(s){const p=s.players[s.current];return p.allies.filter(id=>!(p.exhaustedAllies||[]).includes(id));}
export function aidPreview(s,a){
 const allies=a.allies,eligible=aidAllies(s);
 if(!Array.isArray(allies)||allies.length!==2||new Set(allies).size!==2||allies.some(id=>!eligible.includes(id)))throw Error('请选择两个本方未横置盟国');
 const regions=allies.map(countryRegion);if(new Set(regions).size!==2)throw Error('两个盟国必须位于不同地区');
 const cost={money:15,resources:{6:2}},gain={resources:{5:2}};payCardCost(structuredClone(s),cost);return {allies:[...allies],regions,cost,gain};
}
export function resolveAid(s,a){const result=aidPreview(s,a),p=s.players[s.current];payCardCost(s,result.cost);p.exhaustedAllies??=[];p.exhaustedAllies.push(...result.allies);gainCardResources(s,result.gain);return result;}

export function swapRegions(s,step={}){return Object.keys(AREAS).filter(region=>allowedSpecialRegion(step,region)&&s.regions[region].temporary.includes(s.current)&&swapTargets(s,region).length);}
export function swapTargets(s,region){const r=s.regions[region];return r?['permanent','extraPermanent'].flatMap(kind=>r[kind].flatMap((player,index)=>IDS.includes(player)&&player!==s.current?[{kind,index,player}]:[])):[];}
export function swapPreview(s,a,step){
 if(!swapRegions(s,step).includes(a.region))throw Error('请选择同时有本方临时影响力和其他玩家永久影响力的允许地区');
 const r=s.regions[a.region];if(!Number.isInteger(a.tempIndex)||r.temporary[a.tempIndex]!==s.current)throw Error('请选择本方临时影响力');
 const target=swapTargets(s,a.region).find(x=>x.kind===a.permanentKind&&x.index===a.permanentIndex);if(!target)throw Error('请选择另一位玩家的永久影响力');
 payCardCost(structuredClone(s),step.cost);return {region:a.region,tempIndex:a.tempIndex,target,cost:step.cost};
}
export function resolveSwap(s,a,step){const result=swapPreview(s,a,step),r=s.regions[result.region];payCardCost(s,result.cost);r.temporary[result.tempIndex]=result.target.player;r[result.target.kind][result.target.index]=s.current;syncInfluence(r);return result;}
