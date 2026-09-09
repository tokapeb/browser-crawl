// ─── Tile view ───────────────────────────────────────────────────────────
// Filled room blocks; each corridor a thick strip spanning the full gap,
// divided into `weight` equal segments (segment size = gap/weight). All
// corridors have equal visual length; weight is conveyed by segment count +
// label (SPEC §6).

import type { RenderContext } from './svg';
import { COLORS, fmt } from './svg';

export function tileView(ctx: RenderContext): string {
  const { d, layout, o, a, ox, oy } = ctx;
  const { cellSize, stripW } = layout;
  const parts: string[] = [];
  const labelFs = Math.max(9, Math.round(cellSize * 0.14));

  // ── corridors (thick strips with segment dividers) ──
  layout.edges.forEach((g, i) => {
    const isLoop = o.showLoopSplit && a.loopEdgeIndices.has(i);
    const color = ctx.violatedEdges.has(i)
      ? COLORS.violation
      : isLoop
        ? COLORS.loop
        : COLORS.roomFill;
    const horizontal = Math.abs(g.end.x - g.start.x) >= Math.abs(g.end.y - g.start.y);
    const x = horizontal ? Math.min(g.start.x, g.end.x) : g.start.x - stripW / 2;
    const y = horizontal ? g.start.y - stripW / 2 : Math.min(g.start.y, g.end.y);
    const w = horizontal ? Math.abs(g.end.x - g.start.x) : stripW;
    const h = horizontal ? stripW : Math.abs(g.end.y - g.start.y);
    parts.push(
      `<rect x="${fmt(x + ox)}" y="${fmt(y + oy)}" width="${fmt(w)}" height="${fmt(h)}" ` +
        `fill="${color}" data-edge="${i}"/>`,
    );

    // segment dividers (weight − 1 lines crossing the strip)
    for (let k = 1; k < g.segmentPoints.length - 1; k++) {
      const p = g.segmentPoints[k];
      const px = p.x + ox;
      const py = p.y + oy;
      const line = horizontal
        ? `<line x1="${fmt(px)}" y1="${fmt(g.start.y - stripW / 2 + oy)}" x2="${fmt(px)}" y2="${fmt(g.start.y + stripW / 2 + oy)}" ` +
          `stroke="${COLORS.bg}" stroke-width="2"/>`
        : `<line x1="${fmt(g.start.x - stripW / 2 + ox)}" y1="${fmt(py)}" x2="${fmt(g.start.x + stripW / 2 + ox)}" y2="${fmt(py)}" ` +
          `stroke="${COLORS.bg}" stroke-width="2"/>`;
      parts.push(line);
    }

    if (o.showWeights) {
      const e = d.edges[i];
      const wgt = e && Number.isFinite(e.weight) ? Math.round(e.weight) : NaN;
      if (Number.isFinite(wgt)) {
        const mx = (g.start.x + g.end.x) / 2 + ox;
        const my = (g.start.y + g.end.y) / 2 + oy;
        parts.push(
          `<text x="${fmt(mx)}" y="${fmt(my + labelFs * 0.35)}" font-size="${fmt(labelFs)}" ` +
            `fill="${COLORS.bg}" text-anchor="middle" font-weight="600">${wgt}</text>`,
        );
      }
    }
  });

  // ── rooms (filled blocks; entrance/goal colored, violations red) ──
  layout.rooms.forEach((r) => {
    let fill: string = COLORS.roomFill;
    if (ctx.violatedRooms.has(r.id)) fill = COLORS.violation;
    else if (r.id === d.entranceId) fill = COLORS.entrance;
    else if (r.id === d.goalId) fill = COLORS.goal;
    parts.push(
      `<rect x="${fmt(r.rect.x + ox)}" y="${fmt(r.rect.y + oy)}" width="${fmt(r.rect.w)}" ` +
        `height="${fmt(r.rect.h)}" fill="${fill}" data-room="${r.id}"/>`,
    );
  });

  return parts.join('\n');
}
