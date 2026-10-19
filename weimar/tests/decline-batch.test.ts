import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatch, FACTIONS, GameSession, legalActions } from '../src/engine/index.ts';
import type { Command, Faction, GameState, PieceKind } from '../src/engine/types.ts';
import { SPACES, SPACE } from '../src/data/board.ts';
import { HOLDINGS } from '../src/data/holdings.ts';
import { inEffect, isUnit, mcs, onMap, piecesAt, supremacy, zeros } from '../src/engine/rules.ts';

function send(s: GameState, c: Command) {
  const result = dispatch(s, c);
  assert.ok(result.ok, result.ok ? '' : result.error);
  return result.state;
}
function ready(n: number, actor: Faction = 'Coalition', prerequisites = true) {
  let s = createGame({ testCard: n, testPrerequisites: prerequisites });
  const card = s.hands.Coalition.find((c) => c.card === n)!;
  s.hands.Coalition = s.hands.Coalition.filter((c) => c !== card);
  s.hands[actor].unshift(card);
  s = send(s, {
    type: 'set-order',
    actor: 'Coalition',
    order: [actor, ...FACTIONS.filter((f) => f !== actor)],
  });
  s.article48 = false;
  return s;
}
const begin = (s: GameState, n: number) =>
  send(s, { type: 'begin-turn', actor: s.order[0], mode: 'event-first', cardUid: `card-${n}` });
const choose = (s: GameState, option: string) =>
  send(s, { type: 'choose', actor: s.pending!.actor, option });
const branch = (s: GameState, index: number) =>
  choose(s, s.pending!.options.find((o) => o.id.endsWith(`:${index}`))!.id);
function drain(s: GameState, pick?: (s: GameState) => string | undefined) {
  let decisions = 0;
  while (s.pending) {
    assert.ok(++decisions < 300);
    s = choose(s, pick?.(s) ?? s.pending.options[0].id);
  }
  assert.equal(s.flow, undefined);
  assert.equal(s.grantContext, undefined);
  return s;
}
const skip = (s: GameState) => s.pending!.options.find((o) => o.id === 'stop')?.id;
function move(s: GameState, kind: PieceKind, owner: Faction | null, location: string) {
  const p = s.pieces.find(
    (p) => p.kind === kind && p.owner === owner && !onMap(p) && !p.location.startsWith('mat:'),
  )!;
  assert.ok(p, `${kind} fixture`);
  p.location = location;
  return p.id;
}
function clearUnits(s: GameState) {
  for (const p of s.pieces.filter(isUnit)) p.location = `reserve:${p.owner}`;
}
function clearInfluence(s: GameState) {
  for (const p of SPACES) s.influence[p.id] = zeros();
}
const total = (s: GameState, f: Faction) => SPACES.reduce((n, p) => n + s.influence[p.id][f], 0);
const actionChoice = (s: GameState, text = '放置影响力') =>
  s.pending!.options.find((o) => o.label.includes(text))!.id;

import { applyAction } from '../src/engine/actions.ts';
import { finishElection, previewElection } from '../src/engine/elections.ts';
import { eventEffects, resolveEffects } from '../src/engine/events.ts';
import { seatsUsesRemaining } from '../src/engine/policies.ts';
import { randomInt } from '../src/engine/random.ts';

function activate(s: GameState, n: number) {
  if (inEffect(s, n)) return;
  for (const f of FACTIONS) s.hands[f] = s.hands[f].filter((c) => c.card !== n);
  s.deck = s.deck.filter((c) => c.card !== n);
  s.discard = s.discard.filter((c) => c.card !== n);
  s.lingering.push({ uid: `active-${n}`, card: n });
}
function clearScoring(s: GameState) {
  clearInfluence(s);
  for (const p of s.pieces) if (onMap(p) && !isUnit(p)) p.location = 'removed';
}

