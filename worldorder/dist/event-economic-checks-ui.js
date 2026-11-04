import {economicCheckCondition,resolveEconomicCheck} from './event-economic-checks.js';
import {ENGAGE_LIMIT} from './basic-actions.js';
import {countryInfo} from './country-actions.js';
import {investmentCost,countryRegion} from './research.js';
import {resilienceControls,readResilience,updateResilience} from './growth-triggers-ui.js';
import {AREAS} from './world.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slots='<label>新增影响力位置<select id="economic-slot"><option value="permanent">永久槽</option><option value="temporary">临时槽</option></select></label>';
export function renderEconomicCheckEvent(s,q,cards={}){
 const model=economicCheckCondition(s,q),p=s.players[q.owner],owned={...s,current:q.owner};let body=`<p>${esc(model.detail)}</p>`;
 if(!model.met)body+='<p>条件未满足：确认后结束此事件。</p>';
 else{
  body+=`<label>本次选择<select id="economic-accept"><option value="no">${model.kind==='cpec'?'领取2 SP，放弃再次投资':'放弃可选介入'}</option><option value="yes">${model.kind==='cpec'?'领取2 SP，并付费再次投资':'正常付费介入美洲'}</option></select></label><div id="economic-options">`;
  if(model.kind==='ceta'){
   body+='<p>介入成功后才获得1 SP，不能预支此奖励支付介入费用。</p><fieldset><legend>横置美洲就绪盟国减免外交 · 可不选</legend>'+model.allies.filter(id=>!(p.exhaustedAllies||[]).includes(id)).map(id=>`<label><input type="checkbox" data-economic-exhaust="${id}">${esc(cards[id]?.name||'盟国')} · 减免${countryInfo(id).countryValue}外交</label>`).join('')+'</fieldset><label><input id="economic-engage-sp" type="checkbox">支付1 SP，按美洲盟国数量减少外交费用</label>';
   const used=Object.values(s.regions).reduce((n,r)=>n+r.engage[q.owner],0);
   if(used>=ENGAGE_LIMIT[q.owner])body+=`<label>移来已有介入标记<select id="economic-move-from">${Object.keys(AREAS).filter(region=>s.regions[region].engage[q.owner]>0).map(region=>`<option value="${region}">${AREAS[region].name}</option>`).join('')}</select></label>`;
  }else body+=`<label>再次投资的巴基斯坦<select id="economic-country">${model.targets.map(id=>`<option value="${id}">${esc(cards[id]?.name||'巴基斯坦')} · ${investmentCost(id)}资金${p.exhaustedAllies?.includes(id)?' · 已横置':''}</option>`).join('')||'<option value="">没有可正常投资的本方巴基斯坦盟国</option>'}</select></label><label>投资时使用SP<select id="economic-invest-sp"><option value="">不使用SP</option><option value="before">支付1 SP在投资前重整</option><option value="after">支付1 SP在投资后重整</option></select></label>`;
  body+=(model.kind==='ceta'?slots.replace('id="economic-slot"','id="economic-slot" data-region-value="M"'):slots)+resilienceControls(owned,'economic')+'</div>';
 }
 return `<div id="personal-event-form">${body}<p id="economic-preview" aria-live="polite"></p></div>`;
}
export function readEconomicCheckEvent(){return {accept:document.querySelector('#economic-accept')?.value==='yes',country:document.querySelector('#economic-country')?.value,slot:document.querySelector('#economic-slot')?.value,investSP:document.querySelector('#economic-invest-sp')?.value||'',engageSP:document.querySelector('#economic-engage-sp')?.checked?1:0,moveFrom:document.querySelector('#economic-move-from')?.value||'',exhaust:[...document.querySelectorAll('[data-economic-exhaust]:checked')].map(el=>el.dataset.economicExhaust),resilience:readResilience('economic')};}
export function updateEconomicCheckEvent(s){
 const preview=document.querySelector('#economic-preview');if(!preview)return;
 const q=s.flow.eventResolution,owned={...s,current:q.owner},a=readEconomicCheckEvent(),options=document.querySelector('#economic-options');if(options)options.hidden=!a.accept;
 updateResilience(owned,a.country?countryRegion(a.country):'M',a.slot,'economic');
 const button=document.querySelector('#event-submit');
 try{preview.textContent=resolveEconomicCheck(owned,q,readEconomicCheckEvent(),{preview:true});button.disabled=false;}catch(error){preview.textContent=error.message;button.disabled=true;}
}
