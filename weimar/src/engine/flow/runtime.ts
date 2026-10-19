import { FACTIONS } from '../types.ts';
import type { Faction } from '../types.ts';
import { OPERATION_CAPABILITY, QUERY_KINDS } from './protocol.ts';
import type {
  Expression,
  FlowContext,
  FlowState,
  Host,
  Json,
  Option,
  Program,
  Receipt,
  Step,
} from './protocol.ts';

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function isJson(value: unknown, depth = 0): value is Json {
  if (depth > 80) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((v) => isJson(v, depth + 1));
  return (
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.entries(value).every(
      ([key, v]) =>
        !['__proto__', 'prototype', 'constructor'].includes(key) && isJson(v, depth + 1),
    )
  );
}
function name(value: string) {
  check(
    /^[A-Za-z][A-Za-z0-9_]*$/.test(value) &&
      !['__proto__', 'constructor', 'prototype'].includes(value),
    'Invalid binding name',
  );
}
function number(value: Json): number {
  check(typeof value === 'number' && Number.isFinite(value), 'Expected finite number');
  return value;
}
function integer(value: Json): number {
  const n = number(value);
  check(Number.isInteger(n) && n >= 0 && n <= 1000, 'Count must be an integer in 0..1000');
  return n;
}
function bool(value: Json): boolean {
  check(typeof value === 'boolean', 'Expected boolean condition');
  return value;
}

/** Preflight ALL branches, including optional ones, before any operation runs.
 * Host handlers must still validate resolved arguments and game legality. */
