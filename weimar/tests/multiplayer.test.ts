import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomAuthority } from '../src/multiplayer/authority.ts';
import { project } from '../src/multiplayer/projection.ts';
import { steamPanel } from '../src/multiplayer/panel.ts';
import { GameSession } from '../src/engine/session.ts';
import { FACTIONS } from '../src/engine/types.ts';
import type { RoomRequest } from '../src/multiplayer/protocol.ts';

const members = [1001, 1002, 1003, 1004].map((id) => ({ id: String(id), name: `Player ${id}` }));
function request(room: RoomAuthority, peer: string, value: RoomRequest) {
  assert.equal(room.handle(peer, value), undefined);
}
function started() {
  const room = new RoomAuthority('9001', members[0], 'fate');
  room.setMembers(members);
  for (let i = 1; i < 4; i++)
    request(room, members[i].id, { type: 'seat', faction: FACTIONS[i], claim: true });
  for (const member of members) request(room, member.id, { type: 'ready', ready: true });
  request(room, members[0].id, { type: 'start' });
  return room;
}

test('room seats cannot be stolen and all four factions must be assigned and ready', () => {
  const room = new RoomAuthority('9001', members[0], 'revolution');
  room.setMembers(members);
  assert.match(room.handle('1002', { type: 'seat', faction: 'Coalition', claim: true })!, /已有人/);
  assert.match(
    room.handle('1002', { type: 'seat', faction: 'Coalition', claim: false })!,
    /自己的/,
  );
  assert.match(room.handle('1001', { type: 'start' })!, /四个阵营/);
  assert.match(room.handle('1002', { type: 'start' })!, /房主/);
  assert.match(room.handle('outsider', { type: 'sync' })!, /不在/);
  for (const faction of FACTIONS.slice(1))
    request(room, '1001', { type: 'seat', faction, claim: true });
  request(room, '1001', { type: 'ready', ready: true });
  request(room, '1001', { type: 'start' });
  assert.equal(room.session!.state.scenario, 'revolution');
  assert.equal(room.snapshot('1001').view!.factions.length, 4);
});

test('unstarted disconnected seats are released and changing seats clears readiness', () => {
  const room = new RoomAuthority('9001', members[0], 'black-sun');
  room.setMembers(members);
  request(room, '1002', { type: 'seat', faction: 'KPD', claim: true });
  request(room, '1002', { type: 'ready', ready: true });
  request(room, '1003', { type: 'seat', faction: 'NSDAP', claim: true });
  assert.deepEqual(room.room.ready, []);
  room.setMembers([members[0], members[2], members[3]]);
  assert.equal(room.room.seats.KPD, null);
});

test('Steam identity must own the command actor; duplicate and stale commands cannot apply twice', () => {
  const room = started();
  const cmd: RoomRequest = {
    type: 'command',
    revision: 0,
    command: { type: 'set-order', actor: 'Coalition', order: [...FACTIONS] },
  };
  assert.match(room.handle('1002', cmd)!, /其他玩家/);
  assert.equal(room.session!.state.revision, 0);
  request(room, '1001', cmd);
  assert.equal(room.session!.state.revision, 1);
  assert.match(room.handle('1001', cmd)!, /局面已更新/);
  assert.equal(room.session!.commands.length, 1);
  assert.match(
    room.handle('1002', {
      type: 'command',
      revision: 1,
      command: { type: 'pass', actor: 'KPD' },
    })!,
    /其他阵营/,
  );
});

test('cross-faction choices belong to their decision maker, not the current turn owner', () => {
  const room = started();
  const s = room.session!.state;
  s.phase = 'action';
  s.pending = {
    actor: 'RC',
    prompt: 'RC决定',
    options: [{ id: 'ok', label: '确认', effects: [] }],
  };
  assert.equal(room.snapshot('1001').view!.canAct, false);
  assert.equal(room.snapshot('1004').view!.canAct, true);
  request(room, '1004', {
    type: 'command',
    revision: s.revision,
    command: { type: 'choose', actor: 'RC', option: 'ok' },
  });
  assert.equal(room.session!.state.pending, null);
});

test('wire projection contains no other hands, deck order, seed, hidden allegiance or continuations', () => {
  const room = started();
  const s = room.session!.state;
  s.log.push({ n: 999, text: 'PRIVATE-LOG-SECRET' });
  s.turn.cardUid = 'PRIVATE-COMMITTED-CARD';
  s.pending = {
    actor: 'Coalition',
    prompt: 'PRIVATE-PROMPT',
    options: [
      {
        id: 'private-id',
        label: 'PRIVATE-LABEL',
        effects: [{ type: 'log', text: 'PRIVATE-EFFECT' }],
      },
    ],
  };
  s.reveals.push({ viewer: 'RC', target: 'KPD', cards: structuredClone(s.hands.KPD) });
  const view = room.snapshot('1002').view!;
  const wire = JSON.stringify(view);
  assert.deepEqual(view.state.hands.KPD, s.hands.KPD);
  for (const f of ['Coalition', 'NSDAP', 'RC'] as const) assert.deepEqual(view.state.hands[f], []);
  assert.deepEqual(view.state.deck, []);
  assert.equal(view.state.seed, 0);
  assert.equal(view.state.rng, 0);
  assert.ok(view.state.pieces.filter((p) => !p.revealed).every((p) => !('allegiance' in p)));
  assert.equal(view.state.flow, undefined);
  assert.equal(view.state.flowReceipt, undefined);
  assert.equal(view.state.grantContext, undefined);
  assert.deepEqual(view.state.effects, []);
  assert.deepEqual(view.state.reveals, []);
  assert.equal(view.state.removedCards, undefined);
  assert.doesNotMatch(wire, /PRIVATE-|private-id/);
  for (const card of [...s.deck, ...s.hands.Coalition, ...s.hands.NSDAP, ...s.hands.RC])
    assert.ok(!wire.includes(`"${card.uid}"`), card.uid);
  assert.deepEqual(view.handCounts, { Coalition: 7, KPD: 7, NSDAP: 7, RC: 7 });
  assert.equal(view.deckCount, 25);
});

