# ddungeon-display

Interactive **visualizer and test tool** for [`ddungeon-gen`](../ddungeon-gen)
output. Renders any `DungeonResult` as an interactive SVG (graph or tile view),
checks the generator's documented contract (rules R1–R8) with on-canvas
marking, pokes the generator live, and can inspect arbitrary saved outputs via
JSON paste. Standalone Vite web app — **not** a library, not published, no CLI,
no CJS build.

> **Status: 0.1.0.** Implemented per [SPEC.md](./SPEC.md): pure testable core
> (`src/core/`, DOM-free, no `ddungeon-gen` runtime import beyond types) + a
> thin DOM layer (`src/ui/`). 50 tests, all passing.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173 — first frame: preset M, seed "default"
```

Other scripts:

```bash
npm test           # vitest (pure core only — no DOM tests)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run format     # prettier --write
npm run format:check
npm run build      # tsc && vite build
npm run preview
```

## What it does

- **Two views** — *graph* (default): outlined room squares, thin edge lines,
  weight labels at line midpoints. *tile*: filled room blocks, each corridor a
  thick strip divided into `weight` equal segments (segment size = gap/weight).
  All corridors have equal visual length; weight is conveyed by segment count
  + label (to-scale and meandering corridors were rejected — see SPEC §6).
- **Validation (always runs)** — enforces the `ddungeon-gen` DESIGN.md
  contract (rules R1–R8). The panel shows "0 violations" when clean, otherwise
  one line per violation; offending rooms/edges are marked red and clicking a
  panel line highlights the element.
- **Live generation controls** — every `DungeonConfig` field (preset, gridsize
  W/H, room/corridor counts, min final distance, goal slack, connectivity,
  spacing) + seed pinning/reroll. Invalid configs surface as an error banner;
  the last valid SVG stays on screen (seeing *what throws* is itself a test
  feature).
- **JSON inspect** — paste any saved `DungeonResult`; the app shape-checks it
  (non-grid / legacy models are rejected with a clear message), renders and
  fully validates it. A **Copy JSON** button exports the current dungeon.
- **Export** — downloads the current view as a standalone `.svg`
  (`ddungeon-{preset}-{seed}.svg`) honoring the current toggles, with the
  stats header embedded.
- **Viewport** — fit-to-view by default, wheel zoom, drag pan (viewBox
  manipulation).

### Validation rules (SPEC §5)

| Rule | Check |
|---|---|
| R1 | rooms in bounds `0≤x<W, 0≤y<H`; no two rooms share a cell |
| R2 | every edge grid-adjacent (`Δx+Δy=1`); `to = from + unit(dirFrom)`; `dirTo = opposite(dirFrom)`; endpoints exist |
| R3 | degree 1–4; ≤1 edge per direction slot per room |
| R4 | `N−1 ≤ E ≤ min(baseCorridorNumber, 2N)` |
| R5 | graph connected from entrance; `entranceId = 0`; entrance room at `y = 0` |
| R6 | BFS hop dist(entrance, goal) == `goalDistance`; `!relaxed ⇒ ≥ minFinalDistance`; `relaxed ⇒ goal is the farthest room`; `goalSlack` set ⇒ goal within `goalSlack` hops of the farthest room, unset ⇒ goal **is** the farthest room |
| R7 | weights are integers in 1..8 |
| R8 | `rooms.length == baseRoomNumber`; `gridsize` well-formed (integers ≥ 2) and consistent (`baseRoomNumber ≤ W·H`) |

Occupancy % is a preset *target*, not a contract — it appears in the stats
header only, never as a violation.

> **Note on R8:** the generator's loop layer can legitimately stop short of
> `baseCorridorNumber` when `connectivity < 1` (verified empirically;
> DESIGN.md §8 states the bound as `N−1 ≤ |E| ≤ base_corridor_number`), so the
> edge-count *range* is owned by R4 and R8 checks the room count + gridsize
> instead of a literal `edges.length == baseCorridorNumber` equality.

## Layout

```
src/
├── core/                 # PURE — no DOM, no ddungeon-gen runtime import (types only)
│   ├── types.ts          # ViewOptions, Violation, Analysis, Layout
│   ├── layout.ts         # grid→pixel mapping, corridor strip/segment geometry
│   ├── graph.ts          # BFS distances/path, spanning-tree (loop) extraction
│   ├── validate.ts       # R1–R8 → Violation[]
│   └── svg/
│       ├── svg.ts        # deterministic string builder (no Date/uuid/Math.random)
│       ├── graph-view.ts
│       └── tile-view.ts
└── ui/                   # DOM wiring only
    ├── main.ts           # state, render loop, zoom/pan, download, JSON panel
    ├── controls.ts       # element refs, config collection, stats/violations panels
    └── style.css
tests/
├── fixtures.ts           # hand-authored tiny dungeons + per-rule mutations
├── layout.test.ts  graph.test.ts  validate.test.ts  svg.test.ts
```

The structural rule: everything in `src/core/` is pure so it can be lifted
into a library later without rework.

## Core API

```ts
import { computeLayout } from './src/core/layout';
import { analyze } from './src/core/graph';
import { validate } from './src/core/validate';
import { renderSvg } from './src/core/svg/svg';

computeLayout(dungeon); // Layout — cell size, origin, cell→px, per-edge segment points
analyze(dungeon);       // Analysis — BFS distances, entrance→goal path, loop edges
validate(dungeon);      // Violation[] — the R1–R8 contract
renderSvg(dungeon, options, analysis?, violations?); // deterministic standalone SVG
```

- `renderSvg` is **byte-deterministic** for identical inputs (verified by
  tests; golden snapshots for preset `M`, seed `"default"`, one per view).
- Loop split: deterministic BFS spanning tree from the entrance — tree edges
  base color, the `E−(N−1)` loop edges accent color.
- Shortest path: unweighted BFS entrance→goal (matches `goalDistance`'s hop
  semantics), drawn as a thick gold overlay on the involved edges.

## Package

- `private: true`, `type: module`, `engines.node >= 18`, no `dist`/`files`
  (not published).
- **Only dependency:** `ddungeon-gen: file:../ddungeon-gen` (used by the UI
  layer for live generation; the core imports types only).
- Toolchain: `vite ^5`, `typescript ^5.3` (strict), `vitest ^1.2`, the
  `ddungeon-gen` eslint + prettier config set, `@xmldom/xmldom` (dev,
  XML-validity tests).
