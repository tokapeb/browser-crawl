import { describe, it, expect } from 'vitest';
import { PRESETS, DEFAULT_PRESET, resolveConfig } from '../src/presets';
import { generate } from '../src/index';
import type { DungeonConfig, DungeonResult, Dir, Edge, Room, PresetName } from '../src/index';
import { PRNG } from '../src/util/prng';
import { DIRS, DIR_OFFSETS, opposite, cellKey, dirBetween } from '../src/util/grid';
import { EdgeSet, bfsHopDistances } from '../src/util/graph';

const PRESET_NAMES: PresetName[] = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// ─── Invariant helpers (independent re-implementations for cross-checking) ─

function makeConfig(
  overrides: Partial<DungeonConfig> & Pick<DungeonConfig, 'preset'>,
): DungeonConfig {
  return { seed: 'test-seed-123', ...overrides };
}

/** Independent BFS hop distances from room 0 (entrance). */
function hopDistances(result: DungeonResult): Map<number, number> {
  const adj = new Map<number, number[]>();
  for (const r of result.rooms) adj.set(r.id, []);
  for (const e of result.edges) {
    adj.get(e.from)!.push(e.to);
    adj.get(e.to)!.push(e.from);
  }
  const dist = new Map<number, number>([[0, 0]]);
  const queue = [0];
  while (queue.length) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    for (const nxt of adj.get(cur)!) {
      if (!dist.has(nxt)) {
        dist.set(nxt, d + 1);
        queue.push(nxt);
      }
    }
  }
  return dist;
}

function degrees(result: DungeonResult): Map<number, number> {
  const deg = new Map<number, number>();
  for (const r of result.rooms) deg.set(r.id, 0);
  for (const e of result.edges) {
    deg.set(e.from, deg.get(e.from)! + 1);
    deg.set(e.to, deg.get(e.to)! + 1);
  }
  return deg;
}

