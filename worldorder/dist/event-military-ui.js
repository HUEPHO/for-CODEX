import {renderArmyContribution,readArmyContribution} from './army-contribution-ui.js';
import {renderArmyDeployment,readDeploymentMoves} from './army-deployment-ui.js';
import {militaryCondition,resolveMilitary} from './event-military.js';
import {REGIONS} from './game-constants.js';
export function renderMilitaryEvent(s,q,cards={}){
 const model=militaryCondition(s,q);
 const cost=Object.entries(model.cost).filter(([,n])=>n).map(([key,n])=>n+({money:'资金',services:'服务',diplomacy:'外交'}[key])).join('、');
 let body=cost?`<p>本次费用：${cost}。</p>`:'';
 if(model.upgrade&&model.production.full)body+='<p>军队产能已满。</p>';
 if(model.produce)body+=`<label>生产军队<input id="military-quantity" type="number" min="0" max="${model.production.limit}" value="0"></label>`;
 body+=`<label>移动目的地<select id="military-destination">${model.destinations.map(id=>`<option value="${id}">${REGIONS[id]}</option>`).join('')}</select></label><p>${model.minMoves===model.maxMoves?'必须移动'+model.minMoves:'可移动至多'+model.maxMoves}支军队。</p>`;
 body+=!model.eventTransfer?renderArmyDeployment(s,{id:'event-deployment',owner:q.owner,maxMoves:model.maxMoves,destinations:model.destinations,normalDestinations:model.destinations,production:model.produce?'#military-quantity':''}):renderArmyContribution(s,{id:'military-event-armies',owner:q.owner,max:model.maxMoves,production:model.produce?'#military-quantity':''});
 if(model.influence)body+='<label>新增影响力位置<select id="military-slot"><option value="permanent">永久槽</option><option value="temporary">临时槽</option></select></label>';
 return `<div id="personal-event-form"><label>执行提议<select id="military-accept"><option value="no">放弃可选效果</option><option value="yes">执行并支付费用</option></select></label><div id="military-options">${body}</div><p id="personal-preview" aria-live="polite"></p></div>`;
}
export function readMilitaryEvent(){
 return {deploymentMoves:readDeploymentMoves(document.querySelector('#event-deployment')),accept:document.querySelector('#military-accept')?.value==='yes',quantity:Number(document.querySelector('#military-quantity')?.value||0),destination:document.querySelector('#military-destination')?.value,slot:document.querySelector('#military-slot')?.value,moves:document.querySelector('#military-accept')?.value==='yes'?readArmyContribution(document.querySelector('#military-event-armies')):{}};
}
export function updateMilitaryEvent(s){
 const q=s.flow.eventResolution,options=document.querySelector('#military-options');
 if(options)options.hidden=document.querySelector('#military-accept')?.value!=='yes';
 const button=document.querySelector('#event-submit'),preview=document.querySelector('#personal-preview');
 try{resolveMilitary(s,q,readMilitaryEvent(),{preview:true});preview.textContent='';button.disabled=false;}catch(error){preview.textContent=error.message;button.disabled=true;}
}
