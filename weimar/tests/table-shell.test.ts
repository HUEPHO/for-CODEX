import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession, FACTIONS } from '../src/engine/index.ts';
import { SCENARIOS } from '../src/engine/scenarios.ts';
import type { ScenarioId } from '../src/engine/types.ts';
import { RoomAuthority } from '../src/multiplayer/authority.ts';
import { cardCollections, cardPage, handRail, playerRail } from '../src/ui/table-shell.ts';
import { tabletop } from '../src/ui/tabletop.ts';

test('the four right-rail mats and board retain every live piece in every scenario', () => {
  for (const scenario of [undefined, ...Object.keys(SCENARIOS)] as (ScenarioId | undefined)[]) {
    const s = new GameSession({ scenario, seed: 39 }).state;
    const markup = tabletop(s, 'Berlin', [], 1) + playerRail(s, ['Coalition']);
    const ids = [...markup.matchAll(/data-pieces="([^"]+)"/g)].flatMap((m) => m[1].split(' '));
    assert.deepEqual(
      ids.sort(),
      s.pieces
        .filter((p) => p.location !== 'removed')
        .map((p) => p.id)
        .sort(),
    );
    assert.deepEqual(
      [...markup.matchAll(/data-open-mat="([^"]+)"/g)].map((m) => m[1]),
      s.order,
    );
  }
});

test('left rail admits owned hands and authorized reveals, including multiple owned seats', () => {
  const s = new GameSession({ scenario: 'fate', seed: 39 }).state;
  s.reveals = [
    { viewer: 'KPD', target: 'RC', cards: [s.hands.RC[0]] },
    { viewer: 'NSDAP', target: 'Coalition', cards: [s.hands.Coalition[0]] },
  ];
  const collections = cardCollections(s, ['KPD', 'RC']);
  assert.deepEqual(
    collections.filter((c) => c.owner).map((c) => c.owner),
    ['KPD', 'RC'],
  );
  assert.deepEqual(
    collections.filter((c) => c.id.startsWith('reveal')).flatMap((c) => c.cards),
    [s.hands.RC[0]],
  );
  assert.equal(collections.find((c) => c.id === 'lingering')!.cards, s.lingering);
  for (const c of collections) {
    const markup = handRail(collections, c.id, 0, 8, '', false);
    for (const hidden of [...s.hands.Coalition, ...s.hands.NSDAP])
      assert.ok(!markup.includes(`data-visible-card="${hidden.uid}"`));
  }
});

test('hand pagination reaches each card once and clamps after cards leave the hand', () => {
  const cards = Array.from({ length: 19 }, (_, i) => ({ uid: `test-${i}`, card: i + 1 }));
  const collection = { id: 'KPD', label: 'KPD手牌', cards };
  for (const size of [4, 6, 8]) {
    const pages = Array.from({ length: cardPage(collection, 0, size).count }, (_, n) =>
      cardPage(collection, n, size),
    );
    assert.deepEqual(
      pages.flatMap((p) => p.cards),
      cards,
    );
    assert.equal(cardPage(collection, 99, size).current, pages.length - 1);
    assert.equal(cardPage(collection, -1, size).current, 0);
    assert.deepEqual(cardPage({ ...collection, cards: [cards[0]] }, 4, size), {
      count: 1,
      current: 0,
      cards: [cards[0]],
    });
    assert.deepEqual(cardPage({ ...collection, cards: [] }, 4, size), {
      count: 1,
      current: 0,
      cards: [],
    });
  }
});

test('Steam clients keep their own hand while another faction acts and show all public hand counts', () => {
  const members = FACTIONS.map((_, i) => ({ id: String(1001 + i), name: `Player ${i}` }));
  const room = new RoomAuthority('table-shell', members[0], 'fate');
  room.setMembers(members);
  for (let i = 1; i < 4; i++)
    assert.equal(
      room.handle(members[i].id, { type: 'seat', faction: FACTIONS[i], claim: true }),
      undefined,
    );
  for (const peer of members)
    assert.equal(room.handle(peer.id, { type: 'ready', ready: true }), undefined);
  assert.equal(room.handle(members[0].id, { type: 'start' }), undefined);
  const s = room.session!.state;
  assert.equal(
    room.session!.send({ type: 'set-order', actor: 'Coalition', order: [...FACTIONS] }).ok,
    true,
  );
  for (let i = 0; i < 4; i++) {
    const view = room.snapshot(members[i].id).view!;
    const collections = cardCollections(view.state, view.factions);
    assert.deepEqual(collections[0].cards, room.session!.state.hands[FACTIONS[i]]);
    const rail = playerRail(view.state, view.factions, view.handCounts);
    for (const f of FACTIONS)
      assert.match(
        rail,
        new RegExp(`data-player="${f}"[\\s\\S]*?手牌 <b>${s.hands[f].length}</b>`),
      );
    if (i > 0) {
      assert.equal(view.canAct, false);
      assert.equal(view.state.hands.Coalition.length, 0);
      assert.doesNotMatch(handRail(collections, FACTIONS[i], 0, 6, '', false), /data-hand-select/);
    }
  }
});
