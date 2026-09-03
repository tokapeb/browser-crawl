// ─── Graph view ──────────────────────────────────────────────────────────
// Outlined room squares on the grid; thin edge lines; weight label at the
// line midpoint (SPEC §6). Tree edges base color, loop edges accent.

import type { RenderContext } from './svg';
import { COLORS, fmt } from './svg';

export function graphView(ctx: RenderContext): string {
  const { d, layout, o, a, ox, oy } = ctx;
  const { cellSize } = layout;
  const parts: string[] = [];

  // ── edges (thin lines, room center → room center) ──
  const sw = Math.max(1, Math.round(cellSize * 0.03));
  const labelFs = Math.max(9, Math.round(cellSize * 0.15));
  layout.edges.forEach((g, i) => {
    const isLoop = o.showLoopSplit && a.loopEdgeIndices.has(i);
    const color = ctx.violatedEdges.has(i)
      ? COLORS.violation
      : isLoop
        ? COLORS.loop
        : COLORS.roomOutline;
    parts.push(
      `<line x1="${fmt(g.a.x + ox)}" y1="${fmt(g.a.y + oy)}" x2="${fmt(g.b.x + ox)}" y2="${fmt(g.b.y + oy)}" ` +
        `stroke="${color}" stroke-width="${sw}" stroke-linecap="round" data-edge="${i}"/>`,
    );
    if (o.showWeights) {
      const e = d.edges[i];
      const w = e && Number.isFinite(e.weight) ? Math.round(e.weight) : NaN;
      if (Number.isFinite(w)) {
        const mx = (g.a.x + g.b.x) / 2 + ox;
        const my = (g.a.y + g.b.y) / 2 + oy;
        parts.push(weightLabel(mx, my, String(w), labelFs, COLORS.text));
      }
    }
  });

  // ── rooms (outlined squares; entrance/goal filled) ──
  const roomSw = Math.max(1, Math.round(cellSize * 0.025));
  layout.rooms.forEach((r) => {
    let fill: string = 'none';
    let stroke: string = COLORS.roomOutline;
    let strokeW = roomSw;
    if (ctx.violatedRooms.has(r.id)) {
      stroke = COLORS.violation;
      strokeW = Math.max(2, roomSw);
    } else if (r.id === d.entranceId) {
      fill = COLORS.entrance;
      stroke = 'none';
    } else if (r.id === d.goalId) {
      fill = COLORS.goal;
      stroke = 'none';
    }
    const attrs =
      stroke === 'none'
        ? `fill="${fill}"`
        : `fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"`;
    parts.push(
      `<rect x="${fmt(r.rect.x + ox)}" y="${fmt(r.rect.y + oy)}" width="${fmt(r.rect.w)}" ` +
        `height="${fmt(r.rect.h)}" ${attrs} data-room="${r.id}"/>`,
    );
  });

  return parts.join('\n');
}

/** Weight label with a small dark backing so it reads over the line. */
export function weightLabel(
  cx: number,
  cy: number,
  text: string,
  fs: number,
  color: string,
): string {
  const tw = text.length * fs * 0.62 + 6;
  const th = fs * 1.4;
  return (
    `<rect x="${fmt(cx - tw / 2)}" y="${fmt(cy - th / 2)}" width="${fmt(tw)}" height="${fmt(th)}" ` +
    `fill="${COLORS.bg}" opacity="0.85"/>` +
    `<text x="${fmt(cx)}" y="${fmt(cy + fs * 0.35)}" font-size="${fmt(fs)}" fill="${color}" text-anchor="middle">${text}</text>`
  );
}
