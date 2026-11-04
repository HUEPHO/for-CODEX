// Region clicks edit existing form controls. The form's options and ordinary
// change handlers remain the authority; this adapter never applies game effects.
const REGIONS=new Set(['M','E','C','N','A','S','P']);
const activeFields=new WeakMap();
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const query=(root,id)=>root.querySelector('#'+id);
const definitions={
 'basic-region':{kind:'region',heading:'介入地区'},
 'basic-move-from':{kind:'region',heading:'介入标记来源'},
 'sequence-region':{kind:'region',heading:'选择地区'},
 'sequence-swap-region':{kind:'region',heading:'交换影响力的地区'},
 'quick-from':{kind:'region',heading:'快速反应部队 · 出发地'},
 'quick-to':{kind:'region',heading:'快速反应部队 · 目的地'},
 'base-extra-from':{kind:'region',heading:'追加军队 · 出发地'},
 'military-destination':{kind:'region',heading:'移动目的地'},
 'economic-move-from':{kind:'region',heading:'介入标记来源'},
 'basic-slot':{kind:'placement',prefix:'basic'},
 'sequence-slot':{kind:'placement',prefix:'sequence'},
 'open-slot':{kind:'placement',prefix:'open'},
 'personal-slot':{kind:'placement',prefix:'personal'},
 'economic-slot':{kind:'placement',prefix:'economic'},
 'agreement-slot':{kind:'placement',prefix:'agreement'},
 'bid-slot':{kind:'placement',prefix:'bid'},
 'military-slot':{kind:'placement',regionField:'military-destination'},
 'special-slot':{kind:'placement',prefix:'special'},
 'sequence-reset':{kind:'slot',combined:true,slotKind:'temporary',heading:'重置临时影响力'},
 'market-reset':{kind:'slot',combined:true,slotKind:'temporary',heading:'移动后重置临时影响力'},
 'agreement-convert':{kind:'slot',combined:true,slotKind:'temporary',heading:'转换临时影响力'},
 'sequence-reset-index':{kind:'slot',regionField:'sequence-region',slotKind:'temporary',heading:'先重置临时影响力'},
 'sequence-swap-temp':{kind:'slot',regionField:'sequence-swap-region',slotKind:'temporary',heading:'交换本方临时影响力'},
 'sequence-swap-permanent':{kind:'slot',regionField:'sequence-swap-region',optionKind:true,heading:'交换对方永久影响力'},
 'bid-convert-index':{kind:'slot',slotKind:'temporary',heading:'转换临时影响力'},
 'special-convert':{kind:'slot',slotKind:'temporary',heading:'转换临时影响力'},
};
for(const prefix of ['basic','sequence','open','personal','economic'])definitions[prefix+'-convert']={kind:'slot',prefix,slotKind:'temporary',resilience:true,heading:'区域韧性 · 转换临时影响力'};

