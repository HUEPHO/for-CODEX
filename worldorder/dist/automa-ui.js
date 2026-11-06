import {POWERS} from './game-constants.js';
import {powerFlag} from './power-identity.js';
import {resourceIconPath} from './resource-icons.js';
import {AUTO_INFLUENCE_CARDS} from './auto-influence-data.js';
import {AREAS} from './world.js';
import {RESEARCH_DATA} from './research-data.js';
import {renderNonPlayerChoice} from './non-player-ui.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const actions={engage:'外交介入',relations:'改善关系',invest:'投资',trade:'贸易',base:'建立基地',move:'调遣',growth:'发展'};
const icon=(key,label)=>`<span class="resource-icon resource-icon--${key}" role="img" aria-label="${label}" title="${label}"${key==='army'?'':` style="background-image:url('${resourceIconPath(key)}')"`}></span>`;
const art=(name,alt,extra='')=>`<img src="assets/automa/${name}.webp" alt="${esc(alt)}" ${extra}>`;
const sum=map=>Object.values(map).reduce((a,b)=>a+b,0);

export function renderAutomaSummary(s,id){
 const p=s.players[id],a=p.automa,armies=Object.values(s.regions).reduce((n,r)=>n+r.armies[id],0);
 return `<span class="client-player-heading"><span class="client-player-name">${powerFlag(id)}<small>高级 · ${a.difficulty==='hard'?'困难':'普通'}</small></span><span class="client-player-vp">${icon('vp','胜利分')}<b>${p.vp}</b></span></span><span class="automa-summary-metrics"><span>${icon('money','资金')} <b>${p.money}</b></span><span>${esc(p.focus.replace('焦点',''))}</span><span>繁荣 <b>${p.prosperity}</b></span></span><span class="npp-forces">盟国 ${p.allies.length} ${icon('army','版图军队')} ${armies} <span title="外国直接投资">FDI ${sum(a.investments)}</span> 基地 ${sum(a.bases)}</span>`;
}

function board(p){
 const a=p.automa,focus=['内政焦点','外交焦点','军事焦点'].indexOf(p.focus);
 return `<div class="automa-board" aria-label="自动机当前焦点与行动方块">${art('board','高级自动机面板')}<span class="automa-focus-marker" style="--focus:${focus}" aria-label="当前${p.focus}" title="${p.focus}"></span>${['engage','relations','invest','trade','base','move'].map((key,i)=>`<span class="automa-cubes" style="--slot-x:${i%2===0?23:77}%;--slot-y:${44.5+Math.floor(i/2)*23.5}%" aria-label="${actions[key]} ${a.cubes[key]}个行动方块" title="${actions[key]}：${a.cubes[key]}个行动方块">${a.cubes[key]}</span>`).join('')}</div>`;
}

function recentCards(s,p){
 const a=p.automa;
 return `<div class="automa-revealed">${a.lastDecision?`<figure>${art('decision-'+a.lastDecision,'最近决策牌 '+a.lastDecision)}<figcaption>决策 ${a.lastDecision}</figcaption></figure>`:''}${Number.isInteger(a.lastInfluence)?`<figure><img src="assets/auto-influence/${a.lastInfluence}.webp" alt="最近自动影响力牌 ${a.lastInfluence+1}"><figcaption>自动影响力 ${a.lastInfluence+1}</figcaption></figure>`:''}</div>`;
}

function regionCards(s,p,byId,card){
 return `<div class="automa-allied-regions">${Object.entries(AREAS).map(([region,area])=>{
  const allies=p.allies.filter(id=>RESEARCH_DATA[id]?.region===region),a=p.automa;
  if(!allies.length&&!a.investments[region]&&!a.bases[region])return '';
  return `<section><header><h4>${area.name}</h4><span title="外国直接投资">FDI <b>${a.investments[region]||0}</b></span><span>基地 <b>${a.bases[region]||0}</b></span></header><div class="automa-owned-cards">${allies.map(id=>card(id,'view')).join('')}</div></section>`;
 }).join('')}</div>`;
}

