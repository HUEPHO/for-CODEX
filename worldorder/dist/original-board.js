import {AREAS,IDS,MAJORITY_BONUSES,majorityStandings} from './world.js';
import {POWERS} from './game-constants.js';
import {REGION_COLORS} from './region-presentation.js';
import {powerFlag} from './power-identity.js';
import {publicCountrySupply} from './country-supply-counts.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const W=2200,H=1964;
const colors={US:'#006eab',CN:'#e30613',EU:'#ffcb00',RU:'#f1f1ee',neutral:'#171919'};
const name=owner=>POWERS[owner]?.name||(owner==='neutral'?'中立':'未知');
const rect=(x,y,w,h)=>`left:${x/W*100}%;top:${y/H*100}%;width:${w/W*100}%;height:${h/H*100}%`;
const at=(x,y,w=50,h=w)=>rect(x-w/2,y-h/2,w,h);
const row=(xs,y)=>xs.map(x=>[x,y]);
// Positions are measured on the original 2200 × 1964 board, not a redraw.
// All pieces share its coordinate system, so resizing keeps them on the print.
export const ORIGINAL_BOARD_REGIONS=Object.freeze({
 E:{box:[672,211,287,516],heading:[850,685,100,43],permanent:[...row([758,817,877],257),...row([726,786,846,906],317)],temporary:row([726,786,846,906],386),forces:[746,556,887,635],engage:[685,467],shop:[999,92,364,319],extras:[684,417]},
 C:{box:[1404,211,287,516],heading:[1552,666,132,62],permanent:[[1548,257],...row([1519,1578],316)],temporary:row([1459,1519,1578,1639],386),forces:[1473,545,1615,623],engage:[1416,467],shop:[1730,92,364,319],extras:[1414,417]},
 N:{box:[673,796,652,283],heading:[1153,804,164,73],permanent:[...row([776,835,895],857),...row([776,835,895],917)],temporary:row([716,776,836,896,956],985),forces:[1093,901,1243,980],engage:[695,1075],shop:[512,1557,364,319],extras:[682,1027]},
 M:{box:[252,1010,289,503],heading:[380,1017,153,62],permanent:[[397,1304],...row([367,427],1363)],temporary:row([307,367,427,487],1433),forces:[321,1097,464,1175],engage:[282,1246],shop:[106,1557,364,319],extras:[270,1477]},
 A:{box:[735,1166,590,205],heading:[1125,1172,186,56],permanent:row([848,908],1219),temporary:row([789,849,909,969],1290),forces:[1094,1254,1243,1331],engage:[770,1370],shop:[918,1557,364,319],extras:[748,1337]},
 S:{box:[1404,832,286,539],heading:[1547,842,132,65],permanent:[...row([1517,1577],1159),...row([1517,1577],1219)],temporary:row([1457,1517,1577,1637],1290),forces:[1473,945,1616,1024],engage:[1425,1370],shop:[1324,1557,364,319],extras:[1421,1337]},
 P:{box:[1805,832,286,539],heading:[1934,842,145,65],permanent:[...row([1918,1978],1159),...row([1888,1948,2008],1219)],temporary:row([1858,1918,1978,2038],1290),forces:[1873,945,2017,1024],engage:[1826,1370],shop:[1730,1557,364,319],extras:[1824,1337]}
});

