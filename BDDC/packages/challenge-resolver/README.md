# challenge-resolver

A TypeScript npm package implementing a **Tiered Slot-Filling Resolution** system for D10-based dice mechanics. Used in tabletop games to resolve challenges across multiple difficulty tiers.

The behavior of this package is defined by the reference implementation in the in-repo playground (`playground/index.html`). The exported functions behave exactly as that playground does.

## Installation

```bash
npm install challenge-resolver
```

## Usage

### Basic (deterministic, pre-rolled dice)

```typescript
import { resolveDeterministic } from "challenge-resolver"

// Roll values are provided explicitly (deterministic).
// Thresholds: Peak >= 10, Mid >= 8, Base >= 6. Pools: X=6, Y=3, Z=1.
const successes = resolveDeterministic([10, 9, 8, 7, 6, 5], 10, 8, 6, 6, 3, 1)
// => 4
```

### Full breakdown (per-die assignment)

`resolveWithDetail` returns the same total plus exactly which tier each die
filled. This is the function the playground UI uses.

```typescript
import { resolveWithDetail } from "challenge-resolver"

const result = resolveWithDetail([10, 9, 8, 7, 6, 5], 10, 8, 6, 6, 3, 1)
// => {
//    successes: 4,
//    filledPeak: 1, filledMid: 2, filledBase: 1,
//    assignment: [
//      { die: 10, tier: "peak" },
//      { die: 9,  tier: "mid"  },
//      { die: 8,  tier: "mid"  },
//      { die: 7,  tier: "base" },
//      { die: 6,  tier: null   },
//      { die: 5,  tier: null   },
//    ],
//    Tx: 10, Ty: 8, Tz: 6, X: 6, Y: 3, Z: 1
//  }
```

### Random rolls (class API)

`ChallengeResolver` rolls dice for you and applies fixed thresholds set at
construction.

```typescript
import { ChallengeResolver } from "challenge-resolver"

const resolver = new ChallengeResolver(10, 8, 6) // Peak>=10, Mid>=8, Base>=6
const successes = resolver.resolve(6, 3, 1)      // rolls 6 D10s, returns total
// or supply your own rolls:
const exact = resolver.resolveWithRolls([10, 9, 8, 7, 6, 5], 6, 3, 1) // => 4
```

## How It Works

### Inputs — thresholds and pools

Thresholds (the three `T` values) define the **minimum roll** required to fill
a tier. Pools (the three pool values) define **how many dice** and how slots are
divided. Both triplets are sorted descending internally, so **argument order
does not matter**.

| Tier | Minimum roll | Slot count | Difficulty |
|------|--------------|------------|------------|
| Peak | `>= Tx`      | `X - Y`    | Hardest    |
| Mid  | `>= Ty`      | `Y - Z`    | Medium     |
| Base | `>= Tz`      | `Z`        | Easiest    |

`X`, `Y`, `Z` are the pool values sorted so that `X >= Y >= Z`. Exactly `X`
dice are considered, and the three slot counts always sum to `X`:
`(X - Y) + (Y - Z) + Z = X`.

### Resolution algorithm (greedy, hardest tier first)

1. Sort the rolls descending.
2. Walk the rolls one by one. For each die, try the **hardest** tier that still
   has a free slot **and** that the die meets:
   - Peak if `filledPeak < (X - Y)` and `die >= Tx`
   - else Mid if `filledMid < (Y - Z)` and `die >= Ty`
   - else Base if `filledBase < Z` and `die >= Tz`
   - else the die fills nothing.
3. Total successes = `filledPeak + filledMid + filledBase`.

A die that qualifies for a harder tier also qualifies for easier tiers
(cascade-down): once Peak slots are full, a `10` will fill a Mid slot instead.

### Example

```
Thresholds 10 / 8 / 6, pools X=6, Y=3, Z=1
Slots: Peak = 6-3 = 3, Mid = 3-1 = 2, Base = 1
Rolls [5, 6, 7, 8, 9, 10] sorted -> [10, 9, 8, 7, 6, 5]

 10 -> Peak (>=10)      filledPeak 0->1
  9 -> Mid  (>=8)       filledMid  0->1
  8 -> Mid  (>=8)       filledMid  1->2  (Mid full)
  7 -> Base (>=6)       filledBase 0->1  (Base full)
  6 -> nothing (all full)
  5 -> nothing (below all thresholds)

Total successes: 1 + 2 + 1 = 4
```

