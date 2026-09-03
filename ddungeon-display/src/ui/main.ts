// ─── Main ────────────────────────────────────────────────────────────────
// App state + render loop. Generation controls regenerate; view toggles
// re-render the last valid dungeon (SPEC §7). Invalid config ⇒ error banner
// with the last valid SVG retained.

import { generate } from 'ddungeon-gen';
import type { DungeonConfig, DungeonResult } from 'ddungeon-gen';
import { analyze } from '../core/graph';
import { validate } from '../core/validate';
import { renderSvg } from '../core/svg/svg';
import type { Analysis, ViewOptions, Violation } from '../core/types';
import {
  collectConfig,
  els,
  renderStats,
  renderViolations,
  setControlsDisabled,
  syncPresetDefaults,
} from './controls';

interface State {
  dungeon: DungeonResult | null;
  analysis: Analysis | null;
  violations: Violation[];
  view: 'graph' | 'tile';
  showBackdrop: boolean;
  showWeights: boolean;
  showPath: boolean;
  showLoopSplit: boolean;
  showHeader: boolean;
  jsonMode: boolean;
  highlight: Violation | null;
}

const state: State = {
  dungeon: null,
  analysis: null,
  violations: [],
  view: 'graph',
  showBackdrop: true,
  showWeights: true,
  showPath: true,
  showLoopSplit: true,
  showHeader: true,
  jsonMode: false,
  highlight: null,
};

function viewOptions(): ViewOptions {
  return {
    view: state.view,
    showBackdrop: state.showBackdrop,
    showWeights: state.showWeights,
    showPath: state.showPath,
    showLoopSplit: state.showLoopSplit,
    showHeader: state.showHeader,
  };
}

// ─── Rendering ───────────────────────────────────────────────────────────

function svgEl(): SVGSVGElement | null {
  return els.viewport.querySelector('svg');
}

function redraw(): void {
  if (!state.dungeon || !state.analysis) return;
  els.viewport.innerHTML = renderSvg(
    state.dungeon,
    viewOptions(),
    state.analysis,
    state.violations,
  );
  resetViewBox();
  applyHighlight();
}

function applyHighlight(): void {
  for (const node of els.viewport.querySelectorAll('.hl')) node.classList.remove('hl');
  const h = state.highlight;
  if (!h) return;
  for (const id of h.roomIds ?? []) {
    els.viewport.querySelector(`[data-room="${id}"]`)?.classList.add('hl');
  }
  if (h.edgeIndex !== undefined) {
    els.viewport.querySelector(`[data-edge="${h.edgeIndex}"]`)?.classList.add('hl');
  }
}

function setError(message: string | null): void {
  if (message) {
    els.errorBanner.textContent = message;
    els.errorBanner.hidden = false;
  } else {
    els.errorBanner.hidden = true;
    els.errorBanner.textContent = '';
  }
}

// ─── Generation ──────────────────────────────────────────────────────────

function regen(): void {
  if (state.jsonMode) return;
  const cfg = collectConfig();
  try {
    const config: DungeonConfig = { preset: cfg.preset };
    if (cfg.seed !== '') config.seed = cfg.seed;
    if (cfg.gridsize) config.gridsize = cfg.gridsize;
    if (cfg.baseRoomNumber !== undefined) config.baseRoomNumber = cfg.baseRoomNumber;
    if (cfg.baseCorridorNumber !== undefined) config.baseCorridorNumber = cfg.baseCorridorNumber;
    if (cfg.minFinalDistance !== undefined) config.minFinalDistance = cfg.minFinalDistance;
    if (cfg.goalSlack !== undefined) config.goalSlack = cfg.goalSlack;
    if (cfg.connectivity !== undefined) config.connectivity = cfg.connectivity;
    if (cfg.spacing !== undefined) config.spacing = cfg.spacing;

    const dungeon = generate(config);
    state.dungeon = dungeon;
    state.analysis = analyze(dungeon);
    state.violations = validate(dungeon);
    state.highlight = null;
    setError(null);
    renderStats(dungeon, state.analysis);
    renderViolations(state.violations, pickViolation);
    redraw();
  } catch (err) {
    // Invalid config: banner up, last valid SVG stays on screen (SPEC §7).
    setError(err instanceof Error ? err.message : String(err));
  }
}

