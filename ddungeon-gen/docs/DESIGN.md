# DESIGN — `ddungeon-gen` Layout-Only Generation Rules (Graph Model)

Pure topology. No biome, no corridor content, no environment art — just the
node/edge structure and the geometry rule that governs it. This document is the
authoritative spec for the generator. The implementation in `src/` must satisfy
every rule here; the tests in `tests/` verify them.

> **Status:** implemented (0.1.0). The construction rules below are fully
> implemented in `src/generator/GridGenerator.ts` and verified by the
> invariant tests in `tests/`.
>
> **Conformance notes:**
> - The Layer-2 *direction-slot* rejection is enforced explicitly even though
>   it is subsumed by candidate-pair uniqueness (a candidate is by definition a
>   pair not already connected, and a direction names exactly one neighbour
>   cell). It is kept to mirror the spec literally and as a safety invariant.
> - With `connectivity = 1` the degree ceiling also cannot reject: a cell's
>   degree equals its number of occupied neighbours (≤ 4), so all candidates
>   are accepted up to the `E` cap or pool exhaustion.

---

## 1. Coordinate space

- A room occupies exactly one cell `(x, y)` on an integer grid of size `W × H`
  (`gridsize`).
- `0 ≤ x < W`, `0 ≤ y < H`.
- A room's four possible exit directions are `{N, S, E, W}`, mapping to the four
  grid-adjacent cells `(x, y-1)`, `(x, y+1)`, `(x+1, y)`, `(x-1, y)`.
- **Row 0 is the top.** `N` decreases `y`, `S` increases `y` (see
  `DIR_OFFSETS` in `src/util/grid.ts`).

---

## 2. Node (room) rules

| Rule | Constraint |
|---|---|
| Count | `N = base_room_number`, placed on `W×H` cells, `N ≤ W·H` (observed occupancy ≈ 60–75% of cells) |
| Degree | `1 ≤ deg(room) ≤ 4` — never isolated, never more than 4 |
| Direction slots | Each of a room's ≤4 edges occupies a **distinct** direction slot: a room can have at most **one** N-edge, **one** S-edge, **one** E-edge, **one** W-edge |
| Entrance | Exactly 1 node, fixed as the root; always `deg ≥ 1`. Placed at a random cell in the **top row** (`y = 0`). Room ids are assigned in BFS order from the entrance, so the entrance is **always room 0** (`entranceId = 0`). |
| Goal node | Exactly 1 node; must satisfy `graph_dist(entrance, goal) ≥ min_final_distance` (hop count, not tile length), and — when `goal_slack` is set — must lie within `goal_slack` hops of the farthest room. By default (no `goal_slack`) the goal **is** the farthest room. When unsatisfiable the farthest room is used and `relaxed = true` (see §5). |

Because rooms are placed on a grid and edges are only ever between
grid-adjacent cells, `deg ≤ 4` and direction-slot uniqueness follow from
geometry — but the generator still enforces both explicitly when adding edges
(§4), and the tests assert them.

---

## 3. Edge (corridor) rules

An edge is fully specified by a **4-tuple** (+ weight):

```
Edge = ( A, dir_out_A, B, dir_out_B, weight )
```

- `A`, `B` — the two connected room-nodes.
- `dir_out_A ∈ {N,S,E,W}` — the direction the corridor leaves node `A`.
- `dir_out_B` — the direction it leaves node `B` (always the geometric opposite
  of `dir_out_A`, since edges only run between grid-adjacent cells: N↔S, E↔W).
- `weight ∈ [1, 8]` — corridor length in tiles, centered around a base
  `spacing` value per preset (sampled as `clamp(spacing + int(−2, 2), 1, 8)`).

| Rule | Constraint |
|---|---|
| Adjacency | An edge may only connect cells that are grid-adjacent (`Δx+Δy = 1`, one step in one of the 4 directions) — no long-range or diagonal edges |
| Count | `E = base_corridor_number`, with a hard floor `E ≥ N − 1` (values below are clamped up) |
| Direction uniqueness | Each node can only emit **one** edge per direction (no double N-edges from the same room) |
| Weight | `weight ∈ [1, 8]`, integer tiles |

