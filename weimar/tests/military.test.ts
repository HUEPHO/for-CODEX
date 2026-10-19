import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatch, FACTIONS, GameSession, legalActions } from '../src/engine/index.ts';
import type { GameState, Command, Faction, Piece, Effect } from '../src/engine/types.ts';
import {
  active,
  assertInvariants,
  available,
  isUnit,
  piecesAt,
  supremacy,
} from '../src/engine/rules.ts';
import { resolveEffects } from '../src/engine/events.ts';
import { canPlaceUnit, movementOptions, revealUnit } from '../src/engine/units.ts';
import { canAssault, assaultStrength } from '../src/engine/combat.ts';
import { randomInt } from '../src/engine/random.ts';
import { CARD } from '../src/data/cards.ts';

function send(s: GameState, c: Command) {
  const r = dispatch(s, c);
  assert.ok(r.ok, r.ok ? '' : r.error);
  return r.state;
}
function ready(actor: Faction = 'Coalition') {
  let s = createGame();
  s = send(s, {
    type: 'set-order',
    actor: 'Coalition',
    order: [actor, ...FACTIONS.filter((f) => f !== actor)],
  });
  return send(s, { type: 'begin-turn', actor, mode: 'single' });
}
function pick(s: GameState, option: string) {
  assert.ok(s.pending, 'expected a pending choice');
  return send(s, { type: 'choose', actor: s.pending.actor, option });
}
function settle(s: GameState) {
  let guard = 0;
  while (s.pending) {
    assert.ok(++guard < 150, 'choice chain must terminate');
    const id =
      ['done', 'refuse', 'skip', 'stop'].find((id) =>
        s.pending!.options.some((o) => o.id === id),
      ) ?? s.pending.options[0].id;
    s = pick(s, id);
  }
  return s;
}
function run(s: GameState, effects: Effect[]) {
  s.effects = effects;
  resolveEffects(s);
  return s;
}
function battleFixture(attacker: Faction = 'Coalition', defender: Faction = 'KPD') {
  const s = ready(attacker);
  for (const p of s.pieces.filter(isUnit)) {
    p.location = p.kind === 'reichswehr' ? p.location : `reserve:${p.owner}`;
    if (p.kind === 'freikorps' && p.owner === 'Coalition') {
      p.allegiance = 'Coalition';
      p.revealed = true;
    }
  }
  // No modifiers or unrelated pieces; tests add what they need.
  for (const p of [...piecesAt(s, 'Berlin')])
    p.location = p.kind === 'cadre' ? '@ussr-cadre:2' : p.location;
  s.pc.Berlin = { owner: null, available: false };
  s.influence.Berlin = { Coalition: 0, KPD: 0, NSDAP: 0, RC: 0 };
  const place = (owner: Faction, kind?: Piece['kind']) => {
    const p = s.pieces.find(
      (p) =>
        isUnit(p) && p.owner === owner && p.location !== 'Berlin' && (!kind || p.kind === kind),
    )!;
    p.location = 'Berlin';
    return p;
  };
  const kind = (f: Faction) => (f === 'KPD' ? 'militia' : f === 'NSDAP' ? 'sa' : 'freikorps');
  const a = place(attacker, kind(attacker)),
    d = place(defender, kind(defender));
  return { s, a, d, place };
}
function start(s: GameState, target: Faction) {
  return send(s, {
    type: 'action',
    actor: active(s),
    action: { kind: 'assault', space: 'Berlin', target },
  });
}

