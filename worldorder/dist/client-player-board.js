import {POWERS,RESOURCE_NAMES} from './game-constants.js';
import {resourceIconPath} from './resource-icons.js';
import {commerceCardArt} from './client-trade-art.js';
import {GROWTH_DATA} from './growth-data.js';
import {EVENT_EFFECTS,EFFECT_IDS} from './event-effect-rules.js';

// Printed values transcribed from board-{US,CN,EU,RU}.webp and trade-*.webp.
// Presentation data only; the test compares these to the domain constants.
// Keeping this module independent of economy/trade executors prevents cycles.
export const PLAYER_BOARD_PRINT=Object.freeze({
 US:{max:[5,4,5,5,5,5,5],upgrade:8,ready:[1,4,2],vp:[2,3,4,5,8],money:[10,15,20,30,0],exports:2,imports:2,commerce:{resources:[4],quantity:1,count:2}},
 CN:{max:[2,4,5,5,3,5,5],upgrade:6,ready:[1,4,2],vp:[3,4,5,8,11],money:[5,10,15,20,0],exports:3,imports:3,commerce:{resources:[3],quantity:1,count:2}},
 EU:{max:[2,3,5,5,5,5,5],upgrade:7,ready:[2,5,3],vp:[2,4,6,9,12],money:[10,15,20,30,0],exports:2,imports:2,commerce:{resources:[3,4],quantity:1,count:2}},
 RU:{max:[6,5,5,3,3,5,5],upgrade:6,ready:[1,4,2],vp:[3,4,5,7,10],money:[5,10,15,20,0],exports:3,imports:2,commerce:{resources:[0,1],quantity:3,count:3}}
});
const resourceIds=['energy','raw','food','goods','services','diplomacy','army'];
const focuses=['内政焦点','外交焦点','军事焦点'];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shown=value=>Number.isFinite(value)?String(value):'—';
const tradeEffects=new Set(Object.keys(EVENT_EFFECTS).filter(id=>![EFFECT_IDS.unlimited,EFFECT_IDS.start].includes(id)));

export function playerBoardIcon(id,label){
 return `<span class="resource-icon resource-icon--${id}" title="${esc(label)}" role="img" aria-label="${esc(label)}"${id==='army'?'':` style="background-image:url('${resourceIconPath(id)}')"`}></span>`;
}
const resourceIcon=key=>playerBoardIcon(resourceIds[key],RESOURCE_NAMES[key]);
function activeGrowth(p,round,effect){return (p.automatedGrowth||[]).some(id=>(p.growth||[]).includes(id)&&GROWTH_DATA[id]?.effect===effect&&GROWTH_DATA[id].level<=round);}

/** Public information only. A missing legacy trade record remains unknown. */
export function clientPlayerTradeModel(state,owner){
 const print=PLAYER_BOARD_PRINT[owner],p=state?.players?.[owner];if(!print||!p)return null;
 const cards=Array.from({length:print.commerce.count},(_,index)=>({index,ready:state.tradeVersion&&typeof p.commerce?.[index]?.ready==='boolean'?p.commerce[index].ready:null}));
 const saved=state.eventEffects||[],effects=[...saved,...(state.activeEffects||[]).filter(id=>!saved.some(e=>e.cardId===id)).map(cardId=>({cardId,owner:'global'}))];
 const agreements=effects.filter(e=>tradeEffects.has(e.cardId)&&EVENT_EFFECTS[e.cardId]?.owner===e.owner&&(e.owner===owner||e.owner==='global')).map(e=>{
  const rule=EVENT_EFFECTS[e.cardId],active=!!rule.active&&(rule.active!=='ttip'||e.face==='exchange');
  return {id:e.cardId,name:rule.name,owner:e.owner,face:e.face||null,used:active&&e.usedRound===state.round,
   status:e.face==='investment'?'投资面':active?(e.usedRound===state.round?'本轮已用':'本轮未用'):'持续生效',
   description:e.face==='investment'?'投资回报时获得6资金。':e.face==='exchange'?`每轮一次，向${POWERS[owner==='US'?'EU':'US'].name}支付10资金，获得1外交及指定资源。`:rule.description};
 });
 return {exports:print.exports,imports:print.imports,resources:[...print.commerce.resources],quantity:print.commerce.quantity,total:cards.length,
  cards,ready:cards.filter(c=>c.ready===true).length,used:cards.filter(c=>c.ready===false).length,unknown:cards.filter(c=>c.ready===null).length,
  agreements,partners:Object.keys(POWERS).filter(id=>id!==owner).map(id=>({owner:id,...PLAYER_BOARD_PRINT[id].commerce,resources:[...PLAYER_BOARD_PRINT[id].commerce.resources]}))};
}

