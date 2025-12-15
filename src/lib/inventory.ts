import { InventoryPart } from '@/types/rebrickable';

// Helper to create unique key for part + color
export const getPartKey = (part: InventoryPart) => `${part.part.part_num}-${part.color.id}`;
// Helper for shape-only key (ignoring color)
export const getShapeKey = (part: InventoryPart) => part.part.part_num;

export function aggregateInventory(partsLists: InventoryPart[][]): InventoryPart[] {
    const map = new Map<string, InventoryPart>();

    for (const list of partsLists) {
        if (!list || !Array.isArray(list)) continue; // Safety check for failed fetches

        for (const part of list) {
            // Safety check for malformed parts
            if (!part || !part.part || !part.color) continue;

            const key = getPartKey(part);

            if (map.has(key)) {
                const existing = map.get(key)!;
                // Clone logic: Rebrickable API might return different object refs
                existing.quantity += part.quantity;
            } else {
                // Clone to avoid mutation issues
                map.set(key, { ...part });
            }
        }
    }

    return Array.from(map.values());
}

export interface MatchResult {
    percentage: number;
    missing: InventoryPart[];
    colorSwaps: InventoryPart[]; // Parts where we have the shape but wrong color
    totalPartsNeeded: number;
    totalPartsOwned: number;
}

export function checkBuildability(mocInventory: InventoryPart[], userMasterBin: InventoryPart[]): MatchResult {
    const userMap = new Map<string, number>();
    const userShapeMap = new Map<string, number>(); // Map<PartNum, TotalQuantity>

    // Index user parts for O(1) lookup
    for (const part of userMasterBin) {
        userMap.set(getPartKey(part), part.quantity);

        const shapeKey = getShapeKey(part);
        userShapeMap.set(shapeKey, (userShapeMap.get(shapeKey) || 0) + part.quantity);
    }

    const missing: InventoryPart[] = [];
    const colorSwaps: InventoryPart[] = [];
    let totalPartsNeeded = 0;
    let totalPartsOwned = 0; // Exact matches + Color Swaps count as "Owned" for % calculation in loose mode?
    // Let's keep strict owned count for percentage, but maybe a "loose percentage"

    // Safety check: mocInventory can be null/undefined if fetch failed
    if (!mocInventory || !Array.isArray(mocInventory)) {
        return { percentage: 0, missing: [], colorSwaps: [], totalPartsNeeded: 0, totalPartsOwned: 0 };
    }

    for (const mocPart of mocInventory) {
        if (!mocPart || !mocPart.part || !mocPart.color) continue;

        const key = getPartKey(mocPart);
        const shapeKey = getShapeKey(mocPart);

        const neededQty = mocPart.quantity;
        let ownedQty = userMap.get(key) || 0; // Exact match

        totalPartsNeeded += neededQty;

        if (ownedQty >= neededQty) {
            totalPartsOwned += neededQty;
        } else {
            // We are missing exact parts. Check for color swaps.
            const remainingNeeded = neededQty - ownedQty;
            totalPartsOwned += ownedQty; // Add the exact ones we have

            // Check if we have enough of the SHAPE in OTHER colors?
            const totalShapeOwned = userShapeMap.get(shapeKey) || 0;

            // Calculate effective swap availability:
            // We need to subtract the amount of this shape already used for exact matches?
            // This is complex. For MVP, we just check raw totals.
            // If (TotalShapesOwned > TotalShapesNeededForThisPart), then we likely have spares.

            // Simplified logic:
            if (totalShapeOwned >= neededQty) {
                colorSwaps.push({
                    ...mocPart,
                    quantity: remainingNeeded
                });
                totalPartsOwned += remainingNeeded;
            } else {
                 // Truly missing
                 missing.push({
                    ...mocPart,
                    quantity: remainingNeeded
                 });

                 // If we have SOME shapes but not enough
                 if (totalShapeOwned > ownedQty) {
                     const availableSwap = totalShapeOwned - ownedQty;
                     // We can swap some
                     colorSwaps.push({
                         ...mocPart,
                         quantity: availableSwap
                     });
                     totalPartsOwned += availableSwap;
                 }
            }
        }
    }

    const percentage = totalPartsNeeded > 0
        ? Math.round((totalPartsOwned / totalPartsNeeded) * 100)
        : 0;

    return {
        percentage,
        missing,
        colorSwaps,
        totalPartsNeeded,
        totalPartsOwned
    };
}
