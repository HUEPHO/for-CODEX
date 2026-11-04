const seenNotes=new WeakSet();
// Trade tabs retain the original inputs, readers and preview. Switching tabs
// changes only presentation; all selected transactions are settled together.
export function syncClientActionLayout(){
 const dock=document.querySelector('.client-command-dock');if(!dock)return;
 const form=dock.querySelector('#basic-form');
 dock.classList.toggle('has-action-form',!!dock.querySelector('.table-action-card,#basic-form,#sequence-panel'));
 const sequence=dock.querySelector('#sequence-panel');if(sequence){
  for(const notes of sequence.querySelectorAll(':scope>details'))if(!seenNotes.has(notes)){seenNotes.add(notes);notes.open=false;}
  sequence.classList.toggle('has-open-notes',!!sequence.querySelector(':scope>details[open]'));
 }
 if(!form?.classList.contains('client-trade-form'))return;
 const columns=[...form.querySelectorAll('[data-trade-resource]')];
 let tabs=form.querySelector('.client-trade-tabs');
 if(!tabs){
  tabs=document.createElement('nav');tabs.className='client-trade-tabs';tabs.setAttribute('aria-label','贸易资源');
  for(const column of columns){
   const button=document.createElement('button');button.type='button';button.dataset.tradeTab=column.dataset.tradeResource;button.title=column.getAttribute('aria-label');button.setAttribute('aria-label',button.title);
   button.append(column.querySelector('.resource-icon').cloneNode(true));const amount=document.createElement('small');button.append(amount);tabs.append(button);
  }
  if(form.querySelector('.client-trade-regions,.client-trade-factory')){
   const button=document.createElement('button');button.type='button';button.dataset.tradeTab='options';button.textContent='扩展';tabs.append(button);
  }
  form.querySelector('.client-trade-grid').before(tabs);form.dataset.tradeTab=columns[0].dataset.tradeResource;
 }
 const options=form.dataset.tradeTab==='options';
 form.querySelector('.client-trade-grid').classList.toggle('client-trade-tab-hidden',options);
 for(const node of form.querySelectorAll('.client-trade-regions,.client-trade-factory'))node.classList.toggle('client-trade-tab-hidden',!options);
 tabs.querySelector('[data-trade-tab="options"]')?.setAttribute('aria-pressed',String(options));
 for(const column of columns){
  const key=column.dataset.tradeResource,selected=key===form.dataset.tradeTab,button=tabs.querySelector(`[data-trade-tab="${key}"]`);
  column.classList.toggle('is-current-resource',selected);button.setAttribute('aria-pressed',String(selected));
  const imports=[...column.querySelectorAll('[data-import-country],[data-import-player]')].reduce((n,input)=>n+Number(input.value),0);
  const exports=[...column.querySelectorAll('[data-export-key],[data-export-region-key]')].reduce((n,input)=>n+Number(input.value),0);
  button.querySelector('small').textContent=imports||exports?`${imports?'＋'+imports:''}${exports?'−'+exports:''}`:'';
 }
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
 const page=event.target.closest('[data-allocation-page]');if(page){const allocation=page.closest('.client-trade-allocation');allocation.dataset.page=Number(allocation.dataset.page)+Number(page.dataset.allocationPage);syncAllocation(allocation);return;}
 const button=event.target.closest('[data-trade-tab]');if(!button)return;
 button.closest('.client-trade-form').dataset.tradeTab=button.dataset.tradeTab;syncClientActionLayout();
});
document.addEventListener('toggle',event=>{
 const notes=event.target;if(!notes.matches('#sequence-panel>details'))return;
 const sequence=notes.parentElement;
 if(notes.open)for(const other of sequence.querySelectorAll(':scope>details'))if(other!==notes)other.open=false;
 sequence.classList.toggle('has-open-notes',!!sequence.querySelector(':scope>details[open]'));
},true);
