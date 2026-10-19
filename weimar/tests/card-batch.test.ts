import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession, FACTIONS, createGame, dispatch } from '../src/engine/index.ts';
import type { GameState, Command, Faction } from '../src/engine/types.ts';
import { CARD, CARDS } from '../src/data/cards.ts';
import { SPACES, SPACE } from '../src/data/board.ts';
import { resolveEffects } from '../src/engine/events.ts';
import {
  assertInvariants,
  available,
  piecesAt,
  onMap,
  influencePower,
  inEffect,
} from '../src/engine/rules.ts';
import { applyAction } from '../src/engine/actions.ts';
import { assaultStrength } from '../src/engine/combat.ts';
import { canPlaceUnit } from '../src/engine/units.ts';
import { previewElection, previewReferendum, finishElection } from '../src/engine/elections.ts';
import { CARD_PROGRAMS } from '../src/engine/card-programs.ts';
import { validateProgram } from '../src/engine/flow/runtime.ts';
import { gameHost } from '../src/engine/flow/game-host.ts';
import { randomInt } from '../src/engine/random.ts';

function send(state: GameState, command: Command) {
  const r = dispatch(state, command);
  assert.ok(r.ok, r.ok ? '' : r.error);
  return r.state;
}
function drain(state: GameState, pick?: (s: GameState) => string | undefined) {
  let steps = 0;
  while (state.pending) {
    assert.ok(++steps < 500, 'Event must terminate');
    const id =
      pick?.(state) ??
      state.pending.options.find((o) => o.id === 'allow')?.id ??
      state.pending.options[0].id;
    state = send(state, { type: 'choose', actor: state.pending.actor, option: id });
  }
  return state;
}
function ready(n: number, seed = 1921) {
  let s = createGame({ testCard: n, testPrerequisites: true, seed });
  s = send(s, { type: 'set-order', actor: 'Coalition', order: [...FACTIONS] });
  s.article48 = false;
  return s;
}
function event(s: GameState, n: number, pick?: (s: GameState) => string | undefined) {
  s = send(s, {
    type: 'begin-turn',
    actor: 'Coalition',
    mode: 'event-first',
    cardUid: `card-${n}`,
  });
  return drain(s, pick);
}
function activate(s: GameState, n: number) {
  if (inEffect(s, n)) return;
  for (const f of FACTIONS) s.hands[f] = s.hands[f].filter((c) => c.card !== n);
  s.deck = s.deck.filter((c) => c.card !== n);
  s.discard = s.discard.filter((c) => c.card !== n);
  s.lingering.push({ uid: `active-${n}`, card: n });
}
for (let n = 1; n <= 151; n++)
  test(`card #${n}: command path, all decisions settle, budget and save replay`, () => {
    const game = new GameSession({ testCard: n, testPrerequisites: true, seed: 1921 });
    const command = (c: Command) => {
      const r = game.send(c);
      assert.ok(r.ok, r.ok ? '' : `#${n}: ${r.error}`);
    };
    command({ type: 'set-order', actor: 'Coalition', order: [...FACTIONS] });
    command({ type: 'begin-turn', actor: 'Coalition', mode: 'event-first', cardUid: `card-${n}` });
    let choices = 0;
    while (game.state.pending) {
      assert.ok(++choices < 500, `#${n} choice loop`);
      const p = game.state.pending;
      command({
        type: 'choose',
        actor: p.actor,
        option: p.options.find((o) => o.id === 'allow')?.id ?? p.options[0].id,
      });
    }
    assert.equal(CARD[n].status, 'implemented');
    assert.equal(game.state.turn.actionsLeft, 2);
    assert.equal(game.state.flow, undefined);
    assert.equal(game.state.grantContext, undefined);
    assert.ok([...game.state.discard, ...game.state.lingering].some((c) => c.card === n));
    assert.deepEqual(GameSession.import(game.export()).state, game.state);
  });

test('all 151 event templates preflight and all era registries are complete', () => {
  const s = ready(1);
  for (const program of Object.values(CARD_PROGRAMS)) validateProgram(program, gameHost(s));
  assert.equal(CARDS.filter((c) => c.id <= 52 && c.status === 'implemented').length, 52);
  assert.equal(
    CARDS.filter((c) => c.id >= 53 && c.id <= 112 && c.status === 'implemented').length,
    60,
  );
  assert.equal(
    CARDS.filter((c) => c.id >= 113 && c.id <= 151 && c.status === 'implemented').length,
    39,
  );
});