function pickViolation(v: Violation): void {
  state.highlight = state.highlight === v ? null : v;
  applyHighlight();
}

// ─── ViewBox zoom / pan ──────────────────────────────────────────────────

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

let vb: ViewBox | null = null;
let vbBase: ViewBox | null = null;

function setViewBox(): void {
  const svg = svgEl();
  if (!svg || !vb) return;
  svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
}

function resetViewBox(): void {
  const svg = svgEl();
  if (!svg) return;
  const w = Number(svg.getAttribute('width')) || 1;
  const h = Number(svg.getAttribute('height')) || 1;
  vb = { x: 0, y: 0, w, h };
  vbBase = { ...vb };
  setViewBox();
}

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

els.viewport.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    const svg = svgEl();
    if (!svg || !vb || !vbBase) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 1 / 1.1;
    const minW = vbBase.w / 20;
    const maxW = vbBase.w * 10;
    const newW = Math.min(maxW, Math.max(minW, vb.w * factor));
    const scale = newW / vb.w;
    const p = svgPoint(svg, e.clientX, e.clientY);
    vb.x = p.x - (p.x - vb.x) * scale;
    vb.y = p.y - (p.y - vb.y) * scale;
    vb.w *= scale;
    vb.h *= scale;
    setViewBox();
  },
  { passive: false },
);

let drag: {
  px: number;
  py: number;
  vx: number;
  vy: number;
  sux: number;
  suy: number;
  moved: boolean;
} | null = null;

els.viewport.addEventListener('pointerdown', (e: PointerEvent) => {
  const svg = svgEl();
  if (!svg || !vb) return;
  const ctm = svg.getScreenCTM();
  if (!ctm) return;
  drag = {
    px: e.clientX,
    py: e.clientY,
    vx: vb.x,
    vy: vb.y,
    sux: 1 / ctm.a,
    suy: 1 / ctm.d,
    moved: false,
  };
  els.viewport.setPointerCapture(e.pointerId);
  els.viewport.classList.add('dragging');
});

els.viewport.addEventListener('pointermove', (e: PointerEvent) => {
  if (!drag || !vb) return;
  const dx = e.clientX - drag.px;
  const dy = e.clientY - drag.py;
  if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  vb.x = drag.vx - dx * drag.sux;
  vb.y = drag.vy - dy * drag.suy;
  setViewBox();
});

els.viewport.addEventListener('pointerup', (e: PointerEvent) => {
  els.viewport.classList.remove('dragging');
  const wasDrag = drag?.moved;
  drag = null;
  try {
    els.viewport.releasePointerCapture(e.pointerId);
  } catch {
    // pointer capture already released
  }
  // A plain click (no drag) clears the highlight.
  if (!wasDrag && state.highlight) {
    state.highlight = null;
    applyHighlight();
  }
});

// ─── Download ────────────────────────────────────────────────────────────

function sanitizeName(s: string): string {
  const t = s.replace(/[^a-zA-Z0-9_-]+/g, '_');
  return t.slice(0, 64) || 'seed';
}

