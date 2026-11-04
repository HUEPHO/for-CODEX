import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

export const STEAM_TRANSPORT_LIMITS = Object.freeze({
  packetBytes: 512 * 1024,
  nativePacketBytes: 1024 * 1024,
  packetsPerTick: 32,
  bytesPerTick: 2 * 1024 * 1024,
  pollMs: 30,
  metadataTimeoutMs: 5000,
  operationTimeoutMs: 20000,
});

const PROTOCOL = '1';
const META = { protocol: 'worldorder_protocol', host: 'worldorder_host', epoch: 'worldorder_epoch' };
const requireSteam = createRequire(new URL('../steam/package.json', import.meta.url));
const maxSteamId = (1n << 64n) - 1n;

function steamId(value) {
  if (value && typeof value === 'object') value = value.steamId64;
  if (typeof value !== 'string' && typeof value !== 'bigint') throw Error('Steam ID 无效');
  const id = String(value);
  if (!/^[1-9]\d{14,19}$/.test(id) || BigInt(id) > maxSteamId) throw Error('Steam ID 无效');
  return id;
}

function safeLeave(lobby) { try { lobby?.leave(); } catch {} }
function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function userName(value) { return String(value || 'Steam 玩家').slice(0, 80); }

/**
 * Steamworks.js 0.4.0 runs native callbacks itself at 30 Hz. This adapter only
 * polls its P2P queue. Reliable packets already have native fragmentation.
 * A valid Lobby is not proof that the application handshake has completed.
 */