const total = (s: GameState, f: Faction) => SPACES.reduce((n, p) => n + s.influence[p.id][f], 0);
const choose = (s: GameState, id: string) =>
  send(s, { type: 'choose', actor: s.pending!.actor, option: id });
const begin = (s: GameState, n: number) =>
  send(s, { type: 'begin-turn', actor: 'Coalition', mode: 'event-first', cardUid: `card-${n}` });
const branchId = (s: GameState, index: number) =>
  s.pending!.options.find((o) => o.id.endsWith(`:${index}`))!.id;
function movePiece(s: GameState, kind: string, owner: Faction | null, to: string) {
  const p = s.pieces.find(
    (p) => p.kind === kind && p.owner === owner && p.location.startsWith('@'),
  )!;
  assert.ok(p, `Fixture lacks ${kind}`);
  p.location = to;
  return p;
}

test('#2 replacement is atomic, limited to two different Prussian provinces, and ignores economy prohibition', () => {
  let s = ready(2);
  s.tracks.economy = 3;
  s.pc.Preussen.owner = 'Coalition';
  const before = structuredClone(s.influence);
  s = begin(s, 2);
  assert.equal(s.pending!.actor, 'Coalition');
  for (const o of s.pending!.options.filter((o) => o.id !== 'stop'))
    assert.equal(SPACE[o.id.split('|')[0]].region, 'Preussen');
  const first = s.pending!.options.find((o) => o.id !== 'stop')!.id;
  s = choose(s, first);
  assert.ok(s.pending!.options.every((o) => !o.id.startsWith(first.split('|')[0] + '|')));
  s = drain(s);
  const changed = SPACES.filter((p) => s.influence[p.id].Coalition > before[p.id].Coalition);
  assert.equal(changed.length, 2);
  for (const p of changed)
    assert.equal(
      Object.values(s.influence[p.id]).reduce((a, b) => a + b),
      Object.values(before[p.id]).reduce((a, b) => a + b),
    );
  assert.equal(s.momentum, 'Coalition');
});

test('#5 removes Berlin control until a normal election', () => {
  let s = ready(5);
  s.stance.KPD = 3;
  s = event(s, 5);
  assert.deepEqual(s.pc.Berlin, { owner: null, available: false });
  assert.deepEqual(s.pcLocked, ['Berlin']);
  assert.equal(s.tracks.unity, 1);
  assert.equal(piecesAt(s, 'Berlin', 'strike').length, 1);
  finishElection(s);
  assert.deepEqual(s.pcLocked, []);
});

for (const [n, space, before, threshold] of [
  [6, 'Bayern', 3, 4],
  [8, 'Provinz Westfalen', 4, 6],
] as const)
  test(`#${n} tests post-placement influence and deploys two militias`, () => {
    let s = ready(n);
    s.stance.KPD = 3;
    s.influence[space].KPD = before;
    const units = piecesAt(s, space, 'militia').length;
    s = event(s, n);
    assert.equal(s.influence[space].KPD, threshold);
    assert.equal(piecesAt(s, space, 'militia').length, units + 2);
    assert.equal(piecesAt(s, space, 'strike')[0]?.side, 'uprising');
  });

test('#7 reveals exactly the units deployed by the event, after general-strike consequences', () => {
  let s = ready(7);
  s.stance.KPD = 3;
  const oldHidden = s.pieces
    .filter((p) => p.kind === 'freikorps' && !p.revealed && onMap(p))
    .map((p) => p.id);
  s = event(s, 7);
  for (const space of ['Provinz Westfalen', 'Rheinprovinz']) {
    assert.equal(piecesAt(s, space, 'strike').length, 1);
    assert.equal(piecesAt(s, space, 'freikorps').filter((p) => p.revealed).length, 1);
  }
  assert.equal(s.generalStrike, true);
  assert.ok(oldHidden.every((id) => !s.pieces.find((p) => p.id === id)!.revealed));
});

test('#10 revelation transfers reserve rogues, permanently removes reserve loyalists and cancels #16', () => {
  let s = ready(10);
  activate(s, 16);
  const hidden = s.pieces
    .filter((p) => p.kind === 'freikorps' && !p.revealed)
    .map((p) => ({ ...p }));
  s = begin(s, 10);
  s = choose(s, branchId(s, 1));
  s = drain(s);
  for (const original of hidden) {
    const p = s.pieces.find((p) => p.id === original.id)!;
    assert.equal(p.revealed, true);
    assert.equal(p.owner, original.allegiance);
    assert.equal(
      p.location,
      original.location.startsWith('reserve:')
        ? original.allegiance === 'RC'
          ? 'reserve:RC'
          : 'removed'
        : original.location,
    );
  }
  assert.equal(inEffect(s, 16), false);
  assert.equal(inEffect(s, 10), false);
  assert.ok(s.discard.some((c) => c.card === 10));
  assertInvariants(s);
});