test('hidden Freikorps composition matches source bag, seeded and never rerolled', () => {
  const s = createGame(),
    fk = s.pieces.filter((p) => p.kind === 'freikorps' && !p.revealed);
  assert.equal(fk.length, 9);
  assert.equal(fk.filter((p) => p.allegiance === 'RC').length, 6);
  assert.equal(fk.filter((p) => p.allegiance === 'Coalition').length, 3);
  assert.deepEqual(s, createGame());
  const rogue = fk.find((p) => p.allegiance === 'RC')!;
  rogue.location = 'Berlin';
  revealUnit(s, rogue.id);
  assert.equal(rogue.owner, 'RC');
  run(s, [{ type: 'return', pieceId: rogue.id, actor: 'Coalition' }]);
  assert.equal(rogue.location, 'reserve:RC');
  assert.equal(rogue.revealed, true);
  assert.equal(available(s, rogue, 'Coalition'), false);
  assert.equal(available(s, rogue, 'RC'), true);
});
test('unit placement enforces faction, holding availability, PC/dominance/cadre', () => {
  let s = ready();
  const army = piecesAt(s, '@ussr-army:1')[0],
    locked = piecesAt(s, '@ussr-army:3')[0];
  assert.ok(canPlaceUnit(s, 'Coalition', army, 'Berlin'));
  assert.equal(canPlaceUnit(s, 'Coalition', locked, 'Berlin'), false);
  s = send(s, {
    type: 'action',
    actor: 'Coalition',
    action: { kind: 'place-unit', pieceId: army.id, space: 'Berlin' },
  });
  assert.ok(piecesAt(s, 'Berlin').some((p) => p.id === army.id));
  assert.equal(s.turn.actionsLeft, 0);
  const t = ready('KPD'),
    militia = t.pieces.find((p) => p.kind === 'militia' && p.location === 'reserve:KPD')!;
  assert.ok(canPlaceUnit(t, 'KPD', militia, 'Berlin')); // Cadre, despite no KPD dominance or PC.
  assert.equal(canPlaceUnit(t, 'KPD', militia, 'Hamburg'), false);
  assert.equal(canPlaceUnit(t, 'RC', militia, 'Bayern'), false);
});
test('movement uses three-space range, origin Strike and General Strike restrictions', () => {
  const s = ready('KPD'),
    saxon = piecesAt(s, 'Sachsen', 'militia')[0],
    berlin = piecesAt(s, 'Berlin', 'militia')[0];
  assert.ok(
    movementOptions(s, 'KPD', []).some((m) => m.piece.id === berlin.id && m.to === 'Bayern'),
  );
  assert.equal(
    movementOptions(s, 'KPD', []).some((m) => m.piece.id === saxon.id && m.to === 'Berlin'),
    false,
  );
  s.generalStrike = true;
  assert.equal(
    movementOptions(s, 'KPD', []).some((m) => m.piece.id === berlin.id && m.to === 'Bayern'),
    false,
  );
  assert.ok(
    movementOptions(s, 'KPD', []).some((m) => m.piece.id === berlin.id && m.to === 'Brandenburg'),
  );
});
test('one movement action moves at most three distinct units; choices stay actor-owned', () => {
  let s = ready();
  s = send(s, { type: 'action', actor: 'Coalition', action: { kind: 'move-units' } });
  const moved: string[] = [];
  for (let i = 0; i < 3; i++) {
    assert.equal(s.pending?.actor, 'Coalition');
    assert.equal(
      dispatch(s, { type: 'choose', actor: 'RC', option: s.pending!.options[1].id }).ok,
      false,
    );
    assert.ok(s.pending!.options.every((o) => !moved.some((id) => o.id.startsWith(id + ':'))));
    const option = s.pending!.options.find((o) => o.id.endsWith(':Brandenburg'))!;
    moved.push(option.id.split(':')[0]);
    s = pick(s, option.id);
  }
  assert.equal(s.pending, null);
  assert.equal(s.turn.actionsLeft, 0);
  assert.equal(new Set(moved).size, 3);
});
test('parliamentary movement restricts destinations, while origins may lie outside region', () => {
  let s = ready(); // PC may be played before a single action.
  s = send(s, {
    type: 'play-pc',
    actor: 'Coalition',
    region: 'Berlin',
    action: { kind: 'move-units' },
  });
  assert.ok(s.pending!.options.slice(1).every((o) => o.id.endsWith(':Berlin')));
  const fromBayern = s.pieces.find(
    (p) => p.owner === 'Coalition' && p.location === 'Bayern' && isUnit(p),
  )!;
  assert.ok(s.pending!.options.some((o) => o.id === `${fromBayern.id}:Berlin`));
  s = pick(s, `${fromBayern.id}:Berlin`);
  if (s.pending) s = pick(s, 'stop');
  s = settle(s);
  assert.equal(s.turn.actionsLeft, 1);
  assert.equal(s.pc.Berlin.available, false);
});
test('RC loyalty action reveals at most one unit in each of three spaces', () => {
  let s = ready('RC');
  s = send(s, { type: 'action', actor: 'RC', action: { kind: 'test-loyalty' } });
  const selected: string[] = [];
  for (let i = 0; i < 3; i++) {
    const option = s.pending!.options[1],
      p = s.pieces.find((p) => p.id === option.id)!;
    assert.ok(!selected.includes(p.location));
    selected.push(p.location);
    s = pick(s, option.id);
    if (s.pending)
      assert.ok(
        s.pending.options
          .slice(1)
          .every((o) => !selected.includes(s.pieces.find((p) => p.id === o.id)!.location)),
      );
  }
  assert.equal(s.pending, null);
  assert.equal(s.turn.actionsLeft, 0);
  assert.equal(
    dispatch(ready('Coalition'), {
      type: 'action',
      actor: 'Coalition',
      action: { kind: 'test-loyalty' },
    }).ok,
    false,
  );
});
test('assault requires own unit and opposing unit/Strike; influence alone is not a target', () => {
  const s = ready('Coalition');
  assert.equal(canAssault(s, 'Coalition', 'KPD', 'Koeln'), false);
  s.influence.Koeln.KPD = 1;
  assert.equal(canAssault(s, 'Coalition', 'KPD', 'Koeln'), false);
  piecesAt(s, 'Sachsen', 'strike')[0].location = 'Koeln';
  assert.equal(canAssault(s, 'Coalition', 'KPD', 'Koeln'), true);
  assert.equal(canAssault(s, 'Coalition', 'Coalition', 'Koeln'), false);
});
test('loans need lender permission; no transfer of ownership, and only one side per lender', () => {
  const f = battleFixture('KPD', 'NSDAP');
  const loan = f.place('RC'),
    second = f.place('RC');
  f.place('RC');
  let s = start(f.s, 'NSDAP');
  assert.equal(s.pending?.actor, 'KPD');
  s = pick(s, loan.id);
  assert.equal(s.pending?.actor, 'RC');
  const wrong = dispatch(s, { type: 'choose', actor: 'KPD', option: 'lend' });
  assert.equal(wrong.ok, false);
  s = pick(s, 'refuse');
  assert.equal(s.combat!.participants[loan.id], undefined);
  s = pick(s, second.id);
  s = pick(s, 'lend');
  assert.equal(s.combat!.participants[second.id], 'attacker');
  assert.equal(s.pieces.find((p) => p.id === second.id)!.owner, 'RC');
  s = pick(s, 'done');
  // Defender may not borrow another unit from a faction already lending to attacker.
  assert.ok(!s.pending?.options.some((o) => o.id === loan.id));
  s = settle(s);
  assert.equal(s.combat, undefined);
  assert.ok(s.lastCombat);
});
test('failed loyalty ignores Reichswehr, transfers rogue Freikorps, keeps loyal identity', () => {
  const f = battleFixture('Coalition', 'RC');
  f.a.revealed = false;
  f.a.allegiance = 'Coalition';
  const rogue = f.place('Coalition', 'freikorps');
  rogue.revealed = false;
  rogue.allegiance = 'RC';
  const army = f.place('Coalition', 'reichswehr');
  let s = start(f.s, 'RC');
  // RC has support, so processing pauses after loyalty before rolling.
  assert.ok(s.combat!.ignored.includes(army.id));
  assert.equal(s.pieces.find((p) => p.id === rogue.id)!.owner, 'RC');
  assert.equal(s.combat!.participants[rogue.id], 'defender');
  assert.equal(assaultStrength(s, 'attacker'), 2);
  assert.equal(assaultStrength(s, 'defender'), 4);
  s = settle(s);
  assert.equal(s.pieces.find((p) => p.id === army.id)!.location, 'Berlin');
  assertInvariants(s);
});
test('all-Coalition side disappearing cancels assault while consuming its action', () => {
  const f = battleFixture('Coalition', 'RC');
  f.a.revealed = false;
  f.a.allegiance = 'RC';
  const s = start(f.s, 'RC');
  assert.equal(s.combat, undefined);
  assert.equal(s.lastCombat?.cancelled, true);
  assert.equal(s.turn.actionsLeft, 0);
  assert.equal(s.momentum, 'Coalition');
  assert.deepEqual(s.lastCombat!.dice, { attacker: 0, defender: 0 });
});
test('passing loyalty leaves hidden faces hidden; no RC opposition means no test', () => {
  const f = battleFixture('Coalition', 'RC');
  f.a.revealed = false;
  f.a.allegiance = 'RC';
  f.s.tracks.progress = 3;
  const s = start(f.s, 'RC');
  assert.equal(s.pieces.find((p) => p.id === f.a.id)!.revealed, false);
  const g = battleFixture();
  g.a.revealed = false;
  g.a.allegiance = 'RC';
  const t = settle(start(g.s, 'KPD'));
  assert.equal(t.pieces.find((p) => p.id === g.a.id)!.revealed, false);
});
test('Militarism can be played or cancelled through Article 48, with replay and action budget intact', () => {
  assert.equal(CARD[20].expires, 'golden');
  for (const response of ['allow', 'article48']) {
    // Seed 10 deals #20 to RC in the unchanged formal tutorial deck.
    const game = new GameSession({ demo: false, seed: 10 });
    const play = (command: Command) => {
      const result = game.send(command);
      assert.ok(result.ok, result.ok ? '' : result.error);
    };
    const card = game.state.hands.RC.find((c) => c.card === 20)!;
    assert.ok(card);
    play({ type: 'set-order', actor: 'Coalition', order: ['RC', 'Coalition', 'KPD', 'NSDAP'] });
    play({ type: 'begin-turn', actor: 'RC', mode: 'event-first', cardUid: card.uid });
    assert.equal(game.state.pending?.actor, 'Coalition');
    assert.equal(
      game.state.lingering.some((c) => c.card === 20),
      false,
    );
    assert.deepEqual(GameSession.import(game.export()).state, game.state);
    play({ type: 'choose', actor: 'Coalition', option: response });
    assert.equal(
      game.state.lingering.some((c) => c.card === 20),
      response === 'allow',
    );
    assert.equal(
      game.state.discard.some((c) => c.card === 20),
      response === 'article48',
    );
    assert.equal(
      game.state.hands.RC.some((c) => c.card === 20),
      false,
    );
    assert.equal(game.state.turn.actionsLeft, 2);
    const resolved = structuredClone(game.state);
    game.undo();
    assert.equal(game.state.pending?.actor, 'Coalition');
    game.redo();
    assert.deepEqual(game.state, resolved);
    for (let i = 0; i < 2; i++)
      play({ type: 'action', actor: 'RC', action: { kind: 'gain-momentum' } });
    play({ type: 'end-turn', actor: 'RC' });
    assert.equal(active(game.state), 'Coalition');
    assert.equal(
      game.state.lingering.some((c) => c.card === 20),
      response === 'allow',
    );
    assert.deepEqual(GameSession.import(game.export()).state, game.state);
  }
});
test('Militarism requires a two-point lead for loyalty, whether Coalition attacks or defends', () => {
  for (const attacker of ['Coalition', 'RC'] as const) {
    const defender = attacker === 'Coalition' ? 'RC' : 'Coalition';
    for (const scenario of [
      { event: false, progress: 1, passes: true },
      { event: true, progress: 1, passes: false },
      { event: true, progress: 2, passes: false },
      { event: true, progress: 3, passes: true },
    ]) {
      const f = battleFixture(attacker, defender);
      f.s.tracks.progress = scenario.progress;
      // Tutorial starting pieces cap Progress at 3, so use Reaction 1.
      f.s.tracks.reaction = 1;
      if (scenario.event) f.s.lingering.push({ uid: 'card-20', card: 20 });
      const rogue = f.place('Coalition', 'freikorps');
      rogue.revealed = false;
      rogue.allegiance = 'RC';
      const army = f.place('Coalition', 'reichswehr');
      const s = start(f.s, defender);
      // RC's support decision pauses combat after loyalty and before dice/losses.
      assert.ok(s.pending);
      assert.equal(s.combat!.ignored.includes(army.id), !scenario.passes);
      const unit = s.pieces.find((p) => p.id === rogue.id)!;
      assert.equal(unit.owner, scenario.passes ? 'Coalition' : 'RC');
      assert.equal(unit.revealed, !scenario.passes);
      assertInvariants(s);
    }
  }
});
test('Militarism does not impose a loyalty check when no opposing RC units participate', () => {
  const f = battleFixture('Coalition', 'KPD');
  f.s.lingering.push({ uid: 'card-20', card: 20 });
  f.s.tracks.progress = 1;
  f.s.tracks.reaction = 3;
  f.a.revealed = false;
  f.a.allegiance = 'RC';
  const army = f.place('Coalition', 'reichswehr');
  const s = settle(start(f.s, 'KPD'));
  assert.equal(s.pieces.find((p) => p.id === f.a.id)!.revealed, false);
  assert.equal(s.lastCombat!.ignored.includes(army.id), false);
});
test('assault modifiers count leverage once, include PC/cadre/strike and spend one MCS', () => {
  const f = battleFixture('RC', 'KPD');
  piecesAt(f.s, 'Bayern', 'leverage').forEach((p) => (p.location = 'Berlin'));
  piecesAt(f.s, 'Sachsen', 'strike')[0].location = 'Berlin';
  piecesAt(f.s, '@ussr-cadre:2')[0].location = 'Berlin';
  f.s.pc.Berlin = { owner: 'RC', available: true };
  let s = start(f.s, 'KPD');
  assert.equal(assaultStrength(s, 'attacker'), 5);
  assert.equal(assaultStrength(s, 'defender'), 3);
  const pawn = piecesAt(s, 'mat:RC', 'mcs')[0];
  s = pick(s, pawn.id);
  s = settle(s);
  assert.equal(s.lastCombat!.strength.attacker, 7);
  assert.equal(piecesAt(s, 'mat:RC', 'mcs').length, 1);
  assert.equal(s.pieces.filter((p) => p.kind === 'mcs').length, 7);
});
test('losses are selected by the hitting faction; high SV can absorb insufficient hits', () => {
  const f = battleFixture('KPD', 'Coalition'),
    army = f.place('Coalition', 'reichswehr');
  let s = start(f.s, 'Coalition');
  s = settle(s); // Build a controlled loss stage from recorded participants.
  s.combat = structuredClone(s.lastCombat!);
  s.combat.cancelled = false;
  f.a.location = 'Berlin';
  for (const id of [f.a.id, f.d.id, army.id])
    s.pieces.find((p) => p.id === id)!.location = 'Berlin';
  run(s, [{ type: 'combat-loss', side: 'attacker', remaining: 2 }, { type: 'combat-finish' }]);
  assert.equal(s.pending!.actor, 'KPD');
  assert.ok(s.pending!.options.some((o) => o.id === army.id));
  s = pick(s, army.id);
  assert.equal(s.pieces.find((p) => p.id === army.id)!.location, 'Berlin');
  assert.equal(s.pieces.find((p) => p.id === f.d.id)!.location, 'Berlin');
});
test('hits remove units before uprising and influence; lender influence is protected', () => {
  const f = battleFixture('Coalition', 'KPD'),
    loan = f.place('NSDAP');
  const strikeId = piecesAt(f.s, 'Sachsen', 'strike')[0].id;
  piecesAt(f.s, 'Sachsen', 'strike')[0].location = 'Berlin';
  piecesAt(f.s, 'Berlin', 'strike')[0].side = 'uprising';
  f.s.influence.Berlin = { Coalition: 1, KPD: 2, NSDAP: 1, RC: 0 };
  let s = start(f.s, 'KPD');
  s = pick(s, 'done');
  s = pick(s, loan.id);
  s = pick(s, 'lend');
  s = settle(s);
  s.combat = structuredClone(s.lastCombat!);
  s.combat.cancelled = false;
  for (const id of [f.a.id, f.d.id, loan.id])
    s.pieces.find((p) => p.id === id)!.location = 'Berlin';
  const strike = s.pieces.find((p) => p.id === strikeId)!;
  strike.location = 'Berlin';
  strike.side = 'uprising';
  s.influence.Berlin = { Coalition: 1, KPD: 2, NSDAP: 1, RC: 0 };
  run(s, [{ type: 'combat-loss', side: 'attacker', remaining: 6 }, { type: 'combat-finish' }]);
  assert.ok(s.pending!.options.every((o) => o.id === f.d.id || o.id === loan.id));
  s = pick(s, f.d.id);
  s = pick(s, loan.id);
  s = settle(s);
  assert.equal(s.pieces.find((p) => p.id === f.d.id)!.location, 'reserve:KPD');
  assert.equal(s.pieces.find((p) => p.id === loan.id)!.location, 'reserve:NSDAP');
  assert.equal(piecesAt(s, 'Berlin', 'strike').length, 0);
  assert.equal(s.influence.Berlin.KPD, 0);
  assert.equal(s.influence.Berlin.NSDAP, 1);
});
test('counterattack hits are locked before losses, momentum follows hits and ties keep it', () => {
  const f = battleFixture('Coalition', 'KPD');
  const s = settle(start(f.s, 'KPD'));
  const battle = s.lastCombat!;
  assert.equal(battle.hits.attacker, Math.max(0, battle.strength.attacker - battle.dice.attacker));
  assert.equal(battle.hits.defender, Math.max(0, battle.strength.defender - battle.dice.defender));
  assert.equal(
    s.momentum,
    battle.hits.attacker === battle.hits.defender
      ? 'Coalition'
      : battle.hits.attacker > battle.hits.defender
        ? 'Coalition'
        : 'KPD',
  );
});
test('attacker influence penalty uses postbattle supremacy including ignored Reichswehr', () => {
  const f = battleFixture('Coalition', 'RC'),
    army = f.place('Coalition', 'reichswehr');
  let s = start(f.s, 'RC');
  s = settle(s);
  // Construct a final outcome with only a refusing Reichswehr remaining.
  for (const p of s.pieces.filter(isUnit))
    if (p.location === 'Berlin') p.location = `reserve:${p.owner}`;
  s.pieces.find((p) => p.id === army.id)!.location = 'Berlin';
  s.influence.Berlin.Coalition = 1;
  s.combat = structuredClone(s.lastCombat!);
  run(s, [{ type: 'combat-finish' }]);
  assert.equal(supremacy(s, 'Berlin'), 'Coalition');
  assert.equal(s.influence.Berlin.Coalition, 1);
  s.combat = structuredClone(s.lastCombat!);
  s.pieces.find((p) => p.id === army.id)!.location = '@ussr-army:5';
  run(s, [{ type: 'combat-finish' }]);
  assert.equal(s.influence.Berlin.Coalition, 0);
});
test('normal assault may not repeat a space, but free sworn-enemy assault is exempt', () => {
  const f = battleFixture('KPD', 'NSDAP');
  f.s.turn.assaulted = ['Berlin'];
  assert.equal(canAssault(f.s, 'KPD', 'NSDAP', 'Berlin'), false);
  assert.equal(canAssault(f.s, 'KPD', 'NSDAP', 'Berlin', true), true);
  run(f.s, [
    { type: 'combat-start', attacker: 'KPD', defender: 'NSDAP', space: 'Berlin', free: true },
  ]);
  const s = settle(f.s);
  assert.equal(s.lastCombat?.free, true);
  assert.equal(s.turn.actionsLeft, 1);
  assert.deepEqual(s.turn.assaulted, ['Berlin']);
});
test('extremist deployment triggers exactly one free assault; non-extremist placement does not', () => {
  let s = ready('KPD');
  s.pc.Muenchen = { owner: 'KPD', available: true };
  const unit = s.pieces.find((p) => p.kind === 'militia' && p.location === 'reserve:KPD')!;
  s = send(s, {
    type: 'action',
    actor: 'KPD',
    action: { kind: 'place-unit', pieceId: unit.id, space: 'Muenchen' },
  });
  s = settle(s);
  assert.equal(s.lastCombat?.free, true);
  assert.equal(s.lastCombat?.attacker, 'KPD');
  assert.equal(s.turn.actionsLeft, 0);
  assert.deepEqual(s.turn.assaulted, []);
  const t = ready();
  const militia = piecesAt(t, 'Sachsen', 'militia')[0];
  militia.location = 'Muenchen';
  const coalition = t.pieces.find(
    (p) => p.kind === 'freikorps' && p.location === 'reserve:Coalition',
  )!;
  const u = send(t, {
    type: 'action',
    actor: 'Coalition',
    action: { kind: 'place-unit', pieceId: coalition.id, space: 'Muenchen' },
  });
  assert.equal(u.combat, undefined);
  assert.equal(u.lastCombat, undefined);
});
test('assassination allows mixed opposing cubes, bypasses placement history, and respects marker ownership', () => {
  let s = ready('NSDAP');
  const marker = piecesAt(s, '@nsdap-assassination:1')[0];
  s = send(s, {
    type: 'action',
    actor: 'NSDAP',
    action: { kind: 'place-assassination', pieceId: marker.id, space: 'Berlin', side: 'left' },
  });
  s = pick(s, 'cubes:1:1');
  assert.equal(s.influence.Berlin.Coalition, 1);
  assert.equal(s.influence.Berlin.KPD, 1);
  assert.equal(piecesAt(s, 'Berlin', 'assassination')[0].side, 'left');
  const t = ready('RC');
  assert.equal(available(t, piecesAt(t, '@nsdap-assassination:1')[0], 'RC'), false);
  assert.equal(available(t, piecesAt(t, '@rc-assassination:1')[0], 'NSDAP'), false);
  let u = ready('NSDAP');
  u.turn.placed.push('Berlin');
  u = send(u, {
    type: 'action',
    actor: 'NSDAP',
    action: { kind: 'place-assassination', pieceId: marker.id, space: 'Berlin', side: 'left' },
  });
  assert.ok(u.pending!.options.some((o) => o.id === 'cubes:1:1'));
  u = pick(u, 'cubes:1:1');
  assert.ok(u.turn.placed.includes('Berlin'));
  assert.ok(!u.turn.removed.includes('Berlin'));
});
test('NSDAP bonus assassination requires two Cliques, available marker and no RC supremacy', () => {
  let s = ready('NSDAP');
  piecesAt(s, '@rc-clique:2')[0].location = 'Brandenburg';
  const marker = piecesAt(s, '@nsdap-assassination:1')[0];
  s = send(s, {
    type: 'action',
    actor: 'NSDAP',
    action: { kind: 'place-assassination', pieceId: marker.id, space: 'Berlin', side: 'left' },
  });
  s = pick(s, 'cubes:0:0');
  assert.ok(s.pending!.prompt.includes('额外暗杀'));
  const clique = piecesAt(s, 'Brandenburg', 'clique')[0];
  const option = s.pending!.options.find((o) => o.id.endsWith(':' + clique.id))!;
  s = pick(s, option.id);
  s = settle(s);
  assert.equal(piecesAt(s, 'Brandenburg', 'clique').length, 0);
  assert.equal(piecesAt(s, 'Brandenburg', 'assassination')[0].side, 'right');
});
test('military choices and combat RNG survive export/import, undo and redo; 0.1 imports migrate', () => {
  const game = new GameSession({ seed: 1921, demo: true });
  game.send({ type: 'set-order', actor: 'Coalition', order: [...FACTIONS] });
  game.send({ type: 'begin-turn', actor: 'Coalition', mode: 'single' });
  game.send({
    type: 'action',
    actor: 'Coalition',
    action: { kind: 'assault', space: 'Berlin', target: 'RC' },
  });
  let guard = 0;
  while (game.state.pending) {
    assert.ok(++guard < 100);
    const copy = GameSession.import(game.export());
    assert.deepEqual(copy.state, game.state);
    const p = game.state.pending;
    const option =
      ['done', 'refuse', 'skip'].find((id) => p.options.some((o) => o.id === id)) ??
      p.options[0].id;
    assert.ok(game.send({ type: 'choose', actor: p.actor, option }).ok);
  }
  const final = structuredClone(game.state);
  game.undo();
  game.redo();
  assert.deepEqual(game.state, final);
  assert.deepEqual(GameSession.import(game.export()).state, final);
  const old = new GameSession().export().replace('weimar-tutorial-0.2.0', 'weimar-tutorial-0.1.0');
  assert.equal(
    GameSession.import(old).state.pieces.filter((p) => p.kind === 'freikorps' && !p.revealed)
      .length,
    9,
  );
});
test('enumerating military actions neither reveals loyalty nor consumes RNG', () => {
  const s = ready('NSDAP'),
    before = structuredClone(s),
    actions = legalActions(s);
  assert.ok(actions.some((a) => a.action.kind === 'place-unit'));
  assert.ok(actions.some((a) => a.action.kind === 'move-units'));
  assert.deepEqual(s, before);
  for (const { action } of actions)
    assert.ok(dispatch(s, { type: 'action', actor: 'NSDAP', action }).ok);
});

