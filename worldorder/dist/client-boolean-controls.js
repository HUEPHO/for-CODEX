// Keep the original fields as the source of values, limits and permissions.
const controls=new WeakMap(),sources=new WeakMap();
const blocked=field=>field.matches(':disabled')||field.readOnly||!!field.closest('[inert]');
function values(field){
 if(field.type==='checkbox')return {yes:true,no:false};
 const options=[...field.options].filter(o=>o.value!=='');
 for(const [yes,no] of [['yes','no'],['true','false']])if(options.length===2&&options.some(o=>o.value===yes)&&options.some(o=>o.value===no))return {yes,no};
 return null;
}
const state=(field,pair)=>field.type==='checkbox'?field.checked:field.value===pair.yes?true:field.value===pair.no?false:null;
function label(field){const copy=(field.labels?.[0]||field.closest('label'))?.cloneNode(true);if(copy)for(const child of copy.querySelectorAll('input,select,button'))child.remove();const visible=copy?.textContent.trim();return {text:field.getAttribute('aria-label')||visible||'选择',visible:!!visible};}
function refresh(field,button){
 const current=state(field,values(field)),text=button.hasAttribute('data-boolean-labelled')?'':current===null?'—':current?(field.dataset.booleanOn||'是'):(field.dataset.booleanOff||'否');
 if(button.textContent!==text)button.textContent=text;
 const disabled=blocked(field);if(button.disabled!==disabled)button.disabled=disabled;if(button.hidden!==field.hidden)button.hidden=field.hidden;button.classList.toggle('is-selected',current===true);
 const checked=current===null?'mixed':String(current);if(button.getAttribute('aria-checked')!==checked)button.setAttribute('aria-checked',checked);
}
export function syncBooleanControls(root=document.body){
 for(const field of root.querySelectorAll('input[type="checkbox"],select')){
  let button=controls.get(field);if(!button&&(field.hidden||!values(field)))continue;
  if(!button?.isConnected){
   const caption=label(field);
   button=document.createElement('button');button.type='button';button.className='client-boolean-control';button.dataset.booleanControl='';button.setAttribute('role','checkbox');button.setAttribute('aria-label',caption.text);button.title='左键选择，右键取消；← / → 也可调整';
   if(caption.visible)button.dataset.booleanLabelled='';
   if(field.id)button.dataset.booleanFor=field.id;
   sources.set(button,field);controls.set(field,button);field.after(button);field.classList.add('client-boolean-source');field.tabIndex=-1;
  }
  refresh(field,button);
 }
 for(const button of root.querySelectorAll('[data-boolean-control]'))if(!sources.get(button)?.isConnected)button.remove();
}
export function handleBooleanControl(event,enabled){
 if(event.target.matches('.client-boolean-source'))return false;
 let button=event.target.closest('[data-boolean-control]'),field=button&&sources.get(button);
 if(!field&&!event.target.closest('button,a')){field=event.target.closest('label')?.querySelector('.client-boolean-source');button=field&&controls.get(field);}
 if(!field)return false;
 event.preventDefault();event.stopPropagation();if(blocked(field)||button.disabled)return true;
 const pair=values(field),option=field.tagName==='SELECT'?[...field.options].find(o=>o.value===(enabled?pair.yes:pair.no)):null;
 if(option&&(option.disabled||option.hidden)||state(field,pair)===enabled)return true;
 if(field.type==='checkbox')field.checked=enabled;else field.value=enabled?pair.yes:pair.no;
 field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
 if(field.isConnected)refresh(field,button);return true;
}
export function installBooleanControls(root=document.body){
 const sync=()=>{observer.disconnect();syncBooleanControls(root);observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled','readonly','hidden','inert','checked','open']});};
 const observer=new MutationObserver(sync);
 root.addEventListener('click',event=>handleBooleanControl(event,true),true);
 root.addEventListener('contextmenu',event=>handleBooleanControl(event,false),true);
 root.addEventListener('keydown',event=>{if(event.target.matches('[data-boolean-control]')&&['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' '].includes(event.key))handleBooleanControl(event,['ArrowRight','ArrowUp',' '].includes(event.key));},true);
 root.addEventListener('input',()=>queueMicrotask(sync));root.addEventListener('change',()=>queueMicrotask(sync));sync();
}
