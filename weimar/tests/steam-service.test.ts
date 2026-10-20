import test from 'node:test';
import assert from 'node:assert/strict';
import { SteamService } from '../desktop/steam-service.ts';
import { FACTIONS } from '../src/engine/types.ts';
import { LOBBY_TAG, NETWORK_VERSION } from '../src/multiplayer/protocol.ts';
import type { DesktopStatus, RoomRequest, WireMessage } from '../src/multiplayer/protocol.ts';

type Steam = ConstructorParameters<typeof SteamService>[0];
type Packet = { data: Buffer; size: number; steamId: { steamId64: bigint } };
type FakeLobby = { id: bigint; owner: string; members: Set<string>; data: Record<string, string> };
class FakeSteam {
  lobbies = new Map<string, FakeLobby>();
  queues = new Map<string, Packet[]>();
  callbacks = new Map<string, Map<number, (arg: never) => void>>();
  sent: { from: string; to: string; body: WireMessage }[] = [];
  saves = new Map<string, string>();
  statuses = new Map<string, DesktopStatus>();
  peers = new Map<string, SteamService>();
  brokenSaves = false;
  failSends = false;
  nextLobby = 9001;
  id(id: string) {
    return { steamId64: BigInt(id), steamId32: id, accountId: Number(id) };
  }
  lobby(value: FakeLobby, peer: string) {
    return {
      id: value.id,
      getMembers: () => [...value.members].map((id) => this.id(id)),
      getOwner: () => this.id(value.owner),
      getMemberCount: () => BigInt(value.members.size),
      getData: (key: string) => value.data[key] ?? null,
      mergeFullData: (data: Record<string, string>) => {
        Object.assign(value.data, data);
        return true;
      },
      setJoinable: () => true,
      leave: () => {
        value.members.delete(peer);
        if (value.owner === peer) value.owner = [...value.members][0] ?? '0';
      },
      openInviteDialog: () => {},
    };
  }
  add(peer: string) {
    this.queues.set(peer, []);
    this.callbacks.set(peer, new Map());
    const sdk = {
      localplayer: { getSteamId: () => this.id(peer), getName: () => `Player ${peer}` },
      matchmaking: {
        createLobby: async () => {
          const value = {
            id: BigInt(this.nextLobby++),
            owner: peer,
            members: new Set([peer]),
            data: {},
          };
          this.lobbies.set(String(value.id), value);
          return this.lobby(value, peer);
        },
        joinLobby: async (id: bigint) => {
          const value = this.lobbies.get(String(id));
          if (!value) throw new Error('missing lobby');
          value.members.add(peer);
          return this.lobby(value, peer);
        },
        getLobbies: async () => [...this.lobbies.values()].map((l) => this.lobby(l, peer)),
      },
      callback: {
        register: (id: number, handler: (arg: never) => void) => {
          this.callbacks.get(peer)!.set(id, handler);
          return { disconnect: () => this.callbacks.get(peer)!.delete(id) };
        },
      },
      networking: {
        sendP2PPacket: (to: bigint, type: number, data: Buffer) => {
          assert.equal(type, 2, 'Steam reliable transport');
          if (this.failSends) return false;
          this.sent.push({ from: peer, to: String(to), body: JSON.parse(data.toString()) });
          this.queues.get(String(to))?.push({ data, size: data.length, steamId: this.id(peer) });
          return true;
        },
        isP2PPacketAvailable: () => this.queues.get(peer)![0]?.size ?? 0,
        readP2PPacket: () => this.queues.get(peer)!.shift()!,
        acceptP2PSession: () => {},
      },
    } as unknown as Steam;
    const service = new SteamService(
      sdk,
      480,
      {
        read: () => this.saves.get(peer) ?? null,
        write: (text) => {
          if (this.brokenSaves) throw new Error('disk full');
          this.saves.set(peer, text);
        },
      },
      (status) => this.statuses.set(peer, structuredClone(status)),
    );
    this.peers.set(peer, service);
    return service;
  }
  pump() {
    for (let n = 0; n < 4; n++) for (const peer of this.peers.values()) peer.tick();
  }
  snapshot(peer: string) {
    return this.peers.get(peer)!.status().snapshot!;
  }
  inject(from: string, to: string, message: unknown) {
    const data = Buffer.from(JSON.stringify(message));
    this.queues.get(to)!.push({ data, size: data.length, steamId: this.id(from) });
  }
}
async function fourPlayers() {
  const network = new FakeSteam();
  const peers = ['1001', '1002', '1003', '1004'].map((id) => network.add(id));
  await peers[0].create('fate');
  for (const peer of peers.slice(1)) {
    await peer.join('9001');
    network.pump();
  }
  for (let i = 1; i < 4; i++) {
    peers[i].request({ type: 'seat', faction: FACTIONS[i], claim: true });
    network.pump();
  }
  for (const peer of peers) {
    peer.request({ type: 'ready', ready: true });
    network.pump();
  }
  peers[0].request({ type: 'start' });
  network.pump();
  return { network, peers };
}
function command(peer: SteamService, value: Extract<RoomRequest, { type: 'command' }>['command']) {
  peer.request({
    type: 'command',
    revision: peer.status().snapshot!.view!.state.revision,
    command: value,
  });
}