test('authorized private choices and card reveals are delivered without executable effects', () => {
  const room = started();
  const s = room.session!.state;
  s.pending = {
    actor: 'RC',
    prompt: '选择手牌',
    options: [{ id: 'card-secret', label: '你的牌', effects: [{ type: 'log', text: 'INTERNAL' }] }],
  };
  s.reveals.push({ viewer: 'RC', target: 'KPD', cards: structuredClone(s.hands.KPD) });
  const view = room.snapshot('1004').view!;
  assert.equal(view.state.pending!.prompt, '选择手牌');
  assert.deepEqual(view.state.pending!.options, [
    { id: 'card-secret', label: '你的牌', effects: [] },
  ]);
  assert.deepEqual(view.state.reveals, s.reveals);
  view.state.influence.Berlin.RC = 0;
  assert.notEqual(s.influence.Berlin.RC, 0);
});

test('legal actions and parliamentary candidates come from the authoritative engine', () => {
  const room = started();
  request(room, '1001', {
    type: 'command',
    revision: 0,
    command: { type: 'set-order', actor: 'Coalition', order: [...FACTIONS] },
  });
  request(room, '1001', {
    type: 'command',
    revision: 1,
    command: { type: 'begin-turn', actor: 'Coalition', mode: 'single' },
  });
  const own = room.snapshot('1001').view!,
    other = room.snapshot('1002').view!;
  assert.ok(own.actions.some(({ action }) => action.kind === 'gain-momentum'));
  assert.ok(Object.keys(own.pcActions).length > 0);
  assert.deepEqual(other.actions, []);
  assert.deepEqual(other.pcActions, {});
});

test('started seats persist through a disconnect, and the same Steam ID resumes without advancing rules', () => {
  const room = started(),
    before = structuredClone(room.session!.state);
  room.setMembers([members[0], members[2], members[3]]);
  assert.equal(room.room.paused, true);
  assert.equal(room.room.seats.KPD, '1002');
  assert.equal(room.snapshot('1001').view!.canAct, false);
  assert.match(
    room.handle('1001', {
      type: 'command',
      revision: 0,
      command: { type: 'set-order', actor: 'Coalition', order: [...FACTIONS] },
    })!,
    /断线/,
  );
  room.setMembers(members);
  assert.equal(room.room.paused, false);
  assert.deepEqual(room.session!.state, before);
});

test('host save preserves hidden state and seat identities; another host cannot adopt it', () => {
  const room = started();
  request(room, '1001', {
    type: 'command',
    revision: 0,
    command: { type: 'set-order', actor: 'Coalition', order: [...FACTIONS] },
  });
  const save = room.export();
  const restored = RoomAuthority.restore(save, 'new-lobby', members[0]);
  assert.deepEqual(restored.session!.state, room.session!.state);
  assert.deepEqual(restored.room.seats, room.room.seats);
  assert.equal(restored.room.paused, true);
  restored.setMembers(members);
  assert.equal(restored.room.paused, false);
  assert.throws(() => RoomAuthority.restore(save, 'new-lobby', members[1]), /当前Steam账号/);
});

test('card continuations project safely for every implemented event laboratory opening', () => {
  const room = started();
  for (let n = 1; n <= 151; n++) {
    const session = new GameSession({ testCard: n, testPrerequisites: true });
    assert.ok(session.send({ type: 'set-order', actor: 'Coalition', order: [...FACTIONS] }).ok);
    const card = session.state.hands.Coalition.find((c) => c.card === n)!;
    assert.ok(
      session.send({
        type: 'begin-turn',
        actor: 'Coalition',
        mode: 'event-first',
        cardUid: card.uid,
      }).ok,
    );
    for (const member of members) {
      const view = project(session.state, room.room, member.id);
      assert.ok(Buffer.byteLength(JSON.stringify(view)) < 900_000, `card ${n}`);
      assert.deepEqual(view.state.effects, []);
      assert.equal(view.state.flow, undefined);
      assert.ok(view.state.pending?.options.every((o) => !o.effects.length) ?? true);
    }
  }
});

test('room UI escapes Steam display names and distinguishes browser/desktop modes', () => {
  const room = started();
  room.room.members[0].name = '<img src=x onerror=bad()>';
  const html = steamPanel(
    {
      available: true,
      appId: 480,
      self: members[0],
      canResume: true,
      lobbyId: '9001',
      snapshot: room.snapshot('1001'),
    },
    [],
    false,
  );
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;img/);
  assert.match(html, /Steam/);
  assert.match(steamPanel(null, [], false), /桌面版/);
});
