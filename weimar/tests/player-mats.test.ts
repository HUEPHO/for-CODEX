import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession, FACTIONS, legalActions } from '../src/engine/index.ts';
import { available } from '../src/engine/rules.ts';
import { SCENARIOS } from '../src/engine/scenarios.ts';
import type { Faction, ScenarioId } from '../src/engine/types.ts';
import { tabletop } from '../src/ui/tabletop.ts';
import { matPieces, matPieceAvailable, playerMat, reserveTrays } from '../src/ui/player-mats.ts';
import { RoomAuthority } from '../src/multiplayer/authority.ts';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const pieceIds = (markup: string) =>
  [...markup.matchAll(/data-pieces="([^"]+)"/g)].flatMap((m) => m[1].split(' '));

test('board and four mats place every live piece exactly once in all scenarios', () => {
  for (const scenario of [undefined, ...Object.keys(SCENARIOS)] as (ScenarioId | undefined)[]) {
    const s = new GameSession({ scenario, seed: 39 }).state;
    const before = structuredClone(s);
    const rendered = tabletop(s, 'Berlin', [], 1) + reserveTrays(s);
    assert.deepEqual(
      pieceIds(rendered).sort(),
      s.pieces
        .filter((p) => p.location !== 'removed')
        .map((p) => p.id)
        .sort(),
      scenario ?? 'tutorial',
    );
    for (const faction of FACTIONS) {
      assert.ok(matPieces(s, faction).every((p) => p.location !== 'removed'));
      for (const p of matPieces(s, faction))
        assert.equal(
          matPieceAvailable(s, p, faction),
          p.location === `mat:${faction}` || available(s, p, faction),
        );
    }
    assert.deepEqual(s, before);
  }
});

function firstTurn(faction: Faction) {
  const session = new GameSession({ scenario: 'fate', seed: 39 });
  assert.equal(
    session.send({
      type: 'set-order',
      actor: 'Coalition',
      order: [faction, ...FACTIONS.filter((f) => f !== faction)],
    }).ok,
    true,
  );
  assert.equal(session.send({ type: 'begin-turn', actor: faction, mode: 'single' }).ok, true);
  return session;
}

test('a real stance action unlocks the fourth strike and undo restores its mat', () => {
  const session = firstTurn('KPD');
  const before = playerMat(session.state, 'KPD');
  assert.match(before, /data-mat-holding="@kpd-strike:4" data-available="false"/);
  assert.equal(
    session.send({ type: 'action', actor: 'KPD', action: { kind: 'change-stance', steps: 1 } }).ok,
    true,
  );
  assert.equal(session.state.stance.KPD, 3);
  const after = playerMat(session.state, 'KPD');
  assert.match(after, /data-mat-holding="@kpd-strike:4" data-available="true"/);
  assert.notEqual(after, before);
  session.undo();
  assert.equal(playerMat(session.state, 'KPD'), before);
});

test('using RC leverage removes it from the mat and unlocks the next holding', () => {
  const session = firstTurn('RC');
  const before = playerMat(session.state, 'RC');
  const action = legalActions(session.state).find(
    ({ action }) =>
      action.kind === 'place-leverage' &&
      session.state.pieces.find((p) => p.id === action.pieceId)?.location === '@rc-economic:2',
  )!.action;
  assert.equal(session.send({ type: 'action', actor: 'RC', action }).ok, true);
  const after = playerMat(session.state, 'RC');
  assert.doesNotMatch(after, /data-mat-holding="@rc-economic:2"/);
  assert.match(after, /data-mat-holding="@rc-economic:3" data-available="true"/);
  assert.match(after, /data-mat-holding="@rc-clique:2" data-available="true"/);
  session.undo();
  assert.equal(playerMat(session.state, 'RC'), before);
});

test('declaring victory moves the original marker from mat to timeline', () => {
  const session = firstTurn('NSDAP');
  // Set only public victory requirements; the declaration itself uses the real command.
  session.state.tracks.reaction = 5;
  const action = legalActions(session.state).find(
    (a) => a.action.kind === 'declare-victory',
  )?.action;
  assert.ok(action);
  assert.equal(session.send({ type: 'action', actor: 'NSDAP', action }).ok, true);
  assert.doesNotMatch(playerMat(session.state, 'NSDAP'), /victory-nsdap.png/);
  assert.match(tabletop(session.state, 'Berlin', [], 1), /victory-nsdap.png/);
});

test('fixed-stance scenarios use the pragmatic position and exclude removed armies from reserves', () => {
  const s = new GameSession({ scenario: 'black-sun', seed: 39 }).state;
  const html = reserveTrays(s, 'Coalition', true);
  assert.match(html, /剧本固定/);
  assert.match(html, /已移出游戏/);
  for (const faction of ['KPD', 'NSDAP'] as const) {
    const expected = playerMat(s, faction);
    s.stance[faction] = -3;
    assert.equal(playerMat(s, faction), expected);
  }
  for (const p of s.pieces.filter((p) => p.location === 'removed'))
    assert.ok(!pieceIds(html).includes(p.id));
});

test('all Steam peers see the same public mats without hidden loyalty or hands', () => {
  const members = FACTIONS.map((_, i) => ({ id: String(1001 + i), name: `Player ${i}` }));
  const room = new RoomAuthority('mats-room', members[0], 'fate');
  room.setMembers(members);
  for (let i = 1; i < 4; i++)
    assert.equal(
      room.handle(members[i].id, { type: 'seat', faction: FACTIONS[i], claim: true }),
      undefined,
    );
  for (const peer of members)
    assert.equal(room.handle(peer.id, { type: 'ready', ready: true }), undefined);
  assert.equal(room.handle(members[0].id, { type: 'start' }), undefined);
  const expected = reserveTrays(room.session!.state);
  for (const peer of members)
    assert.equal(reserveTrays(room.snapshot(peer.id).view!.state), expected);
  for (const p of room.session!.state.pieces)
    if (!p.revealed) p.allegiance = p.allegiance === 'RC' ? 'Coalition' : 'RC';
  assert.equal(reserveTrays(room.session!.state), expected);
});

test('original mat images keep their source hashes and all rendered assets exist locally', () => {
  const root = new URL('../public/assets/', import.meta.url);
  const provenance = JSON.parse(readFileSync(new URL('mats/provenance.json', root), 'utf8'));
  for (const face of provenance.faces)
    assert.equal(
      createHash('sha256')
        .update(readFileSync(new URL(`mats/${face.file}`, root)))
        .digest('hex'),
      face.sha256,
    );
  const s = new GameSession({ scenario: 'fate', seed: 39 }).state;
  for (const match of reserveTrays(s).matchAll(/(?:src|href)="\/assets\/([^"]+)"/g))
    assert.ok(readFileSync(new URL(match[1], root)).length > 0, match[1]);
});