/** Asserts every structural invariant (docs/DESIGN.md) of a generated dungeon. */
function assertInvariants(result: DungeonResult): void {
  const W = result.gridsize[0];
  const H = result.gridsize[1];
  const N = result.baseRoomNumber;
  const Ereq = result.baseCorridorNumber;

  // ── Rooms: count, bounds, uniqueness, sequential ids ──
  expect(result.rooms).toHaveLength(N);
  const seen = new Set<string>();
  for (const r of result.rooms) {
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x).toBeLessThan(W);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeLessThan(H);
    const k = `${r.x},${r.y}`;
    expect(seen.has(k)).toBe(false);
    seen.add(k);
  }
  const ids = result.rooms.map((r) => r.id).sort((a, b) => a - b);
  expect(ids).toEqual(Array.from({ length: N }, (_, i) => i));

  // ── Edge count: N − 1 ≤ E ≤ min(requested, 2N) ──
  expect(result.edges.length).toBeGreaterThanOrEqual(N - 1);
  expect(result.edges.length).toBeLessThanOrEqual(Math.min(Ereq, 2 * N));

  // ── Per-edge geometry + weight ──
  const roomById = new Map(result.rooms.map((r) => [r.id, r]));
  for (const e of result.edges) {
    expect(Number.isInteger(e.weight)).toBe(true);
    expect(e.weight).toBeGreaterThanOrEqual(1);
    expect(e.weight).toBeLessThanOrEqual(8);
    const a = roomById.get(e.from)!;
    const b = roomById.get(e.to)!;
    // grid-adjacent (Δx + Δy = 1)
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
    // dirFrom matches geometry, dirTo is the opposite
    expect(dirBetween(a.x, a.y, b.x, b.y)).toBe(e.dirFrom);
    expect(opposite(e.dirFrom)).toBe(e.dirTo);
    // to = from + unit(dirFrom)
    const [dx, dy] = DIR_OFFSETS[e.dirFrom];
    expect(b.x).toBe(a.x + dx);
    expect(b.y).toBe(a.y + dy);
    // weight centered on spacing, clamped to [1, 8]
    expect(e.weight).toBeGreaterThanOrEqual(Math.max(1, result.spacing - 2));
    expect(e.weight).toBeLessThanOrEqual(Math.min(8, result.spacing + 2));
  }

  // ── Degree 1..4 for every room ──
  const deg = degrees(result);
  for (const r of result.rooms) {
    const d = deg.get(r.id)!;
    expect(d).toBeGreaterThanOrEqual(1);
    expect(d).toBeLessThanOrEqual(4);
  }

  // ── Direction-slot uniqueness: ≤ 1 edge per direction per room ──
  for (const r of result.rooms) {
    const byDir = new Map<Dir, number>();
    for (const e of result.edges) {
      if (e.from === r.id) byDir.set(e.dirFrom, (byDir.get(e.dirFrom) ?? 0) + 1);
      if (e.to === r.id) byDir.set(e.dirTo, (byDir.get(e.dirTo) ?? 0) + 1);
    }
    for (const count of byDir.values()) expect(count).toBe(1);
  }

  // ── Connectivity: every room reachable from the entrance ──
  const dist = hopDistances(result);
  for (const r of result.rooms) {
    expect(dist.has(r.id)).toBe(true);
    expect(Number.isFinite(dist.get(r.id)!)).toBe(true);
  }

  // ── Entrance: id 0, top row, deg ≥ 1 ──
  expect(result.entranceId).toBe(0);
  const entrance = roomById.get(0)!;
  expect(entrance.y).toBe(0);
  expect(deg.get(0)!).toBeGreaterThanOrEqual(1);

  // ── Goal: hop-farthest (tie-break larger y then x) without goalSlack;
  //     within goalSlack hops of the farthest when it is set ──
  const maxDist = Math.max(...result.rooms.map((r) => dist.get(r.id)!));
  const goal = roomById.get(result.goalId)!;
  expect(result.goalDistance).toBe(dist.get(goal.id)!);
  if (result.goalSlack === undefined) {
    expect(result.goalDistance).toBe(maxDist);
    const maxRooms = result.rooms.filter((r) => dist.get(r.id) === maxDist);
    const best = [...maxRooms].sort((a, b) => b.y - a.y || b.x - a.x)[0];
    expect(goal.id).toBe(best.id);
  } else {
    expect(result.goalDistance).toBeGreaterThanOrEqual(maxDist - result.goalSlack);
    expect(result.goalDistance).toBeLessThanOrEqual(maxDist);
  }

  // ── Relaxed semantics ──
  if (result.relaxed) {
    expect(result.goalDistance).toBeLessThan(result.minFinalDistance);
  } else {
    expect(result.goalDistance).toBeGreaterThanOrEqual(result.minFinalDistance);
  }
}

// ─── Presets ─────────────────────────────────────────────────────────────

describe('presets', () => {
  it('has a complete table for every preset name', () => {
    for (const name of PRESET_NAMES) {
      const preset = PRESETS[name];
      expect(preset).toBeDefined();
      const [w, h] = preset.gridsize;
      expect(w).toBeGreaterThanOrEqual(2);
      expect(h).toBeGreaterThanOrEqual(2);
      expect(preset.baseRoomNumber).toBeLessThanOrEqual(w * h);
      expect(preset.baseCorridorNumber).toBeGreaterThanOrEqual(preset.baseRoomNumber - 1);
      expect(preset.minFinalDistance).toBeGreaterThanOrEqual(1);
      expect(preset.connectivity).toBeGreaterThanOrEqual(0);
      expect(preset.connectivity).toBeLessThanOrEqual(1);
      expect(preset.spacing).toBeGreaterThanOrEqual(1);
      expect(preset.spacing).toBeLessThanOrEqual(8);
    }
  });

  it('default presets target 60–75% occupancy (XS runs just below)', () => {
    for (const [name, preset] of Object.entries(PRESETS)) {
      const [w, h] = preset.gridsize;
      const occupancy = preset.baseRoomNumber / (w * h);
      // The tiny XS preset (5 rooms on 3×3) sits just below the observed band.
      expect(occupancy).toBeGreaterThanOrEqual(name === 'XS' ? 0.5 : 0.6);
      expect(occupancy).toBeLessThanOrEqual(0.75);
    }
  });

  it('defaults to the M preset', () => {
    expect(DEFAULT_PRESET).toBe('M');
    const { preset, resolved } = resolveConfig(makeConfig({ preset: 'M' }));
    expect(preset).toBe('M');
    expect(resolved).toEqual(PRESETS.M);
  });

  it('explicit config fields override the preset value-by-value', () => {
    const { resolved } = resolveConfig(
      makeConfig({ preset: 'M', gridsize: [9, 9], connectivity: 0.9, spacing: 7 }),
    );
    expect(resolved.gridsize).toEqual([9, 9]);
    expect(resolved.connectivity).toBe(0.9);
    expect(resolved.spacing).toBe(7);
    expect(resolved.baseRoomNumber).toBe(PRESETS.M.baseRoomNumber);
    expect(resolved.baseCorridorNumber).toBe(PRESETS.M.baseCorridorNumber);
    expect(resolved.minFinalDistance).toBe(PRESETS.M.minFinalDistance);
  });
});

