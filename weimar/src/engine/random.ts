// All randomness lives in state. Replaying commands reproduces shuffles and dice.
export function randomInt(state: { rng: number }, upper: number): number {
  if (!Number.isInteger(upper) || upper < 1) throw new Error('随机范围无效');
  state.rng = (Math.imul(1664525, state.rng) + 1013904223) >>> 0;
  return Math.floor((state.rng / 4294967296) * upper);
}
export function shuffle<T>(state: { rng: number }, values: T[]): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(state, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
