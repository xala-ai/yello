/**
 * Duplo ↔ System LEGO cross-scale support.
 *
 * Physical facts (LEGO Help / Brick Architect):
 *  - Duplo is 2× System in every axis (stud pitch, brick height).
 *  - Only even-stud System bricks clutch onto Duplo hollow studs
 *    (2×2, 2×4 yes; 1×2, 2×3 no).
 *  - Figures / minifigs are NOT compatible across scales.
 *  - Matching here is brick-first (and Duplo plates ≈ System brick height).
 *
 * Volume: one Duplo N×M brick ≈ (2N)×(2M) System studs × 2 System bricks tall
 *        = 8 × System N×M bricks by volume.
 */

import type { InventoryPart, LegoSet } from '@/types/rebrickable';

/** Rebrickable part category: "Duplo, Quatro and Primo". */
export const DUPLO_PART_CAT_ID = 4;

/**
 * Themes whose root is Duplo (504), Primo (440), or Quatro (441),
 * plus Educational “Duplo and Explore” (516). Generated from Rebrickable themes.
 */
export const DUPLO_THEME_IDS = new Set<number>([
  440, 441, 504, 505, 506, 516, 626, 627, 628, 629, 630, 631, 632, 633, 634,
  635, 636, 638, 639, 640, 641, 647, 648, 650, 651, 652, 653, 657, 658, 659,
  660, 661, 662, 663, 664, 665, 666, 722, 754, 788, 789, 790,
]);

export type BrickScale = 'system' | 'duplo' | 'unknown';

export interface DuploBrickSpec {
  /** Duplo part number */
  partNum: string;
  /** Duplo studs X × Z */
  duploStudsX: number;
  duploStudsZ: number;
  /**
   * Equivalent System brick part that tiles the footprint at System scale
   * (even studs only — the pieces that can sit on Duplo studs).
   */
  systemBrickPartNum: string;
  /** How many of that System brick equal one Duplo brick by volume. */
  systemBrickQty: number;
}

/**
 * Common Duplo bricks ↔ System even bricks (2× scale, brick-only).
 * systemBrickQty = 8 for same “named” size (2× footprint × 2× height).
 */
export const DUPLO_BRICK_SPECS: DuploBrickSpec[] = [
  { partNum: '3437',  duploStudsX: 2, duploStudsZ: 2, systemBrickPartNum: '3003', systemBrickQty: 8 },  // Duplo 2×2 ↔ 8× System 2×2
  { partNum: '3011',  duploStudsX: 2, duploStudsZ: 4, systemBrickPartNum: '3001', systemBrickQty: 8 },  // Duplo 2×4 ↔ 8× System 2×4
  { partNum: '87084', duploStudsX: 2, duploStudsZ: 3, systemBrickPartNum: '3002', systemBrickQty: 8 },  // Duplo 2×3 ↔ 8× System 2×3 (odd; clutch weaker)
  { partNum: '2300',  duploStudsX: 2, duploStudsZ: 6, systemBrickPartNum: '2456', systemBrickQty: 8 },  // Duplo 2×6 ↔ 8× System 2×6
  { partNum: '4199',  duploStudsX: 2, duploStudsZ: 8, systemBrickPartNum: '3007', systemBrickQty: 8 },  // Duplo 2×8 ↔ 8× System 2×8
  { partNum: '2291',  duploStudsX: 2, duploStudsZ: 10, systemBrickPartNum: '3007', systemBrickQty: 10 }, // approx with 2×8s — see notes in matcher
];

const DUPLO_BY_PART = new Map(DUPLO_BRICK_SPECS.map((s) => [s.partNum, s]));
const SYSTEM_TO_DUPLO = new Map<string, DuploBrickSpec[]>();
for (const spec of DUPLO_BRICK_SPECS) {
  const list = SYSTEM_TO_DUPLO.get(spec.systemBrickPartNum) ?? [];
  list.push(spec);
  SYSTEM_TO_DUPLO.set(spec.systemBrickPartNum, list);
}

export function isDuploTheme(themeId: number | undefined | null): boolean {
  if (themeId == null) return false;
  return DUPLO_THEME_IDS.has(themeId);
}

export function isDuploPart(part: { part_num?: string; name?: string; part_cat_id?: number } | null | undefined): boolean {
  if (!part) return false;
  if (part.part_cat_id === DUPLO_PART_CAT_ID) return true;
  const name = (part.name || '').toLowerCase();
  if (name.includes('duplo') || name.includes('quatro') || name.includes('primo')) return true;
  if (part.part_num && DUPLO_BY_PART.has(part.part_num)) return true;
  return false;
}