test('#10 unity branch also cancels #16 without revealing units', () => {
  let s = ready(10);
  activate(s, 16);
  const before = structuredClone(s.pieces);
  s = event(s, 10);
  assert.equal(s.tracks.unity, 0);
  assert.deepEqual(s.pieces, before);
  assert.equal(inEffect(s, 16), false);
});

test('#12 offers only tied leaders and lets the active faction select', () => {
  let s = ready(12);
  for (const id of ['Ostpreussen', 'Posen-Westpreussen', 'Niederschlesien', 'Oberschlesien'])
    s.influence[id] = { Coalition: 1, KPD: 1, NSDAP: 0, RC: 0 };
  s = begin(s, 12);
  assert.equal(s.pending!.actor, 'Coalition');
  assert.equal(s.pending!.options.length, 2);
  s = choose(s, s.pending!.options.find((o) => o.label === 'KPD')!.id);
  assert.equal(s.momentum, 'KPD');
});

test('#15 replaces only removed left-wing cubes even when the other right-wing faction holds momentum', () => {
  const s = ready(15);
  activate(s, 15);
  s.tracks.progress = 1;
  s.tracks.reaction = 2;
  s.tracks.economy = 9;
  s.momentum = 'RC';
  for (const p of piecesAt(s, 'Bayern'))
    if (['freikorps', 'militia', 'sa'].includes(p.kind)) p.location = `reserve:${p.owner}`;
  s.influence.Bayern = { Coalition: 1, KPD: 1, NSDAP: 1, RC: 1 };
  applyAction(s, 'NSDAP', {
    kind: 'remove-influence',
    space: 'Bayern',
    targets: { Coalition: 1, KPD: 1, RC: 1 },
  });
  assert.deepEqual(s.influence.Bayern, { Coalition: 0, KPD: 0, NSDAP: 3, RC: 0 });
  assert.throws(() =>
    applyAction(s, 'NSDAP', { kind: 'place-influence', space: 'Bayern', count: 1 }),
  );
});

test('#16 offers one additional different assault without consuming a second action', () => {
  let s = ready(16);
  activate(s, 16);
  s.tracks.progress = 3;
  s.tracks.reaction = 1;
  for (const p of s.pieces.filter((p) => p.kind === 'freikorps' && p.owner === 'Coalition')) {
    p.revealed = true;
    p.allegiance = 'Coalition';
  }
  s = send(s, { type: 'begin-turn', actor: 'Coalition', mode: 'single' });
  s = send(s, {
    type: 'action',
    actor: 'Coalition',
    action: { kind: 'assault', space: 'Berlin', target: 'RC' },
  });
  let found = false;
  s = drain(s, (state) => {
    if (state.pending!.prompt.startsWith('#16')) {
      found = true;
      assert.ok(state.pending!.options.every((o) => !o.id.startsWith('Berlin:')));
      return state.pending!.options.find((o) => o.id.startsWith('Muenchen:'))?.id;
    }
    return state.pending!.options.find((o) => ['none', 'decline', 'stop'].includes(o.id))?.id;
  });
  assert.equal(found, true);
  assert.equal(s.turn.actionsLeft, 0);
  assert.equal(s.turn.assaulted.length, 2);
});

for (const [card, faction] of [
  [19, 'NSDAP'],
  [59, 'KPD'],
] as const)
  test(`#${card} expands stance actions; stance unlocks the correct pieces`, () => {
    const s = ready(card);
    assert.throws(() => applyAction(s, faction, { kind: 'change-stance', steps: -2 }));
    activate(s, card);
    applyAction(s, faction, { kind: 'change-stance', steps: -2 });
    assert.equal(s.stance[faction], -2);
    const cadres = s.pieces.filter(
      (p) => p.kind === 'cadre' && p.owner === faction && available(s, p, faction),
    );
    assert.equal(cadres.length, faction === 'KPD' ? 1 : 2);
    applyAction(s, faction, { kind: 'change-stance', steps: -2 });
    assert.equal(s.stance[faction], -3);
    assert.throws(() => applyAction(s, faction, { kind: 'change-stance', steps: -1 }));
  });

