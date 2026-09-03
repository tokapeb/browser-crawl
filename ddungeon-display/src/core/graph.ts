// ─── Graph analysis ──────────────────────────────────────────────────────
// BFS from the entrance: hop distances, entrance→goal path, and the
// spanning-tree / loop edge split (SPEC §4). Pure and deterministic.

import type { DungeonResult } from 'ddungeon-gen';
import type { Analysis } from './types';

interface BfsResult {
  distances: Map<number, number>;
  treeEdgeIndices: Set<number>;
  /** Parent edge used to first reach each room (for path reconstruction). */
  parent: Map<number, { via: number; from: number }>;
}

/**
 * Unweighted BFS hop distances from `startId`, with deterministic tree-edge
 * extraction: neighbours are explored in edge-index order, so the same input
 * always yields the same tree. Edges referencing unknown room ids are
 * skipped (they can never be tree edges).
 */
export function bfs(d: DungeonResult, startId: number): BfsResult {
  const rooms = Array.isArray(d.rooms) ? d.rooms : [];
  const edges = Array.isArray(d.edges) ? d.edges : [];

  const adj = new Map<number, Array<{ edgeIndex: number; other: number }>>();
  for (const r of rooms) {
    if (r && typeof r.id === 'number' && !adj.has(r.id)) adj.set(r.id, []);
  }
  edges.forEach((e, i) => {
    if (!e || !adj.has(e.from) || !adj.has(e.to)) return;
    adj.get(e.from)!.push({ edgeIndex: i, other: e.to });
    adj.get(e.to)!.push({ edgeIndex: i, other: e.from });
  });

  const distances = new Map<number, number>();
  const treeEdgeIndices = new Set<number>();
  const parent = new Map<number, { via: number; from: number }>();

  if (adj.has(startId)) {
    distances.set(startId, 0);
    const queue: number[] = [startId];
    while (queue.length > 0) {
      const u = queue.shift()!;
      const du = distances.get(u)!;
      for (const { edgeIndex, other } of adj.get(u)!) {
        if (distances.has(other)) continue;
        distances.set(other, du + 1);
        parent.set(other, { via: edgeIndex, from: u });
        treeEdgeIndices.add(edgeIndex);
        queue.push(other);
      }
    }
  }
  for (const r of rooms) {
    if (r && typeof r.id === 'number' && !distances.has(r.id)) distances.set(r.id, Infinity);
  }

  return { distances, treeEdgeIndices, parent };
}

/**
 * Analyzes a dungeon (SPEC §4). The BFS root is `d.entranceId` (room 0 for
 * every valid result).
 */
export function analyze(d: DungeonResult): Analysis {
  const startId =
    Number.isInteger(d.entranceId) && d.rooms.some((r) => r.id === d.entranceId) ? d.entranceId : 0;
  const { distances, treeEdgeIndices, parent } = bfs(d, startId);

  const edges = Array.isArray(d.edges) ? d.edges : [];
  const loopEdgeIndices = new Set<number>();
  edges.forEach((_, i) => {
    if (!treeEdgeIndices.has(i)) loopEdgeIndices.add(i);
  });

  let farthest = 0;
  for (const v of distances.values()) {
    if (v > farthest) farthest = v;
  }

  const goalId = Number.isInteger(d.goalId) ? d.goalId : startId;
  const path: number[] = [];
  if (distances.has(goalId) && distances.get(goalId) !== Infinity) {
    let cur: number | undefined = goalId;
    while (cur !== undefined) {
      path.push(cur);
      if (cur === startId) break;
      cur = parent.get(cur)?.from;
    }
    path.reverse();
  }
  if (path.length === 0) path.push(startId);

  return { distances, path, loopEdgeIndices, farthest };
}

/** Shortest entrance→goal path as a list of room ids (re-exported helper). */
export function pathBetween(d: DungeonResult, fromId: number, toId: number): number[] {
  const { distances, parent } = bfs(d, fromId);
  if (!distances.has(toId) || distances.get(toId) === Infinity) return [];
  const path: number[] = [];
  let cur: number | undefined = toId;
  while (cur !== undefined) {
    path.push(cur);
    if (cur === fromId) break;
    cur = parent.get(cur)?.from;
  }
  path.reverse();
  return path;
}
