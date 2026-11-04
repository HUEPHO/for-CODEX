// These are target fields rendered by the existing action/event forms. Their
// options remain the authority for legality; this adapter never derives targets.
const TARGETS = Object.freeze({
  'basic-growth': {kind:'growth',heading:'选择发展牌'},
  'basic-country': {kind:'country',heading:'选择国家'},
  'open-country': {kind:'country',heading:'选择第二个国家'},
  'sequence-ally': {kind:'country',heading:'重整盟国'},
  'sequence-exhaust-ally': {kind:'country',heading:'横置盟国'},
  'sequence-foreign-country': {kind:'country',heading:'选择投资国家'},
  'growth-ally': {kind:'country',heading:'选择合作盟国'},
  'personal-country': {kind:'country',heading:'选择投资盟国'},
  'economic-country': {kind:'country',heading:'选择投资盟国'},
  'agreement-country': {kind:'country',heading:'选择国家'},
  'bid-country': {kind:'country',heading:'选择投资盟国'},
});
const SELECTOR = Object.keys(TARGETS).map(id=>`select#${id}`).join(',');
const clean = value=>String(value??'').replace(/\s+/g,' ').trim();

function inactive(field){
  if(field.multiple||field.closest('[hidden], [inert], [aria-hidden="true"], dialog:not([open])'))return true;
  for(let node=field;node;node=node.parentElement){
    if(node.classList?.contains('table-native-target'))continue;
    if(node.style?.display==='none'||node.style?.visibility==='hidden')return true;
  }
  // A mode change can precede updateDomesticForm's hidden-attribute update.
  const mode=field.id==='basic-growth'&&field.closest('#basic-form')?.querySelector('#basic-domestic');
  return !!mode&&mode.value!=='growth';
}

function disabled(node){
  return !!(node.disabled||node.matches?.(':disabled')||node.getAttribute?.('aria-disabled')==='true');
}

function heading(field,fallback){
  const label=field.labels?.[0]||field.closest('label');
  const text=label&&Array.from(label.childNodes).filter(node=>node!==field&&!node.contains?.(field)).map(node=>node.textContent).join(' ');
  return clean(field.getAttribute('aria-label')||text)||fallback;
}

function target(root){
  const fields=Array.from(root.querySelectorAll(SELECTOR));
  if(root.matches?.(SELECTOR))fields.unshift(root);
  const active=fields.filter(field=>!inactive(field));
  // Do not guess which target to edit when several forms or targets coexist.
  if(active.length!==1)return null;
  const field=active[0],definition=TARGETS[field.id],options=[];
  const byId=new Map();
  for(const option of Array.from(field.options)){
    const id=option.value;
    if(!id.trim()||option.hidden||option.closest('optgroup[hidden]'))continue;
    const unavailable=disabled(field)||disabled(option)||!!option.closest('optgroup[disabled]');
    const entry={id,label:clean(option.label||option.textContent)||id,...(unavailable?{disabled:true}:{})};
    const previous=byId.get(id);
    // Several physical growth cards can share one template ID. The real select
    // and reducer identify them by that value, so offer one matching table target.
    if(previous){
      if(previous.label!==entry.label||!!previous.disabled!==!!entry.disabled)return null;
      continue;
    }
    byId.set(id,entry);options.push(entry);
  }
  if(!options.length)return null;
  return {field,model:{kind:definition.kind,fieldId:field.id,options,selectedId:byId.has(field.value)?field.value:'',heading:heading(field,definition.heading)}};
}

/** Read a single active table target without changing the form or game state.
 * Option IDs are exact select values, including host:country investment values.
 */
export function tableSelectionModel(root=document){
  return target(root)?.model||null;
}

/** Select an existing enabled option and run the form's normal change handler.
 * Re-read on every click so removed options and newly disabled forms stay inert.
 */
export function selectTableTarget(id,root=document){
  if(typeof id!=='string'||!id.trim())return false;
  const selection=target(root);
  if(!selection||!selection.model.options.some(option=>option.id===id&&!option.disabled))return false;
  const {field}=selection;
  field.value=id;
  if(field.value!==id)return false;
  const ChangeEvent=field.ownerDocument?.defaultView?.Event||globalThis.Event;
  field.dispatchEvent(new ChangeEvent('change',{bubbles:true}));
  return true;
}
