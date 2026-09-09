# ddungeon-gen

Deterministic Darkest-Dungeon-style **grid** dungeon topology generator.
Pure node/edge layout: rooms on a `W×H` grid, corridors only between
grid-adjacent cells, built as a spanning tree plus a bounded number of loop
edges. Zero runtime dependencies. ESM, Node ≥ 18.

> **Status: 0.1.0.** The full generator is implemented and tested: `generate()`
> produces a deterministic grid dungeon satisfying every rule in
> [DESIGN.md](./docs/DESIGN.md).

---

## Quick Start

```ts
import { generate } from 'ddungeon-gen';

// Preset dungeon (M = 5×5 grid, 16 rooms, 19 corridors)
const dungeon = generate({ preset: 'M', seed: 'abc' });

// Goal within 2 hops of the farthest room (instead of exactly the farthest)
const slacky = generate({ preset: 'M', seed: 'abc', goalSlack: 2 });

// Fully custom
const custom = generate({
  seed: 42,
  gridsize: [10, 12],
  baseRoomNumber: 60,
  baseCorridorNumber: 74,
  minFinalDistance: 7,
  connectivity: 0.5,
  spacing: 4,
});
```

## Installation

```bash
npm install ddungeon-gen
```

No runtime dependencies. TypeScript types included.

---

## API

### `generate(config: DungeonConfig): DungeonResult`

The only public function. Returns a deterministic dungeon from the config.

```ts
interface DungeonConfig {
  seed?: string | number;  // optional — auto-generated if omitted, stored in output
  preset?: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';  // default 'M'
  gridsize?: [number, number];        // [W, H]
  baseRoomNumber?: number;            // N — room count
  baseCorridorNumber?: number;        // E — corridor count (floored at N − 1)
  minFinalDistance?: number;          // min entrance→goal hop distance
  goalSlack?: number;                 // goal within N hops of the farthest room (omit = exactly the farthest)
  connectivity?: number;              // p ∈ [0,1] — loop-edge probability
  spacing?: number;                   // base corridor length (tiles), integer 1..8
}
```