test('#113 snapshots full RC-dominated spaces, replaces once in each, then cancels #119', () => {
  let s = ready(113);
  clearInfluence(s);
  s.influence.Pommern = { ...zeros(), RC: 3, Coalition: 1 };
  s.influence.Ostpreussen = { ...zeros(), RC: 3, KPD: 2 };
  s.influence.Berlin = { ...zeros(), RC: 3, Coalition: 3 }; // full but tied
  s.influence.Brandenburg.RC = 1; // dominated but not full
  s = begin(s, 113);
  assert.ok(s.pending!.options.every((o) => /^(Pommern|Ostpreussen)\|/.test(o.id)));
  s = choose(s, 'Pommern|Coalition|1');
  assert.ok(s.pending!.options.every((o) => o.id.startsWith('Ostpreussen|')));
  s = drain(s);
  assert.equal(total(s, 'NSDAP'), 2);
  assert.equal(inEffect(s, 119), false);
  assert.equal(inEffect(s, 113), true);
  assert.equal(s.article48Removed, true);
});

test('#114 unions RC dominance and parliamentary control without double counting', () => {
  let s = ready(114);
  clearInfluence(s);
  for (const r of Object.values(s.pc)) r.owner = null;
  s.pc.Berlin.owner = 'RC';
  s.influence.Berlin.RC = 1;
  s.influence.Muenchen.RC = 1;
  s = begin(s, 114);
  assert.equal(s.pending!.actor, 'NSDAP');
  assert.match(s.pending!.prompt, /剩余 2/);
  s = choose(s, 'stop');
  assert.equal(inEffect(s, 113), false);
});

test('#115 both branches respect Prussian scope and refresh the transferred control card', () => {
  let remove = branch(begin(ready(115), 115), 0);
  assert.ok(
    remove.pending!.options.every(
      (o) => o.id === 'stop' || SPACE[o.id.split('|')[0]].region === 'Preussen',
    ),
  );
  remove = choose(remove, 'stop');
  let transfer = ready(115);
  transfer.pc.Preussen = { owner: 'Coalition', available: false };
  transfer = branch(begin(transfer, 115), 1);
  assert.deepEqual(transfer.pc.Preussen, { owner: 'RC', available: true });
});

test('#116 removes reach requirements only while NSDAP has momentum; population still applies', () => {
  let s = ready(116, 'NSDAP');
  clearInfluence(s);
  s = drain(begin(s, 116));
  s.momentum = 'NSDAP';
  const place = { kind: 'place-influence' as const, space: 'Ostpreussen', count: 1 };
  assert.ok(
    legalActions(s).some(
      (c) => c.action.kind === 'place-influence' && c.action.space === 'Ostpreussen',
    ),
  );
  applyAction(s, 'NSDAP', place);
  s.influence.Pommern.Coalition = 1;
  applyAction(s, 'NSDAP', {
    kind: 'remove-influence',
    space: 'Pommern',
    targets: { Coalition: 1 },
  });
  s.momentum = 'Coalition';
  assert.throws(() => applyAction(s, 'NSDAP', { ...place, space: 'Schleswig-Holstein' }), /范围/);
  s.momentum = 'NSDAP';
  s.influence.Oldenburg = { ...zeros(), Coalition: SPACE.Oldenburg.population };
  assert.throws(() => applyAction(s, 'NSDAP', { ...place, space: 'Oldenburg' }), /人口/);
});

