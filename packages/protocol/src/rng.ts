/**
 * Deterministic PRNG. Every entrant of a match receives the same seed from the platform, so any
 * randomness in a game is identical for all players (a legal requirement for skill contests —
 * see docs/legal/jurisdiction-analysis.md, design mandates).
 */
export class SeededRandom {
  private a: number; private b: number; private c: number; private d: number;
  constructor(seed: string) {
    // cyrb128 hash -> sfc32 state
    let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < seed.length; i++) {
      k = seed.charCodeAt(i);
      h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
      h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
      h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
      h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    this.a = (h1 ^ h2 ^ h3 ^ h4) >>> 0; this.b = h2 >>> 0; this.c = h3 >>> 0; this.d = h4 >>> 0;
    for (let i = 0; i < 12; i++) this.next();
  }
  /** Float in [0,1) */
  next(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  int(minInclusive: number, maxInclusive: number): number {
    return minInclusive + Math.floor(this.next() * (maxInclusive - minInclusive + 1));
  }
  pick<T>(arr: readonly T[]): T { return arr[this.int(0, arr.length - 1)]; }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) { const j = this.int(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
}

/** FNV-1a 32-bit hash of a JSON-serialisable input log, used as a cheap replay fingerprint. */
export function hashInputLog(log: unknown[]): string {
  const s = JSON.stringify(log);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
