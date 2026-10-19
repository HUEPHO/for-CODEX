import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatch, FACTIONS, GameSession } from '../src/engine/index.ts';
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
  assert.equal(s.turn.actionsLeft, 2);
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

for (const variant of [0, 1])
  test(`#83 removal branch ${variant}, KPD choice, then cancel #62`, () => {
    let s = ready(83);
    clearUnits(s);
    const units = [move(s, 'militia', 'KPD', 'Hamburg'), move(s, 'militia', 'KPD', 'Berlin')];
    const cadre = move(s, 'cadre', 'KPD', 'Bayern');
    s = branch(begin(s, 83), variant);
    s = drain(s, (state) => {
      if (state.pending!.prompt.includes('事件授予行动')) {
        assert.equal(state.pending!.actor, 'KPD');
        assert.equal(inEffect(state, 62), true);
        return 'stop';
      }
    });
    assert.equal(
      units.filter((id) => onMap(s.pieces.find((p) => p.id === id)!)).length,
      variant === 0 ? 0 : 2,
    );
    assert.equal(onMap(s.pieces.find((p) => p.id === cadre)!), variant === 0);
    assert.equal(inEffect(s, 62), false);
    assert.ok(s.discard.some((c) => c.card === 62));
  });

test('#83 missing prerequisite skips all effects', () => {
  let s = ready(83, 'Coalition', false);
  const before = structuredClone(s.pieces);
  s = begin(s, 83);
  assert.equal(s.pending, null);
  assert.deepEqual(s.pieces, before);
});

test('#84 counts supremacy, not occupation or pieces, and does not restrict destinations', () => {
  let s = ready(84);
  clearUnits(s);
  clearInfluence(s);
  for (let i = 0; i < 2; i++) move(s, 'freikorps', 'RC', 'Berlin');
  move(s, 'freikorps', 'RC', 'Hamburg');
  move(s, 'reichswehr', 'Coalition', 'Hamburg');
  const reserve = s.pieces.find(
    (p) => p.kind === 'freikorps' && p.owner === 'Coalition' && p.allegiance === 'RC',
  )!;
  Object.assign(reserve, { owner: 'RC', revealed: true, location: 'reserve:RC' });
  s.pc.Bayern.owner = 'RC';
  assert.equal(supremacy(s, 'Berlin'), 'RC');
  assert.equal(supremacy(s, 'Hamburg'), 'Coalition');
  const before = piecesAt(s, 'Bayern').filter(isUnit).length;
  s = begin(s, 84);
  assert.equal(s.pending!.actor, 'RC');
  assert.match(s.pending!.prompt, /剩余 1/);
  s = choose(
    s,
    s.pending!.options.find((o) => o.label.includes('部署部队') && o.label.includes('巴伐利亚'))!
      .id,
  );
  assert.equal(s.pending, null);
  assert.equal(piecesAt(s, 'Bayern').filter(isUnit).length, before + 1);
  assert.equal(s.turn.actionsLeft, 2);
});

test('#85 only coalition supremacy spaces, one action per space in player-chosen order', () => {
  let s = ready(85);
  clearUnits(s);
  clearInfluence(s);
  move(s, 'reichswehr', 'Coalition', 'Berlin');
  move(s, 'reichswehr', 'Coalition', 'Bayern');
  move(s, 'freikorps', 'Coalition', 'Hamburg');
  move(s, 'freikorps', 'RC', 'Hamburg'); // tied: neither has supremacy
  s.influence.Bayern.Coalition = 1;
  s = begin(s, 85);
  assert.ok(s.pending!.options.every((o) => o.id === 'stop' || /柏林|巴伐利亚/.test(o.label)));
  s = choose(
    s,
    s.pending!.options.find((o) => o.label.includes('巴伐利亚') && o.label.includes('放置'))!.id,
  );
  assert.ok(s.pending!.options.every((o) => o.id === 'stop' || o.label.includes('柏林')));
  s = drain(s);
  assert.equal(s.influence.Berlin.Coalition, 1);
  assert.equal(s.influence.Bayern.Coalition, 2);
});

for (const faceUp of [false, true])
  test(`#86 seats transfer preserves face ${faceUp}`, () => {
    let s = ready(86);
    s.seats = { owner: 'KPD', available: faceUp };
    s = branch(begin(s, 86), 0);
    assert.deepEqual(s.seats, { owner: 'RC', available: faceUp });
  });

