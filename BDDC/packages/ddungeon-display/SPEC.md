# SPEC — `ddungeon-display`

Interactive visualizer and test tool for `ddungeon-gen` output. Standalone
Vite web app. **Not** a library, not published, not a module for any future
project (though its core is structured to be liftable into one later without
rework).

> **Status: spec.** No implementation yet. Phases in §11 define the build order.

---

## 1. Goals / non-goals

**Goals**

- Render any `ddungeon-gen` `DungeonResult` as an interactive SVG — two
  views: **graph** (default) and **tile**
- Visually verify the generator's documented invariants: built-in checker
  (rules R1–R8, §5) with on-canvas marking
- Poke the generator live: every `DungeonConfig` field exposed, seed
  pinning/reroll, invalid-config errors surfaced
- Inspect arbitrary saved outputs via JSON paste; export the current view as
  a standalone `.svg`

**Non-goals (v1)**

- No importable library API, no CLI, no CJS build, no publishing
- No `populate?` rendering (unknown populate data passes through
  unrendered, never crashes)
- No multi-seed gallery, no hop-distance coloring, no file drop, no
  React/component model

---

## 2. Package & toolchain

- Location: `packages/ddungeon-display/` (new sibling; `ddungeon-gen`
  untouched except its roadmap line, §9.7)
- `package.json`: name `ddungeon-display`, `private: true`,
  `type: module`, `engines.node >= 18`; **only dependency**
  `ddungeon-gen: file:../ddungeon-gen`; no `dist`/`files`
- Toolchain (ecosystem-consistent, matches `ddungeon-gen`): `vite ^5`, `typescript ^5.3` (strict),
  `vitest ^1.2`, eslint + prettier (the `ddungeon-gen` config set),
  `@xmldom/xmldom` (dev, XML-validity tests)
- Scripts: `dev`, `build`, `preview`, `test`, `typecheck`, `lint`,
  `format`, `format:check`
- Wider plans: the app is a local tool today but may grow. Structural rule —
  everything in `src/core/` is pure (no DOM, no `ddungeon-gen` runtime
  import beyond types) so the core can be lifted out into a library later.

---

## 3. Layout

```
packages/ddungeon-display/
├── SPEC.md  README.md  package.json  tsconfig.json  vite.config.ts
├── vitest.config.ts  eslint.config.js  .prettierrc.json  index.html
├── src/
│   ├── core/                 # PURE — no DOM, no ddungeon-gen runtime import (types only)
│   │   ├── types.ts          # ViewOptions, Violation, Analysis, Layout
│   │   ├── layout.ts         # grid→pixel mapping, corridor strip/segment geometry
│   │   ├── graph.ts          # BFS distances/path, spanning-tree (loop) extraction
│   │   ├── validate.ts       # R1–R8 → Violation[]
│   │   └── svg/
│   │       ├── svg.ts        # deterministic string builder (no Date/uuid/Math.random)
│   │       ├── graph-view.ts
│   │       └── tile-view.ts
│   └── ui/                   # DOM wiring only
│       ├── main.ts  controls.ts  style.css
└── tests/
    ├── fixtures.ts           # hand-authored tiny dungeons + per-rule mutations
    ├── layout.test.ts  graph.test.ts  validate.test.ts  svg.test.ts
```

---

## 4. Core API

```ts
interface ViewOptions {
  view: 'graph' | 'tile';
  showBackdrop: boolean;   // full W×H grid, default true
  showWeights: boolean;    // corridor length labels, default true
  showPath: boolean;       // entrance→goal shortest path overlay, default true
  showLoopSplit: boolean;  // tree vs loop edge colors, default true
  showHeader: boolean;     // stats text block inside the SVG, default false
  width?: number; height?: number;  // canvas px; default auto-fit
}

type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8';
interface Violation { rule: RuleId; message: string; roomIds?: number[]; edgeIndex?: number }

interface Analysis {
  distances: Map<number, number>;   // BFS hop distance from entrance
  path: number[];                   // room ids, entrance→goal
  loopEdgeIndices: Set<number>;     // edges not in the BFS tree
  farthest: number;                 // max hop distance
}

computeLayout(d: DungeonResult): Layout          // cell size, origin, cell→px, per-edge segment points
analyze(d: DungeonResult): Analysis
validate(d: DungeonResult): Violation[]
renderSvg(d: DungeonResult, o: ViewOptions, a?: Analysis, v?: Violation[]): string
```