test('rulebook assault example: loans, defection, 7 vs 5 strength, 4 vs 3 hits and simultaneous losses', () => {
  const f = battleFixture('RC', 'Coalition');
  f.place('RC', 'freikorps');
  f.d.revealed = false;
  f.d.allegiance = 'Coalition';
  const rogue = f.place('Coalition', 'freikorps');
  rogue.revealed = false;
  rogue.allegiance = 'RC';
  const army = f.place('Coalition', 'reichswehr'),
    loan = f.place('KPD', 'militia');
  piecesAt(f.s, '@us:2')[0].location = 'Berlin';
  f.s.pc.Berlin = { owner: 'Coalition', available: true };
  f.s.influence.Berlin = { Coalition: 2, KPD: 0, RC: 2, NSDAP: 0 };
  let seed = 0;
  while (seed < 100000) {
    const r = { rng: seed };
    if (randomInt(r, 6) === 2 && randomInt(r, 6) === 1) break;
    seed++;
  }
  assert.ok(seed < 100000);
  f.s.rng = seed;
  let s = start(f.s, 'Coalition');
  s = pick(s, loan.id);
  s = pick(s, 'lend');
  s = pick(s, 'skip');
  assert.deepEqual(s.combat!.strength, { attacker: 7, defender: 5 });
  assert.deepEqual(s.combat!.dice, { attacker: 3, defender: 2 });
  assert.deepEqual(s.combat!.hits, { attacker: 4, defender: 3 });
  assert.ok(!s.pending!.options.some((o) => o.id === army.id));
  s = pick(s, f.d.id);
  assert.equal(s.pending!.actor, 'Coalition');
  assert.equal(s.influence.Berlin.Coalition, 0);
  s = pick(s, rogue.id);
  s = pick(s, loan.id);
  assert.equal(s.combat, undefined);
  assert.equal(s.momentum, 'RC');
  assert.equal(supremacy(s, 'Berlin'), 'RC');
  assert.equal(s.influence.Berlin.RC, 2);
  assert.equal(s.pieces.find((p) => p.id === army.id)!.location, 'Berlin');
  assert.equal(s.pieces.find((p) => p.id === rogue.id)!.location, 'reserve:RC');
  assert.equal(s.pieces.find((p) => p.id === f.d.id)!.location, 'reserve:Coalition');
});

test('movement resolves shared-destination sworn enemies once after all moves', () => {
  let s = ready('KPD');
  const first = piecesAt(s, 'Berlin', 'militia')[0],
    second = piecesAt(s, 'Berlin', 'militia')[1];
  const enemy = s.pieces.find((p) => p.kind === 'sa')!;
  enemy.location = 'Brandenburg';
  s = send(s, { type: 'action', actor: 'KPD', action: { kind: 'move-units' } });
  s = pick(s, `${first.id}:Brandenburg`);
  assert.equal(s.combat, undefined);
  s = pick(s, `${second.id}:Brandenburg`);
  assert.equal(s.combat, undefined);
  s = pick(s, 'stop');
  s = settle(s);
  assert.equal(s.lastCombat!.free, true);
  assert.equal(s.lastCombat!.space, 'Brandenburg');
  assert.equal(s.log.filter((l) => l.text.includes('死敌免费突击，不额外消耗行动')).length, 1);
  assert.equal(s.turn.actionsLeft, 0);
});
