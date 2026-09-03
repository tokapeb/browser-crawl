import type { DungeonConfig, DungeonResult, Dir, Edge, Room } from '../types.js';
import { resolveConfig } from '../presets.js';
import { PRNG } from '../util/prng.js';
import { DIRS, DIR_OFFSETS, cellKey, dirBetween, opposite } from '../util/grid.js';
import { bfsHopDistances } from '../util/graph.js';

/** A grid cell. */
interface Cell {
  x: number;
  y: number;
}

/** An edge before its weight is assigned. */
interface EdgeCore {
  from: number;
  to: number;
  dirFrom: Dir;
  dirTo: Dir;
}

/** In-place Fisher-Yates shuffle driven by the seeded PRNG. */
function shuffle<T>(arr: T[], prng: PRNG): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = prng.int(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Darkest-Dungeon-style grid graph generator.
 *
 * Construction (full rule set in docs/DESIGN.md):
 *   1. Place N room cells on the W×H grid by connected blob growth starting
 *      at the entrance — a random cell in the top row (y = 0).
 *   2. Layer 1 — spanning tree over grid-adjacent cells (exactly N − 1 edges),
 *      guaranteeing full reachability from the entrance. Room ids are assigned
 *      in BFS order from the entrance, so room 0 is the entrance.
 *   3. Layer 2 — extra loop edges: the grid-adjacent candidate pool (pairs not
 *      in the tree) is PRNG-shuffled, and each candidate is accepted with
 *      probability `connectivity`, subject to the E cap, the degree ≤ 4
 *      ceiling, and direction-slot uniqueness.
 *   4. Weights — each edge gets `clamp(spacing + int(−2, 2), 1, 8)` in
 *      construction order (tree edges first, then loop edges).
 *   5. Goal — without `goalSlack`: the hop-farthest room (tie-break larger
 *      y, then x), among rooms at distance ≥ `minFinalDistance` (the farthest
 *      always qualifies, or is the relaxed fallback). With `goalSlack = N`:
 *      a seeded-random room within N hops of the farthest, still honoring
 *      `minFinalDistance`; when that pool is empty the farthest room is used
 *      and `relaxed` is set.
 *
 * All randomness flows through the single PRNG instance in the fixed draw
 * order: entrance → blob growth → tree neighbor order → pool shuffle → loop
 * rolls → weight jitter → goal pick (only when `goalSlack` is set).
 */
export class GridGenerator {
  private prng: PRNG;
  private seed: string;

  constructor(seed: string) {
    this.seed = seed;
    this.prng = new PRNG(seed);
  }

  generate(config: DungeonConfig): DungeonResult {
    // Validates the config (preset merge + constraint checks) so bad configs
    // fail loudly before any generation work happens.
    const { preset, resolved } = resolveConfig(config);
    const [w, h] = resolved.gridsize;
    const n = resolved.baseRoomNumber;
    const e = resolved.baseCorridorNumber;
    const { minFinalDistance, goalSlack, connectivity, spacing } = resolved;

    // ── Step 1: place N cells by connected blob growth from the entrance ──
    const entrance: Cell = { x: this.prng.int(0, w - 1), y: 0 };
    const cells: Cell[] = [entrance];
    const cellByKey = new Map<string, Cell>([[cellKey(entrance.x, entrance.y), entrance]]);
    const occupied = new Set<string>([cellKey(entrance.x, entrance.y)]);

    const frontier: Cell[] = [];
    const inFrontier = new Set<string>();
    const pushFrontier = (x: number, y: number): void => {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      const k = cellKey(x, y);
      if (occupied.has(k) || inFrontier.has(k)) return;
      inFrontier.add(k);
      frontier.push({ x, y });
    };
    for (const d of DIRS) {
      const [dx, dy] = DIR_OFFSETS[d];
      pushFrontier(entrance.x + dx, entrance.y + dy);
    }

    while (cells.length < n) {
      // Pick a random frontier cell (swap-and-pop removal keeps this O(1)).
      const idx = this.prng.int(0, frontier.length - 1);
      const cell = frontier[idx];
      frontier[idx] = frontier[frontier.length - 1];
      frontier.pop();
      inFrontier.delete(cellKey(cell.x, cell.y));

      occupied.add(cellKey(cell.x, cell.y));
      cells.push(cell);
      cellByKey.set(cellKey(cell.x, cell.y), cell);
      for (const d of DIRS) {
        const [dx, dy] = DIR_OFFSETS[d];
        pushFrontier(cell.x + dx, cell.y + dy);
      }
    }

    // ── Step 2: spanning tree + room ids (BFS order from the entrance) ──
    const roomOfCell = new Map<string, number>();
    const roomCells: Cell[] = [];
    const treeEdges: EdgeCore[] = [];
    const visited = new Set<string>();

    const growTree = (): void => {
      const startKey = cellKey(entrance.x, entrance.y);
      const queue: string[] = [startKey];
      visited.add(startKey);
      roomOfCell.set(startKey, 0);
      roomCells.push(entrance);
      let nextRoomId = 1;

      while (queue.length > 0) {
        const curKey = queue.shift()!;
        const cur = cellByKey.get(curKey)!;
        const curRoom = roomOfCell.get(curKey)!;

        // Occupied neighbours in fixed order, then PRNG-shuffled for variation.
        const neighborKeys: string[] = [];
        for (const d of DIRS) {
          const [dx, dy] = DIR_OFFSETS[d];
          const nk = cellKey(cur.x + dx, cur.y + dy);
          if (occupied.has(nk)) neighborKeys.push(nk);
        }
        shuffle(neighborKeys, this.prng);

        for (const nk of neighborKeys) {
          if (visited.has(nk)) continue;
          visited.add(nk);
          const nc = cellByKey.get(nk)!;
          roomOfCell.set(nk, nextRoomId);
          roomCells.push(nc);
          const dirFrom = dirBetween(cur.x, cur.y, nc.x, nc.y)!;
          treeEdges.push({ from: curRoom, to: nextRoomId, dirFrom, dirTo: opposite(dirFrom) });
          nextRoomId++;
          queue.push(nk);
        }
      }
    };
    growTree();

    // ── Step 3: loop edges from the shuffled grid-adjacent candidate pool ──
    const degree = new Array<number>(n).fill(0);
    const usedDirs: Set<Dir>[] = Array.from({ length: n }, () => new Set<Dir>());
    const treePairs = new Set<string>();
    for (const edge of treeEdges) {
      degree[edge.from]++;
      degree[edge.to]++;
      usedDirs[edge.from].add(edge.dirFrom);
      usedDirs[edge.to].add(edge.dirTo);
      treePairs.add(pairKey(edge.from, edge.to));
    }

    // Enumerate each unordered adjacent pair once (each room's S and E sides).
    const candidates: Array<{ a: number; b: number }> = [];
    for (let i = 0; i < n; i++) {
      const c = roomCells[i];
      for (const d of ['S', 'E'] as const) {
        const [dx, dy] = DIR_OFFSETS[d];
        const nk = cellKey(c.x + dx, c.y + dy);
        const j = roomOfCell.get(nk);
        if (j === undefined) continue;
        if (treePairs.has(pairKey(i, j))) continue;
        candidates.push({ a: i, b: j });
      }
    }
    shuffle(candidates, this.prng);

    const loopEdges: EdgeCore[] = [];
    for (const cand of candidates) {
      if (treeEdges.length + loopEdges.length >= e) break;
      if (this.prng.random() >= connectivity) continue;
      const { a, b } = cand;
      if (degree[a] >= 4 || degree[b] >= 4) continue;
      const dirAB = dirBetween(roomCells[a].x, roomCells[a].y, roomCells[b].x, roomCells[b].y)!;
      const dirBA = opposite(dirAB);
      if (usedDirs[a].has(dirAB) || usedDirs[b].has(dirBA)) continue;
      loopEdges.push({ from: a, to: b, dirFrom: dirAB, dirTo: dirBA });
      degree[a]++;
      degree[b]++;
      usedDirs[a].add(dirAB);
      usedDirs[b].add(dirBA);
    }

    // ── Step 4: weights in construction order (tree first, then loops) ──
    const edges: Edge[] = [...treeEdges, ...loopEdges].map((core) => ({
      ...core,
      weight: clampWeight(spacing + this.prng.int(-2, 2)),
    }));

    // ── Step 5: goal placement ──
    // Without goalSlack: the hop-farthest room (tie-break y then x) — the
    // historical behavior. With goalSlack = N: a seeded-random room within N
    // hops of the farthest (and still ≥ minFinalDistance); when that pool is
    // empty the farthest room is used and relaxed is set.
    const rooms: Room[] = roomCells.map((c, id) => ({ id, x: c.x, y: c.y }));
    const dist = bfsHopDistances(0, rooms, edges);

    let maxDist = 0;
    for (const d of dist.values()) {
      if (d !== Infinity && d > maxDist) maxDist = d;
    }

    let relaxed = false;
    let goal: Room;
    if (goalSlack !== undefined) {
      const lower = Math.max(minFinalDistance, maxDist - goalSlack);
      const pool = rooms.filter((r) => (dist.get(r.id) ?? Infinity) >= lower);
      if (pool.length > 0) {
        goal = pool[this.prng.int(0, pool.length - 1)];
      } else {
        relaxed = true;
        goal = farthestRoom(rooms, dist);
      }
    } else {
      const pool = rooms.filter((r) => (dist.get(r.id) ?? Infinity) >= minFinalDistance);
      relaxed = pool.length === 0;
      goal = farthestRoom(relaxed ? rooms : pool, dist);
    }
    const goalDistance = dist.get(goal.id) ?? 0;

    return {
      seed: this.seed,
      preset,
      gridsize: [w, h],
      baseRoomNumber: n,
      baseCorridorNumber: e,
      minFinalDistance,
      ...(goalSlack !== undefined ? { goalSlack } : {}),
      connectivity,
      spacing,
      entranceId: 0,
      goalId: goal.id,
      goalDistance,
      relaxed: relaxed || undefined,
      rooms,
      edges,
    };
  }
}

/** The room with the maximum hop distance; tie-break larger y, then larger x. */
function farthestRoom(rooms: Room[], dist: Map<number, number>): Room {
  let goal = rooms[0];
  let best = dist.get(goal.id) ?? 0;
  for (const r of rooms.slice(1)) {
    const d = dist.get(r.id) ?? 0;
    if (d > best || (d === best && (r.y > goal.y || (r.y === goal.y && r.x > goal.x)))) {
      goal = r;
      best = d;
    }
  }
  return goal;
}

/** Sorted-pair key so (a,b) and (b,a) are identical. */
function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

/** Clamp a corridor weight to the integer tile range [1, 8]. */
function clampWeight(weight: number): number {
  return Math.min(8, Math.max(1, weight));
}
