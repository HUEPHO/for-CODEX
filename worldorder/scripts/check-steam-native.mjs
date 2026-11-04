import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { createSteamTransport, STEAM_TRANSPORT_LIMITS as limits } from '../server/steam-native.js';

const SELF = '76561198000000001', HOST = '76561198000000002', OTHER = '76561198000000003';
const ROOM = '109775241000000001', ROOM2 = '109775241000000002';
const EPOCH = 'test_epoch_1234567890';
const player = id => ({ steamId64: BigInt(id) });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function makeLobby(id = ROOM, host = SELF, members = [SELF, HOST]) {
  return {
    id: BigInt(id), owner: host, members, left: 0,
    data: { worldorder_protocol: '1', worldorder_host: host, worldorder_epoch: EPOCH },
    leave() { this.left++; },
    getMembers() { return this.members.map(player); },
    getOwner() { return player(this.owner); },
    getData(key) { return this.data[key] ?? null; },
    setData(key, value) { this.data[key] = value; return true; },
  };
}
function makeNative() {
  const callbacks = new Map(), inbox = [], sends = [], accepted = [], allocations = [], closedPeers = [];
  const created = makeLobby(), joined = makeLobby(ROOM, HOST);
  const client = {
    localplayer: { getSteamId: () => player(SELF), getName: () => '本机玩家' },
    matchmaking: {
      LobbyType: { FriendsOnly: 1 },
      createLobby: async (type, count) => { assert.equal(type, 1); assert.equal(count, 4); return created; },
      joinLobby: async id => { assert.equal(typeof id, 'bigint'); return joined; },
    },
    callback: {
      SteamCallback: Object.fromEntries(['P2PSessionRequest', 'P2PSessionConnectFail', 'LobbyChatUpdate', 'LobbyDataUpdate', 'SteamServersConnected', 'SteamServersDisconnected', 'SteamServerConnectFailure'].map((value, i) => [value, i])),
      register(type, fn) { const set = callbacks.get(type) || new Set(); set.add(fn); callbacks.set(type, set); return { disconnect() { set.delete(fn); } }; },
    },
    networking: {
      SendType: { Reliable: 2 },
      sendP2PPacket(id, type, data) { sends.push({ id, type, data }); return true; },
      isP2PPacketAvailable() { return inbox[0]?.data.length || 0; },
      readP2PPacket(size) { allocations.push(size); const next = inbox.shift(); return { ...next, size: next.data.length, data: next.data.subarray(0, size) }; },
      acceptP2PSession(id) { accepted.push(id); },
      closeP2PSession(id) { closedPeers.push(id); },
    },
  };
  return {
    client, created, joined, callbacks, inbox, sends, accepted, allocations, closedPeers,
    module: { init: appId => { assert.equal(appId, 480); return client; } },
    emit(event, value = {}) { for (const fn of callbacks.get(client.callback.SteamCallback[event]) || []) fn(value); },
    packet(sender, value) { inbox.push({ steamId: player(sender), data: Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value)) }); },
  };
}

mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
const tick = async (ms = limits.pollMs) => { mock.timers.tick(ms); await Promise.resolve(); await Promise.resolve(); };
let checks = 0;
async function check(title, fn) {
  await fn(); checks++; console.log(`✓ ${title}`);
}