for (const unity of [0, 1, 2])
  test(`#86 return branch at unity ${unity}`, () => {
    let s = ready(86, 'KPD');
    s.tracks.unity = unity;
    move(s, 'mcs', null, 'mat:Coalition');
    const before = mcs(s, 'Coalition');
    s = branch(begin(s, 86), 1);
    if (unity < 2) assert.equal(s.pending!.actor, 'Coalition');
    s = drain(s);
    assert.equal(mcs(s, 'Coalition'), before - (unity < 2 ? 1 : 0));
  });

test('#87 mandatory removal is city-only and only right-wing influence', () => {
  let s = begin(ready(87), 87);
  for (const o of s.pending!.options) {
    const [space, f] = o.id.split('|');
    assert.equal(SPACE[space].kind, 'City');
    assert.ok(['RC', 'NSDAP'].includes(f));
  }
  const before = total(s, 'RC') + total(s, 'NSDAP');
  s = drain(s);
  assert.equal(total(s, 'RC') + total(s, 'NSDAP'), before - 1);
});

test('#88 removes deployed leverage, not available holdings; economy advances afterwards', () => {
  let s = ready(88);
  const id = move(s, 'leverage', 'RC', '@economy:8');
  s.tracks.economy = 5;
  s = begin(s, 88);
  assert.ok(s.pending!.options.some((o) => o.id === id));
  for (const o of s.pending!.options) {
    const p = s.pieces.find((p) => p.id === o.id)!;
    assert.ok(onMap(p) || /^@(economy|progress|reaction):/.test(p.location));
  }
  s = drain(choose(s, id));
  assert.notEqual(s.pieces.find((p) => p.id === id)!.location, '@economy:8');
  assert.equal(s.tracks.economy, 6);
});

for (const generalStrike of [false, true])
  test(`#89 cube and available black lever share chosen space, general strike ${generalStrike}`, () => {
    let s = ready(89);
    s.generalStrike = generalStrike;
    const before = s.influence.Pommern.RC;
    const levers = piecesAt(s, 'Pommern', 'leverage').length;
    s = begin(s, 89);
    assert.equal(s.pending!.options.length, 5);
    s = drain(branch(s, 4));
    assert.equal(s.influence.Pommern.RC, before + 1);
    assert.equal(piecesAt(s, 'Pommern', 'leverage').length, levers + (generalStrike ? 0 : 1));
  });

for (const momentum of ['KPD', 'RC'] as Faction[])
  test(`#90 belongs to active faction, momentum ${momentum}`, () => {
    let s = ready(90, 'NSDAP');
    s.momentum = momentum;
    s = begin(s, 90);
    assert.equal(s.pending!.actor, 'NSDAP');
    assert.match(s.pending!.prompt, new RegExp(`剩余 ${momentum === 'KPD' ? 1 : 2}`));
    assert.equal(
      s.pending!.options.some((o) => o.id === 'stop'),
      momentum !== 'KPD',
    );
    s = drain(s);
  });

test('#91 independently counts coalition then RC mat pawns; skipping first still grants second', () => {
  let s = ready(91);
  move(s, 'mcs', null, 'mat:Coalition');
  move(s, 'mcs', null, 'mat:RC');
  const counts = { Coalition: mcs(s, 'Coalition'), RC: mcs(s, 'RC') };
  s = begin(s, 91);
  assert.equal(s.pending!.actor, 'Coalition');
  assert.match(s.pending!.prompt, new RegExp(`剩余 ${counts.Coalition}`));
  s = choose(s, 'stop');
  assert.equal(s.pending!.actor, 'RC');
  assert.match(s.pending!.prompt, new RegExp(`剩余 ${counts.RC}`));
  s = choose(s, 'stop');
  assert.equal(s.pending, null);
});

for (const deployed of [false, true])
  test(`#93 errata counts only map markers, deployed ${deployed}`, () => {
    let s = ready(93);
    s.tracks.progress = 4;
    for (const p of s.pieces.filter(
      (p) => ['strike', 'assassination', 'reform'].includes(p.kind) && onMap(p),
    ))
      p.location = 'removed';
    if (deployed) {
      move(s, 'strike', 'KPD', 'Berlin');
      move(s, 'strike', 'KPD', 'Hamburg');
      move(s, 'reform', 'Coalition', 'Bayern');
      move(s, 'assassination', null, 'Muenchen');
    }
    s = begin(s, 93);
    assert.equal(s.momentum, 'Coalition');
    assert.equal(!!s.pending, deployed);
    s = drain(s, skip);
  });

