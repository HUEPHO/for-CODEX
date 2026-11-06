import {PERSONAL_EVENTS,personalCondition,personalEventPreview,personalInvestmentTargets,personalEventFamily} from './event-personal.js';
import {renderMilitaryEvent,readMilitaryEvent,updateMilitaryEvent} from './event-military-ui.js';
import {renderEconomicCheckEvent,readEconomicCheckEvent,updateEconomicCheckEvent} from './event-economic-checks-ui.js';
import {decisionDefinition,decisionModel} from './event-decision.js';
import {RESOURCE_LABELS} from './economy.js';
import {resilienceControls,readResilience,updateResilience} from './growth-triggers-ui.js';
import {investmentCost,countryRegion} from './research.js';
import {AREAS} from './world.js';
import {investmentSPControl,readInvestmentSP,updateInvestmentSP} from './smart-power-ui.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slots='<label>新增影响力位置<select id="personal-slot"><option value="permanent">永久槽</option><option value="temporary">临时槽</option></select></label>';
const familyViews={military:{render:renderMilitaryEvent,read:readMilitaryEvent,update:updateMilitaryEvent},economic:{render:renderEconomicCheckEvent,read:readEconomicCheckEvent,update:updateEconomicCheckEvent}};
function investmentForm(s,q,cards){return `<label>投资盟国<select id="personal-country">${personalInvestmentTargets(s,q).map(id=>`<option value="${id}">${esc(cards[id]?.name||'盟国')} · ${investmentCost(id)}资金${s.players[q.owner].exhaustedAllies?.includes(id)?' · 已横置':''}</option>`).join('')||'<option value="">暂无可投资盟国</option>'}</select></label>${slots}${investmentSPControl('personal-invest-sp')}${resilienceControls(s,'personal')}`;}
export function renderEventInvestment(q,cards={}){return q.investment?`<p>投资盟国：<button data-card="${q.investment.country}" data-source="view">${esc(cards[q.investment.country]?.name||'查看国家牌')}</button> · ${q.investment.slot==='permanent'?'永久':'临时'}影响力</p>`:'';}
function renderDecisionEvent(s,q,cards){
 const model=decisionModel(s,q),cost=[`${model.cost.money}资金`,...(model.cost.energy?[`${model.cost.energy}能源`]:[]),`${model.cost.diplomacy}外交`].join('、');
 let options=`<p>本次费用：${cost}。</p>`;
 if(model.production)options+=model.production.full?'<p>所有产能已满：跳过产能提升，仍可付费领取其余奖励。</p>':`<label>提升产能<select id="personal-production-key">${model.production.options.map(({key,current})=>`<option value="${key}">${RESOURCE_LABELS[key]}（${current}→${current+1}）</option>`).join('')}</select></label>`;
 if(model.influence)options+=`<p>在${AREAS[model.influence.region].name}添加1影响力。</p>${slots.replace('id="personal-slot"',`id="personal-slot" data-region-value="${model.influence.region}"`)}`;
 if(model.investment)options+=`<label>后续投资<select id="personal-invest"><option value="no">不投资</option><option value="yes">正常付费投资</option></select></label><div id="personal-investment">${investmentForm(s,q,cards)}</div>`;
 return `<div id="personal-event-form"><label>执行提议<select id="personal-accept"><option value="no">放弃可选效果</option><option value="yes">执行并支付费用</option></select></label><div id="personal-options">${options}</div><p id="personal-preview" aria-live="polite"></p></div>`;
}
export function renderPersonalEvent(s,q,cards={}){
 const view=familyViews[personalEventFamily(q.cardId)];if(view)return view.render(s,q,cards);
 if(decisionDefinition(q.cardId))return renderDecisionEvent(s,q,cards);
 const kind=PERSONAL_EVENTS[q.cardId],p=s.players[q.owner],condition=personalCondition(s,q);let body=`<p>${esc(condition.detail||'')}</p>`;
 if(!condition.met)body+='<p>条件未满足：确认后结束此事件。</p>';
 else if(kind==='pivot')body+=`<p>向亚太移动至多2支军队。</p>${['reserve',...Object.keys(AREAS).filter(r=>r!=='P')].map(from=>`<label>${from==='reserve'?'待命区':AREAS[from].name}移入数量<input data-personal-armies="${from}" type="number" min="0" max="${Math.min(2,from==='reserve'?p.resources[6]:s.regions[from].armies[q.owner])}" value="0"></label>`).join('')}`;
 else if(kind!=='cafta'){
  body+='<label>执行提议<select id="personal-accept"><option value="no">放弃可选效果</option><option value="yes">执行并支付费用</option></select></label><div id="personal-options">';
  if(kind==='aiib')body+=investmentForm(s,q,cards);
  else if(kind==='tpp')body+=`<p>本次费用：${condition.diplomacy}外交。</p><label>后续投资<select id="personal-invest"><option value="no">不投资</option><option value="yes">正常付费投资</option></select></label><div id="personal-investment">${investmentForm(s,q,cards)}</div>`;
  else body+=`<p>本次费用：10资金、${condition.diplomacy}外交。</p>${slots.replace('id="personal-slot"','id="personal-slot" data-region-value="N"')}<label>出售能源数量<input id="personal-energy" type="number" min="0" max="${Math.min(5,p.resources[0])}" value="0"></label>`;
  body+='</div>';
 }
 return `<div id="personal-event-form">${body}<p id="personal-preview" aria-live="polite"></p></div>`;
}
export function readPersonalEvent(s){const view=familyViews[personalEventFamily(s?.flow?.eventResolution?.cardId)];if(view)return view.read(s);return {accept:document.querySelector('#personal-accept')?.value==='yes',invest:document.querySelector('#personal-invest')?.value==='yes',productionKey:document.querySelector('#personal-production-key')?Number(document.querySelector('#personal-production-key').value):undefined,country:document.querySelector('#personal-country')?.value,slot:document.querySelector('#personal-slot')?.value,investSP:readInvestmentSP('personal-invest-sp'),resilience:readResilience('personal'),energy:Number(document.querySelector('#personal-energy')?.value||0),moves:Object.fromEntries([...document.querySelectorAll('[data-personal-armies]')].map(el=>[el.dataset.personalArmies,Number(el.value)]))};}
export function updatePersonalEvent(s){
 if(s.flow?.eventResolution?.mode!=='personal'||!document.querySelector('#personal-event-form'))return;
 const view=familyViews[personalEventFamily(s.flow?.eventResolution?.cardId)];if(view)return view.update(s);
 const options=document.querySelector('#personal-options'),a=readPersonalEvent(s);if(options)options.hidden=!a.accept;
 const q=s.flow.eventResolution;updateInvestmentSP('personal-invest-sp',PERSONAL_EVENTS[q.cardId]!=='aiib'&&s.players[q.owner].exhaustedAllies?.includes(a.country));
 const investment=document.querySelector('#personal-investment');if(investment)investment.hidden=!a.invest;
 if(a.country)updateResilience(s,countryRegion(a.country),a.slot,'personal');
 const button=document.querySelector('#event-submit'),preview=document.querySelector('#personal-preview');
 try{personalEventPreview(s,s.flow.eventResolution,readPersonalEvent(s));preview.textContent='';button.disabled=false;}catch(error){preview.textContent=error.message;button.disabled=true;}
}