test('four Steam adapters create/join/ready/start and synchronize a complete half-year round', async () => {
  const { network, peers } = await fourPlayers();
  command(peers[0], { type: 'set-order', actor: 'Coalition', order: [...FACTIONS] });
  network.pump();
  for (let i = 0; i < 4; i++) {
    command(peers[i], { type: 'pass', actor: FACTIONS[i] });
    network.pump();
    command(peers[i], { type: 'end-turn', actor: FACTIONS[i] });
    network.pump();
  }
  command(peers[0], { type: 'advance', actor: 'Coalition' });
  network.pump();
  command(peers[0], { type: 'advance', actor: 'Coalition' });
  network.pump();
  for (const peer of peers) {
    const snapshot = peer.status().snapshot!;
    assert.equal(snapshot.view!.state.half, 'late');
    assert.equal(snapshot.view!.state.revision, 11);
    assert.equal(snapshot.room.started, true);
    assert.equal(snapshot.room.paused, false);
  }
  assert.ok(network.saves.get('1001')!.includes('weimar-steam-1'));
  assert.equal(network.saves.has('1002'), false);
});

test('actual wire payloads deliver each hand only to its owner', async () => {
  const { network } = await fourPlayers();
  const first = network.snapshot('1001').view!;
  for (const id of ['1002', '1003', '1004']) {
    const snapshot = network.snapshot(id);
    const faction = snapshot.view!.factions[0];
    assert.equal(snapshot.view!.state.hands[faction].length, 7);
    assert.deepEqual(snapshot.view!.state.hands.Coalition, []);
    const packets = network.sent.filter(
      (p) => p.to === id && p.body.kind === 'snapshot' && p.body.snapshot.view,
    );
    for (const packet of packets) {
      const json = JSON.stringify(packet.body);
      for (const card of first.state.hands.Coalition) assert.ok(!json.includes(`"${card.uid}"`));
      assert.ok(!json.includes('"commands"'));
    }
  }
});

test('Steam sender identity rejects impersonation and old revisions without changing state', async () => {
  const { network, peers } = await fourPlayers();
  const forged: RoomRequest = {
    type: 'command',
    revision: 0,
    command: { type: 'set-order', actor: 'Coalition', order: [...FACTIONS] },
  };
  peers[1].request(forged);
  network.pump();
  assert.match(peers[1].status().error!, /其他玩家/);
  assert.equal(network.snapshot('1001').view!.state.revision, 0);
  command(peers[0], forged.command);
  network.pump();
  peers[1].request(forged);
  network.pump();
  assert.match(peers[1].status().error!, /局面已更新/);
  assert.equal(network.snapshot('1001').view!.state.revision, 1);
});

test('non-host snapshots, unrelated lobbies and protocol versions are ignored', async () => {
  const { network } = await fourPlayers();
  const before = structuredClone(network.snapshot('1002'));
  const fake = structuredClone(before);
  fake.room.version += 100;
  fake.view!.state.year = 9999;
  const message = { protocol: NETWORK_VERSION, lobby: '9001', kind: 'snapshot', snapshot: fake };
  network.inject('1003', '1002', message);
  network.inject('1001', '1002', { ...message, lobby: '9002' });
  network.inject('1001', '1002', { ...message, protocol: 'other-game' });
  network.inject('9999', '1002', message);
  network.pump();
  assert.deepEqual(network.snapshot('1002'), before);
});