## API Reference

### `resolveDeterministic(rolls, Tx, Ty, Tz, X, Y, Z): number`

Deterministic core. `rolls` is an array of pre-generated D10 values (length
need not equal `X`; only the top `X`-worthy dice can matter, extras are simply
considered in order). Returns total successes.

### `resolveWithDetail(rolls, Tx, Ty, Tz, X, Y, Z): ResolutionDetail`

Same inputs as `resolveDeterministic`. Returns:

| Field         | Type            | Meaning                                   |
|---------------|-----------------|-------------------------------------------|
| `successes`   | `number`        | Total successes (same as the function)    |
| `filledPeak`  | `number`        | Peak slots filled                         |
| `filledMid`   | `number`        | Mid slots filled                          |
| `filledBase`  | `number`        | Base slots filled                         |
| `assignment`  | `DieAssignment[]` | Per-die `{ die, tier }`, `tier` is `"peak" \| "mid" \| "base" \| null` |
| `Tx`,`Ty`,`Tz`| `number`        | Thresholds sorted descending              |
| `X`,`Y`,`Z`   | `number`        | Pools sorted descending                   |

### `class ChallengeResolver`

| Member | Description |
|--------|-------------|
| `constructor(tx, ty, tz)` | Thresholds, order-insensitive. Must be non-negative **finite** numbers, else throws. |
| `resolve(X, Y, Z): number` | Rolls `X` random D10s and resolves. Pools must be non-negative finite, else throws. |
| `resolveWithRolls(rolls, X, Y, Z): number` | Resolves provided rolls. Same pool validation as `resolve`. |

**Note:** the class API validates more strictly than the standalone functions
(it rejects non-finite thresholds and validates *all three* pools, not just the
largest). See "Validation" below.

### Default export

The default export is `resolveDeterministic`, so `import challengeResolver from
"challenge-resolver"` gives you the deterministic function directly.

## Validation

The standalone functions (`resolveDeterministic` / `resolveWithDetail`) mirror
the playground exactly:

- **Pools** are sorted descending; **only the largest pool `X` is validated** —
  it must be a non-negative finite number, else `Error: Pool sizes must be
  non-negative finite numbers`. A negative or NaN value in the *smaller* pool
  positions is **not** rejected (it simply reduces slot counts).
- **Thresholds** are sorted descending and each must be **non-negative**, else
  `Error: Thresholds must be non-negative`. A `NaN` threshold is *not* rejected
  by this check, but `die >= NaN` is always false, so a NaN threshold
  effectively disables that tier (no successes from it).

The class API is stricter: thresholds must be non-negative **and** finite, and
all three pools are validated as non-negative finite.

## Edge Cases

- **Equal pools:** `X === Y` => 0 Peak slots; `Y === Z` => 0 Mid slots.
- **Low thresholds:** a threshold of `0` means any roll qualifies for that tier.
- **Excess dice:** dice that fill no slot are wasted — they add no bonus.
- **More dice than slots / high dice spilling:** once a tier is full, a
  qualifying die cascades to the next easier tier.

## Playground

An interactive UI that imports the package (no copy of the logic lives in the
playground). Two ways to run it:

### Dev server (live source, hot reload)

```bash
npm run playground
```

Open the URL printed by Vite (default `http://localhost:5173`). The bare
`challenge-resolver` import is resolved to `src/index.ts` via a Vite alias, so
the playground always reflects the current source.

### Self-contained single file (no server needed)

```bash
npm run playground:build
```

Produces `playground/dist/index.html` with the package code inlined. That file
can be opened directly from disk (`file://`) — double-click it.

Note: the *source* `playground/index.html` cannot be opened from `file://`
(browsers refuse to load ES modules from `file://`); it shows a banner
explaining the two commands above.

## Development

```bash
npm install
npm run build      # tsc -> dist/
npm test           # vitest run
npm run test:watch
```

## TypeScript Support

Full type definitions ship in `dist/`. All parameters and returns are typed as
`number` (or the documented objects), and the `ResolutionDetail` /
`DieAssignment` / `Tier` types are exported.