test('#117 grants actions for right-wing non-cities only, then conducts a full snap election', () => {
  let s = ready(117);
  clearScoring(s);
  for (const p of SPACES) s.influence[p.id].Coalition = 1;
  s.influence.Bayern = { ...zeros(), RC: 1 };
  s.influence.Berlin = { ...zeros(), NSDAP: 1 };
  s.influence.Pommern = { ...zeros(), NSDAP: 1 };
  s.pcLocked = ['Berlin'];
  s.pc.Berlin = { owner: null, available: false };
  s.electionCalled = true;
  s.electionCard = { uid: 'scheduled-154', card: 154 };
  const scheduled = structuredClone(s.electionCard),
    year = s.year,
    half = s.half;
  s = begin(s, 117);
  assert.equal(s.momentum, 'NSDAP');
  assert.match(s.pending!.prompt, /剩余 2/);
  s = choose(s, 'stop');
  assert.match(s.pending!.prompt, /提前选举/);
  s = drain(choose(s, 'no-transfer'));
  assert.equal(s.phase, 'action');
  assert.equal(s.turn.actionsLeft, 2);
  assert.equal(s.order[s.activeIndex], 'Coalition');
  assert.deepEqual([s.year, s.half], [year, half]);
  assert.equal(s.pc.Berlin.owner, 'NSDAP');
  assert.deepEqual(s.pcLocked, []);
  assert.ok(s.lastElection);
  assert.deepEqual(s.electionCard, scheduled);
  assert.equal(s.electionCalled, true);
  assert.equal(inEffect(s, 117), true);
});

test('#117 can end the game immediately with an NSDAP election victory', () => {
  let s = ready(117);
  clearScoring(s);
  for (const p of SPACES) s.influence[p.id].NSDAP = 1;
  s = begin(s, 117);
  s = choose(s, 'stop');
  s = choose(s, 'no-transfer');
  assert.equal(s.phase, 'finished');
  assert.equal(s.winner, 'NSDAP');
  assert.equal(s.flow, undefined);
  assert.equal(inEffect(s, 117), true);
});

for (const requirement of ['all', 'momentum', 'seats', 'pv'])
  test(`#118 instant win requires every condition: ${requirement}`, () => {
    let s = ready(118);
    clearScoring(s);
    s.influence.Berlin.NSDAP = 1;
    s.influence.Hamburg.NSDAP = 1;
    move(s, 'mcs', null, 'mat:NSDAP');
    s.momentum = requirement === 'momentum' ? 'RC' : 'NSDAP';
    s.seats = { owner: requirement === 'seats' ? 'RC' : 'NSDAP', available: false };
    if (requirement === 'pv') s.influence.Hamburg.NSDAP = 0;
    const parliament = structuredClone(s.pc),
      rng = s.rng;
    s = drain(begin(s, 118));
    assert.equal(s.winner, requirement === 'all' ? 'NSDAP' : undefined);
    assert.deepEqual(s.pc, parliament);
    assert.equal(s.rng, rng);
    assert.equal(s.lastElection, undefined);
  });

test('#119 is mandatory, changes economy/unity, and Article48 stays removed after cancellation and elections', () => {
  let s = ready(119);
  s.article48 = true;
  s.tracks.unity = 2;
  s = begin(s, 119);
  assert.equal(s.pending, null);
  assert.equal(s.tracks.economy, 6);
  assert.equal(s.tracks.unity, 0);
  assert.equal(s.article48Removed, true);
  assert.equal(s.article48, false);
  s.effects.push(...eventEffects(s, { uid: 'later-113', card: 113 }, 'Coalition'));
  resolveEffects(s);
  s = drain(s);
  assert.equal(inEffect(s, 119), false);
  clearScoring(s);
  for (const p of SPACES) s.influence[p.id].Coalition = 1;
  finishElection(s, undefined, true);
  resolveEffects(s);
  s = drain(s);
  assert.equal(s.article48, false);
  assert.equal(s.article48Removed, true);
});

test('#120 places yellow leverage and coalition influence in the same chosen eastern space', () => {
  let s = ready(120);
  s.tracks.us = 2;
  const before = s.influence.Pommern.Coalition;
  s = drain(branch(begin(s, 120), 4));
  assert.equal(s.influence.Pommern.Coalition, before + 1);
  assert.ok(piecesAt(s, 'Pommern', 'leverage').some((p) => p.owner === 'Coalition'));
});

