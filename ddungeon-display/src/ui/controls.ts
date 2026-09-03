// ─── Controls ────────────────────────────────────────────────────────────
// DOM wiring only: element refs, config collection, preset-default sync,
// and the stats / violations panel renderers (SPEC §3/§7).

import { PRESETS } from 'ddungeon-gen';
import type { DungeonResult, PresetName } from 'ddungeon-gen';
import type { Analysis, Violation } from '../core/types';
import { esc } from '../core/svg/svg';

function el<T extends Element>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as unknown as T;
}

export const els = {
  preset: el<HTMLSelectElement>('preset'),
  seed: el<HTMLInputElement>('seed'),
  reroll: el<HTMLButtonElement>('reroll'),
  gridW: el<HTMLInputElement>('grid-w'),
  gridH: el<HTMLInputElement>('grid-h'),
  rooms: el<HTMLInputElement>('rooms'),
  corridors: el<HTMLInputElement>('corridors'),
  minDist: el<HTMLInputElement>('min-dist'),
  goalSlack: el<HTMLInputElement>('goal-slack'),
  spacing: el<HTMLInputElement>('spacing'),
  connectivity: el<HTMLInputElement>('connectivity'),
  viewButtons: Array.from(document.querySelectorAll<HTMLButtonElement>('#view-mode .seg-btn')),
  tBackdrop: el<HTMLInputElement>('t-backdrop'),
  tWeights: el<HTMLInputElement>('t-weights'),
  tPath: el<HTMLInputElement>('t-path'),
  tLoop: el<HTMLInputElement>('t-loop'),
  tHeader: el<HTMLInputElement>('t-header'),
  vSummary: el<HTMLSpanElement>('v-summary'),
  violations: el<HTMLUListElement>('violations'),
  stats: el<HTMLElement>('stats-fields'),
  errorBanner: el<HTMLElement>('error-banner'),
  viewport: el<HTMLElement>('viewport'),
  download: el<HTMLButtonElement>('download'),
  jsonToggle: el<HTMLButtonElement>('json-toggle'),
  jsonPanel: el<HTMLElement>('json-panel'),
  jsonInput: el<HTMLTextAreaElement>('json-input'),
  jsonApply: el<HTMLButtonElement>('json-apply'),
  jsonCopy: el<HTMLButtonElement>('json-copy'),
  jsonClear: el<HTMLButtonElement>('json-clear'),
  jsonStatus: el<HTMLElement>('json-status'),
};

/** Generation inputs read from the sidebar (empty field ⇒ preset default). */
export interface GenConfig {
  preset: PresetName;
  seed: string;
  gridsize?: [number, number];
  baseRoomNumber?: number;
  baseCorridorNumber?: number;
  minFinalDistance?: number;
  /** Empty field ⇒ unset (goal is exactly the farthest room). */
  goalSlack?: number;
  connectivity?: number;
  spacing?: number;
}

function num(input: HTMLInputElement): number | undefined {
  if (input.value.trim() === '') return undefined;
  const n = Number(input.value);
  return Number.isFinite(n) ? n : undefined;
}

export function collectConfig(): GenConfig {
  const preset = els.preset.value as PresetName;
  const defaults = PRESETS[preset];
  const w = num(els.gridW);
  const h = num(els.gridH);
  return {
    preset,
    seed: els.seed.value.trim(),
    gridsize:
      w === undefined && h === undefined
        ? undefined
        : [(w ?? defaults.gridsize[0]) as number, (h ?? defaults.gridsize[1]) as number],
    baseRoomNumber: num(els.rooms),
    baseCorridorNumber: num(els.corridors),
    minFinalDistance: num(els.minDist),
    goalSlack: num(els.goalSlack),
    connectivity: num(els.connectivity),
    spacing: num(els.spacing),
  };
}

/** Preset change resets the numeric fields to that preset's defaults (SPEC §7). */
export function syncPresetDefaults(): void {
  const p = PRESETS[els.preset.value as PresetName];
  els.gridW.value = String(p.gridsize[0]);
  els.gridH.value = String(p.gridsize[1]);
  els.rooms.value = String(p.baseRoomNumber);
  els.corridors.value = String(p.baseCorridorNumber);
  els.minDist.value = String(p.minFinalDistance);
  // Presets never define goalSlack — empty means "goal is the farthest room".
  els.goalSlack.value = '';
  els.spacing.value = String(p.spacing);
  els.connectivity.value = String(p.connectivity);
}

/** Top stats bar — same fields as the in-SVG header (SPEC §7). */
export function renderStats(d: DungeonResult, a: Analysis): void {
  const [W, H] = d.gridsize;
  const occ = W > 0 && H > 0 ? (100 * d.rooms.length) / (W * H) : NaN;
  const fields: string[] = [
    `seed <b>${esc(d.seed)}</b>`,
    `preset <b>${esc(d.preset)}</b>`,
    `grid <b>${W}×${H}</b>`,
    `rooms <b>${d.rooms.length}</b>`,
    `corridors <b>${d.edges.length}</b>`,
    `loops <b>${a.loopEdgeIndices.size}</b>`,
    `goalDistance <b>${d.goalDistance}</b>`,
    `slack <b>${Number.isInteger(d.goalSlack) ? d.goalSlack : '—'}</b>`,
    `relaxed <b>${d.relaxed === true ? 'true' : 'false'}</b>`,
    `occupancy <b>${Number.isFinite(occ) ? `${occ.toFixed(1)}%` : 'n/a'}</b>`,
  ];
  els.stats.innerHTML = fields.map((f) => `<span>${f}</span>`).join('');
}

/** Validation panel: "0 violations" when clean, one line per violation. */
export function renderViolations(violations: Violation[], onPick: (v: Violation) => void): void {
  els.vSummary.textContent =
    violations.length === 0
      ? '0 violations'
      : `${violations.length} violation${violations.length === 1 ? '' : 's'}`;
  els.vSummary.classList.toggle('bad', violations.length > 0);
  els.violations.innerHTML = '';
  for (const v of violations) {
    const li = document.createElement('li');
    li.textContent = `[${v.rule}] ${v.message}`;
    li.title = 'click to highlight in the view';
    li.addEventListener('click', () => onPick(v));
    els.violations.appendChild(li);
  }
}

/** Generation controls are ignored in JSON mode (SPEC §7). */
export function setControlsDisabled(disabled: boolean): void {
  const inputs: Array<HTMLInputElement | HTMLSelectElement | HTMLButtonElement> = [
    els.preset,
    els.seed,
    els.reroll,
    els.gridW,
    els.gridH,
    els.rooms,
    els.corridors,
    els.minDist,
    els.goalSlack,
    els.spacing,
    els.connectivity,
  ];
  for (const i of inputs) i.disabled = disabled;
}