export function clientPlayerBoardModel(state,owner){
 const p=state?.players?.[owner],print=PLAYER_BOARD_PRINT[owner];if(!p||!print)return null;
 const prosperity=Number.isInteger(p.prosperity)&&p.prosperity>=0&&p.prosperity<=5?p.prosperity:null;
 const living=activeGrowth(p,state.round,'living'),readyBonus=activeGrowth(p,state.round,'ready')?1:0;
 return {owner,focus:focuses.includes(p.focus)?p.focus:null,production:print.max.map((max,key)=>({key,max,value:Number.isInteger(p.production?.[key])?p.production[key]:null})),
  focuses:focuses.map((name,index)=>({name,selected:name===p.focus,ready:print.ready[index]+readyBonus,readyBonus})),prosperity,living,
  prosperityTrack:print.vp.map((vp,index)=>({level:index+1,cost:index+2,vp,money:print.money[index]})),
  nextProsperity:prosperity===null||prosperity===5?null:{cost:prosperity+2-(living?1:0),vp:print.vp[prosperity]+(living?1:0),money:print.money[prosperity]},trade:clientPlayerTradeModel(state,owner)};
}

// Pixel centres measured on the four existing 1500px-wide original images.
// The crop ends below the prosperity circles and above the resource heading.
// US/CN/EU/RU have different raw-material track origins: do not reuse one grid.
export const PLAYER_BOARD_GEOMETRY=Object.freeze({
 width:1500,cropHeight:714,
 productionY:[215,215,215,541,635,561,561],
 productionX:{
  US:[[138,215,293,371,449],[665,743,821,899]],
  CN:[[138,215],[604,682,760,838]],
  EU:[[138,215],[608,686,764]],
  RU:[[138,215,293,371,449,527],[663,740,818,896,973]],
 },
 commonProductionX:{2:[1104,1182,1260,1338,1416],3:[138,215,293,371,449],4:[138,215,293,371,449],5:[608,686,764,842,920],6:[1104,1182,1260,1338,1416]},
 focusX:[427,902,1397],focusY:341,
 prosperityX:[723,863,1002,1141,1280,1419],prosperityY:667,
});
const pointStyle=(x,y)=>`left:${(100*x/PLAYER_BOARD_GEOMETRY.width).toFixed(4)}%;top:${(100*y/PLAYER_BOARD_GEOMETRY.cropHeight).toFixed(4)}%`;
function printedProduction(model,track){
 const geometry=PLAYER_BOARD_GEOMETRY,positions=geometry.productionX[model.owner][track.key]||geometry.commonProductionX[track.key];
 const valid=Number.isInteger(track.value)&&track.value>=0&&track.value<=track.max;
 const x=track.value===0?positions[0]-78:positions[(track.value||1)-1];
 const label=`${RESOURCE_NAMES[track.key]}产能 ${shown(track.value)}，上限 ${track.max}`;
 return `<span class="printed-board-production${valid?'':' is-unknown'}" data-board-production="${track.key}" data-production-value="${shown(track.value)}" aria-label="${label}" title="${label}"${valid?` style="${pointStyle(x,geometry.productionY[track.key])}"`:''}>${valid?`<span class="printed-production-cube" aria-hidden="true">${track.value}</span>`:''}</span>`;
}
function printedFocus(model,focus,index){
 const label=`${focus.name}${focus.selected?'，当前焦点':''}`,ready=`重整 ${focus.ready} 个盟国${focus.readyBonus?'（含外交倡议 +1）':''}`;
 return `<span class="printed-board-focus${focus.selected?' is-current':''}" data-board-focus="${focus.name}" aria-label="${label}" title="${label}；${ready}" style="${pointStyle(PLAYER_BOARD_GEOMETRY.focusX[index],PLAYER_BOARD_GEOMETRY.focusY)}">${focus.selected?'<span class="printed-focus-cylinder" aria-hidden="true"><i></i></span>':''}</span>`;
}
function printedProsperity(model,level){
 const selected=model.prosperity===level,step=model.prosperityTrack[level-1];
 const label=`繁荣 ${level} 级${selected?'，当前位置':''}${step?`；提升基础费用 ${step.cost} 消费品，${step.vp} 分${step.money?`、${step.money} 资金`:''}`:'，起点'}`;
 return `<span class="printed-board-prosperity${selected?' is-current':''}" data-board-prosperity="${level}" aria-label="${label}" title="${label}" style="${pointStyle(PLAYER_BOARD_GEOMETRY.prosperityX[level],PLAYER_BOARD_GEOMETRY.prosperityY)}">${selected?'<span class="printed-prosperity-ring" aria-hidden="true"></span>':''}</span>`;
}
function boardStatus(model){
 const next=model.nextProsperity;
 const status=[`当前焦点：${model.focus||'尚未记录'}`,`繁荣：${shown(model.prosperity)} / 5`,
  next?`下次提升：${next.cost} 消费品 → ${next.vp} 分${next.money?`、${next.money} 资金`:''}`:model.prosperity===5?'已达最高等级':'旧局繁荣尚未记录'];
 const bonus=[model.living?'高生活水平已生效：提升少付1消费品、多得1分。':'',model.focuses.some(f=>f.readyBonus)?'外交倡议已生效：各焦点重整盟国数量 +1。':''].filter(Boolean);
 return `<div class="printed-board-status" aria-label="玩家面板实时状态">${status.map(value=>`<span>${esc(value)}</span>`).join('')}${bonus.map(value=>`<small class="printed-board-bonus">${value}</small>`).join('')}</div>`;
}

