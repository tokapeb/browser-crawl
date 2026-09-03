// ─── Validation ──────────────────────────────────────────────────────────
// Enforces the ddungeon-gen DESIGN.md contract (SPEC §5). Always runs on
// render; the panel shows "0 violations" when clean.
//
// Note on R8: the generator's loop layer can legitimately stop short of
// `baseCorridorNumber` when `connectivity < 1` (verified empirically, and
// DESIGN.md §8 states the bound as `N−1 ≤ |E| ≤ base_corridor_number`).
// The edge-count range is therefore owned by R4; R8 covers room count,
// gridsize well-formedness and grid capacity.

import type { DungeonResult, Dir } from 'ddungeon-gen';
import { bfs } from './graph';
import type { RuleId, Violation } from './types';
import { DIR_OFFSETS } from './layout';

const DIRS: readonly Dir[] = ['N', 'S', 'E', 'W'];
const OPP: Record<Dir, Dir> = { N: 'S', S: 'N', E: 'W', W: 'E' };

export function validate(d: DungeonResult): Violation[] {
  const v: Violation[] = [];
  const push = (rule: RuleId, message: string, roomIds?: number[], edgeIndex?: number): void => {
    const viol: Violation = { rule, message };
    if (roomIds && roomIds.length > 0) viol.roomIds = roomIds;
    if (edgeIndex !== undefined) viol.edgeIndex = edgeIndex;
    v.push(viol);
  };

  const rooms = Array.isArray(d.rooms) ? d.rooms : [];
  const edges = Array.isArray(d.edges) ? d.edges : [];
  const [w, h] = Array.isArray(d.gridsize) ? d.gridsize : [NaN, NaN];
  const W = w;
  const H = h;
  const N = rooms.length;
  const E = edges.length;

  const roomById = new Map<number, (typeof rooms)[number]>();
  for (const r of rooms) {
    if (r && typeof r.id === 'number') roomById.set(r.id, r);
  }

  // ── R1: rooms in bounds; no two rooms share a cell ────────────────────
  {
    const bad: number[] = [];
    const seen = new Map<string, number>();
    for (const r of rooms) {
      if (!r || typeof r.id !== 'number') continue;
      const inBounds =
        Number.isInteger(r.x) &&
        Number.isInteger(r.y) &&
        r.x >= 0 &&
        r.x < W &&
        r.y >= 0 &&
        r.y < H;
      if (!inBounds) {
        bad.push(r.id);
        continue;
      }
      const k = `${r.x},${r.y}`;
      const prev = seen.get(k);
      if (prev === undefined) seen.set(k, r.id);
      else if (!bad.includes(prev)) bad.push(prev, r.id);
    }
    if (bad.length > 0) {
      push('R1', `room(s) out of bounds or sharing a cell: ${bad.join(', ')}`, bad);
    }
  }

  // ── R2: per-edge geometry (adjacency, dirFrom/dirTo consistency) ─────
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    if (!e) continue;
    const a = roomById.get(e.from);
    const b = roomById.get(e.to);
    if (!a || !b) {
      push('R2', `edge ${i}: endpoint ${!a ? e.from : e.to} does not exist`, undefined, i);
      continue;
    }
    const [ux, uy] = DIR_OFFSETS[e.dirFrom] ?? [NaN, NaN];
    const adjacent = Math.abs(b.x - a.x) + Math.abs(b.y - a.y) === 1;
    const toMatches = b.x === a.x + ux && b.y === a.y + uy;
    const dirToMatches = e.dirTo === OPP[e.dirFrom];
    if (!adjacent || !toMatches || !dirToMatches) {
      push(
        'R2',
        `edge ${i} (${e.from}→${e.to}, dirFrom ${e.dirFrom}): not grid-adjacent or dir labels inconsistent`,
        [e.from, e.to],
        i,
      );
    }
  }

  // ── R3: degree 1–4; ≤1 edge per direction slot per room ───────────────
  {
    const degree = new Map<number, number>();
    const slots = new Map<number, Set<Dir>>();
    for (const r of rooms) {
      if (r && typeof r.id === 'number') {
        degree.set(r.id, 0);
        slots.set(r.id, new Set());
      }
    }
    edges.forEach((e, i) => {
      if (!e || !degree.has(e.from) || !degree.has(e.to)) return;
      degree.set(e.from, degree.get(e.from)! + 1);
      degree.set(e.to, degree.get(e.to)! + 1);
      const sf = slots.get(e.from)!;
      if (sf.has(e.dirFrom)) {
        push(
          'R3',
          `room ${e.from}: duplicate ${e.dirFrom} direction slot (edge ${i})`,
          [e.from],
          i,
        );
      }
      sf.add(e.dirFrom);
      const st = slots.get(e.to)!;
      if (st.has(e.dirTo)) {
        push('R3', `room ${e.to}: duplicate ${e.dirTo} direction slot (edge ${i})`, [e.to], i);
      }
      st.add(e.dirTo);
    });
    const badDeg: number[] = [];
    for (const [id, deg] of degree) {
      if (deg < 1 || deg > 4) badDeg.push(id);
    }
    if (badDeg.length > 0) {
      push('R3', `room(s) with degree outside 1..4: ${badDeg.join(', ')}`, badDeg);
    }
  }

  // ── R4: N−1 ≤ E ≤ min(baseCorridorNumber, 2N) ─────────────────────────
  {
    const field = d.baseCorridorNumber;
    if (Number.isInteger(field)) {
      if (N >= 2 && E < N - 1) {
        push('R4', `E=${E} < N−1=${N - 1} (disconnected edge count)`);
      }
      const upper = Math.min(field, 2 * N);
      if (E > upper) {
        push('R4', `E=${E} > min(baseCorridorNumber, 2N)=${upper}`);
      }
    }
  }

  // ── R5: connected from entrance; entranceId = 0; entrance at y = 0 ───
  {
    if (d.entranceId !== 0) {
      push('R5', `entranceId=${String(d.entranceId)} (must be 0)`);
    }
    const room0 = roomById.get(0);
    if (room0 && room0.y !== 0) {
      push('R5', `entrance room 0 at y=${String(room0.y)} (must be 0)`, [0]);
    }
    const { distances } = bfs(d, 0);
    const unreachable = rooms
      .filter((r) => r && typeof r.id === 'number' && distances.get(r.id) === Infinity)
      .map((r) => r.id);
    if (unreachable.length > 0) {
      push('R5', `room(s) unreachable from entrance: ${unreachable.join(', ')}`, unreachable);
    }
  }

  // ── R6: goal distance semantics ───────────────────────────────────────
  {
    const { distances } = bfs(d, 0);
    const gd = Number.isInteger(d.goalId) ? distances.get(d.goalId) : undefined;
    if (gd === undefined || gd !== d.goalDistance) {
      push('R6', `dist(entrance, goal)=${String(gd)} ≠ goalDistance=${String(d.goalDistance)}`, [
        d.goalId,
      ]);
    } else if (gd !== Infinity) {
      let far = 0;
      for (const r of rooms) {
        const rdist = distances.get(r.id);
        if (rdist !== undefined && rdist !== Infinity && rdist > far) far = rdist;
      }
      const minFinal = d.minFinalDistance;
      if (d.relaxed !== true && Number.isInteger(minFinal) && gd < minFinal) {
        push('R6', `goal distance ${gd} < minFinalDistance ${minFinal} but relaxed is not set`, [
          d.goalId,
        ]);
      }
      if (d.relaxed === true && gd !== far) {
        push(
          'R6',
          `relaxed=true but goal (dist ${gd}) is not the farthest room (farthest ${far})`,
          [d.goalId],
        );
      }
      // goalSlack: when set the goal must lie within N hops of the farthest
      // room; when unset the goal IS the farthest room.
      const slack = d.goalSlack;
      if (slack !== undefined) {
        if (Number.isInteger(slack) && far - gd > slack) {
          push(
            'R6',
            `goal (dist ${gd}) is ${far - gd} hops from the farthest room (goalSlack ${slack})`,
            [d.goalId],
          );
        }
      } else if (gd !== far) {
        push(
          'R6',
          `goal (dist ${gd}) is not the farthest room (farthest ${far}); goalSlack is unset`,
          [d.goalId],
        );
      }
    }
  }

  // ── R7: weights are integers in 1..8 ─────────────────────────────────
  edges.forEach((e, i) => {
    if (!e) return;
    if (!Number.isInteger(e.weight) || e.weight < 1 || e.weight > 8) {
      push('R7', `edge ${i}: weight ${String(e.weight)} is not an integer in 1..8`, undefined, i);
    }
  });

  // ── R8: counts match config; gridsize well-formed and consistent ─────
  {
    if (!Number.isInteger(d.baseRoomNumber) || N !== d.baseRoomNumber) {
      push('R8', `rooms.length=${N} ≠ baseRoomNumber=${String(d.baseRoomNumber)}`);
    }
    const gridOk = Number.isInteger(W) && Number.isInteger(H) && W >= 2 && H >= 2;
    if (!gridOk) {
      push('R8', `gridsize [${String(W)}, ${String(H)}] is not two integers ≥ 2`);
    } else if (Number.isInteger(d.baseRoomNumber) && d.baseRoomNumber > W * H) {
      push('R8', `baseRoomNumber=${d.baseRoomNumber} exceeds grid capacity ${W}×${H}=${W * H}`);
    }
  }

  return v;
}

/** Sorted, de-duplicated list of rule ids present in a violation list. */
export function firedRules(violations: Violation[]): RuleId[] {
  const order: RuleId[] = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8'];
  const set = new Set(violations.map((x) => x.rule));
  return order.filter((r) => set.has(r));
}

export { DIRS };
