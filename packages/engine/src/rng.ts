/* A small seeded PRNG (mulberry32). The state is a single uint32 that lives
   on the GameState, so a game is a pure function of its seed and its actions
   and any position can be replayed exactly. */

export function nextU32(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const out = (t ^ (t >>> 14)) >>> 0;
  return [out, a];
}

export class Rng {
  constructor(public state: number) {
    this.state = state >>> 0;
  }
  /** Uniform in [0, 1). */
  next(): number {
    const [out, next] = nextU32(this.state);
    this.state = next;
    return out / 4294967296;
  }
  /** Uniform integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  shuffle<T>(a: T[]): T[] {
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  pick<T>(a: readonly T[]): T {
    return a[this.int(a.length)];
  }
}

export function seedFromString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}
