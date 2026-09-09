import { describe, it, expect } from 'vitest';
import { analyze, bfs, pathBetween } from '../src/core/graph';
import { handL, handLine, handSquare, live, clone } from './fixtures';

describe('analyze / bfs', () => {
  it('computes BFS hop distances (handSquare)', () => {
    const a = analyze(handSquare());
    expect([...a.distances.entries()].sort((x, y) => x[0] - y[0])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 1],
    ]);
    expect(a.farthest).toBe(2);
  });

  it('reconstructs the entrance→goal shortest path (handSquare)', () => {
    const a = analyze(handSquare());
    expect(a.path).toEqual([0, 1, 2]);
  });

  it('splits tree vs loop edges: exactly E−(N−1) loops (handSquare)', () => {
    const a = analyze(handSquare());
    expect(a.loopEdgeIndices).toEqual(new Set([2]));
  });

  it('a pure tree has zero loops (handLine)', () => {
    const a = analyze(handLine());
    expect(a.loopEdgeIndices.size).toBe(0);
    expect(a.path).toEqual([0, 1, 2, 3]);
    expect(a.farthest).toBe(3);
  });

  it('loop count equals E−(N−1) on live dungeons', () => {
    for (const preset of ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const) {
      const d = live(preset, 'loops');
      const a = analyze(d);
      expect(a.loopEdgeIndices.size).toBe(d.edges.length - (d.rooms.length - 1));
      // BFS goal distance matches the generator's report
      expect(a.distances.get(d.goalId)).toBe(d.goalDistance);
      // every room reachable
      for (const r of d.rooms) {
        expect(a.distances.get(r.id)).not.toBe(Infinity);
      }
    }
  });

  it('tree extraction is deterministic', () => {
    const d = live('M', 'default');
    const a1 = analyze(d);
    const a2 = analyze(d);
    expect([...a1.loopEdgeIndices].sort((x, y) => x - y)).toEqual(
      [...a2.loopEdgeIndices].sort((x, y) => x - y),
    );
    expect(a2.path).toEqual(a1.path);
    expect(a2.distances).toEqual(a1.distances);
  });

  it('pathBetween finds paths between arbitrary rooms', () => {
    const d = handSquare();
    expect(pathBetween(d, 3, 1)).toEqual([3, 2, 1]);
    expect(pathBetween(d, 2, 0)).toEqual([2, 1, 0]);
  });

  it('handles disconnected graphs without crashing', () => {
    const d = clone(handL());
    d.edges[0] = { ...d.edges[0], from: 99 }; // edge to a missing room
    const a = analyze(d);
    expect(a.distances.get(0)).toBe(0);
    expect(a.distances.get(1)).toBe(Infinity);
    expect(a.distances.get(2)).toBe(Infinity);
    expect(a.farthest).toBe(Infinity);
    expect(a.path).toEqual([0]); // goal unreachable ⇒ degenerate path
    // the dangling edge can never be a tree edge
    expect(a.loopEdgeIndices.has(0)).toBe(true);
  });

  it('bfs from a non-entrance root works', () => {
    const a = bfs(handL(), 2);
    expect(a.distances.get(2)).toBe(0);
    expect(a.distances.get(0)).toBe(2);
  });
});