for (const momentum of ['NSDAP', 'RC'] as Faction[])
  test(`#121 English original removes ${momentum === 'NSDAP' ? 2 : 3} distinct spaces`, () => {
    let s = ready(121);
    clearInfluence(s);
    s.momentum = momentum;
    for (const p of SPACES.slice(0, 5)) s.influence[p.id].NSDAP = 1;
    s = begin(s, 121);
    const number = momentum === 'NSDAP' ? 2 : 3;
    for (let i = 0; i < number; i++) {
      assert.ok(s.pending!.options.every((o) => !s.turn.removed.includes(o.id.split('|')[0])));
      s = choose(s, s.pending!.options[0].id);
    }
    assert.equal(s.turn.removed.length, number);
    assert.ok(
      s.pending!.options.every((o) => o.id === 'stop' || s.influence[o.id.split('|')[0]].NSDAP > 0),
    );
    s = choose(s, 'stop');
    assert.equal(total(s, 'NSDAP'), 5 - number);
    assert.equal(inEffect(s, 56), false);
  });

for (const highPv of [false, true])
  test(`#122 current PV selects card recipient; no extra discard step (${highPv})`, () => {
    let s = ready(122);
    clearScoring(s);
    if (highPv) for (const p of SPACES.slice(0, 10)) s.influence[p.id].NSDAP = 1;
    const recipient: Faction = highPv ? 'NSDAP' : 'RC';
    const donor: Faction = highPv ? 'RC' : 'NSDAP';
    s.momentum = recipient;
    const sizes = [s.hands[recipient].length, s.hands[donor].length];
    const pc = structuredClone(s.pc),
      seats = structuredClone(s.seats);
    s = begin(s, 122);
    assert.equal(s.pending!.actor, recipient);
    s = branch(s, 0);
    assert.equal(s.pending, null);
    assert.equal(s.hands[recipient].length, sizes[0] + 1);
    assert.equal(s.hands[donor].length, sizes[1] - 1);
    assert.deepEqual(s.pc, pc);
    assert.deepEqual(s.seats, seats);
  });

test('#123 respects upper economy boundary', () => {
  let s = ready(123);
  s.tracks.economy = 9;
  s = begin(s, 123);
  assert.equal(s.tracks.economy, 9);
});

test('#124 right-wing seats can be used twice, refresh resets uses, no third use', () => {
  let s = ready(124, 'RC');
  s.seats = { owner: 'RC', available: true };
  s = drain(begin(s, 124));
  assert.equal(seatsUsesRemaining(s), 2);
  s = drain(send(s, { type: 'play-seats', actor: 'RC' }));
  assert.equal(s.seats.uses, 1);
  assert.equal(seatsUsesRemaining(s), 1);
  s = drain(send(s, { type: 'play-seats', actor: 'RC' }));
  assert.equal(s.seats.available, false);
  assert.equal(seatsUsesRemaining(s), 0);
  assert.equal(dispatch(s, { type: 'play-seats', actor: 'RC' }).ok, false);
  clearScoring(s);
  for (const p of SPACES) s.influence[p.id].Coalition = 1;
  finishElection(s, undefined, true);
  resolveEffects(s);
  s = drain(s);
  assert.equal(s.seats.uses, undefined);
  assert.equal(s.seats.available, true);
});

for (const actor of ['RC', 'NSDAP', 'KPD'] as Faction[])
  test(`#124 Article48 restriction depends on event player ${actor}`, () => {
    let s = ready(143, actor);
    activate(s, 124);
    s.article48 = true;
    s = begin(s, 143);
    assert.equal(s.pending?.options.some((o) => o.id === 'article48') ?? false, actor === 'KPD');
  });

