import {adjustTradeInput} from './client-trade-ui.js';
import {powerFlagPath} from './power-identity.js';

const elements=new WeakMap();
function node(tag,className,text){const el=document.createElement(tag);el.className=className;if(text!==undefined)el.textContent=text;return el;}
function label(text){return node('span','client-trade-matrix-label',text);}
function counter(input,sign){
 const button=node('button','client-trade-counter');button.type='button';button.dataset.tradeCounter=input.id;button.dataset.sign=sign;
 button.setAttribute('role','spinbutton');button.setAttribute('aria-valuemin','0');
 if(input.dataset.importPlayer){button.classList.add('has-flag');button.style.setProperty('--trade-flag',`url('${powerFlagPath(input.dataset.importPlayer)}')`);}
 return button;
}
function createMatrix(form){
 const source=form.querySelector('.client-trade-grid');source.classList.add('client-trade-grid-source');
 const matrix=node('div','client-trade-matrix');matrix.setAttribute('aria-label','贸易数量，左键增加，右键减少');
 const labels={players:label('玩家进口'),allies:label('盟国进口'),stock:label('库存'),exports:label('出口')};matrix.append(...Object.values(labels));
 const allocations=node('div','client-trade-matrix-allocations');
 const columns=[...source.querySelectorAll('[data-trade-resource]')].map((column,index)=>{
  const key=column.dataset.tradeResource,stock=column.dataset.tradeStock;
  const tab=node('button','client-trade-stock');tab.type='button';tab.dataset.tradeClear=key;tab.setAttribute('aria-label',column.getAttribute('aria-label')+'，库存 '+stock);
  tab.append(column.querySelector('.resource-icon').cloneNode(true),node('small','',stock));matrix.append(tab);
  const partnerInputs=[...column.querySelectorAll('[data-import-player]')],partners=partnerInputs.map(input=>counter(input,'+'));
  const importInput=column.querySelector('[data-import-country]'),ally=importInput?counter(importInput,'+'):node('span','client-trade-unavailable','—');
  const exportInput=column.querySelector('[data-export-key]'),allocation=column.querySelector('.client-trade-allocation');
  let exports;
  if(exportInput)exports=counter(exportInput,'−');
  else{exports=node('button','client-trade-counter client-trade-allocation-toggle');exports.type='button';exports.dataset.tradeAllocation=key;exports.title='按地区分配出口数量';allocation.dataset.matrixResource=key;allocations.append(allocation);}
  const empty=node('span','client-trade-unavailable','—');matrix.append(...partners,empty,ally,exports);
  for(const control of [tab,...partners,empty,ally,exports])control.style.gridColumn=String(index+2);
  const frame=node('div','client-trade-frame');frame.style.gridColumn=String(index+2);frame.setAttribute('aria-hidden','true');matrix.prepend(frame);
  return {key,column,tab,partners,empty,ally,exports,allocation,frame,mode:null};
 });
 source.before(matrix);source.after(allocations);
 let options;
 if(form.querySelector('.client-trade-regions,.client-trade-factory')){
  options=node('button','client-trade-options-toggle','扩展');options.type='button';options.dataset.tradeTab='options';form.querySelector('.client-trade-heading').append(options);
 }
 form.dataset.tradeTab='resources';
 const result={matrix,labels,columns,options};elements.set(form,result);return result;
}