// ─── Config validation ───────────────────────────────────────────────────

describe('config validation', () => {
  it('throws on an unknown preset', () => {
    expect(() => resolveConfig({ seed: 'x', preset: 'XXL2' as PresetName })).toThrow(
      /Unknown preset/,
    );
  });

  it('throws on an invalid gridsize', () => {
    for (const gridsize of [
      [1, 5],
      [5, 1],
      [0, 5],
      [2.5, 5],
      [5, 2.5],
      [-3, 5],
    ] as const) {
      expect(() =>
        resolveConfig(makeConfig({ preset: 'M', gridsize: [...gridsize] as [number, number] })),
      ).toThrow(/gridsize/);
    }
  });

  it('throws when the room count is below 2 or above grid capacity', () => {
    expect(() => resolveConfig(makeConfig({ preset: 'M', baseRoomNumber: 1 }))).toThrow(
      /baseRoomNumber/,
    );
    expect(() => resolveConfig(makeConfig({ preset: 'XS', baseRoomNumber: 26 }))).toThrow(
      /exceeds the grid capacity/,
    );
  });

  it('throws on invalid corridor counts, distances, connectivity, spacing', () => {
    expect(() => resolveConfig(makeConfig({ preset: 'M', baseCorridorNumber: 0 }))).toThrow(
      /baseCorridorNumber/,
    );
    expect(() => resolveConfig(makeConfig({ preset: 'M', minFinalDistance: 0 }))).toThrow(
      /minFinalDistance/,
    );
    for (const connectivity of [-0.1, 1.1, Number.NaN]) {
      expect(() => resolveConfig(makeConfig({ preset: 'M', connectivity }))).toThrow(
        /connectivity/,
      );
    }
    for (const spacing of [0, 9, 2.5]) {
      expect(() => resolveConfig(makeConfig({ preset: 'M', spacing }))).toThrow(/spacing/);
    }
  });

  it('throws on an invalid goalSlack', () => {
    for (const goalSlack of [-1, 1.5, Number.NaN]) {
      expect(() => resolveConfig(makeConfig({ preset: 'M', goalSlack }))).toThrow(/goalSlack/);
    }
    // valid values do not throw
    for (const goalSlack of [0, 1, 12]) {
      expect(() => resolveConfig(makeConfig({ preset: 'M', goalSlack }))).not.toThrow();
    }
  });

  it('clamps baseCorridorNumber up to the N − 1 hard floor', () => {
    const { resolved } = resolveConfig(makeConfig({ preset: 'M', baseCorridorNumber: 1 }));
    expect(resolved.baseCorridorNumber).toBe(PRESETS.M.baseRoomNumber - 1);
  });
});

// ─── generate: determinism ───────────────────────────────────────────────

describe('generate — determinism', () => {
  it('produces identical output for the same seed and config', () => {
    for (const preset of PRESET_NAMES) {
      const a = generate({ preset, seed: 'same' });
      const b = generate({ preset, seed: 'same' });
      expect(a).toEqual(b);
    }
  });

  it('produces different output for different seeds', () => {
    const a = generate({ preset: 'M', seed: 'seed-a' });
    const b = generate({ preset: 'M', seed: 'seed-b' });
    expect(a).not.toEqual(b);
  });

  it('auto-generates a 32-hex-char seed when none is provided', () => {
    const a = generate({ preset: 'M' });
    const b = generate({ preset: 'M' });
    expect(a.seed).toMatch(/^[0-9a-f]{32}$/);
    expect(b.seed).toMatch(/^[0-9a-f]{32}$/);
    expect(b.seed).not.toBe(a.seed);
  });

  it('accepts numeric seeds and stores them stringified', () => {
    const result = generate({ preset: 'S', seed: 42 });
    expect(result.seed).toBe('42');
  });
});

