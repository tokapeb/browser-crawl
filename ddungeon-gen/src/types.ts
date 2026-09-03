// ─── Types ─────────────────────────────────────────────────────────────

/** Exit directions on the grid. N/S change y, E/W change x. */
export type Dir = 'N' | 'S' | 'E' | 'W';

/** Named preset bundles (see `presets.ts` for the table). */
export type PresetName = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

// ─── Input ─────────────────────────────────────────────────────────────

/**
 * Configuration for {@link generate}. All fields except `seed` are optional:
 * the preset supplies defaults and any explicitly set field overrides the
 * preset value.
 */
export interface DungeonConfig {
  /** Deterministic key. Auto-generated (128-bit hex) when omitted, always stored in the output. */
  seed?: string | number;
  /** Preset to take defaults from. Defaults to `'M'`. */
  preset?: PresetName;
  /** Grid size `[W, H]` (columns, rows). */
  gridsize?: [number, number];
  /** Number of room nodes N placed on the grid. Hard ceiling: `W · H`. */
  baseRoomNumber?: number;
  /** Number of corridor edges E. Hard floor `N − 1` (values below are clamped up). */
  baseCorridorNumber?: number;
  /** Minimum graph distance in hops from the entrance to the goal. */
  minFinalDistance?: number;
  /**
   * Goal slack in hops: when set, the goal is a random room within this many
   * hops of the farthest room (distance in `[max(minFinalDistance, maxDist−N), maxDist]`).
   * When omitted the goal is exactly the farthest room (historical behavior).
   */
  goalSlack?: number;
  /** Probability p ∈ [0, 1] that a non-tree candidate edge is added (loop density). */
  connectivity?: number;
  /** Base corridor length in tiles; each weight is sampled around it, clamped to [1, 8]. */
  spacing?: number;
}

// ─── Output (shared contract for all populate packages) ───────────────

/** A room occupying exactly one grid cell. */
export interface Room {
  /** Sequential 0..N−1 in BFS order from the entrance. Room 0 is the entrance. */
  id: number;
  /** Grid column, 0 ≤ x < W. */
  x: number;
  /** Grid row, 0 ≤ y < H. Row 0 is the top. */
  y: number;
}

/**
 * A corridor between two grid-adjacent rooms, fully typed by the exit
 * direction at each end. `to` is always `from + unit(dirFrom)` and
 * `dirTo` is always the geometric opposite of `dirFrom`.
 */
export interface Edge {
  /** Room id the corridor leaves via `dirFrom`. */
  from: number;
  /** Room id the corridor leaves via `dirTo`. */
  to: number;
  /** Direction the corridor leaves `from`. */
  dirFrom: Dir;
  /** Direction the corridor leaves `to` (opposite of `dirFrom`). */
  dirTo: Dir;
  /** Corridor length in tiles, integer 1..8. */
  weight: number;
}

export interface DungeonResult<
  TPopulate extends Record<string, unknown[]> = Record<string, never>,
> {
  /** The seed used (auto-generated if omitted). */
  seed: string;
  /** The preset the defaults came from. */
  preset: PresetName;
  /** Resolved grid size `[W, H]` (preset default or override). */
  gridsize: [number, number];
  /** Resolved room count N. */
  baseRoomNumber: number;
  /** Resolved corridor count E (after the `N − 1` floor clamp). */
  baseCorridorNumber: number;
  /** Resolved minimum entrance→goal hop distance. */
  minFinalDistance: number;
  /** Resolved goal slack (hops from the farthest room); absent when unset. */
  goalSlack?: number;
  /** Resolved loop-edge probability p. */
  connectivity: number;
  /** Resolved base corridor length. */
  spacing: number;
  /** Id of the entrance room (always 0). */
  entranceId: number;
  /** Id of the goal room. */
  goalId: number;
  /** Actual hop distance entrance → goal in the generated graph. */
  goalDistance: number;
  /** True when no room reached `minFinalDistance` and the farthest room was used instead. */
  relaxed?: boolean;
  /** Room nodes; room 0 is the entrance. */
  rooms: Room[];
  /** Corridor edges; always a connected graph rooted at the entrance. */
  edges: Edge[];
  /** Filled in by populate packages. */
  populate?: TPopulate;
}