export async function createSteamTransport({ appId = 480, steamModule } = {}) {
  if (!Number.isSafeInteger(appId) || appId < 1 || appId > 0xffffffff) throw Error('Steam AppID 无效');
  let steam, selfId, name;
  try {
    const binding = steamModule || requireSteam('steamworks.js');
    steam = binding.init(appId);
    selfId = steamId(steam.localplayer.getSteamId());
    name = userName(steam.localplayer.getName());
    if (!steam.matchmaking?.createLobby || !steam.matchmaking?.joinLobby || !steam.networking?.readP2PPacket || !steam.callback?.register) throw Error('Steam 接口不完整');
  } catch (cause) {
    if (cause?.code === 'ERR_DLOPEN_FAILED') throw new Error('Steam 原生组件加载失败：请完整解压客户端，并安装 Microsoft Visual C++ x64 运行库；官方安装入口见包内 README.txt。' + (cause?.message ? `（${cause.message}）` : ''), { cause });
    throw new Error('Steam 初始化失败：请先打开 Steam 并登录，确认已安装联机组件后重新启动。' + (cause?.message ? `（${cause.message}）` : ''), { cause });
  }

  let lobby = null, current = null, generation = 0, pending = null, closed = false;
  let poll = null, handles = [], online = true, stoppedReason = '', networkError = '';
  const messageListeners = new Set(), changeListeners = new Set();
  const snapshot = () => current ? structuredClone(current) : null;
  const notify = () => { for (const fn of changeListeners) { try { fn(snapshot()); } catch {} } };
  const setCurrent = value => {
    if (JSON.stringify(current) === JSON.stringify(value)) return;
    current = value;
    notify();
  };
  const closePeer = id => {
    // 0.4.0 does not export this method; use it if a compatible binding adds it.
    try { steam.networking.closeP2PSession?.(BigInt(id)); } catch {}
  };
  function stopMonitoring() {
    clearInterval(poll); poll = null;
    for (const handle of handles.splice(0)) { try { handle.disconnect(); } catch {} }
  }
  function detach() {
    stopMonitoring();
    for (const member of current?.members || []) if (member.id !== selfId) closePeer(member.id);
    const previous = lobby; lobby = null;
    safeLeave(previous);
    stoppedReason = ''; networkError = ''; online = true;
    setCurrent(null);
  }
  function discardCandidate(candidate, operation) {
    if (!candidate) return;
    let id;
    try { id = steamId(candidate.id); } catch { safeLeave(candidate); return; }
    // A late callback for the same native Lobby must not evict a newer join.
    if (lobby && id === current?.lobbyId) return;
    if (pending && pending !== operation && pending.joinId === id) return;
    safeLeave(candidate);
  }
  function cancelPending(reason) {
    if (!pending) return;
    const operation = pending; pending = null;
    operation.cancel(Error(reason));
    discardCandidate(operation.candidate, operation);
  }
  function readMembers(candidate) {
    const members = candidate.getMembers();
    if (!Array.isArray(members) || members.length > 4) throw Error('Steam 房间成员数量无效');
    const ids = members.map(steamId);
    if (new Set(ids).size !== ids.length) throw Error('Steam 房间成员无效');
    return ids.map(id => ({ id, name: id === selfId ? name : `Steam 玩家 ${id.slice(-4)}` }));
  }
  function refreshContext() {
    if (!lobby || !current) return;
    try {
      const members = readMembers(lobby), ownerId = steamId(lobby.getOwner());
      const hostPresent = members.some(member => member.id === current.hostId);
      if (!stoppedReason && (!hostPresent || ownerId !== current.hostId)) stoppedReason = '原房主已离开，游戏暂停；不支持自动迁移房主。';
      if (!stoppedReason && !members.some(member => member.id === selfId)) stoppedReason = '你已离开 Steam 房间，请重新加入。';
      if (!stoppedReason && (lobby.getData(META.protocol) !== PROTOCOL || lobby.getData(META.host) !== current.hostId || lobby.getData(META.epoch) !== current.epoch)) stoppedReason = 'Steam 房间会话信息已变化，请重新加入。';
      const oldIds = new Set(members.map(member => member.id));
      for (const member of current.members) if (!oldIds.has(member.id)) closePeer(member.id);
      setCurrent({ ...current, members, ownerId, hostPresent, connected: !stoppedReason && online, error: stoppedReason || (!online ? 'Steam 连接已断开，正在等待恢复。' : networkError) });
    } catch (error) {
      setCurrent({ ...current, connected: false, error: `读取 Steam 房间失败：${error.message}` });
    }
  }
  function isMember(id) { return !!current?.connected && current.members.some(member => member.id === id); }
  function register(event, fn) {
    const type = steam.callback.SteamCallback?.[event];
    if (type === undefined) return;
    handles.push(steam.callback.register(type, value => { if (!closed && lobby) fn(value); }));
  }
  function startMonitoring() {
    register('LobbyChatUpdate', () => refreshContext());
    register('LobbyDataUpdate', () => refreshContext());
    register('SteamServersConnected', () => { online = true; networkError = ''; refreshContext(); });
    register('SteamServersDisconnected', () => { online = false; refreshContext(); });
    register('SteamServerConnectFailure', () => { online = false; refreshContext(); });
    register('P2PSessionRequest', ({ remote }) => {
      refreshContext();
      try {
        const id = steamId(remote);
        if (id !== selfId && isMember(id)) steam.networking.acceptP2PSession(BigInt(id));
      } catch {}
    });
    register('P2PSessionConnectFail', ({ remote, error }) => {
      try {
        if (isMember(steamId(remote))) { networkError = `Steam 数据通道连接失败（${Number(error) || 0}），正在重试。`; refreshContext(); }
      } catch {}
    });
    poll = setInterval(pump, STEAM_TRANSPORT_LIMITS.pollMs);
    poll.unref?.();
  }
  function pump() {
    if (closed || !lobby) return;
    refreshContext();
    let bytes = 0;
    try {
      for (let count = 0; count < STEAM_TRANSPORT_LIMITS.packetsPerTick; count++) {
        const size = steam.networking.isP2PPacketAvailable();
        if (!size) break;
        if (!Number.isSafeInteger(size) || size < 0) throw Error('数据包长度无效');
        // Oversize reliable packets are drained with at most the SDK's 1 MiB
        // maximum allocation, then discarded before parsing or dispatch.
        const allocation = Math.min(size, STEAM_TRANSPORT_LIMITS.nativePacketBytes);
        if (bytes + allocation > STEAM_TRANSPORT_LIMITS.bytesPerTick) break;
        bytes += allocation;
        const packet = steam.networking.readP2PPacket(allocation);
        if (size > STEAM_TRANSPORT_LIMITS.packetBytes || !Buffer.isBuffer(packet?.data) || packet.data.length !== size || (packet.size !== undefined && packet.size !== size)) continue;
        let id, object;
        try {
          id = steamId(packet.steamId);
          if (id === selfId || !isMember(id)) continue;
          object = JSON.parse(packet.data.toString('utf8'));
          if (!plainObject(object)) continue;
        } catch { continue; }
        if (networkError) { networkError = ''; refreshContext(); }
        for (const fn of messageListeners) { try { fn(id, object); } catch {} }
      }
    } catch (error) {
      if (current) setCurrent({ ...current, connected: false, error: `读取 Steam 数据失败：${error.message}` });
    }
  }
  async function validateCandidate(candidate, kind, operation) {
    const lobbyId = steamId(candidate.id);
    if (operation.joinId && operation.joinId !== lobbyId) throw Error('Steam 返回的房间号不匹配');
    let hostId, epoch;
    if (kind === 'create') {
      hostId = selfId; epoch = randomUUID();
      for (const [key, value] of [[META.protocol, PROTOCOL], [META.host, hostId], [META.epoch, epoch]]) {
        if (!candidate.setData(key, value)) throw Error('Steam 房间信息写入失败，请重新建房');
      }
    } else {
      const deadline = Date.now() + STEAM_TRANSPORT_LIMITS.metadataTimeoutMs;
      for (;;) {
        if (operation.generation !== generation || closed) throw Error('Steam 房间请求已取消');
        const protocol = candidate.getData(META.protocol);
        hostId = candidate.getData(META.host); epoch = candidate.getData(META.epoch);
        if (protocol && protocol !== PROTOCOL) throw Error('这不是兼容的 World Order 房间，请检查房间号');
        if (protocol === PROTOCOL && hostId && epoch) break;
        if (Date.now() >= deadline) throw Error('未能取得 World Order 房间信息，请检查房间号并重试');
        await new Promise(resolve => {
          operation.wake = resolve;
          operation.waitTimer = setTimeout(resolve, 100);
        });
        operation.wake = null;
      }
    }
    hostId = steamId(hostId);
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(epoch)) throw Error('Steam 房间会话标识无效');
    const ownerId = steamId(candidate.getOwner()), members = readMembers(candidate);
    if (ownerId !== hostId || !members.some(member => member.id === hostId)) throw Error('原房主已经离开，请重新建房');
    if (!members.some(member => member.id === selfId)) throw Error('尚未加入 Steam 房间，请重试');
    return { lobbyId, hostId, epoch, ownerId, members, hostPresent: true, connected: true, error: '' };
  }
  async function enter(kind, id) {
    if (closed) throw Error('Steam 联机已关闭，请重新启动');
    const joinId = kind === 'join' ? steamId(typeof id === 'string' ? id.trim() : id) : null;
    generation++;
    cancelPending('Steam 房间请求已被新的操作取消');
    detach();
    const operation = { generation, joinId, candidate: null, waitTimer: null, wake: null, cancel: null };
    const cancelled = new Promise((_, reject) => { operation.cancel = error => {
      clearTimeout(operation.waitTimer); operation.wake?.(); reject(error);
    }; });
    pending = operation;
    const timeout = setTimeout(() => {
      if (pending !== operation) return;
      generation++;
      cancelPending('Steam 房间请求超时，请检查 Steam 连接后重试');
    }, STEAM_TRANSPORT_LIMITS.operationTimeoutMs);
    const work = (async () => {
      const candidate = await (kind === 'create'
        ? steam.matchmaking.createLobby(steam.matchmaking.LobbyType?.FriendsOnly ?? 1, 4)
        : steam.matchmaking.joinLobby(BigInt(joinId)));
      operation.candidate = candidate;
      if (operation.generation !== generation || closed) { discardCandidate(candidate, operation); throw Error('Steam 房间请求已取消'); }
      const context = await validateCandidate(candidate, kind, operation);
      if (operation.generation !== generation || closed) { discardCandidate(candidate, operation); throw Error('Steam 房间请求已取消'); }
      lobby = candidate;
      setCurrent(context);
      startMonitoring();
      return snapshot();
    })();
    try { return await Promise.race([work, cancelled]); }
    catch (error) {
      if (lobby === operation.candidate && operation.generation === generation) detach();
      else discardCandidate(operation.candidate, operation);
      throw new Error(error?.message || 'Steam 房间操作失败，请重试', { cause: error });
    } finally {
      clearTimeout(timeout); clearTimeout(operation.waitTimer);
      if (pending === operation) pending = null;
    }
  }
  function send(peerId, object) {
    if (closed || !plainObject(object)) return false;
    refreshContext();
    try {
      const id = steamId(peerId);
      if (id === selfId || !isMember(id)) return false;
      const data = Buffer.from(JSON.stringify(object));
      if (data.length > STEAM_TRANSPORT_LIMITS.packetBytes) return false;
      return !!steam.networking.sendP2PPacket(BigInt(id), steam.networking.SendType?.Reliable ?? 2, data);
    } catch { return false; }
  }
  async function leaveLobby() {
    generation++;
    cancelPending('Steam 房间请求已取消');
    detach();
  }
  function close() {
    if (closed) return;
    closed = true; generation++;
    cancelPending('Steam 联机已关闭');
    detach();
    messageListeners.clear(); changeListeners.clear();
    // The 0.4.0 binding has no shutdown export; the bridge exits its process.
  }
  function subscribe(set, fn) {
    if (typeof fn !== 'function') throw TypeError('监听器必须是函数');
    if (closed) throw Error('Steam 联机已关闭');
    set.add(fn); return () => set.delete(fn);
  }
  return {
    selfId, name,
    createLobby: () => enter('create'), joinLobby: id => enter('join', id),
    leaveLobby, context: snapshot, send,
    onMessage: fn => subscribe(messageListeners, fn),
    onChange: fn => subscribe(changeListeners, fn), close,
  };
}
