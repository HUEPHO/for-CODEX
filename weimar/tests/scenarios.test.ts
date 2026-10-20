import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  dispatch,
  GameSession,
  legalActions,
  previewElection,
} from '../src/engine/index.ts';
import { FACTIONS } from '../src/engine/types.ts';
import type { Command, Faction, GameState, ScenarioId } from '../src/engine/types.ts';
import { CARD } from '../src/data/cards.ts';
import { SPACES } from '../src/data/board.ts';
import {
  active,
  assertInvariants,
  available,
  clampTracks,
  onMap,
  piecesAt,
  supremacy,
} from '../src/engine/rules.ts';
import { eventEffects } from '../src/engine/events.ts';
import { finishElection } from '../src/engine/elections.ts';
import { shiftStance } from '../src/engine/policies.ts';
import { gameHost } from '../src/engine/flow/game-host.ts';

function send(s: GameState, command: Command): GameState {
  const r = dispatch(s, command);
  assert.ok(r.ok, r.ok ? '' : r.error);
  return r.state;
}
function ready(scenario: ScenarioId, actor: Faction = 'Coalition') {
  const s = createGame({ scenario });
  return send(s, {
    type: 'set-order',
    actor: 'Coalition',
    order: [actor, ...FACTIONS.filter((f) => f !== actor)],
  });
}
function single(scenario: ScenarioId, actor: Faction) {
  return send(ready(scenario, actor), { type: 'begin-turn', actor, mode: 'single' });
}
function settle(s: GameState) {
  let n = 0;
  while (s.pending) {
    assert.ok(++n < 100);
    s = send(s, {
      type: 'choose',
      actor: s.pending.actor,
      option: s.pending.options.find((o) => o.id === 'stop')?.id ?? s.pending.options[0].id,
    });
  }
  return s;
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
function passRemaining(s: GameState) {
  while (s.phase === 'action') {
    const actor = active(s);
    if (s.turn.mode === 'unselected') s = send(s, { type: 'pass', actor });
    s = send(s, { type: 'end-turn', actor });
  }
  return s;
}
function emptyHands(s: GameState) {
  for (const f of FACTIONS) s.discard.push(...s.hands[f].splice(0));
}

test('Revolution uses the 1919 map and moves one black leverage from USSR to the RC mat', () => {
  const s = createGame({ scenario: 'revolution' });
  assert.equal(s.year, 1919);
  assert.deepEqual(s.stance, { KPD: 2, NSDAP: 3 });
  assert.equal(s.tracks.progress, 1);
  assert.equal(s.tracks.reaction, 2);
  assert.equal(piecesAt(s, '@ussr-black:1').length, 0);
  assert.equal(piecesAt(s, '@rc-economic:1').length, 1);
  assert.deepEqual(s.influence, createGame({ scenario: 'fate' }).influence);
  assert.ok(FACTIONS.every((f) => s.hands[f].length === 7));
  assert.equal(s.deck.length, 25);
  assert.equal(s.lingering.length, 0);
  assert.equal(s.seats.owner, null);
});

test('New Hope uses the 1924 map, strong unity, nine-card deal, and six surviving rogue Freikorps', () => {
  const s = createGame({ scenario: 'new-hope' });
  assert.equal(s.year, 1924);
  assert.deepEqual(s.tracks, {
    economy: 5,
    progress: 2,
    reaction: 3,
    us: 2,
    ussr: 2,
    unity: 2,
    dollarDependence: 0,
  });
  assert.deepEqual(
    FACTIONS.map((f) => Object.values(s.influence).reduce((n, v) => n + v[f], 0)),
    [41, 10, 2, 15],
  );
  assert.deepEqual(s.seats, { owner: 'RC', available: true });
  assert.equal(s.lingering.length, 0);
  assert.ok(FACTIONS.every((f) => s.hands[f].length === 9));
  assert.equal(s.deck.length, 27);
  assert.equal(s.removedCards!.length, 53);
  assert.deepEqual(
    ['Berlin', 'Muenchen'].map((id) => supremacy(s, id)),
    ['Coalition', 'NSDAP'],
  );
  assert.deepEqual(
    piecesAt(s, 'Bayern').map((p) => p.kind),
    ['leverage', 'clique'],
  );
  assert.equal(piecesAt(s, 'Ostpreussen', 'clique').length, 1);
  const freikorps = s.pieces.filter((p) => p.kind === 'freikorps');
  assert.equal(freikorps.filter((p) => p.location !== 'removed').length, 6);
  assert.ok(
    freikorps.filter((p) => p.location !== 'removed').every((p) => p.owner === 'RC' && p.revealed),
  );
  assert.equal(
    freikorps.filter((p) => p.location === 'removed' && p.owner === 'Coalition').length,
    3,
  );
  assert.equal(freikorps.filter((p) => p.location === 'removed' && p.owner === 'RC').length, 3);
});

test('Black Sun historical board has neutral Koeln, two dollars and five pre-existing lingering events', () => {
  const s = createGame({ scenario: 'black-sun' });
  assert.equal(s.year, 1928);
  assert.deepEqual(s.tracks, {
    economy: 5,
    progress: 4,
    reaction: 3,
    us: 4,
    ussr: 4,
    unity: 1,
    dollarDependence: 2,
  });
  assert.deepEqual(
    FACTIONS.map((f) => Object.values(s.influence).reduce((n, v) => n + v[f], 0)),
    [42, 11, 7, 17],
  );
  assert.deepEqual(s.pc.Koeln, { owner: null, available: false });
  assert.ok(
    Object.entries(s.pc)
      .filter(([id]) => id !== 'Koeln')
      .every(([, p]) => p.owner === 'Coalition' && p.available),
  );
  assert.deepEqual(
    ['Bayern', 'Berlin', 'Hamburg', 'Koeln', 'Muenchen', 'Ostpreussen'].map((id) =>
      supremacy(s, id),
    ),
    // #57 is already in effect: Berlin's rogue Freikorps ties the Reichswehr at 3.
    ['RC', null, 'KPD', 'KPD', 'Coalition', 'RC'],
  );
  assert.equal(piecesAt(s, 'Koeln', 'militia').length, 2);
  assert.equal(piecesAt(s, 'Muenchen', 'sa').length, 2);
  assert.equal(piecesAt(s, 'Berlin', 'leverage')[0].owner, 'Coalition');
  assert.deepEqual(
    FACTIONS.map(
      (f) => s.pieces.filter((p) => p.kind === 'mcs' && p.location === `mat:${f}`).length,
    ),
    [1, 0, 1, 1],
  );
  assert.equal(s.lingering.length, 5);
  assert.deepEqual(
    s.lingering.slice(0, 2).map((c) => c.card),
    [54, 57],
  );
  assert.equal(s.deck.length, 38);
  assert.ok(FACTIONS.every((f) => s.hands[f].length === 3));
  assert.equal(s.removedCards!.filter((c) => c.card === 153).length, 3);
});

test('Black Sun random lingering selection is seeded and does not execute one-time event effects', () => {
  const selections = new Set<string>();
  for (const seed of [0, 1, 2, 7, 42, 1921, 4294967295]) {
    const s = createGame({ scenario: 'black-sun', seed });
    selections.add(
      s.lingering
        .slice(2)
        .map((c) => c.card)
        .join(','),
    );
    assert.deepEqual(s, createGame({ scenario: 'black-sun', seed }));
    assert.equal(s.momentum, 'Coalition'); // Pre-setting #57 does not grant its event momentum.
    assert.equal(s.tracks.unity, 1); // #54 starts in effect without its one-time track change.
    assert.equal(s.tracks.us, 4);
    assert.deepEqual(s.stance, { KPD: 0, NSDAP: 0 });
    assert.equal(s.effects.length, 0);
    assert.equal(s.pending, null);
    const live = [...s.deck, ...FACTIONS.flatMap((f) => s.hands[f])];
    assert.ok(
      live.every(
        (c) => CARD[c.card].era === 'golden' && !CARD[c.card].lingering && !CARD[c.card].election,
      ),
    );
    assert.equal(allCards(s).length, 116);
    assertInvariants(s);
  }
  assert.ok(selections.size > 1);
});

test('all historical setups conserve every piece type and create independent games', () => {
  for (const scenario of ['revolution', 'new-hope', 'black-sun'] as const) {
    const s = createGame({ scenario });
    const expected = {
      leverage: 13,
      mcs: 7,
      reform: 4,
      assassination: 3,
      cadre: 10,
      clique: 3,
      reichswehr: 3,
      strike: 4,
      freikorps: 12,
      militia: 9,
      sa: 9,
    };
    for (const [kind, count] of Object.entries(expected))
      assert.equal(s.pieces.filter((p) => p.kind === kind).length, count, `${scenario} ${kind}`);
    const snapshot = structuredClone(s);
    s.tracks.economy = 9;
    s.stance.KPD = -3;
    s.pieces[0].location = 'Berlin';
    assert.deepEqual(createGame({ scenario }), snapshot);
  }
});

for (const scenario of ['fate', 'revolution', 'new-hope', 'black-sun'] as const) {
  test(`${scenario} reaction cap applies consistently to action validation and track clamping`, () => {
    let s = single(scenario, 'RC');
    s.tracks.progress = 1;
    s.tracks.reaction = 2;
    if (!piecesAt(s, '@reaction:3').length)
      s.pieces.find(
        (p) => p.kind === 'leverage' && p.owner === 'RC' && p.location.startsWith('@rc-economic:'),
      )!.location = '@reaction:3';
    const r = dispatch(s, { type: 'action', actor: 'RC', action: { kind: 'advance-reaction' } });
    const limited = scenario === 'fate' || scenario === 'new-hope';
    assert.equal(r.ok, !limited);
    if (r.ok) assert.equal(r.state.tracks.reaction, 3);
    s.tracks.reaction = 3;
    clampTracks(s);
    assert.equal(s.tracks.reaction, limited ? 2 : 3);
  });
}

test('Black Sun ignores stance restrictions for mat pieces, declarations and events, but preserves prerequisites', () => {
  let s = single('black-sun', 'KPD');
  const matPieces = s.pieces.filter(
    (p) => p.location.startsWith('@kpd-') || p.location.startsWith('@nsdap-'),
  );
  assert.ok(
    matPieces.every((p) => available(s, p, p.location.startsWith('@kpd-') ? 'KPD' : 'NSDAP')),
  );
  assert.ok(!legalActions(s).some(({ action }) => action.kind === 'change-stance'));
  assert.equal(
    dispatch(s, { type: 'action', actor: 'KPD', action: { kind: 'change-stance', steps: 1 } }).ok,
    false,
  );
  assert.equal(
    dispatch(s, { type: 'action', actor: 'KPD', action: { kind: 'declare-victory' } }).ok,
    true,
  );
  shiftStance(s, 'KPD', 3);
  shiftStance(s, 'NSDAP', -3);
  assert.deepEqual(s.stance, { KPD: 0, NSDAP: 0 });
  assert.equal(
    gameHost(s).query(
      { kind: 'stance.value', args: { faction: 'KPD' } },
      {
        origin: 'card',
        initiator: 'KPD',
        turnOwner: 'KPD',
        beneficiary: 'KPD',
        returnDecider: 'KPD',
      },
    ),
    0,
  );
  s.removedCards!.push(...s.lingering.filter((c) => c.card === 62));
  s.lingering = s.lingering.filter((c) => c.card !== 62);
  const before = s.pieces.map((p) => p.location);
  const blocked = eventEffects(s, { uid: 'test-83', card: 83 }, 'Coalition');
  assert.deepEqual(blocked, [
    { type: 'finish-card', card: { uid: 'test-83', card: 83 }, resolved: false },
  ]);
  assert.deepEqual(
    s.pieces.map((p) => p.location),
    before,
  );
  s = single('revolution', 'KPD');
  assert.ok(legalActions(s).some(({ action }) => action.kind === 'change-stance'));
  assert.equal(
    dispatch(s, { type: 'action', actor: 'KPD', action: { kind: 'declare-victory' } }).ok,
    false,
  );
});

test('extra election spends a PC without a normal bonus or clean slate and preserves the action budget', () => {
  let s = single('revolution', 'Coalition');
  const assassin = s.pieces.find((p) => p.kind === 'assassination')!;
  assassin.location = 'Berlin';
  const before = structuredClone(s);
  s = send(s, { type: 'call-extra-election', actor: 'Coalition', card: 'pc', region: 'Berlin' });
  assert.equal(s.pc.Berlin.available, false);
  assert.equal(s.turn.pcUsed, true);
  assert.equal(s.turn.actionsLeft, 1);
  assert.equal(s.extraElectionUsed, true);
  assert.equal(s.extraElectionPending, true);
  assert.equal(s.electionCalled, false);
  assert.deepEqual(s.pieces, before.pieces);
  assert.deepEqual(s.tracks, before.tracks);
  assert.deepEqual(s.influence, before.influence);
  assert.equal(dispatch(s, { type: 'play-pc', actor: 'Coalition', region: 'Hamburg' }).ok, false);
});

test('extra election can use seats without lowering unity or doing a clean slate', () => {
  let s = ready('revolution', 'RC');
  s.seats = { owner: 'RC', available: true };
  s.momentum = 'RC';
  const before = structuredClone(s);
  s = send(s, { type: 'call-extra-election', actor: 'RC', card: 'seats' });
  assert.equal(s.seats.available, false);
  assert.equal(s.tracks.unity, before.tracks.unity);
  assert.equal(s.turn.pcUsed, false);
  assert.deepEqual(s.pieces, before.pieces);
  assert.equal(s.turn.mode, 'unselected');
});

test('extra election rejects wrong scenario, wrong momentum, spent/unowned cards, second use and mid-action-pair', () => {
  const fixtures: { s: GameState; command: Command }[] = [];
  const pc: Command = {
    type: 'call-extra-election',
    actor: 'Coalition',
    card: 'pc',
    region: 'Berlin',
  };
  fixtures.push({ s: ready('fate'), command: pc });
  const other = ready('revolution');
  other.momentum = 'KPD';
  fixtures.push({ s: other, command: pc });
  const spent = ready('revolution');
  spent.pc.Berlin.available = false;
  fixtures.push({ s: spent, command: pc });
  const unowned = ready('revolution');
  unowned.pc.Berlin.owner = 'RC';
  fixtures.push({ s: unowned, command: pc });
  const pcUsed = ready('revolution');
  pcUsed.turn.pcUsed = true;
  fixtures.push({ s: pcUsed, command: pc });
  fixtures.push({ s: send(ready('revolution'), pc), command: pc });
  const pair = ready('revolution');
  pair.turn.mode = 'event-last';
  pair.turn.actionsLeft = 1;
  fixtures.push({ s: pair, command: pc });
  fixtures.push({
    s: ready('revolution'),
    command: { type: 'call-extra-election', actor: 'Coalition', card: 'seats' },
  });
  for (const { s, command } of fixtures) {
    const before = structuredClone(s);
    const r = dispatch(s, command);
    assert.equal(r.ok, false);
    assert.deepEqual(s, before);
    assert.deepEqual(r.state, before);
  }
});

for (const normalFirst of [false, true]) {
  test(`extra and ordinary election coexist and resolve once (ordinary first=${normalFirst})`, () => {
    let s = ready('revolution');
    const zone = [s.deck, ...FACTIONS.map((f) => s.hands[f])].find((z) =>
      z.some((c) => c.card === 152),
    )!;
    const [election] = zone.splice(
      zone.findIndex((c) => c.card === 152),
      1,
    );
    s.hands.Coalition.push(election);
    const call: Command = {
      type: 'call-extra-election',
      actor: 'Coalition',
      card: 'pc',
      region: 'Berlin',
    };
    if (!normalFirst) s = send(s, call);
    s = send(s, {
      type: 'begin-turn',
      actor: 'Coalition',
      mode: 'event-first',
      cardUid: election.uid,
    });
    if (normalFirst) s = send(s, call);
    for (let n = 0; n < 2; n++)
      s = send(s, { type: 'action', actor: 'Coalition', action: { kind: 'gain-momentum' } });
    s = passRemaining(s);
    s = send(s, { type: 'advance', actor: s.momentum });
    assert.equal(s.phase, 'election');
    s = settle(send(s, { type: 'advance', actor: s.momentum }));
    assert.equal(s.phase, 'timeline');
    assert.equal(s.extraElectionPending, false);
    assert.equal(s.extraElectionUsed, true);
    assert.equal(s.electionCalled, false);
    assert.equal(s.electionCard, undefined);
    assert.equal(s.discard.filter((c) => c.card === 152).length, 1);
    assert.equal(s.log.filter((l) => l.text.startsWith('全国选举：')).length, 1);
    s = send(s, { type: 'advance', actor: s.momentum });
    assert.equal(s.half, 'late');
    assert.equal(dispatch(s, call).ok, false);
  });
}

test('an extra election by itself schedules the normal full election cycle after all four turns', () => {
  let s = ready('revolution');
  s = send(s, { type: 'call-extra-election', actor: 'Coalition', card: 'pc', region: 'Berlin' });
  s = passRemaining(s);
  s = send(s, { type: 'advance', actor: s.momentum });
  assert.equal(s.phase, 'election');
  assert.equal(s.electionCard, undefined);
  s = settle(send(s, { type: 'advance', actor: s.momentum }));
  assert.equal(s.phase, 'timeline');
  assert.ok(s.lastElection?.regions.length);
  assert.ok(s.seats.available);
  assert.equal(s.article48, true);
  assert.equal(s.extraElectionPending, false);
});

test('Revolution terminal PV applies military supremacy, uprising and assassination modifiers only nationally', () => {
  const s = createGame({ scenario: 'revolution' });
  s.pieces
    .filter((p) => ['freikorps', 'reichswehr', 'militia', 'sa'].includes(p.kind) && onMap(p))
    .forEach((p) => (p.location = `reserve:${p.owner}`));
  s.pieces.find((p) => p.kind === 'militia')!.location = 'Berlin';
  s.pieces.find((p) => p.kind === 'sa')!.location = 'Muenchen';
  s.pieces.find((p) => p.kind === 'freikorps' && p.owner === 'RC')!.location = 'Hamburg';
  const strike = s.pieces.find((p) => p.kind === 'strike')!;
  strike.location = 'Sachsen';
  strike.side = 'uprising';
  const assassin = s.pieces.find((p) => p.kind === 'assassination')!;
  assassin.location = 'Bayern';
  const ordinary = previewElection(s);
  s.scenarioEnding = true;
  const final = previewElection(s);
  assert.deepEqual(final.regions, ordinary.regions);
  assert.deepEqual(final.base, ordinary.base);
  assert.deepEqual(
    FACTIONS.map((f) => final.totals[f] - ordinary.totals[f]),
    [-3, 7, 3, 3],
  );
  assert.deepEqual(previewElection(s), final); // Preview is pure and does not apply modifiers twice.
  finishElection(s);
  assert.deepEqual(s.lastElection!.totals, final.totals);
});

test('Revolution final election does not grant supremacy bonuses for tied cities or regional spaces', () => {
  const s = createGame({ scenario: 'revolution' });
  s.pieces
    .filter((p) => ['freikorps', 'reichswehr', 'militia', 'sa'].includes(p.kind) && onMap(p))
    .forEach((p) => (p.location = `reserve:${p.owner}`));
  s.pieces.find((p) => p.kind === 'militia')!.location = 'Berlin';
  s.pieces.find((p) => p.kind === 'sa')!.location = 'Berlin';
  s.pieces.find((p) => p.kind === 'freikorps' && p.owner === 'RC')!.location = 'Bayern';
  assert.equal(supremacy(s, 'Berlin'), null);
  const ordinary = previewElection(s);
  s.scenarioEnding = true;
  assert.deepEqual(previewElection(s).totals, ordinary.totals);
});

test('1933 branch is shared by New Hope and Black Sun, with correct scenario names', () => {
  for (const scenario of ['new-hope', 'black-sun'] as const) {
    let s = createGame({ scenario });
    s.year = 1933;
    s.half = 'late';
    s.phase = 'timeline';
    emptyHands(s);
    s = send(s, { type: 'advance', actor: 'Coalition' });
    assert.equal(s.phase, 'finished');
    assert.equal(s.winner, 'Coalition');
    assert.match(s.winReason!, scenario === 'new-hope' ? /^新希望/ : /^黑日升起/);
  }
});

test('Black Sun enters 1930 with its dollar crash, expired preset events and six new cards per faction', () => {
  let s = createGame({ scenario: 'black-sun' });
  const permanent = s.lingering.filter((c) => !CARD[c.card].expires);
  s.year = 1929;
  s.half = 'late';
  s.phase = 'timeline';
  emptyHands(s);
  s = settle(send(s, { type: 'advance', actor: s.momentum }));
  assert.equal(s.year, 1930);
  assert.equal(s.phase, 'order');
  assert.equal(s.tracks.economy, 7);
  s = send(s, { type: 'set-order', actor: s.momentum, order: [...FACTIONS] });
  assert.equal(s.phase, 'action');
  assert.deepEqual(s.lingering, permanent);
  assert.ok([54, 57].every((id) => s.removedCards!.some((c) => c.card === id)));
  assert.ok(FACTIONS.every((f) => s.hands[f].length === 6));
  assert.ok(s.deck.every((c) => CARD[c.card].era === 'decline'));
  assert.equal(allCards(s).length, 159);
  assertInvariants(s);
});

test('Revolution negative final Coalition PV allows a zero transfer, but cannot give positive votes', () => {
  const s = createGame({ scenario: 'revolution' });
  s.phase = 'election';
  s.scenarioEnding = true;
  for (const v of Object.values(s.influence)) v.Coalition = 0;
  for (const p of s.pieces) {
    if (p.owner === 'Coalition' && onMap(p)) p.location = 'reserve:Coalition';
    if (p.kind === 'assassination') p.location = 'Bayern';
  }
  assert.equal(previewElection(s).totals.Coalition, -6);
  assert.equal(
    dispatch(s, {
      type: 'advance',
      actor: 'Coalition',
      transfer: { to: 'KPD', amount: 1 },
    }).ok,
    false,
  );
  const finished = settle(
    send(s, {
      type: 'advance',
      actor: 'Coalition',
      transfer: { to: 'KPD', amount: 0 },
    }),
  );
  assert.equal(finished.phase, 'finished');
  assert.equal(finished.lastElection!.totals.Coalition, -6);
});

function nextCommand(s: GameState): Command {
  if (s.pending)
    return {
      type: 'choose',
      actor: s.pending.actor,
      option: s.pending.options.find((o) => o.id === 'stop')?.id ?? s.pending.options[0].id,
    };
  if (s.phase === 'order') return { type: 'set-order', actor: s.momentum, order: [...FACTIONS] };
  if (s.phase === 'action')
    return { type: s.turn.mode === 'unselected' ? 'pass' : 'end-turn', actor: active(s) };
  return {
    type: 'advance',
    actor: s.momentum,
    inflationSpace: SPACES.find((p) => s.influence[p.id].Coalition > 0)?.id,
  };
}
for (const [scenario, rounds, ending] of [
  ['revolution', 10, 1923],
  ['new-hope', 20, 1933],
  ['black-sun', 12, 1933],
] as const) {
  test(`${scenario} completes ${rounds} rounds with conserved cards and replay across its boundaries`, () => {
    let session = new GameSession({ scenario, seed: 42 });
    const visited = new Set<string>(),
      reloaded = new Set<number>();
    let count = 0;
    while (session.state.phase !== 'finished') {
      assert.ok(++count < 400);
      const s = session.state;
      if (s.phase === 'action') visited.add(`${s.year}:${s.half}`);
      if (((s.pending && s.year === 1930) || s.scenarioEnding) && !reloaded.has(s.year)) {
        reloaded.add(s.year);
        session = GameSession.import(session.export());
        assert.deepEqual(session.state, s);
        session.undo();
        session.redo();
        assert.deepEqual(session.state, s);
      }
      const r = session.send(nextCommand(session.state));
      assert.ok(r.ok, r.ok ? '' : r.error);
    }
    assert.equal(visited.size, rounds);
    assert.equal(session.state.year, ending);
    assert.ok(session.state.winner);
    assert.equal(allCards(session.state).length, scenario === 'revolution' ? 53 : 159);
    if (scenario === 'revolution') {
      assert.equal(session.state.lastHeldPenalty, undefined);
      assert.match(session.state.winReason!, /1923年最终选举/);
    }
    assert.deepEqual(GameSession.import(session.export()).state, session.state);
  });
}

test('extra election commands survive save/import and undo/redo without spending twice', () => {
  let session = new GameSession({ scenario: 'revolution' });
  assert.ok(session.send({ type: 'set-order', actor: 'Coalition', order: [...FACTIONS] }).ok);
  assert.ok(
    session.send({ type: 'call-extra-election', actor: 'Coalition', card: 'pc', region: 'Berlin' })
      .ok,
  );
  const snapshot = structuredClone(session.state);
  session = GameSession.import(session.export());
  assert.deepEqual(session.state, snapshot);
  session.undo();
  assert.equal(session.state.pc.Berlin.available, true);
  assert.equal(session.state.extraElectionUsed, undefined);
  session.redo();
  assert.deepEqual(session.state, snapshot);
});