test('#125 uses RC mat count and only replaces map yellow leverage with available black leverage', () => {
  let s = ready(125);
  move(s, 'leverage', 'Coalition', 'Berlin');
  move(s, 'leverage', 'Coalition', 'Pommern');
  s.tracks.ussr = 3;
  const yellowBefore = s.pieces.filter(
    (p) => p.kind === 'leverage' && p.owner === 'Coalition' && onMap(p),
  ).length;
  const blackBefore = s.pieces.filter(
    (p) => p.kind === 'leverage' && p.owner === 'RC' && onMap(p),
  ).length;
  assert.ok(yellowBefore >= 2);
  s = drain(begin(s, 125));
  assert.equal(
    s.pieces.filter((p) => p.kind === 'leverage' && p.owner === 'Coalition' && onMap(p)).length,
    yellowBefore - 2,
  );
  assert.equal(
    s.pieces.filter((p) => p.kind === 'leverage' && p.owner === 'RC' && onMap(p)).length,
    blackBefore + 2,
  );
});

for (const card of [126, 136])
  test(`#${card} uses momentum faction MCS and correct regions, including own influence`, () => {
    let s = ready(card);
    s.momentum = 'RC';
    const eligible = card === 126 ? ['NorthernStates', 'Preussen'] : ['SouthernStates', 'Bayern'];
    const before = SPACES.reduce(
      (n, p) => n + Object.values(s.influence[p.id]).reduce((a, b) => a + b, 0),
      0,
    );
    s = begin(s, card);
    assert.equal(s.pending!.actor, 'RC');
    assert.match(s.pending!.prompt, /剩余 2/);
    assert.ok(
      s.pending!.options.every(
        (o) => o.id === 'stop' || eligible.includes(SPACE[o.id.split('|')[0]].region),
      ),
    );
    s = drain(s);
    const after = SPACES.reduce(
      (n, p) => n + Object.values(s.influence[p.id]).reduce((a, b) => a + b, 0),
      0,
    );
    assert.equal(before - after, 2);
  });

test('#127 transfers only KPD seats, refreshes them, and removes KPD from distinct spaces', () => {
  let s = ready(127);
  s.seats = { owner: 'KPD', available: false, uses: 2 };
  const before = total(s, 'KPD');
  s = begin(s, 127);
  assert.deepEqual(s.seats, { owner: 'NSDAP', available: true });
  assert.equal(s.momentum, 'NSDAP');
  s = drain(s);
  assert.equal(total(s, 'KPD'), before - 3);
  assert.equal(new Set(s.turn.removed).size, 3);
});

test('#128 cannot cross the rightmost dollar-dependence marker during Decline', () => {
  for (const economy of [8, 9]) {
    let s = ready(128);
    s.tracks.dollarDependence = 3;
    s.tracks.economy = economy;
    s = begin(s, 128);
    assert.equal(s.tracks.economy, 8);
  }
});

test('#129 unions cadre and supremacy spaces, deduplicates, and does not grow scope during deployment', () => {
  let s = ready(129);
  clearUnits(s);
  for (const p of s.pieces.filter((p) => p.kind === 'cadre' && onMap(p))) p.location = 'removed';
  move(s, 'cadre', 'NSDAP', 'Bayern');
  move(s, 'sa', 'NSDAP', 'Bayern');
  move(s, 'sa', 'NSDAP', 'Hamburg');
  move(s, 'sa', 'NSDAP', 'Berlin');
  move(s, 'militia', 'KPD', 'Berlin'); // tie excluded
  s = begin(s, 129);
  assert.match(s.pending!.prompt, /剩余 2/);
  s = drain(s);
  assert.equal(piecesAt(s, 'Bayern', 'sa').length, 2);
  assert.equal(piecesAt(s, 'Hamburg', 'sa').length, 2);
  assert.equal(piecesAt(s, 'Berlin', 'sa').length, 1);
});

test('#130 removes exactly one eligible opposing unit type', () => {
  let s = ready(130);
  const before = s.pieces.filter((p) => isUnit(p) && onMap(p)).length;
  s = begin(s, 130);
  for (const o of s.pending!.options) {
    const p = s.pieces.find((p) => p.id === o.id)!;
    assert.ok(
      (p.kind === 'sa' && p.owner === 'NSDAP') ||
        (p.kind === 'militia' && p.owner === 'KPD') ||
        (p.kind === 'freikorps' && p.owner === 'RC'),
    );
  }
  s = drain(s);
  assert.equal(s.pieces.filter((p) => isUnit(p) && onMap(p)).length, before - 1);
});