The output `Edge` object mirrors the 4-tuple: `{ from, to, dirFrom, dirTo,
weight }` with `to = from + unit(dirFrom)` and `dirTo = opposite(dirFrom)`.

---

## 4. Graph-shape construction rule

The edge set is built in two layers, not placed randomly all at once:

```
Layer 1 — Spanning tree (mandatory):
    Build a spanning tree T over the N room-nodes using only
    grid-adjacent candidate edges.
    → guarantees full reachability from the entrance
    → uses exactly N − 1 edges
    → automatically respects deg ≤ 4 and direction-uniqueness,
      since only grid-adjacent cells are eligible

Layer 2 — Extra "loop" edges (optional, capped):
    candidate_pool = all grid-adjacent pairs NOT already in T
    for each candidate edge in candidate_pool:
        add it with probability p = connectivity      (0 ≤ p ≤ 1)
        REJECT if it would exceed E (base_corridor_number)
        REJECT if it would push either endpoint's degree above 4
        REJECT if the needed direction slot on either endpoint
                is already occupied
    stop once E total edges are placed (or pool exhausted)
```

**Placement of the nodes.** The N room cells are placed by *connected blob
growth*: start from the entrance cell and repeatedly add a random (seeded)
empty cell that is grid-adjacent to the current blob, until N cells are placed.
This guarantees the occupied cells form a single 4-connected region, which is
what makes the Layer-1 spanning tree always constructible. It also produces the
organic, downward-biased silhouettes characteristic of DD maps.

**Determinism of the loop layer.** `candidate_pool` is shuffled with the seeded
PRNG before the probability pass, so a given `(seed, config)` always yields the
same edge set.

Resulting invariant:

```
N − 1  ≤  E  ≤  min( base_corridor_number,
                      4N/2,                      -- degree ceiling
                      |grid-adjacency graph| )    -- candidate ceiling
```

The number of "extra" (non-tree) edges is `E − (N − 1)` — this single number is
the whole determinant of how loop-heavy vs. tree-like/linear the layout is.

---

## 5. Goal-room placement rule (pure topology, tie-break only)

```
candidates = { rooms r : graph_dist(entrance, r) ≥ min_final_distance }
goal = argmax over candidates of graph_dist(entrance, r)
tie-break 1: prefer larger y (further "down")
tie-break 2: prefer larger x (further "right")
```

`graph_dist` is the unweighted hop distance in the **final** graph (tree + loop
edges), computed by BFS. The argmax over `candidates` is always the overall
farthest room (when the pool is non-empty it contains the farthest room), so
**without `goal_slack` the goal is always the farthest room**; `min_final_distance`
only decides whether the result is `relaxed`.

**Goal slack (optional `goal_slack = N`, integer ≥ 0).** When set, the goal is
not the exact farthest room but a **seeded-random** room within `N` hops of it,
still honoring the minimum distance:

```
lower    = max( min_final_distance, max_dist − N )
pool     = { rooms r : graph_dist(entrance, r) ≥ lower }
goal     = uniform random pick from pool (seeded PRNG, last draw of the run)
```

where `max_dist` is the largest hop distance in the graph. With `N = 0` the pool
is exactly the farthest room(s): a single farthest room makes `goal_slack = 0`
identical to the default behavior, while several tied farthest rooms are picked
randomly (the default instead uses the y/x tie-break). Distance is measured in
**hops**, never in summed edge weights.

**Relaxation.** If the candidate pool is empty — i.e. no room reaches
`min_final_distance` (with or without slack, since `max_dist − N ≤ max_dist`) —
the goal is the overall farthest room (argmax over all rooms, same tie-breaks),
`goalDistance` reports the actual (shorter) distance,
and `relaxed = true` is set on the result. This keeps generation total: a
config that asks for an unreachable distance still produces a valid dungeon
instead of throwing. When `relaxed`, the goal is the farthest room, which
trivially satisfies any `goal_slack`.

---

## 6. Presets

A preset bundles the full parameter set for one dungeon scale. Explicit config
fields override the preset value field-by-field (see
`resolveConfig` in `src/presets.ts`).

