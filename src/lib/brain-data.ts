export interface SetPattern {
    id: string; // e.g. "technic-chassis-small"
    name: string;
    description: string;
    common_in_themes: number[]; // Theme IDs
    required_parts: {
        part_num: string; // Shape key only (ignore color)
        quantity: number;
    }[];
    // If we had step data, we would store the sequence here
}

export interface BrainDatabase {
    version: number;
    last_updated: string;

    // Known Patterns (The "Knowledge Base")
    patterns: SetPattern[];

    // Learned Set Metadata (Cache)
    // Map of SetNum -> SetDNA
    set_dna: Record<string, SetDNA>;
}

export interface SetDNA {
    set_num: string;
    tags: string[]; // "heavy_technic", "static_brick", "vehicle"
    complexity_score: number; // 0-100
    mechanism_score: number; // 0-100 (How many gears/axles?)
    brick_score: number; // 0-100 (How many standard bricks?)

    // Does it contain known patterns?
    contains_patterns: string[]; // IDs from patterns list
}

// Initial "Seed" Knowledge
export const INITIAL_BRAIN: BrainDatabase = {
    version: 1,
    last_updated: new Date().toISOString(),
    patterns: [
        {
            id: "steering-rack-basic",
            name: "Basic Steering Mechanism",
            description: "Rack and pinion steering setup common in small Technic sets",
            common_in_themes: [1, 421], // Technic
            required_parts: [
                { part_num: "3706", quantity: 1 }, // Technic Axle 6
                { part_num: "2790", quantity: 1 }, // Steering Rack
                { part_num: "3647", quantity: 1 }, // Gear 8 Tooth
            ]
        },
        {
             id: "differential-gear",
             name: "Differential Gearbox",
             description: "Standard differential for rear axles",
             common_in_themes: [1],
             required_parts: [
                 { part_num: "62821", quantity: 1 }, // Differential casing
                 { part_num: "32270", quantity: 3 }, // 12 Tooth Bevel Gear
             ]
        }
    ],
    set_dna: {}
};