for (const card of [94, 102])
  for (const option of [0, 1])
    test(`#${card} branch ${option}`, () => {
      let s = ready(card);
      s.tracks.reaction = 3;
      const before = structuredClone(s.influence);
      s = drain(branch(begin(s, card), option));
      assert.equal(s.tracks.reaction, option === 0 ? 2 : 3);
      for (const space of ['Bayern', 'Rheinprovinz'])
        assert.equal(
          s.influence[space].Coalition,
          before[space].Coalition + (option === 1 ? 1 : 0),
        );
    });

for (const [progress, reaction] of [
  [4, 2],
  [2, 4],
  [3, 3],
])
  test(`#95 mandatory absolute difference ${progress}/${reaction}`, () => {
    let s = ready(95);
    s.tracks.progress = progress;
    s.tracks.reaction = reaction;
    const before = total(s, 'Coalition');
    s = begin(s, 95);
    let actions = 0;
    s = drain(s, (state) => {
      assert.ok(!state.pending!.options.some((o) => o.id === 'stop'));
      actions++;
      return actionChoice(state);
    });
    assert.equal(actions, Math.abs(progress - reaction));
    assert.equal(total(s, 'Coalition'), before + actions);
  });

test('#95 skips impossible actions under coalition economy prohibition', () => {
  let s = ready(95);
  s.tracks.economy = 3;
  s.tracks.progress = 4;
  s.tracks.reaction = 2;
  const before = total(s, 'Coalition');
  s = begin(s, 95);
  assert.equal(s.pending, null);
  assert.equal(total(s, 'Coalition'), before);
});

test('#96 counts city levers separately, then hands decisions from coalition to RC', () => {
  let s = ready(96);
  for (const p of s.pieces.filter((p) => p.kind === 'leverage' && onMap(p))) p.location = 'removed';
  move(s, 'leverage', 'Coalition', 'Berlin');
  move(s, 'leverage', 'RC', 'Muenchen');
  move(s, 'leverage', 'RC', 'Bayern');
  s = begin(s, 96);
  assert.equal(s.pending!.actor, 'Coalition');
  assert.match(s.pending!.prompt, /剩余 1/);
  s = choose(s, 'stop');
  assert.equal(s.pending!.actor, 'RC');
  assert.match(s.pending!.prompt, /剩余 1/);
  s = choose(s, 'stop');
  assert.equal(s.pending, null);
});

for (const replace of [false, true])
  test(`#97 Berlin replacement ${replace}, then NSDAP momentum and choice`, () => {
    let s = ready(97);
    const before = { ...s.influence.Berlin };
    s = begin(s, 97);
    assert.equal(s.pending!.actor, 'RC');
    s = choose(s, replace ? 'Berlin|Coalition|1' : 'stop');
    assert.equal(s.momentum, 'NSDAP');
    assert.equal(s.pending!.actor, 'NSDAP');
    s = choose(s, 'stop');
    assert.equal(s.influence.Berlin.Coalition, before.Coalition - Number(replace));
    assert.equal(s.influence.Berlin.RC, before.RC + Number(replace));
  });

test('#98 actual removals bound non-city placements, with optional own removals and remaining quota', () => {
  let s = ready(98);
  clearInfluence(s);
  s.influence.Berlin.Coalition = 1;
  s.influence.Muenchen.NSDAP = 3;
  s = begin(s, 98);
  assert.equal(s.pending!.actor, 'NSDAP');
  s = choose(s, 'Berlin|Coalition|1');
  s = choose(s, 'Muenchen|NSDAP|2');
  s = choose(s, 'stop');
  assert.match(s.pending!.prompt, /剩余 3/);
  assert.ok(
    s.pending!.options.every((o) => o.id === 'stop' || SPACE[o.id.split('|')[0]].kind !== 'City'),
  );
  s = choose(s, 'Bayern|NSDAP|2');
  assert.match(s.pending!.prompt, /剩余 1/);
  s = choose(s, 'stop');
  assert.equal(total(s, 'Coalition'), 0);
  assert.equal(s.influence.Muenchen.NSDAP, 1);
  assert.equal(s.influence.Bayern.NSDAP, 2);
  assert.equal(s.pending, null);
});

