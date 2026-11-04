// These buttons are adapters for existing selects. Their options, ordering,
// permissions and change handlers remain the only source of action choices.
const choiceSelector='#basic-domestic,#basic-branch,[data-sequence-choice],#sequence-funding,#sequence-resource';
const coverSelector='#sequence-cover,#extra-asset-cover';
const groups=new WeakMap(),sources=new WeakMap();
const covers=new WeakMap();
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function disabled(node){return !!(node.disabled||node.matches?.(':disabled')||node.getAttribute?.('aria-disabled')==='true');}
function hidden(node){
 if(node.closest?.('[hidden],[inert],[aria-hidden="true"],dialog:not([open])'))return true;
 for(let ancestor=node;ancestor;ancestor=ancestor.parentElement)if(ancestor.style?.display==='none'||ancestor.style?.visibility==='hidden')return true;
 return false;
}
function availableOption(option){return !option.hidden&&!option.closest?.('optgroup[hidden]');}
function optionDisabled(option){return disabled(option)||!!option.closest?.('optgroup[disabled]');}
function heading(field){
 if(field.hasAttribute('data-sequence-choice'))return '第'+(Number(field.dataset.sequenceChoice)+1)+'项行动';
 const label=field.labels?.[0]||field.closest('label');
 return clean(field.getAttribute('aria-label')||Array.from(label?.childNodes||[]).filter(node=>node!==field&&!node.classList?.contains('client-action-options')&&!node.classList?.contains('client-cover-choice')).map(node=>node.textContent).join(' '))||'选择行动';
}
function emitChange(field){
 const ChangeEvent=field.ownerDocument?.defaultView?.Event||globalThis.Event;
 field.dispatchEvent(new ChangeEvent('change',{bubbles:true}));
}
function setChoice(field,value){
 if(!field||field.isConnected===false||disabled(field)||hidden(field)||field.multiple)return false;
 const option=Array.from(field.options).find(option=>option.value===value&&availableOption(option)&&!optionDisabled(option));
 if(!option)return false;
 field.value=value;if(field.value!==value)return false;
 emitChange(field);return true;
}

/** Refresh after normal form updates and permission application. This never
 * chooses an option or dispatches a change merely because the UI rerenders. */
export function syncClientActionChoices(root=document.querySelector('#table-task-body')){
 if(!root)return;
 for(const field of root.querySelectorAll(choiceSelector)){
  let group=groups.get(field);
  if(!group||!group.isConnected){
   group=field.ownerDocument.createElement('span');group.className='client-action-options';group.setAttribute('role','group');
   groups.set(field,group);sources.set(group,field);field.insertAdjacentElement('afterend',group);field.classList.add('client-action-choice-source');field.tabIndex=-1;
  }
  const title=heading(field),options=Array.from(field.options).filter(availableOption);
  group.setAttribute('aria-label',title);group.hidden=hidden(field);
  const signature=JSON.stringify(options.map(option=>[option.value,option.label||option.textContent,optionDisabled(option)]));
  if(group.dataset.optionsSignature!==signature){
   group.innerHTML=options.map(option=>`<button type="button" class="client-action-option" data-client-action-option="${esc(option.value)}">${esc(clean(option.label||option.textContent)||option.value)}</button>`).join('');
   group.dataset.optionsSignature=signature;
  }
  for(const button of group.querySelectorAll('[data-client-action-option]')){
   const option=options.find(option=>option.value===button.dataset.clientActionOption),selected=field.value===option?.value;
   button.disabled=disabled(field)||!option||optionDisabled(option);
   button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected));
  }
 }
 for(const field of root.querySelectorAll(coverSelector)){
  let hint=covers.get(field);
  if(!hint||!hint.isConnected){
   hint=field.ownerDocument.createElement('span');hint.className='client-cover-choice';hint.setAttribute('aria-live','polite');
   covers.set(field,hint);field.insertAdjacentElement('afterend',hint);field.classList.add('client-cover-choice-source');field.tabIndex=-1;
  }
  const option=Array.from(field.options).find(option=>option.value===field.value&&availableOption(option)&&!optionDisabled(option));
  const cardName=option?clean(option.label||option.textContent)||option.value:'';
  hint.hidden=hidden(field);hint.classList.toggle('is-disabled',disabled(field));
  const copy=disabled(field)?'等待本方可操作时选择盖牌。':'点击下方手牌，选择要盖住的牌。确认使用资产时才会盖牌。';
  const content=`<span class="client-cover-instruction">${copy}</span><span class="client-cover-selected">盖放手牌：<b>${esc(cardName||'尚未选择')}</b></span>`;
  if(hint.innerHTML!==content)hint.innerHTML=content;
  hint.dataset.clientCover=field.value;
 }
}

/** Return true for our buttons so app handlers do not interpret them as another
 * action. Disabled and stale controls are consumed without changing anything. */
export function handleClientActionChoice(event){
 const button=event.target?.closest?.('[data-client-action-option]');if(!button)return false;
 const group=button.closest('.client-action-options'),field=group&&sources.get(group);if(!field)return false;
 event.preventDefault();
 if(disabled(button)||group.isConnected===false)return true;
 const root=field.closest('#table-task-body')||field.parentElement;
 setChoice(field,button.dataset.clientActionOption);
 // A branch change may replace its entire form. Resolve the live task again.
 if(root?.isConnected!==false)syncClientActionChoices(root);
 return true;
}

/** A hand click can supply an existing cover select. It is only a pending form
 * selection: the normal asset/sequence confirmation remains necessary. */
export function selectClientCover(cardId,task=document.querySelector('#table-task-body')){
 if(!task)return false;
 for(const field of task.querySelectorAll(coverSelector)){
  if(setChoice(field,cardId)){syncClientActionChoices(task);return true;}
 }
 return false;
}
