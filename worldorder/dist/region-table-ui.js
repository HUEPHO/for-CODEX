import {activateRegionField,regionSelectionModel,selectRegionTarget} from './region-selection.js';

const targetClasses=['region-target-eligible','region-target-selected','region-target-blocked'];
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const unavailable=node=>node.matches?.(':disabled,[aria-disabled="true"]');
const selected=(option,model)=>option.selected??option.value===model.selectedValue;
const projected=(option,model)=>!!(option.projected||model.projected);

// Placement chooses a track. Only the actual next visible position represents
// that choice; clicking a later vacancy must not suggest arbitrary insertion.
function placementSlot(panel,kind){
 const slots=Array.from(panel.querySelectorAll(`[data-board-slot="${kind}"]`)).filter(node=>!unavailable(node));
 const empty=slots.find(node=>node.classList.contains('board-slot--empty'));
 return empty||(kind==='temporary'?slots.at(-1):null);
}
function optionTargets(panel,option,kind){
 if(kind==='trade')return [...panel.querySelectorAll('[data-trade-shop]')];
 if(kind==='region'||kind==='regions')return [panel];
 if(kind==='placement')return [placementSlot(panel,option.kind)].filter(Boolean);
 return Array.from(panel.querySelectorAll('[data-board-slot]')).filter(node=>!unavailable(node)&&node.dataset.boardSlot===option.kind&&Number(node.dataset.slotIndex)===option.index);
}
function clearTargets(surface){
 surface?.querySelectorAll(targetClasses.map(name=>'.'+name).join(',')).forEach(node=>node.classList.remove(...targetClasses));
}
function paintTargets(surface,model){
 if(!surface||!model?.activeFieldId)return;
 const panels=Array.from(surface.querySelectorAll('[data-board-region]'));
 const byRegion=new Map(panels.map(panel=>[panel.dataset.boardRegion,panel]));
 const trade=model.activeFieldId==='trade-regions';
 const candidates=trade?[...surface.querySelectorAll('[data-trade-shop]')]:model.kind==='region'||model.kind==='regions'?panels:panels.flatMap(panel=>Array.from(panel.querySelectorAll('[data-board-slot]')));
 candidates.forEach(node=>node.classList.add('region-target-blocked'));
 for(const option of model.options){
  const panel=byRegion.get(option.region);if(!panel||option.disabled)continue;
  if(projected(option,model))continue;
  for(const node of optionTargets(panel,option,trade?'trade':model.kind)){
   node.classList.remove('region-target-blocked');node.classList.add('region-target-eligible');
   if(selected(option,model))node.classList.add('region-target-selected');
  }
 }
}
// A legal form choice can describe a position not drawn on the current board,
// such as overflowing the permanent track. Keep that choice available without
// inventing a board slot or deciding whether the rules allow it ourselves.
function valueButtons(model,surface){
 const panels=new Map(Array.from(surface?.querySelectorAll('[data-board-region]')||[],panel=>[panel.dataset.boardRegion,panel]));
 return model.options.flatMap(option=>{
  if(!option.region||option.region==='reserve')return [{...option,buttonLabel:option.label}];
  if(!['placement','slot'].includes(model.kind))return [];
  const panel=panels.get(option.region);
  if(!projected(option,model)&&panel&&optionTargets(panel,option,model.kind).length)return [];
  const note=projected(option,model)?'（先执行转换，再按规则放置）':model.kind==='placement'?'（由规则落位）':'（按表单选择）';
  return [{...option,buttonLabel:option.label+note}];
 });
}
function renderBanner(model,surface){
 if(!model)return '';
 const fields=model.fields.map(field=>`<button type="button" class="region-field-button${field.id===model.activeFieldId?' active':''}" data-region-field="${esc(field.id)}" aria-pressed="${field.id===model.activeFieldId}">${esc(field.heading)}</button>`).join('');
 const values=valueButtons(model,surface).map(option=>`<button type="button" class="region-value-button${selected(option,model)?' active':''}" data-region-value="${esc(option.value)}" aria-pressed="${!!selected(option,model)}" ${option.disabled?'disabled':''}>${esc(option.buttonLabel)}</button>`).join('');
 const labels=model.options.filter(option=>selected(option,model)).map(option=>option.label);
 const hint=!model.activeFieldId?'先选择上面的项目，再点击地区。':model.projected?'先执行转换，再按规则放置；请用这里的按钮选择放置类型。':model.kind==='placement'?'点击高亮的永久空位或临时队尾选择放置类型。':model.kind==='slot'?'点击高亮的影响力格子选择目标。':model.kind==='regions'?'点击高亮地区勾选或取消，可选择多个地区。':'点击高亮地区选择；费用与效果在中央操作区确认后执行。';
 return `<div class="region-field-buttons">${fields}</div><p class="region-target-hint">${hint}</p>${values?`<div class="region-target-values">${values}</div>`:''}${labels.length?`<p class="region-target-current">已选：${esc(labels.join('、'))}</p>`:''}`;
}

