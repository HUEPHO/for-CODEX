import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CARD_SURVEY, CAPABILITIES, surveyReport } from '../src/data/card-survey.ts';
import { CARDS } from '../src/data/cards.ts';
import {
  startFlow,
  chooseFlow,
  completeOperation,
  OPERATION_CAPABILITY,
  QUERY_KINDS,
} from '../src/engine/flow/index.ts';
import type {
  FlowContext,
  FlowState,
  Host,
  Json,
  Expression,
  Step,
  Program,
  Receipt,
} from '../src/engine/flow/index.ts';

const lit = (value: Json): Expression => ({ type: 'literal', value });
const ref = (name: string, ...path: (string | number)[]): Expression => ({
  type: 'binding',
  name,
  path,
});
const ctx = (key: Extract<Expression, { type: 'context' }>['key']): Expression => ({
  type: 'context',
  key,
});
const calc = (
  op: Extract<Expression, { type: 'calculate' }>['op'],
  ...args: Expression[]
): Expression => ({ type: 'calculate', op, args });
const context: FlowContext = {
  origin: 'card',
  source: { faceId: 30, uid: 'physical-copy-30' },
  initiator: 'KPD',
  turnOwner: 'KPD',
  beneficiary: 'Coalition',
  returnDecider: 'KPD',
};
const host: Host = {
  operations: Object.keys(OPERATION_CAPABILITY) as Host['operations'],
  queries: QUERY_KINDS,
  query() {
    throw new Error('No query fixture');
  },
};
const program = (steps: Step[]): Program => ({ version: 1, id: 'survey-pattern-fixture', steps });
const momentum = (faction: Expression): Step => ({
  type: 'operation',
  operation: { kind: 'momentum.set', args: { faction } },
});
const selection = (actor: Expression = lit('RC'), min = 0, max = 2): Step => ({
  type: 'choose',
  actor,
  prompt: '选择地区',
  options: lit([
    { id: 'berlin', label: '柏林', value: 'Berlin' },
    { id: 'baden', label: '巴登', value: 'Baden' },
  ]),
  min: lit(min),
  max: lit(max),
  bind: 'selected',
  onEmpty: 'error',
});
function request(state: FlowState, kind: string) {
  assert.equal(state.wait?.type, 'operation');
  if (state.wait?.type !== 'operation') throw new Error('Expected operation');
  assert.equal(state.wait.request.kind, kind);
  return state.wait.request.args;
}
function finish(state: FlowState, receipt: Receipt = {}, adapter = host, child?: Program) {
  return completeOperation(state, state.wait!.id, receipt, adapter, child);
}
const restore = <T>(value: T): T => JSON.parse(JSON.stringify(value));

test('scope inventory covers every imported face, with sources and valid mechanisms', () => {
  assert.deepEqual(
    CARD_SURVEY.map((c) => c.faceId),
    CARDS.map((c) => c.id),
  );
  assert.equal(new Set(CARD_SURVEY.map((c) => c.faceId)).size, 154);
  for (const card of CARD_SURVEY) {
    assert.ok(card.name && card.summary);
    assert.equal(card.scopeStatus, 'surveyed');
    assert.ok(card.capabilities.length);
    assert.equal(new Set(card.capabilities).size, card.capabilities.length);
    for (const tag of card.capabilities)
      assert.ok(Object.hasOwn(CAPABILITIES, tag), `${card.faceId}: ${tag}`);
    assert.ok(
      existsSync(new URL(`../public${card.sourceImage}`, import.meta.url)),
      card.sourceImage,
    );
    if (card.templateOf) assert.ok(CARD_SURVEY.some((c) => c.faceId === card.templateOf));
  }
  assert.equal(surveyReport().events, 151);
  assert.equal(surveyReport().electionFaces, 3);
  assert.equal(CARD_SURVEY.find((c) => c.faceId === 153)?.printedNumber, 154);
  assert.equal(CARD_SURVEY.find((c) => c.faceId === 154)?.printedNumber, 156);
  // The execution registry is separate from surveying: this batch adds #1–151.
  assert.equal(CARDS.filter((c) => !c.election && c.status === 'implemented').length, 151);
});

test('actual movement receipt controls cross-faction repetition, not requested amount (#30 pattern)', () => {
  let state = startFlow(
    program([
      {
        type: 'operation',
        operation: {
          kind: 'track.change',
          args: { track: lit('economy'), mode: lit('toward-stability'), amount: lit(3) },
        },
        saveAs: 'movement',
      },
      {
        type: 'for-each',
        items: lit(['RC', 'NSDAP']),
        item: 'recipient',
        body: [
          {
            type: 'repeat',
            count: ref('movement', 'actual'),
            index: 'i',
            body: [
              {
                type: 'operation',
                operation: {
                  kind: 'influence.change',
                  args: { faction: ref('recipient'), space: lit('Berlin'), amount: lit(1) },
                },
              },
            ],
          },
        ],
      },
    ]),
    context,
    host,
  );
  assert.equal(request(state, 'track.change').amount, 3);
  state = finish(state, { actual: 1 });
  assert.equal(request(state, 'influence.change').faction, 'RC');
  state = finish(restore(state));
  assert.equal(request(state, 'influence.change').faction, 'NSDAP');
  state = finish(state);
  assert.equal(state.status, 'complete');
  assert.equal(state.context.turnOwner, 'KPD');
  assert.equal(state.context.returnDecider, 'KPD');
  assert.deepEqual(state.result.movement, { actual: 1 });
});

