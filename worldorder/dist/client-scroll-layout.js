// Shared table composition. Existing controls and command attributes are moved,
// not recreated with a second set of rules or event handlers.
import {renderClientRoundStatus} from './client-round-status.js';
import {renderClientPrintedBoard,renderClientTradeInfo} from './client-player-board.js';
import {renderClientEventSummary} from './client-event-summary.js';
import {renderClientGrowthCatalogue} from './client-table-ui.js';
let handPage=0,handKey='';
function section(className,html){const el=document.createElement('section');el.className=className;el.innerHTML=html;return el;}
function paginateHand(tray,viewer){
 const hand=tray.querySelector('.hand');if(!hand)return;
 const cards=[...hand.children],key=viewer+':'+tray.querySelector('.client-hand-heading .active')?.dataset.tray;
 if(key!==handKey){handPage=0;handKey=key;}
 const pages=Math.ceil(cards.length/6);handPage=Math.min(handPage,Math.max(0,pages-1));
 const pager=section('client-hand-pages','');
 function show(){
  cards.forEach((card,index)=>{card.hidden=Math.floor(index/6)!==handPage;});
  pager.innerHTML=pages>1?`<button type="button" data-hand-page="previous" aria-label="上一页手牌" ${handPage===0?'disabled':''}>‹</button><span>${handPage+1} / ${pages}</span><button type="button" data-hand-page="next" aria-label="下一页手牌" ${handPage===pages-1?'disabled':''}>›</button>`:'';
 }
 pager.addEventListener('click',event=>{const direction=event.target.closest('[data-hand-page]')?.dataset.handPage;if(direction){handPage+=direction==='next'?1:-1;show();}});
 hand.after(pager);show();
}

export function composeClientScrollTable(state,byId,card,{viewer=state.current,actor=state.current}={}){
 const table=document.querySelector('.game-table');if(!table)return;
 document.body.classList.add('client-scroll');table.classList.add('client-scroll-table');
 const rail=table.querySelector('.client-player-rail'),self=rail?.querySelector('.client-player--self');
 if(self)rail.prepend(self);
 rail?.prepend(section('client-round-status',renderClientRoundStatus(state)));
 const board=section('client-own-board',renderClientPrintedBoard(state,viewer));
 const events=section('client-events-area',renderClientEventSummary(state,byId,{viewer}));
 const practical=section('client-practical',renderClientTradeInfo(state,viewer));
 const owned=table.querySelector('.client-owned-cards');if(owned)practical.append(owned);
 const tray=table.querySelector('.tray'),assets=owned?.querySelector('.client-owned-group--assets');
 if(assets&&!tray.querySelector('.asset-choice,.opening-group')){
  // Keep original command buttons when moving the public strategic assets.
  const executive=assets.querySelector('[data-source="executive"],[data-source="usedExecutive"]')?.closest('.client-owned-card');
  if(executive){executive.classList.add('client-executive-card');owned.querySelector('.client-owned-growth').prepend(executive);owned.querySelector('.client-owned-group--abilities .client-owned-empty')?.remove();}
  assets.classList.add('client-strategic-assets');
  assets.querySelector('h2').textContent='战略资产';
  assets.querySelector('header>span').textContent=assets.querySelectorAll('.client-owned-card').length;
  tray.prepend(assets);
 }
 if(owned){const abilities=owned.querySelector('.client-owned-group--abilities');owned.prepend(abilities);abilities.querySelector('header>span').remove();}
 table.querySelector('.client-right-dock')?.remove();
 const personal=section('client-personal-area','');personal.append(board,practical);
 const market=section('client-market-area',`<div class="client-market-cards"><header class="client-section-title"><h2>能力卡牌商店</h2><span>新牌在左 · 余 ${state.marketDeck.length} 张</span></header><div class="client-market-row">${state.market.map(id=>card(id,'market')).join('')}</div></div>`);
 const growth=section('client-growth-area',renderClientGrowthCatalogue(state,byId,card));
 growth.querySelector('h2').textContent='发展卡商店';growth.setAttribute('aria-label','发展卡商店');
 table.append(personal,events,market,growth);
 const task=table.querySelector('.action-workbench');task?.setAttribute('aria-label','行动操作区');
 const dock=section('client-command-dock','');
 if(tray.querySelector('.asset-choice,.opening-group')){dock.append(task);}else{dock.append(tray,task);paginateHand(tray,viewer);}
 table.append(dock);
 document.body.style.setProperty('--client-toolbar-space','0px');
}
