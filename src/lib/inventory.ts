import { InventoryPart, TieredMatchResult, StructuralSub } from '@/types/rebrickable';
import { tryStructuralSub, effectivePenalty } from '@/lib/structural';

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------
export const getPartKey  = (p: InventoryPart) => `${p.part.part_num}-${p.color.id}`;
export const getShapeKey = (p: InventoryPart) => p.part.part_num;

// ---------------------------------------------------------------------------
// Aggregate multiple set inventories into a master bin
// ---------------------------------------------------------------------------
export function aggregateInventory(partsLists: InventoryPart[][]): InventoryPart[] {
    const map = new Map<string, InventoryPart>();
    for (const list of partsLists) {
        if (!list || !Array.isArray(list)) continue;
        for (const part of list) {
            if (!part?.part || !part?.color) continue;
            const key = getPartKey(part);
            if (map.has(key)) {
                map.get(key)!.quantity += part.quantity;
            } else {
                map.set(key, { ...part });
            }
        }
    }
    return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Legacy flat MatchResult — kept for backward compatibility with existing UI
// ---------------------------------------------------------------------------
export interface MatchResult {
    percentage: number;
    missing: InventoryPart[];
    colorSwaps: InventoryPart[];
    totalPartsNeeded: number;
    totalPartsOwned: number;
}

// ---------------------------------------------------------------------------
// Tiered buildability check (T1 / T2 / T3)
//
// T1 – exact part + exact color
// T2 – exact part, any color (color swap)
// T3 – structural substitution (different part_num covering same footprint)
//
// fidelityWeight: 0 = fully rigidity-focused (young child), 1 = fully fidelity-focused (adult)
// ---------------------------------------------------------------------------
export function checkBuildabilityTiered(
    mocInventory: InventoryPart[],
    userMasterBin: InventoryPart[],
    fidelityWeight = 0.7,
): TieredMatchResult {
    if (!mocInventory?.length) {
        return {
            percentage: 0, fidelityScore: 0, rigidityScore: 100,
            compositeScore: 0,
            tiers: { exactCount: 0, colorSwapCount: 0, structuralSubCount: 0, totalNeeded: 0 },
            missing: [], colorSwaps: [], structuralSubs: [],
            totalPartsNeeded: 0, totalPartsOwned: 0,
        };
    }

    // Build lookup maps from user's master bin
    const exactMap  = new Map<string, number>(); // partKey → qty
    const shapeMap  = new Map<string, number>(); // partNum → total qty (all colors)

    for (const p of userMasterBin) {
        exactMap.set(getPartKey(p), p.quantity);
        shapeMap.set(getShapeKey(p), (shapeMap.get(getShapeKey(p)) ?? 0) + p.quantity);
    }

    // Mutable copy of shape availability for T3 consumption tracking
    const shapeRemaining = new Map(shapeMap);

    const missing: InventoryPart[]      = [];
    const colorSwaps: InventoryPart[]   = [];
    const structuralSubs: StructuralSub[] = [];

    let exactCount      = 0;
    let colorSwapCount  = 0;
    let structuralSubCount = 0;
    let totalNeeded     = 0;
    let totalOwned      = 0;

    // Cumulative rigidity penalty from T3 subs (weighted by qty)
    let totalRigidityPenalty = 0;
    let totalRigidityWeight  = 0;

    for (const mocPart of mocInventory) {
        if (!mocPart?.part || !mocPart?.color) continue;

        const needed   = mocPart.quantity;
        totalNeeded   += needed;

        const exactKey  = getPartKey(mocPart);
        const shapeKey  = getShapeKey(mocPart);

        let remaining = needed;

        // ── T1: exact match (part + color) ─────────────────────────────────
        const exactHave = Math.min(exactMap.get(exactKey) ?? 0, remaining);
        if (exactHave > 0) {
            exactCount   += exactHave;
            totalOwned   += exactHave;
            remaining    -= exactHave;
            // Reduce shape pool so T2/T3 don't double-count
            shapeRemaining.set(shapeKey, (shapeRemaining.get(shapeKey) ?? 0) - exactHave);
        }

        if (remaining === 0) continue;

        // ── T2: shape match (any color) ─────────────────────────────────────
        const shapeHave = Math.min(shapeRemaining.get(shapeKey) ?? 0, remaining);
        if (shapeHave > 0) {
            colorSwapCount += shapeHave;
            totalOwned     += shapeHave;
            remaining      -= shapeHave;
            shapeRemaining.set(shapeKey, (shapeRemaining.get(shapeKey) ?? 0) - shapeHave);
            colorSwaps.push({ ...mocPart, quantity: shapeHave });
        }

        if (remaining === 0) continue;

        // ── T3: structural substitution ────────────────────────────────────
        // Build a partNum→qty map of what the user still has available
        // (simplified: use shapeRemaining for substitute parts)
        const subResult = tryStructuralSub(mocPart, remaining, shapeRemaining);
        if (subResult) {
            const { rule, penalty } = subResult;
            structuralSubCount += remaining;
            totalOwned         += remaining;

            // Mark substitute parts as consumed
            for (const sub of rule.substitutes) {
                const cur = shapeRemaining.get(sub.partNum) ?? 0;
                shapeRemaining.set(sub.partNum, Math.max(0, cur - sub.qty * remaining));
            }

            // Record for display
            structuralSubs.push({
                required: { ...mocPart, quantity: remaining },
                usedParts: rule.substitutes.map(s => ({
                    part: { ...mocPart, part: { ...mocPart.part, part_num: s.partNum }, quantity: s.qty * remaining },
                    qty: s.qty * remaining,
                })),
                rigidityPenalty: penalty,
            });

            // Weighted penalty accumulation
            totalRigidityPenalty += effectivePenalty(penalty, fidelityWeight) * remaining;
            totalRigidityWeight  += remaining;

            remaining = 0;
        }

        if (remaining > 0) {
            missing.push({ ...mocPart, quantity: remaining });
        }
    }

    const percentage = totalNeeded > 0
        ? Math.round((totalOwned / totalNeeded) * 100)
        : 0;

    // ── Fidelity score: penalises color swaps and structural subs ─────────
    // T1 contributes full fidelity, T2 partial, T3 less.
    const fidelityScore = totalNeeded > 0
        ? Math.round((
              exactCount * 1.0 +
              colorSwapCount * 0.7 +
              structuralSubCount * 0.4
          ) / totalNeeded * 100)
        : 0;

    // ── Rigidity score: driven by penalty of structural subs ──────────────
    const avgPenalty = totalRigidityWeight > 0
        ? totalRigidityPenalty / totalRigidityWeight
        : 0;
    const rigidityScore = Math.round((1 - avgPenalty) * 100);

    // ── Composite: blend fidelity & rigidity by user preference ──────────
    const compositeScore = Math.round(
        fidelityScore  * fidelityWeight +
        rigidityScore  * (1 - fidelityWeight)
    );

    return {
        percentage,
        fidelityScore,
        rigidityScore,
        compositeScore,
        tiers: { exactCount, colorSwapCount, structuralSubCount, totalNeeded },
        missing,
        colorSwaps,
        structuralSubs,
        totalPartsNeeded: totalNeeded,
        totalPartsOwned:  totalOwned,
    };
}

// ---------------------------------------------------------------------------
// Legacy wrapper – keeps existing callers working
// ---------------------------------------------------------------------------
export function checkBuildability(
    mocInventory: InventoryPart[],
    userMasterBin: InventoryPart[],
): MatchResult {
    const r = checkBuildabilityTiered(mocInventory, userMasterBin, 0.7);
    return {
        percentage:       r.percentage,
        missing:          r.missing,
        colorSwaps:       r.colorSwaps,
        totalPartsNeeded: r.totalPartsNeeded,
        totalPartsOwned:  r.totalPartsOwned,
    };
}

// ---------------------------------------------------------------------------
// New-set overlap scorer — how much of a candidate SET you don't already own.
// Used for "smart buy" recommendations: higher score = more new unique bricks.
// ---------------------------------------------------------------------------
export function scoreNewSetOverlap(
    candidateInventory: InventoryPart[],
    existingMasterBin: InventoryPart[],
): number {
    const existingKeys = new Set(existingMasterBin.map(getPartKey));
    const existingShapes = new Set(existingMasterBin.map(getShapeKey));

    let totalParts   = 0;
    let novelParts   = 0;  // not in existing collection at all
    let novelShapes  = 0;  // right shape but no color match

    for (const part of candidateInventory) {
        if (!part?.part) continue;
        totalParts += part.quantity;
        if (!existingKeys.has(getPartKey(part))) {
            novelParts += part.quantity;
            if (!existingShapes.has(getShapeKey(part))) {
                novelShapes += part.quantity;
            }
        }
    }

    if (totalParts === 0) return 0;
    // Score: 60% weight on fully novel parts, 40% on new shapes
    return Math.round(((novelParts / totalParts) * 0.6 + (novelShapes / totalParts) * 0.4) * 100);
}