test('choice validates owner, stale IDs, distinct targets and bounds without advancing input', () => {
  const state = startFlow(program([selection()]), context, host),
    before = restore(state);
  assert.throws(() => chooseFlow(state, 'KPD', 1, ['berlin'], host), /another faction/);
  assert.throws(() => chooseFlow(state, 'RC', 999, ['berlin'], host), /Stale/);
  assert.throws(() => chooseFlow(state, 'RC', 1, ['berlin', 'berlin'], host), /selection count/);
  assert.throws(() => chooseFlow(state, 'RC', 1, ['missing'], host), /Unknown selection/);
  assert.deepEqual(state, before);
  const selected = chooseFlow(restore(state), 'RC', 1, ['baden', 'berlin'], host);
  assert.equal(selected.status, 'complete');
  assert.deepEqual(selected.result.selected, ['Baden', 'Berlin']);
  assert.deepEqual(chooseFlow(state, 'RC', 1, [], host).result.selected, []);
  const mandatory = startFlow(program([selection(lit('RC'), 1, 1)]), context, host);
  assert.throws(() => chooseFlow(mandatory, 'RC', 1, [], host), /selection count/);
});

test('child consequences fully settle through another faction before parent resumes', () => {
  let state = startFlow(program([momentum(lit('RC')), momentum(lit('KPD'))]), context, host);
  const child = program([selection(lit('NSDAP'), 1, 1), momentum(lit('Coalition'))]);
  state = finish(state, {}, host, child);
  assert.equal(state.wait?.type, 'choice');
  assert.equal(state.wait?.id, 2);
  state = chooseFlow(restore(state), 'NSDAP', 2, ['berlin'], host);
  assert.equal(request(state, 'momentum.set').faction, 'Coalition');
  state = finish(state);
  assert.equal(request(state, 'momentum.set').faction, 'KPD');
  assert.equal(finish(state).status, 'complete');
});

test('repetition takes a count snapshot; queries inside each iteration use fresh state', () => {
  let current = 2;
  const adapter: Host = {
    ...host,
    query() {
      return current;
    },
  };
  const track: Expression = {
    type: 'query',
    query: { kind: 'track.value', args: { track: lit('reaction') } },
  };
  let state = startFlow(
    program([
      {
        type: 'repeat',
        count: track,
        index: 'i',
        body: [
          {
            type: 'operation',
            operation: {
              kind: 'track.change',
              args: { track: lit('unity'), mode: lit('set'), amount: track },
            },
          },
        ],
      },
    ]),
    context,
    adapter,
  );
  assert.equal(request(state, 'track.change').amount, 2);
  current = 7;
  state = finish(state, {}, adapter);
  assert.equal(request(state, 'track.change').amount, 7);
  state = finish(state, {}, adapter);
  assert.equal(state.status, 'complete');
});

test('iteration snapshots annual order even when the host changes its array', () => {
  const order: Json[] = ['RC', 'Coalition'];
  const adapter: Host = {
    ...host,
    query() {
      return order;
    },
  };
  let state = startFlow(
    program([
      {
        type: 'for-each',
        items: { type: 'query', query: { kind: 'order.current', args: {} } },
        item: 'party',
        body: [momentum(ref('party'))],
      },
    ]),
    context,
    adapter,
  );
  assert.equal(request(state, 'momentum.set').faction, 'RC');
  order.splice(0, 2, 'KPD');
  state = finish(state, {}, adapter);
  assert.equal(request(state, 'momentum.set').faction, 'Coalition');
  assert.equal(finish(state, {}, adapter).status, 'complete');
});

test('affected spaces deduplicate from actual receipts (#137 pattern)', () => {
  let state = startFlow(
    program([
      {
        type: 'operation',
        operation: {
          kind: 'piece.move',
          args: { pieceId: lit('sa-1'), destination: lit('reserve') },
        },
        saveAs: 'removal',
      },
      {
        type: 'for-each',
        items: calc('unique', ref('removal', 'spaces')),
        item: 'space',
        body: [
          {
            type: 'operation',
            operation: {
              kind: 'influence.change',
              args: { faction: ctx('beneficiary'), space: ref('space'), amount: lit(1) },
            },
          },
        ],
      },
    ]),
    context,
    host,
  );
  state = finish(state, { actual: 3, spaces: ['Berlin', 'Berlin', 'Baden'] });
  assert.equal(request(state, 'influence.change').space, 'Berlin');
  state = finish(state);
  assert.equal(request(state, 'influence.change').space, 'Baden');
  assert.equal(finish(state).status, 'complete');
});

