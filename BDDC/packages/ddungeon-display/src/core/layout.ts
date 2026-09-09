// ─── Layout ──────────────────────────────────────────────────────────────
// Grid → pixel mapping: cell size, origin, room blocks, corridor strips and
// segment points. Pure and deterministic (SPEC §3/§4/§6).

import type { DungeonResult, Dir } from 'ddungeon-gen';
import type { EdgeGeometry, Layout, Point, Rect, RoomGeometry } from './types';

/** Reference canvas (px) the auto-fit cell size targets on the larger axis. */
export const REFERENCE_PX = 960;
/** Cell-size clamp (SPEC §10). */
export const MIN_CELL = 24;
export const MAX_CELL = 96;
/** Fraction of a cell reserved for the corridor channel (split into two insets). */
const GAP_FRACTION = 0.32;
/** Minimum corridor channel width (px). */
const MIN_GAP_HALF = 6;

const DIR_OFFSETS: Record<Dir, readonly [number, number]> = {
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
};

export function clampCell(n: number): number {
  return Math.min(MAX_CELL, Math.max(MIN_CELL, Math.floor(n)));
}

/**
 * Computes the pixel layout for a dungeon.
 *
 * Geometry model (SPEC §6): rooms sit on a regular grid; each room block is
 * its cell inset by `gap/2` on every side, so the corridor channel between two
 * adjacent blocks has width `gap` and the corridor spans the full gap. All
 * corridors therefore have equal visual length; weight is conveyed by the
 * segment count (`weight` equal segments, segment size = gap/weight).
 */
export function computeLayout(d: DungeonResult): Layout {
  const [w, h] = Array.isArray(d.gridsize) ? d.gridsize : [NaN, NaN];
  const W = Number.isInteger(w) && w >= 2 ? w : 2;
  const H = Number.isInteger(h) && h >= 2 ? h : 2;

  const cellSize = clampCell(Math.min(REFERENCE_PX / W, REFERENCE_PX / H));
  const gap = 2 * Math.max(MIN_GAP_HALF, Math.round((cellSize * GAP_FRACTION) / 2));
  const stripW = Math.max(4, Math.round(gap * 0.6));
  const padding = Math.max(24, Math.round(cellSize * 0.5));
  const width = W * cellSize + 2 * padding;
  const height = H * cellSize + 2 * padding;
  const originX = padding;
  const originY = padding;
  const inset = gap / 2;
  const blockHalf = cellSize / 2 - inset; // block edge offset from the cell center

  const roomById = new Map<number, RoomGeometry>();
  const rooms: RoomGeometry[] = [];
  const rawRooms = Array.isArray(d.rooms) ? d.rooms : [];
  for (const r of rawRooms) {
    if (!r || typeof r.id !== 'number') continue;
    const rx = Number.isFinite(r.x) ? r.x : 0;
    const ry = Number.isFinite(r.y) ? r.y : 0;
    const cx = originX + rx * cellSize + cellSize / 2;
    const cy = originY + ry * cellSize + cellSize / 2;
    const rect: Rect = {
      x: cx - blockHalf,
      y: cy - blockHalf,
      w: blockHalf * 2,
      h: blockHalf * 2,
    };
    const geo: RoomGeometry = { id: r.id, x: rx, y: ry, rect, cx, cy };
    rooms.push(geo);
    roomById.set(r.id, geo);
  }

  const fallback: RoomGeometry = {
    id: -1,
    x: 0,
    y: 0,
    rect: { x: originX, y: originY, w: 0, h: 0 },
    cx: originX,
    cy: originY,
  };

  const rawEdges = Array.isArray(d.edges) ? d.edges : [];
  const edges: EdgeGeometry[] = rawEdges.map((e, index) => {
    const a = (e && roomById.get(e.from)) || fallback;
    const b = (e && roomById.get(e.to)) || fallback;
    let ax = b.cx - a.cx;
    let ay = b.cy - a.cy;
    const len = Math.hypot(ax, ay);
    if (len === 0) {
      ax = 1;
      ay = 0;
    } else {
      ax /= len;
      ay /= len;
    }
    const start: Point = { x: a.cx + ax * blockHalf, y: a.cy + ay * blockHalf };
    const end: Point = { x: b.cx - ax * blockHalf, y: b.cy - ay * blockHalf };
    const weight = e && Number.isFinite(e.weight) ? Math.max(1, Math.floor(e.weight)) : 1;
    const segmentPoints: Point[] = [];
    for (let i = 0; i <= weight; i++) {
      segmentPoints.push({
        x: start.x + ax * gap * (i / weight),
        y: start.y + ay * gap * (i / weight),
      });
    }
    return {
      index,
      a: { x: a.cx, y: a.cy },
      b: { x: b.cx, y: b.cy },
      start,
      end,
      nx: -ay,
      ny: ax,
      segmentPoints,
    };
  });

  return {
    width,
    height,
    cellSize,
    gap,
    stripW,
    padding,
    originX,
    originY,
    rooms,
    edges,
  };
}

/** Cell rect (full cell, before block inset) in px. */
export function cellRect(layout: Layout, x: number, y: number): Rect {
  return {
    x: layout.originX + x * layout.cellSize,
    y: layout.originY + y * layout.cellSize,
    w: layout.cellSize,
    h: layout.cellSize,
  };
}

/** Grid offset per direction (row 0 is the top; N decreases y). */
export { DIR_OFFSETS };
