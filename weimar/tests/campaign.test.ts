import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatch, GameSession } from '../src/engine/index.ts';
import { FACTIONS } from '../src/engine/types.ts';
import type { Command, Era, GameState } from '../src/engine/types.ts';
import { CARD } from '../src/data/cards.ts';
import { SPACES } from '../src/data/board.ts';
import { prepareEraDeck, ERA_HAND } from '../src/engine/decks.ts';
import { heldPenalties } from '../src/engine/lifecycle.ts';
import {
  active,
  assertInvariants,
  available,
  onMap,
  piecesAt,
  supremacy,
} from '../src/engine/rules.ts';

function send(s: GameState, command: Command): GameState {
  const r = dispatch(s, command);
  assert.ok(r.ok, r.ok ? '' : r.error);
  return r.state;
}
function settle(s: GameState): GameState {
  let count = 0;
  while (s.pending) {
    assert.ok(++count < 100, 'upkeep must complete');
    s = send(s, {
      type: 'choose',
      actor: s.pending.actor,
      option: s.pending.options.find((o) => o.id === 'stop')?.id ?? s.pending.options[0].id,
    });
  }
  return s;
}
function atYear(year: number): GameState {
  const s = createGame({ scenario: 'fate', seed: 1921 });
  s.year = year;
  s.half = 'late';
  s.phase = 'timeline';
  if (year >= 1924) {
    s.deck = prepareEraDeck(s, year >= 1930 ? 'decline' : 'golden');
    for (const f of FACTIONS) s.hands[f] = s.deck.splice(0, year >= 1930 ? 6 : 9);
  }
  return s;
}
function advance(s: GameState) {
  return send(s, {
    type: 'advance',
    actor: s.momentum,
    inflationSpace: SPACES.find((p) => s.influence[p.id].Coalition > 0)?.id,
  });
}
function order(s: GameState, factions = [...FACTIONS]) {
  return send(s, { type: 'set-order', actor: s.momentum, order: factions });
}
function allCards(s: GameState) {
  return [
    ...s.deck,
    ...s.discard,
    ...s.lingering,
    ...(s.removedCards ?? []),
    ...FACTIONS.flatMap((f) => s.hands[f]),
    ...(s.electionCard ? [s.electionCard] : []),
  ];
}
function emptyHands(s: GameState) {
  for (const f of FACTIONS) s.discard.push(...s.hands[f].splice(0));
}
function putLingering(s: GameState, id: number) {
  for (const zone of [s.deck, s.discard, ...FACTIONS.map((f) => s.hands[f])]) {
    const i = zone.findIndex((c) => c.card === id);
    if (i >= 0) {
      s.lingering.push(...zone.splice(i, 1));
      return;
    }
  }
  s.lingering.push({ uid: `card-${id}`, card: id });
}

test('Fate setup uses 9.6 influence, tracks, forces and standard stance restrictions', () => {
  const s = createGame({ scenario: 'fate', demo: true });
  assert.equal(s.demo, false);
  assert.equal(s.year, 1919);
  assert.equal(s.ruleset, 'standard-v1');
  assert.deepEqual(s.stance, { KPD: 2, NSDAP: 3 });
  assert.deepEqual(s.tracks, {
    economy: 5,
    progress: 1,
    reaction: 2,
    us: 1,
    ussr: 1,
    unity: 1,
    dollarDependence: 0,
  });
  assert.deepEqual(
    FACTIONS.map((f) => Object.values(s.influence).reduce((n, v) => n + v[f], 0)),
    [39, 13, 1, 13],
  );
  assert.deepEqual(
    ['Berlin', 'Koeln', 'Muenchen'].map((id) => supremacy(s, id)),
    ['Coalition', 'Coalition', 'Coalition'],
  );
  assert.equal(s.pieces.filter((p) => p.kind === 'leverage' && p.owner === 'RC').length, 6);
  assert.equal(s.pieces.filter((p) => p.kind === 'leverage' && p.owner === 'Coalition').length, 7);
  assert.equal(s.pieces.filter((p) => p.kind === 'mcs').length, 7);
  assert.equal(s.pieces.filter((p) => p.kind === 'freikorps' && !p.revealed).length, 9);
  assert.equal(
    s.pieces.filter((p) => p.kind === 'freikorps' && p.allegiance === 'Coalition').length,
    3,
  );
  assert.equal(s.pieces.filter((p) => p.kind === 'sa' && onMap(p)).length, 0);
  assert.equal(s.pieces.filter((p) => p.kind === 'strike' && available(s, p, 'KPD')).length, 3);
  assert.equal(s.pieces.filter((p) => p.kind === 'cadre' && available(s, p, 'NSDAP')).length, 0);
  assert.ok(Object.values(s.pc).every((p) => p.owner === 'Coalition' && p.available));
  assert.equal(s.seats.owner, null);
  assert.equal(s.deck.length, 25);
  assert.ok(FACTIONS.every((f) => s.hands[f].length === 7));
  assertInvariants(s);
  assert.deepEqual(s, createGame({ scenario: 'fate', demo: false }));
  assert.throws(() => createGame({ scenario: 'fate', testCard: 54 }), /实验牌/);
});

