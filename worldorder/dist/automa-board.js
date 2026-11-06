import {AREAS,IDS,emptyPermanentSlot,changeInfluence,threatPreview} from './world.js';
import {RESEARCH_DATA} from './research-data.js';
import {hasGrowth} from './growth-effects.js';
import {drawAutomaCard} from './automa-random.js';
export function automaAllies(s,id,region){return s.players[id].allies.filter(cid=>RESEARCH_DATA[cid].region===region);}
export function planAutomaInfluence(s,id,region){
 const r=s.regions[region],permanent=emptyPermanentSlot(r)>=0;
 let type=permanent?drawAutomaCard(s,'decision',id).influence[s.round-1]:'temporary';
 if(type==='temporary'&&r.temporary.length===AREAS[region].temp.length&&r.temporary[0]===id){
  if(s.players[id].automa.difficulty!=='hard')return null;type='permanent';
 }
 return {region,operation:type==='permanent'?'placePermanent':'placeTemporary',allowOverflow:type==='permanent'&&!permanent};
}
export function applyAutomaInfluence(s,id,plan,{gainVp=true}={}){const current=s.current;s.current=id;const vp=s.players[id].vp;const result=changeInfluence(s,plan);if(!gainVp)s.players[id].vp=vp;s.current=current;return result;}
export function placeAutomaInfluence(s,id,region,options){const plan=planAutomaInfluence(s,id,region);if(!plan)return false;applyAutomaInfluence(s,id,plan,options);return true;}
export function militaryAutomaRegions(s,id,base=false,excluded=[]){
 const p=s.players[id],a=p.automa;
 const regions=Object.keys(AREAS).filter(region=>!excluded.includes(region)&&(base?automaAllies(s,id,region).filter(cid=>RESEARCH_DATA[cid].basePowers.includes(id)).length>=(a.bases[region]||0)&&automaAllies(s,id,region).some(cid=>RESEARCH_DATA[cid].basePowers.includes(id)):AREAS[region].interest.includes(id)||(a.bases[region]||0)>0));
 const own=threatPreview(s,id).rows;
 const under=regions.filter(region=>AREAS[region].interest.includes(id)&&own.find(row=>row.region===region)?.opponents.length);
 if(under.length){const gaps=under.map(region=>{const row=own.find(r=>r.region===region);return {region,gap:Math.max(...row.opponents.map(enemy=>s.regions[region].armies[enemy]+(s.players[enemy].focus==='军事焦点'?1:0)+(hasGrowth(s.players[enemy],s.round,'nuclear')?1:0)-row.defense))};});const min=Math.min(...gaps.map(x=>x.gap));return gaps.filter(x=>x.gap===min).map(x=>x.region);}
 const newThreats=Object.fromEntries(regions.map(region=>{
  const before=IDS.filter(enemy=>enemy!==id&&threatPreview(s,enemy).rows.find(row=>row.region===region)?.opponents.includes(id));
  const copy=structuredClone(s);copy.regions[region].armies[id]++;
  const after=IDS.filter(enemy=>enemy!==id&&threatPreview(copy,enemy).rows.find(row=>row.region===region)?.opponents.includes(id));return [region,{new:after.filter(enemy=>!before.includes(enemy)),all:after}];
 }));
 const interest=regions.filter(region=>AREAS[region].interest.includes(id)&&newThreats[region].new.length);
 const greater=interest.filter(region=>IDS.some(enemy=>enemy!==id&&s.regions[region].influence[enemy]>s.regions[region].influence[id]));
 if(greater.length)return greater;
 const most=(rs,key='new')=>{const max=Math.max(...rs.map(r=>newThreats[r][key].length));return rs.filter(r=>newThreats[r][key].length===max);};
 if(interest.length)return most(interest);
 const outside=regions.filter(region=>!AREAS[region].interest.includes(id)&&newThreats[region].all.length);if(outside.length)return most(outside,'all');
 return regions;
}
