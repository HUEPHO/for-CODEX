import {POWERS,RESOURCE_NAMES} from './game-constants.js';
import {powerFlag} from './power-identity.js';
import {resourceIconPath} from './resource-icons.js';
import {GROWTH_DATA} from './growth-data.js';
import {clientPlayerTradeModel} from './client-player-board.js';
import {renderAutomaSummary} from './automa-ui.js';
import {renderAutoInfluenceSummary} from './non-player-ui.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const seats=Object.keys(POWERS);
const resourceIds=['energy','raw','food','goods','services','diplomacy','army'];
const number=value=>Number.isFinite(value)?String(value):'—';
const count=cards=>Array.isArray(cards)?String(cards.length):'—';

function icon(id,label){
 return `<span class="resource-icon resource-icon--${id}" title="${label}" role="img" aria-label="${label}"${id==='army'?'':` style="background-image:url('${resourceIconPath(id)}')"`}></span>`;
}

function growthSummary(player,byId){
 const levels=new Map();let unknown=0;
 // Growth is public, but still tolerate redacted or unknown old card records.
 for(const id of player.growth||[]){
  const level=id?(GROWTH_DATA[id]?.level??byId[id]?.level):null;
  if(Number.isInteger(level)&&level>=1&&level<=5)levels.set(level,(levels.get(level)||0)+1);
  else unknown++;
 }
 const badges=[...levels].sort(([a],[b])=>a-b).map(([level,n])=>`<span class="client-growth-level" data-growth-level="${level}" title="${level}级发展牌：${n}张" aria-label="${level}级发展牌，${n}张"><b>${level}</b>${n>1?`<small>×${n}</small>`:''}</span>`);
 if(unknown)badges.push(`<span class="client-growth-level client-growth-level--unknown" title="等级未公开或尚未识别：${unknown}张">?${unknown>1?`<small>×${unknown}</small>`:''}</span>`);
 return `<span class="client-player-growth"><small>发展</small><span class="client-player-growth-levels">${badges.join('')||'<span class="client-growth-empty">—</span>'}</span></span>`;
}

function resources(player){
 const stock=RESOURCE_NAMES.map((name,i)=>`<span class="client-resource-value" data-client-resource="${i}" title="${name}库存：${number(player.resources?.[i])}" aria-label="${name}库存 ${number(player.resources?.[i])}">${icon(resourceIds[i],name)}<b>${number(player.resources?.[i])}</b></span>`).join('');
 const production=RESOURCE_NAMES.map((name,i)=>`<span class="client-resource-value" data-client-production="${i}" title="${name}产能：${number(player.production?.[i])}" aria-label="${name}产能 ${number(player.production?.[i])}"><b>${number(player.production?.[i])}</b></span>`).join('');
 return `<span class="client-player-resources"><span class="client-player-resource-row client-player-stock"><small>库存</small>${stock}</span><span class="client-player-resource-row client-player-production"><small>产能</small>${production}</span></span>`;
}

function tradeSummary(state,id){
 const t=clientPlayerTradeModel(state,id);
 const goods=t.resources.map(key=>icon(resourceIds[key],RESOURCE_NAMES[key])+`<b>${t.quantity}</b>`).join('<small>或</small>');
 const cards=t.cards.map(c=>`<i class="client-commerce-card${c.ready===true?' is-ready':c.ready===false?' is-used':' is-unknown'}" title="专供出口第${c.index+1}张：${c.ready===true?'可用':c.ready===false?'已使用':'尚未记录'}" aria-label="专供出口第${c.index+1}张${c.ready===true?'可用':c.ready===false?'已用':'状态未知'}">${c.ready===true?'✓':c.ready===false?'×':'?'}</i>`).join('');
 const names=t.agreements.map(a=>`${a.name}（${a.status}）`).join('；');
 return {commerce:`<span class="client-player-commerce"><small>专供出口</small><span class="client-commerce-goods">${goods}</span><span class="client-commerce-cards">${cards}</span><b>${t.unknown?'?':t.ready}/${t.total}</b></span>`,agreements:`<span class="client-player-deals" title="每次贸易最多出口${t.exports}种、进口${t.imports}种${names?'；'+esc(names):''}"><small>协议</small><b>出${t.exports} · 入${t.imports}</b>${t.agreements.length?`<em title="${esc(names)}">＋${t.agreements.length}</em>`:''}</span>`};
}