// ─── generate: structural invariants ─────────────────────────────────────

describe('generate — invariants', () => {
  it('satisfies every rule across all presets and multiple seeds', () => {
    for (const preset of PRESET_NAMES) {
      for (const seed of ['alpha', 'beta', 'gamma']) {
        assertInvariants(generate({ preset, seed }));
      }
    }
  });

  it('satisfies every rule under custom overrides', () => {
    const configs: DungeonConfig[] = [
      { preset: 'M', seed: 'c1', gridsize: [9, 9], baseRoomNumber: 40, baseCorridorNumber: 50 },
      { preset: 'S', seed: 'c2', connectivity: 0.9, spacing: 6 },
      { preset: 'L', seed: 'c3', minFinalDistance: 2, baseCorridorNumber: 60 },
      { preset: 'XL', seed: 'c4', gridsize: [12, 14], baseRoomNumber: 100, connectivity: 0.2 },
    ];
    for (const cfg of configs) assertInvariants(generate(cfg));
  });

  it('echoes the resolved config in the result', () => {
    const result = generate({ preset: 'M', seed: 'echo', connectivity: 0.7, spacing: 5 });
    expect(result.preset).toBe('M');
    expect(result.gridsize).toEqual(PRESETS.M.gridsize);
    expect(result.baseRoomNumber).toBe(PRESETS.M.baseRoomNumber);
    expect(result.baseCorridorNumber).toBe(PRESETS.M.baseCorridorNumber);
    expect(result.minFinalDistance).toBe(PRESETS.M.minFinalDistance);
    expect(result.connectivity).toBe(0.7);
    expect(result.spacing).toBe(5);
  });
});

// ─── generate: connectivity / loop behaviour ─────────────────────────────

describe('generate — loop behaviour', () => {
  it('connectivity = 0 yields exactly the spanning tree (N − 1 edges)', () => {
    for (const preset of PRESET_NAMES) {
      const result = generate({ preset, seed: 'tree', connectivity: 0 });
      expect(result.edges.length).toBe(result.baseRoomNumber - 1);
    }
  });

  it('higher connectivity produces at least as many edges as zero', () => {
    const zero = generate({ preset: 'M', seed: 'cmp', connectivity: 0 });
    const some = generate({ preset: 'M', seed: 'cmp', connectivity: 0.6 });
    expect(some.edges.length).toBeGreaterThanOrEqual(zero.edges.length);
  });

  it('the extra (non-tree) edge count equals edges − (N − 1)', () => {
    const result = generate({ preset: 'L', seed: 'loops', connectivity: 0.7 });
    const extras = result.edges.length - (result.baseRoomNumber - 1);
    expect(extras).toBeGreaterThanOrEqual(0);
    expect(extras).toBeLessThanOrEqual(result.baseCorridorNumber - (result.baseRoomNumber - 1));
  });
});

// ─── generate: goal + relaxation ─────────────────────────────────────────

describe('generate — goal and relaxation', () => {
  it('meets minFinalDistance when satisfiable (relaxed unset)', () => {
    const result = generate({ preset: 'M', seed: 'goal' });
    expect(result.goalDistance).toBeGreaterThanOrEqual(result.minFinalDistance);
    expect(result.relaxed).toBeUndefined();
  });

  it('relaxes to the farthest room and flags it when the distance is unmeetable', () => {
    const result = generate({ preset: 'M', seed: 'relax', minFinalDistance: 999 });
    expect(result.relaxed).toBe(true);
    expect(result.goalDistance).toBeLessThan(result.minFinalDistance);
    // still the hop-farthest room
    const dist = hopDistances(result);
    const maxDist = Math.max(...result.rooms.map((r) => dist.get(r.id)!));
    expect(result.goalDistance).toBe(maxDist);
  });
});

