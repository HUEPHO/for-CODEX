import {AREAS,IDS,threatPreview} from './world.js';
import {isAutoma,isNonPlayer} from './player-configuration.js';
import {militaryAutomaRegions} from './automa-board.js';
import {countryInfo} from './country-actions.js';
import {ECONOMY} from './economy.js';

// Script policy for choices the event rules leave to a player. These are not
// additional printed Automa rules. Only the authoritative event reducer calls
// this planner; the automatic-flow projection emits a command without targets.
const regions=Object.keys(AREAS);
function militaryValue(s,owner){
 const losses=threatPreview(s,owner).total;
 const threats=IDS.filter(id=>id!==owner).reduce((n,id)=>n+threatPreview(s,id).rows.filter(row=>row.opponents.includes(owner)).length,0);
 return threats-4*losses;
}
function armyDestination(s,owner,allowed){
 const preferred=isAutoma(s,owner)?militaryAutomaRegions(s,owner,false,regions.filter(region=>!allowed.includes(region))):[];
 if(preferred.length)return preferred[0];
 return [...allowed].sort((a,b)=>{
  const score=region=>{const copy=structuredClone(s);copy.regions[region].armies[owner]++;return militaryValue(copy,owner);};
  return score(b)-score(a)||Number(AREAS[b].interest.includes(owner))-Number(AREAS[a].interest.includes(owner));
 })[0];
}
function placements(s,step){
 const {owner,type}=step,p=s.players[owner],copy=structuredClone(s),out={};
 const allowed=step.region?[step.region]:step.regions||(type==='withdraw'?regions.filter(region=>AREAS[region].interest.includes(owner)):regions);
 const cost=isAutoma(s,owner)?step.moveCost||0:0,count=Math.min(step.max,cost?Math.floor(p.money/cost):step.max);
 if(type==='withdraw')copy.regions.C.armies[owner]-=step.max;
 for(let n=0;n<count;n++){const region=armyDestination(copy,owner,allowed);out[region]=(out[region]||0)+1;copy.regions[region].armies[owner]++;}
 return out;
}
function productionKey(s,owner){
 const partner=owner==='US'?'EU':'US',p=s.players[partner];
 if(isNonPlayer(s,partner))return undefined;
 // The TTIP card holder chooses the partner's increase. Prefer a scarce,
 // valuable resource, with stable resource order as the final tie-breaker.
 const values=[3,3,3,10,10,5,10];
 return p.production.flatMap((n,k)=>n<ECONOMY[partner].max[k]?[k]:[]).sort((a,b)=>values[b]/(1+p.production[b]+p.resources[b])-values[a]/(1+p.production[a]+p.resources[a]))[0];
}
export function nonPlayerDecision(s,q){
 const step=q.nonPlayerChoice;
 if(!step||!isNonPlayer(s,step.owner))throw Error('当前没有自动机待办');
 const {owner,type}=step,p=s.players[owner];
 if(type==='disarm'){
  const choices=step.regions.filter(region=>s.regions[region].armies[owner]>0);
  const value=region=>{const copy=structuredClone(s);copy.regions[region].armies[owner]--;return militaryValue(copy,owner);};
  choices.sort((a,b)=>value(b)-value(a)||s.regions[b].armies[owner]-s.regions[a].armies[owner]);
  if(!choices.length)throw Error('自动机没有可移回补给的军队');
  return {placements:{[choices[0]]:1}};
 }
 if(['withdraw','move','place'].includes(type))return {placements:placements(s,step)};
 if(type==='convert'||type==='nordstream'){
  if(type==='nordstream'&&isAutoma(s,owner)&&p.money<20)return {skip:true};
  // Preserve the temporary influence closest to being pushed off its track.
  const target=[...step.targets].sort((a,b)=>(AREAS[a.region].temp.length-s.regions[a.region].temporary.length+a.index)-(AREAS[b.region].temp.length-s.regions[b.region].temporary.length+b.index)||Number(AREAS[b.region].interest.includes(owner))-Number(AREAS[a.region].interest.includes(owner)))[0];
  return target?{region:target.region,index:target.index}:{skip:true};
 }
 if(type==='ttip'){
  const face=!isAutoma(s,owner)||p.money>=30&&s.round<=3?'investment':'exchange';
  return {face,...(face==='investment'?{productionKey:productionKey(s,owner)}:{})};
 }
 if(type==='bricsCountry'){
  const starting=new Set(p.allies.filter(id=>countryInfo(id).starting).map(id=>countryInfo(id).countryName));
  // Use the printed improve-relations preference: upgrade a starting ally,
  // then a country permitting a base, then the highest country value.
  const country=[...step.countries].sort((a,b)=>{
   const ca=countryInfo(a),cb=countryInfo(b);
   return Number(starting.has(cb.countryName))-Number(starting.has(ca.countryName))||Number(cb.basePowers.includes(owner))-Number(ca.basePowers.includes(owner))||cb.countryValue-ca.countryValue;
  })[0];
  return country?{country}:{skip:true};
 }
 throw Error('自动机选择策略尚未登记：'+type);
}