/** Wire public board clicks to the current real form; no game state or rules. */
export function installRegionTable({root=document,getTask,getSurface,getBanner,countryRegion,showBoard,onMessage}){
 const context={countryRegion};let disposed=false,scheduled=false,syncing=false;
 function current(){
  const task=getTask();if(!task)return {task:null,model:null};
  let model=regionSelectionModel(task,context);
  if(model&&!model.activeFieldId){
   const regions=model.fields.filter(field=>field.kind==='region');
   if(regions.length===1){activateRegionField(regions[0].id,task,context);model=regionSelectionModel(task,context);}
  }
  return {task,model};
 }
 function sync({reveal=false}={}){
  if(disposed||syncing)return;syncing=true;
  try{
   let {model}=current();
   if(reveal&&model){showBoard?.();model=current().model;}
   const surface=getSurface(),banner=getBanner();clearTargets(surface);
   if(banner){banner.innerHTML=renderBanner(model,surface);banner.hidden=!model;}
   paintTargets(surface,model);
  }finally{syncing=false;}
 }
 function schedule(){
  if(scheduled||disposed)return;scheduled=true;
  queueMicrotask(()=>{scheduled=false;if(!disposed)sync();});
 }
 const stop=event=>{event.preventDefault();event.stopImmediatePropagation();};
 const message=text=>onMessage?.(text);
 function click(event){
  if(disposed)return;
  const target=event.target?.closest?event.target:event.target?.parentElement;if(!target)return;
  const banner=getBanner(),fieldButton=target.closest('[data-region-field]'),valueButton=target.closest('[data-region-value]');
  if(fieldButton&&banner?.contains(fieldButton)){
   stop(event);if(unavailable(fieldButton))return;
   const {task}=current();if(task&&activateRegionField(fieldButton.dataset.regionField,task,context))sync({reveal:true});return;
  }
  if(valueButton&&banner?.contains(valueButton)){
   stop(event);if(unavailable(valueButton))return;
   const {task,model}=current(),value=valueButton.dataset.regionValue;
   if(task&&model&&valueButtons(model,getSurface()).some(option=>option.value===value&&!option.disabled)&&selectRegionTarget(null,{value},task,context))sync();return;
  }
  const surface=getSurface(),panel=target.closest('[data-board-region]');
  if(!panel||!surface?.contains(panel)||target.closest('[data-country-pile]'))return;
  const {task,model}=current();if(!model)return;
  const trade=model.activeFieldId==='trade-regions';
  if(trade){
   if(!target.closest('[data-trade-shop]')){stop(event);return;}
  }else if(target.closest('[data-card],[data-table-target]'))return;
  // While selecting a region, don't also open its legacy detail sidebar.
  stop(event);
  if(!model.activeFieldId){message('请先选择要填写的出发地、目的地或影响力项目。');return;}
  const region=panel.dataset.boardRegion;
  let choice={};
  if(model.kind==='placement'||model.kind==='slot'){
   const slot=target.closest('[data-board-slot]');
   if(!slot||!panel.contains(slot)||unavailable(slot)){message('请点击高亮的影响力格子。');return;}
   const kind=slot.dataset.boardSlot,index=Number(slot.dataset.slotIndex);
   const option=model.options.find(option=>!option.disabled&&option.region===region&&option.kind===kind&&(model.kind!=='slot'||option.index===index));
   if(option&&projected(option,model)){message('此项先执行转换，请用上方按钮选择放置类型。');return;}
   if(model.kind==='placement'&&placementSlot(panel,kind)!==slot){message('请点击首个可用永久空位或临时队尾。');return;}
   choice={kind,index};
  }
  if(selectRegionTarget(region,choice,task,context))sync();
  else message('这个位置不是当前项目的可选目标。');
 }
 function focus(event){
  const task=getTask();if(!task?.contains(event.target))return;
  if(activateRegionField(event.target,task,context))sync({reveal:true});
 }
 function change(event){if(getTask()?.contains(event.target))schedule();}
 root.addEventListener('click',click,true);
 root.addEventListener('focusin',focus);
 root.addEventListener('change',change,true);
 return {sync,dispose(){
  if(disposed)return;disposed=true;
  root.removeEventListener('click',click,true);root.removeEventListener('focusin',focus);root.removeEventListener('change',change,true);
  clearTargets(getSurface());const banner=getBanner();if(banner){banner.replaceChildren();banner.hidden=true;}
 }};
}