- **Loop split**: BFS spanning tree from the entrance (deterministic;
  consistent with the id-assignment order). Tree edges base color, the
  `E−(N−1)` loop edges accent color.
- **Shortest path**: unweighted BFS entrance→goal (matches
  `goalDistance`'s hop semantics), drawn as a thick gold overlay on the
  involved edges.
- `renderSvg` is byte-deterministic for identical inputs.

---

## 5. Validation contract (always runs)

The validator enforces the `ddungeon-gen` `DESIGN.md` contract
(§2/§3/§8). Panel shows "0 violations" when clean, otherwise one line per
violation with room/edge ids; offending rooms/edges marked red in the view;
clicking a panel line highlights the element.

| Rule | Check |
|---|---|
| R1 | rooms in bounds `0≤x<W, 0≤y<H`; no two rooms share a cell |
| R2 | every edge grid-adjacent (`Δx+Δy=1`); `to = from + unit(dirFrom)`; `dirTo = opposite(dirFrom)`; endpoints exist |
| R3 | degree 1–4; ≤1 edge per direction slot per room |
| R4 | `N−1 ≤ E ≤ min(baseCorridorNumber, 2N)` |
| R5 | graph connected from entrance; `entranceId = 0`; entrance room at `y = 0` |
| R6 | BFS hop dist(entrance, goal) == `goalDistance`; `!relaxed ⇒ ≥ minFinalDistance`; `relaxed ⇒ goal is the farthest room`; `goalSlack` set ⇒ goal within `goalSlack` hops of the farthest room, unset ⇒ goal **is** the farthest room |
| R7 | weights are integers in 1..8 |
| R8 | `rooms.length == baseRoomNumber`; `edges.length == baseCorridorNumber`; `gridsize` consistent with room coords |

Occupancy % is a preset *target*, not a contract — it appears in the stats
header only, never as a violation.

---

## 6. Views

**Shared geometry** — rooms on a regular grid (cell size auto-fit to
viewport, clamped 24–96px); the corridor between two adjacent room blocks
spans the full gap.

- **Graph (default)**: outlined room squares on the grid; thin edge lines;
  weight label at line midpoint.
- **Tile**: filled room blocks; each corridor a thick strip divided into
  `weight` equal tile segments (segment size = gap/weight). All corridors
  have equal visual length; weight is conveyed by segment count + label.
  Meandering or to-scale corridors were rejected: a room's four neighbors at
  different weights cannot all be to-scale from one fixed center, and
  adjacent grid cells leave no room to route a meander without overlapping
  neighbors.
- **Backdrop**: full W×H grid — room cells filled, empty cells faint
  outlines (bounds/occupancy at a glance).
- **Labels**: only `start` (entrance, green) and `goal` (red;
  `goal (relaxed)` when `relaxed: true`). No id labels on other rooms.
  Hover tooltip (transient, not a persistent label): room → id + degree;
  edge → weight + `dirFrom`/`dirTo`.
- **In-SVG header**: monospace block, top-left — seed, preset, W×H, N, E,
  loops, goalDistance, goalSlack (`-` when unset), relaxed, occupancy %.

---

## 7. UI

Layout: **top stats bar**
(same fields as the SVG header), **left sidebar** (~280px), **center
viewport**, collapsible **JSON panel** below the viewport.

- **Generation controls**: preset select (XS–XXL), seed text input, ⟳
  reroll, and numeric fields: gridsize W / H, baseRoomNumber,
  baseCorridorNumber, minFinalDistance, goalSlack (integer ≥ 0, **empty =
  unset** — goal is exactly the farthest room; presets never set it),
  connectivity (0–1, step 0.05), spacing (1–8). **Preset change resets the
  numeric fields** to that preset's defaults (then user edits are overrides).
- **Seed**: empty = auto-generated; the *actual* seed is always shown in
  the stats bar; ⟳ clears the seed field. **First load: preset `M`,
  seed `"default"`** (reproducible first frame).
- **Invalid config**: `generate()` throws → error banner; the last valid
  SVG stays on screen (seeing *what throws* is itself a test feature).
- **Toggles**: view mode (Graph | Tile segmented control), grid backdrop,
  weight labels, shortest path, loop split, in-SVG header.
- **Viewport**: fit-to-view by default + wheel zoom + drag pan (viewBox
  manipulation).
- **JSON panel**: paste → shape check → render + full validation.
  Required shape: `gridsize, baseRoomNumber, baseCorridorNumber,
  minFinalDistance, connectivity, spacing, entranceId, goalId,
   goalDistance, rooms[], edges[]` — missing structural fields or a
   non-grid model → clear "not a ddungeon-gen result" message;
  malformed JSON → parse error shown in the panel. **Copy JSON** button for
  the current dungeon. In JSON mode the generation controls are ignored.
- **Download**: `ddungeon-{preset}-{seed}.svg`, honors current toggles.
- **Theme**: dark — bg `#101318`, panel `#171b22`, room `#3a4150` (filled)
  / `#9aa4b5` (outline), empty cell `#1c2027`, entrance `#4ade80`, goal
  `#f87171`, path `#fbbf24`, loop `#60a5fa`, violation `#ef4444`, text
  `#e5e7eb`.

---

## 8. Test plan (vitest; pure core only — no DOM tests)

- **layout**: grid→pixel mapping; corridor strip/segment points for all
  four directions
- **validate**: known-good dungeon passes with 0 violations; one fixture per
  rule R1–R8 (live-generated dungeon, exactly one field mutated) fires that
  rule id and no other; 0 violations across all 6 presets × several fixed
  seeds
- **graph**: distances, path, loop count `E−(N−1)`, determinism of tree
  extraction
- **svg**: same input → byte-identical string; output parses as
  well-formed XML via `@xmldom/xmldom`; golden snapshots — preset `M`,
  seed `"default"`, one per view
- Fixtures: 2–3 hand-authored tiny dungeons + mutated variants + live
  `generate()` calls with fixed seeds

---

## 9. Acceptance criteria

1. `npm run dev` → first frame = preset M, seed `default`, graph view,
   backdrop on
2. Every control re-renders; invalid config → banner + last valid SVG
   retained
3. JSON paste: valid result renders + validates; old model / malformed →
   clear message
4. Validator: 0 violations on all presets × seeds; catches every R1–R8
   mutation
5. `npm test`, `npm run typecheck`, `npm run lint`,
   `npm run format:check` all green
6. Downloaded file is a well-formed standalone SVG (header block embedded)
7. Docs updated: root `packages/README.md` package table gains a
   `ddungeon-display` row (test tooling); `ddungeon-gen`'s roadmap item
   *"Renderer integration (follow-up task, separate package)"* checked off

---

## 10. Assumptions (cosmetic, decided by this spec)

- Hover tooltip as described in §6 (transient inspection affordance)
- Sidebar/panel geometry as in §7; palette as in §7
- Cell-size clamp 24–96px; font sizes scale relative to cell size so
  XS→XXL stay readable
- `relaxed` shown in stats as `relaxed: true/false`
- Occupancy % = `N/(W·H)`, one decimal

---

## 11. Implementation phases

1. Scaffold package (manifests, configs, `index.html`, `README.md`)
2. `src/core/`: types → layout → graph → validate, tests alongside
3. `src/core/svg/`: builder + graph view + tile view + header/annotations,
   tests alongside
4. `src/ui/`: controls, render loop, panels, zoom/pan, download
5. Docs: root README row + `ddungeon-gen` roadmap checkbox
6. Verify: full test/typecheck/lint/format pass + manual `npm run dev`
   walkthrough of §9
