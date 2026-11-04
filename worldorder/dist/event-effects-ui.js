import {EVENT_EFFECTS} from './event-effects.js';
import {eventEffectOptions,useEventEffect} from './event-effect-actions.js';
import {RESOURCE_LABELS} from './economy.js';
const names={US:'美国',CN:'中国',EU:'欧盟',RU:'俄罗斯',global:'全局'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderEventEffects(s,owner=null,{textOnly=false}={}){
 const saved=s.eventEffects||[],legacy=(s.activeEffects||[]).filter(id=>!saved.some(e=>e.cardId===id)).map(cardId=>({cardId,owner:'global'}));
 const effects=[...saved,...legacy].filter(e=>(!owner||e.owner===owner||e.owner==='global')&&EVENT_EFFECTS[e.cardId]);
 const actions=owner&&!textOnly?eventEffectOptions(s,owner):[];
 return effects.length?`<section class="event-effects"><b>已生效的事件效果</b>${effects.map(e=>{const option=actions.find(o=>o.effectId===e.cardId);let controls='';
  if(option){let issue='';try{useEventEffect(s,{effectId:e.cardId,resourceKey:option.keys[0]},{preview:true});}catch(error){issue=error.message;}
   controls=`${option.keys.length>1?`<label>获得资源<select data-effect-resource="${e.cardId}">${option.keys.map(k=>`<option value="${k}">${k<3?3:1}${RESOURCE_LABELS[k]}</option>`).join('')}</select></label>`:''}<button data-command="useEventEffect" data-use-event-effect="${e.cardId}" ${issue?'disabled':''}>${option.used?'本轮已使用':'使用本轮交易效果'}</button>${issue?`<small>${esc(issue)}</small>`:''}`;}
  const description=e.face==='investment'?'投资回报时获得6资金。':e.face==='exchange'?`每轮一次，向${names[e.owner==='US'?'EU':'US']}支付10资金，获得1外交及所选资源。`:EVENT_EFFECTS[e.cardId].description;
  return `<p>${names[e.owner]} · ${textOnly?`<b>${EVENT_EFFECTS[e.cardId].name}</b>`:`<button data-card="${e.cardId}" data-source="view">${EVENT_EFFECTS[e.cardId].name}</button>`}${e.face?' · '+(e.face==='investment'?'投资面':'交易面'):''}：${description}</p>${controls}`;
 }).join('')}</section>`:'';
}