els.download.addEventListener('click', () => {
  if (!state.dungeon || !state.analysis) return;
  const svg = renderSvg(state.dungeon, viewOptions(), state.analysis, state.violations);
  const name = `ddungeon-${state.dungeon.preset}-${sanitizeName(state.dungeon.seed)}.svg`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

// ─── JSON panel ──────────────────────────────────────────────────────────

function jsonStatus(message: string, isErr: boolean): void {
  els.jsonStatus.textContent = message;
  els.jsonStatus.classList.toggle('err', isErr);
  els.jsonStatus.classList.toggle('ok', !isErr && message !== '');
}

/** Required shape per SPEC §7; returns the missing/invalid field names. */
function missingFields(o: unknown): string[] {
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return ['(object)'];
  const r = o as Record<string, unknown>;
  const missing: string[] = [];
  for (const k of ['gridsize', 'rooms', 'edges']) {
    if (!Array.isArray(r[k])) missing.push(k);
  }
  for (const k of [
    'baseRoomNumber',
    'baseCorridorNumber',
    'minFinalDistance',
    'connectivity',
    'spacing',
    'entranceId',
    'goalId',
    'goalDistance',
  ]) {
    if (typeof r[k] !== 'number') missing.push(k);
  }
  return missing;
}

function applyJson(): void {
  const text = els.jsonInput.value.trim();
  if (text === '') {
    jsonStatus('Paste a ddungeon-gen result first.', true);
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    jsonStatus(`JSON parse error: ${err instanceof Error ? err.message : String(err)}`, true);
    return;
  }
  const missing = missingFields(parsed);
  if (missing.length > 0) {
    const r = parsed as Record<string, unknown>;
    const looksOld =
      typeof r === 'object' && r !== null && ('size' in r || 'shape' in r || 'theme' in r);
    jsonStatus(
      looksOld
        ? 'Not a ddungeon-gen result — this looks like a non-grid dungeon model (size/shape/theme). This tool renders ddungeon-gen grid results only.'
        : `Not a ddungeon-gen result — missing or invalid: ${missing.join(', ')}.`,
      true,
    );
    return;
  }

  const d = parsed as DungeonResult;
  state.jsonMode = true;
  state.dungeon = d;
  state.analysis = analyze(d);
  state.violations = validate(d);
  state.highlight = null;
  setError(null);
  renderStats(d, state.analysis);
  renderViolations(state.violations, pickViolation);
  setControlsDisabled(true);
  els.jsonInput.value = JSON.stringify(d, null, 2);
  jsonStatus(
    `OK — ${d.rooms.length} rooms, ${d.edges.length} corridors, ${state.violations.length} violation(s). Generation controls are ignored in JSON mode.`,
    false,
  );
  redraw();
}

els.jsonToggle.addEventListener('click', () => {
  els.jsonPanel.classList.toggle('open');
});

els.jsonApply.addEventListener('click', applyJson);

els.jsonCopy.addEventListener('click', () => {
  if (!state.dungeon) return;
  void navigator.clipboard.writeText(JSON.stringify(state.dungeon, null, 2));
  const btn = els.jsonCopy;
  const prev = btn.textContent;
  btn.textContent = 'Copied!';
  setTimeout(() => {
    btn.textContent = prev;
  }, 1200);
});

els.jsonClear.addEventListener('click', () => {
  state.jsonMode = false;
  setControlsDisabled(false);
  els.jsonInput.value = '';
  jsonStatus('', false);
  regen();
});

// ─── Wiring ──────────────────────────────────────────────────────────────

for (const btn of els.viewButtons) {
  btn.addEventListener('click', () => {
    state.view = btn.dataset.view === 'tile' ? 'tile' : 'graph';
    for (const b of els.viewButtons) b.classList.toggle('active', b === btn);
    redraw();
  });
}

els.tBackdrop.addEventListener('change', () => {
  state.showBackdrop = els.tBackdrop.checked;
  redraw();
});
els.tWeights.addEventListener('change', () => {
  state.showWeights = els.tWeights.checked;
  redraw();
});
els.tPath.addEventListener('change', () => {
  state.showPath = els.tPath.checked;
  redraw();
});
els.tLoop.addEventListener('change', () => {
  state.showLoopSplit = els.tLoop.checked;
  redraw();
});
els.tHeader.addEventListener('change', () => {
  state.showHeader = els.tHeader.checked;
  redraw();
});

els.preset.addEventListener('change', () => {
  if (state.jsonMode) return;
  syncPresetDefaults();
  regen();
});
els.seed.addEventListener('input', () => {
  if (!state.jsonMode) regen();
});
els.reroll.addEventListener('click', () => {
  if (state.jsonMode) return;
  els.seed.value = '';
  regen();
});

for (const input of [
  els.gridW,
  els.gridH,
  els.rooms,
  els.corridors,
  els.minDist,
  els.goalSlack,
  els.spacing,
  els.connectivity,
]) {
  input.addEventListener('input', () => {
    if (!state.jsonMode) regen();
  });
}

// ─── Init: preset M, seed "default" (reproducible first frame, SPEC §7) ──

syncPresetDefaults();
regen();
