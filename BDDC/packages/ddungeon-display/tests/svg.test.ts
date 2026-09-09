import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { generate } from 'ddungeon-gen';
import { renderSvg } from '../src/core/svg/svg';
import { handSquare, handLine, live, mutateR7 } from './fixtures';
import type { ViewOptions } from '../src/core/types';

const DEFAULTS: ViewOptions = {
  view: 'graph',
  showBackdrop: true,
  showWeights: true,
  showPath: true,
  showLoopSplit: true,
  showHeader: true,
};

/** Parses with @xmldom/xmldom and returns any reported errors. */
function parseErrors(svg: string): string[] {
  const errs: string[] = [];
  const doc = new DOMParser({
    errorHandler: {
      error: (m: string) => errs.push(m),
      fatalError: (m: string) => errs.push(m),
      warning: () => undefined,
    },
  }).parseFromString(svg, 'image/svg+xml');
  if (doc.documentElement.nodeName !== 'svg') errs.push('root element is not <svg>');
  return errs;
}

describe('renderSvg — determinism', () => {
  it('produces a byte-identical string for identical input', () => {
    const d = live('M', 'default');
    const s1 = renderSvg(d, DEFAULTS);
    const s2 = renderSvg(live('M', 'default'), { ...DEFAULTS });
    expect(s2).toBe(s1);
  });

  it('is stable across hand-authored fixtures and both views', () => {
    for (const d of [handSquare(), handLine()]) {
      for (const view of ['graph', 'tile'] as const) {
        const s1 = renderSvg(d, { ...DEFAULTS, view });
        const s2 = renderSvg(d, { ...DEFAULTS, view });
        expect(s2).toBe(s1);
      }
    }
  });
});

describe('renderSvg — well-formed XML', () => {
  it('parses without errors (both views, live + hand-authored)', () => {
    for (const d of [live('M', 'default'), live('XS', 'a'), handSquare(), handLine()]) {
      for (const view of ['graph', 'tile'] as const) {
        expect(parseErrors(renderSvg(d, { ...DEFAULTS, view })), `${view}`).toEqual([]);
      }
    }
  });

  it('is a standalone document with the SVG namespace', () => {
    const s = renderSvg(handSquare(), DEFAULTS);
    expect(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(s.endsWith('</svg>')).toBe(true);
  });
});

describe('renderSvg — options', () => {
  const d = handSquare();

  it('graph and tile views differ', () => {
    expect(renderSvg(d, { ...DEFAULTS, view: 'graph' })).not.toBe(
      renderSvg(d, { ...DEFAULTS, view: 'tile' }),
    );
  });

  it('showBackdrop=false removes empty-cell outlines', () => {
    const dLive = live('XS', 'a'); // ~64% occupancy ⇒ empty cells exist
    const withBackdrop = renderSvg(dLive, DEFAULTS);
    const without = renderSvg(dLive, { ...DEFAULTS, showBackdrop: false });
    expect(withBackdrop.includes('stroke="#1c2027"')).toBe(true);
    expect(without.includes('stroke="#1c2027"')).toBe(false);
  });

  it('showHeader=false removes the in-SVG stats block', () => {
    const without = renderSvg(d, { ...DEFAULTS, showHeader: false });
    expect(without.includes('occupancy:')).toBe(false);
    expect(without.includes('seed:')).toBe(false);
  });

  it('showWeights=false removes weight labels', () => {
    const withW = renderSvg(d, DEFAULTS);
    const without = renderSvg(d, { ...DEFAULTS, showWeights: false });
    // weight "5" label appears in graph view only via the label pass
    expect(withW.includes('>5<')).toBe(true);
    expect(without.includes('>5<')).toBe(false);
  });

  it('showPath=false removes the gold overlay', () => {
    const without = renderSvg(d, { ...DEFAULTS, showPath: false });
    expect(without.includes('#fbbf24')).toBe(false);
  });

  it('showLoopSplit=false removes loop coloring', () => {
    const without = renderSvg(d, { ...DEFAULTS, showLoopSplit: false });
    expect(without.includes('#60a5fa')).toBe(false);
  });

  it('explicit width/height set the canvas and center the grid', () => {
    const s = renderSvg(d, { ...DEFAULTS, width: 800, height: 600 });
    expect(s).toContain('width="800" height="600"');
    expect(s).toContain('viewBox="0 0 800 600"');
  });

  it('the header block carries the spec fields', () => {
    const d2 = live('M', 'default');
    const s = renderSvg(d2, DEFAULTS);
    expect(s).toContain(`seed: ${d2.seed}`);
    expect(s).toContain(`preset: ${d2.preset}`);
    expect(s).toContain(`grid: ${d2.gridsize[0]}×${d2.gridsize[1]}`);
    expect(s).toContain(`rooms: ${d2.rooms.length}`);
    expect(s).toContain(`goalDistance: ${d2.goalDistance}`);
    // goalSlack unset ⇒ shown as '-'
    expect(s).toContain('goalSlack: -');
    expect(s).toContain(`relaxed: ${d2.relaxed === true ? 'true' : 'false'}`);
    expect(s).toMatch(/occupancy: \d+\.\d%/);

    const d3 = generate({ preset: 'M', seed: 'default', goalSlack: 2 });
    expect(renderSvg(d3, DEFAULTS)).toContain('goalSlack: 2');
  });
});

describe('renderSvg — violation marking', () => {
  it('marks the violating edge in the violation color', () => {
    const s = renderSvg(mutateR7(live('XS', 'fixture')), DEFAULTS);
    expect(s).toContain('#ef4444');
    expect(s).toContain('data-edge="0"');
  });
});

describe('renderSvg — golden snapshots (preset M, seed "default")', () => {
  it('graph view', () => {
    const d = generate({ preset: 'M', seed: 'default' });
    expect(renderSvg(d, DEFAULTS)).toMatchSnapshot();
  });

  it('tile view', () => {
    const d = generate({ preset: 'M', seed: 'default' });
    expect(renderSvg(d, { ...DEFAULTS, view: 'tile' })).toMatchSnapshot();
  });
});