test('union counts a region only once when multiple qualifications match (#114 pattern)', () => {
  const state = startFlow(
    program([
      {
        type: 'let',
        name: 'count',
        value: calc('count', calc('union', lit(['Berlin', 'Baden']), lit(['Baden', 'Sachsen']))),
      },
    ]),
    context,
    host,
  );
  assert.equal(state.result.count, 3);
});

test('missing domain handlers and queries fail preflight even in an untaken branch', () => {
  const adapter: Host = {
    operations: ['momentum.set'],
    queries: [],
    query() {
      assert.fail('Must not read state');
    },
  };
  assert.throws(
    () =>
      startFlow(
        program([
          momentum(lit('RC')),
          {
            type: 'if',
            condition: lit(false),
            then: [
              {
                type: 'operation',
                operation: { kind: 'election.special', args: { policy: lit('referendum') } },
              },
            ],
          },
        ]),
        context,
        adapter,
      ),
    /Unsupported operation: election.special/,
  );
  assert.throws(
    () =>
      startFlow(
        program([
          momentum(lit('RC')),
          {
            type: 'if',
            condition: lit(false),
            then: [
              {
                type: 'let',
                name: 'pv',
                value: {
                  type: 'query',
                  query: { kind: 'pv.current', args: { faction: lit('RC') } },
                },
              },
            ],
          },
        ]),
        context,
        adapter,
      ),
    /Unsupported query: pv.current/,
  );
});

test('empty choices require an explicit policy; insufficient mandatory targets are not skipped', () => {
  const base = selection();
  if (base.type !== 'choose') throw new Error('Expected choice');
  assert.throws(
    () => startFlow(program([{ ...base, options: lit([]) }]), context, host),
    /no legal target/,
  );
  assert.equal(
    startFlow(program([{ ...base, options: lit([]), onEmpty: 'skip' }]), context, host).status,
    'complete',
  );
  assert.throws(
    () => startFlow(program([{ ...base, min: lit(3), max: lit(3) }]), context, host),
    /Insufficient/,
  );
  assert.equal(startFlow(program([{ ...base, max: lit(0) }]), context, host).status, 'complete');
});

test('RNG stays with the host; a recorded die result resumes identically after JSON save', () => {
  const state = startFlow(
    program([
      {
        type: 'operation',
        operation: { kind: 'random.roll', args: { sides: lit(6), count: lit(1) } },
        saveAs: 'dice',
      },
      { type: 'let', name: 'amount', value: calc('divide-ceil', ref('dice', 'rolls', 0), lit(2)) },
    ]),
    context,
    host,
  );
  const result = finish(state, { rolls: [5] });
  assert.deepEqual(finish(restore(state), { rolls: [5] }), result);
  assert.equal(result.result.amount, 3);
});

test('receipts reject non-JSON results and stale acknowledgement without consuming the request', () => {
  const state = startFlow(program([momentum(lit('RC'))]), context, host),
    before = restore(state);
  assert.throws(() => completeOperation(state, 99, {}, host), /Stale/);
  assert.throws(() => finish(state, { actual: NaN }), /JSON/);
  assert.throws(() => finish(state, { outcome: undefined } as unknown as Receipt), /JSON/);
  assert.deepEqual(state, before);
});

test('guards short circuit; numeric counts cannot silently become negative or fractional', () => {
  const state = startFlow(
    program([
      {
        type: 'if',
        condition: calc('and', lit(false), ref('notBound')),
        then: [momentum(lit('RC'))],
        otherwise: [momentum(lit('KPD'))],
      },
    ]),
    context,
    host,
  );
  assert.equal(request(state, 'momentum.set').faction, 'KPD');
  for (const count of [-1, 0.5, 1001]) {
    assert.throws(
      () =>
        startFlow(
          program([{ type: 'repeat', count: lit(count), index: 'i', body: [] }]),
          context,
          host,
        ),
      /integer/,
    );
  }
  assert.throws(
    () =>
      startFlow(
        program([{ type: 'let', name: 'bad', value: calc('divide-ceil', lit(1), lit(0)) }]),
        context,
        host,
      ),
    /zero/,
  );
});

test('continuation failure leaves original state intact, including request IDs and bindings', () => {
  const state = startFlow(
      program([
        momentum(lit('RC')),
        { type: 'let', name: 'amount', value: ref('missing', 'actual') },
      ]),
      context,
      host,
    ),
    before = restore(state);
  assert.throws(() => finish(state), /Unbound/);
  assert.deepEqual(state, before);
});

test('lexical loop bindings and child selection do not overwrite parent context or locals', () => {
  const state = startFlow(
    program([
      { type: 'let', name: 'party', value: lit('KPD') },
      {
        type: 'for-each',
        items: lit(['RC', 'NSDAP']),
        item: 'party',
        body: [{ type: 'let', name: 'onlyInside', value: ref('party') }],
      },
      { type: 'let', name: 'after', value: ref('party') },
    ]),
    context,
    host,
  );
  assert.deepEqual(state.result, { party: 'KPD', after: 'KPD' });
  assert.deepEqual(state.context, context);
});
