import type { Dir, Edge, Room } from '../types.js';

// ─── Shared edge helpers ────────────────────────────────────────────────

/**
 * Deduplicated set of undirected edges — keys are sorted pairs so A-B and
 * B-A are identical. The first added edge wins.
 */
export class EdgeSet {
  private edges: Edge[] = [];
  private set = new Set<string>();

  private keyOf(from: number, to: number): string {
    return from < to ? `${from}-${to}` : `${to}-${from}`;
  }

  add(from: number, to: number, dirFrom: Dir, dirTo: Dir, weight: number): void {
    if (from === to) return;
    const key = this.keyOf(from, to);
    if (this.set.has(key)) return;
    this.set.add(key);
    this.edges.push({ from, to, dirFrom, dirTo, weight });
  }

  has(from: number, to: number): boolean {
    if (from === to) return false;
    return this.set.has(this.keyOf(from, to));
  }

  get size(): number {
    return this.edges.length;
  }

  /** Returns a copy of the edges in insertion order. */
  values(): Edge[] {
    return [...this.edges];
  }
}

// ─── Unweighted hop distances (BFS) ─────────────────────────────────────

/**
 * Unweighted BFS hop distances from `startId`. Returns a map of room id →
 * hop count; rooms unreachable from the start are mapped to Infinity
 * (should not happen — graphs are connected by construction).
 * O(V + E).
 */
export function bfsHopDistances(
  startId: number,
  rooms: Room[],
  edges: Edge[],
): Map<number, number> {
  const adj = new Map<number, number[]>();
  for (const room of rooms) adj.set(room.id, []);
  for (const edge of edges) {
    adj.get(edge.from)!.push(edge.to);
    adj.get(edge.to)!.push(edge.from);
  }

  const dist = new Map<number, number>([[startId, 0]]);
  const queue: number[] = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const d = dist.get(current)!;
    for (const next of adj.get(current) ?? []) {
      if (!dist.has(next)) {
        dist.set(next, d + 1);
        queue.push(next);
      }
    }
  }

  for (const room of rooms) {
    if (!dist.has(room.id)) dist.set(room.id, Infinity);
  }
  return dist;
}
