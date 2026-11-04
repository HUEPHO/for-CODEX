import {militaryCondition,resolveMilitary} from './event-military.js';
import {REGIONS} from './game-constants.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderMilitaryEvent(s,q,cards={}){
 const model=militaryCondition(s,q),p=s.players[q.owner];
 let body=`<p>${esc(model.detail)}${model.smart?`获得${model.smart} SP。`:''}</p>`;
 if(model.eventTransfer)body+='<p>必须移动2支军队到事件牌，结算后进入亚太；可从待命区或任意地区（包括亚太）调入。</p>';
 if(model.ignoreBase)body+='<p>必须移动1支军队，可进入亚太或南亚，无需基地。</p>';
 if(model.upgrade)body+=`<p>${model.production.full?'军队产能已满，跳过提升并继续其余奖励。':'先提升1军队产能。'}</p>`;
 if(model.produce)body+=`<label>生产军队数量（每支需1原料和1粮食，可选0）<input id="military-quantity" type="number" min="0" max="${model.production.limit}" value="0"></label>`;
 body+=`<label>移动目的地<select id="military-destination">${model.destinations.map(id=>`<option value="${id}">${REGIONS[id]}</option>`).join('')}</select></label><p>${model.minMoves===model.maxMoves?'必须移动'+model.minMoves:'可移动至多'+model.maxMoves}支军队。</p>`;
 body+=['reserve',...Object.keys(REGIONS)].map(from=>`<label data-military-source-row="${from}">${from==='reserve'?'待命区':REGIONS[from]}移入数量<input data-military-source="${from}" type="number" min="0" max="${model.maxMoves}" value="0"><small>${from==='reserve'?`现有${p.resources[6]}支${model.produce?'，本次新生产的军队也可移动':''}`:`现有${s.regions[from].armies[q.owner]}支`}</small></label>`).join('');
 if(model.influence)body+='<label>新增影响力位置<select id="military-slot"><option value="permanent">永久槽</option><option value="temporary">临时槽</option></select></label>';
 if(model.chain)body+='<p>执行后将中国的战略应对加入下一轮；已出现的连锁不重复加入。</p>';
 return `<div id="personal-event-form"><label>本次选择<select id="military-accept"><option value="no">放弃可选效果</option><option value="yes">执行并支付费用</option></select></label><div id="military-options">${body}</div><p id="personal-preview" aria-live="polite"></p></div>`;
}
export function readMilitaryEvent(){
 return {accept:document.querySelector('#military-accept')?.value==='yes',quantity:Number(document.querySelector('#military-quantity')?.value||0),destination:document.querySelector('#military-destination')?.value,slot:document.querySelector('#military-slot')?.value,moves:Object.fromEntries([...document.querySelectorAll('[data-military-source]')].map(el=>[el.dataset.militarySource,Number(el.value)]))};
}
export function updateMilitaryEvent(s){
 const q=s.flow.eventResolution,model=militaryCondition(s,q),options=document.querySelector('#military-options'),a=readMilitaryEvent();
 if(options)options.hidden=!a.accept;
 for(const row of document.querySelectorAll('[data-military-source-row]')){
  const disabled=!model.eventTransfer&&row.dataset.militarySourceRow===a.destination,input=row.querySelector('input');
  row.hidden=disabled;if(disabled)input.value='0';
 }
 const button=document.querySelector('#event-submit'),preview=document.querySelector('#personal-preview');
 try{preview.textContent=resolveMilitary(s,q,readMilitaryEvent(),{preview:true});button.disabled=false;}catch(error){preview.textContent=error.message;button.disabled=true;}
}