for (const [era, total, elections, specials] of [
  ['crisis', 53, 1, 2],
  ['golden', 63, 3, 5],
  ['decline', 43, 4, 5],
] as const) {
  test(`${era} deck has ${total} physical cards and ${elections} elections, all specials in the opening stack`, () => {
    for (const seed of [0, 1, 1921, 4294967295]) {
      const deck = prepareEraDeck({ rng: seed }, era);
      assert.equal(deck.length, total);
      assert.equal(new Set(deck.map((c) => c.uid)).size, total);
      assert.equal(deck.filter((c) => CARD[c.card].election).length, elections);
      assert.equal(
        deck
          .slice(0, 4 * ERA_HAND[era])
          .filter((c) => CARD[c.card].mandatory || CARD[c.card].election).length,
        specials,
      );
      assert.ok(
        deck
          .slice(4 * ERA_HAND[era])
          .every((c) => !CARD[c.card].mandatory && !CARD[c.card].election),
      );
      assert.ok(deck.every((c) => CARD[c.card].era === era));
      assert.deepEqual(deck, prepareEraDeck({ rng: seed }, era));
    }
  });
}

for (const [year, before, after] of [
  [1919, 5, 4],
  [1922, 3, 2],
  [1923, 4, 4],
  [1926, 6, 6],
  [1930, 6, 7],
  [1932, 8, 9],
]) {
  test(`entering ${year + 1} adjusts economy ${before} → ${after} without annual refill`, () => {
    const s = atYear(year);
    s.tracks.economy = before;
    const next = advance(s);
    assert.equal(next.year, year + 1);
    assert.equal(next.half, 'early');
    assert.equal(next.phase, 'order');
    assert.equal(next.tracks.economy, after);
    assert.deepEqual(next.hands, s.hands);
    assert.deepEqual(next.deck, s.deck);
  });
}

test('yellow leverage blocks annual inflation/unemployment; black leverage does not', () => {
  for (const [year, economy, box] of [
    [1921, 3, 3],
    [1931, 7, 7],
  ]) {
    const s = atYear(year);
    s.tracks.economy = economy;
    s.pieces.find((p) => p.kind === 'leverage' && p.owner === 'Coalition')!.location =
      `@economy:${box}`;
    assert.equal(advance(s).tracks.economy, economy);
    s.pieces.find((p) => p.location === `@economy:${box}`)!.location = '@us:1';
    s.pieces.find((p) => p.kind === 'leverage' && p.owner === 'RC')!.location = `@economy:${box}`;
    assert.equal(advance(s).tracks.economy, economy + (year < 1924 ? -1 : 1));
  }
});

