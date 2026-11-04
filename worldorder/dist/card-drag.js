const CARD_SOURCE='button[data-card][data-source="hand"][data-drag-card]';
const DROP_ZONE='[data-card-dropzone]';

// Presentation only: the caller owns legality and opens the existing play form.
// Delegated listeners survive hand re-renders. Return cleanup when leaving the table.
export function installCardDrag({root=document,getCardStatus,onDrop,onCancel}={}){
 if(typeof getCardStatus!=='function'||typeof onDrop!=='function')throw new TypeError('拖动卡牌需要状态检查和出牌入口');
 const doc=root.ownerDocument||root,win=doc.defaultView;
 const live=doc.createElement('div');live.className='card-drag-live';live.setAttribute('role','status');live.setAttribute('aria-live','polite');live.setAttribute('aria-atomic','true');
 (doc.body||doc.documentElement).append(live);
 let gesture=null,suppressClick=null,disposed=false,announcement=0;
 const contains=element=>!!element&&element.isConnected&&root.contains(element);
 const sourceReady=source=>contains(source)&&source.matches(CARD_SOURCE)&&!source.matches(':disabled')&&source.getAttribute('aria-disabled')!=='true'&&!source.closest('[inert],[hidden]');
 const zoneReady=zone=>contains(zone)&&!zone.matches(':disabled')&&zone.getAttribute('aria-disabled')!=='true'&&!zone.closest('[inert],[hidden]');
 function announce(message){
  const version=++announcement;live.textContent='';
  queueMicrotask(()=>{if(!disposed&&version===announcement)live.textContent=message;});
 }
 function status(id){
  try{const result=getCardStatus(id);return result?.allowed===true?{allowed:true,contextKey:result.contextKey}:{allowed:false,reason:result?.reason||'当前不能打出这张手牌'};}
  catch(error){return {allowed:false,reason:error?.message||'当前不能打出这张手牌'};}
 }
 function cardName(source){return source.dataset.dragLabel||source.getAttribute('aria-label')||source.querySelector('img')?.alt||source.textContent.trim()||'这张卡牌';}
 function dropAt(x,y){
  const zone=doc.elementFromPoint(x,y)?.closest(DROP_ZONE);
  return zoneReady(zone)?zone:null;
 }
 function point(event){
  const g=gesture;if(!g?.active)return;
  g.ghost.style.transform=`translate3d(${event.clientX-g.offsetX}px,${event.clientY-g.offsetY}px,0) rotate(-3deg)`;
  const zone=dropAt(event.clientX,event.clientY);
  if(zone===g.over)return;
  g.over?.classList.remove('card-drop-over');g.over=zone;zone?.classList.add('card-drop-over');
  announce(zone?'松开以选择出牌方式':'移入出牌区，或松开取消');
 }
 function clearGesture(){
  const g=gesture;if(!g)return null;gesture=null;
  g.source.classList.remove('card-drag-source');g.ghost?.remove();g.over?.classList.remove('card-drop-over');
  for(const zone of g.zones||[])zone.classList.remove('card-drop-ready');
  doc.documentElement.classList.remove('card-drag-active');
  try{if(g.source.hasPointerCapture?.(g.pointerId))g.source.releasePointerCapture(g.pointerId);}catch{}
  return g;
 }
 function cancel(reason,{silent=false,suppress=false}={}){
  const g=clearGesture();if(!g)return;
  if(g.active||suppress)suppressClick=g.pointerId;
  if(!silent&&(g.active||suppress)){
   announce(reason);
   if(g.active)try{onCancel?.(g.id,reason);}catch(error){announce(error?.message||reason);}
  }
 }
 function begin(event){
  const g=gesture;
  if(!sourceReady(g.source)||g.source.dataset.card!==g.id){cancel('手牌已更新，请重新选择',{suppress:true});return false;}
  const check=status(g.id);if(!check.allowed){cancel(check.reason,{suppress:true});return false;}g.contextKey=check.contextKey;
  const rect=g.source.getBoundingClientRect(),ghost=doc.createElement('div'),original=g.source.querySelector('img');
  ghost.className='card-drag-ghost';ghost.setAttribute('aria-hidden','true');ghost.inert=true;
  ghost.style.width=`${rect.width}px`;ghost.style.height=`${rect.height}px`;
  if(original){const img=doc.createElement('img');img.src=original.currentSrc||original.src;img.alt='';img.draggable=false;ghost.append(img);}
  const label=doc.createElement('span');label.className='card-drag-label';label.textContent=g.label;ghost.append(label);
  g.active=true;g.ghost=ghost;g.offsetX=Math.max(0,Math.min(rect.width,g.startX-rect.left));g.offsetY=Math.max(0,Math.min(rect.height,g.startY-rect.top));
  g.zones=[...root.querySelectorAll(DROP_ZONE)].filter(zoneReady);
  if(root.matches?.(DROP_ZONE)&&zoneReady(root))g.zones.push(root);
  for(const zone of g.zones)zone.classList.add('card-drop-ready');
  g.source.classList.add('card-drag-source');doc.documentElement.classList.add('card-drag-active');
  (doc.body||doc.documentElement).append(ghost);
  try{g.source.setPointerCapture?.(g.pointerId);}catch{}
  announce(`正在拖动${g.label}。移到出牌区后松开，按 Escape 取消。`);point(event);return true;
 }
 function pointerDown(event){
  // A new physical gesture must never inherit the prior drag's click suppression.
  suppressClick=null;
  if(gesture){if(event.pointerId!==gesture.pointerId)cancel('已取消拖动');return;}
  if(event.button!==0||event.isPrimary===false)return;
  const source=event.target.closest?.(CARD_SOURCE);if(!sourceReady(source))return;
  gesture={source,id:source.dataset.card,label:cardName(source),pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,threshold:event.pointerType==='touch'?10:6,active:false,over:null};
 }
 function pointerMove(event){
  const g=gesture;if(!g||event.pointerId!==g.pointerId)return;
  if(!sourceReady(g.source)||g.source.dataset.card!==g.id){cancel('手牌已更新，请重新选择');return;}
  if(event.pointerType==='mouse'&&event.buttons===0){cancel('已取消拖动');return;}
  if(!g.active){
   if(Math.hypot(event.clientX-g.startX,event.clientY-g.startY)<g.threshold)return;
   if(!begin(event))return;
  }
  event.preventDefault();point(event);
 }
 function pointerUp(event){
  const g=gesture;if(!g||event.pointerId!==g.pointerId)return;
  if(!g.active){clearGesture();return;}
  event.preventDefault();suppressClick=g.pointerId;
  if(!sourceReady(g.source)||g.source.dataset.card!==g.id){cancel('手牌已更新，请重新选择');return;}
  const check=status(g.id);
  if(!check.allowed){cancel(check.reason);return;}
  if(check.contextKey!==g.contextKey){cancel('局面已更新，请重新选择手牌');return;}
  if(!dropAt(event.clientX,event.clientY)){cancel('未放入出牌区，卡牌已放回手牌');return;}
  clearGesture();announce(`已选择${g.label}，请完成出牌设置。`);
  // Clear before opening a dialog: lost capture or re-render must not drop twice.
  try{Promise.resolve(onDrop(g.id)).catch(error=>{if(!disposed)announce(error?.message||'无法打开出牌设置，请重试');});}
  catch(error){announce(error?.message||'无法打开出牌设置，请重试');}
 }
 function interrupted(event){if(gesture&&event.pointerId===gesture.pointerId)cancel('已取消拖动');}
 function lostCapture(event){
  // Touch starts with implicit capture on the image. Transferring it to the
  // button must not cancel our own drag when the image loses that capture.
  if(gesture&&event.pointerId===gesture.pointerId&&(event.target===gesture.source||!sourceReady(gesture.source)))cancel('已取消拖动');
 }
 function keyDown(event){if(gesture&&event.key==='Escape'){event.preventDefault();event.stopPropagation();cancel('已取消拖动',{suppress:true});}}
 function click(event){
  if(suppressClick===null||event.detail===0)return;
  if(typeof event.pointerId==='number'&&event.pointerId>0&&event.pointerId!==suppressClick)return;
  suppressClick=null;event.preventDefault();event.stopImmediatePropagation();
 }
 function nativeDrag(event){if(contains(event.target.closest?.(CARD_SOURCE)))event.preventDefault();}
 function blur(){cancel('已取消拖动');}
 function hidden(){if(doc.hidden)blur();}
 const listeners=[
  [doc,'pointerdown',pointerDown,true],[doc,'pointermove',pointerMove,{capture:true,passive:false}],
  [doc,'pointerup',pointerUp,true],[doc,'pointercancel',interrupted,true],[doc,'lostpointercapture',lostCapture,true],
  [doc,'keydown',keyDown,true],[doc,'click',click,true],[doc,'dragstart',nativeDrag,true],
  [doc,'visibilitychange',hidden,false],[win,'blur',blur,false]
 ];
 for(const [target,type,handler,options] of listeners)target.addEventListener(type,handler,options);
 return ()=>{
  if(disposed)return;disposed=true;cancel('',{silent:true});live.remove();
  for(const [target,type,handler,options] of listeners)target.removeEventListener(type,handler,options);
 };
}
