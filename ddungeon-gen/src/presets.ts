// ─── Presets ───────────────────────────────────────────────────────────
// A preset bundles the full parameter set for one dungeon scale. Explicit
// config fields override the preset value field-by-field (see docs/DESIGN.md).

import type { DungeonConfig, PresetName } from './types.js';

/** Resolved generation parameters (preset defaults with overrides applied). */
export interface ResolvedConfig {
  gridsize: [number, number];
  baseRoomNumber: number;
  baseCorridorNumber: number;
  minFinalDistance: number;
  /** Goal slack in hops (config override only; presets leave it unset). */
  goalSlack?: number;
  connectivity: number;
  spacing: number;
}

/**
 * Preset table.
 *
 * - Occupancy (`baseRoomNumber / (W·H)`) targets the observed 60–75% band for
 *   S–XXL; the tiny XS preset runs just below (~56%).
 * - `baseCorridorNumber` stays near ~1.2·N: the loop edges (`E − (N−1)`)
 *   determine how loop-heavy vs. tree-like the layout is.
 * - `minFinalDistance` is a hop count and stays well below the maximum
 *   plausible tree depth for the grid, so it is satisfiable in practice.
 */
export const PRESETS: Record<PresetName, ResolvedConfig> = {
  XS: {
    gridsize: [3, 3],
    baseRoomNumber: 5,
    baseCorridorNumber: 6,
    minFinalDistance: 2,
    connectivity: 0.35,
    spacing: 2,
  },
  S: {
    gridsize: [4, 4],
    baseRoomNumber: 10,
    baseCorridorNumber: 12,
    minFinalDistance: 3,
    connectivity: 0.4,
    spacing: 3,
  },
  M: {
    gridsize: [5, 5],
    baseRoomNumber: 16,
    baseCorridorNumber: 19,
    minFinalDistance: 4,
    connectivity: 0.45,
    spacing: 3,
  },
  L: {
    gridsize: [6, 6],
    baseRoomNumber: 24,
    baseCorridorNumber: 29,
    minFinalDistance: 5,
    connectivity: 0.5,
    spacing: 3,
  },
  XL: {
    gridsize: [7, 7],
    baseRoomNumber: 32,
    baseCorridorNumber: 39,
    minFinalDistance: 6,
    connectivity: 0.55,
    spacing: 4,
  },
  XXL: {
    gridsize: [7, 8],
    baseRoomNumber: 38,
    baseCorridorNumber: 46,
    minFinalDistance: 6,
    connectivity: 0.45,
    spacing: 4,
  },
};

/** Preset used when the config does not name one. */
export const DEFAULT_PRESET: PresetName = 'M';

/**
 * Merges the preset defaults with the explicit config overrides and
 * validates the result. Throws a descriptive error on invalid configuration:
 *
 * - `gridsize` must be two integers ≥ 2
 * - `baseRoomNumber` must be an integer ≥ 2 (no isolated rooms) and ≤ W·H
 * - `baseCorridorNumber` must be a positive integer; values below N−1 are
 *   clamped up to N−1 (a connected graph needs at least N−1 edges)
 * - `minFinalDistance` must be an integer ≥ 1
 * - `goalSlack` must be an integer ≥ 0 when provided (presets leave it unset)
 * - `connectivity` must be a number in [0, 1]
 * - `spacing` must be an integer in [1, 8]
 */
export function resolveConfig(config: DungeonConfig): {
  preset: PresetName;
  resolved: ResolvedConfig;
} {
  const preset = config.preset ?? DEFAULT_PRESET;
  const base = PRESETS[preset];
  if (!base) {
    throw new Error(
      `Unknown preset: ${String(preset)}. Use one of: ${Object.keys(PRESETS).join(', ')}`,
    );
  }

  const gridsize = config.gridsize ?? base.gridsize;
  const [w, h] = gridsize;
  const baseRoomNumber = config.baseRoomNumber ?? base.baseRoomNumber;
  const baseCorridorNumber = config.baseCorridorNumber ?? base.baseCorridorNumber;
  const minFinalDistance = config.minFinalDistance ?? base.minFinalDistance;
  // Goal slack is an override-only parameter: presets never define it.
  const goalSlack = config.goalSlack;
  const connectivity = config.connectivity ?? base.connectivity;
  const spacing = config.spacing ?? base.spacing;

  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 2 || h < 2) {
    throw new Error(`Invalid gridsize [${w}, ${h}]: W and H must be integers ≥ 2.`);
  }
  if (!Number.isInteger(baseRoomNumber) || baseRoomNumber < 2) {
    throw new Error(
      `Invalid baseRoomNumber ${String(baseRoomNumber)}: must be an integer ≥ 2 (rooms are never isolated).`,
    );
  }
  if (baseRoomNumber > w * h) {
    throw new Error(
      `baseRoomNumber ${baseRoomNumber} exceeds the grid capacity of ${w}×${h} = ${w * h} cells.`,
    );
  }
  if (!Number.isInteger(baseCorridorNumber) || baseCorridorNumber < 1) {
    throw new Error(
      `Invalid baseCorridorNumber ${String(baseCorridorNumber)}: must be a positive integer.`,
    );
  }
  // Hard floor: a connected graph over N nodes needs at least N − 1 edges.
  const resolvedCorridorNumber = Math.max(baseCorridorNumber, baseRoomNumber - 1);
  if (!Number.isInteger(minFinalDistance) || minFinalDistance < 1) {
    throw new Error(
      `Invalid minFinalDistance ${String(minFinalDistance)}: must be an integer ≥ 1.`,
    );
  }
  if (goalSlack !== undefined && (!Number.isInteger(goalSlack) || goalSlack < 0)) {
    throw new Error(
      `Invalid goalSlack ${String(goalSlack)}: must be an integer ≥ 0 (hops from the farthest room).`,
    );
  }
  if (
    typeof connectivity !== 'number' ||
    Number.isNaN(connectivity) ||
    connectivity < 0 ||
    connectivity > 1
  ) {
    throw new Error(`Invalid connectivity ${String(connectivity)}: must be a number in [0, 1].`);
  }
  if (!Number.isInteger(spacing) || spacing < 1 || spacing > 8) {
    throw new Error(`Invalid spacing ${String(spacing)}: must be an integer in [1, 8].`);
  }

  return {
    preset,
    resolved: {
      gridsize,
      baseRoomNumber,
      baseCorridorNumber: resolvedCorridorNumber,
      minFinalDistance,
      ...(goalSlack !== undefined ? { goalSlack } : {}),
      connectivity,
      spacing,
    },
  };
}
