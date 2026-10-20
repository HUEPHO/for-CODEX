import type { Client } from 'steamworks.js';
import { RoomAuthority } from '../src/multiplayer/authority.ts';
import { LOBBY_TAG, NETWORK_VERSION } from '../src/multiplayer/protocol.ts';
import type {
  DesktopStatus,
  Member,
  RoomRequest,
  RoomSnapshot,
  WireMessage,
} from '../src/multiplayer/protocol.ts';
import { SCENARIOS } from '../src/engine/scenarios.ts';
import type { ScenarioId } from '../src/engine/types.ts';

type Lobby = Awaited<ReturnType<Client['matchmaking']['joinLobby']>>;
type Steam = Pick<Client, 'localplayer' | 'matchmaking' | 'networking' | 'callback'>;
interface Storage {
  read(): string | null;
  write(text: string): void;
}
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const MAX_PACKET = 900_000;

/** The sender identity comes from Steam's packet metadata, never from message JSON. */
export class SteamService {
  readonly self: Member;
  readonly appId: number;
  private sdk: Steam;
  private storage: Storage;
  private changed: (status: DesktopStatus) => void;
  private lobby: Lobby | null = null;
  private authority: RoomAuthority | null = null;
  private snapshot: RoomSnapshot | null = null;
  private callbacks: { disconnect(): void }[] = [];
  private lastPoll = 0;
  private lastSync = 0;
  private lastHostSeen = 0;
  private error = '';
  private notice = '';
  private busy = false;
  private requestNumber = 0;
  private connected = true;
  constructor(
    sdk: Steam,
    appId: number,
    storage: Storage,
    changed: (status: DesktopStatus) => void,
  ) {
    this.sdk = sdk;
    this.appId = appId;
    this.storage = storage;
    this.changed = changed;
    this.self = {
      id: sdk.localplayer.getSteamId().steamId64.toString(),
      name: sdk.localplayer.getName(),
    };
    this.callbacks.push(
      sdk.callback.register(2, () => {
        this.connected = false;
        this.notice = 'Steam连接已断开，当前暂停操作。';
        if (this.snapshot) {
          this.snapshot.room.paused = true;
          if (this.snapshot.view) this.snapshot.view.canAct = false;
        }
        this.emit();
      }),
      sdk.callback.register(1, () => {
        this.connected = true;
        this.notice = 'Steam连接已恢复，正在同步。';
        if (this.authority) {
          this.refreshMembers();
          this.broadcast();
        } else if (this.lobby) {
          try {
            this.sendRequest({ type: 'sync' });
          } catch (e) {
            this.fail(e);
          }
        }
        this.emit();
      }),
      sdk.callback.register(6, ({ remote }) => {
        if (this.isMember(remote.toString())) sdk.networking.acceptP2PSession(remote);
      }),
      sdk.callback.register(8, ({ lobby_steam_id }) => {
        // Do not replace an ongoing room merely because an invitation was received.
        if (this.lobby) {
          this.notice = `收到房间 ${lobby_steam_id} 的加入请求；先离开当前房间再加入。`;
          this.emit();
        } else void this.join(lobby_steam_id.toString()).catch((e) => this.fail(e));
      }),
      sdk.callback.register(7, () => {
        this.notice = 'Steam连接中断，正在等待重新同步；未确认的操作请在恢复后检查。';
        this.emit();
      }),
    );
  }
  status(): DesktopStatus {
    return {
      available: true,
      appId: this.appId,
      self: this.self,
      lobbyId: this.lobby?.id.toString(),
      canResume: this.storage.read() !== null,
      error: this.error || undefined,
      notice: this.notice || undefined,
      snapshot: this.snapshot,
    };
  }
  private emit() {
    this.changed(this.status());
  }
  private fail(error: unknown) {
    this.error = errorText(error);
    this.emit();
  }
  private members(): Member[] {
    return (
      this.lobby?.getMembers().map((m) => ({
        id: m.steamId64.toString(),
        name:
          m.steamId64.toString() === this.self.id
            ? this.self.name
            : `Steam ${m.steamId64.toString()}`,
      })) ?? []
    );
  }
  private isMember(id: string) {
    return this.members().some((m) => m.id === id);
  }
  private requireLobby() {
    if (!this.lobby) throw new Error('请先创建或加入Steam房间');
    return this.lobby;
  }
  private metadata(lobby: Lobby) {
    return lobby.getData('game') === LOBBY_TAG && lobby.getData('protocol') === NETWORK_VERSION;
  }
  async list() {
    const lobbies = await this.sdk.matchmaking.getLobbies();
    return lobbies
      .filter((l) => this.metadata(l))
      .map((l) => ({
        id: l.id.toString(),
        name: l.getData('name') ?? 'WEIMAR',
        scenario: l.getData('scenario') ?? '',
        members: Number(l.getMemberCount()),
      }));
  }
  async create(scenario: ScenarioId, resume = false, importedSave?: string) {
    if (this.lobby || this.busy) throw new Error('请先离开当前房间');
    if (!Object.hasOwn(SCENARIOS, scenario)) throw new Error('未知剧本');
    const saved = resume ? (importedSave ?? this.storage.read()) : null;
    if (resume && !saved) throw new Error('没有房主自动存档');
    this.busy = true;
    let lobby: Lobby | null = null;
    try {
      // Friends-only by default; join by the numeric lobby ID or Steam invitation.
      lobby = await this.sdk.matchmaking.createLobby(1, 4);
      this.authority = saved
        ? RoomAuthority.restore(saved, lobby.id.toString(), this.self)
        : new RoomAuthority(lobby.id.toString(), this.self, scenario);
      if (
        !lobby.mergeFullData({
          game: LOBBY_TAG,
          protocol: NETWORK_VERSION,
          host: this.self.id,
          name: `${this.self.name} · WEIMAR`,
          scenario: this.authority.room.scenario,
        })
      )
        throw new Error('Steam房间元数据设置失败');
      this.lobby = lobby;
      this.error = '';
      this.notice = '';
      this.refreshMembers();
      this.persist();
      this.broadcast();
    } catch (error) {
      lobby?.leave();
      this.lobby = null;
      this.authority = null;
      throw error;
    } finally {
      this.busy = false;
    }
  }
  async resume(save?: string) {
    return this.create('fate', true, save);
  }
  async join(id: string) {
    if (this.lobby || this.busy) throw new Error('请先离开当前房间');
    if (!/^[1-9]\d{0,19}$/.test(id)) throw new Error('请输入数字房间ID');
    this.busy = true;
    let lobby: Lobby | null = null;
    try {
      lobby = await this.sdk.matchmaking.joinLobby(BigInt(id));
      if (!this.metadata(lobby)) throw new Error('不是同版本的WEIMAR房间');
      const host = lobby.getData('host');
      if (!host || lobby.getOwner().steamId64.toString() !== host)
        throw new Error('原房主已离开，需由原房主从存档重新建房');
      this.lobby = lobby;
      this.snapshot = null;
      this.error = '';
      this.notice = '已加入Steam房间，等待房主同步。';
      this.lastHostSeen = Date.now();
      this.sendRequest({ type: 'sync' });
      this.emit();
    } catch (error) {
      lobby?.leave();
      this.lobby = null;
      throw error;
    } finally {
      this.busy = false;
    }
  }
  leave() {
    this.error = '';
    this.persist();
    this.lobby?.leave();
    this.lobby = null;
    this.authority = null;
    this.snapshot = null;
    this.notice = '';
    this.emit();
  }
  invite() {
    this.requireLobby().openInviteDialog();
  }
  exportSave() {
    if (!this.authority?.session) throw new Error('只有房主可以导出完整联机存档');
    return this.authority.export();
  }
  request(request: RoomRequest) {
    this.requireLobby();
    if (!this.connected) throw new Error('Steam连接尚未恢复');
    if (this.authority) {
      const membersChanged = this.refreshMembers();
      const error = this.authority.handle(this.self.id, request);
      if (error) {
        if (membersChanged) this.broadcast();
        throw new Error(error);
      }
      this.error = '';
      this.persist();
      this.broadcast();
    } else this.sendRequest(request);
  }
  private sendRequest(request: RoomRequest) {
    const lobby = this.requireLobby();
    const host = lobby.getData('host');
    if (!host) throw new Error('房主信息尚未就绪');
    this.send(host, {
      protocol: NETWORK_VERSION,
      lobby: lobby.id.toString(),
      kind: 'request',
      id: `${this.self.id}-${++this.requestNumber}`,
      request,
    });
  }
  private send(peer: string, message: WireMessage) {
    const packet = Buffer.from(JSON.stringify(message));
    if (packet.length > MAX_PACKET) throw new Error('同步状态过大，未发送');
    if (!this.sdk.networking.sendP2PPacket(BigInt(peer), 2, packet))
      throw new Error('Steam暂时无法发送消息，请检查连接后重试');
  }
  private refreshMembers() {
    return this.authority?.setMembers(this.members()) ?? false;
  }
  private persist() {
    if (this.authority?.session) {
      try {
        this.storage.write(this.authority.export());
      } catch (error) {
        this.error = `操作已生效，但房主存档写入失败：${errorText(error)}`;
      }
    }
  }
  private broadcast(id?: string, peer?: string, error?: string) {
    if (!this.authority || !this.lobby) return;
    for (const member of this.authority.room.members) {
      const snapshot = this.authority.snapshot(member.id);
      if (member.id === this.self.id) this.snapshot = snapshot;
      else {
        try {
          this.send(member.id, {
            protocol: NETWORK_VERSION,
            lobby: this.lobby.id.toString(),
            kind: 'snapshot',
            ...(member.id === peer ? { id, error } : {}),
            snapshot,
          });
        } catch (e) {
          this.error = errorText(e);
        }
      }
    }
    this.emit();
  }
  /** Poll native packets regularly; presence and resync use slower cadences. */
  tick(now = Date.now()) {
    if (!this.lobby || !this.connected) return;
    if (now - this.lastPoll >= 1000) {
      this.lastPoll = now;
      const host = this.lobby.getData('host');
      if (this.lobby.getOwner().steamId64.toString() !== host) {
        this.leave();
        this.fail(new Error('原房主已离开。对局已停止；原房主可从自动存档重建房间。'));
        return;
      }
      if (this.refreshMembers()) this.broadcast();
    }
    for (let n = 0; n < 100; n++) {
      const size = this.sdk.networking.isP2PPacketAvailable();
      if (!size) break;
      const packet = this.sdk.networking.readP2PPacket(size);
      if (size > MAX_PACKET || !this.isMember(packet.steamId.steamId64.toString())) continue;
      try {
        this.receive(packet.steamId.steamId64.toString(), JSON.parse(packet.data.toString()));
      } catch (e) {
        this.fail(e);
      }
    }
    if (!this.authority && now - this.lastSync >= 3000) {
      this.lastSync = now;
      try {
        this.sendRequest({ type: 'sync' });
      } catch (e) {
        this.fail(e);
      }
      if (this.snapshot && now - this.lastHostSeen > 12_000) {
        this.snapshot.room.paused = true;
        if (this.snapshot.view) this.snapshot.view.canAct = false;
        this.notice = '等待房主恢复连接；当前暂停操作。';
        this.emit();
      }
    }
  }
  private receive(peer: string, message: WireMessage) {
    if (
      !message ||
      message.protocol !== NETWORK_VERSION ||
      message.lobby !== this.lobby?.id.toString()
    )
      return;
    if (this.authority && message.kind === 'request') {
      if (typeof message.id !== 'string' || !message.request) return;
      const membersChanged = this.refreshMembers();
      const error = this.authority.handle(peer, message.request);
      if (!error && message.request.type !== 'sync') this.persist();
      if (message.request.type === 'sync' && !membersChanged) {
        this.send(peer, {
          protocol: NETWORK_VERSION,
          lobby: this.lobby.id.toString(),
          kind: 'snapshot',
          id: message.id,
          error,
          snapshot: this.authority.snapshot(peer),
        });
      } else this.broadcast(message.id, peer, error);
    } else if (
      !this.authority &&
      message.kind === 'snapshot' &&
      peer === this.lobby?.getData('host')
    ) {
      const snapshot = message.snapshot;
      if (snapshot?.room.id !== this.lobby.id.toString() || snapshot.room.host !== peer) return;
      this.lastHostSeen = Date.now();
      if (this.snapshot && snapshot.room.version < this.snapshot.room.version) return;
      const changed =
        !this.snapshot ||
        snapshot.room.version !== this.snapshot.room.version ||
        !!this.notice ||
        this.error !== (message.error ?? '');
      this.snapshot = snapshot;
      this.notice = '';
      this.error = message.error ?? '';
      if (changed) this.emit();
    }
  }
  dispose() {
    this.leave();
    this.callbacks.forEach((callback) => callback.disconnect());
  }
}