try {
  await check('初始化失败提供中文错误；Steam ID 不接受有精度损失的 Number', async () => {
    await assert.rejects(createSteamTransport({ steamModule: { init() { throw Error('Steam client missing'); } } }), /Steam 初始化失败.*先打开 Steam/);
    const native = makeNative(); native.client.localplayer.getSteamId = () => ({ steamId64: Number(SELF) });
    await assert.rejects(createSteamTransport({ steamModule: native.module }), /Steam ID 无效/);
  });

  await check('创建好友可见四人房间，写入固定房主与随机会话，context 返回副本', async () => {
    const native = makeNative(), transport = await createSteamTransport({ steamModule: native.module });
    const changes = []; transport.onChange(value => changes.push(value));
    const context = await transport.createLobby();
    assert.equal(context.lobbyId, ROOM); assert.equal(context.hostId, SELF); assert.equal(context.ownerId, SELF);
    assert.equal(native.created.data.worldorder_protocol, '1');
    assert.equal(native.created.data.worldorder_host, SELF); assert.notEqual(context.epoch, EPOCH);
    assert.equal(context.members[0].name, '本机玩家');
    context.members.pop(); assert.equal(transport.context().members.length, 2);
    await transport.leaveLobby(); assert.equal(transport.context(), null); assert.equal(changes.at(-1), null);
    assert.ok([...native.callbacks.values()].every(set => !set.size));
    assert.deepEqual(native.closedPeers, [BigInt(HOST)]);
    transport.close();
  });

  await check('支持大于 8KB 的快照，拒绝超额发送、非法 JSON、非成员和冒用数字身份', async () => {
    const native = makeNative(), transport = await createSteamTransport({ steamModule: native.module });
    await transport.joinLobby(ROOM);
    const received = []; const unsubscribe = transport.onMessage((id, object) => received.push({ id, object }));
    const large = { type: 'state', payload: '中'.repeat(10000) };
    assert.equal(transport.send(HOST, large), true);
    assert.equal(native.sends[0].id, BigInt(HOST)); assert.equal(native.sends[0].type, 2);
    assert.ok(native.sends[0].data.length > 8192);
    assert.equal(transport.send(OTHER, large), false);
    assert.equal(transport.send(Number(HOST), large), false);
    assert.equal(transport.send(HOST, { huge: 'x'.repeat(limits.packetBytes) }), false);
    native.packet(HOST, large); native.packet(OTHER, { invalid: 'outsider' }); native.packet(HOST, Buffer.from('{invalid'));
    native.packet(HOST, []); native.packet(HOST, { huge: 'x'.repeat(limits.packetBytes) });
    native.packet(HOST, { type: 'after-oversize' });
    await tick();
    assert.deepEqual(received, [{ id: HOST, object: large }, { id: HOST, object: { type: 'after-oversize' } }]);
    unsubscribe(); native.packet(HOST, { type: 'after-unsubscribe' }); await tick(); assert.equal(received.length, 2);
    transport.close();
  });

  await check('每 tick 的包数、总字节和单次 native 分配都有上限', async () => {
    const native = makeNative(), transport = await createSteamTransport({ steamModule: native.module }); await transport.joinLobby(ROOM);
    const received = []; transport.onMessage((_, value) => received.push(value));
    for (let i = 0; i < limits.packetsPerTick + 7; i++) native.packet(HOST, { i });
    await tick(); assert.equal(received.length, limits.packetsPerTick); assert.equal(native.inbox.length, 7);
    await tick(); assert.equal(received.length, limits.packetsPerTick + 7);
    native.allocations.length = 0;
    for (let i = 0; i < 5; i++) native.packet(HOST, Buffer.alloc(limits.nativePacketBytes));
    await tick(); assert.equal(native.allocations.reduce((a, b) => a + b, 0), limits.bytesPerTick); assert.equal(native.inbox.length, 3);
    assert.ok(native.allocations.every(size => size <= limits.nativePacketBytes));
    transport.close();
  });

  await check('仅接受当前成员 P2P 请求，移除后立即拒收，原房主离开后不自动迁移', async () => {
    const native = makeNative(), transport = await createSteamTransport({ steamModule: native.module }); await transport.joinLobby(ROOM);
    native.emit('P2PSessionRequest', { remote: BigInt(OTHER) });
    native.emit('P2PSessionRequest', { remote: BigInt(HOST) }); assert.deepEqual(native.accepted, [BigInt(HOST)]);
    native.joined.members.push(OTHER); native.emit('LobbyChatUpdate');
    native.emit('P2PSessionRequest', { remote: BigInt(OTHER) }); assert.deepEqual(native.accepted, [BigInt(HOST), BigInt(OTHER)]);
    native.joined.members = [SELF, HOST]; native.emit('P2PSessionRequest', { remote: BigInt(OTHER) }); assert.equal(native.accepted.length, 2);
    native.joined.owner = SELF; native.joined.members = [SELF]; native.emit('LobbyChatUpdate');
    assert.equal(transport.context().hostId, HOST); assert.equal(transport.context().ownerId, SELF);
    assert.equal(transport.context().hostPresent, false); assert.equal(transport.context().connected, false);
    assert.match(transport.context().error, /原房主已离开/);
    native.joined.owner = HOST; native.joined.members = [SELF, HOST]; native.emit('LobbyChatUpdate');
    assert.equal(transport.context().connected, false); assert.equal(transport.send(HOST, {}), false);
    transport.close();
  });

  await check('Steam 断连与会话元数据篡改关闭发送，正常网络恢复后可继续', async () => {
    const native = makeNative(), transport = await createSteamTransport({ steamModule: native.module }); await transport.joinLobby(ROOM);
    native.emit('SteamServersDisconnected'); assert.equal(transport.send(HOST, {}), false);
    native.emit('SteamServersConnected'); assert.equal(transport.send(HOST, {}), true);
    native.emit('P2PSessionConnectFail', { remote: BigInt(HOST), error: 4 }); assert.match(transport.context().error, /数据通道连接失败/);
    native.packet(HOST, { hello: true }); await tick(); assert.equal(transport.context().error, '');
    native.joined.data.worldorder_epoch = 'another_epoch_12345'; native.emit('LobbyDataUpdate');
    assert.equal(transport.context().connected, false); assert.match(transport.context().error, /会话信息已变化/);
    transport.close();
  });

  await check('加入会等待元数据，拒绝其他游戏和房主不匹配；没有数据时 5 秒内退出', async () => {
    const native = makeNative(), transport = await createSteamTransport({ steamModule: native.module });
    const original = { ...native.joined.data }; native.joined.data = {};
    const joining = transport.joinLobby(ROOM); await tick(100); native.joined.data = { ...original }; await tick(100); await joining;
    await transport.leaveLobby(); native.joined.data.worldorder_protocol = 'other-game';
    await assert.rejects(transport.joinLobby(ROOM), /不是兼容的 World Order/);
    native.joined.data = { ...original }; native.joined.owner = SELF;
    await assert.rejects(transport.joinLobby(ROOM), /原房主已经离开/);
    native.joined.owner = HOST; native.joined.data = {};
    const failing = assert.rejects(transport.joinLobby(ROOM), /未能取得 World Order 房间信息/);
    for (let i = 0; i < 52; i++) await tick(100);
    await failing; assert.equal(transport.context(), null); transport.close();
  });

  await check('被新请求覆盖、主动离开、关闭时取消旧请求，迟到结果不会替换当前房间', async () => {
    const native = makeNative(), transport = await createSteamTransport({ steamModule: native.module });
    const first = deferred(), second = deferred(); let calls = 0;
    native.client.matchmaking.joinLobby = () => calls++ ? second.promise : first.promise;
    const oldRequest = assert.rejects(transport.joinLobby(ROOM), /取消/);
    const newRequest = transport.joinLobby(ROOM2);
    const secondLobby = makeLobby(ROOM2, HOST); second.resolve(secondLobby); await newRequest; await oldRequest;
    const firstLobby = makeLobby(ROOM, HOST); first.resolve(firstLobby); await tick();
    assert.equal(transport.context().lobbyId, ROOM2); assert.ok(firstLobby.left > 0); assert.equal(secondLobby.left, 0);
    const delayed = deferred(); native.client.matchmaking.joinLobby = () => delayed.promise;
    const abandoned = assert.rejects(transport.joinLobby(ROOM), /取消/); await transport.leaveLobby(); await abandoned;
    const late = makeLobby(ROOM, HOST); delayed.resolve(late); await tick(); assert.equal(transport.context(), null); assert.ok(late.left > 0);
    const afterClose = deferred(); native.client.matchmaking.createLobby = () => afterClose.promise;
    const closing = assert.rejects(transport.createLobby(), /关闭/); transport.close(); await closing;
    const lateCreated = makeLobby(); afterClose.resolve(lateCreated); await tick(); assert.ok(lateCreated.left > 0);
    assert.ok([...native.callbacks.values()].every(set => !set.size));
    await assert.rejects(transport.createLobby(), /已关闭/);
  });

  await check('同一房间重新加入时，旧回调不能把新加入的 native Lobby 踢出', async () => {
    const native = makeNative(), transport = await createSteamTransport({ steamModule: native.module });
    const first = deferred(), second = deferred(); let calls = 0;
    native.client.matchmaking.joinLobby = () => calls++ ? second.promise : first.promise;
    const abandoned = assert.rejects(transport.joinLobby(ROOM), /取消/);
    const active = transport.joinLobby(ROOM);
    const currentLobby = makeLobby(ROOM, HOST); second.resolve(currentLobby); await active;
    const lateLobby = makeLobby(ROOM, HOST); first.resolve(lateLobby); await abandoned; await tick();
    assert.equal(transport.context().lobbyId, ROOM); assert.equal(currentLobby.left, 0); assert.equal(lateLobby.left, 0);
    transport.close(); assert.equal(currentLobby.left, 1);
  });

  await check('注册 native 监听器失败时清理已注册的回调与半加入的 Lobby', async () => {
    const native = makeNative(), transport = await createSteamTransport({ steamModule: native.module });
    const register = native.client.callback.register; let calls = 0;
    native.client.callback.register = (...args) => { if (++calls === 3) throw Error('callback failure'); return register(...args); };
    await assert.rejects(transport.joinLobby(ROOM), /callback failure/);
    assert.equal(transport.context(), null); assert.ok(native.joined.left > 0);
    assert.ok([...native.callbacks.values()].every(set => !set.size)); transport.close();
  });

  await check('原生接口一直不回调时，有限超时且晚回调仍被清理', async () => {
    const native = makeNative(), transport = await createSteamTransport({ steamModule: native.module });
    const pending = deferred(); native.client.matchmaking.createLobby = () => pending.promise;
    const failing = assert.rejects(transport.createLobby(), /请求超时/);
    await tick(limits.operationTimeoutMs + 1); await failing;
    const late = makeLobby(); pending.resolve(late); await tick(); assert.ok(late.left > 0); assert.equal(transport.context(), null);
    transport.close();
  });
  console.log(`Steam native adapter: ${checks} checks passed (mock native binding; not a real Steam connection).`);
} finally { mock.timers.reset(); }
