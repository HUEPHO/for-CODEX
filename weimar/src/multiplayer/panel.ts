import { FACTIONS } from '../engine/types.ts';
import { SCENARIOS } from '../engine/scenarios.ts';
import type { DesktopStatus, LobbySummary } from './protocol.ts';
const esc = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export function steamPanel(status: DesktopStatus | null, lobbies: LobbySummary[], busy: boolean) {
  const disabled = busy ? ' disabled' : '';
  if (!status)
    return `<details class="steam-panel"><summary>Steam 联机</summary><p>Steam联机使用桌面版。开发电脑运行 <code>pnpm desktop</code>，或打开打包后的 WEIMAR.exe；浏览器仍可用于本地热座。</p></details>`;
  if (!status.available)
    return `<section class="steam-panel"><h2>Steam 联机暂不可用</h2><p>${esc(status.error)}</p><p>本地热座仍可使用。</p></section>`;
  const room = status.snapshot?.room;
  return `<section class="steam-panel"><h2>Steam 联机 <small>${esc(status.self?.name)} · ${status.appId === 480 ? '开发测试' : '已连接'}</small></h2>
    ${status.error ? `<p role="alert" class="steam-error">${esc(status.error)}</p>` : ''}
    ${status.notice ? `<p role="status">${esc(status.notice)}</p>` : ''}
    ${
      status.lobbyId
        ? `
      <p>房间ID：<strong>${esc(status.lobbyId)}</strong> <button id="steam-invite"${disabled}>邀请Steam好友</button> <button id="steam-leave"${disabled}>离开房间</button></p>
      ${
        room
          ? `<p>${SCENARIOS[room.scenario].name} · ${room.started ? (room.paused ? '已暂停，等待原玩家重连' : '对局进行中') : '等待准备'} · 房主 ${esc(room.members.find((m) => m.id === room.host)?.name ?? room.host)}</p>
        <div class="steam-seats">${FACTIONS.map((f) => {
          const owner = room.seats[f],
            member = room.members.find((m) => m.id === owner);
          const mine = owner === status.self?.id;
          return `<div><strong>${f}</strong><span>${owner ? `${esc(member?.name ?? owner)}${!member ? '（断线）' : room.ready.includes(owner) ? ' · 已准备' : ''}` : '空位'}</span>
          ${!room.started && (!owner || mine) ? `<button data-steam-seat="${f}" data-claim="${!mine}"${disabled}>${mine ? '释放阵营' : '选择阵营'}</button>` : ''}</div>`;
        }).join('')}</div>
        ${
          !room.started
            ? `<p>四个阵营需有人控制；一人可以控制多个阵营。</p><button id="steam-ready"${disabled}>${room.ready.includes(status.self!.id) ? '取消准备' : '准备'}</button>${room.host === status.self?.id ? `<button id="steam-start"${disabled}>开始对局</button>` : ''}`
            : room.host === status.self?.id
              ? `<button id="steam-export"${disabled}>导出房主存档</button><small>自动保存已启用；离开后可恢复建房。</small>`
              : ''
        }
      `
          : '<p>正在接收房主状态……</p>'
      }
    `
        : `<div class="steam-connect"><label>联机剧本<select id="steam-scenario">${Object.entries(
            SCENARIOS,
          )
            .map(
              ([id, s]) => `<option value="${id}">${s.name} · ${s.startYear}—${s.endYear}</option>`,
            )
            .join('')}</select></label>
      <button id="steam-create"${disabled}>创建好友房间</button>
      ${status.canResume ? `<button id="steam-resume"${disabled}>恢复上次房主对局</button>` : ''}
      <button id="steam-import"${disabled}>导入房主存档建房</button><input id="steam-save-file" type="file" accept=".json,application/json" hidden />
      <label>房间ID<input id="steam-lobby-id" inputmode="numeric" placeholder="粘贴好友的数字房间ID" /></label><button id="steam-join"${disabled}>加入房间</button>
      <button id="steam-list"${disabled}>查找公开房间</button></div>
      ${lobbies.map((l) => `<p>${esc(l.name)} · ${esc(SCENARIOS[l.scenario as keyof typeof SCENARIOS]?.name ?? l.scenario)} · ${l.members}/4 <button data-steam-join="${esc(l.id)}"${disabled}>加入 ${esc(l.id)}</button></p>`).join('')}
      <small>好友房间通过邀请或房间ID加入；公开搜索只显示同版本WEIMAR房间。</small>`
    }
  </section>`;
}
