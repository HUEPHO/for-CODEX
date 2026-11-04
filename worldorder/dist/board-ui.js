import {AREAS,IDS} from './world.js';
import {POWERS} from './game-constants.js';
import {REGION_COLORS,BOARD_REGION_ORDER} from './region-presentation.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const short={US:'美',CN:'中',EU:'欧',RU:'俄',neutral:'立'};
const ownerName=id=>POWERS[id]?.name||(id==='neutral'?'中立':'未知');
const ownerColor=id=>POWERS[id]?.color||(id==='neutral'?'#272c32':'#70818b');

function piece(owner){return `<span class="board-piece" data-board-owner="${esc(owner)}" style="--board-piece-color:${ownerColor(owner)}"><span>${short[owner]||'?'}</span></span>`;}
function slot(region,kind,index,owner,{ignored=false,points=1}={}){
 const kindName={permanent:'永久',extraPermanent:'额外永久',temporary:'临时'}[kind];
 const description=`${AREAS[region].name} · ${kindName}第${index+1}格 · ${ignored?'停用起始槽':owner?ownerName(owner)+'影响力':'空位，放置得'+points+'分'}`;
 const attrs=`class="board-slot${ignored?' board-slot--retired':owner?' board-slot--occupied':' board-slot--empty'}" data-board-slot="${kind}" data-slot-index="${index}" title="${esc(description)}" aria-label="${esc(description)}"`;
 return ignored?`<span ${attrs} aria-disabled="true">—</span>`:`<button type="button" ${attrs} data-region="${region}">${owner?piece(owner):`<span class="board-slot-points">${points?'+':''}${points}</span>`}</button>`;
}
function influence(region,r){
 const area=AREAS[region],retired=new Set(r.ignoredStartingSlots||[]),permanent=Array.from({length:Math.max(area.slots,r.permanent?.length||0)},(_,i)=>r.permanent?.[i]||null),temporary=r.temporary||[],extra=r.extraPermanent||[];
 return `<div class="board-influence"><div class="board-track"><span class="board-track-label">永久</span><div class="board-slots">${permanent.map((owner,index)=>slot(region,'permanent',index,owner,{ignored:retired.has(index)&&!owner})).join('')}${extra.length?`<span class="board-extra-divider" title="额外永久影响力">＋</span>${extra.map((owner,index)=>slot(region,'extraPermanent',index,owner,{points:0})).join('')}`:''}</div></div><div class="board-track"><span class="board-track-label" title="临时队列从左至右，最左侧先被移出">临时<span class="board-queue-arrow" aria-hidden="true">←</span></span><div class="board-slots board-slots--temporary">${area.temp.map((points,index)=>slot(region,'temporary',index,temporary[index]||null,{points})).join('')}</div></div></div>`;
}
function forces(r){return `<div class="board-forces" aria-label="各国驻军与介入">${IDS.map(owner=>{
 const armies=r.armies?.[owner]||0,engage=r.engage?.[owner]||0;
 if(!armies&&!engage)return '';
 const description=`${ownerName(owner)}：${[armies?`${armies}军队`:'',engage?`${engage}介入标记`:''].filter(Boolean).join('，')}`;
 return `<span class="board-force" data-army-owner="${owner}" title="${description}" style="--board-force-color:${ownerColor(owner)}" aria-label="${description}">${armies?`<span class="board-army-count" title="${ownerName(owner)}：${armies}军队">军队 <b>${armies}</b></span>`:''}${engage?`<span class="board-engage" title="${ownerName(owner)}：${engage}介入标记"><span class="board-engage-token" aria-hidden="true"></span><b>${engage}</b></span>`:''}</span>`;
 }).join('')}</div>`;}
function cardFace(card,name){return `<span class="board-country-image">${card?.image?`<img src="${esc(card.image)}" alt="${esc(name)}" loading="lazy" decoding="async" draggable="false">`:'<span class="board-country-missing">国家牌</span>'}</span>`;}
function countries(region,r,cards){
 const available=Array.isArray(r.available)?r.available:[];
 return `<div class="board-country-section"><h3 class="board-section-title">国家商店<span>${available.length}</span></h3><div class="board-countries" aria-label="${AREAS[region].name}国家商店">${available.map(id=>{
  const card=cards[id],name=card?.name||'公开国家牌';
  return `<button type="button" class="board-country" data-card="${esc(id)}" data-source="regionCountry" aria-label="查看${esc(name)} · ${AREAS[region].name}公开国家牌">${cardFace(card,name)}<span class="board-country-name">${esc(name)}</span></button>`;
 }).join('')||'<div class="board-countries-empty">本地区国家牌已取完</div>'}</div></div>`;
}

/** Public board rendering only: never inspect or normalize country/deck piles. */
export function renderInteractiveBoard(s,cards={}, {selectedRegion,extraSlot='',regionOrder=BOARD_REGION_ORDER}={}){
 const catalogue=Array.isArray(cards)?Object.fromEntries(cards.map(card=>[card.id,card])):cards;
 const orderedRegions=regionOrder.filter(id=>AREAS[id]).map(id=>({id,area:AREAS[id],rewardTotal:AREAS[id].bonus.reduce((sum,n)=>sum+n,0)}));
 return `<section class="board-table" aria-label="地区总览"><header class="board-heading"><div><span class="board-eyebrow">WORLD ORDER</span><h2>地区总览</h2></div><div class="board-legend"><span><i class="board-legend-cube"></i>影响力</span><span><i class="board-legend-intervention" aria-hidden="true"></i>介入标记</span><span>临时队列 ← 先移出</span></div></header><div class="board-scroll" tabindex="0" aria-label="七个地区，包含影响力、驻军、介入与国家商店"><div class="board-surface">${orderedRegions.map(({id:region,area,rewardTotal})=>{
  const r=s.regions?.[region];if(!r)return '';
  const total=[...(r.permanent||[]),...(r.extraPermanent||[]),...(r.temporary||[])].filter(Boolean).length;
  return `<section class="board-region board-region--${region}${selectedRegion===region?' board-region--selected':''}" data-board-region="${region}" style="--board-region-color:${REGION_COLORS[region]}" aria-label="${area.name}"><button type="button" class="board-region-heading" data-region="${region}" aria-pressed="${selectedRegion===region}"><span class="board-region-dot" aria-hidden="true"></span><strong>${area.name}</strong><span class="board-influence-total" title="地区总影响力">${total}<small>影响力</small></span><span class="board-region-open" aria-hidden="true">↗</span></button><div class="board-region-state">${influence(region,r)}${forces(r)}</div>${countries(region,r,catalogue)}<footer class="board-region-footer"><span title="奖励合计${rewardTotal}分">地区奖励 <b>${area.bonus.join(' · ')}</b></span><span class="board-interest-label">利益区域</span><span class="board-interest" title="利益地区：${area.interest.map(ownerName).join('、')}">${area.interest.map(owner=>`<i style="--board-piece-color:${ownerColor(owner)}" aria-label="${ownerName(owner)}利益地区">${short[owner]}</i>`).join('')}</span></footer></section>`;
 }).join('')}${extraSlot}</div></div><p class="board-caption">各地区集中展示影响力、驻军、介入标记与国家商店。空格内为放置奖励，斜纹格为停用起始槽；点击商店国家牌查看详情或选择结盟目标。</p></section>`;
}
