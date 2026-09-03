# Procedural Dungeon Generator — Project Context

A toolkit of small, focused npm packages for procedural dungeon generation. Designed to feed future game projects; no single game project yet — these are library-grade building blocks.

The canonical topology generator is **`ddungeon-gen`**, which produces deterministic Darkest-Dungeon-style **grid** dungeons. **`ddungeon-display`** is the interactive visualizer/test tool for its output. **`challenge-resolver`** is a standalone D10 dice-resolution package, independent of the dungeon model.

---

## Goals

1. **Deterministic generation** — same config always produces the same dungeon. Seed-driven, zero randomness surprises.
2. **Composable pipeline** — topology first, then content (monsters, treasure, challenges), then display. Each stage is a pure transform on `DungeonResult`.
3. **Small packages, few dependencies** — each package does one thing well. `ddungeon-gen` has zero runtime deps. Future packages should justify any dependency they pull in.
4. **Pure topology** — `ddungeon-gen` emits rooms + corridors only (no labels, no themes); flavor and content are added downstream by populate packages.
5. **Visual debugging tooling** — a live playground (`ddungeon-display`) for inspecting generated topology before committing to it in a game.

---

## Pipeline

```
ddungeon-gen
    │
    ▼
monster-populate  ──┐
treasure-populate  ──┼──→ ddungeon-display (renders any stage)
challenge-populate ──┘
```

Each populate package:
1. Takes `DungeonResult` as input
2. Returns a new `DungeonResult<TPopulate>` with data in the `populate` field
3. Never mutates the input
4. Can run in any order — no inter-dependencies between populate packages

The generic type parameter `TPopulate` carries compile-time safety through the pipeline:

```ts
const base = generate({ preset: 'M', seed: 'abc' });
// DungeonResult<{}>

const withMonsters = populateMonsters(base, { density: 0.7 });
// DungeonResult<{ monsters: Monster[] }>

const populated = populateTreasures(withMonsters, { density: 0.5 });
// DungeonResult<{ monsters: Monster[]; treasures: Treasure[] }>

render(populated); // works at any stage
```

---

## Packages

| Package | Status | Description |
|---|---|---|
| `ddungeon-gen` | ✅ Done (0.1.0) | DD grid-graph topology generator — rooms on a W×H grid, spanning tree + loop edges, pure topology |
| `ddungeon-display` | ✅ Done | Interactive SVG visualizer + test tool for `ddungeon-gen` output (test tooling) |
| `challenge-resolver` | ✅ Done (0.1.0) | Tiered slot-filling D10 dice resolution (standalone, independent of the dungeon model) |
| `monster-populate` | 📋 Planned | Monster placement by biome/theme |
| `treasure-populate` | 📋 Planned | Loot/chest generation |
| `challenge-populate` | 📋 Planned | Traps, puzzles, NPCs, events |

### `ddungeon-gen` — Darkest Dungeon Grid-Graph Generator

A deterministic Darkest-Dungeon-style **grid** dungeon generator, built to a strict layout grammar: rooms on a `W × H` integer grid, corridors only between grid-adjacent cells.

- Rooms occupy cells on a `W × H` integer grid (presets target ~60–75% occupancy).
- Corridors run **only** between grid-adjacent cells; every edge is a 4-tuple
  `{ from, to, dirFrom, dirTo, weight }` with weight 1–8 tiles.
- The edge set is a **spanning tree** (N−1 edges, guarantees connectivity) plus
  a capped, probabilistic set of **loop edges** (`connectivity` probability,
  degree ≤ 4, one edge per direction slot).
- The **entrance** is a random cell in the top row (always room id 0,
  `entranceId = 0`); the **goal** is the hop-farthest room at distance ≥
  `minFinalDistance` (tie-break: larger y, then x), with a `relaxed` fallback
  when unsatisfiable. Optional `goalSlack` places it instead on a seeded-random
  room within N hops of the farthest (still ≥ `minFinalDistance`).
- No labels, no themes — pure topology. Config is `preset` (XS…XXL) +
  parameter overrides (`gridsize`, `baseRoomNumber`, `baseCorridorNumber`,
  `minFinalDistance`, `goalSlack`, `connectivity`, `spacing`).

**Status: 0.1.0** — fully implemented and tested: `generate()` produces a
deterministic grid dungeon satisfying every rule, with an invariant-driven test
suite (42 tests). The generation rules are specified in
`ddungeon-gen/docs/DESIGN.md`.

```ts
import { generate } from 'ddungeon-gen';

const dungeon = generate({ preset: 'M', seed: 'abc' });
// dungeon.entranceId = 0, dungeon.rooms[i] = { id, x, y },
// dungeon.edges[i] = { from, to, dirFrom, dirTo, weight }
```

See `ddungeon-gen/README.md` for full API docs.

---

### `ddungeon-display` — Interactive SVG Visualizer + Test Tool