Every field except `seed` is optional: the preset supplies defaults, and any
explicitly set field overrides the preset value. Invalid configs throw
(see [DESIGN.md §6](./docs/DESIGN.md#6-presets)).

### Presets

| preset | gridsize | N rooms | occupancy | E corridors | min final dist | connectivity | spacing |
|---|---|---|---|---|---|---|---|
| XS  | 3×3   | 5   | 56% | 6   | 2 | 0.35 | 2 |
| S   | 4×4   | 10  | 63% | 12  | 3 | 0.40 | 3 |
| M   | 5×5   | 16  | 64% | 19  | 4 | 0.45 | 3 |
| L   | 6×6   | 24  | 67% | 29  | 5 | 0.50 | 3 |
| XL  | 7×7   | 32  | 65% | 39  | 6 | 0.55 | 4 |
| XXL | 7×8   | 38  | 68% | 46  | 6 | 0.45 | 4 |

---

## Output — `DungeonResult<TPopulate>`

```ts
interface Room {
  id: number;   // sequential 0..N−1, BFS order from the entrance; 0 = entrance
  x: number;    // grid column, 0 ≤ x < W
  y: number;    // grid row, 0 ≤ y < H (row 0 is the top)
}

type Dir = 'N' | 'S' | 'E' | 'W';

interface Edge {
  from: number;      // room id
  to: number;        // room id, always from + unit(dirFrom)
  dirFrom: Dir;      // exit direction at `from`
  dirTo: Dir;        // exit direction at `to` = opposite(dirFrom)
  weight: number;    // corridor length in tiles, integer 1..8
}

interface DungeonResult<TPopulate extends Record<string, unknown[]> = Record<string, never>> {
  seed: string;                  // the seed used (auto-generated if omitted)
  preset: PresetName;            // preset the defaults came from
  gridsize: [number, number];    // resolved W×H
  baseRoomNumber: number;        // resolved N
  baseCorridorNumber: number;    // resolved E (after the N−1 floor clamp)
  minFinalDistance: number;      // resolved
  goalSlack?: number;            // set only when the config set it
  connectivity: number;          // resolved p
  spacing: number;               // resolved
  entranceId: number;            // always 0
  goalId: number;                // the goal room
  goalDistance: number;          // actual entrance→goal hop distance
  relaxed?: boolean;             // true when goalDistance < minFinalDistance
  rooms: Room[];
  edges: Edge[];                 // always a connected graph rooted at the entrance
  populate?: TPopulate;          // filled in by populate packages
}
```

### Guarantees (see [DESIGN.md](./docs/DESIGN.md) for the full rule set)

- **Connected** — every room reachable from the entrance (spanning-tree layer).
- **Grid-adjacent edges only** — `Δx+Δy = 1` for every edge; no diagonals.
- **Degree 1–4** with at most one edge per direction slot per room.
- **`N − 1 ≤ E ≤ min(baseCorridorNumber, 2N)`** — loop edges = `E − (N − 1)`.
- **Goal distance** — `goalDistance ≥ minFinalDistance`, unless `relaxed` is
  set (then it is the farthest room anyway).
- **Goal placement** — without `goalSlack` the goal is the hop-farthest room
  (tie-break: larger y, then x); with `goalSlack = N` it is a seeded-random
  room within `N` hops of the farthest, still ≥ `minFinalDistance`.
- **Occupancy** — presets place N at ≈ 60–75% of the grid cells (the tiny XS
  preset runs just below, at ≈ 56%).

### Determinism

Same `(seed, config)` always produces identical output. All randomness flows
through a single seeded PRNG (Mulberry32 + djb2) in a fixed draw order — see
[DESIGN.md §7](./docs/DESIGN.md#7-determinism). No `Math.random()` in the
generation pipeline.

---

## Pipeline — Consuming with Populate Packages

`DungeonResult` follows a shared-contract pattern:
populate packages take a `DungeonResult` and return a new one enriched with
their data in the `populate?` field — the input is never mutated, and the
generic `TPopulate` carries compile-time safety through the pipeline.

---

## Architecture

```
src/
├── index.ts                 # Public API: generate(config), type + preset exports
├── types.ts                 # DungeonConfig, DungeonResult<TPopulate>, Room, Edge, Dir, PresetName
├── presets.ts               # Preset table, DEFAULT_PRESET, resolveConfig (merge + validate)
├── util/
│   ├── prng.ts              # Mulberry32 PRNG + djb2 string hash + seed normalization
│   ├── grid.ts              # DIR_OFFSETS, DIRS, opposite(dir), cellKey, dirBetween
│   └── graph.ts             # EdgeSet (dedup), bfsHopDistances (unweighted BFS)
└── generator/
    └── GridGenerator.ts     # The 5-step construction (see docs/DESIGN.md)
```

### Construction steps (implemented in `GridGenerator`)

1. **Place** N cells by connected blob growth from the entrance (a random top-row cell).
2. **Spanning tree** over grid-adjacent cells → exactly N−1 edges.
3. **Loop edges** — PRNG-shuffled candidate pool, each accepted with probability
   `connectivity`, capped at `baseCorridorNumber`, degree ≤ 4, direction-slot unique.
4. **Weights** — `clamp(spacing + int(−2, 2), 1, 8)` per edge.
5. **Goal** — without `goalSlack`: hop-farthest room (tie-break: larger y, then x),
   relaxed to the overall farthest room + `relaxed: true` when none reach
   `minFinalDistance`. With `goalSlack = N`: seeded-random pick from rooms in
   hop distance `[max(minFinalDistance, maxDist−N), maxDist]` (same fallback).

---

## Testing

```bash
npm test              # run all tests
npm run test:watch    # watch mode
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run format:check  # prettier
```

**42 tests** covering, invariant-driven across all presets and many seeds:
determinism, grid bounds/uniqueness, edge 4-tuple + geometry consistency,
degree and direction-slot limits, connectivity, entrance/goal rules (including
`goalSlack`), loop behaviour, relaxation, config validation, and the
PRNG/grid/graph helpers.

## Roadmap

- [x] Package scaffold + tooling (zero runtime deps, ESM, Node ≥ 18)
- [x] Type contract, preset table, PRNG/grid/graph helpers
- [x] Generation rules spec ([docs/DESIGN.md](./docs/DESIGN.md))
- [x] `GridGenerator` implementation (the 5 construction steps)
- [x] Test suite (invariant-driven, all presets × many seeds)
- [x] Renderer integration (follow-up task, separate package) — done in [`ddungeon-display`](../ddungeon-display)

## Consumption

ESM only (no CommonJS build). Requires Node ≥ 18 (or any bundler). Import as
`import { generate } from 'ddungeon-gen'`; a default export (`generate`) is also
provided.