// ─── generate: goalSlack ─────────────────────────────────────────────────

describe('generate — goalSlack', () => {
  it('omits goalSlack from the result when unset and echoes it when set', () => {
    expect(generate({ preset: 'M', seed: 'no-slack' }).goalSlack).toBeUndefined();
    expect(generate({ preset: 'M', seed: 'echo-slack', goalSlack: 2 }).goalSlack).toBe(2);
  });

  it('is deterministic for the same seed and slack', () => {
    const a = generate({ preset: 'M', seed: 'slk', goalSlack: 2 });
    const b = generate({ preset: 'M', seed: 'slk', goalSlack: 2 });
    expect(a).toEqual(b);
  });

  it('keeps the goal within goalSlack hops of the farthest room, across presets and seeds', () => {
    for (const preset of PRESET_NAMES) {
      for (const slack of [0, 1, 2, 5]) {
        for (const seed of ['alpha', 'beta', 'gamma']) {
          const result = generate({ preset, seed, goalSlack: slack });
          assertInvariants(result);
        }
      }
    }
  });

  it('slack 0 always lands on a farthest room', () => {
    for (const preset of PRESET_NAMES) {
      for (const seed of ['alpha', 'beta', 'gamma']) {
        const result = generate({ preset, seed, goalSlack: 0 });
        const dist = hopDistances(result);
        const maxDist = Math.max(...result.rooms.map((r) => dist.get(r.id)!));
        expect(result.goalDistance).toBe(maxDist);
      }
    }
  });

  it('matches the no-slack goal whenever the farthest room is unique', () => {
    for (const preset of PRESET_NAMES) {
      for (const seed of ['alpha', 'beta', 'gamma']) {
        const plain = generate({ preset, seed });
        const dist = hopDistances(plain);
        const maxDist = Math.max(...plain.rooms.map((r) => dist.get(r.id)!));
        if (plain.rooms.filter((r) => dist.get(r.id) === maxDist).length === 1) {
          expect(generate({ preset, seed, goalSlack: 0 }).goalId).toBe(plain.goalId);
        }
      }
    }
  });

  it('different seeds can pick different goals within the slack window', () => {
    const goals = new Set<number>();
    for (let i = 0; i < 12; i++) {
      goals.add(generate({ preset: 'M', seed: `slk-${i}`, goalSlack: 2 }).goalId);
    }
    expect(goals.size).toBeGreaterThan(1);
  });

  it('relaxes to the farthest room when the slack window and minFinalDistance cannot both hold', () => {
    const result = generate({
      preset: 'M',
      seed: 'relax-slack',
      minFinalDistance: 999,
      goalSlack: 1,
    });
    expect(result.relaxed).toBe(true);
    const dist = hopDistances(result);
    const maxDist = Math.max(...result.rooms.map((r) => dist.get(r.id)!));
    expect(result.goalDistance).toBe(maxDist);
  });
});

// ─── PRNG ────────────────────────────────────────────────────────────────

