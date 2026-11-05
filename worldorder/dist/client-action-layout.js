import {syncClientTradeMatrix,handleTradeCounter,syncTradeDirection,clearTradeResource,openTradeAllocation} from './client-trade-matrix.js';
import {handleSmartPayment} from './smart-power-ui.js';
import {syncRegionalTradeLayout} from './regional-trade-ui.js';
const seenNotes=new WeakSet();
// Compact trade controls retain the original inputs, reader and preview.
// Opening extra options preserves all resource selections for one settlement.
export function syncClientActionLayout(){
 const dock=document.querySelector('.client-command-dock');if(!dock)return;
 const form=dock.querySelector('#basic-form');
 dock.classList.toggle('has-action-form',!!dock.querySelector('.table-action-card,#basic-form,#sequence-panel,#event-submit,#personal-event-form,#resolve-threat,.research-allies,.army-deployment,.industry-upgrades'));
 const sequence=dock.querySelector('#sequence-panel');if(sequence){
  for(const notes of sequence.querySelectorAll(':scope>details'))if(!seenNotes.has(notes)){seenNotes.add(notes);notes.open=false;}
  sequence.classList.toggle('has-open-notes',!!sequence.querySelector(':scope>details[open]'));
 }
 if(!form?.classList.contains('client-trade-form'))return;
 syncClientTradeMatrix(form);
 syncRegionalTradeLayout(form);
 for(const allocation of form.querySelectorAll('.client-trade-allocation'))syncAllocation(allocation);
}

function syncAllocation(allocation){
 const rows=[...allocation.querySelectorAll('[data-export-region-row]')].filter(row=>!row.hidden),pages=Math.ceil(rows.length/3);
 let pager=allocation.querySelector('.client-allocation-pages');
 if(!pager&&pages>1){pager=document.createElement('nav');pager.className='client-allocation-pages';pager.setAttribute('aria-label','出口地区分页');allocation.append(pager);}
 if(!pager)return;
 const page=Math.min(Number(allocation.dataset.page||0),Math.max(0,pages-1));allocation.dataset.page=page;
 pager.hidden=pages<=1;pager.innerHTML=`<button type="button" data-allocation-page="-1" aria-label="上一页出口地区" ${page===0?'disabled':''}>‹</button><span>${page+1} / ${pages}</span><button type="button" data-allocation-page="1" aria-label="下一页出口地区" ${page>=pages-1?'disabled':''}>›</button>`;
 rows.forEach((row,i)=>row.classList.toggle('client-allocation-page-hidden',Math.floor(i/3)!==page));
}

document.addEventListener('click',event=>{
 if(handleSmartPayment(event,1))return;
 if(handleTradeCounter(event,1))return;
 const clear=event.target.closest('[data-trade-clear]');if(clear){clearTradeResource(clear);return;}
 const target=event.target.closest('[data-trade-allocation]');if(target){
  openTradeAllocation(target);syncClientActionLayout();return;
 }
 const page=event.target.closest('[data-allocation-page]');if(page){const allocation=page.closest('.client-trade-allocation');allocation.dataset.page=Number(allocation.dataset.page)+Number(page.dataset.allocationPage);syncAllocation(allocation);return;}
 const button=event.target.closest('button[data-trade-tab]');if(!button)return;
 const form=button.closest('.client-trade-form');form.dataset.tradeTab=form.dataset.tradeTab==='options'?'resources':'options';syncClientActionLayout();
});
document.addEventListener('input',syncTradeDirection,true);
document.addEventListener('contextmenu',event=>{
 if(document.body.classList.contains('game-client'))event.preventDefault();
 handleTradeCounter(event,-1);
 handleSmartPayment(event,-1);
});
document.addEventListener('keydown',event=>{
 if(['ArrowUp','ArrowDown'].includes(event.key))handleTradeCounter(event,event.key==='ArrowUp'?1:-1);
 if(['ArrowUp','ArrowDown'].includes(event.key))handleSmartPayment(event,event.key==='ArrowUp'?1:-1);
});
document.addEventListener('toggle',event=>{
 if(event.target.matches('.client-trade-allocation')){syncClientActionLayout();return;}
 const notes=event.target;if(!notes.matches('#sequence-panel>details'))return;
 const sequence=notes.parentElement;
 if(notes.open)for(const other of sequence.querySelectorAll(':scope>details'))if(other!==notes)other.open=false;
 sequence.classList.toggle('has-open-notes',!!sequence.querySelector(':scope>details[open]'));
},true);