test('#23 cannot remove two different factions in the same allocation', () => {
  let s = ready(23);
  s = begin(s, 23);
  if (s.pending!.prompt.includes('部署部队')) s = choose(s, 'stop');
  const id = s.pending!.options.find((o) => o.id.endsWith('|1') && !o.id.includes('|RC|'))!.id;
  s = choose(s, id);
  if (s.pending)
    assert.ok(
      s.pending.options.every((o) => o.id === 'stop' || o.id.split('|')[1] === id.split('|')[1]),
    );
  drain(s);
});

for (const [owner, faction, count] of [
  ['Coalition', 'Coalition', 2],
  ['KPD', 'KPD', 4],
  ['RC', 'Coalition', 1],
  ['NSDAP', 'Coalition', 1],
] as const)
  test(`#26 momentum ${owner}: ${count} direct placements`, () => {
    let s = ready(26);
    s.momentum = owner;
    s.tracks.economy = 3;
    const before = total(s, faction),
      influence = structuredClone(s.influence);
    s = event(s, 26);
    assert.equal(total(s, faction) - before, count);
    if (count > 1)
      assert.equal(
        SPACES.filter((p) => s.influence[p.id][faction] > influence[p.id][faction]).length,
        count,
      );
  });

test('#28 rolls in printed order and skips occupied strike spaces', () => {
  let s = ready(28);
  s.stance.KPD = 3;
  const predicted = { rng: s.rng };
  const rolls = [1, 2, 3].map(() => randomInt(predicted, 6) + 1);
  const spaces = ['Provinz Sachsen', 'Sachsen', 'Thueringen'];
  for (const id of spaces) {
    s.influence[id] = { Coalition: 0, KPD: SPACE[id].population, NSDAP: 0, RC: 0 };
  }
  s = event(s, 28);
  assert.deepEqual(s.log.filter((l) => l.text.startsWith('事件掷骰')).length, 3);
  assert.equal(piecesAt(s, 'Berlin', 'strike').length, 1);
  spaces.forEach((id, i) =>
    assert.equal(
      piecesAt(s, id, 'strike').length,
      id === 'Sachsen' || rolls[i] <= SPACE[id].population ? 1 : 0,
    ),
  );
  assert.equal(s.generalStrike, true);
});

test('#30 uses actual bounded movement, alternates recipients, and rejects wrong-actor commands atomically', () => {
  let s = ready(30);
  movePiece(s, 'leverage', 'Coalition', '@economy:4');
  const counts = { RC: total(s, 'RC'), NSDAP: total(s, 'NSDAP') };
  s = begin(s, 30);
  assert.ok(!s.pending!.options.some((o) => Number(o.id) < 4));
  s = choose(s, '4');
  assert.equal(s.pending!.actor, 'RC');
  const before = structuredClone(s);
  assert.equal(
    dispatch(s, { type: 'choose', actor: 'Coalition', option: s.pending!.options[0].id }).ok,
    false,
  );
  assert.deepEqual(s, before);
  s = choose(s, s.pending!.options[0].id);
  assert.equal(s.pending!.actor, 'NSDAP');
  s = drain(s);
  assert.equal(s.tracks.economy, 4);
  assert.equal(total(s, 'RC') - counts.RC, 1);
  assert.equal(total(s, 'NSDAP') - counts.NSDAP, 1);
  assert.equal(s.turn.actionsLeft, 2);
});

test('#30 suspended flow, undo, redo, reload, and subsequent choices replay identically', () => {
  const game = new GameSession({ testCard: 30, seed: 1921 });
  game.send({ type: 'set-order', actor: 'Coalition', order: [...FACTIONS] });
  game.send({ type: 'begin-turn', actor: 'Coalition', mode: 'event-first', cardUid: 'card-30' });
  if (game.state.pending?.options.some((o) => o.id === 'allow'))
    game.send({ type: 'choose', actor: 'Coalition', option: 'allow' });
  game.send({ type: 'choose', actor: 'Coalition', option: '2' });
  for (let i = 0; i < 6; i++) {
    assert.ok(game.state.flow);
    const snapshot = structuredClone(game.state);
    const copy = GameSession.import(game.export());
    assert.deepEqual(copy.state, snapshot);
    game.undo();
    game.redo();
    assert.deepEqual(game.state, snapshot);
    const p = game.state.pending!;
    const c: Command = { type: 'choose', actor: p.actor, option: p.options[0].id };
    assert.ok(game.send(c).ok);
    assert.ok(copy.send(c).ok);
    assert.deepEqual(copy.state, game.state);
  }
  assert.equal(game.state.flow, undefined);
  assert.equal(game.state.turn.actionsLeft, 2);
});