function playerSummary(state,byId,id,{viewer,actor}){
 if(state.players[id].automa)return `<button type="button" class="client-player client-player--${id} client-player--non-player client-player--automa${id===actor?' client-player--acting':''}" data-client-player="${id}" data-army-owner="${id}" style="--player-color:${POWERS[id].color}" aria-haspopup="dialog" aria-label="查看${POWERS[id].name}高级自动机信息">${renderAutomaSummary(state,id)}</button>`;
 if(state.players[id].nonPlayer){const armies=Object.values(state.regions).reduce((n,r)=>n+r.armies[id],0),influence=Object.values(state.regions).reduce((n,r)=>n+r.influence[id],0);return `<button type="button" class="client-player client-player--${id} client-player--non-player" data-client-player="${id}" data-army-owner="${id}" style="--player-color:${POWERS[id].color}" aria-haspopup="dialog" aria-label="查看${POWERS[id].name}自动机的全部自动影响力卡牌"><span>${powerFlag(id)} 基础自动机</span><span class="npp-forces">影响力 ${influence} ${icon('army','版图军队')} ${armies}</span>${renderAutoInfluenceSummary(state,id)}</button>`;}
 const p=state.players[id],power=POWERS[id],self=id===viewer,acting=id===actor;
 const focus=typeof p.focus==='string'?p.focus:'';
 const heading=`<span class="client-player-heading"><span class="client-player-name"><span class="client-power-mark" aria-hidden="true">${powerFlag(id,{decorative:true})}</span>${self?'<small class="client-player-you">你</small>':''}${acting?'<span class="client-player-turn" title="当前操作方" aria-label="当前操作方">●</span>':''}</span><span class="client-player-vp" title="胜利分：${number(p.vp)}">${icon('vp','胜利分')}<b>${number(p.vp)}</b></span><span class="client-player-hand" title="手牌数量：${count(p.hand)}张"><small>手牌</small><b>${count(p.hand)}</b></span></span>`;
 const metrics=`<span class="client-player-metrics"><span class="client-player-money" title="资金：${number(p.money)}">${icon('money','资金')}<b>${number(p.money)}</b></span><span class="client-player-focus" title="${esc(focus||'焦点未知')}"><small>焦点</small><b>${esc(focus.replace(/焦点$/,'')||'—')}</b></span><span class="client-player-prosperity" title="繁荣等级：${number(p.prosperity)} / 5"><small>繁荣</small><b>${number(p.prosperity)}</b></span>${state.config?.wit?`<span class="client-player-smart" title="SP：${number(p.smart)}">${icon('smart','SP')}<b>${number(p.smart)}</b></span>`:''}</span>`;
 const trade=tradeSummary(state,id);
 return `<button type="button" class="client-player client-player--${id}${self?' client-player--self':''}${acting?' client-player--acting':''}" data-client-player="${id}" data-army-owner="${id}" style="--player-color:${power.color}" aria-haspopup="dialog" aria-label="查看${power.name}${self?'（你）':''}的玩家详情">${heading}${metrics}<span class="client-player-planline">${growthSummary(p,byId)}${trade.agreements}</span>${resources(p)}${trade.commerce}</button>`;
}

// This renderer only projects public counters. Reading a summary never changes
// the viewing seat, and never inspects hand/objective/deck card identities.
export function renderClientPlayerSummary(state,byId={}, {viewer,actor}={}){
 if(!state?.players)return '';
 const available=seats.filter(id=>state.players[id]);
 if(!available.length)return '';
 if(!available.includes(viewer))viewer=available.includes(state.current)?state.current:available[0];
 const options={viewer,actor};
 return `<aside class="client-player-rail" aria-label="四方概况"><div class="client-player-opponents">${available.filter(id=>id!==viewer).map(id=>playerSummary(state,byId,id,options)).join('')}</div>${playerSummary(state,byId,viewer,options)}</aside>`;
}
