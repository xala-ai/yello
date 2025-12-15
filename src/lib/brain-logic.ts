import { LegoSet, InventoryPart } from '@/types/rebrickable';
import { BrainDatabase, SetDNA, INITIAL_BRAIN } from './brain-data';
import { getShapeKey } from './inventory';

// In a real app, this would be a database or a persistent JSON file on server
// For MVP client-side, we'll just keep it in memory or local storage via Zustand later
let GLOBAL_BRAIN = { ...INITIAL_BRAIN };

export function analyzeSetDNA(set: LegoSet, inventory: InventoryPart[]): SetDNA {
    // 1. Calculate Basic Stats
    let technicParts = 0;
    let basicBricks = 0;
    let gears = 0;
    let totalParts = 0;

    // Build a map for fast pattern matching (Shape -> Qty)
    const shapeMap = new Map<string, number>();

    for (const item of inventory) {
        totalParts += item.quantity;
        const shape = getShapeKey(item);
        shapeMap.set(shape, (shapeMap.get(shape) || 0) + item.quantity);

        const name = item.part.name.toLowerCase();
        if (name.includes('technic') || name.includes('beam') || name.includes('axle')) technicParts += item.quantity;
        if (name.includes('gear') || name.includes('rack')) gears += item.quantity;
        if (name.includes('brick') && !name.includes('technic')) basicBricks += item.quantity;
    }

    const technicRatio = totalParts > 0 ? technicParts / totalParts : 0;
    const gearRatio = totalParts > 0 ? gears / totalParts : 0;

    // 2. Detect Patterns
    const foundPatterns: string[] = [];
    for (const pattern of GLOBAL_BRAIN.patterns) {
        let hasPattern = true;
        for (const req of pattern.required_parts) {
            if ((shapeMap.get(req.part_num) || 0) < req.quantity) {
                hasPattern = false;
                break;
            }
        }
        if (hasPattern) {
            foundPatterns.push(pattern.id);
        }
    }

    // 3. Assign Tags
    const tags: string[] = [];
    if (technicRatio > 0.7) tags.push('pure_technic');
    else if (technicRatio > 0.3) tags.push('hybrid_technic');
    else tags.push('system_brick');

    if (gears > 2) tags.push('mechanical');
    if (foundPatterns.includes('steering-rack-basic')) tags.push('steerable');

    return {
        set_num: set.set_num,
        tags,
        complexity_score: Math.min(100, Math.floor(totalParts / 10)), // Rough complexity
        mechanism_score: Math.min(100, Math.floor(gearRatio * 500)), // Boosted score for gears
        brick_score: Math.min(100, Math.floor((basicBricks / totalParts) * 100)),
        contains_patterns: foundPatterns
    };
}

// Helper to "Learn" a set and save it to the Brain
export function learnSet(set: LegoSet, inventory: InventoryPart[]) {
    if (GLOBAL_BRAIN.set_dna[set.set_num]) return; // Already learned

    const dna = analyzeSetDNA(set, inventory);
    GLOBAL_BRAIN.set_dna[set.set_num] = dna;
    console.log(`Brain learned set ${set.set_num}:`, dna);
}

export function getBrain() {
    return GLOBAL_BRAIN;
}