function influence(region,r,layout){
 const retired=new Set(r.ignoredStartingSlots||[]);
 function slot(kind,index,position,owner,points=0){
  const ignored=kind==='permanent'&&retired.has(index)&&!owner;
  const kindName={permanent:'永久',temporary:'临时',extraPermanent:'额外永久'}[kind];
  const description=`${AREAS[region].name} · ${kindName}第${index+1}格 · ${ignored?'停用起始槽':owner?name(owner)+'影响力':'空位，放置得'+points+'分'}`;
  const cls=`board-slot original-slot${ignored?' board-slot--retired':owner?' board-slot--occupied':' board-slot--empty'}`;
  const attrs=`class="${cls}" data-board-slot="${kind}" data-slot-index="${index}" data-region="${region}" style="${at(...position)}" title="${esc(description)}" aria-label="${esc(description)}"`;
  const token=owner?`<span class="original-influence-piece" data-board-owner="${owner}" style="--piece-color:${colors[owner]||'#888'}" aria-hidden="true"></span>`:`<span class="original-slot-value">${ignored?'×':points}</span>`;
  return ignored?`<span ${attrs} aria-disabled="true">${token}</span>`:`<button type="button" ${attrs}>${token}</button>`;
 }
 return layout.permanent.map((position,index)=>slot('permanent',index,position,r.permanent?.[index],1)).join('')+
 layout.temporary.map((position,index)=>slot('temporary',index,position,r.temporary?.[index],AREAS[region].temp[index])).join('')+
 (r.extraPermanent||[]).map((owner,index)=>slot('extraPermanent',index,[layout.extras[0]+(index%6)*42,layout.extras[1]+Math.floor(index/6)*42],owner)).join('');
}

function forces(region,r,layout){
 const [left,top,right,bottom]=layout.forces,positions={EU:[left,top],RU:[right,top],US:[left,bottom],CN:[right,bottom]};
 const armies=IDS.map(owner=>{
  const n=r.armies[owner],description=n?`${AREAS[region].name} · ${name(owner)}：${n}军队`:'';
  return `<span class="original-force original-army" data-army-owner="${owner}" ${n===0?'hidden':''} style="${at(...positions[owner],92,48)}" title="${description}" aria-label="${description}"><img src="assets/token-army-${owner}.png" alt="" draggable="false"><b>${n}</b></span>`;
 }).join('');
 const engaging=IDS.filter(owner=>(r.engage?.[owner]||0)>0);
 const engage=engaging.map((owner,index)=>{
  const n=r.engage[owner],description=`${AREAS[region].name} · ${name(owner)}：${n}介入标记`;
  return `<span class="original-force original-engage" data-army-owner="${owner}" style="${at(layout.engage[0]+index*60,layout.engage[1],62,46)}" title="${description}" aria-label="${description}"><img src="assets/token-intervention-${owner}.png" alt="" draggable="false">${n>1?`<b>${n}</b>`:''}</span>`;
 }).join('');
 return armies+engage;
}

function countries(region,r,catalogue,layout){
 // Counts include each public top; the shared projection never reads the
 // identities behind it. A missing legacy count stays unknown, never invented.
 const available=publicCountrySupply(r);
 return `<section class="original-shop" data-trade-shop="${region}" style="${rect(...layout.shop)}" aria-label="${AREAS[region].name}国家商店"><h3>${AREAS[region].name}</h3><div class="original-shop-cards">${available.map(({id,pile,count})=>{
  const card=catalogue[id],title=card?.name||'公开国家牌';
  const stock=count===null?'剩余数量尚未记录':`含顶牌剩余 ${count} 张`;
  return `<div class="original-country-stack"><button type="button" class="board-country original-country" data-card="${esc(id)}" data-source="regionCountry" title="${esc(title)} · ${AREAS[region].name} · ${stock}" aria-label="查看${esc(title)} · ${AREAS[region].name}公开国家牌 · ${stock}"><span class="original-country-face">${card?.image?`<img src="${esc(card.image)}" alt="${esc(title)}" loading="lazy" decoding="async" draggable="false">`:'<span class="original-country-missing">国家牌</span>'}</span><span class="board-country-name">${esc(title)}</span></button><button type="button" class="original-pile-count" data-country-pile="${pile||'unknown'}" data-pile-region="${region}" data-pile="${pile||'unknown'}" data-pile-count="${count??'unknown'}" aria-label="查看${AREAS[region].name}${pile==='left'?'左':'右'}堆全部盟国">${count??'?'}</button></div>`;
 }).join('')||'<span class="original-shop-empty">已取完</span>'}</div></section>`;
}

