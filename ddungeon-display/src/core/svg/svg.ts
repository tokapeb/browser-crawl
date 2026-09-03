// ─── SVG rendering ───────────────────────────────────────────────────────
// Deterministic string builder (no Date/uuid/Math.random): identical inputs
// always produce a byte-identical document. Views live in graph-view.ts and
// tile-view.ts; the shared layers (backdrop, path overlay, labels, header)
// are here.

import type { DungeonResult } from 'ddungeon-gen';
import { analyze } from '../graph';
import { computeLayout } from '../layout';
import { validate } from '../validate';
import type { Analysis, Layout, ViewOptions, Violation } from '../types';
import { graphView } from './graph-view';
import { tileView } from './tile-view';

/** Theme palette (SPEC §7). */
export const COLORS = {
  bg: '#101318',
  panel: '#171b22',
  roomFill: '#3a4150',
  roomOutline: '#9aa4b5',
  emptyCell: '#1c2027',
  entrance: '#4ade80',
  goal: '#f87171',
  path: '#fbbf24',
  loop: '#60a5fa',
  violation: '#ef4444',
  text: '#e5e7eb',
} as const;

const FONT_STACK = "ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace";

/** Deterministic number formatting (2 decimal places max, no floats noise). */
export function fmt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 100) / 100);
}

/** XML-escape for attribute/text content. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Everything a view layer needs to draw. */
export interface RenderContext {
  d: DungeonResult;
  layout: Layout;
  o: ViewOptions;
  a: Analysis;
  v: Violation[];
  /** Content offset (px) — centers the auto-fit grid on an explicit canvas. */
  ox: number;
  oy: number;
  violatedRooms: Set<number>;
  violatedEdges: Set<number>;
}

/**
 * Renders a dungeon as a standalone SVG document (SPEC §4).
 * `a`/`v` default to live analysis + validation (the validator always runs).
 */
export function renderSvg(
  d: DungeonResult,
  o: ViewOptions,
  a: Analysis = analyze(d),
  v: Violation[] = validate(d),
): string {
  const layout = computeLayout(d);
  const canvasW = o.width ?? layout.width;
  const canvasH = o.height ?? layout.height;
  const ox = Math.round((canvasW - layout.width) / 2);
  const oy = Math.round((canvasH - layout.height) / 2);

  const violatedRooms = new Set<number>();
  const violatedEdges = new Set<number>();
  for (const viol of v) {
    for (const id of viol.roomIds ?? []) violatedRooms.add(id);
    if (viol.edgeIndex !== undefined) violatedEdges.add(viol.edgeIndex);
  }

  const ctx: RenderContext = { d, layout, o, a, v, ox, oy, violatedRooms, violatedEdges };

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(canvasW)}" height="${fmt(canvasH)}" ` +
      `viewBox="0 0 ${fmt(canvasW)} ${fmt(canvasH)}" font-family="${esc(FONT_STACK)}">`,
  );
  parts.push(
    `<rect x="0" y="0" width="${fmt(canvasW)}" height="${fmt(canvasH)}" fill="${COLORS.bg}"/>`,
  );
  parts.push(backdrop(ctx));
  parts.push(o.view === 'tile' ? tileView(ctx) : graphView(ctx));
  parts.push(pathOverlay(ctx));
  parts.push(labels(ctx));
  if (o.showHeader) parts.push(header(ctx));
  parts.push(`</svg>`);
  return parts.join('\n');
}

/** Full W×H grid context: empty cells get faint outlines (SPEC §6). */
export function backdrop(ctx: RenderContext): string {
  const { d, layout, o, ox, oy } = ctx;
  if (!o.showBackdrop) return '';
  const [w, h] = Array.isArray(d.gridsize) ? d.gridsize : [NaN, NaN];
  const W = Number.isInteger(w) && w >= 1 ? w : 0;
  const H = Number.isInteger(h) && h >= 1 ? h : 0;

  const occupied = new Set<string>();
  for (const r of d.rooms) {
    if (
      r &&
      Number.isInteger(r.x) &&
      Number.isInteger(r.y) &&
      r.x >= 0 &&
      r.x < W &&
      r.y >= 0 &&
      r.y < H
    ) {
      occupied.add(`${r.x},${r.y}`);
    }
  }

  const { cellSize } = layout;
  const parts: string[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (occupied.has(`${x},${y}`)) continue;
      const px = ox + layout.originX + x * cellSize;
      const py = oy + layout.originY + y * cellSize;
      parts.push(
        `<rect x="${fmt(px)}" y="${fmt(py)}" width="${fmt(cellSize)}" height="${fmt(cellSize)}" ` +
          `fill="none" stroke="${COLORS.emptyCell}" stroke-width="1"/>`,
      );
    }
  }
  return parts.join('\n');
}

