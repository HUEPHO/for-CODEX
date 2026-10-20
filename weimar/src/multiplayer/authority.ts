import { GameSession } from '../engine/session.ts';
import { ensure } from '../engine/rules.ts';
import { FACTIONS } from '../engine/types.ts';
import type { Faction, ScenarioId } from '../engine/types.ts';
import { SCENARIOS } from '../engine/scenarios.ts';
import { decisionActor, project } from './projection.ts';
import { NETWORK_VERSION } from './protocol.ts';
import type { Member, RoomInfo, RoomRequest, RoomSnapshot } from './protocol.ts';

export interface HostSave {
  format: typeof NETWORK_VERSION;
  host: string;
  seats: RoomInfo['seats'];
  game: string;
}

export class RoomAuthority {
  readonly room: RoomInfo;
  session: GameSession | null = null;
  constructor(id: string, host: Member, scenario: ScenarioId) {
    ensure(Object.hasOwn(SCENARIOS, scenario), '请选择历史剧本');
    this.room = {
      id,
      host: host.id,
      scenario,
      version: 0,
      seats: { Coalition: host.id, KPD: null, NSDAP: null, RC: null },
      members: [host],
      ready: [],
      started: false,
      paused: false,
    };
  }
  setMembers(members: Member[]) {
    if (JSON.stringify(this.room.members) === JSON.stringify(members)) return false;
    this.room.members = structuredClone(members);
    this.room.ready = this.room.ready.filter((id) => members.some((m) => m.id === id));
    if (!this.room.started) {
      for (const f of FACTIONS)
        if (!members.some((m) => m.id === this.room.seats[f])) this.room.seats[f] = null;
    }
    this.room.paused =
      this.room.started && FACTIONS.some((f) => !members.some((m) => m.id === this.room.seats[f]));
    this.room.version++;
    return true;
  }
  handle(peer: string, request: RoomRequest): string | undefined {
    try {
      ensure(
        this.room.members.some((m) => m.id === peer),
        '你不在这个房间中',
      );
      switch (request.type) {
        case 'sync':
          return;
        case 'seat':
          ensure(!this.room.started, '开局后席位保留给原玩家');
          ensure(FACTIONS.includes(request.faction), '未知阵营');
          ensure(typeof request.claim === 'boolean', '无效席位请求');
          if (request.claim) {
            ensure(
              !this.room.seats[request.faction] || this.room.seats[request.faction] === peer,
              '这个阵营已有人选择',
            );
            this.room.seats[request.faction] = peer;
          } else {
            ensure(this.room.seats[request.faction] === peer, '只能释放自己的阵营');
            this.room.seats[request.faction] = null;
          }
          this.room.ready = [];
          break;
        case 'ready':
          ensure(!this.room.started, '对局已经开始');
          ensure(typeof request.ready === 'boolean', '无效准备请求');
          ensure(Object.values(this.room.seats).includes(peer), '请先选择阵营');
          this.room.ready = this.room.ready.filter((id) => id !== peer);
          if (request.ready) this.room.ready.push(peer);
          break;
        case 'start':
          ensure(peer === this.room.host, '只有房主可以开始');
          ensure(!this.room.started, '对局已经开始');
          ensure(
            FACTIONS.every(
              (f) => this.room.seats[f] && this.room.ready.includes(this.room.seats[f]!),
            ),
            '四个阵营都需要有人控制且准备完毕；一人可控制多个阵营',
          );
          // Do not use or transmit the browser's predictable development seed.
          this.session = new GameSession({
            scenario: this.room.scenario,
            seed: crypto.getRandomValues(new Uint32Array(1))[0],
          });
          this.room.started = true;
          break;
        case 'command': {
          ensure(this.session && this.room.started, '对局尚未开始');
          ensure(!this.room.paused, '等待断线玩家重新加入');
          const s = this.session.state;
          ensure(request.revision === s.revision, '局面已更新，请按最新状态重新操作');
          ensure(
            request.command && this.room.seats[request.command.actor] === peer,
            '不能替其他玩家提交指令',
          );
          ensure(request.command.actor === decisionActor(s), '现在由其他阵营操作');
          const result = this.session.send(request.command);
          ensure(result.ok, result.ok ? '' : result.error);
          break;
        }
        default:
          throw new Error('未知联机请求');
      }
      this.room.version++;
    } catch (error) {
      return error instanceof Error ? error.message : '请求失败';
    }
  }
  snapshot(peer: string): RoomSnapshot {
    ensure(
      this.room.members.some((m) => m.id === peer),
      '仅房间成员可查看',
    );
    return {
      room: structuredClone(this.room),
      view: this.session ? project(this.session.state, this.room, peer) : null,
    };
  }
  export(): string {
    ensure(this.session, '尚未开始对局');
    return JSON.stringify(
      {
        format: NETWORK_VERSION,
        host: this.room.host,
        seats: this.room.seats,
        game: this.session.export(),
      } satisfies HostSave,
      null,
      2,
    );
  }
  static restore(text: string, id: string, host: Member) {
    const save = JSON.parse(text) as HostSave;
    ensure(
      save.format === NETWORK_VERSION && save.host === host.id,
      '这不是当前Steam账号的房主存档',
    );
    const session = GameSession.import(save.game);
    ensure(session.options.scenario, '联机存档缺少历史剧本');
    ensure(
      FACTIONS.every((f) => typeof save.seats?.[f] === 'string' && save.seats[f]),
      '联机席位数据不完整',
    );
    const authority = new RoomAuthority(id, host, session.options.scenario);
    authority.session = session;
    authority.room.seats = save.seats;
    authority.room.started = true;
    authority.room.paused = Object.values(save.seats).some((peer) => peer !== host.id);
    return authority;
  }
}