export function validateProgram(program: Program, host: Host): void {
  check(isJson(program), 'Program must contain only JSON data');
  check(
    program.version === 1 && !!program.id && Array.isArray(program.steps),
    'Unsupported program',
  );
  let nodes = 0;
  function walk(value: unknown, depth = 0) {
    check(depth <= 64 && ++nodes <= 20000, 'Program exceeds structural limits');
    if (Array.isArray(value)) {
      for (const child of value) walk(child, depth + 1);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    if (obj.type === 'operation') {
      const operation = obj.operation as { kind: keyof typeof OPERATION_CAPABILITY };
      check(operation && Object.hasOwn(OPERATION_CAPABILITY, operation.kind), 'Unknown operation');
      check(host.operations.includes(operation.kind), `Unsupported operation: ${operation.kind}`);
    }
    if (obj.type === 'query') {
      const query = obj.query as { kind: (typeof QUERY_KINDS)[number] };
      check(query && QUERY_KINDS.includes(query.kind), 'Unknown query');
      check(host.queries.includes(query.kind), `Unsupported query: ${query.kind}`);
    }
    for (const child of Object.values(obj)) walk(child, depth + 1);
  }
  walk(program.steps);
}

function readBinding(state: FlowState, key: string): Json {
  name(key);
  for (let i = state.frames.length - 1; i >= 0; i--) {
    const frame = state.frames[i];
    if (frame.type === 'block' && Object.hasOwn(frame.locals, key)) return frame.locals[key];
  }
  throw new Error(`Unbound value: ${key}`);
}
function put(state: FlowState, key: string, value: Json) {
  name(key);
  const frame = state.frames.at(-1);
  check(frame?.type === 'block', 'Missing continuation frame');
  frame.locals[key] = structuredClone(value);
}
function args(values: object, state: FlowState, host: Host): Record<string, Json> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, evaluate(v, state, host)]));
}
function evaluate(expr: Expression, state: FlowState, host: Host): Json {
  switch (expr.type) {
    case 'array':
      return expr.items.map((x) => evaluate(x, state, host));
    case 'options': {
      const values = evaluate(expr.values, state, host);
      check(Array.isArray(values), 'Expected options collection');
      return values.map((value) => {
        check(typeof value === 'string' || typeof value === 'number', 'Option ID must be scalar');
        return { id: String(value), label: String(value), value };
      });
    }
    case 'field': {
      let value = evaluate(expr.value, state, host);
      for (const key of expr.path) {
        check(
          value !== null && typeof value === 'object' && Object.hasOwn(value, key),
          'Missing result field',
        );
        value = (value as Record<string | number, Json>)[key];
      }
      return structuredClone(value);
    }
    case 'literal':
      return structuredClone(expr.value);
    case 'context':
      return state.context[expr.key];
    case 'binding': {
      let value = readBinding(state, expr.name);
      for (const key of expr.path ?? []) {
        check(
          value !== null && typeof value === 'object' && Object.hasOwn(value, key),
          'Missing receipt field',
        );
        value = (value as Record<string | number, Json>)[key];
      }
      return structuredClone(value);
    }
    case 'query': {
      check(host.queries.includes(expr.query.kind), `Unsupported query: ${expr.query.kind}`);
      const value = host.query(
        { kind: expr.query.kind, args: args(expr.query.args, state, host) },
        structuredClone(state.context),
      );
      check(isJson(value), 'Query must return JSON data');
      return structuredClone(value);
    }
    case 'calculate': {
      // Boolean expressions short circuit: a guarded missing binding is not read.
      if (expr.op === 'and') return expr.args.every((a) => bool(evaluate(a, state, host)));
      if (expr.op === 'or') return expr.args.some((a) => bool(evaluate(a, state, host)));
      const values = expr.args.map((a) => evaluate(a, state, host));
      const unary = ['not', 'count', 'unique'].includes(expr.op);
      check(values.length === (unary ? 1 : 2), 'Invalid expression arity');
      if (expr.op === 'union') {
        check(values.every(Array.isArray), 'Union needs collections');
        const members = (values as Json[][]).flat();
        check(
          members.every((v) => typeof v === 'string' || typeof v === 'number'),
          'Union needs scalar IDs',
        );
        return [...new Set(members)];
      }
      if (expr.op === 'not') return !bool(values[0]);
      if (expr.op === 'count' || expr.op === 'unique') {
        check(Array.isArray(values[0]), 'Expected a collection');
        if (expr.op === 'count') return values[0].length;
        check(
          values[0].every((v) => typeof v === 'string' || typeof v === 'number'),
          'Unique needs scalar IDs',
        );
        return [...new Set(values[0])];
      }
      if (expr.op === 'eq') {
        check(
          values.every((v) => v === null || typeof v !== 'object'),
          'Equality needs scalar values',
        );
        return values[0] === values[1];
      }
      const a = number(values[0]),
        b = number(values[1]);
      switch (expr.op) {
        case 'add':
          return number(a + b);
        case 'subtract':
          return number(a - b);
        case 'multiply':
          return number(a * b);
        case 'divide-ceil':
          check(b !== 0, 'Division by zero');
          return number(Math.ceil(a / b));
        case 'min':
          return Math.min(a, b);
        case 'max':
          return Math.max(a, b);
        case 'gt':
          return a > b;
        case 'gte':
          return a >= b;
        case 'lt':
          return a < b;
        case 'lte':
          return a <= b;
        default:
          throw new Error('Unknown calculation');
      }
    }
    default:
      throw new Error('Unknown expression');
  }
}
function push(state: FlowState, steps: Step[], locals: Record<string, Json> = {}) {
  check(state.frames.length < 64, 'Continuation nesting limit reached');
  state.frames.push({ type: 'block', steps: structuredClone(steps), next: 0, locals });
}
function drive(state: FlowState, host: Host): FlowState {
  check(state.version === 1, 'Unsupported flow state');
  let budget = 10000;
  state.status = 'running';
  while (state.frames.length && !state.wait) {
    check(--budget > 0, 'Flow exceeded execution budget');
    const frame = state.frames.at(-1)!;
    if (frame.type === 'loop') {
      if (frame.next >= frame.values.length) {
        state.frames.pop();
        continue;
      }
      push(state, frame.body, { [frame.bind]: frame.values[frame.next++] });
      continue;
    }
    if (frame.next >= frame.steps.length) {
      if (state.frames.length === 1) state.result = structuredClone(frame.locals);
      state.frames.pop();
      continue;
    }
    const step = frame.steps[frame.next++];
    switch (step.type) {
      case 'sequence':
        push(state, step.steps);
        break;
      case 'let':
        put(state, step.name, evaluate(step.value, state, host));
        break;
      case 'if':
        push(
          state,
          bool(evaluate(step.condition, state, host)) ? step.then : (step.otherwise ?? []),
        );
        break;
      case 'repeat': {
        name(step.index);
        const count = integer(evaluate(step.count, state, host));
        state.frames.push({
          type: 'loop',
          values: Array.from({ length: count }, (_, i) => i),
          next: 0,
          bind: step.index,
          body: step.body,
        });
        break;
      }
      case 'for-each': {
        name(step.item);
        const values = evaluate(step.items, state, host);
        check(Array.isArray(values) && values.length <= 1000, 'Invalid iteration collection');
        state.frames.push({
          type: 'loop',
          values: structuredClone(values),
          next: 0,
          bind: step.item,
          body: step.body,
        });
        break;
      }
      case 'choose': {
        name(step.bind);
        const actor = evaluate(step.actor, state, host);
        check(FACTIONS.includes(actor as Faction), 'Invalid decision owner');
        const options = evaluate(step.options, state, host);
        check(Array.isArray(options), 'Expected choice options');
        const ids = new Set<string>();
        for (const option of options) {
          check(
            option && typeof option === 'object' && !Array.isArray(option),
            'Invalid choice option',
          );
          check(
            typeof option.id === 'string' &&
              option.id.length > 0 &&
              typeof option.label === 'string' &&
              Object.hasOwn(option, 'value'),
            'Invalid choice option',
          );
          check(!ids.has(option.id), 'Duplicate choice option');
          ids.add(option.id);
        }
        const min = integer(evaluate(step.min, state, host)),
          max = integer(evaluate(step.max, state, host));
        check(min <= max, 'Invalid choice bounds');
        if (options.length === 0) {
          check(step.onEmpty === 'skip', 'Required choice has no legal target');
          put(state, step.bind, []);
          break;
        }
        check(min <= options.length, 'Insufficient legal targets for mandatory choice');
        if (max === 0) {
          put(state, step.bind, []);
          break;
        }
        state.wait = {
          type: 'choice',
          id: state.nextRequest++,
          actor: actor as Faction,
          prompt: step.prompt,
          options: options as unknown as Option[],
          min,
          max: Math.min(max, options.length),
          bind: step.bind,
        };
        break;
      }
      case 'operation':
        check(
          host.operations.includes(step.operation.kind),
          `Unsupported operation: ${step.operation.kind}`,
        );
        state.wait = {
          type: 'operation',
          id: state.nextRequest++,
          request: { kind: step.operation.kind, args: args(step.operation.args, state, host) },
          ...(step.saveAs ? { saveAs: step.saveAs } : {}),
        };
        break;
      default:
        throw new Error('Unknown flow step');
    }
  }
  state.status = state.wait ? 'waiting' : 'complete';
  return state;
}

