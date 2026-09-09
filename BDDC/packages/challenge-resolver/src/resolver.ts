/** Sort three numbers descending, return [max, mid, min] */
export function sortDesc(a: number, b: number, c: number): [number, number, number] {
  const arr = [a, b, c].sort((x, y) => y - x)
  return [arr[0], arr[1], arr[2]]
}

export type Tier = "peak" | "mid" | "base" | null

export interface DieAssignment {
  die: number
  tier: Tier
}

export interface ResolutionDetail {
  successes: number
  filledPeak: number
  filledMid: number
  filledBase: number
  assignment: DieAssignment[]
  Tx: number
  Ty: number
  Tz: number
  X: number
  Y: number
  Z: number
}

function assignDice(
  rolls: number[],
  Tx: number,
  Ty: number,
  Tz: number,
  peakSlots: number,
  midSlots: number,
  baseSlots: number,
): { filledPeak: number; filledMid: number; filledBase: number; assignment: DieAssignment[] } {
  let filledPeak = 0
  let filledMid = 0
  let filledBase = 0
  const assignment: DieAssignment[] = []
  const sorted = [...rolls].sort((a, b) => b - a)

  for (const die of sorted) {
    if (filledPeak < peakSlots && die >= Tx) {
      filledPeak++
      assignment.push({ die, tier: "peak" })
    } else if (filledMid < midSlots && die >= Ty) {
      filledMid++
      assignment.push({ die, tier: "mid" })
    } else if (filledBase < baseSlots && die >= Tz) {
      filledBase++
      assignment.push({ die, tier: "base" })
    } else {
      assignment.push({ die, tier: null })
    }
  }

  return { filledPeak, filledMid, filledBase, assignment }
}

/**
 * Sort thresholds and pools descending, then validate: the largest pool (X)
 * must be a non-negative finite number and every threshold must be
 * non-negative. Mirrors the playground reference implementation.
 */
function normalize(
  thresholdA: number,
  thresholdB: number,
  thresholdC: number,
  poolA: number,
  poolB: number,
  poolC: number,
): { Tx: number; Ty: number; Tz: number; X: number; Y: number; Z: number } {
  const [Tx, Ty, Tz] = sortDesc(thresholdA, thresholdB, thresholdC)
  const [X, Y, Z] = sortDesc(poolA, poolB, poolC)
  if (X < 0 || !Number.isFinite(X)) {
    throw new Error("Pool sizes must be non-negative finite numbers")
  }
  if (Tx < 0 || Ty < 0 || Tz < 0) {
    throw new Error("Thresholds must be non-negative")
  }
  return { Tx, Ty, Tz, X, Y, Z }
}

/** Deterministic resolve with pre-generated rolls; returns the full per-die breakdown */
export function resolveWithDetail(
  rolls: number[],
  thresholdA: number,
  thresholdB: number,
  thresholdC: number,
  poolA: number,
  poolB: number,
  poolC: number,
): ResolutionDetail {
  const { Tx, Ty, Tz, X, Y, Z } = normalize(thresholdA, thresholdB, thresholdC, poolA, poolB, poolC)
  const { filledPeak, filledMid, filledBase, assignment } = assignDice(rolls, Tx, Ty, Tz, X - Y, Y - Z, Z)
  return {
    successes: filledPeak + filledMid + filledBase,
    filledPeak,
    filledMid,
    filledBase,
    assignment,
    Tx,
    Ty,
    Tz,
    X,
    Y,
    Z,
  }
}

/** Pure deterministic resolver for testing: pre-generated rolls, total successes */
export function resolveDeterministic(
  rolls: number[],
  thresholdA: number,
  thresholdB: number,
  thresholdC: number,
  poolA: number,
  poolB: number,
  poolC: number,
): number {
  return resolveWithDetail(rolls, thresholdA, thresholdB, thresholdC, poolA, poolB, poolC).successes
}

export class ChallengeResolver {
  constructor(
    private readonly tx: number,
    private readonly ty: number,
    private readonly tz: number,
  ) {
    const [T1, T2, T3] = sortDesc(tx, ty, tz)
    if (T1 < 0 || T2 < 0 || T3 < 0 || !Number.isFinite(T1) || !Number.isFinite(T2) || !Number.isFinite(T3)) {
      throw new Error("Thresholds must be non-negative finite numbers")
    }
    this.tx = T1
    this.ty = T2
    this.tz = T3
  }

  resolve(poolA: number, poolB: number, poolC: number): number {
    this.validatePools(poolA, poolB, poolC)
    const [X, Y, Z] = sortDesc(poolA, poolB, poolC)
    const rolls = Array.from({ length: X }, () => Math.floor(Math.random() * 10) + 1)
    return this.assign(rolls, X - Y, Y - Z, Z)
  }

  resolveWithRolls(rolls: number[], poolA: number, poolB: number, poolC: number): number {
    this.validatePools(poolA, poolB, poolC)
    const [X, Y, Z] = sortDesc(poolA, poolB, poolC)
    return this.assign(rolls, X - Y, Y - Z, Z)
  }

  private validatePools(poolA: number, poolB: number, poolC: number): void {
    if (poolA < 0 || poolB < 0 || poolC < 0 || !Number.isFinite(poolA) || !Number.isFinite(poolB) || !Number.isFinite(poolC)) {
      throw new Error("Pool sizes must be non-negative finite numbers")
    }
  }

  private assign(rolls: number[], peakSlots: number, midSlots: number, baseSlots: number): number {
    const { filledPeak, filledMid, filledBase } = assignDice(rolls, this.tx, this.ty, this.tz, peakSlots, midSlots, baseSlots)
    return filledPeak + filledMid + filledBase
  }
}
