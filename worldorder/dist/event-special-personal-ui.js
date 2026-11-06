import {renderArmyContribution,readArmyContribution} from './army-contribution-ui.js';
import {renderArmyDeployment} from './army-deployment-ui.js';
import {specialEventModel,specialEventPreview} from './event-special-personal.js';
import {countryInfo} from './country-actions.js';
import {REGIONS,POWERS} from './game-constants.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const choice='<label>执行提议<select id="special-accept"><option value="no">不执行提议</option><option value="yes">支付费用并执行</option></select></label>';
const slot='<label>新增影响力位置<select id="special-slot" data-region-value="E"><option value="permanent">永久槽</option><option value="temporary">临时槽</option></select></label>';
export function renderSpecialPersonalEvent(s,q,cards={}){
 const model=specialEventModel(s,q),p=s.players[s.current];let body='';
 if(model.key==='covid')body=`<p>当前繁荣${model.prosperity}级；不支付失去${model.loss}分。</p><label>本次支付<select id="special-payment"><option value="none">不支付</option><option value="money">支付20资金</option><option value="service">支付1服务</option></select></label>`;
 else if(model.key==='afghan'){
  if(!model.present)body='<p>美欧均无中亚军队：双方各失去3 SP，不足部分扣分，中亚加入1中立影响力。确认后统一结算。</p>';
  else if(model.phase==='offer')body=`<p>美欧共同支付恰好30资金，可由任意一方全付；双方各得1 SP并保留中亚军队。未达成则不扣承诺资金，双方各失去1 SP，不足部分扣分，随后免费撤回全部中亚军队。</p>${Object.entries(q.submissions).map(([id,n])=>`<p>${POWERS[id].name}已承诺${n}资金。</p>`).join('')}<label>本方承诺资金<input id="special-amount" type="number" min="0" max="${Math.min(30,p.money)}" value="0"></label>`;
  else body=`<p>将中亚全部${model.armies}辆坦克免费重新派遣。</p>`+renderArmyDeployment(s,{id:'withdrawal-deployment',maxMoves:model.armies,destinations:model.destinations,normalDestinations:model.destinations,source:['C'],initial:{C:-model.armies}});
 }else if(model.key==='croatia'){
  body=`<p>${model.country?'已拥有克罗地亚':'尚未拥有克罗地亚'}；${model.improved?'已提升过繁荣':model.historyKnown?'尚未提升繁荣':'旧存档缺少完整繁荣历史'}。</p>`;
  if(model.country&&!model.historyKnown)body+='<label>本局曾提升繁荣<select id="special-prosperity-improved"><option value="">请选择</option><option value="yes">本局曾提升繁荣</option><option value="no">本局未提升繁荣</option></select></label>';
  body+=model.country&&model.improved!==false?'<p>若条件达成：欧洲增加1影响力、获得2 SP，并将克罗地亚移出游戏。</p>'+slot:'<p>条件未同时满足：确认后结束，无后续效果。</p>';
 }
 else if(model.key==='korea')body=`${choice}`;
 else if(model.key==='brexit'){
  body=`${choice}<div id="special-decline"><label>与英国改善关系<select id="special-relate"><option value="no">不结盟，英国留在欧洲左堆顶</option><option value="yes">正常付费立即结盟</option></select></label><div id="special-relation"><fieldset><legend>横置就绪欧洲盟国减免外交</legend>${p.allies.filter(id=>countryInfo(id).region==='E'&&!p.exhaustedAllies?.includes(id)).map(id=>`<label><input type="checkbox" data-special-exhaust="${id}">${esc(cards[id]?.name||'欧洲盟国')} · 价值${countryInfo(id).countryValue}</label>`).join('')||'<p>无可横置盟国。</p>'}</fieldset><label>SP替代外交<input id="special-relation-sp" type="number" min="0" max="${p.smart}" value="0"></label></div></div>`;
 }else if(model.key==='crimea')body=`${choice}<div id="special-accept-options"><label>转换欧洲临时影响力<select id="special-convert" data-region-value="E"><option value="">不转换</option>${model.temporary.map(index=>`<option value="${index}">第${index+1}个位置</option>`).join('')}</select></label></div><div id="special-decline">${renderArmyContribution(s,{id:'crimea-armies',max:model.movable})}</div>`;
 return `<div id="personal-event-form">${body}<p id="personal-preview" aria-live="polite"></p></div>`;
}
export function readSpecialPersonalEvent(){
 const conversion=document.querySelector('#special-convert')?.value||'',improved=document.querySelector('#special-prosperity-improved')?.value;
 return {accept:document.querySelector('#special-accept')?.value==='yes',payment:document.querySelector('#special-payment')?.value,amount:Number(document.querySelector('#special-amount')?.value||0),slot:document.querySelector('#special-slot')?.value,relate:document.querySelector('#special-relate')?.value==='yes',relationSP:Number(document.querySelector('#special-relation-sp')?.value||0),exhaust:[...document.querySelectorAll('[data-special-exhaust]:checked')].map(el=>el.dataset.specialExhaust),convert:conversion!=='',index:conversion===''?undefined:Number(conversion),prosperityImproved:improved?improved==='yes':undefined,moves:document.querySelector('#special-accept')?.value==='yes'?{}:readArmyContribution(document.querySelector('#crimea-armies')),withdrawals:document.querySelector('#withdrawal-deployment')?Object.fromEntries(Object.entries(JSON.parse(document.querySelector('#withdrawal-deployment [data-army-delta]').value)).filter(([,n])=>n>0)):Object.fromEntries([...document.querySelectorAll('[data-special-withdrawal]')].map(el=>[el.dataset.specialWithdrawal,Number(el.value)]))};
}
export function updateSpecialPersonalEvent(s){
 if(s.flow?.eventResolution?.mode!=='special'||!document.querySelector('#personal-event-form'))return;
 const a={accept:document.querySelector('#special-accept')?.value==='yes',relate:document.querySelector('#special-relate')?.value==='yes'},decline=document.querySelector('#special-decline'),accepted=document.querySelector('#special-accept-options'),relation=document.querySelector('#special-relation');
 if(decline)decline.hidden=a.accept;if(accepted)accepted.hidden=!a.accept;if(relation)relation.hidden=!a.relate;
 const button=document.querySelector('#event-submit'),preview=document.querySelector('#personal-preview');
 try{specialEventPreview(s,s.flow.eventResolution,readSpecialPersonalEvent());preview.textContent='';button.disabled=false;}catch(error){preview.textContent=error.message;button.disabled=true;}
}
