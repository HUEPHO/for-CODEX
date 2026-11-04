import {availableGrowth,openRelationPreview} from './growth-triggers.js';
import {relationCountries,countryInfo} from './country-actions.js';
import {AREAS} from './world.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function resilienceControls(s,prefix='basic'){
 if(!availableGrowth(s,'resilience'))return '';
 return `<fieldset><legend>区域韧性 · 每轮一次</legend><label>转换时机<select id="${prefix}-resilience"><option value="">不使用</option><option value="before">添加影响力之前</option><option value="after">添加影响力之后</option></select></label><label>转换本方临时影响力<select id="${prefix}-convert"></select></label></fieldset>`;
}
export function readResilience(prefix='basic'){const timing=document.querySelector('#'+prefix+'-resilience')?.value;return timing?{timing,index:Number(document.querySelector('#'+prefix+'-convert')?.value??NaN)}:null;}
export function updateResilience(s,region,slot,prefix='basic'){
 const timing=document.querySelector('#'+prefix+'-resilience'),select=document.querySelector('#'+prefix+'-convert');if(!select)return;
 const prev=select.value;let temporary=[...(s.regions[region]?.temporary||[])];
 if(timing.value==='after'&&slot==='temporary'&&AREAS[region]){if(temporary.length===AREAS[region].temp.length)temporary.shift();temporary.push(s.current);}
 select.innerHTML=temporary.map((id,i)=>id===s.current?`<option value="${i}">第${i+1}个临时位置${timing.value==='after'&&slot==='temporary'&&i===temporary.length-1?' · 本次新放':''}</option>`:'').join('')||'<option value="">没有可转换的本方影响力</option>';
 if([...select.options].some(o=>o.value===prev))select.value=prev;select.disabled=!timing.value;
}
export function renderOpenRelation(s,cards){const pending=s.flow?.pendingRelation;if(!pending)return '';const ids=relationCountries(s).filter(id=>countryInfo(id).countryName!==countryInfo(pending.firstCountry).countryName);
 return `<section id="open-relation-form"><b>开放外交 · 追加结盟</b><p>第一国已结算。选择第二国后，另支付1外交；这1点不能以盟国减免。也可跳过，保留本轮能力。</p><label>第二个国家<select id="open-country">${ids.map(id=>`<option value="${id}">${esc(cards[id]?.name)} · ${AREAS[countryInfo(id).region].name} · 价值${countryInfo(id).countryValue}</option>`).join('')||'<option value="">暂无可结盟国家</option>'}</select></label><div id="open-face"></div><fieldset id="open-discounts"></fieldset>${s.config.wit?'<label>SP替代通常结盟费用<input id="open-sp" type="number" min="0" value="0"></label>':''}${pending.card.moneyDiplomacy?'<label>资金替代的通常外交费用<input id="open-money" type="number" min="0" value="0"></label>':''}<label>升级盟国时的影响力<select id="open-slot"><option value="permanent">永久槽</option><option value="temporary">临时槽</option></select></label>${resilienceControls(s,'open')}<p id="open-preview"></p><button id="commit-open-relation">支付并完成追加结盟</button><button id="skip-open-relation">跳过追加结盟</button></section>`;
}
export function readOpenRelation(){return {type:'resolveOpenDiplomacy',country:document.querySelector('#open-country')?.value,slot:document.querySelector('#open-slot')?.value,relationSP:Number(document.querySelector('#open-sp')?.value||0),moneyDiplomacy:Number(document.querySelector('#open-money')?.value||0),exhaust:[...document.querySelectorAll('[data-open-exhaust]:checked')].map(el=>el.dataset.openExhaust),resilience:readResilience('open')};}
export function updateOpenRelation(s,cards,refresh=false){if(!document.querySelector('#open-relation-form'))return;const p=s.players[s.current],a=readOpenRelation(),region=a.country?countryInfo(a.country).region:null;
 if(refresh){document.querySelector('#open-discounts').innerHTML='<legend>横置当地就绪盟国减免通常费用</legend>'+p.allies.filter(id=>countryInfo(id).region===region&&!(p.exhaustedAllies||[]).includes(id)).map(id=>`<label><input type="checkbox" data-open-exhaust="${id}"> ${esc(cards[id]?.name)} · ${countryInfo(id).countryValue}</label>`).join('');document.querySelector('#open-face').innerHTML=cards[a.country]?`<img src="${esc(cards[a.country].image)}" alt="${esc(cards[a.country].name)}" style="max-height:220px;max-width:100%">`:'';}
 updateResilience(s,region,a.slot,'open');const button=document.querySelector('#commit-open-relation');try{const r=openRelationPreview(s,readOpenRelation());document.querySelector('#open-preview').textContent=`额外1外交＋通常${r.cost}外交、${r.moneyCost}资金、${r.smartCost} SP。${r.influence?'升级放置影响力，获得'+r.vp+'分。':'获得盟国，不放置影响力。'}`;button.disabled=false;}catch(error){document.querySelector('#open-preview').textContent=error.message;button.disabled=true;}
}
