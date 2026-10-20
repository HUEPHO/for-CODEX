// Vite-only fixture. This file is outside public/ and is not a production build entry.
import { RoomAuthority } from '../../src/multiplayer/authority.ts';
import { FACTIONS } from '../../src/engine/types.ts';
import type { DesktopStatus } from '../../src/multiplayer/protocol.ts';

const members = [1001, 1002, 1003, 1004].map((id) => ({
  id: String(id),
  name: `测试玩家${id - 1000}`,
}));
let peer = '1001',
  joined = true,
  disconnected = false;
const authority = new RoomAuthority('900100', members[0], 'fate');
authority.setMembers(members);
for (let i = 1; i < 4; i++)
  authority.handle(members[i].id, { type: 'seat', faction: FACTIONS[i], claim: true });
for (const member of members.slice(1)) authority.handle(member.id, { type: 'ready', ready: true });
let listener: (s: DesktopStatus) => void = () => {};
const status = (): DesktopStatus => ({
  available: true,
  appId: 480,
  self: members.find((m) => m.id === peer)!,
  canResume: false,
  lobbyId: joined ? authority.room.id : undefined,
  snapshot: joined ? authority.snapshot(peer) : null,
});
window.weimarSteam = {
  status: async () => status(),
  create: async () => {
    joined = true;
    listener(status());
  },
  resume: async () => {
    throw new Error('此UI样例不导入存档');
  },
  list: async () => [],
  join: async () => {
    joined = true;
    listener(status());
  },
  leave: async () => {
    joined = false;
    listener(status());
  },
  invite: async () => {},
  exportSave: async () => authority.export(),
  request: async (request) => {
    const error = authority.handle(peer, request);
    if (error) throw new Error(error);
    listener(status());
  },
  subscribe: (next) => {
    listener = next;
    return () => {
      listener = () => {};
    };
  },
};
document.getElementById('fixture-peer')!.addEventListener('change', (event) => {
  peer = (event.target as HTMLSelectElement).value;
  listener(status());
});
document.getElementById('fixture-disconnect')!.addEventListener('click', () => {
  disconnected = !disconnected;
  authority.setMembers(disconnected ? members.filter((m) => m.id !== '1002') : members);
  if (disconnected && peer === '1002') {
    peer = '1001';
    (document.getElementById('fixture-peer') as HTMLSelectElement).value = peer;
  }
  listener(status());
});
await import('../../src/main.ts');
