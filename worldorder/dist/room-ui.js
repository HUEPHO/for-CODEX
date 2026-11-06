import {automatonLabel} from './non-player-ui.js';
import {renderHallEntry,roomModeLabel} from './room-hall-ui.js';
export {renderCurrentRoom} from './room-hall-ui.js';
import {powerFlag} from './power-identity.js';
import {GROWTH_MODES} from './growth-setup.js';
import {POWERS} from './game-constants.js';
import {activeInteraction} from './interaction-state.js';
import {renderFlow} from './flow-ui.js';
import {renderSequenceReport} from './card-sequence-ui.js';
import {roomActor,manualWindow} from './room-rules.js';
import {roomLink} from './room-client.js';
import {renderPhaseOverview} from './phase-ui.js';
import {renderSteamEntry,renderSteamLobby} from './steam-ui.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderRoomEntry(config={},code='',{steam,room=null}={}){
 return steam?renderSteamEntry(config,code,steam,{room}):renderHallEntry(config,code,{room});
}
export function renderRoomLobby(room,{compact=false,steam}={}){
 if(steam)return renderSteamLobby(room,{compact,steam});
 const count=Object.values(room.seats).filter(s=>s.occupied).length;
 return `<section class="room-lobby ${compact?'compact':''}"><p class="eyebrow">${room.status==='lobby'?'等待入座':'对局进行中'} · ${count} / ${(room.config.humans||Object.keys(POWERS)).length}</p><div class="room-heading"><h1>房间 <span class="room-code">${room.code}</span></h1><div class="room-heading-actions"><button data-room-action="hall">返回房间大厅</button><button data-room-action="copy">复制房间链接</button></div></div><p>${room.seat?`本标签页：<b>${powerFlag(room.seat)}</b>`:'选择一个空位加入对局。'}${room.isHost?' · 房主':''}</p><div class="room-config-summary"><b>${roomModeLabel(room.config)}</b><span>${(room.config.humans||Object.keys(POWERS)).length}位真人</span></div><div class="room-seats">${Object.entries(POWERS).map(([id,power])=>{
  const seat=room.seats[id],self=room.seat===id;
  if(seat.nonPlayer)return `<article class="room-seat" style="--pcolor:${power.color}"><span class="room-flag">${powerFlag(id)}</span><p>${automatonLabel(room.config,id)}</p></article>`;
  return `<article class="room-seat ${self?'self':''}" style="--pcolor:${power.color}"><span class="room-flag">${powerFlag(id)}</span><span class="room-seat-kind">真人</span><p>${self?'本标签页':seat.occupied?'已入座':'等待玩家'}${room.status==='playing'&&seat.occupied?' · '+(seat.setupDone?'已选好牌':'选牌中'):''}</p>${self?'<span class="seat-label">你的席位</span>':seat.occupied?(!room.seat&&seat.mine?`<button data-room-action="takeover" data-room-seat="${id}">在此恢复席位</button>`:'<span class="seat-label">席位已占用</span>'):room.seat?`<a class="room-seat-link" href="${esc(roomLink(room.code,id))}" target="_blank" rel="noopener noreferrer">在新标签页扮演${power.name} ↗</a>`:`<button class="gold" data-room-action="join" data-room-seat="${id}">扮演${power.name}</button>`}</article>`;
 }).join('')}</div><p class="room-instructions">分享房间链接邀请真人入座，就绪后由房主开始。</p><div class="room-modules">${room.config.dd?'外交与霸权已启用':'基础版'}${room.config.wit?' · 世界动荡已启用':''}${room.config.executive?' · 行政命令已启用':''} · ${GROWTH_MODES[room.config.growthMode]||'原存档发展牌配置'}</div><div class="room-footer"><span data-room-status role="status">已同步</span>${room.status==='lobby'?(room.isHost?`<button class="gold" data-room-action="start" ${count!==(room.config.humans||Object.keys(POWERS)).length?'disabled':''}>玩家就绪，开始选牌</button>`:'<span>等待房主开始对局</span>'):room.seat?'<button class="gold" data-room-action="back">返回对局</button>':''}<button data-room-action="retry">重新同步</button><button data-room-action="leave">离开房间</button></div></section>`;
}
export function renderRoomFlow(s,cards){
 const actor=roomActor(s);
 if(activeInteraction(s)?.shared)return renderFlow(s,cards);
 if(!s.flow)return '<section class="flow-panel"><b>玩家开局选牌</b><p>在下方完成本方选择；玩家确认后自动确定首轮顺序。</p></section>';
 if(actor&&actor!==s.current){
  const interaction=activeInteraction(s),response=interaction&&interaction.actor!==interaction.owner;
  return `${renderPhaseOverview(s)}<section class="flow-panel room-waiting" aria-live="polite"><b>${response?'等待玩家回应':'等待其他玩家'} · ${powerFlag(actor)} ${POWERS[actor].name}</b><p>第${s.round}轮 · ${s.phase}。${response?'当前卡牌暂停，等待该势力完成选择后继续。':'完成后会自动同步到你的标签页。'}</p>${manualWindow(s)?'<p>此阶段可在下方补记本方资源与产能，流程确认由当前玩家完成。</p>':'<p>你可以查看自己的手牌、盟国和公共市场。</p>'}${renderSequenceReport(s)}</section>`;
 }
 return renderFlow(s,cards);
}
export function recentRoomLinks(rooms){return rooms.length?`<div class="recent-rooms">${rooms.map(room=>`<button data-room-action="recent" data-room-code="${esc(room.code)}">${esc(room.code)} · ${esc(new Date(room.updated_at).toLocaleDateString('zh-CN'))}</button>`).join('')}</div>`:'<p class="minor">还没有创建过房间。</p>';}
