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
export function renderRoomEntry(config={},code='',{steam}={}){
 if(steam)return renderSteamEntry(config,code,steam);
 return `<section class="room-entry"><p class="eyebrow">四人对局</p><h2>创建或加入房间</h2><p>一个标签页扮演一个势力，四方共同操作同一盘游戏。</p><form data-room-form="join"><label>房间号<input data-room-code value="${esc(code)}" maxlength="6" placeholder="6位房间号" autocomplete="off" spellcheck="false" required></label><button class="gold" type="submit">加入房间</button></form><div class="room-create"><h3>开一间新房</h3><p class="minor">你在当前标签页扮演美国，再从大厅打开另外三个势力。</p><label><input type="checkbox" data-room-config="dd" ${config.dd?'checked':''}> 外交与霸权</label><label><input type="checkbox" data-room-config="wit" ${config.wit?'checked':''}> 世界动荡</label><label><input type="checkbox" data-room-config="executive" ${config.executive?'checked':''}> 行政命令</label><label>发展牌配置<select data-room-config="growthMode">${Object.entries(GROWTH_MODES).map(([key,label])=>`<option value="${key}" ${(config.growthMode||'families')===key?'selected':''}>${label}</option>`).join('')}</select></label><p class="minor">未启用外交与霸权时使用基础发展牌。四人局共20张，各级数量为6／4／4／4／2。</p><button type="button" class="gold" data-room-action="create">创建房间 · 扮演美国</button></div><div data-recent-rooms></div></section>`;
}
export function renderRoomLobby(room,{compact=false,steam}={}){
 if(steam)return renderSteamLobby(room,{compact,steam});
 const count=Object.values(room.seats).filter(s=>s.occupied).length;
 return `<section class="room-lobby ${compact?'compact':''}"><p class="eyebrow">${room.status==='lobby'?'等待入座':'对局进行中'} · ${count} / 4</p><div class="room-heading"><h1>房间 <span class="room-code">${room.code}</span></h1><button data-room-action="copy">复制房间链接</button></div><p>${room.seat?`本标签页：<b>${powerFlag(room.seat)}</b>`:'选择一个空位加入对局。'}${room.isHost?' · 房主':''}</p><div class="room-seats">${Object.entries(POWERS).map(([id,power])=>{
  const seat=room.seats[id],self=room.seat===id;
  return `<article class="room-seat ${self?'self':''}" style="--pcolor:${power.color}"><span class="room-flag">${powerFlag(id)}</span><p>${self?'本标签页':seat.occupied?'已入座':'等待玩家'}${room.status==='playing'&&seat.occupied?' · '+(seat.setupDone?'已选好牌':'选牌中'):''}</p>${self?'<span class="seat-label">你的席位</span>':seat.occupied?(!room.seat&&seat.mine?`<button data-room-action="takeover" data-room-seat="${id}">在此恢复席位</button>`:'<span class="seat-label">席位已占用</span>'):room.seat?`<a class="room-seat-link" href="${esc(roomLink(room.code,id))}" target="_blank" rel="noopener noreferrer">在新标签页扮演${power.name} ↗</a>`:`<button class="gold" data-room-action="join" data-room-seat="${id}">扮演${power.name}</button>`}</article>`;
 }).join('')}</div><p class="room-instructions">把房间链接发给其他玩家，选择空位入座；四方就绪后由房主开始选牌。同机自测也可分别打开另外三个势力的新标签页。刷新可续接本人席位。</p><div class="room-modules">${room.config.dd?'外交与霸权已启用':'基础版'}${room.config.wit?' · 世界动荡已启用':''}${room.config.executive?' · 行政命令已启用':''} · ${GROWTH_MODES[room.config.growthMode]||'原存档发展牌配置'}</div><div class="room-footer"><span data-room-status role="status">已同步</span>${room.status==='lobby'?(room.isHost?`<button class="gold" data-room-action="start" ${count!==4?'disabled':''}>四人就绪，开始选牌</button>`:'<span>等待房主开始对局</span>'):room.seat?'<button class="gold" data-room-action="back">返回对局</button>':''}<button data-room-action="retry">重新同步</button><button data-room-action="leave">${room.seat?'离开席位并返回本地桌面':'返回本地桌面'}</button></div></section>`;
}
export function renderRoomFlow(s,cards){
 const actor=roomActor(s);
 if(activeInteraction(s)?.shared)return renderFlow(s,cards);
 if(!s.flow)return '<section class="flow-panel"><b>四方开局选牌</b><p>在下方完成本方选择；四方确认后自动确定首轮顺序。</p></section>';
 if(actor&&actor!==s.current){
  const interaction=activeInteraction(s),response=interaction&&interaction.actor!==interaction.owner;
  return `${renderPhaseOverview(s)}<section class="flow-panel room-waiting" aria-live="polite"><b>${response?'等待玩家回应':'等待其他玩家'} · ${powerFlag(actor)} ${POWERS[actor].name}</b><p>第${s.round}轮 · ${s.phase}。${response?'当前卡牌暂停，等待该势力完成选择后继续。':'完成后会自动同步到你的标签页。'}</p>${manualWindow(s)?'<p>此阶段可在下方补记本方资源与产能，流程确认由当前玩家完成。</p>':'<p>你可以查看自己的手牌、盟国和公共市场。</p>'}${renderSequenceReport(s)}</section>`;
 }
 return renderFlow(s,cards);
}
export function recentRoomLinks(rooms){return rooms.length?`<h3>最近创建的房间</h3><div class="recent-rooms">${rooms.map(room=>`<button data-room-action="recent" data-room-code="${esc(room.code)}">${esc(room.code)} · ${esc(new Date(room.updated_at).toLocaleDateString('zh-CN'))}</button>`).join('')}</div>`:'<p class="minor">还没有创建过房间。</p>';}