test('#131 same-space placement cannot split its two cubes across spaces', () => {
  let s = ready(131);
  s.momentum = 'KPD';
  s = branch(begin(s, 131), 0);
  const first = s.pending!.options.find(
    (o) => o.id.endsWith('|1') && o.id.startsWith('Ostpreussen'),
  )!.id;
  s = choose(s, first);
  assert.ok(s.pending!.options.every((o) => o.id === 'stop' || o.id.startsWith('Ostpreussen|')));
  s = drain(s);
  assert.equal(s.influence.Ostpreussen.KPD, 2);
});

test('#132 threshold gates two distinct non-city direct placements', () => {
  let s = ready(132);
  clearScoring(s);
  for (const p of SPACES.slice(0, 10)) s.influence[p.id].NSDAP = 1;
  assert.ok(previewElection(s).totals.NSDAP >= 10);
  const before = total(s, 'NSDAP');
  s = begin(s, 132);
  assert.ok(
    s.pending!.options.every((o) => o.id === 'stop' || SPACE[o.id.split('|')[0]].kind !== 'City'),
  );
  s = drain(s);
  assert.equal(total(s, 'NSDAP'), before + 2);
  assert.equal(new Set(s.turn.placed).size, 2);
});

test('#133 can relocate a map Reichswehr and excludes unavailable holding units', () => {
  let s = ready(133);
  s.tracks.ussr = 1;
  const mapUnit = move(s, 'reichswehr', 'Coalition', 'Hamburg');
  const unavailable = s.pieces.find(
    (p) => p.kind === 'reichswehr' && p.location === '@ussr-army:5',
  )!;
  s = begin(s, 133);
  assert.ok(s.pending!.options.some((o) => o.id.startsWith(mapUnit + '|')));
  assert.ok(!s.pending!.options.some((o) => o.id.startsWith(unavailable.id + '|')));
  s = choose(s, `${mapUnit}|Ostpreussen`);
  assert.equal(s.pieces.find((p) => p.id === mapUnit)!.location, 'Ostpreussen');
  assert.equal(s.pieces.filter((p) => p.kind === 'reichswehr' && onMap(p)).length, 1);
});

for (const low of [true, false])
  test(`#134 die branch ${low ? 'action' : 'return'} is mandatory and belongs to active faction`, () => {
    let s = ready(134, 'RC');
    let rng = 1;
    while (randomInt({ rng }, 6) + 1 <= 3 !== low) rng++;
    s.rng = rng;
    s = begin(s, 134);
    assert.equal(s.pending!.actor, 'RC');
    assert.ok(!s.pending!.options.some((o) => o.id === 'stop'));
    assert.match(s.pending!.prompt, low ? /事件授予行动/ : /归还/);
    s = drain(s);
  });

test('#135 sequential placement retains 6.0 limit; can place RC if there was no NSDAP to remove', () => {
  for (const present of [false, true]) {
    let s = ready(135);
    clearInfluence(s);
    s.momentum = 'RC';
    s.influence.Bayern.NSDAP = Number(present);
    s = drain(begin(s, 135));
    assert.equal(s.influence.Bayern.NSDAP, 0);
    assert.equal(s.influence.Bayern.RC, present ? 0 : 1);
  }
});

