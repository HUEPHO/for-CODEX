import {AREAS} from './world.js';
import {RESOURCE_LABELS} from './economy.js';
import {allocateRegionalExports} from './regional-trade.js';

export function renderRegionalTradeChoice(card){
 const bonus=card.regionalInfluence;if(!bonus)return '';
 const requirement=bonus.minimumRevenue?'出口收入至少'+bonus.minimumRevenue+'资金':Object.entries(bonus.requirements).map(([key,n])=>'出口'+n+RESOURCE_LABELS[key]).join('、');
 return `<section class="regional-trade-choice" hidden><header><b>选择奖励地区</b><button type="button" data-regional-back>← 修改贸易</button></header><p>${requirement}</p><div class="regional-trade-destinations">${(bonus.regions||Object.keys(AREAS)).map(region=>`<label><input type="checkbox" data-trade-reward-region="${region}"><span>${AREAS[region].name}</span></label>`).join('')}</div><button type="button" data-regional-skip>仅结算贸易，不领取地区奖励</button></section>`;
}
export function readRegionalTradeChoice(){
 const form=document.querySelector('[data-regional-trade]');
 return form?{rewardRegions:form.dataset.regionalStage==='regions'?[...form.querySelectorAll('[data-trade-reward-region]:checked')].map(input=>input.dataset.tradeRewardRegion):[]}:{};
}
export function updateRegionalTradeForm(s,card,action,capacity){
 const form=document.querySelector('[data-regional-trade]');if(!form)return;
 for(const input of form.querySelectorAll('[data-trade-reward-region]')){
  let issue='';try{allocateRegionalExports(action.exports,capacity,card.regionalInfluence,[input.dataset.tradeRewardRegion]);}catch(error){issue=error.message;}
  input.disabled=!input.checked&&!!issue;input.closest('label').title=issue;
 }
 syncRegionalTradeLayout(form);
}
export function syncRegionalTradeLayout(form){
 if(!form.hasAttribute('data-regional-trade'))return;
 const choosing=form.dataset.regionalStage==='regions',commit=form.querySelector('#commit-basic'),next=form.querySelector('[data-regional-next]');
 const visibility=[[form.querySelector('.client-trade-content'),choosing],[form.querySelector('.regional-trade-choice'),!choosing],[next,choosing],[commit,!choosing]];
 for(const [element,hidden] of visibility)if(element.hidden!==hidden)element.hidden=hidden;
 if(!choosing&&next.disabled!==commit.disabled)next.disabled=commit.disabled;
 if(choosing){if(commit.textContent!=='结算交易并继续')commit.textContent='结算交易并继续';if(!commit.disabled&&!form.querySelector('[data-trade-reward-region]:checked')&&form.dataset.regionalSkip!=='true')commit.disabled=true;}
}
if(typeof document!=='undefined')document.addEventListener('click',event=>{
 const button=event.target.closest('[data-regional-next],[data-regional-back],[data-regional-skip]');if(!button||button.disabled)return;
 const form=button.closest('[data-regional-trade]');
 if(button.hasAttribute('data-regional-skip')){for(const input of form.querySelectorAll('[data-trade-reward-region]'))input.checked=false;form.dataset.regionalSkip='true';}
 else{form.dataset.regionalStage=button.hasAttribute('data-regional-next')?'regions':'trade';delete form.dataset.regionalSkip;}
 form.querySelector('[data-export-key]').dispatchEvent(new Event('input',{bubbles:true}));syncRegionalTradeLayout(form);
 if(button.hasAttribute('data-regional-skip'))form.querySelector('#commit-basic').click();
});
