import { describe, it, expect } from 'vitest';
import { computeLayout, cellRect, MIN_CELL, MAX_CELL } from '../src/core/layout';
import { handSquare, handLine, live } from './fixtures';

describe('computeLayout', () => {
  it('maps grid → pixels with the expected cell size, origin and rooms (handSquare)', () => {
    const d = handSquare(); // 2×2 grid
    const l = computeLayout(d);

    // 960/2 = 480 → clamped to MAX_CELL
    expect(l.cellSize).toBe(MAX_CELL); // 96
    expect(l.gap).toBe(30); // 2 * round(96 * 0.32 / 2)
    expect(l.stripW).toBe(18); // round(30 * 0.6)
    expect(l.padding).toBe(48); // round(96 * 0.5)
    expect(l.width).toBe(2 * 96 + 2 * 48); // 288
    expect(l.height).toBe(288);
    expect(l.originX).toBe(48);
    expect(l.originY).toBe(48);

    const r0 = l.rooms.find((r) => r.id === 0)!;
    const r1 = l.rooms.find((r) => r.id === 1)!;
    expect(r0.cx).toBe(96);
    expect(r0.cy).toBe(96);
    expect(r0.rect).toEqual({ x: 63, y: 63, w: 66, h: 66 });
    expect(r1.cx).toBe(192);
    expect(r1.cy).toBe(96);
    expect(l.rooms).toHaveLength(4);
  });

  it('cellRect returns the full cell (before block inset)', () => {
    const l = computeLayout(handSquare());
    expect(cellRect(l, 1, 1)).toEqual({ x: 144, y: 144, w: 96, h: 96 });
  });

  it('corridor strips span the full gap, in all four directions', () => {
    const l = computeLayout(handSquare());
    const d = handSquare();
    const eps = 1e-9;

    l.edges.forEach((g, i) => {
      const e = d.edges[i];
      // start/end sit at the room-block edges
      expect(Math.hypot(g.start.x - g.a.x, g.start.y - g.a.y)).toBeCloseTo(33, 6);
      expect(Math.hypot(g.end.x - g.b.x, g.end.y - g.b.y)).toBeCloseTo(33, 6);
      // the strip spans exactly the gap
      expect(Math.hypot(g.end.x - g.start.x, g.end.y - g.start.y)).toBeCloseTo(l.gap, 6);
      // segments: weight + 1 boundary points, first == start, last == end
      expect(g.segmentPoints).toHaveLength(e.weight + 1);
      expect(g.segmentPoints[0]).toEqual({ x: g.start.x, y: g.start.y });
      expect(g.segmentPoints[g.segmentPoints.length - 1]).toEqual({
        x: g.end.x,
        y: g.end.y,
      });
      // equal segment size = gap / weight, along the corridor axis
      for (let k = 1; k < g.segmentPoints.length; k++) {
        const p = g.segmentPoints[k];
        const q = g.segmentPoints[k - 1];
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeCloseTo(l.gap / e.weight, 6);
      }
      // all points lie on the corridor axis (perpendicular offset is zero)
      for (const p of g.segmentPoints) {
        const off = (p.x - g.start.x) * g.nx + (p.y - g.start.y) * g.ny;
        expect(Math.abs(off)).toBeLessThan(eps);
      }
    });
  });

  it('covers each direction exactly once for the 2×2 square', () => {
    const l = computeLayout(handSquare());
    const dirs = l.edges.map((g) => {
      const dx = g.b.x - g.a.x;
      const dy = g.b.y - g.a.y;
      if (dx > 0) return 'E';
      if (dx < 0) return 'W';
      if (dy > 0) return 'S';
      return 'N';
    });
    expect([...dirs].sort()).toEqual(['E', 'N', 'S', 'W']);
  });

  it('clamps the cell size to 24..96 for extreme grids', () => {
    const big = { ...handLine(), gridsize: [60, 40] as [number, number] };
    expect(computeLayout(big).cellSize).toBe(MIN_CELL);
    const mid = { ...handLine(), gridsize: [12, 14] as [number, number] };
    expect(computeLayout(mid).cellSize).toBe(68); // floor(min(960/12, 960/14))
  });

  it('auto-fits live presets within the clamp', () => {
    for (const preset of ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const) {
      const l = computeLayout(live(preset, 'fit'));
      expect(l.cellSize).toBeGreaterThanOrEqual(MIN_CELL);
      expect(l.cellSize).toBeLessThanOrEqual(MAX_CELL);
      expect(l.width).toBeGreaterThan(0);
      expect(l.height).toBeGreaterThan(0);
    }
  });

  it('is deterministic for identical input', () => {
    const a = computeLayout(handSquare());
    const b = computeLayout(handSquare());
    expect(b).toEqual(a);
  });

  it('does not crash on a degenerate (self-loop) edge', () => {
    const d = { ...handLine() };
    d.edges[0] = { from: 0, to: 0, dirFrom: 'E', dirTo: 'W', weight: 2 };
    const l = computeLayout(d);
    expect(l.edges[0].a).toEqual(l.edges[0].b);
    expect(l.edges[0].segmentPoints).toHaveLength(3);
  });
});
