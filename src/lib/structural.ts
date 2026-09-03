/**
 * Structural substitution engine for YelloBricks.
 *
 * Core idea (inspired by BrickGPT / voxel-based SCA):
 *  - Each LEGO part has a stud grid footprint (width × depth) and a height.
 *  - A large plate/brick can often be replaced by multiple smaller ones covering
 *    the same footprint, PROVIDED the seams do not fall on a load-bearing joint.
 *  - We encode known substitution rules as a static table.  A full SCA solver
 *    is out of scope here; the table covers the most common real-world cases.
 *
 * Rigidity penalty (0 = no loss, 1 = completely compromised):
 *  - Splitting along an unsupported span (e.g. 1×8 → two 1×4s with the seam
 *    in the middle of a gap) = high penalty (0.6-0.8)
 *  - Splitting with overlapping / staggered joints = low penalty (0.1-0.2)
 *  - Color-only swap = 0 penalty (no structural effect)
 *
 * References:
 *  - BrickGPT (Pun et al., ICCV 2025) — voxel occupancy + GNN for valid placements
 *  - Stable Bricks (MIT 2019) — finite-element stability analysis of brick assemblies
 *  - LDraw part library — part dimensions and connection point metadata
 */

import { InventoryPart } from '@/types/rebrickable';

/** Footprint of a LEGO piece in LDU (1 stud = 20 LDU). */
export interface PartGeometry {
    /** Stud width (X axis) */
    studsX: number;
    /** Stud depth (Z axis) */
    studsZ: number;
    /** Height in plate units (1 brick = 3 plates) */
    heightPlates: number;
    /** True if the part contributes lateral (horizontal) structural stiffness. */
    isStructural: boolean;
}

/**
 * A substitution rule: the required part can be replaced by one or more
 * substitute parts when certain conditions are met.
 */
export interface SubstitutionRule {
    requiredPartNum: string;
    /** One or more parts (each with a multiplier) that cover the same footprint. */
    substitutes: Array<{ partNum: string; qty: number }>;
    /** Estimated rigidity loss of using substitutes vs the original (0..1). */
    basePenalty: number;
}

// ---------------------------------------------------------------------------
// Static geometry table — covers common plates and bricks.
// Source: LDraw parts library dimensions.
// ---------------------------------------------------------------------------
const PART_GEOMETRY: Record<string, PartGeometry> = {
    // Plates (1 plate high)
    '3024': { studsX: 1, studsZ: 1, heightPlates: 1, isStructural: false },  // 1×1 plate
    '3023': { studsX: 2, studsZ: 1, heightPlates: 1, isStructural: false },  // 2×1 plate
    '3022': { studsX: 2, studsZ: 2, heightPlates: 1, isStructural: false },  // 2×2 plate
    '3021': { studsX: 3, studsZ: 2, heightPlates: 1, isStructural: false },  // 2×3 plate
    '3020': { studsX: 4, studsZ: 2, heightPlates: 1, isStructural: false },  // 2×4 plate
    '3795': { studsX: 6, studsZ: 2, heightPlates: 1, isStructural: false },  // 2×6 plate
    '3034': { studsX: 8, studsZ: 2, heightPlates: 1, isStructural: false },  // 2×8 plate
    '4282': { studsX: 16, studsZ: 2, heightPlates: 1, isStructural: false }, // 2×16 plate
    '3832': { studsX: 10, studsZ: 2, heightPlates: 1, isStructural: false }, // 2×10 plate
    // Standard bricks (3 plates high)
    '3005': { studsX: 1, studsZ: 1, heightPlates: 3, isStructural: true },   // 1×1 brick
    '3004': { studsX: 2, studsZ: 1, heightPlates: 3, isStructural: true },   // 2×1 brick
    '3001': { studsX: 4, studsZ: 2, heightPlates: 3, isStructural: true },   // 2×4 brick
    '3002': { studsX: 3, studsZ: 2, heightPlates: 3, isStructural: true },   // 2×3 brick
    '3003': { studsX: 2, studsZ: 2, heightPlates: 3, isStructural: true },   // 2×2 brick
    '2456': { studsX: 6, studsZ: 2, heightPlates: 3, isStructural: true },   // 2×6 brick
    '3007': { studsX: 8, studsZ: 2, heightPlates: 3, isStructural: true },   // 2×8 brick
};

