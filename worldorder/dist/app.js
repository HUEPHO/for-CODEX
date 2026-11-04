import {isGameClient,syncGameClient,setGameClientPicking} from './game-client.js';
import {showGameDialog,closeClientDialogs} from './client-dialogs.js';
import {composeClientScrollTable} from './client-scroll-layout.js';
import {syncClientActionLayout} from './client-action-layout.js';
import {syncClientAllySelection,handleClientAllySelection} from './client-ally-selection.js';
import {renderClientPlayerBoard} from './client-player-board.js';
import {renderClientOwnedCards,renderClientAllies} from './client-owned-cards.js';
import {handleTradeControl} from './client-trade-ui.js';
import {syncClientActionChoices,handleClientActionChoice,selectClientCover} from './client-action-choices.js';
import {renderClientPlayerSummary} from './client-player-summary.js';
import {renderClientGrowthCatalogue} from './client-table-ui.js';
import {growthSupplyGroups} from './growth-setup.js';
import {renderOriginalBoard as renderInteractiveBoard} from './original-board.js';
import {installCardDrag} from './card-drag.js';
import {tableSelectionModel,selectTableTarget} from './table-selection.js';
import {installRegionTable} from './region-table-ui.js';
import {createRollback,recordRollback,rollbackAvailability,restoreRollback} from './rollback-state.js';
import {renderRollbackOptions,rollbackLabel} from './rollback-ui.js';
import {EVENT_EFFECTS} from './event-effects.js';
import {readAgreementForm,readAgreementReward,updateAgreementForm,updateAgreementReward} from './event-agreements-ui.js';
import {readSpecialPersonalEvent,updateSpecialPersonalEvent} from './event-special-personal-ui.js';
import {readPersonalEvent,updatePersonalEvent} from './event-personal-ui.js';
import {renderEventEffects} from './event-effects-ui.js';
import {readBidForm,readBidReward} from './event-bids-ui.js';
import {renderEventBoard} from './event-ui.js';
import {updateCooperationOrder} from './growth-cooperation-ui.js';
import {RoomClient,roomLink,normalizeCode} from './room-client.js';
import {renderRoomEntry,renderRoomLobby,renderRoomFlow,recentRoomLinks} from './room-ui.js';
import {renderSteamAccount,renderSteamMembers,steamStatusText} from './steam-ui.js';
import {setupPending,manualWindow} from './room-rules.js';
import {actionAccess} from './action-policy.js';
import {controlCommand} from './control-command.js';
import {renderForeignInvestments,foreignInvestmentCaption} from './foreign-investments-ui.js';
import {SPECIAL_CARDS,ASSET_NAMES} from './special-data.js';
import {readSequenceForm,updateSequencePanel} from './card-sequence-ui.js';
import {sequenceStartIssue} from './card-sequence.js';
import {readOpenRelation,updateOpenRelation} from './growth-triggers-ui.js';
import {renderGrowthAbility,renderExtraAsset} from './growth-active-ui.js';
import {installResourceIcons} from './resource-icons.js';
import {renderCommerce,readCommerceSetup} from './trade-ui.js';
import {GROWTH_DATA} from './growth-data.js';
import {ACTION_CARDS as BASIC_CARDS,requireTurn} from './basic-actions.js';
import {renderBasicForm,readBasicForm,updateBasicForm} from './basic-actions-ui.js';
import {renderWorldRegion,threatSummary} from './world-ui.js';
import {investmentPreview} from './world.js';
import {renderEconomy} from './economy-ui.js';
import {researchCost,countryValue,countryRegion} from './research.js';
import {renderFlow} from './flow-ui.js';
import {currentActor as flowActor,aftermathSteps} from './phase-state.js';
import{POWERS,REGIONS,RESOURCE_NAMES,createState,applyAction}from'./engine.js';
const $=s=>document.querySelector(s);const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data=[],byId={},state,side='board',tray='hand',region='E',hide=false,ready=false,timer;
const KEY='world-order-table-m2-v2';
const SESSION_KEY=KEY+'-session-v1';
let localRollback=createRollback();
let room=null,uiRevision=0,localRevision=0,stagedCard=null,taskVersion=0,renderedTaskKey=null,taskCollapsed=false;
const roomClient=new RoomClient({onChange:onRoomUpdate,onStatus:onRoomStatus});
installResourceIcons([...Object.values(ASSET_NAMES),...Object.values(BASIC_CARDS).map(c=>c.name),...Object.values(GROWTH_DATA).map(c=>c.name)]);
const labels={starter:'起始能力',ability:'市场能力',growth:'发展牌',asset:'战略资产',event:'事件',objective:'目标',country:'国家',startingCountry:'起始盟国',effect:'效果牌',executive:'行政命令'};
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(timer);timer=setTimeout(()=>$('#toast').classList.remove('show'),3200)}
const localIdentity=()=>({seat:state.current,user:'local',token:'local:'+state.current});
const localUndoIdentity=()=>localRollback.owner||localIdentity();
function persist(){if(room||roomClient.isSteam)return;try{localStorage.setItem(SESSION_KEY,JSON.stringify({version:1,state,rollback:localRollback}))}catch{toast('本机存储不可用；刷新将丢失本次操作')}}
function act(a){if(room)return roomAct(a);if(roomClient.isSteam){toast('请先加入 Steam 房间并入座');return{ok:false,error:'尚未加入 Steam 对局'};}try{const next=applyAction(state,a);if(a.type!=='switch')localRollback=recordRollback(localRollback,state,next,{...localIdentity(),action:a});state=next;localRevision++;persist();render();if(a.type!=='switch')toast(state.log[0]);return{ok:true,current:state.current,round:state.round}}catch(e){toast(e.message);return{ok:false,error:e.message}}}
function title(c){return c?.name||EVENT_EFFECTS[c?.id]?.name||GROWTH_DATA[c?.id]?.name||BASIC_CARDS[c?.id]?.name||`${labels[c?.type]||'卡牌'} ${String(c?.sourceCardId??'').slice(-2).padStart(2,'0')}`}
function card(id,source='view',presentation={}){const c=byId[id];if(!c)return'';return`<button class="cardbutton" data-card="${id}" data-source="${source}" ${source==='hand'?'data-drag-card="'+id+'"':''} aria-label="查看${esc(title(c))}"><img src="${esc(presentation.image||c.image)}" alt="${esc(presentation.alt||title(c))}" loading="lazy" draggable="false"><span class="cardmeta">${esc(c.name||GROWTH_DATA[c.id]?.name||BASIC_CARDS[c.id]?.name||labels[c.type])}${source==='allies'&&(state.players[state.current].bases||[]).includes(id)?' · 基地×'+state.players[state.current].bases.filter(cid=>cid===id).length:''}${source==='allies'&&(state.players[state.current].fdi||[]).includes(id)?' · FDI×'+state.players[state.current].fdi.filter(cid=>cid===id).length:''}${source==='allies'?foreignInvestmentCaption(state,state.current,id):''}${source==='allies'&&(state.players[state.current].exhaustedAllies||[]).includes(id)?' · 已消耗':''}${['usedAsset','usedExecutive'].includes(source)?' · 已使用':''}${c.level?' · 等级 '+c.level:''}${source==='growth'?' · '+(GROWTH_DATA[id]?.effect==='battlefield'?'购入即结算':state.round>=c.level?'已生效':'第'+c.level+'轮生效'):''}${c.era?' · '+(c.era==='chain'?'连锁':'时代 '+c.era):''}</span></button>`}
function gameContext(){return room?`${room.code}:${room.gameRevision}:${room.seatRevision}:${room.seat}`:`local:${localRevision}:${state?.current}`;}
function handCardStatus(id){
 const contextKey=gameContext()+':'+uiRevision;
 try{
  if(!ready||!state)throw Error('桌面尚未准备好');
  if(room&&(roomClient.busy||roomClient.status==='offline'))throw Error('请等待房间同步完成');
  if(hide||!state.players[state.current].hand.includes(id))throw Error('请先显示本方手牌');
  if(!BASIC_CARDS[id])throw Error('这张牌暂不支持拖动出牌');
  const access=actionAccess(state,{type:'playBasicCard',cardId:id},room?.seat??null);
  if(!access.allowed)throw Error(access.reason);
  requireTurn(state);
  if(state.flow.extraCard?.cardId&&state.flow.extraCard.cardId!==id)throw Error('请使用本次获得的额外手牌');
  const issue=sequenceStartIssue(state,id);if(issue)throw Error(issue);
  return {allowed:true,contextKey};
 }catch(error){return {allowed:false,reason:error.message,contextKey};}
}
function renderPlayArea(){
 const actor=flowActor(state);let own=actor===state.current&&state.phase==='行动';
 if(own){try{requireTurn(state);}catch{own=false;}}
 return `<div class="table-play-area" data-card-dropzone aria-label="出牌区" aria-disabled="${!own}"><span class="table-play-mark">＋</span><div><b>${stagedCard?'已选 '+esc(title(byId[stagedCard.id])):own?'将手牌拖到这里':actor===state.current?'先完成当前操作':'等待'+(POWERS[actor]?.name||'当前流程')}</b><small>${stagedCard?'在桌面选择目标，然后确认结算':'也可以点击手牌选择效果 · 确认结算后才消耗卡牌'}</small></div></div>`;
}
function renderTableSurface(){
 const board=()=>renderInteractiveBoard(state,byId,{selectedRegion:side==='region'?region:null,...(isGameClient?{regionOrder:['E','N','C','M','A','S','P']}:{})});
 if(!isGameClient)return ['board','region'].includes(side)?board():'<div class="table-gallery">'+renderSide()+'</div>';
 const overlay=['board','region'].includes(side)?'':'<section class="client-table-overlay" role="dialog" aria-label="'+({growth:'本局发展牌',market:'研究市场',events:'事件详情'}[side]||'桌面详情')+'"><header><span>桌面详情</span><button data-side="board" aria-label="关闭桌面详情">返回棋盘 ×</button></header><div class="table-gallery">'+renderSide()+'</div></section>';
 return board()+overlay;
}
function renderTableTask(){
 if(!stagedCard)return openingNotice()+(room?renderRoomFlow(state,byId):renderFlow(state,byId));
 const {id,source}=stagedCard,c=byId[id];
 const form=source==='growth'?renderGrowthAbility(state,id,byId):['assets','executive'].includes(source)&&!SPECIAL_CARDS[id]?renderExtraAsset(state,id,byId):renderBasicForm(state,id,byId,undefined,source==='resolution');
 return `<div class="table-action-card"><button class="table-card-portrait" data-inspect-card="${id}" aria-label="放大${esc(title(c))}"><img src="${c.image}" alt="${esc(title(c))}"></button><div><small>${source==='resolution'?'正在结算':'准备使用'}</small><h2>${esc(title(c))}</h2><button id="cancel-table-card">${source==='resolution'?'返回流程':'取消选择'}</button></div></div><div id="table-target-note" aria-live="polite"></div>${form}${source==='hand'&&canPassHand(id)?`<button class="table-pass-card" data-card-action="passTurn" data-id="${id}">盖放此牌，放弃行动领10资金</button>`:''}`;
}
function renderClientHand(p){
 const actor=flowActor(state);
 const tabs=[['hand','手牌',p.hand.length],['played','已打出',p.played.length],...(state.config.dd?[['objectives','目标',p.objectives.length]]:[])];
 if(!tabs.some(([id])=>id===tray))tray='hand';
 return `<header class="client-hand-heading"><nav>${tabs.map(([id,label,n])=>`<button data-tray="${id}" class="${tray===id?'active':''}">${label} <b>${n}</b></button>`).join('')}</nav><span class="client-hand-operator">${room?(POWERS[room.seat]?.name||'旁观'):`<label>操作者 <select id="client-seat">${Object.keys(POWERS).map(id=>`<option value="${id}"${id===state.current?' selected':''}>${POWERS[id].name}</option>`).join('')}</select></label>`}</span><button id="hidehand" class="smallbtn">${hide?'显示':'遮住'}手牌</button></header><div class="hand" data-army-owner="${state.current}">${renderTray()}</div><footer class="client-hand-footer"><span>牌库 ${p.deck.length} · 弃牌 ${p.discard.length}</span><button data-client-economy>贸易与持续能力</button>${!room&&actor&&actor!==state.current?`<button data-client-switch="${actor}">切到当前操作方 →</button>`:''}<button id="end-action" ${!state.actionTurns||state.actionTurns.index>=16||state.phase!=='行动'||state.current!==(state.flow?.order||state.initialOrder)[state.actionTurns.index%4]||!state.flow?.turnCards?.length?'disabled':''}>结束行动</button>${!p.hand.length&&state.flow?.step==='actions'&&state.current===actor&&!state.flow?.turnCards?.length?'<button id="pass-empty">放弃行动 · +10资金</button>':''}</footer>`;
}
function renderClientDock(){
 const p=state.players[state.current];
 return `<section class="client-right-dock"><nav class="client-dock-tools"><button data-client-supply="market" class="${side==='market'?'active':''}"><b>研究市场</b><small>${state.market.length} 张</small></button><button data-client-supply="growth" class="${side==='growth'?'active':''}"><b>发展牌</b><small>${p.growth.length>=5?'已全部取得':'下一等级 '+(p.growth.length+1)}</small></button><button data-client-flow><b>第 ${state.round} / 6 轮</b><small>${esc(state.phase)} · ${POWERS[flowActor(state)||state.current].name}</small></button></nav>${renderClientOwnedCards(state,byId,card,{viewer:room?.seat||state.current})}</section>`;
}
function canPassHand(id){return state.players[state.current].hand.includes(id)&&state.flow?.step==='actions'&&!state.flow.extraCard&&!state.flow.turnCards?.length&&flowActor(state)===state.current&&actionAccess(state,{type:'passTurn',id},room?.seat??null).allowed;}
function openTableCard(id,source='hand'){
 if(source==='hand'){const check=handCardStatus(id);if(!check.allowed&&!canPassHand(id)){toast(check.reason);openCard(id,'view');return;}}
 const q=state.flow?.cardResolution;
 if(source==='resolution'&&((q?.copiedCardId||q?.cardId)!==id||flowActor(state)!==state.current)){openCard(id,'view');return;}
 $('#viewer').close();$('#viewer-body').innerHTML='';
 stagedCard={id,source,key:gameContext()};taskCollapsed=false;taskVersion++;render();syncTableTargets(true);
 $('.table-task')?.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function syncCardTargets(reveal=false){
 const task=$('#table-task-body');if(!task)return;
 const model=tableSelectionModel(task),banner=$('#table-selection-banner');
 for(const el of document.querySelectorAll('[data-supply-ids]'))delete el.dataset.tableTarget;
 for(const el of document.querySelectorAll('.table-target-eligible,.table-target-selected,.table-target-blocked')){
  el.classList.remove('table-target-eligible','table-target-selected','table-target-blocked');el.removeAttribute('aria-pressed');
 }
 task.classList.remove('table-direct-selection');
 if(!model){if(banner)banner.innerHTML='';$('#table-target-note')?.replaceChildren();$('#table-extra-targets')?.remove();return;}
 const desired=model.kind==='growth'&&!isGameClient?'growth':'board';
 if(reveal&&side!==desired){side=desired;$('#table-surface').innerHTML=renderTableSurface();for(const b of document.querySelectorAll('[data-side]'))b.classList.toggle('active',b.dataset.side===side);}
 const shown=(model.kind==='growth'&&(isGameClient||side==='growth'))||(model.kind==='country'&&['board','region'].includes(side));
 const allowed=new Map(model.options.map(o=>[o.id,o]));
 $('#table-extra-targets')?.remove();
 if(shown){
  // Public allies and explicitly searched countries are offered by the real form;
  // show them alongside the board when they are not in its public country market.
  const selectionSurface=isGameClient&&model.kind==='growth'?$('.client-growth-area'):$('#table-surface');
  const displayed=new Set([...selectionSurface.querySelectorAll('[data-card]')].flatMap(el=>el.dataset.supplyIds?.split(',')||[el.dataset.card]));
  const extra=model.options.filter(o=>!displayed.has(o.id));
  if(extra.length){const box=document.createElement('section');box.id='table-extra-targets';box.innerHTML=`<h3>${esc(model.heading)}</h3><div class="table-target-gallery">${extra.map(o=>{const cid=byId[o.id]?o.id:o.id.split(':').at(-1),c=byId[cid];return `<button class="cardbutton" data-table-target="${esc(o.id)}" ${o.disabled?'disabled':''}>${c?`<img src="${c.image}" alt="${esc(title(c))}">`:''}<span class="cardmeta">${esc(o.label)}</span></button>`;}).join('')}</div>`;$('#table-surface').prepend(box);}
  task.classList.add('table-direct-selection');
  for(const el of document.querySelectorAll('#table-surface [data-card],#table-surface [data-table-target],.client-owned-cards [data-card],.client-growth-area [data-card]')){
   if(el.closest('.client-growth-area')&&model.kind!=='growth')continue;
   const copies=el.dataset.supplyIds?.split(',');
   if(copies){const candidate=copies.includes(model.selectedId)?model.selectedId:copies.find(id=>allowed.has(id)&&!allowed.get(id).disabled)||copies[0];el.dataset.tableTarget=candidate;}
   const id=el.dataset.tableTarget||el.dataset.card,option=allowed.get(id),eligible=option&&!option.disabled;if(el.closest('.client-owned-cards')&&!option)continue;
   el.classList.add(eligible?'table-target-eligible':'table-target-blocked');
   if(eligible){el.classList.toggle('table-target-selected',id===model.selectedId);el.setAttribute('aria-pressed',String(id===model.selectedId));}
  }
  if(reveal&&isGameClient&&model.kind==='growth')requestAnimationFrame(()=>$('.client-growth-area')?.scrollIntoView({behavior:'smooth',block:'start'}));
 }
 const selected=allowed.get(model.selectedId),selectionText=selected?esc(selected.label):'请选择一张卡牌';
 const message=`<b>${esc(model.heading)}</b><span>${shown?(isGameClient?'点击金色边框的卡牌选择，在顶部操作栏确认结算':'点击金色边框的卡牌选择，在下方操作区确认结算'):'返回选择区继续选择目标'}</span>${!shown?'<button id="show-table-targets">显示可选卡牌</button>':''}`;
 if(banner)banner.innerHTML=message;
 let note=$('#table-target-note');if(!note){note=document.createElement('div');note.id='table-target-note';task.append(note);}
 note.innerHTML=`<small>当前选择</small><p>${selectionText}</p><button data-show-table-targets>在桌面选择</button>${byId[model.selectedId]?`<button data-inspect-card="${model.selectedId}">放大所选卡牌</button>`:''}`;
}
const regionTable=installRegionTable({
 root:document,getTask:()=>$('#table-task-body'),getSurface:()=>$('#table-surface'),getBanner:()=>$('#region-selection-banner'),countryRegion,
 showBoard:()=>{if(!['board','region'].includes(side)){side='board';$('#table-surface').innerHTML=renderTableSurface();for(const b of document.querySelectorAll('[data-side]'))b.classList.toggle('active',b.dataset.side==='board');syncCardTargets();}},
 onMessage:toast,
});
function syncTableTargets(reveal=false){syncCardTargets(reveal);if(isGameClient){syncClientActionChoices();syncClientAllySelection();}const task=$('#table-task-body');regionTable.sync({reveal:reveal&&!!task&&!tableSelectionModel(task)});if(isGameClient)syncClientActionLayout();}
function currentRollbackOptions(){return room?room.rollback||{step:{available:!!room.canUndo},phase:{available:false,reason:'当前房间没有阶段快照'},turn:{available:false,reason:'当前房间没有行动快照'}}:rollbackAvailability(localRollback,localUndoIdentity());}
function updateRollbackControls(){
 if(!ready||!state)return;
 const options=currentRollbackOptions(),blocked=room&&(roomClient.busy?'上一步正在保存，请稍候':roomClient.status==='offline'?'房间离线，恢复连接后才能撤回':!room.state?'请先进入对局':'');
 $('#undo').disabled=!!blocked||!options.step.available;$('#undo').title=options.step.available?'撤销上一步':options.step.reason||'还没有可以撤回的操作';
 $('#rollback').disabled=!!room&&!room.state||roomClient.isSteam&&!room;
 if(roomClient.isSteam&&!room)$('#undo').disabled=true;
 const owner=room?.seat||localRollback.owner?.seat;
 $('#rollback-owner').textContent=owner?'撤回对象：'+POWERS[owner].name+'最近的操作。':'';
 $('#rollback-body').innerHTML=renderRollbackOptions(options,blocked);
}
async function rollbackAction(scope='step'){
 if(room){const result=await roomCommand('undo',{scope});if(result.ok)$('#rollback-dialog').close();return;}
 if(roomClient.isSteam)return;
 try{const restored=restoreRollback(localRollback,localUndoIdentity(),scope);state=restored.state;localRollback=restored.rollback;localRevision++;stagedCard=null;taskVersion++;persist();render();$('#rollback-dialog').close();toast('已'+rollbackLabel(scope));}catch(error){toast(error.message);updateRollbackControls();}
}
installCardDrag({root:document,getCardStatus:handCardStatus,onDrop:id=>openTableCard(id),onCancel:(_id,reason)=>toast(reason)});
function render(){
 const scrollPosition=isGameClient?$('#app').scrollTop:0;
 uiRevision++;
 const key=gameContext();
 if(stagedCard&&stagedCard.key!==key)stagedCard=null;
 if(renderedTaskKey!==key+':'+taskVersion)taskCollapsed=isGameClient&&!stagedCard&&state.flow?.step==='actions';
 const taskKey=key+':'+taskVersion,preservedTask=renderedTaskKey===taskKey?$('#table-task-body'):null;
 renderedTaskKey=taskKey;
 updateRoomHeader();
 if(roomClient.isSteam&&!room){$('#app').innerHTML=renderRoomEntry(state.config,'',{steam:roomClient.steamStatus});$('#app').setAttribute('aria-busy','false');updateRollbackControls();onRoomStatus(roomClient.status,roomClient.busy);return;}
 if(room&&!room.state){$('#app').innerHTML=renderRoomLobby(room,{steam:roomClient.steamStatus});$('#app').setAttribute('aria-busy','false');$('#undo').disabled=true;onRoomStatus(roomClient.status,roomClient.busy);return;}
 const p=state.players[state.current],power=POWERS[state.current];
 document.body.dataset.armyOwner=state.current;
 $('#app').setAttribute('aria-busy','false');$('#app').innerHTML=`<div class="layout game-table"><aside class="rail"><div class="rail-title"><h2>四个势力</h2><span>${room?'点击查看公开信息':'点击切换'}</span></div>${Object.entries(POWERS).map(([id,v])=>`<button class="player ${id===state.current?'active':''}" style="--pcolor:${v.color}" data-player="${id}" aria-pressed="${id===state.current}"><span class="pname"><span class="flag">${v.flag}</span>${v.name}${room&&room.actor===id?'<b class="room-turn"> · 当前</b>':''}</span><small><span>胜利分 <b class="score">${state.players[id].vp}</b></span><span>资金 ${state.players[id].money}</span></small><small><span>${state.players[id].focus}</span><span>${state.players[id].openingChoices?'待选起手':state.players[id].assetChoices?'待选资产':state.players[id].setupPending?'开局选牌':'手牌 '+state.players[id].hand.length}</span></small></button>`).join('')}<div class="roundbox"><span class="minor">${state.flow?'轮次 · 按流程推进':'轮次标记 · 手动切换'}</span><div class="rounds">${Array.from({length:6},(_,i)=>`<button data-round="${i+1}" ${state.flow?'disabled':''} class="${state.round===i+1?'on':''}" aria-label="第${i+1}轮">${i+1}</button>`).join('')}</div><select id="phase" ${state.flow?'disabled':''} class="phase" aria-label="阶段">${['准备','行动','研究',...(state.config.wit?['事件']:[]),'余波',...(state.phase==='结束'?['结束']:[])].map(x=>`<option ${x===state.phase?'selected':''}>${x}</option>`).join('')}</select></div></aside>
 <section class="stage"><div class="stagehead"><h1>世界桌面</h1><span>第 ${state.round} / 6 轮 · ${state.phase}</span><button id="mapzoom">放大地区 ⤢</button></div><nav class="table-view-tabs" aria-label="桌面区域">${[['board','地区总览'],['market','能力市场'],['growth','发展牌'],['events','事件']].map(([k,v])=>`<button data-side="${k}" class="${side===k||(k==='board'&&side==='region')?'active':''}" ${k==='events'&&!state.config.wit?'disabled':''}>${v}</button>`).join('')}</nav><div id="table-selection-banner" role="status"></div><div id="region-selection-banner" role="status"></div><div id="table-surface">${renderTableSurface()}</div></section>
 <section class="side action-workbench${taskCollapsed?' is-collapsed':''}" aria-label="中央操作区"><section class="table-task" data-army-owner="${flowActor(state)||state.current}"><div class="table-task-heading"><span>当前操作 · <b>${POWERS[flowActor(state)||state.current].name}</b></span><button id="toggle-table-task" aria-expanded="${!taskCollapsed}" aria-controls="table-task-body">${taskCollapsed?'展开操作':'收起操作'}</button></div><div id="table-task-body">${preservedTask?'':renderTableTask()}</div></section><div class="sidefoot"><details class="table-history" data-army-owner=""><summary>操作记录</summary>${state.log.slice(0,8).map(x=>`<p>${esc(x)}</p>`).join('')}</details>${side==='region'?'<details open><summary>'+REGIONS[region]+' · 地区详情</summary>'+renderSide()+'</details>':''}</div></section>
 <section class="tray" style="--pcolor:${power.color}"><div class="trayhead"><h2>${power.flag} ${power.name} · 玩家面板</h2><select id="focus" aria-label="战略焦点" ${state.economyVersion&&(!state.flow||state.flow.step!=='focus'||state.current!==state.flow.order[state.flow.checks.length])?'disabled':''}>${['内政焦点','外交焦点','军事焦点'].map(f=>`<option ${p.focus===f?'selected':''}>${f}</option>`).join('')}</select><span class="minor">牌库 ${p.deck.length} · 弃牌 ${p.discard.length}</span><button class="boardbtn" id="playerboard">查看势力面板 ⤢</button></div><div class="resources">${[['money','资金',p.money],['vp','胜利分',p.vp],...RESOURCE_NAMES.map((n,i)=>[i,n,p.resources[i]]),...(state.config.wit?[['smart','SP',p.smart]]:[])].map(([k,n,v])=>`<div class="resource"><span class="resource-label">${n}</span><strong>${v}</strong><button data-res="${k}" data-delta="-1" aria-label="减少${n}">−</button><button data-res="${k}" data-delta="1" aria-label="增加${n}">+</button></div>`).join('')}</div><details class="table-dashboard"><summary>产能、贸易与持续能力</summary>${renderEconomy(state)}${renderCommerce(state)}${renderEventEffects(state,state.current)}${renderForeignInvestments(state,byId)}</details><div class="traynav">${[['hand','手牌',p.hand.length],['played','行动区',p.played.length],['allies','盟国',p.allies.length],['assets',state.config.executive?'资产／命令':'战略资产',p.assets.length+(p.executive&&!p.executiveUsed?1:0)],['growth','发展',p.growth.length],...(state.config.dd?[['objectives','目标',p.objectives.length]]:[])].map(([k,n,count])=>`<button data-tray="${k}" class="${tray===k?'active':''}">${n} ${count}</button>`).join('')}<div class="actions"><button id="hidehand">${hide?'显示手牌':'遮住手牌'}</button><button id="draw" ${state.flow&&state.flow.step!=='actions'?'disabled':''}>抽一张</button><button id="end-action" ${!state.actionTurns||state.actionTurns.index>=16||state.phase!=='行动'||state.current!==(state.flow?.order||state.initialOrder)[state.actionTurns.index%4]||(Array.isArray(state.flow?.turnCards)&&!state.flow.turnCards.length)?'disabled':''}>结束本次行动</button><button id="pass-empty" ${p.hand.length||state.flow?.step!=='actions'||state.current!==flowActor(state)||!Array.isArray(state.flow?.turnCards)||state.flow.turnCards.length?'disabled':''}>无手牌：放弃行动领10资金</button><button id="clear" ${!p.played.length?'disabled':''}>清空行动区</button></div></div>${!setupPending(p)?renderPlayArea():''}<div class="${p.openingChoices||p.assetChoices?'opening-area':'hand'}">${renderTray()}</div></section></div>`;
 if(isGameClient){
  $('.rail').outerHTML=renderClientPlayerSummary(state,byId,{viewer:room?.seat||state.current,actor:flowActor(state)});
  if(!setupPending(p))$('.tray').innerHTML=renderClientHand(p);
  $('.game-table').insertAdjacentHTML('beforeend',renderClientDock());
  $('.table-task-heading').after($('#table-selection-banner'),$('#region-selection-banner'));
  composeClientScrollTable(state,byId,card,{viewer:room?.seat||state.current,actor:flowActor(state)||state.current});
 }
 if(preservedTask)$('#table-task-body').replaceWith(preservedTask);
 if(!preservedTask&&(!room||room.actor===state.current)){updateOpenRelation(state,byId,true);updateSequencePanel(state);updatePersonalEvent(state);updateSpecialPersonalEvent(state);updateAgreementForm(state);updateAgreementReward(state);}
 if(stagedCard&&!preservedTask)updateBasicForm(state,byId,true);
 updateRollbackControls();
 applyRoomPermissions();
 syncTableTargets(!preservedTask);
 syncGameClient({key:taskKey,setup:!!(p.assetChoices||p.openingChoices),staged:!!stagedCard,collapsed:taskCollapsed});
 if(isGameClient)syncClientActionChoices();
 if(isGameClient)$('#app').scrollTop=scrollPosition;
}
function openingNotice(){const pending=Object.keys(POWERS).filter(id=>setupPending(state.players[id]));if(!pending.length)return '';return `<div class="opening-notice"><b>开局选牌 · ${4-pending.length} / 4 已完成</b><p>${state.openingHandVersion?'首轮已发放带右箭头的6张新手牌。':'旧局沿用原有起手牌。'}战略资产${state.config.dd?'与目标卡各':''}点图弃掉1张，保留另外2张。四方确认后开始。</p><button class="gold smallbtn" id="go-opening">${setupPending(state.players[state.current])?'选择开局卡牌':room?'等待其他玩家':'前往下一位选择'}</button></div>`}
function draftOption(id,kind,selection,caption=''){
 const c=byId[id],chosen=selection.length===2,discarded=chosen&&!selection.includes(id),command=kind==='asset'?'selectAssetDiscard':'selectObjectiveDiscard';
 return `<article class="asset-option${discarded?' discarded':chosen?' kept':''}"><button class="cardbutton draft-card" data-draft-discard="${id}" data-command="${command}" aria-pressed="${discarded}" aria-label="${discarded?'取消弃置':'弃置'}${esc(title(c))}"><img src="${c.image}" alt="${esc(title(c))}" draggable="false"><span class="draft-verdict">${discarded?'✕ 弃置':chosen?'✓ 保留':'点图弃置'}</span></button><div class="draft-caption"><span>${caption||esc(title(c))}</span><button class="draft-zoom" data-inspect-card="${id}" aria-label="放大${esc(title(c))}">⤢ 放大</button></div></article>`;
}
function renderObjectiveDraft(p){if(!p.objectiveChoices)return '';return `<section class="objective-draft"><div class="sectionhead"><h3>目标卡 · 弃掉1张</h3><span>${p.objectiveSelection.length===2?'已选弃置牌':'请选择1张弃置'}</span></div><p class="minor">留下的两张分别在第3轮、第6轮结算。</p><div class="asset-options">${p.objectiveChoices.map(id=>draftOption(id,'objective',p.objectiveSelection)).join('')}</div></section>`}
function renderTray(){const p=state.players[state.current];if(p.openingChoices)return p.openingChoices.map((group,i)=>`<section class="opening-group"><div class="sectionhead"><h3>${i===0?'A':'B'}组 · 6张能力牌（旧局）</h3><button class="gold" data-opening="${i}">选择${i===0?'A':'B'}组</button></div><div class="opening-cards">${group.map(id=>card(id,'view')).join('')}</div></section>`).join('');if(p.assetChoices)return `<section class="asset-choice"><header class="draft-heading"><span class="eyebrow">开局选择</span><h2>各弃掉一张，留下你要的两张</h2><p>点击卡面标记弃置；点另一张可更换。确认前都可以调整。</p></header><div class="draft-columns"><section><div class="sectionhead"><h3>战略资产 · 弃掉1张</h3><span>${p.assetSelection.length===2?'已选弃置牌':'请选择1张弃置'}</span></div><p class="minor">起始分由保留的两张战略资产决定。</p><div class="asset-options">${p.assetChoices.map(c=>draftOption(c.id,'asset',p.assetSelection,'起始分 '+c.vp)).join('')}</div></section>${renderObjectiveDraft(p)}</div><div class="asset-confirm"><span>保留资产起始分：<b>${p.assetSelection.length===2?p.assetChoices.filter(c=>p.assetSelection.includes(c.id)).reduce((n,c)=>n+c.vp,0):'—'}</b></span><button class="gold" id="confirm-assets" ${p.assetSelection.length!==2||(p.objectiveChoices&&p.objectiveSelection.length!==2)?'disabled':''}>确认弃置，保留其余卡牌</button></div>${state.openingHandVersion?`<details class="beginner-hand"><summary>首轮固定起手 · 带右箭头的6张牌</summary><div class="opening-cards">${p.hand.map(id=>card(id,'view')).join('')}</div></details>`:''}</section>`;const list=tray==='assets'?[...p.assets,...p.usedAssets,...(p.executive?[p.executive]:[])]:p[tray]||[];if(!list.length)return'<div class="empty">这个区域还没有卡牌。</div>';return list.map(id=>tray==='played'&&(p.faceDownPlayed||[]).includes(id)?'<div class="cardbutton"><div class="back">WORLD<br>ORDER</div><span class="cardmeta">本轮盖放的能力牌</span></div>':tray==='hand'&&hide&&state.phase!=='研究'?'<div class="cardbutton"><div class="back">WORLD<br>ORDER</div><span class="cardmeta">手牌已遮住</span></div>':card(id,tray==='assets'&&id===p.executive?(p.executiveUsed?'usedExecutive':'executive'):tray==='assets'&&p.usedAssets.includes(id)?'usedAsset':tray)).join('')}
function renderGrowthSupply(){
 const groups=growthSupplyGroups(state.growth);
 return `<div class="sectionhead"><h2>发展牌供应</h2><small>同种发展叠放 · 剩余 ${state.growth.length} 张</small></div><div class="growth-supply-grid">`+Array.from({length:5},(_,i)=>{const level=groups.filter(g=>byId[g.id]?.level===i+1);return `<section class="table-growth-level"><b class="level">第${i+1}级 · ${level.reduce((n,g)=>n+g.count,0)}张</b><div class="marketgrid">${level.map(({id,ids,count})=>`<div class="table-supply-card${count>1?' has-copies':''}">${card(id,'growthSupply').replace('data-card=',`data-supply-ids="${ids.join(',')}" data-card=`)}<small class="supply-count">× ${count} <span>张可用</span></small></div>`).join('')}</div></section>`;}).join('')+'</div>';
}
function renderSide(){
 if(side==='market')return`<div class="sectionhead"><h2>公共能力市场</h2><small>余 ${state.marketDeck.length} 张</small></div><div class="marketgrid">${state.market.map(id=>card(id,'market')).join('')}</div><div class="row">${state.flow?'研究开始后可花2研究力刷新最右3张':'<button class="smallbtn" id="refresh-market">手动更换展示</button>'}</div>`;
 if(side==='growth')return isGameClient?renderClientGrowthCatalogue(state,byId,card):renderGrowthSupply();
 if(side==='events'&&state.eventVersion)return renderEventBoard(state,card,byId);
 if(side==='events')return`<div class="sectionhead"><h2>当前事件</h2><small>手动处理</small></div><div class="widecards">${state.events.map(id=>card(id,'event')).join('')||'<p class="empty">当前没有事件</p>'}</div><div class="row"><button id="add-event" class="smallbtn" ${state.events.length>=3?'disabled':''}>揭示一张事件</button></div><div class="notice">此版不自动判断个人事件、转折点或连锁触发。揭示后请按牌面手动处理。</div><details><summary class="level">连锁事件 · ${state.chain.length}</summary><div class="widecards">${state.chain.map(id=>card(id)).join('')}</div></details><details><summary class="level">已处理事件 · ${state.resolvedEvents.length}</summary><div class="widecards">${state.resolvedEvents.map(id=>card(id)).join('')}</div></details>`;
 const r=state.regions[region];if(state.worldVersion)return`<h2 class="regiontitle">${REGIONS[region]}</h2><div class="marketgrid">${r.available.map(id=>card(id,'regionCountry')).join('')}</div>${renderWorldRegion(state,region)}<h3>地区军队 · 手动记录</h3>${Object.entries(r.armies).map(([id,n])=>counterRow(id,n,'armies')).join('')}`;return`<h2 class="regiontitle">${REGIONS[region]}</h2><div class="minor">地区国家牌</div><div class="marketgrid">${r.available.map(id=>card(id,'regionCountry')).join('')}</div><div class="label">影响力总数 · 手动记录</div>${Object.entries(r.influence).map(([id,n])=>counterRow(id,n,'influence')).join('')}<div class="label">地区军队 · 手动记录</div>${Object.entries(r.armies).map(([id,n])=>counterRow(id,n,'armies')).join('')}<p class="minor">本阶段用数量记录，暂未区分永久与临时槽位，也不会自动计算得分。</p>`;
}
function counterRow(id,n,kind){return`<div class="counterrow" data-army-owner="${id}"><span style="color:${POWERS[id]?.color||'#9da8a8'}">${POWERS[id]?.name||'中立'}${kind==='armies'?' 军队':''}</span><span class="controls"><button data-region-count="${id}" data-kind="${kind}" data-delta="-1" aria-label="减少${POWERS[id]?.name||'中立'}${kind==='influence'?'影响力':'军队'}">−</button><b>${n}</b><button data-region-count="${id}" data-kind="${kind}" data-delta="1" aria-label="增加${POWERS[id]?.name||'中立'}${kind==='influence'?'影响力':'军队'}">+</button></span></div>`}
function openImage(src,alt){$('#viewer').classList.remove('board-viewer');$('#viewer-body').dataset.armyOwner='';$('#viewer-body').innerHTML=`<h2>${esc(alt)}</h2><img class="viewerimage" src="${esc(src)}" alt="${esc(alt)}">`;showGameDialog($('#viewer'))}
function openCard(id,source,{playIntent=false}={}){$('#viewer').classList.remove('board-viewer');const c=byId[id];if(!c)return;$('#viewer-body').dataset.armyOwner=state.current;if(room&&room.actor!==room.seat&&!(manualWindow(state)&&source==='allies'))source='view';const actions={hand:[['play','手动出牌（效果自行结算）'],['discard','弃置']],played:[['return','拿回手牌']],market:[['market','拿到牌库顶 · 手动']],growthSupply:[['growth','拿取发展牌 · 手动']],regionCountry:[['ally','拿为盟国 · 手动']],assets:[['asset','标记已使用']],usedAsset:[['restoreAsset','恢复未使用']],event:[['event','移到已处理区']]};if(state.flow){actions.market=[];if(state.flow.step==='research'&&state.flow.research&&flowActor(state)===state.current){actions.market=[['researchBuy','支付并购入牌库顶']];actions.allies=(state.players[state.current].exhaustedAllies||[]).includes(id)?[['readyAlly','手动重置盟国']]:[['researchAlly','消耗盟国并获得研究力']];}else actions.allies=(state.players[state.current].exhaustedAllies||[]).includes(id)?[['readyAlly','手动重置盟国']]:[['exhaustAlly','手动消耗盟国']];}if(state.eventVersion)actions.event=[];if(playIntent)actions.hand=[];if(state.flow?.extraCard||SPECIAL_CARDS[id])actions.assets=[];if(!playIntent&&state.flow?.step==='actions'&&!state.flow.extraCard&&source==='hand')actions.hand.push(['passTurn','盖放此牌，放弃行动领10资金']);if(state.worldVersion&&source==='allies')actions.allies=[...(actions.allies||[]),['toggleFDI',(state.players[state.current].fdi||[]).includes(id)?'移除FDI标记 · 手动':'添加FDI标记 · 手动'],['toggleBase',(state.players[state.current].bases||[]).includes(id)?'移除基地标记 · 手动':'记录已建基地 · 手动（不扣费、不派兵）']];$('#viewer-body').innerHTML=`<h2>${esc(title(c))}</h2><img class="viewerimage" src="${c.image}" alt="${esc(title(c))}">${c.backImage?`<details><summary>查看另一面</summary><img class="viewerimage" src="${c.backImage}" alt="${esc(title(c))}另一面"></details>`:''}<div class="viewer-meta">${esc(labels[c.type])}${c.owner?' · '+POWERS[c.owner].name:''}${c.module==='dd'?' · Diplomacy & Dominance':c.module==='wit'?' · World in Turmoil':''}</div>${state.flow&&state.flow.step==='research'&&state.flow.research&&(source==='market'||source==='allies')?`<p class="viewer-meta">${source==='market'?'研究费用：'+researchCost(id)+' · 当前可用：'+state.flow.research.remaining+(researchCost(id)>state.flow.research.remaining?'（研究力不足）':''):'消耗可获得研究力：'+countryValue(id)}</p>`:''}${source==='allies'&&(state.players[state.current].countryUnderlays?.[id]||[]).length?'<details><summary>叠放的起始国家 · 仅保留贸易符号</summary>'+state.players[state.current].countryUnderlays[id].map(cid=>'<img class=viewerimage src='+byId[cid].image+' alt=起始国家>').join('')+'</details>':''}${source==='resolution'?renderBasicForm(state,id,byId,undefined,true):source==='hand'?renderBasicForm(state,id,byId):source==='growth'?renderGrowthAbility(state,id,byId):['assets','executive'].includes(source)?(SPECIAL_CARDS[id]?renderBasicForm(state,id,byId):renderExtraAsset(state,id,byId)):''}<div class="vieweractions">${(actions[source]||[]).map(([action,name])=>`<button class="gold" data-card-action="${action}" data-id="${id}" ${(action==='researchBuy'&&researchCost(id)>state.flow.research.remaining)||(['play','asset'].includes(action)&&sequenceStartIssue(state,id))?'disabled':''}>${name}</button>`).join('')}</div>${actions[source]?'<p class="viewer-meta">自动结算框处理其列出的费用与效果；未自动支持的牌面效果请手动处理。</p>':''}`;showGameDialog($('#viewer'));if($('#viewer #basic-form'))updateBasicForm(state,byId,true);applyRoomPermissions()}
$('#app').addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;
 if(isGameClient&&(handleTradeControl(e)||handleClientActionChoice(e)||handleClientAllySelection(e)))return;
 if(b.dataset.cardAction){commitCardAction(b);return;}
 if(b.dataset.clientPlayer){openPublicPlayer(b.dataset.clientPlayer);return;}
 if(b.dataset.clientEventId){openCard(b.dataset.clientEventId,'view');return;}
 if(b.dataset.clientSupply){closeClientDialogs();side=side===b.dataset.clientSupply?'board':b.dataset.clientSupply;render();setGameClientPicking(side!=='board'&&!!stagedCard);return;}
 if(b.hasAttribute('data-client-economy')){$('#viewer-body').innerHTML=renderCommerce(state)+renderEventEffects(state,state.current);showGameDialog($('#viewer'));applyRoomPermissions();return;}
 if(b.hasAttribute('data-client-flow')){taskCollapsed=!taskCollapsed;render();return;}
 if(b.dataset.clientSwitch){if(!room)act({type:'switch',player:b.dataset.clientSwitch});return;}
 if(b.dataset.draftDiscard){act({type:b.dataset.command,id:b.dataset.draftDiscard});return;}
 if(b.id==='toggle-table-task'){taskCollapsed=!taskCollapsed;render();return;}
 if(b.id==='cancel-table-card'){stagedCard=null;taskVersion++;render();return;}
 if(b.dataset.inspectCard){openCard(b.dataset.inspectCard,'view');return;}
 if(b.id==='show-table-targets'||b.hasAttribute('data-show-table-targets')){syncTableTargets(true);$('.stage')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
 if(b.dataset.tableTarget){if(selectTableTarget(b.dataset.tableTarget,$('#table-task-body')))$('.table-task')?.scrollIntoView({behavior:'smooth',block:'nearest'});return;}
 if(b.dataset.worldOp){act({type:'worldInfluence',operation:b.dataset.worldOp,region,kind:b.dataset.kind,index:Number(b.dataset.index)});return;}
 if(b.dataset.engageDelta){act({type:'engageToken',region,delta:Number(b.dataset.engageDelta)});return;}
 if(handleFlowClick(b))return;
 if(b.id==='confirm-assets'){act({type:'chooseAssets'});return}
 if(b.dataset.opening!==undefined){act({type:'chooseOpening',group:Number(b.dataset.opening)});return}
 if(b.id==='go-opening'){if(room){$('.tray').scrollIntoView({behavior:'smooth',block:'start'});return;}const next=(state.players[state.current].openingChoices||state.players[state.current].assetChoices)?state.current:Object.keys(POWERS).find(id=>state.players[id].openingChoices||state.players[id].assetChoices);if(next)act({type:'switch',player:next});$('.tray').scrollIntoView({behavior:'smooth',block:'start'});return}
 if(b.dataset.player){if(room)openPublicPlayer(b.dataset.player);else act({type:'switch',player:b.dataset.player});return}
 if(b.dataset.side){side=b.dataset.side;render();if(isGameClient)setGameClientPicking(side!=='board'&&!!stagedCard);return}
 if(b.dataset.tray){tray=b.dataset.tray;render();return}
 // Active map targets are handled by regionTable before this listener. Idle
 // region/slot clicks keep the board visible instead of opening a detail panel.
 if(b.dataset.region){region=b.dataset.region;return}
 if(b.dataset.card){
  if(isGameClient&&b.dataset.source==='hand'&&selectClientCover(b.dataset.card,$('#table-task-body')))return;
  if(selectTableTarget(b.dataset.card,$('#table-task-body')))return;
  if(['hand','resolution','growth','assets','executive'].includes(b.dataset.source)&&(!room||room.actor===room.seat)){
   if(stagedCard?.id===b.dataset.card&&stagedCard?.source===b.dataset.source){stagedCard=null;taskVersion++;render();return;}
   openTableCard(b.dataset.card,b.dataset.source);return;
  }openCard(b.dataset.card,b.dataset.source);return;
 }
 if(b.dataset.round){act({type:'round',round:Number(b.dataset.round)});return}
 if(b.dataset.production!==undefined){act({type:'adjustProduction',key:Number(b.dataset.production),delta:Number(b.dataset.delta)});return;}
 if(b.dataset.res){act({type:'resource',key:/^\d$/.test(b.dataset.res)?Number(b.dataset.res):b.dataset.res,delta:Number(b.dataset.delta)});return}
 if(b.dataset.regionCount){act({type:'region',region,player:b.dataset.regionCount,kind:b.dataset.kind,delta:Number(b.dataset.delta)});return}
 const ops={'end-action':'endAction',draw:'draw',clear:'clearPlayed','refresh-market':'refreshMarket','add-event':'addEvent'};if(ops[b.id]){act({type:ops[b.id]});return}
 if(b.id==='hidehand'){hide=!hide;if(hide&&stagedCard?.source==='hand'){stagedCard=null;taskVersion++;}render()}
 if(b.id==='mapzoom'){const viewer=$('#viewer');viewer.classList.add('board-viewer');$('#viewer-body').innerHTML='<h2>地区总览 · 当前局面</h2>'+renderInteractiveBoard(state,byId,{selectedRegion:region});showGameDialog(viewer);}
 if(b.id==='playerboard')openPublicPlayer(state.current);
});
$('#app').addEventListener('change',e=>{
 if(e.target.id==='client-seat'){if(!room)act({type:'switch',player:e.target.value});return;}
 if(e.target.closest('#basic-form')){changeCardForm(e);return;}
 if(e.target.closest('#agreement-form')){updateAgreementForm(state);return;}
 if(e.target.closest('#agreement-reward-form')){updateAgreementReward(state);return;}
 if(e.target.closest('#personal-event-form')){if(state.flow?.eventResolution?.mode==='special')updateSpecialPersonalEvent(state);else updatePersonalEvent(state);return;}
 if(e.target.hasAttribute('data-growth-keep')){updateCooperationOrder(state,byId);return;}
 if(e.target.closest('#sequence-panel')){updateSequencePanel(state);return;}
 if(e.target.closest('#open-relation-form')){updateOpenRelation(state,byId,e.target.id==='open-country');return;}
 if(e.target.dataset.threatDefend){const id=state.flow.order[(state.flow.threatDone||[]).length];$('#threat-preview').innerHTML=threatSummary(state,id,[...document.querySelectorAll('[data-threat-defend]:checked')].map(el=>el.dataset.threatDefend));return;}
 if(e.target.dataset.withdraw){const id=state.flow.order[(state.flow.investmentDone||[]).length],withdraw={};for(const el of document.querySelectorAll('[data-withdraw]'))withdraw[el.dataset.withdraw]=el.value.trim()===''?NaN:Number(el.value);try{$('#investment-preview').textContent='合计收益：'+investmentPreview(state,id,withdraw).total+'资金';}catch(error){$('#investment-preview').textContent=error.message;}return;}
if(e.target.dataset.objectiveSelect){act({type:'toggleObjectiveSelection',id:e.target.dataset.objectiveSelect});return}if(e.target.dataset.assetSelect){act({type:'toggleAssetSelection',id:e.target.dataset.assetSelect});return}if(e.target.id==='phase')act({type:'phase',phase:e.target.value});if(e.target.id==='focus')act({type:'focus',focus:e.target.value})});
async function commitCardAction(b){
 try{
 const action=b.dataset.cardAction==='useGrowthAbility'?{type:'useGrowthAbility',cardId:b.dataset.id,ally:$('#growth-ally')?.value,count:Number($('#growth-draw-count')?.value||0)}:b.dataset.cardAction==='playExtraAsset'?{type:'playExtraAsset',cardId:b.dataset.id,cover:$('#extra-asset-cover')?.value}:b.dataset.cardAction==='initializeCommerce'?readCommerceSetup():['playBasicCard','resolveSequenceStep'].includes(b.dataset.cardAction)?readBasicForm():{type:b.dataset.cardAction,id:b.dataset.id,cardId:b.dataset.id,cover:$('#sequence-cover')?.value,region};
 const result=await act(action);if(result.ok)$('#viewer').close();
 }catch(error){toast(error.message);}
}
async function commitViewerRegionAction(b){
 if(!b||b.disabled)return;
 const command=controlCommand(b);if(!command)return;
 const access=actionAccess(state,command,room?.seat??null);
 if(!access.allowed){toast(access.reason);return;}
 if(room&&(roomClient.busy||roomClient.status==='offline')){applyRoomPermissions();return;}
 const action=b.dataset.worldOp?{...command,operation:b.dataset.worldOp,region,kind:b.dataset.kind,index:Number(b.dataset.index)}:{...command,region,delta:Number(b.dataset.engageDelta)};
 const result=await act(action);if(result.ok)$('#viewer').close();
}
function changeCardForm(e){
 if(e.target.id==='basic-branch'){const form=$('#basic-form');form.outerHTML=renderBasicForm(state,form.dataset.cardId,byId,e.target.value,!!form.dataset.sequence);updateBasicForm(state,byId,true);}
 else updateBasicForm(state,byId,['basic-region','basic-country'].includes(e.target.id)||e.target.hasAttribute('data-ready-before'));
 if(e.target.closest('#viewer'))return;
 syncTableTargets(true);
}
$('#viewer').addEventListener('click',e=>{const b=e.target.closest('[data-card-action]');if(b&&!b.disabled)commitCardAction(b);});
$('#viewer').addEventListener('click',e=>{const b=e.target.closest('[data-use-event-effect]');if(b&&!b.disabled)handleFlowClick(b);});
$('#viewer').addEventListener('click',e=>{const b=e.target.closest('[data-world-op],[data-engage-delta]');if(b&&!b.disabled)commitViewerRegionAction(b);});
$('#viewer').addEventListener('change',e=>{if(e.target.closest('#basic-form'))changeCardForm(e);});
$('#app').addEventListener('input',e=>{if(e.target.closest('#basic-form')){updateBasicForm(state,byId);syncTableTargets();}});
$('#app').addEventListener('change',e=>{if(!e.target.closest('#basic-form'))syncTableTargets(true);});
$('#app').addEventListener('input',e=>{if(e.target.closest('#agreement-form'))updateAgreementForm(state);if(e.target.closest('#agreement-reward-form'))updateAgreementReward(state);if(e.target.closest('#personal-event-form')){if(state.flow?.eventResolution?.mode==='special')updateSpecialPersonalEvent(state);else updatePersonalEvent(state);}});
$('#viewer').addEventListener('input',e=>{if(e.target.hasAttribute('data-growth-primary'))updateBasicForm(state,byId);});
for(const dialog of document.querySelectorAll('dialog')){dialog.querySelector('.close').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}})}
$('#undo').onclick=()=>rollbackAction('step');
$('#rollback').onclick=()=>{updateRollbackControls();showGameDialog($('#rollback-dialog'));};
$('#rollback-dialog').addEventListener('click',e=>{const button=e.target.closest('[data-rollback-scope]');if(button&&!button.disabled)rollbackAction(button.dataset.rollbackScope);});
$('#newgame').onclick=()=>{if(!ready)return;if(room&&!room.isHost){toast('由房主重新布置房间');return;}$('#settings-copy').textContent=room?'重新布置当前房间；四个席位保留，四方重新选牌。':'四名真人，所有势力由你在本机切换操作。';$('#settings-warning').textContent=room?'这会替换当前房间的整盘游戏，回到大厅等待开始。':'这会清空当前本地桌面。';const config=room?.config||state.config;$('#dd').checked=config.dd;$('#wit').checked=config.wit;$('#executive').checked=!!config.executive;$('#growth-mode').value=config.growthMode||'families';showGameDialog($('#settings'))};
$('#help').onclick=()=>showGameDialog($('#help-dialog'));
$('#confirm-new').onclick=async()=>{if(room){const result=await roomCommand('reset',{config:{dd:$('#dd').checked,wit:$('#wit').checked,executive:$('#executive').checked,growthMode:$('#growth-mode').value}});if(result.ok)$('#settings').close();return;}state=createState(data,{dd:$('#dd').checked,wit:$('#wit').checked,executive:$('#executive').checked,growthMode:$('#growth-mode').value});localRollback=createRollback();localRevision++;side='board';tray='hand';hide=false;persist();render();$('#settings').close();toast('请选择各势力的开局卡牌；已按启用模块布置新局')};
function readLocalState(){
 const valid=s=>s?.version===2&&s.players&&Object.keys(POWERS).every(p=>Array.isArray(s.players[p]?.hand));
 localRollback=createRollback();
 try{const session=JSON.parse(localStorage.getItem(SESSION_KEY));if(session?.version===1&&valid(session.state)){localRollback=session.rollback||createRollback();return session.state;}}catch{}
 try{const saved=JSON.parse(localStorage.getItem(KEY));if(valid(saved))return saved;}catch{}
 return createState(data);
}
async function init(){try{const response=await fetch('./cards.json');if(!response.ok)throw Error('卡牌资料暂时无法读取');data=await response.json();byId=Object.fromEntries(data.map(c=>[c.id,c]));state=readLocalState();ready=true;await roomClient.initialize();const params=new URL(location.href).searchParams,code=params.get('room'),seat=params.get('seat');
 if(roomClient.isSteam){render();}else if(code){try{await roomClient.connect(code);if(seat&&POWERS[seat]&&!room.seat)await roomClient.send('join',{seat});}catch(error){render();openRoomDialog(code);toast(error.message);}}else{persist();render();}registerTools();
 }catch(e){$('#app').innerHTML='';$('#error').hidden=false;$('#error').textContent=e.message+'。请刷新页面重试。'}}

