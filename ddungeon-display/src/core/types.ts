// ─── Core types ──────────────────────────────────────────────────────────
// Pure, DOM-free. `ddungeon-gen` is imported for types only (no runtime
// dependency from the core), so this layer can be lifted into a library.

import type { DungeonResult } from 'ddungeon-gen';

/** A point in SVG pixel space. */
export interface Point {
  x: number;
  y: number;
}

/** An axis-aligned rect in SVG pixel space. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Rendering options for {@link renderSvg} (see SPEC §4). */
export interface ViewOptions {
  view: 'graph' | 'tile';
  /** Full W×H grid backdrop (empty cells faint). Default true. */
  showBackdrop: boolean;
  /** Corridor weight labels. Default true. */
  showWeights: boolean;
  /** Entrance→goal shortest-path overlay. Default true. */
  showPath: boolean;
  /** Tree vs loop edge coloring. Default true. */
  showLoopSplit: boolean;
  /** Stats text block inside the SVG. Default true. */
  showHeader: boolean;
  /** Canvas width in px; default auto-fit to the layout. */
  width?: number;
  /** Canvas height in px; default auto-fit to the layout. */
  height?: number;
}

/** The eight contract rules validated by {@link validate} (SPEC §5). */
export type RuleId = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8';

/** A single contract violation, optionally pinpointing rooms/edges. */
export interface Violation {
  rule: RuleId;
  message: string;
  roomIds?: number[];
  edgeIndex?: number;
}

/** Graph analysis: BFS distances, entrance→goal path, loop edges (SPEC §4). */
export interface Analysis {
  /** BFS hop distance from the entrance; unreachable rooms map to Infinity. */
  distances: Map<number, number>;
  /** Room ids, entrance→goal (shortest hop path). */
  path: number[];
  /** Edge indices not in the BFS spanning tree. */
  loopEdgeIndices: Set<number>;
  /** Maximum hop distance (Infinity when the graph is disconnected). */
  farthest: number;
}

/** Pixel geometry of one room. */
export interface RoomGeometry {
  id: number;
  /** Grid column/row the room occupies. */
  x: number;
  y: number;
  /** Room block: the cell rect inset by the corridor gap on all sides. */
  rect: Rect;
  /** Block center (== cell center). */
  cx: number;
  cy: number;
}

/** Pixel geometry of one corridor. */
export interface EdgeGeometry {
  index: number;
  /** Room-center endpoints (graph-view line). */
  a: Point;
  b: Point;
  /** Corridor strip endpoints, at the room-block edges (tile view). */
  start: Point;
  end: Point;
  /** Unit vector perpendicular to the corridor axis (strip thickness). */
  nx: number;
  ny: number;
  /** Strip boundary points: `weight + 1` points, first == start, last == end. */
  segmentPoints: Point[];
}

/** The full pixel mapping for a dungeon (SPEC §4: computeLayout). */
export interface Layout {
  /** Canvas width in px (auto-fit; ViewOptions.width overrides at render). */
  width: number;
  /** Canvas height in px (auto-fit; ViewOptions.height overrides at render). */
  height: number;
  /** Pixel size of one grid cell, clamped to 24–96. */
  cellSize: number;
  /** Corridor channel between two adjacent room blocks (px). */
  gap: number;
  /** Corridor strip thickness (px, perpendicular to the corridor axis). */
  stripW: number;
  /** Canvas margin around the grid (px). */
  padding: number;
  /** Top-left corner of grid cell (0, 0) in px. */
  originX: number;
  originY: number;
  rooms: RoomGeometry[];
  edges: EdgeGeometry[];
}

export type Dungeon = DungeonResult;
