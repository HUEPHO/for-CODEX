import type { OperationArguments } from './protocol.ts';
import type { Faction } from '../types.ts';
type Job<K extends keyof OperationArguments> = {
  kind: K;
  args: OperationArguments[K];
  remaining: number;
  used: string[];
  returnDecider: Faction;
  origins?: Record<string, string>;
};
export type DomainJob =
  | Job<'influence.allocate'>
  | Job<'pieces.deploy'>
  | Job<'pieces.return'>
  | Job<'pieces.reveal'>
  | Job<'leverage.place'>
  | Job<'leverage.replace'>
  | Job<'strike.place'>
  | Job<'board.remove'>
  | Job<'track.choose'>
  | Job<'action.grant'>;
