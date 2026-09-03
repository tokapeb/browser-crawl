// ─── Grid helpers ────────────────────────────────────────────────────────
// Integer grid of size W × H. A room occupies exactly one cell (x, y) with
// 0 ≤ x < W, 0 ≤ y < H. Row 0 is the top. N decreases y, S increases y.

import type { Dir } from '../types.js';

/** Grid offset per direction. */
export const DIR_OFFSETS: Record<Dir, readonly [number, number]> = {
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
};

/** All four directions in fixed order. */
export const DIRS: readonly Dir[] = ['N', 'S', 'E', 'W'];

/** The geometric opposite direction (N↔S, E↔W). */
export function opposite(dir: Dir): Dir {
  switch (dir) {
    case 'N':
      return 'S';
    case 'S':
      return 'N';
    case 'E':
      return 'W';
    case 'W':
      return 'E';
  }
}

/** Canonical key for a grid cell. */
export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Direction from cell (x1, y1) to (x2, y2). Returns null when the cells are
 * not grid-adjacent (Δx + Δy ≠ 1) — edges may only run between adjacent cells.
 */
export function dirBetween(x1: number, y1: number, x2: number, y2: number): Dir | null {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  if (dy === -1) return 'N';
  if (dy === 1) return 'S';
  if (dx === 1) return 'E';
  return 'W';
}
