import {powerFlag} from './power-identity.js';
import {POWERS} from './game-constants.js';
import {GROWTH_MODES} from './growth-setup.js';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function steamStatusText(status={}){
 if(!status.ready)return status.error||'正在连接本机 Steam，请保持启动器运行…';
 if(!status.lobbyId)return status.error||'Steam 已连接，可以创建或加入房间';
 if(!status.connected)return status.error||'房主连接中断 · 正在重新连接，操作已暂停';
 return status.isHost?'你是房主 · Steam 房间已连接':'Steam 房间已连接';
}
export function renderSteamAccount(status={}){
 return `<div class="steam-account"><strong>${esc(status.name||'Steam 玩家')}</strong>${status.steamId?`<small>${esc(status.steamId)}</small>`:''}<span data-steam-status role="status" class="${status.ready&&(!status.lobbyId||status.connected)?'':'room-offline'}">${esc(steamStatusText(status))}</span></div>`;
}
export function renderSteamMembers(status={}){
 const members=Array.isArray(status.members)?status.members:[];
 return members.length?`<h3>Steam 房间成员 · ${members.length} / 4</h3><ul class="steam-members">${members.map(member=>`<li><b>${esc(member.name||member.steamId||'Steam 玩家')}</b><span>${member.seat&&POWERS[member.seat]?POWERS[member.seat].name+' · ':''}${member.steamId===status.hostId?'房主 · ':''}${member.connected?'已连接':'等待连接'}</span></li>`).join('')}</ul>`:'';
}
export function renderSteamEntry(config={},code='',status={}){
 if(status.lobbyId)return `<section class="room-entry steam-entry"><p class="eyebrow">STEAM · 等待房主</p><h2>正在连接房间</h2><p class="room-code steam-code">${esc(status.lobbyId)}</p><div data-steam-account>${renderSteamAccount(status)}</div><div data-steam-members>${renderSteamMembers(status)}</div><p>已进入 Steam 大厅，正在等待房主发送你的局面。连接成功后即可选择势力。</p><div class="room-footer"><button data-room-action="retry">重新连接</button><button data-room-action="leave">退出 Steam 房间</button></div></section>`;
 return `<section class="room-entry steam-entry"><p class="eyebrow">STEAM · 四人对局</p><h2>和 Steam 好友一起玩</h2><div data-steam-account>${renderSteamAccount(status)}</div><p>四位玩家分别运行 Steam 启动器。房主创建房间后，将数字房间号发给其余三位玩家。</p><form data-room-form="join"><label>Steam 房间号<input data-room-code value="${esc(code)}" inputmode="numeric" pattern="[0-9]{17,20}" minlength="17" maxlength="20" placeholder="17至20位数字" autocomplete="off" spellcheck="false" required></label><button class="gold" type="submit" data-steam-ready ${!status.ready?'disabled':''}>加入 Steam 房间</button></form><div class="room-create"><h3>创建新房间</h3><p class="minor">你将成为房主并扮演美国。对局期间请保持本机 Steam 和启动器运行。</p><label><input type="checkbox" data-room-config="dd" ${config.dd?'checked':''}> 外交与霸权</label><label><input type="checkbox" data-room-config="wit" ${config.wit?'checked':''}> 世界动荡</label><label><input type="checkbox" data-room-config="executive" ${config.executive?'checked':''}> 行政命令</label><label>发展牌配置<select data-room-config="growthMode">${Object.entries(GROWTH_MODES).map(([key,label])=>`<option value="${key}" ${(config.growthMode||'families')===key?'selected':''}>${label}</option>`).join('')}</select></label><button type="button" class="gold" data-room-action="create" data-steam-ready ${!status.ready?'disabled':''}>创建 Steam 房间 · 扮演美国</button></div><p class="minor">房间通过 Steam 同步。邀请时只分享房间号；浏览器的本机地址无法在朋友电脑上打开。</p><button data-room-action="retry">重新连接 Steam</button></section>`;
}
export function renderSteamLobby(room,{compact=false,steam:status={}}={}){
 const count=Object.values(room.seats).filter(seat=>seat.occupied).length,members=Array.isArray(status.members)?status.members:[];
 return `<section class="room-lobby steam-lobby ${compact?'compact':''}"><p class="eyebrow">STEAM · ${room.status==='lobby'?'等待入座':'对局进行中'} · ${count} / 4</p><div class="room-heading"><h1>房间 <span class="room-code steam-code">${esc(status.lobbyId||room.code)}</span></h1><button data-room-action="copy">复制房间号</button></div><div data-steam-account>${renderSteamAccount(status)}</div><p>${room.seat?`你的势力：<b>${powerFlag(room.seat)} ${POWERS[room.seat].name}</b>`:'选择一个空位加入对局。'}${room.isHost?' · 房主':''}</p><div class="room-seats">${Object.entries(POWERS).map(([id,power])=>{
  const seat=room.seats[id],self=room.seat===id,member=members.find(item=>item.seat===id),name=member?.name;
  const control=self?'<span class="seat-label">你的席位</span>':seat.occupied?(!room.seat&&seat.mine?`<button data-room-action="takeover" data-room-seat="${id}">恢复我的席位</button>`:'<span class="seat-label">席位已占用</span>'):!room.seat?`<button class="gold" data-room-action="join" data-room-seat="${id}">扮演${power.name}</button>`:'<span class="seat-label">等待好友入座</span>';
  return `<article class="room-seat ${self?'self':''}" style="--pcolor:${power.color}"><span class="room-flag">${powerFlag(id)}</span><h2>${power.name}</h2><p>${esc(name|| (self?status.name||'你':seat.occupied?'已入座':'等待玩家'))}${room.status==='playing'&&seat.occupied?' · '+(seat.setupDone?'已选好牌':'选牌中'):''}</p>${control}</article>`;
 }).join('')}</div><div data-steam-members>${renderSteamMembers(status)}</div><p class="room-instructions">其他玩家在各自电脑上输入房间号并入座，四方入座后由房主开始。刷新页面可恢复本人的席位；短暂断线会暂停操作，连接恢复后继续；原房主退出房间或程序后本局停止。</p><div class="room-modules">${room.config.dd?'外交与霸权已启用':'基础版'}${room.config.wit?' · 世界动荡已启用':''}${room.config.executive?' · 行政命令已启用':''} · ${GROWTH_MODES[room.config.growthMode]||'原存档发展牌配置'}</div><div class="room-footer"><span data-room-status role="status">${esc(steamStatusText(status))}</span>${room.status==='lobby'?(room.isHost?`<button class="gold" data-room-action="start" ${count!==4?'disabled':''}>四人就绪，开始选牌</button>`:'<span>等待房主开始对局</span>'):room.seat?'<button class="gold" data-room-action="back">返回对局</button>':''}<button data-room-action="retry">重新连接</button><button data-room-action="leave">退出 Steam 房间</button></div></section>`;
}
