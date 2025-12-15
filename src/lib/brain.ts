import { LegoSet, InventoryPart } from '@/types/rebrickable';

// The Brain stores "learned" meta-data about sets and parts
export interface SetDNA {
    set_num: string;
    dominant_color: number; // ID of most common color
    technic_ratio: number; // 0-1 (How much is Technic?)
    tags: string[]; // "Vehicle", "Building", "Starship" inferred from inventory
}

export interface BrainState {
    setMemory: Record<string, SetDNA>; // Cache of analyzed sets
}

// Heuristics to guess tags from inventory
export function analyzeSet(set: LegoSet, inventory: InventoryPart[]): SetDNA {
    let technicCount = 0;
    let totalParts = 0;
    const colorCounts = new Map<number, number>();

    // Simple keywords in name
    const tags: string[] = [];
    const name = set.name.toLowerCase();
    if (name.includes('car') || name.includes('racer') || name.includes('ferrari') || name.includes('jeep')) tags.push('vehicle', 'car');
    if (name.includes('plane') || name.includes('jet') || name.includes('flyer')) tags.push('vehicle', 'aircraft');
    if (name.includes('loader') || name.includes('excavator') || name.includes('truck')) tags.push('vehicle', 'construction');
    if (name.includes('star') || name.includes('space')) tags.push('space');

    for (const item of inventory) {
        totalParts += item.quantity;
        colorCounts.set(item.color.id, (colorCounts.get(item.color.id) || 0) + item.quantity);

        // Basic heuristic for Technic parts (Category ID check would be better, but name works for now)
        if (item.part.name.toLowerCase().includes('technic') ||
            item.part.name.toLowerCase().includes('beam') ||
            item.part.name.toLowerCase().includes('axle') ||
            item.part.name.toLowerCase().includes('gear')) {
            technicCount += item.quantity;
        }

        // Heuristic: Wheels
        if (item.part.name.toLowerCase().includes('wheel') || item.part.name.toLowerCase().includes('tire')) {
             if (!tags.includes('vehicle')) tags.push('vehicle');
        }
    }

    // Dominant Color
    let maxColorId = -1;
    let maxColorCount = 0;
    for (const [id, count] of colorCounts.entries()) {
        if (count > maxColorCount) {
            maxColorCount = count;
            maxColorId = id;
        }
    }

    const technicRatio = totalParts > 0 ? technicCount / totalParts : 0;

    if (technicRatio > 0.3) tags.push('technic_heavy');

    return {
        set_num: set.set_num,
        dominant_color: maxColorId,
        technic_ratio: technicRatio,
        tags: Array.from(new Set(tags)) // Dedupe
    };
}

// Semantic Mapper: "Forklift" -> ["construction", "technic", "lift"]
export function mapQueryToTags(query: string): string[] {
    const q = query.toLowerCase();
    const tags: string[] = [];

    if (q.includes('car') || q.includes('race') || q.includes('drive')) tags.push('car', 'vehicle');
    if (q.includes('fly') || q.includes('plane') || q.includes('wing')) tags.push('aircraft', 'vehicle');
    if (q.includes('build') || q.includes('house') || q.includes('city')) tags.push('building', 'city');
    if (q.includes('forklift') || q.includes('crane') || q.includes('dig')) tags.push('construction', 'technic_heavy');

    // Default: just use the query itself as a tag
    tags.push(q);

    return tags;
}