/** Thick gold overlay on the entrance→goal shortest path (SPEC §4/§6). */
export function pathOverlay(ctx: RenderContext): string {
  const { d, layout, o, a, ox, oy } = ctx;
  if (!o.showPath || a.path.length < 2) return '';

  const roomPos = new Map<number, { x: number; y: number }>();
  for (const r of layout.rooms) roomPos.set(r.id, { x: r.cx, y: r.cy });

  const pairEdge = new Map<string, number>();
  d.edges.forEach((e, i) => {
    if (!e) return;
    const k = e.from < e.to ? `${e.from}-${e.to}` : `${e.to}-${e.from}`;
    if (!pairEdge.has(k)) pairEdge.set(k, i);
  });

  const sw = Math.max(2, Math.round(layout.cellSize * 0.08));
  const parts: string[] = [];
  for (let i = 1; i < a.path.length; i++) {
    const u = a.path[i - 1];
    const w = a.path[i];
    const k = u < w ? `${u}-${w}` : `${w}-${u}`;
    const idx = pairEdge.get(k);
    const g = idx === undefined ? undefined : layout.edges[idx];
    if (idx === undefined || !g || !roomPos.has(u) || !roomPos.has(w)) continue;
    parts.push(
      `<line x1="${fmt(g.a.x + ox)}" y1="${fmt(g.a.y + oy)}" x2="${fmt(g.b.x + ox)}" y2="${fmt(g.b.y + oy)}" ` +
        `stroke="${COLORS.path}" stroke-width="${sw}" stroke-linecap="round" opacity="0.9"/>`,
    );
  }
  return parts.join('\n');
}

/** start/goal labels only — no id labels on other rooms (SPEC §6). */
export function labels(ctx: RenderContext): string {
  const { d, layout, ox, oy } = ctx;
  const parts: string[] = [];
  const fs = Math.max(9, Math.round(layout.cellSize * 0.2));

  const entrance =
    layout.rooms.find((r) => r.id === d.entranceId) ?? layout.rooms.find((r) => r.id === 0);
  if (entrance) {
    parts.push(label(entrance.cx + ox, entrance.cy + oy, 'start', COLORS.bg, fs));
  }

  const goal = layout.rooms.find((r) => r.id === d.goalId);
  if (goal) {
    const text = d.relaxed === true ? 'goal (relaxed)' : 'goal';
    parts.push(label(goal.cx + ox, goal.cy + oy, text, COLORS.bg, fs));
  }
  return parts.join('\n');
}

function label(cx: number, cy: number, text: string, fill: string, fs: number): string {
  return (
    `<text x="${fmt(cx)}" y="${fmt(cy + fs * 0.35)}" font-size="${fmt(fs)}" fill="${fill}" ` +
    `text-anchor="middle" font-weight="600">${esc(text)}</text>`
  );
}

/**
 * In-SVG stats header, monospace block, top-left (SPEC §6/§7):
 * seed, preset, W×H, N, E, loops, goalDistance, goalSlack, relaxed, occupancy %.
 */
export function header(ctx: RenderContext): string {
  const { d, layout, a, ox, oy } = ctx;
  const [w, h] = Array.isArray(d.gridsize) ? d.gridsize : [NaN, NaN];
  const W = Number.isInteger(w) ? w : NaN;
  const H = Number.isInteger(h) ? h : NaN;
  const N = Array.isArray(d.rooms) ? d.rooms.length : 0;
  const E = Array.isArray(d.edges) ? d.edges.length : 0;
  const occ =
    Number.isFinite(W) && Number.isFinite(H) && W > 0 && H > 0 ? (100 * N) / (W * H) : NaN;

  const lines: string[] = [
    `seed: ${String(d.seed)}`,
    `preset: ${String(d.preset)}`,
    `grid: ${String(W)}×${String(H)}`,
    `rooms: ${N}`,
    `corridors: ${E} (loops: ${a.loopEdgeIndices.size})`,
    `goalDistance: ${String(d.goalDistance)} (min ${String(d.minFinalDistance)})`,
    `goalSlack: ${Number.isInteger(d.goalSlack) ? String(d.goalSlack) : '-'}`,
    `relaxed: ${d.relaxed === true ? 'true' : 'false'}`,
    `occupancy: ${Number.isFinite(occ) ? occ.toFixed(1) : 'n/a'}%`,
  ];

  const fs = Math.max(10, Math.round(layout.cellSize * 0.16));
  const lh = fs * 1.45;
  const maxChars = Math.max(...lines.map((l) => l.length));
  const bw = maxChars * fs * 0.62 + 16;
  const bx = ox + 2;
  const by = oy + 2;
  const bh = lines.length * lh + 10;

  const parts: string[] = [
    `<rect x="${fmt(bx)}" y="${fmt(by)}" width="${fmt(bw)}" height="${fmt(bh)}" ` +
      `rx="4" fill="${COLORS.panel}" opacity="0.92"/>`,
  ];
  lines.forEach((line, i) => {
    parts.push(
      `<text x="${fmt(bx + 8)}" y="${fmt(by + 6 + fs + i * lh)}" font-size="${fmt(fs)}" ` +
        `fill="${COLORS.text}">${esc(line)}</text>`,
    );
  });
  return parts.join('\n');
}