/** All entry points clone inputs. Failure cannot partially advance a continuation.
 * They never mutate the game; the existing dispatch boundary owns game + flow. */
export function startFlow(program: Program, context: FlowContext, host: Host): FlowState {
  validateProgram(program, host);
  check(isJson(context), 'Context must be JSON');
  const state: FlowState = {
    version: 1,
    programId: program.id,
    context: structuredClone(context),
    frames: [],
    wait: null,
    nextRequest: 1,
    status: 'running',
    result: {},
  };
  push(state, program.steps);
  return drive(state, host);
}
export function chooseFlow(
  input: FlowState,
  actor: Faction,
  requestId: number,
  ids: string[],
  host: Host,
): FlowState {
  const wait = input.wait;
  check(wait?.type === 'choice' && wait.id === requestId, 'Stale or missing choice');
  check(actor === wait.actor, 'Choice belongs to another faction');
  check(
    Array.isArray(ids) &&
      new Set(ids).size === ids.length &&
      ids.length >= wait.min &&
      ids.length <= wait.max,
    'Invalid selection count',
  );
  const values = ids.map((id) => {
    const option = wait.options.find((o) => o.id === id);
    check(option, 'Unknown selection');
    return option.value;
  });
  const state = structuredClone(input);
  put(state, wait.bind, values);
  state.wait = null;
  return drive(state, host);
}
/** Called only by the authoritative host, never accepted as a client command.
 * Consequences run to completion before the original sequence resumes. */
export function completeOperation(
  input: FlowState,
  requestId: number,
  receipt: Receipt,
  host: Host,
  consequences?: Program,
): FlowState {
  const wait = input.wait;
  check(wait?.type === 'operation' && wait.id === requestId, 'Stale or missing operation');
  check(isJson(receipt), 'Receipt must be JSON');
  if (consequences) validateProgram(consequences, host);
  const state = structuredClone(input);
  if (wait.saveAs) put(state, wait.saveAs, receipt as Json);
  state.wait = null;
  if (consequences) push(state, consequences.steps);
  return drive(state, host);
}