function turnOrder(s){
 const order=(Array.isArray(s.flow?.order)?s.flow.order:s.initialOrder||[]).filter(owner=>POWERS[owner]);
 return `<div class="original-turn-order" style="${rect(145,443,430,68)}" aria-label="本轮行动顺序">${order.map((owner,index)=>`<span title="第${index+1}位：${name(owner)}" aria-label="第${index+1}位：${name(owner)}">${powerFlag(owner,{decorative:true})}</span>`).join('')}</div><span class="original-round" style="${at(150,1053+(6-Math.min(6,Math.max(1,Number(s.round)||1)))*84,58)}" title="当前第${s.round||1}轮" aria-label="当前第${s.round||1}轮"></span>`;
}

function scoreTrack(s){
 return IDS.flatMap((owner,index)=>{
  const vp=s.players?.[owner]?.vp;if(!Number.isFinite(vp))return [];
  const v=Math.max(0,Math.floor(vp))%100;
  let x,y;
  if(v<=30){x=35+v*71;y=35;}
  else if(v<=50){x=2165;y=35+(v-30)*94.65;}
  else if(v<=80){x=2165-(v-50)*71;y=1928;}
  else{x=35;y=1928-(v-80)*94.65;}
  return `<span class="original-score" data-score-owner="${owner}" style="${at(x+(index%2?10:-10),y+(index<2?-8:8),45)};--piece-color:${colors[owner]}" title="${name(owner)}：${vp}胜利分" aria-label="${name(owner)}：${vp}胜利分">${powerFlag(owner,{decorative:true})}</span>`;
 }).join('');
}

function majorities(s){
 const standings=majorityStandings(s),names={money:'资金',armies:'地图军队',allies:'盟国'};
 return `<div class="original-majorities" aria-label="小目标实时排名">${Object.entries(standings).map(([key,rows])=>`<section class="original-majority original-majority--${key}" data-majority="${key}" aria-label="${names[key]}排名"><img class="original-majority-art" src="assets/majority-${key}.png" alt="${names[key]}多数奖励：${MAJORITY_BONUSES[key].join('、')}分" draggable="false"><div class="original-majority-standings">${rows.map(row=>`<span class="original-majority-chip${row.leading?' is-leading':''}" data-ranking-owner="${row.id}" data-ranking-value="${row.value}" title="${name(row.id)}：${row.value}${key==='money'?'资金':key==='armies'?'支地图军队':'个盟国'}${row.leading?'，当前领先':''}；按当前局面计分为第${row.rank}名、${row.vp}分">${powerFlag(row.id,{decorative:true})}<b>${row.value}</b></span>`).join('')}</div></section>`).join('')}</div>`;
}

/** The original printed map with live public state and existing form targets. */
export function renderOriginalBoard(s,cards={}, {selectedRegion,extraSlot=''}={}){
 const catalogue=Array.isArray(cards)?Object.fromEntries(cards.map(card=>[card.id,card])):cards;
 return `<section class="original-board" aria-label="原版世界主板"><div class="original-board-scroll" tabindex="0" aria-label="世界地图、影响力、驻军、介入和国家商店"><div class="original-board-surface"><img class="original-board-art" src="assets/map.webp" alt="World Order 原版世界主板" draggable="false">${Object.entries(ORIGINAL_BOARD_REGIONS).map(([region,layout])=>{
  const r=s.regions?.[region];if(!r)return '';
  return `<section class="original-region${selectedRegion===region?' original-region--selected':''}" data-board-region="${region}" style="--region-color:${REGION_COLORS[region]}" aria-label="${AREAS[region].name}"><button type="button" class="original-region-hit" data-region="${region}" style="${rect(...layout.box)}" title="${AREAS[region].name}" aria-label="${AREAS[region].name} · 操作时选择地区" aria-pressed="${selectedRegion===region}"></button>${influence(region,r,layout)}${forces(region,r,layout)}${countries(region,r,catalogue,layout)}</section>`;
 }).join('')}${turnOrder(s)}${scoreTrack(s)}${majorities(s)}</div></div>${extraSlot}</section>`;
}