// One compact view over the original form inputs. Capacity, validity and
// settlement still come from the shared trade preview and authoritative action.
export function syncClientTradeMatrix(form){
 const {matrix,labels,columns,options}=elements.get(form)||createMatrix(form);
 const optionView=form.dataset.tradeTab==='options';
 const selected=columns.find(column=>column.key===form.dataset.tradeAllocationKey);
 const allocationOpen=!!selected?.allocation?.open&&!optionView;
 const partnerRows=Math.max(1,...columns.map(column=>column.partners.length)),stockRow=allocationOpen||optionView?1:partnerRows+2;
 matrix.style.gridTemplateRows=allocationOpen||optionView?'var(--trade-stock-height,48px)':`repeat(${partnerRows+1},var(--trade-row-height,28px)) var(--trade-stock-height,48px) var(--trade-row-height,28px)`;
 labels.players.style.gridRow=`1 / span ${partnerRows}`;labels.allies.style.gridRow=String(partnerRows+1);labels.stock.style.gridRow=String(stockRow);labels.exports.style.gridRow=String(partnerRows+3);
 for(const [key,el] of Object.entries(labels))el.hidden=key!=='stock'&&(allocationOpen||optionView);
 for(const column of columns){
  const show=!optionView&&!allocationOpen;
  column.tab.style.gridRow=String(stockRow);column.tab.setAttribute('aria-pressed',String(!!column.mode));
  column.tab.disabled=tradeInputs(form,column.key).every(input=>input.disabled);
  column.tab.title=column.column.getAttribute('aria-label')+'，库存 '+column.column.dataset.tradeStock+(column.mode?'。点击取消本项贸易并清空数量。':'');
  column.frame.hidden=!column.mode||!show;
  column.frame.style.gridRow=column.mode==='import'?`${column.partners.length?1:partnerRows+1} / ${stockRow+1}`:`${stockRow} / ${partnerRows+4}`;
  column.frame.dataset.direction=column.mode||'';
  column.partners.forEach((button,index)=>{button.style.gridRow=String(index+1);button.hidden=!show;});
  column.empty.hidden=!show||column.partners.length>0;column.empty.style.gridRow='1';
  column.ally.style.gridRow=String(partnerRows+1);column.ally.hidden=!show;
  column.exports.style.gridRow=String(partnerRows+3);column.exports.hidden=!show;
  if(column.allocation){
   column.allocation.hidden=column!==selected||optionView;
   const total=[...column.allocation.querySelectorAll('[data-export-region-key]')].reduce((n,input)=>n+Number(input.value),0);
   const maximum=column.column.querySelector('[data-trade-export-max]').textContent;
   column.exports.textContent=`−${total}/${maximum}`;column.exports.setAttribute('aria-label',`分配${column.column.getAttribute('aria-label')}出口地区，已选 ${total}，上限 ${maximum}`);
   column.exports.disabled=[...column.allocation.querySelectorAll('input')].every(input=>input.disabled);
  }
 }
 for(const button of matrix.querySelectorAll('[data-trade-counter]')){
  const input=form.querySelector('#'+button.dataset.tradeCounter),value=Number(input.value),max=Number(input.max);
  button.textContent=button.dataset.sign+value+'/'+max;
  const name=input.getAttribute('aria-label');
  button.title=`${name}：${value} / ${max}。左键增加，右键减少；↑ / ↓ 也可调整。`;
  button.setAttribute('aria-label',`${name}，已选 ${value}，上限 ${max}`);button.setAttribute('aria-valuenow',String(value));button.setAttribute('aria-valuemax',String(max));
  button.disabled=input.disabled||(max===0&&value===0);button.classList.toggle('is-invalid',value>max);button.setAttribute('aria-invalid',String(value>max));
 }
 for(const item of form.querySelectorAll('.client-trade-regions,.client-trade-factory'))item.classList.toggle('client-trade-tab-hidden',!optionView);
 options?.setAttribute('aria-pressed',String(optionView));
}

export function handleTradeCounter(event,delta){
 const button=event.target.closest('[data-trade-counter]');if(!button)return false;
 event.preventDefault();if(button.disabled)return true;
 const input=button.closest('.client-trade-form').querySelector('#'+button.dataset.tradeCounter);
 adjustTradeInput(input,delta);return true;
}

function tradeInputs(form,key){return [...form.querySelectorAll(`[data-import-country="${key}"],[data-import-key="${key}"],[data-export-key="${key}"],[data-export-region-key="${key}"]`)];}
function setDirection(form,key,mode){
 const column=elements.get(form)?.columns.find(column=>column.key===key);if(!column)return;
 column.mode=mode;
 for(const input of tradeInputs(form,key)){
  const importing=input.hasAttribute('data-import-country')||input.hasAttribute('data-import-key');
  if(mode===null||importing!==(mode==='import'))input.value='0';
 }
}
function notifyInput(form,key){tradeInputs(form,key)[0].dispatchEvent(new Event('input',{bubbles:true}));}

// Capture input edits before the existing preview reads the form. Choosing a
// direction clears only the opposite pending direction for the same resource.
export function syncTradeDirection(event){
 const input=event.target,form=input.closest('.client-trade-form');if(!form||!elements.has(form)||Number(input.value)<=0)return;
 const key=input.dataset.importCountry??input.dataset.importKey??input.dataset.exportKey??input.dataset.exportRegionKey;
 if(key!==undefined)setDirection(form,key,input.hasAttribute('data-import-country')||input.hasAttribute('data-import-key')?'import':'export');
}
export function clearTradeResource(button){
 if(button.disabled)return;
 const form=button.closest('.client-trade-form'),key=button.dataset.tradeClear;
 if(tradeInputs(form,key).every(input=>input.disabled))return;
 setDirection(form,key,null);notifyInput(form,key);
}
export function openTradeAllocation(button){
 if(button.disabled)return;
 const form=button.closest('.client-trade-form'),key=button.dataset.tradeAllocation;
 if(tradeInputs(form,key).every(input=>input.disabled))return;
 form.dataset.tradeAllocationKey=key;form.dataset.tradeTab='resources';setDirection(form,key,'export');
 form.querySelector(`[data-matrix-resource="${key}"]`).open=true;notifyInput(form,key);
}