/** Set is Duplo if theme says so, or name does, or inventory is majority Duplo parts. */
export function isDuploSet(set: Pick<LegoSet, 'theme_id' | 'name'>, inventory?: InventoryPart[]): boolean {
  if (isDuploTheme(set.theme_id)) return true;
  if ((set.name || '').toLowerCase().includes('duplo')) return true;
  if (!inventory?.length) return false;
  let duploQty = 0;
  let total = 0;
  for (const p of inventory) {
    if (!p?.part || p.is_spare) continue;
    total += p.quantity;
    if (isDuploPart(p.part)) duploQty += p.quantity;
  }
  return total > 0 && duploQty / total >= 0.5;
}

export function partScale(part: InventoryPart['part'] | null | undefined): BrickScale {
  if (!part) return 'unknown';
  if (isDuploPart(part)) return 'duplo';
  const name = (part.name || '').toLowerCase();
  if (name.includes('technic')) return 'system';
  return 'system';
}

export function selectionHasMixedScales(
  sets: Array<Pick<LegoSet, 'set_num' | 'theme_id' | 'name'>>,
  selectedSetIds: string[],
  inventories?: Record<string, InventoryPart[]>,
): boolean {
  const active = sets.filter((s) => selectedSetIds.includes(s.set_num));
  if (active.length < 2) return false;
  let hasDuplo = false;
  let hasSystem = false;
  for (const s of active) {
    if (isDuploSet(s, inventories?.[s.set_num])) hasDuplo = true;
    else hasSystem = true;
  }
  return hasDuplo && hasSystem;
}

export interface CrossScaleSubResult {
  /** Duplo (or System) part consumed from the bin */
  usedPartNum: string;
  /** How many of usedPartNum were consumed */
  usedQty: number;
  /** How many required units this covered */
  coveredQty: number;
  /** Intrinsic rigidity / fidelity loss (0..1) — cross-scale is always significant */
  basePenalty: number;
  direction: 'duplo_for_system' | 'system_for_duplo';
}

/**
 * Try to cover a required brick using the other scale.
 * Brick-only; high penalty (creations are "out of this world").
 */
export function tryCrossScaleBrickSub(
  requiredPart: InventoryPart,
  requiredQty: number,
  availableMap: Map<string, number>,
): CrossScaleSubResult | null {
  if (!requiredPart?.part || requiredQty <= 0) return null;
  const reqNum = requiredPart.part.part_num;
  const reqIsDuplo = isDuploPart(requiredPart.part);

  // System required ← Duplo owned
  if (!reqIsDuplo) {
    const specs = SYSTEM_TO_DUPLO.get(reqNum);
    if (!specs?.length) return null;
    let best: CrossScaleSubResult | null = null;
    for (const spec of specs) {
      const have = availableMap.get(spec.partNum) ?? 0;
      if (have <= 0) continue;
      // Each Duplo brick covers systemBrickQty of the System brick
      const maxCover = have * spec.systemBrickQty;
      const covered = Math.min(requiredQty, maxCover);
      if (covered <= 0) continue;
      const usedQty = Math.ceil(covered / spec.systemBrickQty);
      const odd = spec.duploStudsX % 2 !== 0 || spec.duploStudsZ % 2 !== 0;
      const penalty = odd ? 0.72 : 0.58;
      const candidate: CrossScaleSubResult = {
        usedPartNum: spec.partNum,
        usedQty,
        coveredQty: covered,
        basePenalty: penalty,
        direction: 'duplo_for_system',
      };
      if (!best || candidate.coveredQty > best.coveredQty || candidate.basePenalty < best.basePenalty) {
        best = candidate;
      }
    }
    return best;
  }

  // Duplo required ← System owned (stack even System bricks to Duplo volume)
  const spec = DUPLO_BY_PART.get(reqNum);
  if (!spec) return null;
  const haveSys = availableMap.get(spec.systemBrickPartNum) ?? 0;
  if (haveSys < spec.systemBrickQty) return null;
  const maxDuplo = Math.floor(haveSys / spec.systemBrickQty);
  const covered = Math.min(requiredQty, maxDuplo);
  if (covered <= 0) return null;
  return {
    usedPartNum: spec.systemBrickPartNum,
    usedQty: covered * spec.systemBrickQty,
    coveredQty: covered,
    basePenalty: 0.62,
    direction: 'system_for_duplo',
  };
}
