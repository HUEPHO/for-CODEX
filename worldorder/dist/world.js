import {eventThreatLoss} from './event-effect-state.js';
import {countryValue,countryRegion} from './research.js';
import {investedCountries} from './investment-tokens.js';
import {hasGrowth} from './growth-effects.js';
export const IDS=['US','CN','EU','RU'];
export const AREAS={
 M:{name:'美洲',slots:3,temp:[4,3,2,1],bonus:[7,4,2],interest:['US'],start:['US']},
 E:{name:'欧洲',slots:7,temp:[5,4,3,2],bonus:[9,6,3,1],interest:['US','EU','RU'],start:['EU','US','RU']},
 C:{name:'中亚',slots:3,temp:[4,3,2,1],bonus:[8,4,2],interest:['RU','CN'],start:['RU']},
 N:{name:'中东',slots:6,temp:[5,4,3,2,1],bonus:[10,7,4,2],interest:['US','EU','RU'],start:['EU','US','neutral']},
 A:{name:'非洲',slots:2,temp:[4,3,2,1],bonus:[7,4,2],interest:['EU'],start:[]},
 S:{name:'南亚',slots:4,temp:[4,3,2,1],bonus:[8,5,2],interest:['CN'],start:['CN','neutral']},
 P:{name:'亚太',slots:5,temp:[4,3,2,1],bonus:[9,6,2],interest:['US','CN'],start:['CN','US']}
};
const zeros=()=>Object.fromEntries(IDS.map(id=>[id,0]));
export function syncInfluence(r){r.influence={...zeros(),neutral:0};for(const id of [...r.permanent,...r.temporary,...r.extraPermanent])if(id)r.influence[id]++;}
export function initializeWorld(s){s.worldVersion=1;for(const [id,r] of Object.entries(s.regions)){const a=AREAS[id];r.permanent=[...a.start,...Array(a.slots-a.start.length).fill(null)];r.temporary=id==='A'?['EU']:[];r.extraPermanent=[];r.engage=zeros();syncInfluence(r);}for(const p of Object.values(s.players))p.fdi=[];}
export function emptyPermanentSlot(r){return r.permanent.findIndex((id,i)=>id===null&&!(r.ignoredStartingSlots||[]).includes(i));}
export function retireStartingSlot(s,region,index){if(s.eventVersion&&index<AREAS[region].start.length){const r=s.regions[region];r.ignoredStartingSlots??=[];if(!r.ignoredStartingSlots.includes(index))r.ignoredStartingSlots.push(index);}}
export function changeInfluence(s,a){const r=s.regions[a.region],area=AREAS[a.region];if(!r||!area)throw Error('无效地区');const player=s.current;let vp=0,removed=null;
 if(a.operation==='placePermanent'){const slot=emptyPermanentSlot(r);if(slot<0){if(!a.allowOverflow)throw Error('永久槽已满');r.extraPermanent.push(player);}else{r.permanent[slot]=player;vp=1;}}
 else if(a.operation==='placeTemporary'){if(r.temporary.length===area.temp.length)removed=r.temporary.shift();else vp=area.temp[r.temporary.length];r.temporary.push(player);}
 else if(['reset','convert'].includes(a.operation)){if(!Number.isInteger(a.index)||r.temporary[a.index]!==player)throw Error('请选择自己的临时影响力');r.temporary.splice(a.index,1);if(a.operation==='reset')r.temporary.push(player);else{const slot=emptyPermanentSlot(r);if(slot<0)r.extraPermanent.push(player);else r.permanent[slot]=player;}}
 else if(a.operation==='remove'){if(!['permanent','temporary','extraPermanent'].includes(a.kind)||!Number.isInteger(a.index)||!r[a.kind][a.index])throw Error('无效影响力位置');if(a.kind==='permanent'){r.permanent[a.index]=null;retireStartingSlot(s,a.region,a.index);}else r[a.kind].splice(a.index,1);}
 else throw Error('无效影响力操作');
 if(s.flow?.step==='actions'&&['placePermanent','placeTemporary'].includes(a.operation)){s.flow.influencePlaced??={};s.flow.influencePlaced[player]=true;}
 syncInfluence(r);s.players[player].vp+=vp;return {vp,removed};
}
export function alliedCount(s,player,region){return s.players[player].allies.filter(id=>countryRegion(id)===region).length;}
export function investmentPreview(s,player,withdraw={}){let fdi=0,engage=0;for(const id of investedCountries(s,player))fdi+=2*countryValue(id);for(const [region,n] of Object.entries(withdraw)){if(!AREAS[region]||!Number.isInteger(n)||n<0||n>s.regions[region].engage[player])throw Error('介入标记数量无效');engage+=n*5*alliedCount(s,player,region);}return {fdi,engage,total:fdi+engage};}
export function threatPreview(s,player,defend=[]){if(!Array.isArray(defend)||new Set(defend).size!==defend.length||defend.some(id=>!AREAS[id]?.interest.includes(player)||s.regions[id].engage[player]<1))throw Error('请选择利益地区中可消耗的介入标记');const rows=[];let total=0;for(const [id,a] of Object.entries(AREAS)){if(!a.interest.includes(player))continue;const r=s.regions[id],extra=defend.includes(id)?2*alliedCount(s,player,id):0,defense=r.armies[player]+(s.players[player].focus==='军事焦点'?1:0)+(hasGrowth(s.players[player],s.round,'nuclear')?1:0)+extra;const opponents=[];for(const enemy of IDS){if(enemy===player||(['US','EU'].includes(player)&&['US','EU'].includes(enemy)))continue;const n=r.armies[enemy],threat=n+(n>0&&s.players[enemy].focus==='军事焦点'?1:0)+(hasGrowth(s.players[enemy],s.round,'nuclear')?1:0);if(threat>defense&&eventThreatLoss(s,player,enemy)>0)opponents.push(enemy);}const loss=opponents.reduce((n,enemy)=>n+eventThreatLoss(s,player,enemy),0);rows.push({region:id,defense,opponents,loss});total+=loss;}return {rows,total};}
// Equal metric values receive the bonus for the lowest occupied tied position.
export function rankBonus(entries,bonuses){const sorted=[...entries].sort((a,b)=>b.value-a.value||(b.priority||0)-(a.priority||0)||(b.tie||0)-(a.tie||0));const result={};for(let i=0;i<sorted.length;){let j=i+1;while(j<sorted.length&&sorted[j].value===sorted[i].value&&(sorted[j].priority||0)===(sorted[i].priority||0)&&(sorted[j].tie||0)===(sorted[i].tie||0))j++;for(let k=i;k<j;k++)result[sorted[k].id]={vp:bonuses[j-1]||0,rank:j};i=j;}return result;}
export const MAJORITY_BONUSES=Object.freeze({money:Object.freeze([5,3,1]),armies:Object.freeze([6,3,1]),allies:Object.freeze([7,4,2])});
// Public counters shared by live map standings and the actual scoring report.
// Reserve armies and fused underlays do not count toward these majorities.
export function majorityStandings(s){
 const metrics={money:IDS.map(id=>({id,value:s.players[id].money})),armies:IDS.map(id=>({id,value:Object.values(s.regions).reduce((n,r)=>n+r.armies[id],0)})),allies:IDS.map(id=>({id,value:s.players[id].allies.length}))};
 return Object.fromEntries(Object.entries(metrics).map(([key,entries])=>{
  const ranked=rankBonus(entries,MAJORITY_BONUSES[key]),highest=Math.max(...entries.map(entry=>entry.value));
  return [key,[...entries].sort((a,b)=>b.value-a.value).map(entry=>({...entry,...ranked[entry.id],leading:entry.value>0&&entry.value===highest}))];
 }));
}
export function scoringPreview(s){if(![3,6].includes(s.round))throw Error('仅在第3与第6轮计分');const totals=zeros(),wins=zeros(),regions=[];
 for(const [id,a] of Object.entries(AREAS)){const r=s.regions[id];if(emptyPermanentSlot(r)>=0){regions.push({region:id,eligible:false,points:zeros()});continue;}
  const entries=IDS.map(player=>({id:player,value:r.influence[player],priority:hasGrowth(s.players[player],s.round,'authority')?1:0,tie:r.armies[player]}));if(r.influence.neutral)entries.push({id:'neutral',value:r.influence.neutral,tie:0});const ranked=rankBonus(entries,a.bonus),points=zeros();for(const player of IDS){points[player]=r.influence[player]+ranked[player].vp;totals[player]+=points[player];if(ranked[player].rank===1)wins[player]++;}regions.push({region:id,eligible:true,points});
 }
 const majority={};for(const [key,entries] of Object.entries(majorityStandings(s))){majority[key]=Object.fromEntries(IDS.map(id=>{const entry=entries.find(row=>row.id===id);return [id,{vp:entry.vp,rank:entry.rank}];}));for(const id of IDS)totals[id]+=majority[key][id].vp;}
 let usLeads=0,ruRegions=0;for(const [id,a] of Object.entries(AREAS)){const r=s.regions[id];if(r.influence.US===Math.max(...Object.values(r.influence)))usLeads++;if(a.interest.includes('RU')&&r.armies.RU>0&&r.armies.RU===Math.max(...Object.values(r.armies)))ruRegions++;}
 const national=zeros();national.US=usLeads<4?[-12,-8,-5,-2][usLeads]:0;national.RU=2*ruRegions;
 if(s.round===6){const count=new Set(investedCountries(s,'CN').map(countryRegion)).size;national.CN=({3:2,4:3,5:4,6:6,7:8})[count]||0;}
 for(const id of IDS)totals[id]+=national[id];return {round:s.round,totals,wins,regions,majority,national};
}
export function smartPreview(s){const ranked=rankBonus(IDS.map(id=>({id,value:s.players[id].smart})),[5,3,1]);return Object.fromEntries(IDS.map(id=>[id,ranked[id].vp]));}
export function winners(s){const wins=s.finalRegionWins;if(!wins)return null;let ids=[...IDS];for(const value of [id=>s.players[id].vp,id=>wins[id],id=>Object.values(s.regions).reduce((n,r)=>n+r.influence[id],0)]){const max=Math.max(...ids.map(value));ids=ids.filter(id=>value(id)===max);}return ids;}
