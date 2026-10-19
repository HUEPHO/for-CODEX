import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GameSession,
  createGame,
  dispatch,
  legalActions,
  previewElection,
  FACTIONS,
} from '../src/engine/index.ts';
import type { GameState, Command, Faction } from '../src/engine/types.ts';
import { SPACES, SPACE, distance } from '../src/data/board.ts';
import { CARD, CARDS } from '../src/data/cards.ts';
import {
  assertInvariants,
  available,
  dominance,
  piecesAt,
  supremacy,
  active,
} from '../src/engine/rules.ts';
import { finishElection } from '../src/engine/elections.ts';
import { eventEffects, resolveEffects } from '../src/engine/events.ts';

function send(s: GameState, c: Command) {
  const r = dispatch(s, c);
  assert.equal(r.ok, true, r.ok ? '' : r.error);
  return r.state;
}
function ready(f: Faction = 'Coalition', options = { demo: true, seed: 1921 }) {
  let s = createGame(options);
  return send(s, {
    type: 'set-order',
    actor: 'Coalition',
    order: [f, ...FACTIONS.filter((x) => x !== f)],
  });
}
function single(f: Faction = 'Coalition') {
  let s = ready(f);
  return send(s, { type: 'begin-turn', actor: f, mode: 'single' });
}
function resolve(s: GameState, pick?: string) {
  let count = 0;
  while (s.pending) {
    assert.ok(++count < 100);
    const option = s.pending.options.find((o) => o.id === pick) ?? s.pending.options[0];
    s = send(s, { type: 'choose', actor: s.pending.actor, option: option.id });
  }
  return s;
}
function activate(s: GameState, n: number) {
  s.deck = s.deck.filter((c) => c.card !== n);
  s.discard = s.discard.filter((c) => c.card !== n);
  for (const f of FACTIONS) s.hands[f] = s.hands[f].filter((c) => c.card !== n);
  s.lingering.push({ uid: `card-${n}`, card: n });
}
test('data: 26 spaces, reciprocal graph, city edges, 154 card faces', () => {
  assert.equal(SPACES.length, 26);
  assert.equal(CARDS.length, 154);
  for (const sp of SPACES) {
    assert.ok(Number.isInteger(sp.population));
    for (const to of sp.adjacent) assert.ok(SPACE[to]?.adjacent.includes(sp.id));
    assert.notEqual(distance('Berlin', sp.id), Infinity);
  }
  assert.deepEqual(SPACE.Berlin.adjacent.sort(), ['Brandenburg', 'Provinz Sachsen']);
  assert.equal(distance('Berlin', 'Bayern'), 3);
  assert.equal(CARD[4].mandatory, true);
  assert.equal(CARD[152].election, true);
});
test('tutorial setup reproduces source totals and piece availability', () => {
  const s = createGame({ demo: false });
  assertInvariants(s);
  assert.equal(
    SPACES.reduce((n, p) => n + Object.values(s.influence[p.id]).reduce((a, b) => a + b, 0), 0),
    72,
  );
  assert.deepEqual(s.tracks, {
    economy: 3,
    progress: 2,
    reaction: 3,
    us: 1,
    ussr: 2,
    unity: 1,
    dollarDependence: 0,
  });
  assert.equal(s.pieces.filter((p) => p.kind === 'mcs').length, 7);
  assert.equal(s.deck.length, 33);
  assert.equal(
    FACTIONS.reduce((n, f) => n + s.hands[f].length, 0),
    20,
  );
  assert.equal(piecesAt(s, 'Bayern', 'leverage').length, 2);
  assert.equal(piecesAt(s, 'mat:RC', 'mcs').length, 2);
  assert.equal(available(s, piecesAt(s, '@us:2')[0], 'Coalition'), false);
  assert.equal(available(s, piecesAt(s, '@ussr-army:1')[0], 'Coalition'), true);
  assert.equal(supremacy(s, 'Berlin'), null);
  assert.equal(supremacy(s, 'Koeln'), 'Coalition');
  assert.equal(dominance(s, 'Berlin'), null);
});
test('official deck shuffles deterministically; mandatory and election are in first 28', () => {
  const a = createGame({ demo: false, seed: 23 }),
    b = createGame({ demo: false, seed: 23 }),
    c = createGame({ demo: false, seed: 24 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.hands, c.hands);
  const ordered = [...FACTIONS.flatMap((f) => a.hands[f]), ...a.deck];
  assert.equal(ordered.length, 53);
  assert.ok(ordered.findIndex((c) => c.card === 4) < 28);
  assert.ok(ordered.findIndex((c) => c.card === 152) < 28);
  assert.equal(new Set(ordered.map((c) => c.uid)).size, 53);
});
test('illegal commands are atomic, including RNG, logs, and hand contents', () => {
  const s = single(),
    before = structuredClone(s);
  for (const command of [
    { type: 'action', actor: 'KPD', action: { kind: 'gain-momentum' } },
    {
      type: 'action',
      actor: 'Coalition',
      action: { kind: 'place-influence', space: 'Berlin', count: 1 },
    },
    {
      type: 'action',
      actor: 'Coalition',
      action: { kind: 'place-influence', space: 'unknown', count: 1 },
    },
    {
      type: 'action',
      actor: 'Coalition',
      action: { kind: 'place-influence', space: 'Baden', count: NaN },
    },
    { type: 'action', actor: 'Coalition', action: { kind: 'not-implemented' } },
  ] as unknown as Command[]) {
    const r = dispatch(s, command);
    assert.equal(r.ok, false);
    assert.strictEqual(r.state, s);
    assert.deepEqual(s, before);
  }
});
test('single action budget, no premature end or second action', () => {
  let s = single();
  assert.equal(dispatch(s, { type: 'end-turn', actor: 'Coalition' }).ok, false);
  s = send(s, { type: 'action', actor: 'Coalition', action: { kind: 'gain-momentum' } });
  assert.equal(
    dispatch(s, { type: 'action', actor: 'Coalition', action: { kind: 'gain-momentum' } }).ok,
    false,
  );
  s = send(s, { type: 'end-turn', actor: 'Coalition' });
  assert.equal(active(s), 'KPD');
});
test('event-last requires both actions and promised card', () => {
  let s = ready();
  s = send(s, { type: 'begin-turn', actor: 'Coalition', mode: 'event-last', cardUid: 'card-17' });
  assert.equal(dispatch(s, { type: 'play-event', actor: 'Coalition' }).ok, false);
  s = send(s, { type: 'action', actor: 'Coalition', action: { kind: 'gain-momentum' } });
  assert.equal(dispatch(s, { type: 'play-pc', actor: 'Coalition', region: 'Berlin' }).ok, false);
  s = send(s, { type: 'action', actor: 'Coalition', action: { kind: 'gain-momentum' } });
  assert.equal(dispatch(s, { type: 'end-turn', actor: 'Coalition' }).ok, false);
  s = send(s, { type: 'play-event', actor: 'Coalition' });
  assert.equal(s.pending?.actor, 'Coalition');
  s = resolve(s, 'allow');
  assert.equal(s.tracks.ussr, 3);
  assert.ok(s.lingering.some((c) => c.card === 17));
  s = send(s, { type: 'end-turn', actor: 'Coalition' });
  assert.equal(active(s), 'KPD');
});
test('Article 48 cancels event text but preserves both actions; correct responder', () => {
  let s = ready('NSDAP');
  s = send(s, { type: 'begin-turn', actor: 'NSDAP', mode: 'event-first', cardUid: 'card-39' });
  const before = s.influence.Ostpreussen.NSDAP;
  assert.equal(s.pending?.actor, 'Coalition');
  assert.equal(dispatch(s, { type: 'choose', actor: 'NSDAP', option: 'article48' }).ok, false);
  s = send(s, { type: 'choose', actor: 'Coalition', option: 'article48' });
  s = resolve(s);
  assert.equal(s.influence.Ostpreussen.NSDAP, before);
  assert.equal(s.turn.actionsLeft, 2);
  assert.equal(s.article48, false);
  assert.equal(s.momentum, 'Coalition');
  assert.ok(s.discard.some((c) => c.card === 39));
});
test('mandatory card bypasses Article 48 and becomes lingering', () => {
  let s = ready();
  s = send(s, { type: 'begin-turn', actor: 'Coalition', mode: 'event-first', cardUid: 'card-4' });
  assert.equal(s.pending, null);
  assert.ok(s.lingering.some((c) => c.card === 4));
  assert.equal(s.article48, true);
});
test('mandatory or election cards cannot be discarded for pass exchange', () => {
  let s = ready();
  assert.equal(dispatch(s, { type: 'pass', actor: 'Coalition', discardUid: 'card-4' }).ok, false);
  s = ready('KPD');
  assert.equal(dispatch(s, { type: 'pass', actor: 'KPD', discardUid: 'card-152' }).ok, false);
  s = ready();
  s.deck = [];
  assert.equal(dispatch(s, { type: 'pass', actor: 'Coalition', discardUid: 'card-35' }).ok, false);
});
test('same turn forbids placing and removing influence in either order', () => {
  let s = ready('KPD');
  s.article48 = false;
  s = send(s, { type: 'begin-turn', actor: 'KPD', mode: 'event-last', cardUid: 'card-47' });
  s = send(s, {
    type: 'action',
    actor: 'KPD',
    action: { kind: 'place-influence', space: 'Sachsen', count: 1 },
  });
  const fake = s.influence.Sachsen.RC;
  s.influence.Sachsen.RC = 1;
  assert.equal(
    dispatch(s, {
      type: 'action',
      actor: 'KPD',
      action: { kind: 'remove-influence', space: 'Sachsen', targets: { RC: 1 } },
    }).ok,
    false,
  );
  s.influence.Sachsen.RC = fake;
  let r = ready('KPD');
  r = send(r, { type: 'begin-turn', actor: 'KPD', mode: 'event-last', cardUid: 'card-47' });
  r = send(r, {
    type: 'action',
    actor: 'KPD',
    action: { kind: 'remove-influence', space: 'Provinz Westfalen', targets: { Coalition: 1 } },
  });
  assert.equal(
    dispatch(r, {
      type: 'action',
      actor: 'KPD',
      action: { kind: 'place-influence', space: 'Provinz Westfalen', count: 1 },
    }).ok,
    false,
  );
});
test('population, assassination, military supremacy and reach constraints', () => {
  let s = single('KPD');
  assert.equal(
    dispatch(s, {
      type: 'action',
      actor: 'KPD',
      action: { kind: 'place-influence', space: 'Berlin', count: 1 },
    }).ok,
    false,
  );
  assert.equal(
    dispatch(s, {
      type: 'action',
      actor: 'KPD',
      action: { kind: 'place-influence', space: 'Ostpreussen', count: 1 },
    }).ok,
    false,
  );
  s.pieces.find((p) => p.kind === 'assassination')!.location = 'Provinz Westfalen';
  s.pieces.find((p) => p.kind === 'assassination')!.side = 'left';
  assert.equal(
    dispatch(s, {
      type: 'action',
      actor: 'KPD',
      action: { kind: 'place-influence', space: 'Provinz Westfalen', count: 1 },
    }).ok,
    false,
  );
  s = single('RC');
  assert.equal(
    dispatch(s, {
      type: 'action',
      actor: 'RC',
      action: { kind: 'remove-influence', space: 'Bayern', targets: { Coalition: 1 } },
    }).ok,
    false,
  );
});
test('economy determines influence count and Coalition prohibition', () => {
  let s = single('KPD');
  s.tracks.economy = 9;
  s = send(s, {
    type: 'action',
    actor: 'KPD',
    action: { kind: 'place-influence', space: 'Sachsen', count: 3 },
  });
  assert.equal(s.influence.Sachsen.KPD, 5);
  let c = single();
  c.tracks.economy = 4;
  c = send(c, {
    type: 'action',
    actor: 'Coalition',
    action: { kind: 'place-influence', space: 'Baden', count: 1 },
  });
  assert.equal(c.influence.Baden.Coalition, 3);
});
test('cadres share a one-per-space limit; tutorial stance tokens are available', () => {
  let s = single('KPD');
  const p = piecesAt(s, '@kpd-cadre:1')[0];
  assert.ok(available(s, p, 'KPD'));
  assert.equal(
    dispatch(s, {
      type: 'action',
      actor: 'KPD',
      action: { kind: 'place-cadre', pieceId: p.id, space: 'Berlin' },
    }).ok,
    false,
  );
  s = send(s, {
    type: 'action',
    actor: 'KPD',
    action: { kind: 'place-cadre', pieceId: p.id, space: 'Sachsen' },
  });
  assert.equal(piecesAt(s, 'Sachsen', 'cadre').length, 1);
});
test('Reform requires parliamentary control, availability, unity and clear space', () => {
  let s = single(),
    id = piecesAt(s, '@reform:2')[0].id;
  assert.equal(
    dispatch(s, {
      type: 'action',
      actor: 'Coalition',
      action: { kind: 'place-reform', pieceId: id, space: 'Bayern' },
    }).ok,
    false,
  );
  s = send(s, {
    type: 'action',
    actor: 'Coalition',
    action: { kind: 'place-reform', pieceId: id, space: 'Baden' },
  });
  assert.equal(piecesAt(s, 'Baden', 'reform').length, 1);
  let t = single();
  t.tracks.unity = 0;
  assert.equal(
    dispatch(t, {
      type: 'action',
      actor: 'Coalition',
      action: { kind: 'place-reform', pieceId: id, space: 'Baden' },
    }).ok,
    false,
  );
});
test('leverage availability, economy placement order, and track caps', () => {
  let s = single('RC'),
    id = piecesAt(s, '@rc-economic:4')[0].id;
  assert.equal(
    dispatch(s, {
      type: 'action',
      actor: 'RC',
      action: { kind: 'place-leverage', pieceId: id, to: '@economy:4' },
    }).ok,
    false,
  );
  s = send(s, {
    type: 'action',
    actor: 'RC',
    action: { kind: 'place-leverage', pieceId: id, to: '@economy:2' },
  });
  assert.equal(s.tracks.economy, 3);
  let c = single();
  const unavailable = piecesAt(c, '@us:2')[0];
  assert.equal(
    dispatch(c, {
      type: 'action',
      actor: 'Coalition',
      action: { kind: 'place-leverage', pieceId: unavailable.id, to: '@progress:4' },
    }).ok,
    false,
  );
  c = send(c, { type: 'action', actor: 'Coalition', action: { kind: 'advance-progress' } });
  assert.equal(c.tracks.progress, 3);
});
test('third Strike causes General Strike and clears leverage after return choices', () => {
  let s = single('KPD');
  const two = piecesAt(s, '@kpd-strike:2')[0],
    three = piecesAt(s, '@kpd-strike:3')[0];
  two.location = 'Thueringen';
  s.pc.Bayern.owner = 'KPD';
  const id = three.id;
  s = send(s, {
    type: 'action',
    actor: 'KPD',
    action: { kind: 'place-strike', pieceId: id, space: 'Bayern' },
  });
  s = resolve(s);
  assert.equal(s.generalStrike, true);
  assert.equal(piecesAt(s, 'Bayern', 'leverage').length, 0);
  assert.equal(piecesAt(s, '@reaction:3').length, 1);
  assertInvariants(s);
});
test('MCS movement never duplicates or manufactures pawns', () => {
  let s = single('NSDAP');
  const p = piecesAt(s, 'mat:RC', 'mcs')[0];
  s = send(s, {
    type: 'action',
    actor: 'NSDAP',
    action: { kind: 'move-mcs', pieceId: p.id, to: 'mat:NSDAP' },
  });
  assert.equal(piecesAt(s, 'mat:RC', 'mcs').length, 1);
  assert.equal(piecesAt(s, 'mat:NSDAP', 'mcs').length, 1);
  assertInvariants(s);
  let c = single('KPD');
  assert.equal(
    dispatch(c, {
      type: 'action',
      actor: 'KPD',
      action: { kind: 'move-mcs', pieceId: p.id, to: 'mat:KPD' },
    }).ok,
    false,
  );
});
test('Demagoguery changes Momentum only when NSDAP newly dominates a space', () => {
  let s = single('NSDAP');
  activate(s, 1);
  s = send(s, {
    type: 'action',
    actor: 'NSDAP',
    action: { kind: 'place-influence', space: 'Wuerttemberg', count: 1 },
  });
  assert.equal(s.momentum, 'Coalition'); // Tie at one each is not Dominance.
  let t = single('NSDAP');
  activate(t, 1);
  t.influence.Wuerttemberg.Coalition = 0;
  t.influence.Wuerttemberg.RC = 0;
  // Reach uses RC dominance, so choose Bayern (NSDAP has Presence) for a fixture.
  t.influence.Bayern = { Coalition: 0, KPD: 0, RC: 0, NSDAP: 1 };
  t.influence.Muenchen = { Coalition: 0, KPD: 0, RC: 0, NSDAP: 0 };
  t = send(t, {
    type: 'action',
    actor: 'NSDAP',
    action: { kind: 'place-influence', space: 'Muenchen', count: 1 },
  });
  assert.equal(t.momentum, 'NSDAP');
});
test('election: an uprising cancels whole region; Strike does not', () => {
  const s = createGame();
  const normal = previewElection(s);
  assert.equal(normal.regions.find((r) => r.region === 'SouthernStates')!.blocked, false);
  piecesAt(s, 'Sachsen', 'strike')[0].side = 'uprising';
  const result = previewElection(s),
    region = result.regions.find((r) => r.region === 'SouthernStates')!;
  assert.equal(region.blocked, true);
  assert.deepEqual(region.totals, { Coalition: 0, KPD: 0, NSDAP: 0, RC: 0 });
  assert.equal(region.winner, null);
  assert.ok(result.base.Coalition < normal.base.Coalition);
});
test('regional ties are uncontrolled; all factions retain their scored PV', () => {
  const s = createGame();
  s.influence.Berlin = { Coalition: 2, KPD: 1, NSDAP: 0, RC: 0 };
  const result = previewElection(s),
    berlin = result.regions.find((r) => r.region === 'Berlin')!;
  assert.equal(berlin.totals.Coalition, 6);
  assert.equal(berlin.totals.KPD, 2);
  assert.equal(berlin.winner, 'Coalition');
  assert.ok(result.base.KPD >= 2);
  const north = SPACES.filter((p) => p.region === 'NorthernStates');
  north.forEach(
    (sp, i) =>
      (s.influence[sp.id] = { Coalition: i < 2 ? 1 : 0, KPD: 0, NSDAP: 0, RC: i >= 2 ? 1 : 0 }),
  );
  const tied = previewElection(s).regions.find((r) => r.region === 'NorthernStates')!;
  assert.equal(tied.winner, null);
  assert.equal(tied.totals.Coalition, 2);
  assert.equal(tied.totals.RC, 2);
});
test('lingering PV modifiers replace bonuses, and Urbanization applies to cities', () => {
  const s = createGame(),
    base = previewElection(s);
  activate(s, 57);
  activate(s, 59);
  activate(s, 92);
  const now = previewElection(s);
  assert.equal(now.base.RC, base.base.RC + 6); // Two black Leverage in Bayern, +3 each.
  assert.equal(now.base.KPD, base.base.KPD + 2); // One KPD cadre.
  assert.equal(now.totals.Coalition - base.totals.Coalition, 2); // Hamburg, Köln.
  assert.equal(supremacy(s, 'Berlin'), 'RC'); // Hindenburg changes Rogue Freikorps SV.
});
test('transfer cap and RC stealing an NSDAP victory are implemented', () => {
  const s = createGame();
  s.momentum = 'RC';
  for (const sp of SPACES) s.influence[sp.id] = { Coalition: 0, KPD: 0, NSDAP: 0, RC: 1 };
  s.influence.Muenchen = { Coalition: 0, KPD: 0, NSDAP: 1, RC: 0 };
  const pre = previewElection(s);
  assert.throws(() =>
    finishElection(structuredClone(s), { to: 'NSDAP', amount: Math.floor(pre.totals.RC / 2) + 1 }),
  );
  const copy = structuredClone(s);
  finishElection(copy, { to: 'NSDAP', amount: Math.floor(pre.totals.RC / 2) });
  assert.ok(copy.lastElection);
  assert.equal(
    copy.lastElection!.totals.RC + copy.lastElection!.totals.NSDAP,
    pre.totals.RC + pre.totals.NSDAP,
  );
  assert.equal(copy.lastElection!.ranking[0], 'NSDAP');
  assert.equal(copy.winner, 'RC');
  assert.equal(copy.phase, 'finished');
});
test('cannot play two Election cards during the same round', () => {
  let s = ready('KPD');
  s.electionCalled = true;
  assert.equal(
    dispatch(s, { type: 'begin-turn', actor: 'KPD', mode: 'event-first', cardUid: 'card-152' }).ok,
    false,
  );
  s = ready('KPD');
  s = send(s, { type: 'begin-turn', actor: 'KPD', mode: 'event-first', cardUid: 'card-152' });
  assert.equal(s.pending, null);
  assert.equal(s.electionCalled, true);
  assert.equal(s.electionCard?.card, 152);
});
test('random discard protects mandatory cards, and draw on empty deck is harmless', () => {
  const s = createGame();
  s.hands.Coalition = [{ uid: 'card-4', card: 4 }];
  s.effects = [{ type: 'random-discard', faction: 'Coalition' }];
  resolveEffects(s);
  assert.equal(s.hands.Coalition[0].card, 4);
  s.deck = [];
  s.effects = [{ type: 'draw', faction: 'KPD' }];
  const count = s.hands.KPD.length;
  resolveEffects(s);
  assert.equal(s.hands.KPD.length, count);
});
test('implemented event choices are owned by active faction or specified faction', () => {
  let s = ready();
  s.article48 = false;
  s = send(s, { type: 'begin-turn', actor: 'Coalition', mode: 'event-first', cardUid: 'card-35' });
  assert.equal(s.pending?.actor, 'Coalition');
  const before = structuredClone(s.influence);
  s = resolve(s);
  const changed = Object.keys(s.influence).filter(
    (id) => s.influence[id].Coalition > before[id].Coalition,
  );
  assert.equal(changed.length, 2);
  for (const id of changed) assert.equal(s.influence[id].Coalition - before[id].Coalition, 1);
  // Official clarification: direct event placement ignores the economic prohibition.
});
test('an unknown event cannot be played as a blank two-action card', () => {
  const s = ready();
  s.hands.Coalition.push({ uid: 'card-999', card: 999 });
  const result = dispatch(s, {
    type: 'begin-turn',
    actor: 'Coalition',
    mode: 'event-first',
    cardUid: 'card-999',
  });
  assert.equal(result.ok, false);
});
test('legal-action enumeration is pure and every command it returns succeeds', () => {
  const s = single('RC'),
    before = structuredClone(s),
    actions = legalActions(s);
  assert.ok(actions.length > 5);
  assert.deepEqual(s, before);
  for (const { action } of actions)
    assert.ok(dispatch(s, { type: 'action', actor: 'RC', action }).ok);
});
test('save replay, undo and redo preserve exact state and random outcomes', () => {
  const session = new GameSession({ seed: 908, demo: true });
  for (const c of [
    { type: 'set-order', actor: 'Coalition', order: ['RC', 'Coalition', 'KPD', 'NSDAP'] },
    { type: 'begin-turn', actor: 'RC', mode: 'event-first', cardUid: 'card-44' },
    { type: 'choose', actor: 'Coalition', option: 'allow' },
  ] as Command[])
    assert.ok(session.send(c).ok);
  const state = structuredClone(session.state);
  session.undo();
  session.redo();
  assert.deepEqual(session.state, state);
  const roundTrip = GameSession.import(session.export());
  assert.deepEqual(roundTrip.state, state);
  assert.deepEqual(roundTrip.commands, session.commands);
  assert.throws(() => GameSession.import('{bad'));
  assert.throws(() => GameSession.import(JSON.stringify({ format: 'future' })));
  const tampered = JSON.parse(session.export());
  tampered.commands.push({ type: 'set-order', actor: 'RC', order: [] });
  assert.throws(() => GameSession.import(JSON.stringify(tampered)));
});
test('complete six-round tutorial by passing: timeline choices, annual order and terminal election', () => {
  let s = createGame();
  let steps = 0;
  while (s.phase !== 'finished') {
    assert.ok(++steps < 180, 'tutorial should terminate');
    if (s.pending) {
      s = send(s, { type: 'choose', actor: s.pending.actor, option: s.pending.options[0].id });
      continue;
    }
    if (s.phase === 'order') {
      s = send(s, { type: 'set-order', actor: s.momentum, order: [...FACTIONS] });
      continue;
    }
    if (s.phase === 'action') {
      s = send(
        s,
        s.turn.mode === 'unselected'
          ? { type: 'pass', actor: active(s) }
          : { type: 'end-turn', actor: active(s) },
      );
      continue;
    }
    const space = SPACES.find((p) => s.influence[p.id].Coalition > 0)?.id;
    s = send(s, { type: 'advance', actor: s.momentum, inflationSpace: space });
  }
  assert.ok(s.winner);
  assert.equal(s.year, 1923);
  assert.equal(s.half, 'late');
  assert.equal(s.winReason, '教程剧本终局选举');
});