function disabled(node){return !!(node.disabled||node.matches?.(':disabled')||node.getAttribute?.('aria-disabled')==='true');}
function inactive(field){
 if(field.multiple||field.closest('[hidden], [inert], [aria-hidden="true"], dialog:not([open])'))return true;
 for(let node=field;node;node=node.parentElement)if(node.style?.display==='none'||node.style?.visibility==='hidden')return true;
 return false;
}
function title(field,fallback){
 const label=field.labels?.[0]||field.closest('label');
 const text=label&&Array.from(label.childNodes).filter(node=>node!==field&&!node.contains?.(field)).map(node=>node.textContent).join(' ');
 return clean(field.getAttribute('aria-label')||text)||fallback||'选择影响力位置';
}
function definition(field){
 for(const [attribute,heading] of [['data-military-from','出发地'],['data-military-to','目的地'],['data-agreement-move-from','出发地'],['data-agreement-move-to','目的地']]){
  if(field.hasAttribute(attribute)){const index=field.getAttribute(attribute);return {id:attribute.slice(5)+':'+index,kind:'region',heading:`第${Number(index)+1}次移动 · ${heading}`,fixedHeading:true};}
 }
 return definitions[field.id]?{id:field.id,...definitions[field.id]}:null;
}
function regionOf(field,definition,root,context){
 if(REGIONS.has(field.dataset.regionValue))return field.dataset.regionValue;
 const prefix=definition.prefix;
 const fixed=query(root,prefix+'-slot')?.dataset.regionValue;
 if(REGIONS.has(fixed))return fixed;
 const region=query(root,definition.regionField||prefix+'-region')?.value;
 if(REGIONS.has(region))return region;
 const country=query(root,prefix==='sequence'?'sequence-foreign-country':prefix+'-country')?.value;
 if(country&&context.countryRegion){try{return context.countryRegion(country.split(':').at(-1));}catch{return null;}}
 return null;
}
function selectEntry(field,definition,root,context){
 if(inactive(field)||disabled(field))return null;
 if(field.id==='agreement-convert'&&query(root,'agreement-choice')&&query(root,'agreement-choice').value!=='convert')return null;
 if(definition.resilience){
  const timing=query(root,definition.prefix+'-resilience')?.value;
  // An after-placement conversion uses projected queue positions, which need not
  // refer to the pieces currently on the board. Keep that choice in its form.
  if(timing!=='before'||(definition.prefix==='sequence'&&query(root,'sequence-reset-index')))return null;
 }
 const region=regionOf(field,definition,root,context),options=[];
 // A pre-placement conversion changes both tracks before this placement. Mark
 // the UI context so the board does not promise a position in the old layout.
 const projected=definition.kind==='placement'&&query(root,definition.prefix+'-resilience')?.value==='before';
 for(const option of Array.from(field.options)){
  if(option.hidden||option.closest('optgroup[hidden]'))continue;
  const value=option.value,entry={value,label:clean(option.label||option.textContent)||value,selected:field.value===value,disabled:disabled(option)||!!option.closest('optgroup[disabled]')};
  if(definition.kind==='region'){
   if(value&&!REGIONS.has(value)&&value!=='reserve')continue;
   entry.region=value||null;
  }else if(definition.kind==='placement'){
   if(!REGIONS.has(region)||!['permanent','temporary'].includes(value))continue;
   Object.assign(entry,{region,kind:value,...(projected?{projected:true}:{})});
  }else{
   let targetRegion=region,index=value,kind=definition.slotKind;
   if(!value){options.push({...entry,region:null});continue;}
   if(definition.combined)[targetRegion,index]=value.split(':');
   if(definition.optionKind){kind=option.dataset.kind;index=option.dataset.index;}
   if(!REGIONS.has(targetRegion)||!['permanent','temporary','extraPermanent'].includes(kind)||!/^\d+$/.test(String(index)))continue;
   Object.assign(entry,{region:targetRegion,kind,index:Number(index)});
  }
  options.push(entry);
 }
 if(!options.some(option=>option.region))return null;
 return {ref:field,field,model:{id:definition.id,heading:definition.fixedHeading?definition.heading:title(field,definition.heading),kind:definition.kind,selectedValue:field.value,options,...(projected?{projected:true}:{})}};
}
function collect(root,context){
 const controls=Array.from(root.querySelectorAll('select'));
 if(root.matches?.('select'))controls.unshift(root);
 const entries=controls.flatMap(field=>{const d=definition(field);return d?[selectEntry(field,d,root,context)].filter(Boolean):[];});
 for(const [attribute,key,id,heading] of [['data-sequence-region','sequenceRegion','sequence-regions','选择多个地区'],['data-trade-region','tradeRegion','trade-regions','扩展贸易地区 · 每区1 SP']]){
  const boxes=Array.from(root.querySelectorAll(`input[${attribute}]`)).filter(field=>!inactive(field)&&!disabled(field));
  if(boxes.length)entries.push({ref:boxes[0],boxes,boxKey:key,model:{id,heading,kind:'regions',selectedValue:'',options:boxes.map(field=>({value:field.dataset[key],region:field.dataset[key],label:title(field,field.dataset[key]),selected:field.checked,disabled:false}))}});
 }
 return entries;
}
function selection(root,context){
 const entries=collect(root,context),reference=activeFields.get(root);
 const active=entries.find(entry=>entry.ref===reference||entry.boxes?.includes(reference))||(entries.length===1?entries[0]:null);
 return {entries,active};
}

/** All visible fields, plus a single explicitly chosen active board target.
 * A replaced form cannot inherit activation from the previous DOM element.
 * countryRegion is the existing catalogue lookup supplied by the app.
 */
export function regionSelectionModel(root=document,context={}){
 const {entries,active}=selection(root,context);
 if(!entries.length)return null;
 return {fields:entries.map(entry=>entry.model),activeFieldId:active?.model.id||null,heading:active?.model.heading||'选择要在地区面板填写的项目',kind:active?.model.kind||null,selectedValue:active?.model.selectedValue||'',options:active?.model.options||[],...(active?.model.projected?{projected:true}:{})};
}

/** Select a specific field before clicking a region; no form values change. */
export function activateRegionField(keyOrElement,root=document,context={}){
 const entries=collect(root,context),entry=entries.find(item=>typeof keyOrElement==='string'?item.model.id===keyOrElement:item.field===keyOrElement||item.boxes?.includes(keyOrElement));
 if(!entry)return false;
 activeFields.set(root,typeof keyOrElement==='string'?entry.ref:keyOrElement);
 return true;
}

/** Edit exactly one enabled form value, then invoke its normal preview handler.
 * For placement, the rules choose the permanent vacancy / temporary queue tail;
 * a board click selects the track, never an arbitrary insertion position.
 */
export function selectRegionTarget(region,{kind,index,value}={},root=document,context={}){
 const {active}=selection(root,context);if(!active)return false;
 const match=active.model.options.find(option=>!option.disabled&&(value!==undefined?option.value===value:option.region===region&&(active.model.kind==='region'||active.model.kind==='regions'||option.kind===kind&&(active.model.kind!=='slot'||option.index===index))));
 if(!match)return false;
 const field=active.boxes?.find(box=>box.dataset[active.boxKey]===match.value)||active.field;
 if(!field||inactive(field)||disabled(field))return false;
 if(active.boxes)field.checked=!field.checked;
 else{field.value=match.value;if(field.value!==match.value)return false;}
 const ChangeEvent=field.ownerDocument?.defaultView?.Event||globalThis.Event;
 field.dispatchEvent(new ChangeEvent('change',{bubbles:true}));
 return true;
}
