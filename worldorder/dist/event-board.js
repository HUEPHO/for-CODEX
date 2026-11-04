import {EVENT_DATA} from './event-data.js';
import {AREAS,syncInfluence} from './world.js';
import {regionCountries,syncCountries} from './country-piles.js';
const IDS=['US','CN','EU','RU'];
const ARAB='c0f88810dea36',AXIS='c0231330f35ed',CROATIA='cda82df9a0c65',AFGHAN='c0a692aca2850';
const turning={
 [ARAB]:['c4b796f4206ea','cbb2924757345','c0393427ae3df','c784b257890d8'],
 [AXIS]:['cc241e068f335','cf7279a3c54ad','c2a6d1615b971']
};
export const EVENT_CHAINS={
 c963b6d849299:['cd780718be7a6'],c0393427ae3df:['cb29f5917c351'],c4b796f4206ea:[AXIS],cbb2924757345:[AXIS],c784b257890d8:[AXIS],cc241e068f335:['c2a6d1615b971'],cd84688476fde:['c171711d668df'],c1b3f3035a3cf:['ca5b5108041b5'],c870029980e16:['ca5b5108041b5'],c72c028872d0f:['c171711d668df'],c4f52659f1ea9:['cd84688476fde','c870029980e16','c1b3f3035a3cf'],c2356e9f50f6e:['c963b6d849299']
};
export function syncEventBoard(s){s.events=s.eventBoard.slots.filter(Boolean);}
function log(s,text){s.log=[text,...s.log].slice(0,30);}
function markSeen(s,id){if(!s.eventBoard.seen.includes(id))s.eventBoard.seen.push(id);}
function discard(s,id){if(!s.eventDiscard.includes(id))s.eventDiscard.push(id);}
export function queueChain(s,id){
 if(!s.chain.includes(id)||s.eventBoard.seen.includes(id))return false;
 if(EVENT_DATA[id].players.length!==1&&s.eventBoard.queued.filter(cid=>EVENT_DATA[cid].players.length!==1).length>=3)throw Error('公共连锁已达3张，请核对登记；每张事件最多触发1张连锁');
 s.chain.splice(s.chain.indexOf(id),1);markSeen(s,id);s.eventBoard.queued.push(id);return true;
}
export function addNeutralInfluence(s,region){
 const r=s.regions[region],slot=r.permanent.findIndex((id,i)=>i>=AREAS[region].start.length&&!id);
 if(slot>=0)r.permanent[slot]='neutral';else{if(r.temporary.length===AREAS[region].temp.length)r.temporary.shift();r.temporary.push('neutral');}
 syncInfluence(r);
}
function revealCroatia(s,rng){
 const r=s.regions.E,pool=regionCountries(r),id='c8ec654f26579';if(!pool.includes(id))return;
 const rest=pool.filter(cid=>cid!==id);for(let i=rest.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[rest[i],rest[j]]=[rest[j],rest[i]];}
 const top=rest.shift();r.countryPiles={left:[id,...rest],right:top?[top]:[]};syncCountries(r);
 log(s,'克罗地亚加入欧盟：已检索并重洗欧洲余牌，将克罗地亚置于左堆顶');
}
function placeEvent(s,id,slot,kind,rng){
 const b=s.eventBoard,card=EVENT_DATA[id];markSeen(s,id);
 if(card.type==='turning'){
  if(id===AXIS)addNeutralInfluence(s,'N');
  s.resolvedEvents.push(id);discard(s,id);
  const candidates=turning[id].filter(cid=>s.chain.includes(cid)&&!b.seen.includes(cid));
  const next=candidates[Math.floor(rng()*candidates.length)];
  log(s,`${card.name}：揭示时立即处理${id===AXIS?'，中东增加1中立影响力':''}${next?'，替换为'+EVENT_DATA[next].name:'；所列连锁均已出现，无新事件'}`);
  if(!next)return false;s.chain.splice(s.chain.indexOf(next),1);return placeEvent(s,next,slot,kind,rng);
 }
 if(card.players.length===1){
  if(id===CROATIA)revealCroatia(s,rng);
  const owner=card.players[0],old=b.personal[owner];
  if(old){if(kind==='setup'){discard(s,id);log(s,`${card.name}：开局同方个人事件重复，弃置后补抽`);}else b.choice={type:'personal',owner,candidates:[old,id]};}
  else b.personal[owner]=id;
  return false;
 }
 b.slots[slot]=id;
 if(id===AFGHAN)b.revealQueue.push(...['US','EU'].map(owner=>({type:'reveal',owner,cardId:id})));
 return true;
}
export function continueEventDistribution(s,rng=Math.random){
 const b=s.eventBoard,d=b.distribution;if(!d)return;
 while(!b.choice){
  if(b.revealQueue.length){b.choice=b.revealQueue.shift();break;}
  if(d.chains.length){
   const slot=b.slots.indexOf(null);if(slot<0&&EVENT_DATA[d.chains[0]].players.length!==1)throw Error('公共连锁超过3张，请核对登记；不能将多项备选连锁全部加入');
   placeEvent(s,d.chains.shift(),slot,d.kind,rng);continue;
  }
  const slot=b.slots.lastIndexOf(null),deck=d.round<=3?s.eraDeck:s.era2Deck;
  if(!d.remaining||slot<0||!deck.length){b.distribution=null;break;}
  if(placeEvent(s,deck.shift(),slot,d.kind,rng))d.remaining--;
 }
 syncEventBoard(s);
}
export function initializeEvents(s,rng=Math.random){
 if(!s.config.wit)return;
 s.eventVersion=1;s.eventDiscard=[];s.eventHistory=[];
 s.eventBoard={round:1,slots:[null,null,null],personal:Object.fromEntries(IDS.map(id=>[id,null])),queued:[],seen:[],choice:null,revealQueue:[],distribution:{kind:'setup',round:1,remaining:2,chains:[]}};
 continueEventDistribution(s,rng);
}
export function prepareNextEvents(s){
 const b=s.eventBoard;if(s.round===6)return;
 b.round=s.round+1;b.slots=[null,null,null];b.distribution={kind:'round',round:s.round+1,remaining:2,chains:b.queued.splice(0)};
 continueEventDistribution(s);
}
export function choosePersonalEvent(s,a){
 const b=s.eventBoard,c=b.choice;if(c?.type!=='personal'||c.owner!==s.current||!c.candidates.includes(a.cardId))throw Error('请选择本方两张个人事件中的一张');
 b.personal[c.owner]=a.cardId;for(const id of c.candidates)if(id!==a.cardId)discard(s,id);
 log(s,`${s.current}保留个人事件：${EVENT_DATA[a.cardId].name}`);b.choice=null;continueEventDistribution(s);
}
export function resolveEventReveal(s,a){
 const b=s.eventBoard,c=b.choice,p=s.players[s.current];if(c?.type!=='reveal'||c.owner!==s.current)throw Error('当前没有本方揭示时效果');
 const moves=a.moves||[];if(!Array.isArray(moves)||moves.length>2||moves.some(from=>from!=='reserve'&&(!AREAS[from]||from==='C')))throw Error('请选择至多2支从待命区或其他地区移入中亚的军队');
 const counts={};for(const from of moves)counts[from]=(counts[from]||0)+1;
 for(const [from,n] of Object.entries(counts))if(n>(from==='reserve'?p.resources[6]:s.regions[from].armies[s.current]))throw Error('所选来源军队不足');
 if(p.money<moves.length*5)throw Error('揭示时移动军队所需资金不足');p.money-=moves.length*5;
 for(const from of moves){if(from==='reserve')p.resources[6]--;else s.regions[from].armies[s.current]--;s.regions.C.armies[s.current]++;}
 log(s,`${s.current} · 北约阿富汗增兵与撤军：揭示时支付${moves.length*5}资金，向中亚移动${moves.length}支军队`);b.choice=null;continueEventDistribution(s);
}
export function removeCurrentEvent(s,id,{postponed=false,repeat=false}={}){
 const b=s.eventBoard,index=b.slots.indexOf(id);if(index>=0)b.slots[index]=null;
 for(const owner of IDS)if(b.personal[owner]===id&&!postponed)b.personal[owner]=null;
 if(repeat){b.queued.push(id);}else if(!postponed){s.resolvedEvents.push(id);discard(s,id);}
 syncEventBoard(s);
}