| preset | gridsize `W×H` | N (rooms) | occupancy | E (corridors) | min_final_dist | connectivity `p` | spacing |
|---|---|---|---|---|---|---|---|
| `XS`  | 3×3   | 5   | 56% | 6   | 2 | 0.35 | 2 |
| `S`   | 4×4   | 10  | 63% | 12  | 3 | 0.40 | 3 |
| `M`   | 5×5   | 16  | 64% | 19  | 4 | 0.45 | 3 |
| `L`   | 6×6   | 24  | 67% | 29  | 5 | 0.50 | 3 |
| `XL`  | 7×7   | 32  | 65% | 39  | 6 | 0.55 | 4 |
| `XXL` | 7×8   | 38  | 68% | 46  | 6 | 0.45 | 4 |

Default preset is `M` when none is named.

Design notes:
- **Occupancy** (`N / (W·H)`) targets the observed 60–75% band for S–XXL; the
  tiny XS preset runs just below (~56%).
- **E stays near ~1.2·N.** The loop edges `E − (N−1)` are the loop-heaviness
  dial; keeping `E/N` in a narrow band keeps every preset in the same
  "tree + a handful of loops" family.
- **`min_final_distance`** is a hop count kept well below the maximum plausible
  tree depth for the grid, so it is satisfiable in practice (relaxation in §5
  is a safety net, not the common path).

### Config validation (throws)

`resolveConfig` validates and throws on:

- `gridsize` not two integers ≥ 2
- `baseRoomNumber` not an integer ≥ 2 (rooms are never isolated), or `> W·H`
- `baseCorridorNumber` not a positive integer (values below `N − 1` are clamped up)
- `minFinalDistance` not an integer ≥ 1
- `goalSlack` not an integer ≥ 0 when provided (presets leave it unset)
- `connectivity` not a number in `[0, 1]`
- `spacing` not an integer in `[1, 8]`

---

## 7. Determinism

Same `(seed, config)` always produces identical output. All randomness flows
through a single seeded PRNG instance (Mulberry32, djb2 string hash) in this
**fixed draw order**:

1. entrance cell (top row)
2. blob-growth cell choices (placement)
3. Layer-1 spanning-tree neighbor order
4. Layer-2 candidate-pool shuffle
5. Layer-2 per-candidate `connectivity` rolls
6. per-edge weight jitter
7. goal pick (only when `goal_slack` is set)

No `Math.random()` in the generation pipeline (the auto-seed path uses the
platform CSPRNG, with a `Math.random()` fallback only in environments without
Web Crypto).

---

## 8. Minimal formal summary

```
Graph G = (V, E)
V = { room_i = (x_i, y_i) | i = 1..N },  x_i,y_i on grid W×H
E = { (room_a, dir_a, room_b, dir_b, w) }
    such that: room_b = room_a + unit_vector(dir_a)
               dir_b   = opposite(dir_a)
               w ∈ [1,8]

Constraints:
  1 ≤ deg(v) ≤ 4                       ∀ v ∈ V
  no two edges from v share a direction ∀ v ∈ V
  N - 1 ≤ |E| ≤ base_corridor_number
  G is connected (guaranteed by spanning-tree layer)
  dist(entrance, goal) ≥ min_final_distance  (else relaxed = true)
  dist(entrance, goal) ≥ max_dist − goal_slack  (when goal_slack set; else goal = farthest)
  entrance: y = 0, id = 0
```

That's the entire layout grammar: place N nodes on a grid (connected blob),
connect them with a spanning tree (guaranteed single path skeleton), then
probabilistically re-add a bounded number of extra grid-adjacent edges as
loops, with every edge typed by its exit direction on each end and a 1–8 tile
weight.

---

## 9. Out of scope (by design)

- No biome, no corridor content, no environment art — pure topology.
- No room labels / theme flavoring (rooms are identified by id + cell only).
- No multi-segment / hybrid composition — a single connected grid graph.
- No pre-existing `DungeonResult`s that must stay stable; output for a given
  seed may change across pre-1.0 versions.