An interactive visualizer and test tool for `ddungeon-gen` output. Renders any
`ddungeon-gen` `DungeonResult` as an interactive SVG, always runs full
validation against the `ddungeon-gen` DESIGN.md contract, and includes a
playground UI with generation controls, a JSON inspector, and SVG export.

```bash
cd ddungeon-display
npm install
npm run dev     # http://localhost:5173
```

See `ddungeon-display/README.md` for full docs.

---

### `challenge-resolver` — D10 Dice Resolution

A standalone package implementing a **Tiered Slot-Filling Resolution** system
for D10-based dice mechanics. Independent of the dungeon model — it resolves
challenges across difficulty tiers from pre-rolled or random dice.

```ts
import { resolveDeterministic } from 'challenge-resolver';

const successes = resolveDeterministic([10, 9, 8, 7, 6, 5], 10, 8, 6, 6, 3, 1);
// => 4
```

See `challenge-resolver/README.md` for full API docs.

---

## Planned Packages

All populate packages consume `ddungeon-gen`'s `DungeonResult` and return a new
one enriched with their data in the `populate?` field (the input is never
mutated; the generic `TPopulate` carries compile-time safety through the
pipeline).

### `monster-populate` — Monster Placement [STUB]

Takes a `DungeonResult`, returns a new `DungeonResult` with monsters added.

**Interface (planned):**
```ts
interface MonsterPopulateConfig {
  density: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  themeOverrides?: Record<string, string[]>;
}

function populateMonsters(dungeon: DungeonResult, config: MonsterPopulateConfig): DungeonResult<{ monsters: Monster[] }>;
```

### `treasure-populate` — Treasure Placement [STUB]

Takes a `DungeonResult`, returns enriched with treasures. The goal room always gets the big loot.

**Interface (planned):**
```ts
interface TreasurePopulateConfig {
  density: number;
  goldWeight?: number;
}

function populateTreasures(dungeon: DungeonResult, config: TreasurePopulateConfig): DungeonResult<{ treasures: Treasure[] }>;
```

### `challenge-populate` — Challenge/Event Placement [STUB]

Adds non-combat encounters: puzzles, traps, NPCs, events.

**Interface (planned):**
```ts
interface Challenge {
  id: string;
  type: 'puzzle' | 'trap' | 'npc' | 'event';
  description: string;
  difficulty: number;
  reward?: Reward;
}

function populateChallenges(dungeon: DungeonResult, config: ChallengeConfig): DungeonResult<{ challenges: Challenge[] }>;
```

---

## Running Things

```bash
# ddungeon-gen
cd ddungeon-gen
npm run build   # compiles to dist/
npm test        # 42 tests, all passing

# ddungeon-display (visualizer + test tool for ddungeon-gen)
cd ddungeon-display
npm install
npm run dev     # http://localhost:5173
npm test        # 50 tests, all passing

# challenge-resolver
cd challenge-resolver
npm run build   # compiles to dist/
npm test
```

---

## How to Add a New Package

1. Create `<name>/package.json` with TypeScript + Vitest setup (copy from `ddungeon-gen`)
2. Import types from `ddungeon-gen`:
   ```ts
   import type { DungeonResult } from 'ddungeon-gen';
   ```
3. Write the populate function as a pure transform: `(dungeon, config) => DungeonResult<TNew>`
4. Add tests that verify determinism and connectivity preservation

---

## Notes for Future Me (LLM Agent)

- **No monorepo tooling** — each package is standalone with its own `node_modules`. No npm workspaces, no lerna/pnpm. Keep it simple.
- **`ddungeon-gen` is the canonical topology generator** — standalone, zero runtime deps, its own copy of the PRNG (no cross-dependency). It implements the DD grid-graph model specified in `ddungeon-gen/docs/DESIGN.md`.
- **`ddungeon-gen` has zero deps** — if a future package needs a dependency, justify it; most utilities (Dijkstra, hashing) are 5–20 lines.
- **The shared type contract is in `ddungeon-gen/src/types.ts`** — if you change it, update all downstream consumers. Consider extracting to `dungeon-types` when there are 3+ packages depending on it.
- **Room IDs are sequential 0..N** — room 0 is always the entrance (`entranceId = 0`). The goal is determined by hop-distance (the farthest room ≥ `minFinalDistance`); IDs don't change.
- **Edges are grid-adjacent only** — the edge set is a spanning tree (N−1 edges) plus a capped set of loop edges. Every edge is a 4-tuple `{ from, to, dirFrom, dirTo, weight }`.
- **`ddungeon-display` is pure core + UI** — `src/core/` is DOM-free and imports `ddungeon-gen` for types only, so the core can be lifted into a library later.
- **`challenge-resolver` is independent** — it has no dependency on the dungeon model and consumes no `DungeonResult`; keep it that way.
