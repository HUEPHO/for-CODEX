import {renderPlayerConfiguration} from './non-player-ui.js';
import {powerFlag} from './power-identity.js';
import {GROWTH_MODES} from './growth-setup.js';
import {automatonMode} from './player-configuration.js';

const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function roomModeLabel(config){
 const mode=automatonMode(config);
 return mode==='advanced'?`高级自动机 · ${(config.automaDifficulty||Object.values(config.automas||{})[0])==='hard'?'困难':'普通'}`:mode==='basic'?'基础自动机':'无自动机';
}
export function renderCurrentRoom(room){
 if(!room)return '';
 return `<section class="room-current-card"><div class="room-current-heading"><h2>当前房间</h2><span>${room.status==='playing'?'对局进行中':'等待入座'}</span></div><strong class="room-code">${esc(room.code)}</strong><p>${room.seat?powerFlag(room.seat):'尚未入座'}${room.isHost?' <span>房主</span>':''}<span>${roomModeLabel(room.config)}</span></p><div class="room-current-actions">${room.state&&room.seat?'<button class="gold" data-room-action="back">返回对局</button>':''}<button data-room-action="current">进入当前房间</button></div></section>`;
}
export function renderHallEntry(config={},code='',{room=null,steam=null,account=''}={}){
 const connected=!!steam?.lobbyId,disabled=steam&&(!steam.ready||connected),codeAttrs=steam?'inputmode="numeric" pattern="[0-9]{17,20}" minlength="17" maxlength="20" placeholder="17至20位房间号"':'maxlength="6" placeholder="6位房间号"';
 return `<section class="room-entry room-hall${steam?' steam-hall':''}"><header class="room-hall-heading"><div><p class="eyebrow">${steam?'STEAM · ':''}WORLD ORDER</p><h1>房间大厅</h1></div>${!room&&!steam?'<button data-room-action="local" class="room-local-link">本机对局</button>':''}</header>${account?`<div data-steam-account>${account}</div>`:''}<div class="room-hall-grid"><section class="room-create"><h2>创建房间</h2>${renderPlayerConfiguration(config)}<div class="room-module-options"><label><input type="checkbox" data-room-config="dd" ${config.dd?'checked':''}> 外交与霸权</label><label><input type="checkbox" data-room-config="wit" ${config.wit?'checked':''}> 世界动荡</label><label><input type="checkbox" data-room-config="executive" ${config.executive?'checked':''}> 行政命令</label></div><label class="room-growth-choice"><span>发展牌配置</span><select data-room-config="growthMode">${Object.entries(GROWTH_MODES).map(([key,label])=>`<option value="${key}" ${(config.growthMode||'families')===key?'selected':''}>${label}</option>`).join('')}</select></label><div class="room-create-footer"><span>房主入座首个真人势力</span><button type="button" class="gold" data-room-action="create"${steam?' data-steam-ready':''}${disabled?' disabled':''}>创建${steam?' Steam ':''}房间</button></div></section><aside class="room-hall-side"><div data-current-room>${renderCurrentRoom(room)}</div><section class="room-join-card"><h2>加入房间</h2><form data-room-form="join"><label><span class="sr-only">${steam?'Steam ':''}房间号</span><input data-room-code aria-label="${steam?'Steam ':''}房间号" value="${esc(code)}" ${codeAttrs} autocomplete="off" spellcheck="false" required></label><button class="gold" type="submit"${steam?' data-steam-ready':''}${disabled?' disabled':''}>加入</button></form></section>${steam?'<button data-room-action="retry">重新连接 Steam</button>':'<section class="room-recent-card"><h2>最近创建</h2><div data-recent-rooms></div></section>'}</aside></div></section>`;
}
