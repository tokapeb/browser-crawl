import type { DungeonConfig, DungeonResult } from './types.js';
import { GridGenerator } from './generator/GridGenerator.js';
import { PRNG } from './util/prng.js';

/**
 * Generates a deterministic Darkest-Dungeon-style grid dungeon.
 *
 * @example
 * const dungeon = generate({ preset: 'M', seed: 'abc' });
 * const custom = generate({ seed: 42, gridsize: [10, 12], baseRoomNumber: 60, connectivity: 0.5 });
 */
export function generate(config: DungeonConfig): DungeonResult {
  const seed = PRNG.normalizeSeed(config.seed);
  return new GridGenerator(seed).generate(config);
}

export type { DungeonConfig, DungeonResult, Room, Edge, Dir, PresetName } from './types.js';
export type { ResolvedConfig } from './presets.js';
export { PRESETS, DEFAULT_PRESET, resolveConfig } from './presets.js';
export default generate;