/** Original upper board artwork with public live tokens; no warehouse fields. */
export function renderClientPrintedBoard(state,owner){
 const model=clientPlayerBoardModel(state,owner);if(!model)return '';
 const power=POWERS[owner];
 return `<section class="client-player-board client-player-board--printed client-player-board--${owner}" data-client-board-owner="${owner}" data-army-owner="${owner}" style="--player-color:${power.color}" aria-label="${power.name}实时玩家面板"><div class="printed-board-crop" style="aspect-ratio:${PLAYER_BOARD_GEOMETRY.width}/${PLAYER_BOARD_GEOMETRY.cropHeight}"><img class="printed-board-art" src="assets/board-${owner}.webp" alt="${power.full}玩家面板：生产、三类焦点与繁荣" draggable="false">${model.production.map(track=>printedProduction(model,track)).join('')}${model.focuses.map((focus,index)=>printedFocus(model,focus,index)).join('')}${Array.from({length:6},(_,level)=>printedProsperity(model,level)).join('')}</div>${boardStatus(model)}</section>`;
}
function commerce(model){
 const t=model.trade,goods=t.resources.map(key=>`${t.quantity} ${RESOURCE_NAMES[key]}`).join('或');
 return `<section class="player-board-commerce player-board-commerce--printed"><header><h3>专供出口商品卡</h3><span>${t.unknown?'状态待确认':`${t.ready} / ${t.total} 可用`}</span></header><div class="player-board-export-cards">${t.cards.map(c=>{
  const status=c.ready===true?'可供出口':c.ready===false?'已使用':'尚未记录',label=`${POWERS[model.owner].name}专供出口第 ${c.index+1} 张：${status}，${goods}`;
  return `<article class="player-board-export-card${c.ready===true?' is-ready':c.ready===false?' is-used':' is-unknown'}" data-board-commerce-index="${c.index}" title="${label}" aria-label="${label}"><img src="${commerceCardArt(model.owner,c.index,c.ready)}" alt="${label}" draggable="false">${c.ready===null?'<span class="player-board-commerce-unknown" aria-hidden="true">?</span>':''}<strong>${status}</strong></article>`;
 }).join('')}</div><p>生产${t.resources.map(key=>RESOURCE_NAMES[key]).join('或')}后恢复全部${t.total}张；贸易卡用尽后，对方才会从库存购买。</p></section>`;
}
function agreements(model){
 const t=model.trade;
 const partners=t.partners.map(p=>`${POWERS[p.owner].name}：${p.resources.map(key=>p.quantity+' '+RESOURCE_NAMES[key]).join('或')}`).join('；');
 return `<section class="player-board-agreements player-board-agreements--printed"><header><h3>贸易协定</h3><span>出口 ${t.exports} 种 · 进口 ${t.imports} 种</span></header><img class="player-board-agreement-art" src="assets/zh-CN/trade-${model.owner}.webp" alt="${POWERS[model.owner].name}贸易协定，出口 ${t.exports} 种、进口 ${t.imports} 种；玩家进口额度：${partners}" title="玩家进口额度：${partners}" draggable="false">${t.agreements.length?`<div class="player-board-active-agreements">${t.agreements.map(a=>`<article data-board-agreement="${a.id}"><div><b>${esc(a.name)}</b><span>${esc(a.status)}</span></div><p>${esc(a.description)}</p></article>`).join('')}</div>`:''}</section>`;
}

/** Trade information can sit in the public practical-information area. */
export function renderClientTradeInfo(state,owner){
 const model=clientPlayerBoardModel(state,owner);if(!model)return '';
 const power=POWERS[owner];
 return `<section class="client-player-trade-info player-board-trade" data-client-trade-owner="${owner}" style="--player-color:${power.color}" aria-label="${power.name}贸易与出口信息">${commerce(model)}${agreements(model)}</section>`;
}

/** Existing public-detail callers receive both independently placeable areas. */
export function renderClientPlayerBoard(state,owner,byId={}){
 return renderClientPrintedBoard(state,owner)+renderClientTradeInfo(state,owner);
}