for (const revolutionary of [false, true])
  test(`#40 Hamburg uprising and ${revolutionary ? 2 : 1} militias`, () => {
    let s = ready(40);
    s.stance.KPD = revolutionary ? 3 : 1;
    s = event(s, 40);
    assert.equal(piecesAt(s, 'Hamburg', 'strike')[0]?.side, 'uprising');
    assert.equal(piecesAt(s, 'Hamburg', 'militia').length, revolutionary ? 2 : 1);
  });

for (const branch of [0, 1, 2])
  test(`#53 branch ${branch}: selective cleanup and stable economy`, () => {
    let s = ready(53);
    s.tracks.economy = 3;
    const uprising = movePiece(s, 'strike', 'KPD', 'Hamburg');
    uprising.side = 'uprising';
    const econ = movePiece(s, 'leverage', 'Coalition', '@economy:2').id;
    const before = s.pieces.filter((p) => p.kind === 'leverage' && onMap(p)).map((p) => p.id);
    s = begin(s, 53);
    s = choose(s, branchId(s, branch));
    s = drain(s);
    assert.equal(s.tracks.economy, 5);
    assert.equal(piecesAt(s, 'Hamburg', 'strike')[0].side, 'uprising');
    assert.equal(piecesAt(s, 'Sachsen', 'strike').length, branch === 0 ? 0 : 1);
    assert.equal(
      before.every((id) => onMap(s.pieces.find((p) => p.id === id)!)),
      branch !== 1,
    );
    assert.equal(s.pieces.find((p) => p.id === econ)!.location === '@economy:2', branch !== 2);
  });

test('#54 floor applies immediately and remains after a later unity reduction', () => {
  let s = ready(54);
  s.tracks.unity = 0;
  s = event(s, 54);
  assert.equal(s.tracks.unity, 1);
  s.effects.push({ type: 'track', track: 'unity', delta: -1 });
  resolveEffects(s);
  assert.equal(s.tracks.unity, 1);
});

test('#55 grants strength, not a die modifier; #56 sets influence power to two', () => {
  let s = ready(55);
  s = send(s, { type: 'begin-turn', actor: 'Coalition', mode: 'single' });
  s.effects.push({
    type: 'combat-start',
    attacker: 'NSDAP',
    defender: 'Coalition',
    space: 'Muenchen',
    free: false,
  });
  resolveEffects(s);
  const before = assaultStrength(s, 'attacker');
  activate(s, 55);
  assert.equal(assaultStrength(s, 'attacker'), before + 1);
  activate(s, 56);
  s.tracks.economy = 9;
  s.momentum = 'NSDAP';
  assert.equal(influencePower(s, 'NSDAP'), 2);
  s.momentum = 'RC';
  assert.equal(influencePower(s, 'NSDAP'), 3);
});

for (const [card, faction, kind] of [
  [58, 'NSDAP', 'sa'],
  [62, 'KPD', 'militia'],
] as const)
  test(`#${card} permits deployment with presence but no leadership`, () => {
    const s = ready(card);
    s.influence.Hamburg = { Coalition: 2, KPD: 0, NSDAP: 0, RC: 0 };
    s.influence.Hamburg[faction] = 1;
    s.pc.Hamburg.owner = null;
    const p = s.pieces.find((p) => p.kind === kind && p.location === `reserve:${faction}`)!;
    assert.equal(canPlaceUnit(s, faction, p, 'Hamburg'), false);
    activate(s, card);
    assert.equal(canPlaceUnit(s, faction, p, 'Hamburg'), true);
  });

test('#60 also triggers when another faction grants NSDAP a move-MCS action (#41)', () => {
  let s = ready(41);
  activate(s, 60);
  s = begin(s, 41);
  s = choose(s, branchId(s, 1));
  s = drain(s);
  assert.equal(s.momentum, 'NSDAP');
  assert.equal(s.turn.actionsLeft, 2);
});