function catalog(p){
 const a=p.automa,decision=[...Array(12)].map((_,i)=>i+1),influence=AUTO_INFLUENCE_CARDS.map(c=>c.id);
 if(a.lastDecision){decision.splice(decision.indexOf(a.lastDecision),1);decision.unshift(a.lastDecision);}
 if(Number.isInteger(a.lastInfluence)){influence.splice(influence.indexOf(a.lastInfluence),1);influence.unshift(a.lastInfluence);}
 // Use the printed catalogues only. Never infer or inspect any hidden deck order.
 return `<details class="automa-catalog"><summary>决策牌 · 12张</summary><div class="automa-catalog-grid">${decision.map(id=>`<figure class="${id===a.lastDecision?'is-current':''}">${art('decision-'+id,'决策牌 '+id,'loading="lazy"')}<figcaption>${id===a.lastDecision?'最近揭示 · ':''}${id}</figcaption></figure>`).join('')}</div></details><details class="automa-catalog"><summary>自动影响力 · 20张</summary><div class="automa-catalog-grid">${influence.map(id=>`<figure class="${id===a.lastInfluence?'is-current':''}"><img src="assets/auto-influence/${id}.webp" alt="自动影响力牌 ${id+1}" loading="lazy"><figcaption>${id===a.lastInfluence?'最近揭示 · ':''}${id+1}</figcaption></figure>`).join('')}</div></details><details class="automa-catalog"><summary>行动与优先级</summary><div class="automa-aid-grid">${art('aid','自动机行动提示','loading="lazy"')}${art('priority-relations','改善关系优先级','loading="lazy"')}${art('priority-military','调遣与建立基地优先级','loading="lazy"')}</div></details>`;
}

function revealedHistory(p,card){
 const research=[...new Set(p.automa.history.filter(h=>h.type==='research').flatMap(h=>[...(h.drawn||[]),...(h.card?[h.card]:[])]))];
 const objectives=p.automa.objectiveDiscard;
 return [[research,'研究揭示'],[objectives,'已结算目标']].filter(([ids])=>ids.length).map(([ids,label])=>`<details class="automa-catalog"><summary>${label} · ${ids.length}张</summary><div class="automa-owned-cards">${ids.map(id=>card(id,'view')).join('')}</div></details>`).join('');
}

export function renderAutomaDetails(s,id,byId,card){
 const p=s.players[id],a=p.automa,last=a.lastAction;
 const lastLabel=last?`${actions[last.action]||''}${last.region?' · '+AREAS[last.region].name:''}${last.country?' · '+esc(byId[last.country]?.name||''):''}`:'';
 const q=s.flow?.eventResolution,choice=q?.nonPlayerChoice?.owner===id?renderNonPlayerChoice(s,q,{inDetails:true,cards:byId}):'';
 return `<section class="automa-details" data-automa-owner="${id}" style="--automa-color:${POWERS[id].color}"><header class="automa-heading"><h2>${powerFlag(id)} 高级自动机</h2><span>${a.difficulty==='hard'?'困难':'普通'}</span></header>${choice}<div class="automa-overview">${board(p)}<div class="automa-overview-side"><div class="automa-stats"><span>${icon('money','资金')}<b>${p.money}</b></span><span>${icon('vp','胜利分')}<b>${p.vp}</b></span>${s.config.wit?`<span>${icon('smart','SP')}<b>${p.smart}</b></span>`:''}<span>繁荣 <b>${p.prosperity} / 5</b></span></div><div class="automa-player-card">${art('player-'+id,'自动机起始资金、优先级与繁荣轨道')}${p.prosperity?`<span class="automa-prosperity-marker" style="--prosperity:${p.prosperity}" title="当前繁荣等级 ${p.prosperity}">${p.prosperity}</span>`:''}</div>${lastLabel?`<p class="automa-last-action">${lastLabel}</p>`:''}${recentCards(s,p)}</div></div>${regionCards(s,p,byId,card)}${p.growth.length?`<details class="automa-catalog"><summary>发展 · ${p.growth.length}张</summary><div class="automa-owned-cards">${p.growth.map(id=>card(id,'view')).join('')}</div></details>`:''}${p.played.length?`<details class="automa-catalog"><summary>已揭示能力牌 · ${p.played.length}张</summary><div class="automa-owned-cards">${p.played.filter(Boolean).map(id=>card(id,'view')).join('')}</div></details>`:''}${revealedHistory(p,card)}${catalog(p)}</section>`;
}
