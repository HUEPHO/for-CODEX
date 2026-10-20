import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession, FACTIONS, legalActions } from '../src/engine/index.ts';
import { SPACES, SPACE } from '../src/data/board.ts';
import { SCENARIOS } from '../src/engine/scenarios.ts';
import type { ScenarioId } from '../src/engine/types.ts';
import { BOARD_AREAS, holdingPoint } from '../src/ui/board-layout.ts';
import { actionSpace, tabletop, selectedSpacePanel, reserveTrays } from '../src/ui/tabletop.ts';
import { RoomAuthority } from '../src/multiplayer/authority.ts';

test('each historical board displays every placed piece and influence cube exactly once', () => {
  assert.deepEqual(Object.keys(BOARD_AREAS).sort(), SPACES.map((s) => s.id).sort());
  for (const scenario of Object.keys(SCENARIOS) as ScenarioId[]) {
    const s = new GameSession({ scenario, seed: 48 }).state;
    const before = structuredClone(s);
    const svg = tabletop(s, 'Berlin', [], 1);
    const ids = [...svg.matchAll(/data-pieces="([^"]+)"/g)].flatMap((m) => m[1].split(' '));
    const placed = s.pieces.filter((p) => SPACE[p.location] || holdingPoint(p.location));
    assert.deepEqual(ids.sort(), placed.map((p) => p.id).sort(), scenario);
    for (const f of FACTIONS) {
      assert.equal(
        svg.split(`data-faction="${f}"`).length - 1,
        SPACES.reduce((n, sp) => n + s.influence[sp.id][f], 0),
        `${scenario} ${f}`,
      );
    }
    assert.deepEqual(s, before);
  }
});

test('rendering cannot disclose unrevealed loyalty, hands or random seeds', () => {
  const s = new GameSession({ scenario: 'fate', seed: 9 }).state;
  const render = () =>
    tabletop(s, 'Berlin', [], 1) + selectedSpacePanel(s, 'Berlin') + reserveTrays(s);
  const before = render();
  for (const p of s.pieces)
    if (!p.revealed) p.allegiance = p.allegiance === 'Coalition' ? 'RC' : 'Coalition';
  s.seed = 987654;
  s.rng = 123456;
  for (const f of FACTIONS) s.hands[f] = [{ uid: 'private-new-card', card: 151 }];
  assert.equal(render(), before);
  assert.doesNotMatch(before, /private-new-card|allegiance/);
});

test('a real influence command changes board cubes and undo restores the original board', () => {
  const session = new GameSession({ scenario: 'fate', seed: 48 });
  assert.equal(
    session.send({ type: 'set-order', actor: 'Coalition', order: [...FACTIONS] }).ok,
    true,
  );
  assert.equal(session.send({ type: 'begin-turn', actor: 'Coalition', mode: 'single' }).ok, true);
  const action = legalActions(session.state).find(
    (a) => a.action.kind === 'place-influence',
  )!.action;
  const space = actionSpace(action)!;
  const before = tabletop(session.state, space, [], 1);
  const count = session.state.influence[space].Coalition;
  assert.equal(session.send({ type: 'action', actor: 'Coalition', action }).ok, true);
  assert.ok(session.state.influence[space].Coalition > count);
  assert.notEqual(tabletop(session.state, space, [], 1), before);
  session.undo();
  assert.equal(tabletop(session.state, space, [], 1), before);
});

test('Steam player projections produce the same public board as the authoritative state', () => {
  const host = { id: '1001', name: 'Host' },
    guest = { id: '1002', name: 'Guest' };
  const room = new RoomAuthority('9001', host, 'fate');
  room.setMembers([host, guest]);
  for (const faction of FACTIONS.slice(1))
    assert.equal(room.handle(guest.id, { type: 'seat', faction, claim: true }), undefined);
  for (const peer of [host, guest])
    assert.equal(room.handle(peer.id, { type: 'ready', ready: true }), undefined);
  assert.equal(room.handle(host.id, { type: 'start' }), undefined);
  const expected = tabletop(room.session!.state, 'Berlin', [], 1);
  for (const peer of [host, guest])
    assert.equal(tabletop(room.snapshot(peer.id).view!.state, 'Berlin', [], 1), expected);
});