for (const [us, bonus] of [
  [1, false],
  [2, true],
  [4, true],
  [5, false],
] as const)
  test(`#70 at US ${us}: new dollar controls bonus, economy moves toward stable`, () => {
    let s = ready(70);
    s.tracks.economy = 7;
    s.tracks.us = us;
    s.tracks.dollarDependence = Math.max(0, us - 2);
    s = begin(s, 70);
    assert.equal(s.tracks.economy, 6);
    assert.equal(s.tracks.us, Math.min(5, us + 1));
    assert.equal(!!s.pending, bonus);
    if (bonus) {
      assert.ok(s.pending!.prompt.includes('事件授予行动'));
      s = choose(s, 'stop');
    }
    assert.equal(s.flow, undefined);
  });

for (const f of FACTIONS)
  test(`#73 switches only right-wing momentum (${f})`, () => {
    let s = ready(73);
    s.momentum = f;
    s = event(s, 73);
    assert.equal(s.momentum, f === 'RC' ? 'NSDAP' : f === 'NSDAP' ? 'RC' : f);
  });

test('#81 offers KPD, NSDAP, RC exactly two cubes each in order', () => {
  let s = ready(81);
  const before = Object.fromEntries(FACTIONS.map((f) => [f, total(s, f)]));
  const seen: Faction[] = [];
  s = event(s, 81, (state) => {
    const p = state.pending!;
    seen.push(p.actor);
    return p.options.find((o) => o.id.endsWith('|2'))?.id;
  });
  assert.deepEqual(seen, ['KPD', 'NSDAP', 'RC']);
  for (const f of ['KPD', 'NSDAP', 'RC'] as const) assert.equal(total(s, f) - before[f], 2);
});

test('missing prerequisite discards without effects or lingering; tutorial ignores requirements', () => {
  let s = createGame({ testCard: 70, testPrerequisites: false });
  s = send(s, { type: 'set-order', actor: 'Coalition', order: [...FACTIONS] });
  s.article48 = false;
  const before = structuredClone(s.tracks);
  s = event(s, 70);
  assert.deepEqual(s.tracks, before);
  assert.equal(s.flow, undefined);
  assert.ok(s.discard.some((c) => c.card === 70));
  let t = ready(70);
  t.ruleset = 'tutorial-v1';
  t.lingering = [];
  t = event(t, 70);
  assert.equal(t.tracks.us, 2);
});

test('#82 referendum excludes regional markers and leaves PC/seats/Article48/cleanup intact when RC loses', () => {
  let s = ready(82);
  s.momentum = 'RC';
  s.article48 = false;
  for (const p of SPACES) s.influence[p.id] = { Coalition: 1, KPD: 0, NSDAP: 0, RC: 0 };
  activate(s, 54);
  activate(s, 57);
  activate(s, 59);
  const regular = previewElection(s),
    special = previewReferendum(s);
  assert.ok(regular.base.RC > special.base.RC);
  assert.ok(regular.base.KPD > special.base.KPD);
  const pc = structuredClone(s.pc),
    pieces = structuredClone(s.pieces),
    seats = structuredClone(s.seats);
  s = begin(s, 82);
  assert.equal(s.pending!.actor, 'RC');
  s = choose(s, 'no-transfer');
  assert.equal(s.winner, undefined);
  assert.equal(s.phase, 'action');
  assert.deepEqual(s.pc, pc);
  assert.deepEqual(s.pieces, pieces);
  assert.deepEqual(s.seats, seats);
  assert.equal(s.article48, false);
});

test('#82 RC win ends immediately and releases the event continuation', () => {
  let s = ready(82);
  s.momentum = 'RC';
  for (const p of SPACES) s.influence[p.id] = { Coalition: 0, KPD: 0, NSDAP: 0, RC: 1 };
  s = begin(s, 82);
  s = choose(s, 'no-transfer');
  assert.equal(s.winner, 'RC');
  assert.equal(s.phase, 'finished');
  assert.equal(s.flow, undefined);
  assert.ok(s.discard.some((c) => c.card === 82));
});

for (const seed of [7, 811])
  test(`all 151 cards terminate through varied optional branches (seed ${seed})`, () => {
    const chooser = { rng: seed };
    for (let n = 1; n <= 151; n++) {
      let s = ready(n, seed);
      s.stance = { KPD: 3, NSDAP: 3 };
      s = event(
        s,
        n,
        (state) => state.pending!.options[randomInt(chooser, state.pending!.options.length)].id,
      );
      assert.equal(s.pending, null, `#${n}`);
      assert.equal(s.flow, undefined, `#${n}`);
      assert.equal(s.grantContext, undefined, `#${n}`);
      assertInvariants(s);
    }
  });
