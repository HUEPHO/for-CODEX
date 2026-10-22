import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession, FACTIONS } from '../src/engine/index.ts';
import type { Action, Faction, ScenarioId } from '../src/engine/types.ts';
import { SCENARIOS } from '../src/engine/scenarios.ts';
import { SPACES } from '../src/data/board.ts';
import { piecesAt } from '../src/engine/rules.ts';
import { pieceStatus } from '../src/ui/piece-status.ts';
import { selectedSpacePanel, spaceStatus, tabletop } from '../src/ui/tabletop.ts';

function firstTurn(faction: Faction = 'Coalition', mode: 'single' | 'event-last' = 'single') {
  const session = new GameSession({ scenario: 'fate', seed: 39 });
  assert.ok(
    session.send({
      type: 'set-order',
      actor: 'Coalition',
      order: [faction, ...FACTIONS.filter((f) => f !== faction)],
    }).ok,
  );
  assert.ok(
    session.send({
      type: 'begin-turn',
      actor: faction,
      mode,
      ...(mode === 'event-last' ? { cardUid: session.state.hands[faction][0].uid } : {}),
    }).ok,
  );
  return session;
}
function act(session: GameSession, actor: Faction, action: Action) {
  const result = session.send({ type: 'action', actor, action });
  assert.ok(result.ok, result.ok ? '' : result.error);
}
function mapSpaces(session: GameSession) {
  return tabletop(session.state, 'Berlin', [], 1)
    .split('<g class="map-space')
    .slice(1)
    .map((markup) => markup.split('<g class="track-pieces">')[0]);
}

