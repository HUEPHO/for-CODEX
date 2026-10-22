import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession, FACTIONS, previewElection } from '../src/engine/index.ts';
import type { Command, Faction, GameState } from '../src/engine/types.ts';
import { onMap } from '../src/engine/rules.ts';
import { RoomAuthority } from '../src/multiplayer/authority.ts';
import { pvBoard } from '../src/ui/pv-board.ts';

function row(s: GameState, region: string) {
  return pvBoard(s).split(`data-pv-region="${region}"`)[1].split('<g class="pv-row')[0];
}
function score(s: GameState, region: string, faction: Faction) {
  const match = row(s, region).match(
    new RegExp(`class="pv-cell([^\"]*)" data-pv-faction="${faction}" data-pv="(-?\\d+)"`),
  );
  assert.ok(match);
  return { value: Number(match[2]), highest: match[1].includes('is-highest') };
}
function marker(s: GameState, faction: Faction) {
  const track = pvBoard(s).split('<g class="pv-track"')[1];
  const match = track.match(
    new RegExp(`data-pv-faction="${faction}" data-pv="(-?\\d+)" data-pv-tick="(\\d+)"`),
  );
  assert.ok(match);
  return { value: Number(match[1]), tick: Number(match[2]) };
}
function send(session: GameSession, command: Command) {
  const result = session.send(command);
  assert.ok(result.ok, result.ok ? '' : result.error);
}

test('Berlin influence updates regional and national PV together, including overflow, undo and save replay', () => {
  const session = new GameSession({ scenario: 'fate', seed: 39 });
  send(session, { type: 'set-order', actor: 'Coalition', order: [...FACTIONS] });
  send(session, { type: 'begin-turn', actor: 'Coalition', mode: 'single' });
  const before = pvBoard(session.state);
  assert.deepEqual(score(session.state, 'Berlin', 'Coalition'), { value: 0, highest: false });
  assert.deepEqual(marker(session.state, 'Coalition'), { value: 35, tick: 35 });
  send(session, {
    type: 'action',
    actor: 'Coalition',
    action: { kind: 'place-influence', space: 'Berlin', count: 1 },
  });
  const after = pvBoard(session.state);
  assert.deepEqual(score(session.state, 'Berlin', 'Coalition'), { value: 6, highest: true });
  assert.equal(score(session.state, 'national', 'Coalition').value, 41);
  assert.deepEqual(marker(session.state, 'Coalition'), { value: 41, tick: 40 });
  assert.match(after, /class="pv-overflow-value"[\s\S]*?<text y="4">41<\/text>/);
  session.undo();
  assert.equal(pvBoard(session.state), before);
  session.redo();
  assert.equal(pvBoard(session.state), after);
  assert.equal(pvBoard(GameSession.import(session.export()).state), after);
});

test('momentum changes national PV without changing any regional score', () => {
  const session = new GameSession({ scenario: 'fate', seed: 39 });
  send(session, {
    type: 'set-order',
    actor: 'Coalition',
    order: ['KPD', 'Coalition', 'NSDAP', 'RC'],
  });
  send(session, { type: 'begin-turn', actor: 'KPD', mode: 'single' });
  const before = previewElection(session.state);
  send(session, { type: 'action', actor: 'KPD', action: { kind: 'gain-momentum' } });
  assert.deepEqual(previewElection(session.state).regions, before.regions);
  for (const [f, expected] of [
    ['Coalition', 32],
    ['KPD', 5],
  ] as const) {
    assert.equal(score(session.state, 'national', f).value, expected);
    assert.equal(marker(session.state, f).value, expected);
  }
});

test('positive regional ties mark every highest faction; all-zero regions have no leader', () => {
  const s = new GameSession({ scenario: 'fate' }).state;
  assert.doesNotMatch(row(s, 'Berlin'), /is-highest/);
  for (const f of ['KPD', 'NSDAP'] as const)
    s.pieces.find((p) => p.kind === 'cadre' && p.owner === f)!.location = 'Berlin';
  for (const f of ['KPD', 'NSDAP'] as const)
    assert.deepEqual(score(s, 'Berlin', f), { value: 2, highest: true });
  assert.match(row(s, 'Berlin'), /并列最高/);
  assert.equal(score(s, 'Berlin', 'Coalition').highest, false);
  const stateBeforeRender = structuredClone(s);
  pvBoard(s);
  assert.deepEqual(s, stateBeforeRender);
});

test('assassination and uprising each zero the entire region and remove its leading highlights', () => {
  for (const kind of ['assassination', 'strike'] as const) {
    const s = new GameSession({ scenario: 'fate' }).state;
    assert.equal(score(s, 'Bayern', 'Coalition').value, 5);
    const p = s.pieces.find((p) => p.kind === kind)!;
    p.location = 'Bayern';
    if (kind === 'strike') p.side = 'uprising';
    assert.match(row(s, 'Bayern'), /停选/);
    for (const f of FACTIONS) assert.deepEqual(score(s, 'Bayern', f), { value: 0, highest: false });
    assert.deepEqual(marker(s, 'Coalition'), { value: 30, tick: 30 });
    p.location = '@removed';
    assert.deepEqual(score(s, 'Bayern', 'Coalition'), { value: 5, highest: true });
  }
});

test('negative Revolution final PV stays exact in the table and at the zero endpoint', () => {
  const s = new GameSession({ scenario: 'revolution' }).state;
  s.scenarioEnding = true;
  for (const v of Object.values(s.influence)) v.Coalition = 0;
  for (const p of s.pieces) {
    if (p.owner === 'Coalition' && onMap(p)) p.location = 'reserve:Coalition';
    if (p.kind === 'assassination') p.location = 'Bayern';
  }
  assert.equal(score(s, 'national', 'Coalition').value, -6);
  assert.deepEqual(marker(s, 'Coalition'), { value: -6, tick: 0 });
  assert.match(pvBoard(s), /class="pv-overflow-value"[\s\S]*?<text y="4">-6<\/text>/);
});

test('Steam host and guest receive identical live PV after each authoritative command', () => {
  const host = { id: '1001', name: 'Host' },
    guest = { id: '1002', name: 'Guest' };
  const room = new RoomAuthority('9001', host, 'fate');
  room.setMembers([host, guest]);
  for (const faction of FACTIONS.slice(1))
    assert.equal(room.handle(guest.id, { type: 'seat', faction, claim: true }), undefined);
  for (const peer of [host, guest])
    assert.equal(room.handle(peer.id, { type: 'ready', ready: true }), undefined);
  assert.equal(room.handle(host.id, { type: 'start' }), undefined);
  const commands: Command[] = [
    { type: 'set-order', actor: 'Coalition', order: [...FACTIONS] },
    { type: 'begin-turn', actor: 'Coalition', mode: 'single' },
    {
      type: 'action',
      actor: 'Coalition',
      action: { kind: 'place-influence', space: 'Berlin', count: 1 },
    },
  ];
  for (const command of commands) {
    assert.equal(
      room.handle(host.id, {
        type: 'command',
        revision: room.session!.state.revision,
        command,
      }),
      undefined,
    );
    for (const peer of [host, guest])
      assert.equal(pvBoard(room.snapshot(peer.id).view!.state), pvBoard(room.session!.state));
  }
  assert.deepEqual(marker(room.snapshot(guest.id).view!.state, 'Coalition'), {
    value: 41,
    tick: 40,
  });
});