test('1930 dollar crash returns both colors of economy leverage before annual order and penalties', () => {
  let s = atYear(1929);
  s.tracks.economy = 5;
  s.tracks.dollarDependence = 2;
  const yellow = s.pieces.find((p) => p.location === '@us:1')!;
  const black = s.pieces.find((p) => p.location === '@reaction:2')!;
  yellow.location = '@economy:6';
  black.location = '@economy:8';
  s.pieces.find((p) => p.location === '@ussr-yellow:4')!.location = 'Pommern';
  s = advance(s);
  assert.equal(s.year, 1930);
  assert.equal(s.phase, 'upkeep');
  assert.equal(s.pending?.actor, 'Coalition');
  assert.match(s.pending!.prompt, /归还/);
  assert.equal(s.lastHeldPenalty, undefined);
  s = settle(s);
  assert.equal(s.phase, 'order');
  assert.equal(s.eraChange, 'decline');
  assert.equal(s.tracks.economy, 7);
  assert.ok(
    s.pieces
      .filter((p) => [yellow.id, black.id].includes(p.id))
      .every((p) => p.location.startsWith('@') && !p.location.startsWith('@economy:')),
  );
  assert.equal(s.pieces.find((p) => p.location === 'Pommern')?.kind, 'leverage');
});

test('1930 without dollar dependence preserves economy but still clears its leverage', () => {
  const s = atYear(1929);
  s.tracks.economy = 3;
  s.pieces.find((p) => p.location === '@reaction:2')!.location = '@economy:4';
  const next = settle(advance(s));
  assert.equal(next.tracks.economy, 3);
  assert.equal(next.phase, 'order');
  assert.ok(!next.pieces.some((p) => p.location.startsWith('@economy:')));
});

test('timeline clears assassinations before inflation and does not advance while a return choice is pending', () => {
  let s = atYear(1922);
  s.tracks.economy = 1;
  s.turn.placed = ['Berlin'];
  s.pieces.find((p) => p.location === '@reaction-assassination:2')!.location = 'Berlin';
  s.pieces.find((p) => p.location === '@rc-assassination:1')!.location = 'Pommern';
  const before = s.influence.Berlin.Coalition;
  s = send(s, { type: 'advance', actor: s.momentum, inflationSpace: 'Berlin' });
  assert.equal(s.phase, 'upkeep');
  assert.equal(s.year, 1922);
  assert.equal(s.influence.Berlin.Coalition, before);
  assert.equal(s.pending?.actor, s.momentum);
  s = settle(s);
  assert.equal(s.year, 1923);
  assert.equal(s.influence.Berlin.Coalition, before - 1);
  assert.equal(piecesAt(s, 'Berlin', 'assassination').length, 0);
  assert.equal(piecesAt(s, 'Pommern', 'assassination').length, 1);
  assert.equal(s.tracks.economy, 1);
});

test('era penalties use the newly chosen order, permit zero removal, and reduce the deal independently', () => {
  let s = atYear(1923);
  const costs = heldPenalties(s),
    oldCards = allCards(s)
      .map((c) => c.uid)
      .sort();
  const newOrder = ['RC', 'NSDAP', 'KPD', 'Coalition'] as typeof s.order;
  s = advance(s);
  assert.equal(s.phase, 'order');
  assert.equal(s.pending, null);
  const rng = s.rng;
  s = order(s, newOrder);
  assert.equal(s.phase, 'upkeep');
  assert.ok(s.pending!.prompt.startsWith('RC 留牌：'));
  const influence = structuredClone(s.influence);
  for (const f of newOrder) {
    assert.ok(s.pending!.prompt.startsWith(`${f} 留牌：`));
    s = send(s, { type: 'choose', actor: s.pending!.actor, option: 'stop' });
  }
  assert.equal(s.phase, 'action');
  assert.equal(s.activeIndex, 0);
  assert.equal(active(s), 'RC');
  assert.deepEqual(s.influence, influence);
  assert.deepEqual(s.lastHeldPenalty, costs);
  assert.equal(s.eraChange, undefined);
  assert.deepEqual(s.removedCards!.map((c) => c.uid).sort(), oldCards);
  const expected = prepareEraDeck({ rng }, 'golden');
  for (const f of newOrder) assert.deepEqual(s.hands[f], expected.splice(0, 9 - costs[f]));
  assert.deepEqual(s.deck, expected);
  assert.equal(allCards(s).length, 53 + 63);
  assertInvariants(s);
});