test('#98 removing nothing grants no placement; own cubes alone use only their actual count', () => {
  let s = begin(ready(98), 98);
  s = drain(s, skip);
  assert.equal(s.turn.placed.length, 0);
  let own = ready(98);
  clearInfluence(own);
  own.influence.Muenchen.NSDAP = 2;
  own = begin(own, 98);
  own = choose(own, 'Muenchen|NSDAP|1');
  own = choose(own, 'stop');
  assert.match(own.pending!.prompt, /剩余 1/);
  own = drain(own);
  assert.equal(total(own, 'NSDAP'), 2);
});

for (const faction of FACTIONS)
  test(`#99 momentum beneficiary ${faction}`, () => {
    let s = ready(99);
    s.momentum = faction;
    s.tracks.progress = 2;
    s.tracks.reaction = 4;
    s = begin(s, 99);
    if (['NSDAP', 'RC'].includes(faction)) {
      assert.equal(s.pending!.actor, faction);
      assert.match(s.pending!.prompt, /剩余 2/);
      s = choose(s, 'stop');
    }
    assert.equal(s.pending, null);
  });

test('#100 retains coalition Berlin parliamentary condition after MCS action', () => {
  let s = ready(100);
  s.pc.Berlin.owner = 'Coalition';
  s = begin(s, 100);
  s = choose(s, 'stop');
  assert.equal(s.pending!.actor, 'Coalition');
  assert.ok(s.pending!.options.every((o) => o.id === 'stop' || o.id.startsWith('Berlin|')));
  s = drain(s);
});

for (const yellow of [false, true])
  test(`#101 Berlin-only action, yellow lever momentum ${yellow}`, () => {
    let s = ready(101);
    for (const p of piecesAt(s, 'Berlin', 'leverage')) p.location = 'removed';
    if (yellow) move(s, 'leverage', 'Coalition', 'Berlin');
    s.momentum = 'RC';
    s = begin(s, 101);
    assert.ok(s.pending!.options.every((o) => o.id === 'stop' || o.label.includes('柏林')));
    s = choose(s, 'stop');
    assert.equal(s.momentum, yellow ? 'Coalition' : 'RC');
  });

test('#103 coalition chooses any empty MCS holding, even when KPD plays card', () => {
  let s = ready(103, 'KPD');
  for (const p of s.pieces.filter((p) => p.kind === 'mcs')) p.location = 'mat:Coalition';
  s = begin(s, 103);
  assert.equal(s.pending!.actor, 'Coalition');
  s = choose(s, s.pending!.options[0].id);
  assert.equal(s.pending!.actor, 'Coalition');
  assert.deepEqual(
    s.pending!.options.map((o) => o.id).sort(),
    HOLDINGS.filter((h) => h.kind === 'mcs')
      .map((h) => h.id)
      .sort(),
  );
  s = choose(s, '@mcs:1');
  assert.equal(mcs(s, 'Coalition'), 6);
  assert.equal(s.pending, null);
});

test('#104 USSR advance precedes KPD action, coalition choice follows even when KPD skips', () => {
  let s = ready(104);
  s.tracks.ussr = 2;
  s = begin(s, 104);
  assert.equal(s.tracks.ussr, 3);
  assert.equal(s.pending!.actor, 'KPD');
  s = choose(s, 'stop');
  assert.equal(s.pending!.actor, 'Coalition');
  s = choose(s, 'stop');
  assert.equal(s.turn.actionsLeft, 2);
});

test('#105 follows annual order; each faction owns both return choices, no optional skip', () => {
  let s = ready(105, 'NSDAP');
  s.order = ['NSDAP', 'RC', 'KPD', 'Coalition'];
  const pawns = s.pieces.filter((p) => p.kind === 'mcs');
  pawns.forEach((p, i) => {
    p.location = `mat:${s.order[i % 4]}`;
  });
  const before = Object.fromEntries(FACTIONS.map((f) => [f, mcs(s, f)]));
  s = begin(s, 105);
  const seen: Faction[] = [];
  s = drain(s, (state) => {
    const f = state.pending!.actor;
    if (seen.at(-1) !== f) seen.push(f);
    assert.ok(!state.pending!.options.some((o) => o.id === 'stop'));
  });
  assert.deepEqual(seen, ['NSDAP', 'RC', 'KPD', 'Coalition']);
  for (const f of FACTIONS) assert.equal(mcs(s, f), before[f] - 1);
});

