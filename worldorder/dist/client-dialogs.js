// Shared table detail windows leave their opener available. No game commands here.
import {usesGameLayout} from './client-platform.js';
const layout=usesGameLayout();
let opener=null,openerKey='';
function key(node){
 if(!node)return '';
 if(node.hasAttribute('data-country-pile'))return 'pile:'+node.dataset.pileRegion+':'+node.dataset.countryPile;
 const attributes=['data-client-player','data-client-event-id','data-client-supply','data-inspect-card','data-card','data-region','data-tray'];
 for(const name of attributes)if(node.hasAttribute(name))return name+':'+node.getAttribute(name)+(name==='data-card'?':'+(node.dataset.source||''):'');
 return node.id||node.getAttribute('aria-label')||node.textContent.trim();
}
export function closeClientDialogs(){if(layout)document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
export function showGameDialog(dialog){
 if(!layout){if(!dialog.open)dialog.showModal();return;}
 for(const d of document.querySelectorAll('dialog[open]'))if(d!==dialog)d.close();
 if(dialog.open)dialog.close();
 dialog.dataset.clientOpener=openerKey;
 dialog.classList.add('client-floating-dialog');
 const rail=document.querySelector('.client-player-rail')?.getBoundingClientRect();
 const stage=document.querySelector('.stage')?.getBoundingClientRect();
 const scrolling=document.body.classList.contains('client-scroll');
 const top=scrolling?58:Math.max(58,stage?.top||58),left=scrolling?18:(rail?.right||10)+14;
 const contentRight=scrolling?(rail?.left||innerWidth)-14:innerWidth-18;
 let bounds={x:left,y:top,w:Math.max(280,contentRight-left),h:scrolling?innerHeight-top-18:Math.max(260,(stage?.bottom||innerHeight-18)-top)};
 const r=opener?.isConnected?opener.getBoundingClientRect():null;
 if(r&&r.left<contentRight&&r.right>left&&r.bottom>top&&r.top<top+bounds.h){
  // Choose the larger side of a board/event trigger, so it stays clickable.
  const leftSpace=r.left-left-12,rightSpace=contentRight-r.right-12;
  if(Math.max(leftSpace,rightSpace)>=330){
   if(leftSpace>=rightSpace)bounds.w=leftSpace;
   else {bounds.x=r.right+12;bounds.w=rightSpace;}
  }else{
   const below=innerHeight-r.bottom-20,above=r.top-top-12;
   if(below>=above){bounds.y=r.bottom+12;bounds.h=below;}else bounds.h=above;
  }
 }
 const wide=dialog.id==='viewer'&&(dialog.querySelector('.client-player-board')||dialog.classList.contains('board-viewer'));
 if(dialog.querySelector('.client-player-board')&&(!r||r.right<=left))bounds.h=innerHeight-top-18;
 const width=Math.min(bounds.w,wide?1100:720);
 dialog.style.setProperty('--dialog-x',Math.round(bounds.x+(bounds.w-width)/2)+'px');
 dialog.style.setProperty('--dialog-y',Math.round(bounds.y)+'px');
 dialog.style.setProperty('--dialog-w',Math.round(width)+'px');
 dialog.style.setProperty('--dialog-h',Math.round(Math.max(130,bounds.h))+'px');
 dialog.show();
}
if(layout){
 document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||b.disabled)return;
  const open=Array.from(document.querySelectorAll('dialog[open]')).at(-1);
  if(open?.contains(b))return;
  const next=key(b);
  if(open&&open.dataset.clientOpener===next){open.close();event.preventDefault();event.stopImmediatePropagation();return;}
  opener=b;openerKey=next;
  // An action on the tabletop must not leave stale details above it.
  if(open)open.close();
 },true);
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  const open=Array.from(document.querySelectorAll('dialog[open]')).at(-1);
  if(open){open.close();event.preventDefault();event.stopImmediatePropagation();}
 },true);
 window.addEventListener('resize',closeClientDialogs);
}
