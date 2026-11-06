// The real form remains the sole source of available allies, permissions and
// checked values. This adapter only changes a pending checkbox; it never sends
// a game action or computes a discount itself.
const optionSelector='input[type="checkbox"][data-basic-exhaust]';
const cardSelector='.client-owned-cards .client-owned-ally [data-card][data-source="allies"]';
const adapted=new WeakMap();
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
function fieldName(field){const label=field.labels?.[0]?.cloneNode(true);if(label)for(const el of label.querySelectorAll('input,select,button'))el.remove();return clean(label?.textContent);}

function disabled(node){return !!(node.disabled||node.matches?.(':disabled')||node.closest?.('[aria-disabled="true"]'));}
function hidden(node){
 if(node.isConnected===false||node.closest?.('[hidden],[inert],[aria-hidden="true"],dialog:not([open])'))return true;
 for(let parent=node;parent;parent=parent.parentElement)if(parent.style?.display==='none'||parent.style?.visibility==='hidden')return true;
 return false;
}
function selection(task){
 const group=task?.querySelector('#basic-form #basic-discounts');
 if(!group||hidden(group))return null;
 const options=[...group.querySelectorAll(optionSelector)].filter(field=>!hidden(field)),byId=new Map();
 for(const field of options){
  const id=field.dataset.basicExhaust;
  if(!id||byId.has(id))return null;
  byId.set(id,field);
 }
 return {group,options,byId};
}
function restore(button){
 const previous=adapted.get(button);if(!previous)return;
 button.classList.remove('client-ally-discount-eligible','client-ally-discount-selected','client-ally-discount-disabled');
 button.removeAttribute('data-client-ally-discount');
 for(const name of ['aria-label','title']){
  if(previous[name]===null)button.removeAttribute(name);else button.setAttribute(name,previous[name]);
 }
 // Another original target adapter may already have refreshed this attribute.
 if(!button.classList.contains('table-target-eligible')){
  if(previous['aria-pressed']===null)button.removeAttribute('aria-pressed');else button.setAttribute('aria-pressed',previous['aria-pressed']);
 }
 button.querySelector('.client-ally-discount-mark')?.remove();
 adapted.delete(button);
}

/** Call after the usual form refresh and room permission application. No
 * selection, state mutation or change event happens during synchronization. */
export function syncClientAllySelection(task=document.querySelector('#table-task-body'),surface=document){
 if(!surface)return;
 const model=selection(task),cards=[...surface.querySelectorAll(cardSelector)],mapped=new Set();
 for(const button of surface.querySelectorAll('[data-client-ally-discount]')){
  if(!cards.includes(button)||!model?.byId.has(button.dataset.card))restore(button);
 }
 for(const group of surface.querySelectorAll('.client-ally-discount-source')){
  if(group!==model?.group){group.classList.remove('client-ally-discount-source');group.querySelector('.client-ally-discount-hint')?.remove();for(const label of group.querySelectorAll('.client-ally-discount-adapted'))label.classList.remove('client-ally-discount-adapted');}
 }
 if(!model)return;
 for(const button of cards){
  const field=model.byId.get(button.dataset.card);if(!field||hidden(button)){restore(button);continue;}
  mapped.add(field);
  let previous=adapted.get(button);
  if(!previous){previous=Object.fromEntries(['aria-label','aria-pressed','title'].map(name=>[name,button.getAttribute(name)]));adapted.set(button,previous);}
  const blocked=disabled(field)||disabled(button),selected=field.checked;
  button.dataset.clientAllyDiscount=field.dataset.basicExhaust;
  button.classList.toggle('client-ally-discount-eligible',!blocked);
  button.classList.toggle('client-ally-discount-selected',selected);
  button.classList.toggle('client-ally-discount-disabled',blocked);
  button.setAttribute('aria-pressed',String(selected));
  const name=fieldName(field)||previous['aria-label']||'盟国';
  const hint=blocked?'当前不可更改':selected?'已选减费，右键取消；确认后才消耗':'左键选作减费，右键取消；确认后才消耗';
  button.setAttribute('aria-label',name+' · '+hint);button.setAttribute('title',name+' · '+hint);
  let mark=button.querySelector('.client-ally-discount-mark');
  if(!mark){mark=button.ownerDocument.createElement('span');mark.className='client-ally-discount-mark';mark.setAttribute('aria-hidden','true');button.append(mark);}
  mark.textContent=selected?'✓ 待消耗减费':blocked?'暂不可选择':'＋ 选择减费';
 }
 const {group,options}=model;
 group.classList.add('client-ally-discount-source');
 // Only hide a redundant source label when its actual ally exists on the
 // table. An unusual/older layout keeps the original checkbox as fallback.
 for(const field of options)field.closest('label')?.classList.toggle('client-ally-discount-adapted',mapped.has(field));
 let hint=group.querySelector('.client-ally-discount-hint');
 if(!hint){hint=group.ownerDocument.createElement('span');hint.className='client-ally-discount-hint';hint.setAttribute('aria-live','polite');group.append(hint);}
 const selected=options.filter(field=>field.checked),names=selected.map(field=>fieldName(field)||field.dataset.basicExhaust);
 const available=options.some(field=>!disabled(field));
 hint.textContent=options.length?(!available?'当前不能更改盟国减费。':mapped.size?'左键下方盟国选择减费，右键取消；确认后才消耗。':'可选择当地盟国减费；确认后才消耗。')+(names.length?' 已选：'+names.join('、')+'。':' 尚未选择。'):'当地没有可消耗的盟国。';
}

/** Run before generic card click/inspection handlers. A recognized disabled or
 * stale selection is consumed without changing the source or opening a viewer. */
export function handleClientAllySelection(event,task=document.querySelector('#table-task-body'),surface=document){
 const button=event.target?.closest?.(cardSelector);if(!button)return false;
 const model=selection(task),field=model?.byId.get(button.dataset.card);
 if(!field){if(button.isConnected===false&&adapted.has(button)){event.preventDefault();return true;}return false;}
 event.preventDefault();
 if(button.isConnected===false||!surface?.contains(button)||disabled(button)||hidden(button)||disabled(field)||hidden(field))return true;
 const selected=event.type!=='contextmenu';if(field.checked===selected)return true;field.checked=selected;
 const ChangeEvent=field.ownerDocument.defaultView.Event;
 field.dispatchEvent(new ChangeEvent('change',{bubbles:true}));
 // The existing change handler can replace the entire form/selection context.
 const liveTask=task?.isConnected===false?surface.querySelector('#table-task-body'):task;
 syncClientAllySelection(liveTask,surface);
 return true;
}