function handleFlowClick(b){
 if(b.hasAttribute('data-use-event-effect')){act({type:'useEventEffect',effectId:b.dataset.useEventEffect,resourceKey:Number(b.closest('.event-effects')?.querySelector('[data-effect-resource="'+b.dataset.useEventEffect+'"]')?.value??0)});return true;}
 if(b.id==='event-submit'&&state.flow.eventResolution?.mode==='special'){act({type:'submitEvent',cardId:state.flow.eventResolution.cardId,...readSpecialPersonalEvent(state)});return true;}
 if(b.id==='event-submit'&&state.flow.eventResolution?.agreementVersion){act({type:'submitEvent',cardId:state.flow.eventResolution.cardId,...readAgreementForm(state)});return true;}
 if(b.hasAttribute('data-income-effect')){act({type:'resolveIncomeEffect',effectId:b.dataset.incomeEffect,choice:b.dataset.incomeChoice});return true;}
 if(b.id==='event-submit'&&state.flow.eventResolution?.mode==='personal'){act({type:'submitEvent',cardId:state.flow.eventResolution.cardId,...readPersonalEvent(state)});return true;}
 if(b.id==='event-reward'||b.id==='event-reward-skip'){act({type:'resolveEventReward',cardId:state.flow.eventResolution.cardId,...(state.flow.eventResolution?.agreementVersion?readAgreementReward(state):readBidReward()),skip:b.id==='event-reward-skip'});return true;}
 if(b.id==='event-submit'&&state.flow.eventResolution?.bidVersion){act({type:'submitEvent',cardId:state.flow.eventResolution.cardId,...readBidForm()});return true;}
 if(b.hasAttribute('data-event-prosperity')){act({type:'adjustEventProsperity',delta:Number(b.dataset.eventProsperity)});return true;}
 if(b.hasAttribute('data-keep-event')){act({type:'choosePersonalEvent',cardId:b.dataset.keepEvent});return true;}
 if(b.id==='event-reveal'){act({type:'resolveEventReveal',moves:[...document.querySelectorAll('[data-event-army]')].map(el=>el.value).filter(Boolean)});return true;}
 if(['event-submit','event-ack','event-postpone'].includes(b.id)){
  act({type:{'event-submit':'submitEvent','event-ack':'ackEvent','event-postpone':'postponeEvent'}[b.id],cardId:state.flow.eventResolution.cardId,amount:Number($('#event-amount')?.value||0),production:[...document.querySelectorAll('[data-event-production]:checked')].map(el=>Number(el.dataset.eventProduction)),productionKey:$('#event-production-key')?Number($('#event-production-key').value):undefined,confirmed:!!$('#event-confirm')?.checked,chains:[...document.querySelectorAll('[data-event-chain]:checked')].map(el=>el.dataset.eventChain),repeat:!!$('#event-repeat')?.checked});return true;
 }

 if(b.id==='settle-phase-task'){const cardId=$('#settlement-objective')?.value,historyAnswers={};for(const el of document.querySelectorAll('[data-objective-history]'))if(el.dataset.objectiveHistory===cardId&&el.value!=='')historyAnswers[el.dataset.taskIndex]=el.value==='true';act({type:'settlePhaseTask',taskId:b.dataset.taskId,confirmed:!!$('#settlement-confirm')?.checked,cardId,historyAnswers,scoreMode:$('#settlement-score-mode')?.value});return true;}
 if(b.id==='start-research'){act({type:'startResearch',incomeCards:[...document.querySelectorAll('[data-income-card]:checked')].map(el=>el.dataset.incomeCard)});return true;}
 if(b.id==='sequence-resolve'){act(readSequenceForm(state));return true;}
 if(b.id==='sequence-decline'){act({type:'resolveSequenceStep',accept:false});return true;}
 if(['sequence-skip-reset','sequence-skip'].includes(b.id)){act({type:'resolveSequenceStep',skip:true});return true;}
 if(b.id==='sequence-manual'){act({type:'manualSequence'});return true;}
 if(b.id==='commit-open-relation'){act(readOpenRelation());return true;}
 if(b.id==='skip-open-relation'){act({type:'skipOpenDiplomacy'});return true;}
 if(b.hasAttribute('data-battlefield-asset')){act({type:'finishGrowthAbility',assetId:b.dataset.battlefieldAsset});return true;}
 if(b.id==='skip-battlefield-asset'){act({type:'finishGrowthAbility',skip:true});return true;}
 if(b.id==='finish-growth-choice'){act({type:'finishGrowthAbility',topOrder:[...document.querySelectorAll('[data-growth-order]')].map(el=>el.value),rewardTypes:[...document.querySelectorAll('[data-growth-reward]:checked')].map(el=>el.dataset.growthReward),cards:document.querySelector('[data-growth-keep]:checked')?[document.querySelector('[data-growth-keep]:checked').dataset.growthKeep]:[...document.querySelectorAll('[data-growth-choice]:checked')].map(el=>el.dataset.growthChoice)});return true;}
 if(b.id==='continue-extra-card'){act({type:'continueWithExtraCard'});return true;}
 if(b.id==='pass-empty'){act({type:'passTurn'});return true;}

 if(b.id==='resolve-investments'){const withdraw={};for(const el of document.querySelectorAll('[data-withdraw]'))withdraw[el.dataset.withdraw]=el.value.trim()===''?NaN:Number(el.value);act({type:'resolveInvestments',withdraw});return true;}
 if(b.id==='resolve-threat'){act({type:'resolveThreat',defend:[...document.querySelectorAll('[data-threat-defend]:checked')].map(el=>el.dataset.threatDefend)});return true;}
 if(b.id==='score-world'||b.id==='score-smart'){act({type:b.id==='score-world'?'scoreWorld':'scoreSmart'});return true;}

 if(b.id==='improve-prosperity'||b.id==='skip-prosperity'){act({type:'resolveProsperity',improve:b.id==='improve-prosperity'});return true;}
 if(b.id==='confirm-focus'&&state.economyVersion){
  const ready=[...document.querySelectorAll('[data-focus-ready]:checked')].map(el=>el.dataset.focusReady);
  const upgrades=[...document.querySelectorAll('[data-focus-upgrade]:checked')].map(el=>Number(el.dataset.focusUpgrade));
  const quantities=Array(7).fill(0);for(const el of document.querySelectorAll('[data-focus-quantity]'))quantities[Number(el.dataset.focusQuantity)]=el.value.trim()===''?NaN:Number(el.value);
  const from=$('#quick-from')?.value,quickResponse=$('#quick-army')?.checked?{mode:'army'}:from?{mode:'move',from,to:$('#quick-to')?.value,spendSP:!!$('#quick-sp')?.checked}:undefined;
  act({type:'confirmFocus',ready,upgrades,quantities,quickResponse});return true;
 }

 if(b.dataset.orderSlot!==undefined){act({type:'chooseOrderSlot',slot:Number(b.dataset.orderSlot)});return true;}
 const types={'start-research':'startResearch','research-refresh':'researchRefresh','finish-research':'finishResearch','confirm-events':'confirmEvents','confirm-aftermath':'confirmAftermath','next-round':'nextRound','confirm-countries':'confirmCountries','confirm-production':'confirmProduction','confirm-focus':'confirmFocus'};
 if(!types[b.id])return false;
 act({type:types[b.id],confirmed:!!$('#flow-confirm')?.checked,step:state.flow?.step==='aftermath'?aftermathSteps(state)[state.flow.checks.length]:undefined});return true;
}
function registerTools(){if(!document.modelContext?.registerTool)return;const lifetime=new AbortController();window.addEventListener('pagehide',()=>lifetime.abort(),{once:true});const tools=[{name:'read_table_state',description:'读取当前桌面或房间公开状态，以及本标签页的势力。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({mode:room?'room':'local_manual',room:room?.code||null,seat:room?.seat||null,actor:room?.actor||null,current:state.current,round:state.round,phase:state.phase,initialOrder:state.initialOrder||null,players:Object.fromEntries(Object.entries(state.players).map(([k,p])=>[k,{money:p.money,vp:p.vp,handCount:p.hand.length,deckCount:p.deck.length}]))})},{name:'switch_table_player',description:'切换本地桌面的势力；房间内席位固定，不能使用此操作。',inputSchema:{type:'object',properties:{player:{type:'string',enum:Object.keys(POWERS)}},required:['player'],additionalProperties:false},execute:input=>{if(!input||!POWERS[input.player])throw Error('无效势力');return act({type:'switch',player:input.player})}}];for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifetime.signal})).catch(()=>{})}catch{}}}
async function roomAct(action){
 if(roomClient.status==='offline'){toast('正在重连房间，请同步成功后操作');return {ok:false,error:'房间尚未恢复连接'};}
 return roomCommand('action',{action});
}
function openPublicPlayer(id){
 const p=state.players[id],power=POWERS[id];if(!p||(!room?.state&&!isGameClient))return;
 const self=id===(room?.seat||state.current);$('#viewer').classList.remove('board-viewer');
 $('#viewer-body').dataset.armyOwner=id;
 const stats=[['胜利分',p.vp],['资金',p.money],['繁荣',p.prosperity],...(state.config.wit?[['SP',p.smart]]:[]),...RESOURCE_NAMES.map((name,i)=>[name,p.resources[i]])];
 const section=(label,list)=>`<h3>${label}</h3><div class="public-cards">${list.map(cid=>cid?card(cid,'view'):'<div class="public-back">盖放的能力牌</div>').join('')||'<p class="minor">暂无卡牌</p>'}</div>`;
 const summary=`<h2>${power.name} · ${self?'我的信息':'公开信息'}</h2><p>胜利分 ${p.vp} · 资金 ${p.money} · 手牌 ${p.hand.length} 张</p>`;
 const board=isGameClient?renderClientPlayerBoard(state,id,byId):`<div class="public-stats">${stats.map(([name,value])=>`<span>${name} <b>${value}</b></span>`).join('')}</div>`;
 $('#viewer-body').innerHTML=summary+board+`${self&&state.config.dd?section('我的目标',p.objectives||[]):''}${isGameClient?'<h3>盟国</h3>'+renderClientAllies(state,byId,card,{viewer:id}):section('盟国',p.allies)}${section('未使用战略资产',p.assets)}${section('已使用战略资产',p.usedAssets)}${section('发展牌',p.growth)}${section('行动区',p.played.map(cid=>(p.faceDownPlayed||[]).includes(cid)?null:cid))}`;
 showGameDialog($('#viewer'));
}
$('#viewer').addEventListener('click',event=>{if(isGameClient&&(handleTradeControl(event)||handleClientActionChoice(event)))return;const button=event.target.closest('[data-card]');if(!button)return;if(button.dataset.source==='regionCountry'&&selectTableTarget(button.dataset.card,$('#table-task-body'))){$('#viewer').close();return;}openCard(button.dataset.card,button.dataset.source||'view');});
async function roomCommand(op,fields={}){
 try{await roomClient.send(op,fields);if(op==='action')toast(room.state?.log[0]||'已保存');if(op==='undo')toast('已'+rollbackLabel(fields.scope||'step'));return {ok:true,current:room.seat,round:room.state?.round};}
 catch(error){toast(error.message);return {ok:false,error:error.message};}
}
function onRoomUpdate(next,cause){
 const previous=room;room=next;
 if(!room)state=readLocalState();else if(room.state)state=room.state;
 if(previous?.code!==room?.code||previous?.seat!==room?.seat){tray='hand';hide=false;}
 const viewerContextChanged=previous?.gameRevision!==room?.gameRevision||previous?.code!==room?.code||previous?.seat!==room?.seat||!!previous?.state!==!!room?.state;
 if($('#viewer').open&&viewerContextChanged){$('#viewer').close();if(cause==='remote')toast('局面已更新，请重新打开卡牌查看当前可用操作');}
 render();
 if($('#room-dialog').open&&room)$('#room-body').innerHTML=renderRoomLobby(room,{compact:true,steam:roomClient.steamStatus});
 onRoomStatus(roomClient.status,roomClient.busy);
 if(previous?.seat&&!room?.seat&&room)toast('本标签页已离开席位或席位已被接管，请在大厅重新入座');
}
function updateRoomHeader(){
 $('.mode').textContent=roomClient.isSteam?`Steam 联机 · ${roomClient.steamStatus?.name||'连接中'}${room?' · '+(room.seat?POWERS[room.seat].name:'等待入座'):''}`:room?`房间 ${room.code} · ${room.seat?POWERS[room.seat].name:'等待入座'} · ${room.status==='lobby'?'大厅':'共享对局'}`:'本地桌面 · 辅助结算';
 $('#rooms').textContent=room?'房间大厅':roomClient.isSteam?'Steam 房间':'创建／加入房间';
 $('#newgame').disabled=!!room&&!room.isHost||roomClient.isSteam&&!room;
 const strip=$('#room-strip');strip.hidden=!room?.state;
 strip.innerHTML=room?.state?`<div class="room-game-strip"><strong>${POWERS[room.seat].flag} 你是${POWERS[room.seat].name}</strong><span>${room.actor===room.seat?'轮到你操作':room.actor?'等待'+POWERS[room.actor].name:state.flow?.step==='ended'?'对局已结束':'开局选牌'}</span><span data-room-status role="status">已同步</span><button data-room-action="retry">重新同步</button></div>`:'';
 document.title=room?`${room.actor===room.seat&&room.seat?'轮到你 · ':''}${room.seat?POWERS[room.seat].name+' · ':''}房间 ${room.code} — World Order`:roomClient.isSteam?'World Order — Steam 联机':'World Order — 电子桌面';
}
function onRoomStatus(status,busy){
 const text=roomClient.isSteam&&!['saving','connecting'].includes(status)?steamStatusText(roomClient.steamStatus):{online:'已同步',saving:'正在保存…',connecting:'正在连接…',offline:'连接中断 · 正在重连'}[status]||'正在同步';
 if(roomClient.isSteam){
  for(const el of document.querySelectorAll('[data-steam-account]'))el.innerHTML=renderSteamAccount(roomClient.steamStatus);
  for(const el of document.querySelectorAll('[data-steam-members]'))el.innerHTML=renderSteamMembers(roomClient.steamStatus);
 }
 for(const el of document.querySelectorAll('[data-room-status]')){el.textContent=text;el.classList.toggle('room-offline',status==='offline');}
 $('#room-body').inert=busy;$('#settings').inert=!!room&&busy;
 if(room||roomClient.isSteam)applyRoomPermissions();
}
function applyRoomPermissions(){
 for(const el of document.querySelectorAll('[data-room-disabled]')){el.disabled=el.dataset.roomDisabled==='true';delete el.dataset.roomDisabled;}
 $('#newgame').disabled=!!room&&(!room.isHost||roomClient.busy||roomClient.status==='offline')||roomClient.isSteam&&!room;
 updateRollbackControls();
 const blocked=el=>{if(!el)return;el.dataset.roomDisabled=String(el.disabled);el.disabled=true;};
 const busy=roomClient.busy,offline=roomClient.status==='offline';
 if(roomClient.isSteam){
  for(const el of document.querySelectorAll('[data-steam-ready]'))el.disabled=!roomClient.steamStatus.ready||busy||offline;
  for(const el of document.querySelectorAll('[data-room-action="join"],[data-room-action="takeover"],[data-room-action="start"]'))if(busy||offline)blocked(el);
  for(const el of document.querySelectorAll('[data-room-action="leave"]'))if(busy)blocked(el);
 }
 if(!room)return;
 if(!room.state)return;
 const general=room.actor===room.seat&&!Object.values(state.players).some(setupPending),draft=setupPending(state.players[room.seat]);
 for(const el of $('#app').querySelectorAll('button,input,select')){
  const readOnly=el.matches('[data-client-flow],[data-client-economy],[data-client-action-option],[data-client-player],[data-client-event-id],[data-client-supply],[data-client-pick],[data-client-return],[data-player],[data-card],[data-side],[data-tray],[data-region],[data-hand-page],[data-trade-tab],[data-allocation-page],#hidehand,#mapzoom,#playerboard,#go-opening,#cancel-table-card,#toggle-table-task,[data-inspect-card],[data-show-table-targets],#show-table-targets');
  if(readOnly)continue;
  const ownDraft=el.matches('[data-opening],[data-asset-select],[data-objective-select],[data-draft-discard],#confirm-assets');
  const command=controlCommand(el),allowed=command?actionAccess(state,command,room.seat).allowed:ownDraft?draft:general;
  if(busy||offline||!allowed)blocked(el);
 }
 // The viewer also hosts persistent-effect and commerce controls. Discover
 // every real command through the same adapter used by the main table.
 const viewerControls=[...$('#viewer').querySelectorAll('button,input,select')].filter(el=>controlCommand(el));
 const editableViewer=viewerControls.some(el=>actionAccess(state,controlCommand(el),room.seat).allowed);
 for(const el of new Set([...viewerControls,...$('#viewer').querySelectorAll('input,select')])){
  const command=controlCommand(el);
  if(busy||offline||!(command?actionAccess(state,command,room.seat).allowed:editableViewer))blocked(el);
 }
 // Saving/offline changes can update permissions without rebuilding the form.
 // Keep the visible choice buttons in sync when their original selects recover.
 if(isGameClient){syncClientActionChoices();syncClientAllySelection();}
}
async function openRoomDialog(code=''){
 if(!ready)return;
 $('#room-body').innerHTML=room?renderRoomLobby(room,{compact:true,steam:roomClient.steamStatus}):renderRoomEntry(state.config,normalizeCode(code),{steam:roomClient.steamStatus});
 if(!$('#room-dialog').open)showGameDialog($('#room-dialog'));
 onRoomStatus(roomClient.status,roomClient.busy);
 if(!room&&!roomClient.isSteam){try{const list=await roomClient.recent(),target=$('#room-body [data-recent-rooms]');if(target)target.innerHTML=recentRoomLinks(list);}catch{const target=$('#room-body [data-recent-rooms]');if(target)target.textContent='最近房间暂时无法读取，可重试加入房间。';}}
}
$('#rooms').onclick=()=>openRoomDialog();
document.addEventListener('submit',async event=>{
 const form=event.target.closest('[data-room-form]');if(!form)return;event.preventDefault();
 try{await roomClient.connect(form.querySelector('[data-room-code]').value);$('#room-dialog').close();}catch(error){toast(error.message);}
});
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-room-action]');if(!button||button.disabled)return;
 const op=button.dataset.roomAction;
 try{
  if(op==='create'){
   const config=Object.fromEntries([...button.closest('.room-entry').querySelectorAll('[data-room-config]')].map(el=>[el.dataset.roomConfig,el.tagName==='SELECT'?el.value:el.checked]));
   await roomClient.create(config);$('#room-dialog').close();return;
  }
  if(op==='recent'){await roomClient.connect(button.dataset.roomCode);$('#room-dialog').close();return;}
  if(op==='join'||op==='takeover'){
   if(op==='takeover'&&!window.confirm(`在当前标签页恢复${POWERS[button.dataset.roomSeat].name}席位？原标签页将退出这个席位。`))return;
   await roomClient.send('join',{seat:button.dataset.roomSeat,takeover:op==='takeover'});$('#room-dialog').close();return;
  }
  if(op==='start'){await roomClient.send('start');$('#room-dialog').close();return;}
  if(op==='back'){$('#room-dialog').close();return;}
  if(op==='retry'){await roomClient.sync();if(roomClient.status==='online')toast('房间已同步到最新局面');else toast('暂时无法连接，正在继续重试');return;}
  if(op==='leave'){await roomClient.leave();$('#room-dialog').close();toast(roomClient.isSteam?'已退出 Steam 房间':'已返回本地桌面，房间进度仍然保留');return;}
  if(op==='copy'){
   const url=roomClient.isSteam?roomClient.steamStatus.lobbyId||room.code:roomLink(room.code);
   try{await navigator.clipboard.writeText(url);toast(roomClient.isSteam?'已复制 Steam 房间号':'已复制房间链接');}catch{window.prompt(roomClient.isSteam?'复制此房间号，发给 Steam 好友':'复制此链接，在新标签页加入同一房间',url);}
  }
 }catch(error){toast(error.message);}
});
init();

document.addEventListener('click',e=>{const b=e.target.closest('[data-commerce-index]');if(b)act({type:'toggleCommerce',index:Number(b.dataset.commerceIndex)});});

// Close an expanded table catalogue without touching the preserved action form.
document.addEventListener('keydown',event=>{if(isGameClient&&event.key==='Escape'&&!document.querySelector('dialog[open]')&&!['board','region'].includes(side)){event.preventDefault();event.stopImmediatePropagation();side='board';render();setGameClientPicking(false);}},true);
