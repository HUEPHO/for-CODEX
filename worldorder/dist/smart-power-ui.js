import {relationCost} from './country-actions.js';
export function smartControls(s,info){if(!s.config.wit)return '';const p=s.players[s.current];let controls='';
 if(info.effect==='relations')return `<div class="smart-relation-payment">花费 <button type="button" data-smart-payment role="spinbutton" aria-label="SP花费，左键增加，右键减少" aria-valuemin="0" aria-valuenow="0" aria-valuemax="${p.smart}" title="左键增加，右键减少；↑ / ↓ 也可调整"><b data-smart-value>0</b> SP</button><span>＋ <b data-smart-diplomacy>—</b> 外交</span><input id="relation-sp" type="number" min="0" max="${p.smart}" value="0" step="1" hidden></div>`;
 if(info.effect==='engage')controls='<label><input id="engage-sp" type="checkbox"> 消耗1 SP，按当地盟国数量减少外交费用</label>';
 if(info.effect==='invest')controls='<label>投资重整<select id="invest-sp"><option value="">不用SP</option><option value="before">消耗1 SP，投资前重整该盟国</option><option value="after">消耗1 SP，投资后重整该盟国</option></select></label>';
 return controls?`<fieldset class="smart-options"><legend>可选SP增强 · 剩余${p.smart} SP</legend>${controls}</fieldset>`:'';
}
export function readSmartForm(){return {relationSP:Number(document.querySelector('#relation-sp')?.value||0),engageSP:document.querySelector('#engage-sp')?.checked?1:0,investSP:document.querySelector('#invest-sp')?.value||'',baseExtraFrom:document.querySelector('#base-extra-from')?.value||''};}
export function updateSmartForm(s,info,a){
 const input=document.querySelector('#relation-sp');if(!input)return;
 const group=input.closest('.smart-relation-payment'),button=group.querySelector('[data-smart-payment]');
 const cost=a.country?relationCost(s,a,info).cost-Number(a.moneyDiplomacy||0):0,max=Math.min(s.players[s.current].smart,Math.max(0,cost));
 input.max=max;input.value=Math.min(Number(input.value),max);
 group.querySelector('[data-smart-value]').textContent=input.value;
 group.querySelector('[data-smart-diplomacy]').textContent=a.country?cost-Number(input.value):'—';
 button.setAttribute('aria-valuenow',input.value);button.setAttribute('aria-valuemax',String(max));button.disabled=input.disabled||!a.country;
}
export function handleSmartPayment(event,delta){
 const button=event.target.closest('[data-smart-payment]');if(!button)return false;
 event.preventDefault();const input=button.closest('.smart-relation-payment').querySelector('#relation-sp');if(button.disabled||input.disabled)return true;
 input.value=Math.max(0,Math.min(Number(input.max),Number(input.value)+delta));input.dispatchEvent(new Event('input',{bubbles:true}));return true;
}
