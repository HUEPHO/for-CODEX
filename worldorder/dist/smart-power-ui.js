import {AREAS} from './world.js';
export function smartControls(s,info){if(!s.config.wit)return '';const p=s.players[s.current];let controls='';
 if(info.effect==='relations')controls=`<label>用SP替代外交<input id="relation-sp" type="number" min="0" max="${p.smart}" value="0" step="1"></label>`;
 if(info.effect==='engage')controls='<label><input id="engage-sp" type="checkbox"> 消耗1 SP，按当地盟国数量减少外交费用</label>';
 if(info.effect==='invest')controls='<label>投资重整<select id="invest-sp"><option value="">不用SP</option><option value="before">消耗1 SP，投资前重整该盟国</option><option value="after">消耗1 SP，投资后重整该盟国</option></select></label>';
 return controls?`<fieldset class="smart-options"><legend>可选SP增强 · 剩余${p.smart} SP</legend>${controls}</fieldset>`:'';
}
export function readSmartForm(){return {relationSP:Number(document.querySelector('#relation-sp')?.value||0),engageSP:document.querySelector('#engage-sp')?.checked?1:0,investSP:document.querySelector('#invest-sp')?.value||'',baseExtraFrom:document.querySelector('#base-extra-from')?.value||''};}