test('member disconnect pauses commands; rejoining same Steam ID receives the current private view', async () => {
  const { network, peers } = await fourPlayers();
  peers[1].leave();
  peers[0].tick(Date.now() + 1100);
  network.pump();
  assert.equal(network.snapshot('1001').room.paused, true);
  assert.throws(
    () => command(peers[0], { type: 'set-order', actor: 'Coalition', order: [...FACTIONS] }),
    /断线/,
  );
  await peers[1].join('9001');
  network.pump();
  assert.equal(network.snapshot('1002').room.paused, false);
  assert.equal(network.snapshot('1002').room.seats.KPD, '1002');
  assert.equal(network.snapshot('1002').view!.state.hands.KPD.length, 7);
});

test('automatic Steam ownership transfer never promotes a client with incomplete state into game host', async () => {
  const { network, peers } = await fourPlayers();
  peers[0].leave();
  peers[1].tick(Date.now() + 1100);
  assert.equal(peers[1].status().snapshot, null);
  assert.match(peers[1].status().error!, /原房主/);
  assert.equal(network.saves.has('1002'), false);
});

test('host recovers saved rules in a new lobby and reconnecting peers retain original factions', async () => {
  const { network, peers } = await fourPlayers();
  command(peers[0], { type: 'set-order', actor: 'Coalition', order: [...FACTIONS] });
  network.pump();
  const before = structuredClone(network.snapshot('1002').view!.state);
  for (const peer of peers) peer.leave();
  await peers[0].resume();
  for (const peer of peers.slice(1)) {
    await peer.join('9002');
    network.pump();
  }
  assert.equal(network.snapshot('1002').room.paused, false);
  assert.deepEqual(network.snapshot('1002').view!.state, before);
  assert.equal(network.snapshot('1002').room.seats.KPD, '1002');
});

test('a lost update is recovered by a full sync without resubmitting the command', async () => {
  const { network, peers } = await fourPlayers();
  command(peers[0], { type: 'set-order', actor: 'Coalition', order: [...FACTIONS] });
  network.queues.get('1002')!.length = 0;
  network.pump();
  assert.equal(network.snapshot('1002').view!.state.revision, 0);
  peers[1].request({ type: 'sync' });
  network.pump();
  assert.equal(network.snapshot('1002').view!.state.revision, 1);
});

test('Steam server disconnect blocks commands and reconnect resynchronizes the room', async () => {
  const { network, peers } = await fourPlayers();
  network.callbacks.get('1001')!.get(2)!({} as never);
  assert.equal(peers[0].status().snapshot!.view!.canAct, false);
  assert.throws(
    () => command(peers[0], { type: 'set-order', actor: 'Coalition', order: [...FACTIONS] }),
    /尚未恢复/,
  );
  network.callbacks.get('1001')!.get(1)!({} as never);
  network.pump();
  assert.equal(peers[0].status().snapshot!.view!.canAct, true);
});

test('room discovery filters unrelated Spacewar projects and incompatible builds', async () => {
  const network = new FakeSteam(),
    host = network.add('1001'),
    other = network.add('1002');
  await host.create('new-hope');
  network.lobbies.set('9002', {
    id: 9002n,
    owner: '1002',
    members: new Set(['1002']),
    data: { game: 'unrelated', protocol: NETWORK_VERSION },
  });
  network.lobbies.set('9003', {
    id: 9003n,
    owner: '1002',
    members: new Set(['1002']),
    data: { game: LOBBY_TAG, protocol: 'old' },
  });
  assert.deepEqual(
    (await other.list()).map((l) => l.id),
    ['9001'],
  );
  await assert.rejects(other.join('9002'), /同版本/);
  assert.equal(other.status().snapshot, null);
});

test('save failures are reported without undoing a command already accepted by the host', async () => {
  const { network, peers } = await fourPlayers();
  network.brokenSaves = true;
  command(peers[0], { type: 'set-order', actor: 'Coalition', order: [...FACTIONS] });
  network.pump();
  assert.equal(network.snapshot('1001').view!.state.revision, 1);
  assert.match(peers[0].status().error!, /存档写入失败/);
});

test('transport send failures surface to the player instead of executing locally', async () => {
  const { network, peers } = await fourPlayers();
  network.failSends = true;
  assert.throws(() => peers[1].request({ type: 'sync' }), /暂时无法发送/);
  assert.equal(network.snapshot('1002').view!.state.revision, 0);
});