for (const recipient of [0, 1])
  test(`#106 atomic Sachsen replacement branch ${recipient} at full population`, () => {
    let s = ready(106);
    s.influence.Sachsen = { Coalition: SPACE.Sachsen.population, KPD: 0, RC: 0, NSDAP: 0 };
    s = drain(branch(begin(s, 106), recipient));
    assert.equal(s.influence.Sachsen.Coalition, SPACE.Sachsen.population - 1);
    assert.equal(s.influence.Sachsen[recipient === 0 ? 'RC' : 'KPD'], 1);
    assert.ok(s.turn.placed.includes('Sachsen'));
    assert.ok(s.turn.removed.includes('Sachsen'));
  });

test('#107 can spend seats and #108 removes strikes, preserving uprising', () => {
  let s = ready(107);
  s.seats = { owner: 'Coalition', available: true };
  s = choose(begin(s, 107), 'seats');
  assert.equal(s.seats.available, false);
  let cleanup = ready(108);
  const uprising = move(cleanup, 'strike', 'KPD', 'Hamburg');
  cleanup.pieces.find((p) => p.id === uprising)!.side = 'uprising';
  cleanup.momentum = 'RC';
  cleanup = drain(begin(cleanup, 108));
  assert.ok(onMap(cleanup.pieces.find((p) => p.id === uprising)!));
  assert.equal(
    cleanup.pieces.filter((p) => p.kind === 'strike' && p.side === 'strike' && onMap(p)).length,
    0,
  );
});

test('#109 protects mandatory/election cards, #110 never offers active faction as donor', () => {
  let s = ready(109);
  s.hands.KPD = [{ uid: 'protected-153', card: 153 }];
  s = choose(begin(s, 109), 'KPD');
  assert.equal(s.hands.KPD[0].card, 153);
  let transfer = begin(ready(110, 'RC'), 110);
  assert.deepEqual(
    transfer.pending!.options.map((o) => o.id).sort(),
    ['Coalition', 'KPD', 'NSDAP'].sort(),
  );
  transfer = drain(transfer, skip);
});

test('#111 draws for active faction and #112 reveals chosen hand without transfer', () => {
  let s = ready(111, 'RC');
  const expected = s.deck[0].uid,
    before = s.hands.RC.length;
  s = drain(
    begin(s, 111),
    (state) => state.pending!.options.find((o) => o.id === 'none')?.id ?? skip(state),
  );
  assert.ok(s.hands.RC.some((c) => c.uid === expected));
  assert.equal(s.hands.RC.length, before);
  let media = ready(112, 'NSDAP');
  const cards = structuredClone(media.hands.RC);
  media = choose(begin(media, 112), 'RC');
  assert.deepEqual(media.reveals.at(-1), { viewer: 'NSDAP', target: 'RC', cards });
  assert.deepEqual(media.hands.RC, cards);
});

for (const card of [83, 84, 85, 95, 98, 104, 105, 110])
  test(`#${card} every pending decision restores, undoes and redoes exactly`, () => {
    const game = new GameSession({ testCard: card, testPrerequisites: true });
    function command(c: Command) {
      const result = game.send(c);
      assert.ok(result.ok, result.ok ? '' : result.error);
    }
    command({ type: 'set-order', actor: 'Coalition', order: [...FACTIONS] });
    command({
      type: 'begin-turn',
      actor: 'Coalition',
      mode: 'event-first',
      cardUid: `card-${card}`,
    });
    let choices = 0;
    while (game.state.pending) {
      assert.ok(++choices < 100);
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
    assert.equal(game.state.turn.actionsLeft, 2);
  });

test('0.3 command histories remain importable after golden batch upgrade', () => {
  const game = new GameSession({ testCard: 79, testPrerequisites: true });
  game.send({ type: 'set-order', actor: 'Coalition', order: [...FACTIONS] });
  game.send({ type: 'begin-turn', actor: 'Coalition', mode: 'event-first', cardUid: 'card-79' });
  const save = JSON.parse(game.export());
  save.format = 'weimar-0.3.0';
  assert.deepEqual(GameSession.import(JSON.stringify(save)).state, game.state);
});