// ---------------------------------------------------------------------------
// Substitution rule table.
// Penalty heuristic: splitting a structural piece across a seam = 0.4 base;
// non-structural (plates) = 0.15 base (plates rely on bonded layers above).
// ---------------------------------------------------------------------------
export const SUBSTITUTION_RULES: SubstitutionRule[] = [
    // Plates
    { requiredPartNum: '3021', substitutes: [{ partNum: '3023', qty: 3 }], basePenalty: 0.15 }, // 2×3 ← three 2×1
    { requiredPartNum: '3020', substitutes: [{ partNum: '3021', qty: 2 }], basePenalty: 0.12 }, // 2×4 ← two 2×2 (approx, overlapping OK)
    { requiredPartNum: '3795', substitutes: [{ partNum: '3021', qty: 2 }], basePenalty: 0.15 }, // 2×6 ← two 2×3
    { requiredPartNum: '3795', substitutes: [{ partNum: '3020', qty: 1 }, { partNum: '3023', qty: 1 }], basePenalty: 0.12 }, // 2×6 ← 2×4 + 2×1 (better overlap)
    { requiredPartNum: '3034', substitutes: [{ partNum: '3795', qty: 1 }, { partNum: '3023', qty: 1 }], basePenalty: 0.18 }, // 2×8 ← 2×6 + 2×1 (poor seam)
    { requiredPartNum: '3034', substitutes: [{ partNum: '3020', qty: 2 }], basePenalty: 0.12 }, // 2×8 ← two 2×4
    { requiredPartNum: '3832', substitutes: [{ partNum: '3034', qty: 1 }, { partNum: '3023', qty: 1 }], basePenalty: 0.2 }, // 2×10 ← 2×8+2×1
    // Bricks
    { requiredPartNum: '3002', substitutes: [{ partNum: '3004', qty: 3 }], basePenalty: 0.4 }, // 2×3 brick ← three 2×1 bricks
    { requiredPartNum: '2456', substitutes: [{ partNum: '3002', qty: 2 }], basePenalty: 0.35 }, // 2×6 ← two 2×3
    { requiredPartNum: '3001', substitutes: [{ partNum: '3003', qty: 2 }], basePenalty: 0.3 }, // 2×4 ← two 2×2
    { requiredPartNum: '3007', substitutes: [{ partNum: '3001', qty: 2 }], basePenalty: 0.4 }, // 2×8 ← two 2×4
];

// Index for O(1) lookup
const RULES_BY_REQUIRED = new Map<string, SubstitutionRule[]>();
for (const rule of SUBSTITUTION_RULES) {
    const existing = RULES_BY_REQUIRED.get(rule.requiredPartNum) ?? [];
    existing.push(rule);
    RULES_BY_REQUIRED.set(rule.requiredPartNum, existing);
}

export function getSubstitutionRules(partNum: string): SubstitutionRule[] {
    return RULES_BY_REQUIRED.get(partNum) ?? [];
}

export function getPartGeometry(partNum: string): PartGeometry | null {
    return PART_GEOMETRY[partNum] ?? null;
}

/**
 * Attempt to satisfy a required part from the user's available parts using
 * structural substitution.  Returns the best (lowest penalty) rule that can
 * be fully satisfied by the available parts, or null if none.
 *
 * @param requiredPart  The part the MOC/set needs.
 * @param requiredQty   How many are needed.
 * @param availableMap  Map<partNum, quantityAvailable> (shape-only, color-agnostic).
 */
export function tryStructuralSub(
    requiredPart: InventoryPart,
    requiredQty: number,
    availableMap: Map<string, number>
): { rule: SubstitutionRule; penalty: number } | null {
    const rules = getSubstitutionRules(requiredPart.part.part_num);
    if (rules.length === 0) return null;

    // Pick lowest-penalty rule that is fully satisfiable.
    let best: { rule: SubstitutionRule; penalty: number } | null = null;

    for (const rule of rules) {
        let canSatisfy = true;
        for (const sub of rule.substitutes) {
            const have = availableMap.get(sub.partNum) ?? 0;
            if (have < sub.qty * requiredQty) { canSatisfy = false; break; }
        }
        if (!canSatisfy) continue;
        if (best === null || rule.basePenalty < best.penalty) {
            best = { rule, penalty: rule.basePenalty };
        }
    }
    return best;
}

/**
 * Convert a rigidity penalty (0..1) into the context of the user's
 * fidelity/rigidity preference.  The effective penalty grows as the user
 * cares more about rigidity (low fidelityWeight).
 *
 * @param basePenalty   Intrinsic structural loss of the substitution (0..1).
 * @param fidelityWeight 0 = full rigidity focus, 1 = full fidelity focus.
 */
export function effectivePenalty(basePenalty: number, fidelityWeight: number): number {
    // When fidelityWeight is low (young child / rigidity-focused), structural subs
    // are penalised more heavily in the composite score.
    const rigidityImportance = 1 - fidelityWeight;
    return basePenalty * (0.5 + rigidityImportance * 0.5);
}