test('held cards cost ordinary=1, mandatory=2, election=2; removal can repeat a space and stop early', () => {
  let s = atYear(1923);
  emptyHands(s);
  for (const id of [4, 152, 35]) {
    const zone = [s.deck, s.discard].find((z) => z.some((c) => c.card === id))!;
    s.hands.Coalition.push(
      ...zone.splice(
        zone.findIndex((c) => c.card === id),
        1,
      ),
    );
  }
  assert.deepEqual(heldPenalties(s), { Coalition: 5, KPD: 0, NSDAP: 0, RC: 0 });
  const before = s.influence.Berlin.Coalition;
  s.turn.placed = ['Berlin'];
  s = order(advance(s));
  s = send(s, { type: 'choose', actor: s.pending!.actor, option: 'Berlin' });
  s = send(s, { type: 'choose', actor: s.pending!.actor, option: 'Berlin' });
  assert.equal(s.influence.Berlin.Coalition, before - 2);
  s = settle(s);
  assert.deepEqual(
    FACTIONS.map((f) => s.hands[f].length),
    [4, 9, 9, 9],
  );
  assert.deepEqual(s.turn.placed, []);
  assert.deepEqual(s.turn.removed, []);
});

test('penalty above hand allowance gives zero cards; no influence does not waive draw penalties', () => {
  let s = atYear(1929);
  emptyHands(s);
  s.hands.KPD = s.deck.splice(0, 10);
  for (const v of Object.values(s.influence)) v.KPD = 0;
  s = settle(order(advance(s)));
  assert.equal(s.phase, 'action');
  assert.equal(s.hands.KPD.length, 0);
  assert.equal(s.hands.Coalition.length, 6);
  assert.equal(s.hands.NSDAP.length, 6);
  assert.equal(s.hands.RC.length, 6);
  assert.equal(s.deck.length, 25);
  assertInvariants(s);
});

for (const [year, expired, kept, era] of [
  [1923, [4, 17], [1, 20], 'golden'],
  [1929, [20, 54, 57, 80], [1, 55, 59, 92], 'decline'],
] as [number, number[], number[], Era][]) {
  test(`${year} era boundary expires only specified lingering events and removes old hands/deck/discards`, () => {
    let s = atYear(year);
    emptyHands(s);
    for (const id of [...expired, ...kept]) putLingering(s, id);
    const oldCount = allCards(s).length;
    s = settle(order(advance(s)));
    assert.deepEqual(
      s.lingering.map((c) => c.card),
      kept,
    );
    assert.ok(expired.every((id) => s.removedCards!.some((c) => c.card === id)));
    assert.equal(s.discard.length, 0);
    assert.equal(allCards(s).length, oldCount + (era === 'golden' ? 63 : 43));
    assert.ok(
      [...s.deck, ...FACTIONS.flatMap((f) => s.hands[f])].every((c) => CARD[c.card].era === era),
    );
    assertInvariants(s);
  });
}

test('1933 all four factions pay influence penalties, then Coalition held cards trigger final election', () => {
  let s = atYear(1933);
  s.tracks.economy = 7;
  const counts = FACTIONS.map((f) => s.hands[f].length);
  const economy = s.tracks.economy;
  s = advance(s);
  for (const f of FACTIONS) {
    assert.ok(s.pending!.prompt.startsWith(`${f} 留牌：`));
    const space = SPACES.find((p) => s.influence[p.id][f] > 0)!;
    const before = s.influence[space.id][f];
    s = send(s, { type: 'choose', actor: s.pending!.actor, option: space.id });
    assert.equal(s.influence[space.id][f], before - 1);
    if (s.pending?.prompt.startsWith(`${f} 留牌：`))
      s = send(s, { type: 'choose', actor: s.pending.actor, option: 'stop' });
  }
  assert.equal(s.year, 1933);
  assert.equal(s.half, 'late');
  assert.equal(s.phase, 'election');
  assert.equal(s.scenarioEnding, true);
  assert.equal(s.tracks.economy, economy);
  assert.deepEqual(
    FACTIONS.map((f) => s.hands[f].length),
    counts,
  );
  s = advance(s);
  assert.equal(s.phase, 'finished');
  assert.equal(s.winner, 'Coalition');
  assert.match(s.winReason!, /1933年最终选举/);
});

