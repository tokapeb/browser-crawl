// ─── Seeded PRNG: Mulberry32 ──────────────────────────────────────────────
// Fast, deterministic, 32-bit. No external dependencies.
// https://stackoverflow.com/a/47593016

export class PRNG {
  private state: number;

  constructor(seed: string) {
    this.state = this.hashToUint32(seed);
  }

  // djb2 string → 32-bit uint
  private hashToUint32(str: string): number {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i); // hash * 33 xor char
    }
    return h >>> 0; // force unsigned 32-bit
  }

  /** Returns a float in [0, 1) */
  random(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0;
    return ((t ^ (t << 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /** Returns a random string seed (32 hex chars, 128 bits) */
  static generateSeed(): string {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const bytes = new Uint32Array(4);
      crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(8, '0')).join('');
    }
    // Fallback for non-Node/bundler environments
    return Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 0x100000000)
        .toString(16)
        .padStart(8, '0'),
    ).join('');
  }

  /** Converts any seed input to a normalized string */
  static normalizeSeed(seed?: string | number): string {
    if (seed === undefined) return PRNG.generateSeed();
    return String(seed);
  }
}
