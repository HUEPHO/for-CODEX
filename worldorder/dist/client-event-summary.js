import {EVENT_DATA,EVENT_TYPES} from './event-data.js';
import {POWERS,REGIONS} from './game-constants.js';
import {powerFlag} from './power-identity.js';
import {REGION_COLORS} from './region-presentation.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validIds=values=>Array.isArray(values)?values.filter(id=>typeof id==='string'&&id.length>0):[];

function eventSummary(id,group,byId,current){
 const data=EVENT_DATA[id],card=byId?.[id];
 const regionIds=[...new Set(data?.regions||[])].filter(region=>Object.hasOwn(REGIONS,region));
 const participantIds=[...new Set(data?.players||[])].filter(owner=>Object.hasOwn(POWERS,owner));
 const regions=regionIds.map(region=>REGIONS[region]);
 const participants=participantIds.map(owner=>POWERS[owner].name);
 const active=current?.cardId===id;
 return {
  id,group,title:String(data?.name||card?.name||'未识别事件'),image:card?.image||null,regionIds,participantIds,
  typeLabel:EVENT_TYPES[data?.type]||'类型未登记',
  regionLabel:regions.join('、')||'牌面未指定区域',
  participantLabel:participants.join('、')||'牌面未指定参与方',
  active,status:active?(current.stage==='result'?'结果待确认':current.stage==='reward'?'等待奖励选择':'正在结算'):'',
 };
}

/** A presentation-only projection of already placed, public event cards.
 * Never reads event decks, pending personal choices, bids, receipts or totals.
 * Printed flags identify involved powers; they are not a second actor policy.
 */
export function clientEventSummaryModel(state,byId={}, {viewer=state?.current}={}){
 const enabled=state?.config?.wit===true;
 const owner=Object.hasOwn(POWERS,viewer)?viewer:null;
 const publicGroup={title:'公共事件',events:[],empty:enabled?'当前没有公共事件':'本局未开启 WIT 事件扩展'};
 const personalGroup={title:'个人事件',events:[],empty:enabled?'当前没有已公开的个人事件':'本局未开启 WIT 事件扩展'};
 if(enabled){
  const current=state.flow?.eventResolution;
  // Older saves may have only the public events array; never inspect their decks.
  publicGroup.events=validIds(state.eventBoard?.slots??state.events).map(id=>eventSummary(id,'public',byId,current));
  // Personal events already on the board are public. Use only actual IDs in
  // the supplied view, preserving owner identity even if IDs are repeated.
  for(const player of Object.keys(POWERS)){
   const id=state.eventBoard?.personal?.[player];
   if(typeof id==='string'&&id)personalGroup.events.push({...eventSummary(id,'personal',byId,current),owner:player,ownerLabel:POWERS[player].name,self:player===owner});
  }
 }
 return {enabled,viewer:owner,public:publicGroup,personal:personalGroup};
}

function powerName(owner,text=POWERS[owner].name){
 const short=text.length===1;
 return `<span class="client-event-power${short?' client-event-power--short':''}" data-event-power="${owner}" style="--client-event-power-color:${POWERS[owner].color}">${powerFlag(owner,{decorative:!short})}${short?'':esc(text)}</span>`;
}

const powerNames=Object.entries(POWERS).flatMap(([owner,power])=>[[power.full,owner],[power.name,owner]]).sort(([a],[b])=>b.length-a.length);
const powerNamePattern=new RegExp(powerNames.map(([name])=>name).join('|'),'g');
function colorPowerNames(text){
 let result='',end=0;
 for(const match of String(text).matchAll(powerNamePattern)){
  result+=esc(text.slice(end,match.index))+powerName(powerNames.find(([name])=>name===match[0])[1],match[0]);
  end=match.index+match[0].length;
 }
 return result+esc(text.slice(end));
}
function eventTitle(event){
 // Only unambiguous printed title prefixes are abbreviations. Never color
 // geographic words such as 美洲, 中亚 or 中东 as if they named a power.
 const prefixes=[['中美',['CN','US']],['中俄',['CN','RU']],['美墨加',['US']],['中伊',['CN']],['中巴',['CN']]];
 const prefix=prefixes.find(([text,owners])=>event.title.startsWith(text)&&owners.every(owner=>event.participantIds.includes(owner)));
 if(!prefix)return colorPowerNames(event.title);
 const [,owners]=prefix;
 return owners.map((owner,i)=>powerName(owner,event.title[i])).join('')+colorPowerNames(event.title.slice(owners.length));
}
function eventStyle(event){
 const colors=event.regionIds.map(region=>REGION_COLORS[region]);
 if(!colors.length)return '';
 const shades=colors.map(color=>`color-mix(in srgb,${color} 34%,#0c1c28)`);
 const background=shades.length===1?shades[0]:`linear-gradient(115deg,${shades.join(',')})`;
 return ` style="--client-event-background:${background};--client-event-accent:${colors[0]}"`;
}
function renderEvent(event,key){
 const participants=event.participantIds.length?event.participantIds.map(owner=>powerName(owner)).join('、'):esc(event.participantLabel);
 const face=event.image?`<img class="client-event-art" src="${esc(event.image)}" alt="${esc(event.title)}" loading="lazy" decoding="async" draggable="false">`:`<span class="client-event-title">${eventTitle(event)}</span><span class="client-event-meta"><span class="client-event-type">类型 · ${esc(event.typeLabel)}</span><span class="client-event-region">区域 · ${esc(event.regionLabel)}</span><span class="client-event-participants">涉及方 · ${participants}</span></span>`;
 return `<button type="button" class="client-event-row${event.active?' is-current':''}${event.self?' is-self':''}${event.image?' client-event-row--art':''}" data-client-event-id="${esc(event.id)}" data-client-event-group="${key}" data-client-event-regions="${event.regionIds.join(' ')}"${event.owner?` data-client-event-owner="${event.owner}"`:''}${eventStyle(event)} aria-label="查看${event.ownerLabel?esc(event.ownerLabel)+' · ':''}${esc(event.title)}详情" title="${esc(event.title)}${event.status?' · '+esc(event.status):''}">${event.ownerLabel?`<span class="client-event-owner">${powerFlag(event.owner)}</span>`:''}${face}${event.status?`<span class="client-event-status">${esc(event.status)}</span>`:''}</button>`;
}
function renderGroup(group,key){
 return `<section class="client-event-section client-event-section--${key}" aria-label="${esc(group.title)}"><header class="client-event-heading"><h2>${esc(group.title)}</h2><span class="client-event-count">${group.events.length}</span></header><div class="client-event-list">${group.events.length?group.events.map(event=>renderEvent(event,key)).join(''):`<p class="client-event-empty">${esc(group.empty)}</p>`}</div></section>`;
}

/** Two sibling sections, suitable for the desktop board's eighth grid cell. */
export function renderClientEventSummary(state,byId={},options={}){
 const model=clientEventSummaryModel(state,byId,options);
 return renderGroup(model.public,'public')+renderGroup(model.personal,'personal');
}
