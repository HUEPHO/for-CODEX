import {powerFlag} from './power-identity.js';
import {POWERS} from './game-constants.js';
import {phaseStatus} from './phase-state.js';
import {GROWTH_DATA} from './growth-data.js';
import {growthSupplyGroups} from './growth-setup.js';
import {RESEARCH_DATA} from './research-data.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const seats=Object.keys(POWERS);

// The public display combines remaining physical copies and public ownership.
// A zero-stock group remains inspectable, but never becomes a purchase target.
export function clientGrowthCatalogue(state,byId={}){
  const stock=state.growth||[],owned=seats.flatMap(owner=>state.players[owner]?.growth||[]);
  return growthSupplyGroups([...stock,...owned]).map(group=>{
    const ids=stock.filter(id=>group.ids.includes(id));
    return {...group,id:ids[0]||group.id,availableIds:[...new Set(ids)],available:ids.length,
      level:GROWTH_DATA[group.id]?.level??byId[group.id]?.level,
      name:GROWTH_DATA[group.id]?.name||byId[group.id]?.name||'发展牌',
      owners:seats.flatMap(owner=>{const count=(state.players[owner]?.growth||[]).filter(id=>group.ids.includes(id)).length;return count?[{owner,count}]:[];})};
  });
}
export function renderClientGrowthCatalogue(state,byId,card){
  const groups=clientGrowthCatalogue(state,byId),total=groups.reduce((n,g)=>n+g.count,0);
  return `<div class="sectionhead"><h2>本局发展牌</h2><small>供应与四方已获得的牌 · 共 ${total} 张</small></div><div class="growth-supply-grid">`+Array.from({length:5},(_,i)=>`<section class="table-growth-level"><b class="level">第 ${i+1} 级</b><div class="marketgrid">${groups.filter(g=>g.level===i+1).map(g=>`<div class="table-supply-card${g.available>1?' has-copies':''}${g.available===0?' supply-empty':''}">${card(g.id,g.available?'growthSupply':'view').replace('data-card=',g.available?`data-supply-ids="${g.availableIds.join(',')}" data-card=`:'data-card=')}<small class="supply-count">${g.available?'× '+g.available:'已取完'} <span>${g.available?'张可用':''}</span></small><small class="client-growth-ownership">${g.owners.map(x=>`${powerFlag(x.owner)} ${x.count}`).join(' · ')||'尚未被取得'}</small></div>`).join('')}</div></section>`).join('')+'</div>';
}
export function renderClientSupplyDock(state,byId,card,{viewer=state.current}={}){
  const level=(state.players[viewer]?.growth?.length||0)+1;
  const next=clientGrowthCatalogue(state,byId).filter(g=>g.level===level&&g.available);
  return `<aside class="client-supply-dock" aria-label="发展牌与研究市场"><button type="button" class="client-next-growth" data-client-supply="growth" aria-haspopup="dialog" aria-label="查看本局所有发展牌"><span class="client-dock-heading"><b>${level<=5?'下次发展 · '+level+' 级':'发展已全部取得'}</b><small>本局全部 ↗</small></span><span class="client-next-growth-cards">${next.map(g=>`<span class="client-next-growth-card" title="${esc(g.name)} · 剩余${g.available}张">${byId[g.id]?.image?`<img src="${esc(byId[g.id].image)}" alt="${esc(g.name)}">`:esc(g.name)}<span>×${g.available}</span></span>`).join('')||`<span class="client-dock-empty">${level<=5?'此等级供应已取完':'点击回顾本局发展牌'}</span>`}</span></button><section class="client-research-market"><header class="client-dock-heading"><h2>研究市场</h2><button type="button" data-client-supply="market" aria-label="放大研究市场">放大 ↗</button></header><div class="client-research-rows">${[0,3].map((start,row)=>`<div class="client-research-row" aria-label="研究市场第${row+1}排">${(state.market||[]).slice(start,start+3).map(id=>`<div class="client-research-card">${card(id,'market')}<span class="client-research-cost" title="研究费用"><span class="resource-icon resource-icon--research" style="background-image:url('assets/icon-research.svg')" role="img" aria-label="研究力"></span>${RESEARCH_DATA[id]?.cost??'—'}</span></div>`).join('')}</div>`).join('')}</div></section></aside>`;
}
export function renderClientClock(state,{viewer=state.current,actor,local=false}={}){
  const status=phaseStatus(state),pending=seats.filter(id=>state.players[id]?.setupPending||state.players[id]?.assetChoices||state.players[id]?.openingChoices);
  const next=pending.find(id=>id!==viewer)||actor;
  return `<aside class="client-clock" aria-label="轮次与行动进度"><div class="client-round"><small>轮次</small><b>${state.round}<span> / 6</span></b></div><div class="client-turn"><small>${status.group==='行动'?'行动':esc(status.group)}</small><b>${status.group==='行动'?Math.min(status.progress+1,status.total):status.progress}<span>${status.total?' / '+status.total:''}</span></b></div><p>${esc(status.label)}${actor?' · '+POWERS[actor].name:''}</p>${local?`<label>本机操作者<select id="client-seat" aria-label="切换本机操作者">${seats.map(id=>`<option value="${id}"${id===viewer?' selected':''}>${POWERS[id].name}</option>`).join('')}</select></label>${next&&next!==viewer?`<button type="button" data-client-switch="${next}">${pending.length?'下一位选牌':'切到当前操作方'} →</button>`:''}`:'<small class="client-seat-locked">联机席位固定</small>'}</aside>`;
}