test('1933 Coalition with no held cards wins only after other factions finish their penalties', () => {
  let s = atYear(1933);
  s.discard.push(...s.hands.Coalition.splice(0));
  s = advance(s);
  assert.equal(s.winner, undefined);
  assert.ok(s.pending!.prompt.startsWith('KPD 留牌：'));
  s = settle(s);
  assert.equal(s.phase, 'finished');
  assert.equal(s.winner, 'Coalition');
  assert.equal(s.lastElection, undefined);
  assert.equal(s.year, 1933);
  assert.match(s.winReason!, /没有留牌惩罚/);
});

test('Coalition holding an ordinary card still forces final election after Momentum waives all removals', () => {
  let s = atYear(1933);
  emptyHands(s);
  const zone = [s.deck, s.discard].find((z) => z.some((c) => c.card === 150))!;
  s.hands.Coalition.push(
    ...zone.splice(
      zone.findIndex((c) => c.card === 150),
      1,
    ),
  );
  s = settle(advance(s));
  assert.equal(s.phase, 'election');
  assert.equal(s.lastHeldPenalty!.Coalition, 1);
});

test('an earlier victory ends play before era upkeep or deck replacement', () => {
  let s = atYear(1923);
  s.phase = 'sudden-victory';
  s.victoryDeclared = ['Coalition'];
  s.pieces
    .filter((p) => p.kind === 'reform')
    .forEach((p, i) => {
      p.location = SPACES[i].id;
    });
  const before = s.deck;
  s = advance(s);
  assert.equal(s.phase, 'finished');
  assert.equal(s.winner, 'Coalition');
  assert.equal(s.year, 1923);
  assert.equal(s.eraChange, undefined);
  assert.deepEqual(s.deck, before);
  assert.equal(dispatch(s, { type: 'advance', actor: s.momentum }).ok, false);
});

function nextCommand(s: GameState): Command {
  if (s.pending)
    return {
      type: 'choose',
      actor: s.pending.actor,
      option: s.pending.options.find((o) => o.id === 'stop')?.id ?? s.pending.options[0].id,
    };
  if (s.phase === 'order')
    return { type: 'set-order', actor: s.momentum, order: ['RC', 'KPD', 'NSDAP', 'Coalition'] };
  if (s.phase === 'action')
    return { type: s.turn.mode === 'unselected' ? 'pass' : 'end-turn', actor: active(s) };
  return {
    type: 'advance',
    actor: s.momentum,
    inflationSpace: SPACES.find((p) => s.influence[p.id].Coalition > 0)?.id,
  };
}

test('full 30-round campaign through all eras, including save/import and undo/redo at pending penalties', () => {
  let session = new GameSession({ scenario: 'fate', seed: 7 });
  const rounds = new Set<string>(),
    crossed = new Set<number>();
  let commands = 0;
  while (session.state.phase !== 'finished') {
    assert.ok(++commands < 500);
    const s = session.state;
    if (s.phase === 'action') rounds.add(`${s.year}:${s.half}`);
    if (s.pending?.prompt.includes('留牌：') && !crossed.has(s.year)) {
      crossed.add(s.year);
      const saved = session.export();
      session = GameSession.import(saved);
      assert.deepEqual(session.state, s);
      session.undo();
      session.redo();
      assert.deepEqual(session.state, s);
    }
    const r = session.send(nextCommand(session.state));
    assert.ok(r.ok, r.ok ? '' : r.error);
  }
  assert.equal(rounds.size, 30);
  assert.deepEqual([...crossed], [1924, 1930, 1933]);
  assert.equal(session.state.year, 1933);
  assert.ok(session.state.winner);
  assert.equal(allCards(session.state).length, 159);
  assert.deepEqual(GameSession.import(session.export()).state, session.state);
  session.undo();
  assert.notEqual(session.state.phase, 'finished');
  session.redo();
  assert.equal(session.state.phase, 'finished');
});