test('every space keeps its population capacity visible, including empty and full spaces', () => {
  for (const scenario of [undefined, ...Object.keys(SCENARIOS)] as (ScenarioId | undefined)[]) {
    const session = new GameSession({ scenario, seed: 39 });
    for (const [i, markup] of mapSpaces(session).entries()) {
      const sp = SPACES[i];
      const used = Object.values(session.state.influence[sp.id]).reduce((a, b) => a + b, 0);
      assert.equal((markup.match(/class="influence-slot /g) ?? []).length, sp.population, sp.id);
      assert.equal((markup.match(/influence-empty/g) ?? []).length, sp.population - used, sp.id);
    }
  }
  const session = firstTurn();
  const count = () =>
    (tabletop(session.state, 'Berlin', [], 1).match(/class="influence-slot /g) ?? []).length;
  const before = count();
  act(session, 'Coalition', { kind: 'place-influence', space: 'Berlin', count: 1 });
  assert.equal(count(), before);
  assert.match(selectedSpacePanel(session.state, 'Berlin'), /影响力 6\/6，空位 0/);
  session.undo();
  assert.equal(count(), before);
  assert.match(selectedSpacePanel(session.state, 'Berlin'), /影响力 5\/6，空位 1/);
});

test('leadership changes immediately on both influence placement and removal, and undo restores ties', () => {
  for (const [faction, action] of [
    ['Coalition', { kind: 'place-influence', space: 'Berlin', count: 1 }],
    ['KPD', { kind: 'remove-influence', space: 'Thueringen', targets: { Coalition: 1 } }],
  ] as [Faction, Action][]) {
    const session = firstTurn(faction);
    const space = 'space' in action ? action.space : 'Berlin';
    assert.equal(spaceStatus(session.state, space).leader, null);
    const original = tabletop(session.state, 'Berlin', [], 1);
    const parliament = structuredClone(session.state.pc);
    act(session, faction, action);
    assert.equal(spaceStatus(session.state, space).leader, faction);
    assert.match(
      mapSpaces(session)[SPACES.findIndex((sp) => sp.id === space)],
      new RegExp(`data-leader="${faction}"`),
    );
    assert.match(selectedSpacePanel(session.state, space), /当前领导者/);
    // A change of influence must not silently transfer parliamentary control.
    assert.deepEqual(session.state.pc, parliament);
    session.undo();
    assert.equal(tabletop(session.state, 'Berlin', [], 1), original);
  }
});

test('moving the last unit removes occupation at origin and adds it at destination before the action ends', () => {
  const session = firstTurn();
  const unit = piecesAt(session.state, 'Koeln', 'freikorps')[0];
  assert.deepEqual(spaceStatus(session.state, 'Koeln').occupiers, [
    { faction: 'Coalition', strength: 2 },
  ]);
  assert.deepEqual(spaceStatus(session.state, 'Hessenprovinz').occupiers, []);
  act(session, 'Coalition', { kind: 'move-units' });
  const before = tabletop(session.state, 'Koeln', [], 1);
  const option = `${unit.id}:Hessenprovinz`;
  assert.ok(session.state.pending!.options.some((o) => o.id === option));
  assert.ok(session.send({ type: 'choose', actor: 'Coalition', option }).ok);
  assert.deepEqual(spaceStatus(session.state, 'Koeln').occupiers, []);
  assert.equal(spaceStatus(session.state, 'Koeln').militaryLeader, null);
  assert.deepEqual(spaceStatus(session.state, 'Hessenprovinz').occupiers, [
    { faction: 'Coalition', strength: 2 },
  ]);
  assert.equal(spaceStatus(session.state, 'Hessenprovinz').militaryLeader, 'Coalition');
  assert.match(selectedSpacePanel(session.state, 'Koeln'), /无驻军/);
  session.undo();
  assert.equal(tabletop(session.state, 'Koeln', [], 1), before);
});

test('shared MCS borders distinguish both sides, neither side and each side independently', () => {
  const session = firstTurn();
  const p = piecesAt(session.state, '@mcs:2')[0];
  for (const [progress, reaction, expected] of [
    [1, 1, 'none'],
    [2, 1, 'left'],
    [1, 2, 'right'],
    [2, 2, 'full'],
  ] as const) {
    session.state.tracks.progress = progress;
    session.state.tracks.reaction = reaction;
    assert.equal(pieceStatus(session.state, p).availability, expected);
  }
  const actual = firstTurn('Coalition', 'event-last');
  act(actual, 'Coalition', {
    kind: 'place-leverage',
    pieceId: piecesAt(actual.state, '@us:1')[0].id,
    to: '@progress:2',
  });
  const original = tabletop(actual.state, 'Berlin', [], 1);
  assert.equal(
    pieceStatus(actual.state, piecesAt(actual.state, '@mcs:2')[0]).availability,
    'right',
  );
  act(actual, 'Coalition', { kind: 'advance-progress' });
  assert.equal(pieceStatus(actual.state, piecesAt(actual.state, '@mcs:2')[0]).availability, 'full');
  actual.undo();
  assert.equal(tabletop(actual.state, 'Berlin', [], 1), original);
});

test('deployment removes the supply highlight and updates occupation; deployed leverage is never highlighted', () => {
  const session = firstTurn();
  const unit = piecesAt(session.state, '@ussr-army:1')[0];
  assert.equal(pieceStatus(session.state, unit).availability, 'full');
  const original = tabletop(session.state, 'Berlin', [], 1);
  act(session, 'Coalition', { kind: 'place-unit', pieceId: unit.id, space: 'Brandenburg' });
  const deployed = session.state.pieces.find((p) => p.id === unit.id)!;
  assert.equal(pieceStatus(session.state, deployed).availability, 'none');
  assert.deepEqual(spaceStatus(session.state, 'Brandenburg').occupiers, [
    { faction: 'Coalition', strength: 3 },
  ]);
  for (const p of session.state.pieces.filter((p) =>
    /^@(progress|reaction|economy):/.test(p.location),
  ))
    assert.equal(pieceStatus(session.state, p).availability, 'none');
  session.undo();
  assert.equal(tabletop(session.state, 'Berlin', [], 1), original);
});

test('mixed occupations remain visible even when strength ties; cadres and strikes do not occupy', () => {
  const session = firstTurn();
  const s = session.state;
  const units = s.pieces.filter((p) => p.location === 'Berlin');
  for (const p of units) p.location = `reserve:${p.owner}`;
  const coalition = s.pieces.find((p) => p.kind === 'freikorps' && p.owner === 'Coalition')!;
  const rc = s.pieces.find((p) => p.kind === 'freikorps' && p.owner === 'RC')!;
  coalition.location = rc.location = 'Berlin';
  s.pieces.find((p) => p.kind === 'cadre' && p.owner === 'KPD')!.location = 'Berlin';
  s.pieces.find((p) => p.kind === 'strike')!.location = 'Berlin';
  assert.deepEqual(spaceStatus(s, 'Berlin').occupiers, [
    { faction: 'Coalition', strength: 2 },
    { faction: 'RC', strength: 2 },
  ]);
  assert.equal(spaceStatus(s, 'Berlin').militaryLeader, null);
  const rendered = tabletop(s, 'Berlin', [], 1);
  coalition.allegiance = coalition.allegiance === 'RC' ? 'Coalition' : 'RC';
  assert.equal(tabletop(s, 'Berlin', [], 1), rendered);
});