describe('PRNG', () => {
  it('is deterministic for the same seed', () => {
    const a = new PRNG('seed-1');
    const b = new PRNG('seed-1');
    for (let i = 0; i < 100; i++) {
      expect(a.random()).toBe(b.random());
    }
  });

  it('differs across seeds', () => {
    const a = new PRNG('seed-a');
    const b = new PRNG('seed-b');
    const drawsA = Array.from({ length: 10 }, () => a.random());
    const drawsB = Array.from({ length: 10 }, () => b.random());
    expect(drawsA).not.toEqual(drawsB);
  });

  it('ints stay within [min, max]', () => {
    const prng = new PRNG('bounds');
    for (let i = 0; i < 1000; i++) {
      const v = prng.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });

  it('random() stays within [0, 1)', () => {
    const prng = new PRNG('range');
    for (let i = 0; i < 1000; i++) {
      const v = prng.random();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('normalizeSeed auto-generates a 32-hex-char seed and stringifies numbers', () => {
    expect(PRNG.normalizeSeed()).toMatch(/^[0-9a-f]{32}$/);
    expect(PRNG.normalizeSeed(42)).toBe('42');
    expect(PRNG.normalizeSeed('abc')).toBe('abc');
  });
});

// ─── Grid helpers ────────────────────────────────────────────────────────

describe('grid helpers', () => {
  it('opposite is involutive and pairs N↔S, E↔W', () => {
    for (const dir of DIRS) {
      expect(opposite(opposite(dir))).toBe(dir);
    }
    expect(opposite('N')).toBe('S');
    expect(opposite('S')).toBe('N');
    expect(opposite('E')).toBe('W');
    expect(opposite('W')).toBe('E');
  });

  it('DIR_OFFSETS matches the coordinate rules (N: y−1, S: y+1, E: x+1, W: x−1)', () => {
    expect(DIR_OFFSETS.N).toEqual([0, -1]);
    expect(DIR_OFFSETS.S).toEqual([0, 1]);
    expect(DIR_OFFSETS.E).toEqual([1, 0]);
    expect(DIR_OFFSETS.W).toEqual([-1, 0]);
  });

  it('cellKey is unique per cell and order-sensitive', () => {
    expect(cellKey(1, 2)).not.toBe(cellKey(2, 1));
    expect(cellKey(1, 2)).toBe(cellKey(1, 2));
  });

  it('dirBetween returns the direction for adjacent cells, null otherwise', () => {
    expect(dirBetween(2, 3, 2, 2)).toBe('N');
    expect(dirBetween(2, 3, 2, 4)).toBe('S');
    expect(dirBetween(2, 3, 3, 3)).toBe('E');
    expect(dirBetween(2, 3, 1, 3)).toBe('W');
    expect(dirBetween(2, 3, 3, 4)).toBeNull();
    expect(dirBetween(2, 3, 5, 3)).toBeNull();
    expect(dirBetween(2, 3, 2, 3)).toBeNull();
  });
});

// ─── Graph helpers ───────────────────────────────────────────────────────

describe('EdgeSet', () => {
  it('deduplicates undirected edges (A-B ≡ B-A)', () => {
    const set = new EdgeSet();
    set.add(0, 1, 'S', 'N', 3);
    set.add(1, 0, 'N', 'S', 5);
    expect(set.size).toBe(1);
    expect(set.values()).toEqual([{ from: 0, to: 1, dirFrom: 'S', dirTo: 'N', weight: 3 }]);
    expect(set.has(0, 1)).toBe(true);
    expect(set.has(1, 0)).toBe(true);
    expect(set.has(1, 1)).toBe(false);
  });

  it('ignores self-edges and preserves insertion order', () => {
    const set = new EdgeSet();
    set.add(2, 2, 'N', 'S', 1);
    set.add(0, 2, 'E', 'W', 4);
    set.add(1, 2, 'S', 'N', 2);
    expect(set.size).toBe(2);
    expect(set.values().map((e) => [e.from, e.to])).toEqual([
      [0, 2],
      [1, 2],
    ]);
  });
});

describe('bfsHopDistances', () => {
  const rooms: Room[] = [0, 1, 2, 3, 4].map((id) => ({ id, x: id, y: 0 }));
  const edges: Edge[] = [
    { from: 0, to: 1, dirFrom: 'E', dirTo: 'W', weight: 1 },
    { from: 1, to: 2, dirFrom: 'E', dirTo: 'W', weight: 1 },
    { from: 2, to: 3, dirFrom: 'E', dirTo: 'W', weight: 1 },
    { from: 1, to: 4, dirFrom: 'S', dirTo: 'N', weight: 1 },
  ];

  it('computes unweighted hop distances from the start', () => {
    const dist = bfsHopDistances(0, rooms, edges);
    expect(dist.get(0)).toBe(0);
    expect(dist.get(1)).toBe(1);
    expect(dist.get(2)).toBe(2);
    expect(dist.get(3)).toBe(3);
    expect(dist.get(4)).toBe(2);
  });

  it('maps unreachable rooms to Infinity', () => {
    const isolated: Room[] = [{ id: 9, x: 0, y: 0 }];
    const dist = bfsHopDistances(0, rooms.concat(isolated), edges);
    expect(dist.get(9)).toBe(Infinity);
  });
});
