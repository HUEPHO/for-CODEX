import {relatedEventCards} from './event-related-cards.js';
// Shared browser/desktop presentation. Every command, target and permission comes
// from the existing forms and shared rules; this module never mutates a game.
import {showGameDialog} from './client-dialogs.js';
import {hasDesktopBridge,usesGameLayout} from './client-platform.js';
const native=hasDesktopBridge(),layout=usesGameLayout();
async function fullscreen(){
 try{if(native)await window.worldOrderDesktop.fullscreen();else if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
 catch{const hint=document.querySelector('#client-fullscreen-hint');if(hint)hint.hidden=false;}
}
let context='',picking=false,previewCards={};
export const isGameClient=layout;
export function setGameClientPicking(value){if(!layout)return;picking=!!value;document.body.classList.toggle('client-picking',picking);}
if(layout){
  document.body.classList.add('game-client');
  if(!native)document.body.classList.add('web-client');
  const controls=document.createElement('div');controls.className='client-controls';
  controls.innerHTML='<button id="client-menu" title="游戏菜单">☰ 菜单</button><button id="client-fullscreen" title="F11 / Alt+Enter">⛶</button>';
  document.querySelector('.topbar').append(controls);
  document.querySelector('.wordmark small').textContent='';
  const menu=document.createElement('dialog');menu.id='client-pause';
  menu.innerHTML='<button class="close" aria-label="返回对局">×</button><p class="eyebrow">WORLD ORDER</p><h2>游戏菜单</h2><p>'+(native?'进度自动保存。联机时返回主菜单仍会保持房间连接，退出客户端会断开连接。':'网页端 · 进度自动保存。多人对局通过房间号或邀请链接加入；刷新可恢复当前席位。')+'</p><button data-client-resume class="gold">返回对局</button>'+(native?'<button data-client-home>主菜单</button>':'<button data-client-room>返回房间大厅</button>')+'<button data-client-fullscreen>窗口 / 全屏</button><p id="client-fullscreen-hint" hidden>浏览器未允许全屏，可使用浏览器菜单或 F11。</p><button data-client-help>操作说明</button><button data-client-setup>布置新对局</button>'+(native?'<button data-client-quit>退出游戏</button>':'');
  document.body.append(menu);
  document.querySelector('#client-menu').onclick=()=>showGameDialog(menu);
  document.querySelector('#client-fullscreen').onclick=fullscreen;
  menu.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(native&&b.matches('[data-client-home]')){window.worldOrderDesktop.home();return;}
    if(native&&b.matches('[data-client-quit]')){window.worldOrderDesktop.quit();return;}
    if(b.matches('[data-client-fullscreen]')){fullscreen();return;}
    menu.close();
    if(b.matches('[data-client-help]'))document.querySelector('#help').click();
    if(b.matches('[data-client-setup]'))document.querySelector('#newgame').click();
    if(b.matches('[data-client-room]'))document.querySelector('#rooms').click();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog[open]')&&!document.querySelector('[data-dragging]')){event.preventDefault();showGameDialog(menu);}
  });
  document.addEventListener('click',event=>{
    const b=event.target.closest('button');if(!b)return;
    if(b.matches('[data-client-pick],[data-show-table-targets],#show-table-targets')){picking=true;document.body.classList.add('client-picking');}
    if(b.matches('[data-client-return]')){picking=false;document.body.classList.remove('client-picking');}
  },true);
  // A hover preview reveals the original printed art without shifting the hand.
  const preview=document.createElement('aside');preview.id='client-card-preview';preview.hidden=true;document.body.append(preview);
  let previewTimer;
  const hidePreview=()=>{clearTimeout(previewTimer);preview.hidden=true;};
  function showPreview(card){
    const id=card.dataset.clientEventId||card.dataset.card,img=card.querySelector('img');if((!img&&!previewCards[id]?.image)||!card.isConnected||document.querySelector('dialog[open]'))return;
    const eventCard=previewCards[id]?.type==='event';
    const related=relatedEventCards(id).map(cid=>previewCards[cid]).filter(Boolean);preview.classList.toggle('has-related-cards',related.length>0);
    if(eventCard&&!related.length){hidePreview();return;}
    const copy=img?img.cloneNode():document.createElement('img');if(!img){copy.src=previewCards[id].image;copy.alt=previewCards[id].name;}copy.removeAttribute('loading');preview.replaceChildren(...(eventCard?[]:[copy]));preview.style.removeProperty('left');preview.style.removeProperty('top');preview.style.removeProperty('right');
    if(related.length){const group=document.createElement('div');group.className='event-preview-related';for(const card of related){const face=document.createElement('img');face.src=card.image;face.alt=card.name;face.dataset.relatedCard=card.id;group.append(face);}preview.append(group);}
    const anchored=card.matches('.draft-card');preview.classList.toggle('is-card-anchored',anchored);
    if(anchored){
      const box=card.getBoundingClientRect(),top=document.querySelector('.topbar').getBoundingClientRect().bottom+8;
      copy.style.maxHeight=Math.min(500,innerHeight*.62,Math.max(80,box.top-top-26))+'px';
      copy.style.maxWidth=Math.min(340,innerWidth-36)+'px';
      preview.hidden=false;
      const size=preview.getBoundingClientRect();
      preview.style.left=Math.max(10,Math.min(innerWidth-size.width-10,box.left+(box.width-size.width)/2))+'px';
      preview.style.top=Math.max(top,box.top-size.height-10)+'px';preview.style.right='auto';
    }else if(card.matches('[data-client-event-id],.event-card-link,.event-related-links [data-card],.original-public-effects [data-card]')){
      const position=()=>{
        if(preview.hidden)return;
        const box=card.getBoundingClientRect(),size=preview.getBoundingClientRect(),gap=10;
        const x=box.right+gap+size.width<=innerWidth-gap?box.right+gap:box.left-gap-size.width;
        preview.style.left=Math.max(gap,Math.min(innerWidth-size.width-gap,x))+'px';
        preview.style.top=Math.max(gap,Math.min(innerHeight-size.height-gap,box.top))+'px';preview.style.right='auto';
      };
      preview.hidden=false;position();
      for(const face of preview.querySelectorAll('img'))face.addEventListener('load',position,{once:true});
    }else preview.hidden=false;
  }
  document.addEventListener('pointerover',event=>{
    const card=event.target.closest('.hand .cardbutton,.board-country,.table-gallery .cardbutton,.client-owned-cards .cardbutton,.draft-card,[data-client-event-id],.event-card-link,.event-related-links [data-card],.original-public-effects [data-card]');
    if(!card||event.pointerType==='touch'||document.querySelector('dialog[open]'))return;
    if(card.contains(event.relatedTarget))return;
    clearTimeout(previewTimer);
    previewTimer=setTimeout(()=>showPreview(card),550);
  });
  document.addEventListener('pointerout',event=>{const card=event.target.closest('.cardbutton,.board-country,.draft-card,[data-client-event-id],.event-card-link,.event-related-links [data-card],.original-public-effects [data-card]');if(card&&!card.contains(event.relatedTarget))hidePreview();});
  document.addEventListener('pointerdown',hidePreview,true);document.addEventListener('keydown',hidePreview,true);
  document.addEventListener('scroll',()=>{
    hidePreview();
    // Scrolling can move a draft card underneath a stationary pointer. Re-anchor
    // after scrolling settles instead of leaving the preview at its old place.
    const card=document.querySelector('.draft-card:hover');
    if(card)previewTimer=setTimeout(()=>{if(card.matches(':hover'))showPreview(card);},550);
  },true);
  window.addEventListener('resize',hidePreview);
}
export function syncGameClient({cards,key,setup,staged,collapsed}){
  previewCards=cards;
  if(!layout)return;
  if(context!==key){context=key;picking=false;}
  document.body.classList.toggle('client-picking',picking);
  document.body.classList.toggle('client-setup',!!setup);
  document.body.classList.toggle('client-staged',!!staged);
  document.body.classList.toggle('client-action-open',!setup&&!collapsed);
  const heading=document.querySelector('.table-task-heading');
  if(heading&&!heading.querySelector('[data-client-pick]')){
    const pick=document.createElement('button');pick.dataset.clientPick='';pick.textContent='查看棋盘';heading.insertBefore(pick,heading.lastElementChild);
    const back=document.createElement('button');back.dataset.clientReturn='';back.textContent='返回操作 →';heading.append(back);
  }
  const stageHeading=document.querySelector('.stagehead h1');if(stageHeading)stageHeading.textContent='世界格局';
  const mode=document.querySelector('.topbar .mode');if(mode?.textContent.startsWith('本地'))mode.textContent='本机对局 · 自动保存';
}