test('#137 compensates actual removal spaces once each, not once per removed unit', () => {
  let s = ready(137);
  clearUnits(s);
  clearInfluence(s);
  s.stance.NSDAP = -3;
  const ids = [
    move(s, 'sa', 'NSDAP', 'Bayern'),
    move(s, 'sa', 'NSDAP', 'Bayern'),
    move(s, 'sa', 'NSDAP', 'Hamburg'),
  ];
  s = begin(s, 137);
  for (const id of ids) s = choose(s, id);
  // No SA remain: the optional fourth removal ends automatically.
  let spaces = 0;
  s = drain(s, (state) => {
    assert.equal(state.pending!.actor, 'NSDAP');
    if (state.pending!.prompt.includes('选择补偿')) {
      spaces++;
      return state.pending!.options.find((o) => o.id.endsWith(':0'))!.id;
    }
    assert.ok(
      state.pending!.options.every((o) => o.id === 'stop' || /^(Bayern|Hamburg)\|/.test(o.id)),
    );
    return state.pending!.options.find((o) => o.id.endsWith('|2'))?.id;
  });
  assert.equal(spaces, 2);
  assert.equal(total(s, 'NSDAP'), 4);
});

test('#137 choosing zero removals produces no compensation', () => {
  let s = ready(137);
  const before = structuredClone(s.influence);
  s = choose(begin(s, 137), 'stop');
  assert.equal(s.pending, null);
  assert.deepEqual(s.influence, before);
});

test('#138 removal and optional stance have different decision owners, and stance shifts just one', () => {
  let s = ready(138);
  activate(s, 59);
  s.stance.KPD = 0;
  s = branch(begin(s, 138), 2);
  while (s.pending && s.pending.actor !== 'KPD') s = choose(s, s.pending.options[0].id);
  assert.equal(s.pending!.actor, 'KPD');
  s = branch(s, 1);
  assert.equal(s.stance.KPD, 1);
});

for (const occupied of [false, true])
  test(`#139 respects single cadre per space and grants exact mandatory actions (${occupied})`, () => {
    let s = ready(139);
    s.stance.NSDAP = -3;
    if (occupied) move(s, 'cadre', 'KPD', 'Baden');
    const existing = s.pieces.filter(
      (p) => p.kind === 'cadre' && p.owner === 'NSDAP' && onMap(p),
    ).length;
    let actions = 0;
    s = drain(begin(s, 139), (state) => {
      if (state.pending!.prompt.includes('事件授予行动')) {
        assert.equal(state.pending!.actor, 'NSDAP');
        assert.ok(!state.pending!.options.some((o) => o.id === 'stop'));
        actions++;
      }
    });
    assert.equal(actions, existing + (occupied ? 0 : 1));
    assert.equal(piecesAt(s, 'Baden', 'cadre').length, 1);
  });

test('#140 only removes Berlin SA', () => {
  let s = ready(140);
  move(s, 'sa', 'NSDAP', 'Berlin');
  move(s, 'sa', 'NSDAP', 'Berlin');
  const elsewhere = piecesAt(s, 'Muenchen', 'sa').length;
  s = drain(begin(s, 140));
  assert.equal(piecesAt(s, 'Berlin', 'sa').length, 0);
  assert.equal(piecesAt(s, 'Muenchen', 'sa').length, elsewhere);
});

test('#141 permits two successive replacements in one RC-presence space', () => {
  let s = ready(141);
  clearInfluence(s);
  s.influence.Bayern = { ...zeros(), RC: 1, NSDAP: 2 };
  s.influence.Hamburg.NSDAP = 1;
  s = begin(s, 141);
  assert.ok(s.pending!.options.every((o) => o.id === 'stop' || o.id.startsWith('Bayern|')));
  s = choose(s, 'Bayern|NSDAP|1');
  s = choose(s, 'Bayern|NSDAP|1');
  assert.equal(s.influence.Bayern.RC, 3);
  assert.equal(s.influence.Bayern.NSDAP, 0);
});

test('#142 NSDAP can remove its own Berlin influence as a direct event', () => {
  let s = ready(142);
  s.influence.Berlin.NSDAP = 1;
  s.influence.Berlin.Coalition--;
  s = branch(begin(s, 142), 1);
  assert.equal(s.pending!.actor, 'NSDAP');
  s = choose(s, 'Berlin|NSDAP|1');
  assert.equal(s.influence.Berlin.NSDAP, 0);
});

