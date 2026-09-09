import { describe, it, expect } from "vitest"
import { ChallengeResolver, resolveDeterministic, resolveWithDetail } from "../src/resolver.js"

describe("ChallengeResolver", () => {
  it("1. Design doc example — 6 dice, thresholds 10/8/6", () => {
    expect(resolveDeterministic([10, 9, 8, 7, 6, 5], 10, 8, 6, 6, 3, 1)).toBe(4)
  })

  it("2. Empty pools — no dice rolled", () => {
    expect(resolveDeterministic([], 10, 8, 6, 0, 0, 0)).toBe(0)
  })

  it("3. All perfect rolls — all Peak slots filled", () => {
    expect(resolveDeterministic([10, 10, 10], 10, 8, 6, 3, 0, 0)).toBe(3)
  })

  it("4. All low rolls — no successes possible", () => {
    expect(resolveDeterministic([1, 1, 1, 1], 10, 8, 6, 4, 0, 0)).toBe(0)
  })

  it("5. More dice than Peak slots — excess wasted", () => {
    expect(resolveDeterministic([10, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], 10, 8, 6, 11, 0, 0)).toBe(2)
  })

  it("6. Peak-only resolver — only exact threshold counts", () => {
    expect(resolveDeterministic([10, 9, 8, 7], 10, 0, 0, 4, 0, 0)).toBe(1)
  })

  it("7. Cascade: dice spill from Peak to Base when Mid is zero", () => {
    expect(resolveDeterministic([9, 8, 7, 6], 10, 8, 6, 4, 2, 2)).toBe(2)
  })

  it("8. Low threshold: most dice qualify", () => {
    expect(resolveDeterministic([8, 7, 6, 5, 4, 3], 6, 6, 6, 6, 0, 0)).toBe(3)
  })

  it("9. Sparse high rolls among many low", () => {
    expect(resolveDeterministic([10, 9, 1, 1, 1, 1, 1, 1, 1, 1, 1], 10, 8, 6, 11, 0, 0)).toBe(1)
  })

  it("10. Pool input order does not matter", () => {
    expect(resolveDeterministic([10, 9, 8, 7, 6, 5], 10, 8, 6, 3, 6, 1)).toBe(4)
  })

  it("11. Constructor input order does not matter", () => {
    expect(resolveDeterministic([10, 9, 8, 7, 6, 5], 6, 10, 8, 6, 3, 1)).toBe(4)
  })

  it("12. Negative largest pool throws", () => {
    expect(() => resolveDeterministic([], 10, 8, 6, -1, -2, -3)).toThrow("Pool sizes must be non-negative")
  })

  it("12b. Negative non-largest pool does not throw (only X is validated)", () => {
    expect(() => resolveDeterministic([], 10, 8, 6, 0, 0, -1)).not.toThrow()
    expect(resolveDeterministic([], 10, 8, 6, 0, 0, -1)).toBe(0)
  })

  it("12c. Negative threshold throws", () => {
    expect(() => resolveDeterministic([], 10, -8, 6, 6, 3, 1)).toThrow("Thresholds must be non-negative")
  })

  it("12d. NaN threshold does not throw and yields no successes", () => {
    expect(resolveDeterministic([10, 10], NaN, 8, 6, 2, 0, 0)).toBe(0)
  })

  it("13. No qualifying dice at all", () => {
    expect(resolveDeterministic([5, 4, 3, 2, 1], 10, 8, 6, 5, 0, 0)).toBe(0)
  })

  it("14. Cascade across all three tiers", () => {
    expect(resolveDeterministic([9, 8, 7, 6, 5], 10, 8, 6, 5, 3, 1)).toBe(3)
  })

  it("15. High dice spill down when higher tiers full", () => {
    expect(resolveDeterministic([10, 10, 5, 4], 10, 8, 6, 4, 2, 2)).toBe(2)
  })

  it("16. Dice cap out at slot count", () => {
    expect(resolveDeterministic([10, 10, 9, 9, 8, 8, 7, 7, 6, 6, 5, 5], 10, 8, 6, 12, 0, 0)).toBe(2)
  })

  it("17. Default constructor + design doc call", () => {
    expect(resolveDeterministic([5, 6, 7, 8, 9, 10], 10, 8, 6, 6, 3, 1)).toBe(4)
  })

  it("18. resolveWithDetail returns the full breakdown (design doc example)", () => {
    const detail = resolveWithDetail([10, 9, 8, 7, 6, 5], 10, 8, 6, 6, 3, 1)
    expect(detail.successes).toBe(4)
    expect(detail.filledPeak).toBe(1)
    expect(detail.filledMid).toBe(2)
    expect(detail.filledBase).toBe(1)
    expect(detail.Tx).toBe(10)
    expect(detail.Ty).toBe(8)
    expect(detail.Tz).toBe(6)
    expect(detail.X).toBe(6)
    expect(detail.Y).toBe(3)
    expect(detail.Z).toBe(1)
    expect(detail.assignment).toHaveLength(6)
    expect(detail.assignment[0]).toEqual({ die: 10, tier: "peak" })
    expect(detail.assignment[1]).toEqual({ die: 9, tier: "mid" })
    expect(detail.assignment[5]).toEqual({ die: 5, tier: null })
  })

  it("19. resolveWithDetail assignment shows cascade-down and wasted dice", () => {
    // pools (4, 3, 1): 1 peak, 2 mid, 1 base slot
    const detail = resolveWithDetail([10, 10, 9, 8], 10, 8, 6, 4, 3, 1)
    expect(detail.successes).toBe(4)
    expect(detail.filledPeak).toBe(1)
    expect(detail.filledMid).toBe(2)
    expect(detail.filledBase).toBe(1)
    expect(detail.assignment).toEqual([
      { die: 10, tier: "peak" },
      { die: 10, tier: "mid" }, // peak full, 10 cascades down to mid
      { die: 9, tier: "mid" },
      { die: 8, tier: "base" },
    ])
  })

  it("20. ChallengeResolver.resolveWithRolls agrees with resolveDeterministic", () => {
    const resolver = new ChallengeResolver(10, 8, 6)
    const rolls = [10, 9, 8, 7, 6, 5]
    expect(resolver.resolveWithRolls(rolls, 6, 3, 1)).toBe(resolveDeterministic(rolls, 10, 8, 6, 6, 3, 1))
    expect(resolver.resolveWithRolls(rolls, 6, 3, 1)).toBe(4)
  })

  it("21. ChallengeResolver.resolve returns a number within [0, X]", () => {
    const resolver = new ChallengeResolver(10, 8, 6)
    for (let i = 0; i < 50; i++) {
      const result = resolver.resolve(6, 3, 1)
      expect(Number.isInteger(result)).toBe(true)
      expect(result).toBeGreaterThanOrEqual(0)
      expect(result).toBeLessThanOrEqual(6)
    }
  })

  it("22. ChallengeResolver constructor rejects negative and non-finite thresholds", () => {
    expect(() => new ChallengeResolver(-5, 8, 6)).toThrow("Thresholds must be non-negative finite numbers")
    expect(() => new ChallengeResolver(NaN, 8, 6)).toThrow("Thresholds must be non-negative finite numbers")
    expect(() => new ChallengeResolver(Infinity, 8, 6)).toThrow("Thresholds must be non-negative finite numbers")
  })
})
