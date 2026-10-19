import type {
  Expression,
  Json,
  OperationArguments,
  OperationTemplate,
  QueryArguments,
  QueryTemplate,
  Step,
} from './protocol.ts';
export type Input<T> = T | Expression;
type Args<M, K extends keyof M> = { [P in keyof M[K]]: Input<M[K][P]> };
export const lit = (value: unknown): Expression => ({ type: 'literal', value: value as Json });
export function expr(value: unknown): Expression {
  return value !== null && typeof value === 'object' && 'type' in value
    ? (value as Expression)
    : lit(value);
}
function mapArgs(args: object) {
  return Object.fromEntries(
    Object.entries(args)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, expr(v)]),
  );
}
export function op<K extends keyof OperationArguments>(
  kind: K,
  args: Args<OperationArguments, K>,
  saveAs?: string,
): Step {
  return {
    type: 'operation',
    operation: { kind, args: mapArgs(args) } as OperationTemplate,
    ...(saveAs ? { saveAs } : {}),
  };
}
export function q<K extends keyof QueryArguments>(
  kind: K,
  args: Args<QueryArguments, K>,
): Expression {
  return { type: 'query', query: { kind, args: mapArgs(args) } as QueryTemplate };
}
export const ref = (name: string, ...path: (string | number)[]): Expression => ({
  type: 'binding',
  name,
  path,
});
export const field = (value: Expression, ...path: (string | number)[]): Expression => ({
  type: 'field',
  value,
  path,
});
export const calc = (
  op: Extract<Expression, { type: 'calculate' }>['op'],
  ...args: unknown[]
): Expression => ({ type: 'calculate', op, args: args.map(expr) });
export const array = (...items: unknown[]): Expression => ({
  type: 'array',
  items: items.map(expr),
});
export const when = (condition: Expression, then: Step[], otherwise?: Step[]): Step => ({
  type: 'if',
  condition,
  then,
  ...(otherwise ? { otherwise } : {}),
});
export const actor: Expression = { type: 'context', key: 'initiator' };
let serial = 0;
export function branch(
  chooser: unknown,
  prompt: string,
  branches: { label: string; steps: Step[] }[],
): Step[] {
  const name = `branch${++serial}`,
    item = `selection${serial}`;
  return [
    {
      type: 'choose',
      actor: expr(chooser),
      prompt,
      options: lit(branches.map((b, i) => ({ id: String(i), label: b.label, value: i }))),
      min: lit(1),
      max: lit(1),
      bind: name,
      onEmpty: 'error',
    },
    {
      type: 'for-each',
      items: ref(name),
      item,
      body: branches.map((b, i) => when(calc('eq', ref(item), i), b.steps)),
    },
  ];
}