test('#144 only rolls with coalition momentum, deterministically maps the die to a faction', () => {
  for (const momentum of ['Coalition', 'KPD'] as Faction[]) {
    let s = ready(144);
    s.momentum = momentum;
    const rng = { rng: s.rng },
      before = s.rng;
    const die = randomInt(rng, 6) + 1;
    s = begin(s, 144);
    assert.equal(s.rng, momentum === 'Coalition' ? rng.rng : before);
    assert.equal(
      s.momentum,
      momentum === 'Coalition' ? (die <= 2 ? 'KPD' : die <= 4 ? 'NSDAP' : 'RC') : 'KPD',
    );
  }
});

test('#145 shifts one revolutionary stance step then offers NSDAP an action', () => {
  let s = ready(145);
  activate(s, 19);
  s.stance.NSDAP = 0;
  s = begin(s, 145);
  assert.equal(s.stance.NSDAP, 1);
  assert.equal(s.pending!.actor, 'NSDAP');
  s = choose(s, 'stop');
  assert.equal(s.turn.actionsLeft, 2);
});

test('#146 compares both PV totals before changing momentum and preserves ties', () => {
  for (const leader of ['NSDAP', 'RC', 'tie']) {
    let s = ready(146);
    clearScoring(s);
    s.momentum = 'Coalition';
    for (const p of s.pieces.filter((p) => p.kind === 'mcs' && p.location.startsWith('mat:')))
      p.location = 'removed';
    if (leader !== 'tie') s.influence.Berlin[leader as Faction] = 1;
    const before = structuredClone(s.pc),
      rng = s.rng;
    s = begin(s, 146);
    assert.equal(s.momentum, leader === 'tie' ? 'Coalition' : leader);
    assert.deepEqual(s.pc, before);
    assert.equal(s.rng, rng);
  }
});

test('#147 grants military action first, then checks SA in Schleswig-Holstein', () => {
  let s = ready(147);
  s.stance.NSDAP = -3;
  move(s, 'cadre', 'NSDAP', 'Schleswig-Holstein');
  s = begin(s, 147);
  s = choose(
    s,
    s.pending!.options.find((o) => o.label.includes('部署部队') && o.label.includes('石勒苏益格'))!
      .id,
  );
  assert.ok(piecesAt(s, 'Schleswig-Holstein', 'sa').length > 0);
  assert.equal(s.pending!.actor, 'NSDAP');
  assert.ok(s.pending!.options.some((o) => o.label.includes('移动中产支持')));
  s = drain(s, skip);
  assert.equal(s.turn.actionsLeft, 2);
});

for (const card of [117, 125, 137])
  test(`#${card} pending choices survive import, undo, and redo`, () => {
    const game = new GameSession({ testCard: card, testPrerequisites: true });
    const command = (c: Command) => {
      const r = game.send(c);
      assert.ok(r.ok, r.ok ? '' : r.error);
    };
    command({ type: 'set-order', actor: 'Coalition', order: [...FACTIONS] });
    command({
      type: 'begin-turn',
      actor: 'Coalition',
      mode: 'event-first',
      cardUid: `card-${card}`,
    });
    let count = 0;
    while (game.state.pending) {
      assert.ok(++count < 200);
      const before = structuredClone(game.state);
      assert.deepEqual(GameSession.import(game.export()).state, before);
      const p = game.state.pending;
      command({
        type: 'choose',
        actor: p.actor,
        option: p.options.find((o) => o.id === 'allow')?.id ?? p.options[0].id,
      });
      const after = structuredClone(game.state);
      game.undo();
      assert.deepEqual(game.state, before);
      game.redo();
      assert.deepEqual(game.state, after);
    }
    assert.equal(game.state.flow, undefined);
    assert.equal(game.state.grantContext, undefined);
  });
