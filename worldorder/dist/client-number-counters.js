// A visual adapter for the existing inputs. Readers, limits and permissions stay
// on those inputs, and changing a counter emits their normal form events.
const controls=new WeakMap(),sources=new WeakMap();
const selector='input[type="number"],select';
const isQuantitySelect=field=>field.id==='sequence-funding'||field.tagName==='SELECT'&&field.options.length>0&&[...field.options].every(o=>/^\d+(?:\.\d+)?$/.test(o.value)&&/^\d+(?:\.\d+)?$/.test(o.textContent.trim()));
const eligible=field=>!field.hidden&&!field.closest('.client-trade-grid')&&(field.tagName==='INPUT'||isQuantitySelect(field));
const disabled=field=>field.matches(':disabled')||field.readOnly||!!field.closest('[inert]');
const numberValue=field=>field.id==='sequence-funding'?String(Number(field.value)*10):field.value;
function label(field){
 const own=field.getAttribute('aria-label');if(own)return own;
 const node=field.labels?.[0]||field.closest('label');if(!node)return '数量';
 const copy=node.cloneNode(true);for(const n of copy.querySelectorAll('input,select,button'))n.remove();
 for(const icon of copy.querySelectorAll('.resource-icon'))icon.replaceWith(icon.getAttribute('aria-label')||'');
 return copy.textContent.replace(/\s+/g,' ').trim()||'数量';
}
function attribute(node,name,value){if(value===null){if(node.hasAttribute(name))node.removeAttribute(name);}else if(node.getAttribute(name)!==String(value))node.setAttribute(name,String(value));}
function refresh(field,button){
 const text=numberValue(field)||'—';if(button.textContent!==text)button.textContent=text;
 const blocked=disabled(field);if(button.disabled!==blocked)button.disabled=blocked;
 if(button.hidden!==field.hidden)button.hidden=field.hidden;
 const selected=field.value!==''&&Number(field.value)!==0;
 if(button.classList.contains('is-selected')!==selected)button.classList.toggle('is-selected',selected);
 let min=field.min||null,max=field.max||null;
 if(field.tagName==='SELECT'){const choices=[...field.options].filter(o=>!o.disabled&&!o.hidden);min=choices[0]?.value??null;max=choices.at(-1)?.value??null;if(field.id==='sequence-funding'){min=Number(min)*10;max=Number(max)*10;}}
 attribute(button,'aria-valuemin',min);attribute(button,'aria-valuemax',max);
 attribute(button,'aria-valuenow',field.value===''?null:numberValue(field));
 attribute(button,'aria-valuetext',field.value===''?'未填写':field.id==='sequence-funding'?numberValue(field)+'资金':numberValue(field));
}
export function syncNumberCounters(root=document.body){
 for(const field of root.querySelectorAll(selector)){
  let button=controls.get(field);
  if(!button&&!eligible(field))continue;
  if(!button||!button.isConnected){
   button=field.ownerDocument.createElement('button');button.type='button';button.className='client-number-counter';button.setAttribute('role','spinbutton');button.setAttribute('data-number-counter','');
   button.setAttribute('aria-label',label(field));button.title='左键增加，右键减少；↑ / ↓ 也可调整';if(field.id)button.dataset.numberFor=field.id;
   controls.set(field,button);sources.set(button,field);field.insertAdjacentElement('afterend',button);field.classList.add('client-number-source');field.tabIndex=-1;
  }
  refresh(field,button);
 }
 for(const button of root.querySelectorAll('[data-number-counter]'))if(!sources.get(button)?.isConnected)button.remove();
}
function emit(field){
 field.dispatchEvent(new Event('input',{bubbles:true}));
 field.dispatchEvent(new Event('change',{bubbles:true}));
}
export function handleNumberCounter(event,direction){
 const button=event.target.closest('[data-number-counter]');if(!button)return false;
 event.preventDefault();const field=sources.get(button);if(!field?.isConnected||disabled(field))return true;
 const previous=field.value;
 if(field.tagName==='SELECT'){
  const options=[...field.options].filter(o=>!o.disabled&&!o.hidden),index=options.findIndex(o=>o.value===field.value),next=Math.max(0,Math.min(options.length-1,index+direction));
  if(options[next])field.value=options[next].value;
 }else if(direction>0)field.stepUp();else field.stepDown();
 if(field.value!==previous)emit(field);
 if(field.isConnected)refresh(field,button);
 return true;
}
export function installNumberCounters(root=document.body){
 const sync=()=>{observer.disconnect();syncNumberCounters(root);observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['min','max','step','disabled','readonly','hidden','inert','value']});};
 const observer=new MutationObserver(sync);
 root.addEventListener('click',event=>handleNumberCounter(event,1));
 root.addEventListener('contextmenu',event=>handleNumberCounter(event,-1));
 root.addEventListener('keydown',event=>{
  if(['ArrowUp','ArrowDown','ArrowRight','ArrowLeft'].includes(event.key)){handleNumberCounter(event,['ArrowUp','ArrowRight'].includes(event.key)?1:-1);return;}
  const button=event.target.closest('[data-number-counter]');if(!button)return;const field=sources.get(button);if(disabled(field))return;
  if(['Backspace','Delete'].includes(event.key)&&field.tagName==='INPUT'&&!field.required){event.preventDefault();field.value='';emit(field);refresh(field,button);}
 });
 root.addEventListener('input',()=>queueMicrotask(sync));
 root.addEventListener('change',()=>queueMicrotask(sync));
 sync();
 return {sync};
}
