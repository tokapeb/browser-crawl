// ─── Fixtures ────────────────────────────────────────────────────────────
// Hand-authored tiny dungeons, per-rule mutations of live-generated dungeons
// (each mutation touches exactly one field), and a live generate() helper.

import { generate } from 'ddungeon-gen';
import type { DungeonResult, Edge, Room } from 'ddungeon-gen';

export function clone(d: DungeonResult): DungeonResult {
  return JSON.parse(JSON.stringify(d)) as DungeonResult;
}

/** Live-generated base dungeon for mutation fixtures (fixed seed ⇒ stable). */
export function live(preset: DungeonResult['preset'] = 'XS', seed = 'fixture'): DungeonResult {
  return generate({ preset, seed });
}

// ─── Hand-authored tiny dungeons (all valid: 0 violations expected) ─────

function base(
  d: Omit<DungeonResult, 'entranceId' | 'relaxed'> & { entranceId?: number },
): DungeonResult {
  return { entranceId: 0, relaxed: undefined, ...d };
}

/** 3-room L: 0(0,0) — 1(0,1) — 2(1,1). Tree only, goal = 2 at dist 2. */
export function handL(): DungeonResult {
  const rooms: Room[] = [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: 0, y: 1 },
    { id: 2, x: 1, y: 1 },
  ];
  const edges: Edge[] = [
    { from: 0, to: 1, dirFrom: 'S', dirTo: 'N', weight: 2 },
    { from: 1, to: 2, dirFrom: 'E', dirTo: 'W', weight: 3 },
  ];
  return base({
    seed: 'hand-l',
    preset: 'XS',
    gridsize: [3, 3],
    baseRoomNumber: 3,
    baseCorridorNumber: 2,
    minFinalDistance: 2,
    connectivity: 0,
    spacing: 2,
    goalId: 2,
    goalDistance: 2,
    rooms,
    edges,
  });
}

/**
 * 2×2 square with one loop: 0(0,0) — 1(1,0) — 2(1,1), 2 — 3(0,1), 3 — 0.
 * Contains corridors in all four directions (E, S, W, N); goal = 2 at dist 2.
 */
export function handSquare(): DungeonResult {
  const rooms: Room[] = [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: 1, y: 0 },
    { id: 2, x: 1, y: 1 },
    { id: 3, x: 0, y: 1 },
  ];
  const edges: Edge[] = [
    { from: 0, to: 1, dirFrom: 'E', dirTo: 'W', weight: 2 },
    { from: 1, to: 2, dirFrom: 'S', dirTo: 'N', weight: 3 },
    { from: 2, to: 3, dirFrom: 'W', dirTo: 'E', weight: 4 },
    { from: 3, to: 0, dirFrom: 'N', dirTo: 'S', weight: 5 },
  ];
  return base({
    seed: 'hand-square',
    preset: 'XS',
    gridsize: [2, 2],
    baseRoomNumber: 4,
    baseCorridorNumber: 4,
    minFinalDistance: 2,
    connectivity: 1,
    spacing: 3,
    goalId: 2,
    goalDistance: 2,
    rooms,
    edges,
  });
}

/** 4-room line along row 0; weights 1–3; goal = 3 at dist 3. */
export function handLine(): DungeonResult {
  const rooms: Room[] = [
    { id: 0, x: 0, y: 0 },
    { id: 1, x: 1, y: 0 },
    { id: 2, x: 2, y: 0 },
    { id: 3, x: 3, y: 0 },
  ];
  const edges: Edge[] = [
    { from: 0, to: 1, dirFrom: 'E', dirTo: 'W', weight: 1 },
    { from: 1, to: 2, dirFrom: 'E', dirTo: 'W', weight: 2 },
    { from: 2, to: 3, dirFrom: 'E', dirTo: 'W', weight: 3 },
  ];
  return base({
    seed: 'hand-line',
    preset: 'XS',
    gridsize: [4, 2],
    baseRoomNumber: 4,
    baseCorridorNumber: 3,
    minFinalDistance: 3,
    connectivity: 0,
    spacing: 2,
    goalId: 3,
    goalDistance: 3,
    rooms,
    edges,
  });
}

// ─── Per-rule mutations (exactly one field mutated per fixture) ─────────

/**
 * R1: shift every room out of bounds (x += W). Shifting the whole blob keeps
 * every edge grid-adjacent, so only R1 fires. (Moving a single room would
 * also break R2 for its incident edges.)
 */
export function mutateR1(d: DungeonResult): DungeonResult {
  const c = clone(d);
  const shift = c.gridsize[0];
  for (const r of c.rooms) r.x += shift;
  return c;
}

/** R1 duplicate-cell check: add a room on top of room 0's cell. */
export function mutateR1Overlap(d: DungeonResult): DungeonResult {
  const c = clone(d);
  c.rooms.push({ id: c.rooms.length, x: c.rooms[0].x, y: c.rooms[0].y });
  return c;
}

/** R2: retarget an edge's dirFrom at a geometrically wrong but slot-free direction. */
export function mutateR2(d: DungeonResult): DungeonResult {
  const c = clone(d);
  const dirs: Edge['dirFrom'][] = ['N', 'S', 'E', 'W'];
  for (const e of c.edges) {
    const usedAtFrom = new Set(c.edges.filter((x) => x.from === e.from).map((x) => x.dirFrom));
    const alt = dirs.find((dir) => dir !== e.dirFrom && !usedAtFrom.has(dir));
    if (alt) {
      e.dirFrom = alt;
      return c;
    }
  }
  throw new Error('no R2-mutable edge found');
}

/**
 * R3: duplicate an edge (parallel corridor) — duplicate direction slots at
 * both endpoints. Requires a dungeon with edge slack (E < baseCorridorNumber)
 * so the added edge stays inside R4's range; searches fixed seeds in order.
 */
export function r3Fixture(): DungeonResult {
  const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  for (const s of seeds) {
    const d = live('XS', s);
    if (d.edges.length < d.baseCorridorNumber) {
      const c = clone(d);
      c.edges.push({ ...c.edges[0] });
      return c;
    }
  }
  throw new Error('no R3 fixture seed with edge slack found');
}

/** R4: lower baseCorridorNumber below the actual edge count. */
export function mutateR4(d: DungeonResult): DungeonResult {
  const c = clone(d);
  c.baseCorridorNumber = c.edges.length - 1;
  return c;
}

/** R5: move the entrance id away from 0. */
export function mutateR5(d: DungeonResult): DungeonResult {
  const c = clone(d);
  c.entranceId = c.rooms.length - 1;
  return c;
}

/** R6: corrupt the reported goal distance. */
export function mutateR6(d: DungeonResult): DungeonResult {
  const c = clone(d);
  c.goalDistance += 1;
  return c;
}

/** R7: push one weight out of the 1..8 range. */
export function mutateR7(d: DungeonResult): DungeonResult {
  const c = clone(d);
  c.edges[0].weight = 9;
  return c;
}

/** R8: corrupt the declared room count. */
export function mutateR8(d: DungeonResult): DungeonResult {
  const c = clone(d);
  c.baseRoomNumber += 1;
  return c;
}
