import { describe, it, expect } from 'vitest';
import { generate } from 'ddungeon-gen';
import { validate, firedRules } from '../src/core/validate';
import type { RuleId } from '../src/core/types';
import {
  clone,
  handL,
  handLine,
  handSquare,
  live,
  r3Fixture,
  mutateR1,
  mutateR1Overlap,
  mutateR2,
  mutateR4,
  mutateR5,
  mutateR6,
  mutateR7,
  mutateR8,
} from './fixtures';

const PRESETS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const;
const SEEDS = ['default', 'a', 'b', 'c'];

describe('validate — known-good dungeons', () => {
  it('hand-authored tiny dungeons pass with 0 violations', () => {
    for (const d of [handL(), handSquare(), handLine()]) {
      expect(validate(d)).toEqual([]);
    }
  });

  it('live-generated dungeons pass with 0 violations (all presets × seeds)', () => {
    for (const preset of PRESETS) {
      for (const seed of SEEDS) {
        const d = live(preset, seed);
        expect(validate(d), `${preset}/${seed}`).toEqual([]);
      }
    }
  });
});

describe('validate — per-rule isolation (one field mutated ⇒ exactly that rule fires)', () => {
  const cases: Array<{
    rule: RuleId;
    make: (d: ReturnType<typeof live>) => ReturnType<typeof live>;
  }> = [
    { rule: 'R1', make: mutateR1 },
    { rule: 'R2', make: mutateR2 },
    { rule: 'R4', make: mutateR4 },
    { rule: 'R5', make: mutateR5 },
    { rule: 'R6', make: mutateR6 },
    { rule: 'R7', make: mutateR7 },
    { rule: 'R8', make: mutateR8 },
  ];

  for (const { rule, make } of cases) {
    it(`${rule}: fires ${rule} and no other rule`, () => {
      const mutated = make(live('XS', 'fixture'));
      const fired = firedRules(validate(mutated));
      expect(fired).toEqual([rule]);
    });
  }

  it('R3: fires R3 and no other rule (parallel-edge fixture)', () => {
    const fired = firedRules(validate(r3Fixture()));
    expect(fired).toEqual(['R3']);
  });

  it('R1 duplicate-cell check fires (co-firing R3/R8 is expected for the added room)', () => {
    const fired = firedRules(validate(mutateR1Overlap(live('XS', 'fixture'))));
    expect(fired).toContain('R1');
  });
});

describe('validate — violation detail', () => {
  it('R7 violation points at the offending edge', () => {
    const v = validate(mutateR7(live('XS', 'fixture')));
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('R7');
    expect(v[0].edgeIndex).toBe(0);
  });

  it('R2 violation points at the offending edge and its endpoints', () => {
    const v = validate(mutateR2(live('XS', 'fixture')));
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('R2');
    expect(v[0].edgeIndex).toBeDefined();
    expect(v[0].roomIds).toHaveLength(2);
  });

  it('R1 violation lists the out-of-bounds rooms', () => {
    const d = live('XS', 'fixture');
    const v = validate(mutateR1(d));
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('R1');
    expect(v[0].roomIds).toEqual(d.rooms.map((r) => r.id));
  });

  it('a fully broken dungeon fires multiple rules without crashing', () => {
    const d = mutateR6(mutateR7(live('XS', 'fixture')));
    d.entranceId = 12345;
    const fired = firedRules(validate(d));
    expect(fired).toContain('R5');
    expect(fired).toContain('R6');
    expect(fired).toContain('R7');
  });
});

describe('validate — goalSlack', () => {
  it('live-generated dungeons with goalSlack pass with 0 violations', () => {
    for (const preset of PRESETS) {
      for (const seed of SEEDS) {
        for (const slack of [0, 1, 2]) {
          const d = generate({ preset, seed, goalSlack: slack });
          expect(d.goalSlack, `${preset}/${seed}/slack=${slack}`).toBe(slack);
          expect(validate(d), `${preset}/${seed}/slack=${slack}`).toEqual([]);
        }
      }
    }
  });

  it('fires exactly R6 (slack clause) when the goal sits farther from the end than allowed', () => {
    const d = clone(handLine());
    d.minFinalDistance = 1; // keep the min-final clause quiet
    d.goalSlack = 0;
    d.goalId = 1;
    d.goalDistance = 1; // consistent with the actual hop distance
    const v = validate(d);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('R6');
    expect(v[0].roomIds).toEqual([1]);
    expect(v[0].message).toMatch(/goalSlack/);
  });

  it('fires R6 when goalSlack is unset and the goal is not the farthest room', () => {
    const d = clone(live('XS', 'fixture'));
    d.goalId = 1;
    d.goalDistance = 1;
    const fired = firedRules(validate(d));
    expect(fired).toEqual(['R6']);
  });
});
