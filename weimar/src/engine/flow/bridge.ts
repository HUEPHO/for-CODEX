import type { Effect, GameState } from '../types.ts';
import { ensure } from '../rules.ts';
import { chooseFlow, completeOperation, startFlow } from './runtime.ts';
import { commitDomainJob, executeOperation, gameHost, resolveDomainJob } from './game-host.ts';

function drain(s: GameState) {
  const flow = s.flow;
  ensure(flow, '缺少事件流程');
  if (flow.status === 'complete' || s.phase === 'finished') {
    delete s.flow;
    delete s.flowReceipt;
    return;
  }
  const wait = flow.wait;
  ensure(wait, '流程没有续点');
  if (wait.type === 'choice') {
    // Card templates use single branch selection. Multi-target allocation is a
    // domain job, avoiding exponential lists of every possible subset in the UI.
    ensure(wait.max === 1, '此界面仅接受单项流程选择');
    s.pending = {
      actor: wait.actor,
      prompt: wait.prompt,
      options: [
        ...wait.options.map((o) => ({
          id: `flow:${wait.id}:${o.id}`,
          label: o.label,
          effects: [
            { type: 'flow-choice' as const, requestId: wait.id, actor: wait.actor, ids: [o.id] },
          ],
        })),
        ...(wait.min === 0
          ? [
              {
                id: `flow:${wait.id}:skip`,
                label: '不执行',
                effects: [
                  { type: 'flow-choice' as const, requestId: wait.id, actor: wait.actor, ids: [] },
                ],
              },
            ]
          : []),
      ],
    };
  } else {
    s.effects.unshift({ type: 'flow-complete', requestId: wait.id });
    executeOperation(s, wait.request);
  }
}
export function resolveFlowEffect(s: GameState, e: Effect): boolean {
  switch (e.type) {
    case 'flow-start':
      ensure(!s.flow, '不能同时开始两个根事件');
      s.flow = startFlow(e.program, e.context, gameHost(s));
      drain(s);
      return true;
    case 'flow-choice':
      ensure(s.flow, '缺少事件流程');
      s.flow = chooseFlow(s.flow, e.actor, e.requestId, e.ids, gameHost(s));
      drain(s);
      return true;
    case 'flow-complete':
      ensure(s.flow, '缺少事件流程');
      if (s.phase === 'finished') {
        delete s.flow;
        delete s.flowReceipt;
        return true;
      }
      s.flow = completeOperation(s.flow, e.requestId, s.flowReceipt ?? {}, gameHost(s));
      delete s.flowReceipt;
      drain(s);
      return true;
    case 'domain-job':
      resolveDomainJob(s, e.job);
      return true;
    case 'domain-commit':
      commitDomainJob(s, e.job, e.choice);
      return true;
    case 'grant-end':
      delete s.grantContext;
      return true;
    default:
      return false;
  }
}
