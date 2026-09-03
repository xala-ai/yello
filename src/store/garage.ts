import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LegoSet, Moc, InventoryPart, TieredMatchResult, ageToFidelityWeight } from '@/types/rebrickable';
import {
    getSetAction,
    getMocsForSetAction,
    getSetInventoryAction,
    findCandidateSetsAction,
    generateAIBuildAction,
} from '@/app/actions';
import { aggregateInventory, checkBuildabilityTiered, scoreNewSetOverlap } from '@/lib/inventory';
import { learnSet } from '@/lib/brain-logic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SmartSetMatch extends LegoSet {
    matchResult?: TieredMatchResult;
    /** % of the candidate set's parts that are novel (not in existing collection) */
    noveltyScore?: number;
}

export interface AIBuild {
    id: string;
    name: string;
    description: string;
    steps: Array<{
        stepNum: number;
        partNum: string;
        colorId: number;
        colorName: string;
        x: number; y: number; z: number;
        rotation: number; // degrees around Y axis
        description: string;
    }>;
    totalParts: number;
    estimatedFidelityScore: number;
    estimatedRigidityScore: number;
    generatedAt: string;
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface GarageState {
    // Garage
    sets: LegoSet[];
    selectedSetIds: string[];
    setInventories: Record<string, InventoryPart[]>;
    mocs: Moc[];
    smartMatches: SmartSetMatch[];

    // AI Builds
    aiBuilds: AIBuild[];
    aiMode: boolean;           // true = AI generation mode; false = Rebrickable mode
    aiPrompt: string;          // user's natural-language build description

    // Fidelity / rigidity profile
    age: number;               // user-supplied age (drives auto fidelityWeight)
    fidelityWeight: number;    // 0..1 – can be overridden manually

    // Loading / error
    isLoading: boolean;
    isAILoading: boolean;
    error: string | null;

    // Actions – Garage
    addSet: (setNum: string) => Promise<void>;
    removeSet: (setNum: string) => void;
    toggleSetSelection: (setNum: string) => void;
    selectAllSets: (selected: boolean) => void;
    clearGarage: () => void;
    importSetsFromCSV: (setNums: string[]) => Promise<void>;

    // Actions – Mix Engine
    findBuilds: () => Promise<void>;
    findSmartBuilds: (searchQuery?: string) => Promise<void>;

    // Actions – AI Mode
    setAIMode: (on: boolean) => void;
    setAIPrompt: (prompt: string) => void;
    generateAIBuilds: () => Promise<void>;

    // Actions – Profile
    setAge: (age: number) => void;
    setFidelityWeight: (w: number) => void;
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useGarageStore = create<GarageState>()(
    persist(
        (set, get) => ({
            // ── Initial state ───────────────────────────────────────────────
            sets: [],
            selectedSetIds: [],
            setInventories: {},
            mocs: [],
            smartMatches: [],
            aiBuilds: [],
            aiMode: false,
            aiPrompt: '',
            age: 18,
            fidelityWeight: 0.9,   // default adult / high-fidelity
            isLoading: false,
            isAILoading: false,
            error: null,

            // ── Profile ─────────────────────────────────────────────────────
            setAge: (age) => set({ age, fidelityWeight: ageToFidelityWeight(age) }),
            setFidelityWeight: (fidelityWeight) => set({ fidelityWeight }),

            // ── AI Mode ─────────────────────────────────────────────────────
            setAIMode: (aiMode) => set({ aiMode }),
            setAIPrompt: (aiPrompt) => set({ aiPrompt }),

            // ── Garage CRUD ──────────────────────────────────────────────────
            addSet: async (setNum) => {
                if (get().sets.find((s) => s.set_num === setNum)) return;
                set({ isLoading: true, error: null });
                try {
                    const [setInfo, inventory] = await Promise.all([
                        getSetAction(setNum),
                        getSetInventoryAction(setNum),
                    ]);
                    learnSet(setInfo, inventory);
                    set((state) => ({
                        sets: [...state.sets, setInfo],
                        selectedSetIds: [...state.selectedSetIds, setNum],
                        setInventories: { ...state.setInventories, [setNum]: inventory },
                        isLoading: false,
                    }));
                } catch (err) {
                    set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to add set' });
                }
            },

            removeSet: (setNum) =>
                set((state) => {
                    const inv = { ...state.setInventories };
                    delete inv[setNum];
                    return {
                        sets: state.sets.filter((s) => s.set_num !== setNum),
                        selectedSetIds: state.selectedSetIds.filter((id) => id !== setNum),
                        setInventories: inv,
                        mocs: [],
                        smartMatches: [],
                    };
                }),

            toggleSetSelection: (setNum) =>
                set((state) => ({
                    selectedSetIds: state.selectedSetIds.includes(setNum)
                        ? state.selectedSetIds.filter((id) => id !== setNum)
                        : [...state.selectedSetIds, setNum],
                })),

            selectAllSets: (selected) =>
                set((state) => ({ selectedSetIds: selected ? state.sets.map((s) => s.set_num) : [] })),

            clearGarage: () =>
                set({ sets: [], selectedSetIds: [], setInventories: {}, mocs: [], smartMatches: [], error: null }),

            importSetsFromCSV: async (setNums) => {
                set({ isLoading: true, error: null });
                for (const num of setNums) {
                    if (!get().sets.find((s) => s.set_num === num)) {
                        await get().addSet(num);
                    }
                }
                set({ isLoading: false });
            },

            // ── Standard alternates (Rebrickable MOC alternates) ─────────────
            findBuilds: async () => {
                const { sets, selectedSetIds } = get();
                const active = sets.filter((s) => selectedSetIds.includes(s.set_num));
                if (active.length === 0) { set({ error: 'Select at least one set.' }); return; }

                set({ isLoading: true, error: null });
                try {
                    const results = await Promise.all(active.map((s) => getMocsForSetAction(s.set_num)));
                    const unique = Array.from(new Map(results.flat().map((m) => [m.set_num, m])).values());
                    set({ mocs: unique, isLoading: false });
                } catch (err) {
                    set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to find builds' });
                }
            },

            // ── Smart Mix (T1/T2/T3 tiered matching) ────────────────────────
            findSmartBuilds: async (searchQuery?: string) => {
                const { sets, setInventories, selectedSetIds, fidelityWeight } = get();
                const active = sets.filter((s) => selectedSetIds.includes(s.set_num));
                if (active.length === 0) { set({ error: 'Select at least one set.' }); return; }

                set({ isLoading: true, error: null });
                try {
                    // 1. Build master bin
                    const allInventories: InventoryPart[][] = [];
                    for (const s of active) {
                        const inv = setInventories[s.set_num] ?? await getSetInventoryAction(s.set_num);
                        allInventories.push(inv);
                        if (!setInventories[s.set_num]) {
                            set((state) => ({ setInventories: { ...state.setInventories, [s.set_num]: inv } }));
                        }
                    }
                    const masterBin = aggregateInventory(allInventories);

                    // 2. Candidate discovery
                    const totalParts = masterBin.reduce((sum, p) => sum + p.quantity, 0);
                    const minParts   = Math.max(10, Math.floor(totalParts * 0.05));
                    const maxParts   = Math.floor(totalParts * 1.5);
                    const themeCounts = new Map<number, number>();
                    active.forEach((s) => themeCounts.set(s.theme_id, (themeCounts.get(s.theme_id) ?? 0) + 1));
                    const topThemes = [...themeCounts.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);

                    const candidates = await findCandidateSetsAction(topThemes, minParts, maxParts, searchQuery);
                    const top = candidates.slice(0, 20);

                    // 3. Tiered buildability + novelty scoring
                    const results: SmartSetMatch[] = [];
                    for (const candidate of top) {
                        if (sets.some((s) => s.set_num === candidate.set_num)) continue;
                        const inv = await getSetInventoryAction(candidate.set_num);
                        if (!inv?.length) continue;

                        const matchResult  = checkBuildabilityTiered(inv, masterBin, fidelityWeight);
                        const noveltyScore = scoreNewSetOverlap(inv, masterBin);
                        results.push({ ...candidate, matchResult, noveltyScore });
                    }

                    results.sort((a, b) => (b.matchResult?.compositeScore ?? 0) - (a.matchResult?.compositeScore ?? 0));
                    set({ smartMatches: results, isLoading: false });
                } catch (err) {
                    set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to find smart builds' });
                }
            },

            // ── AI Build Generation ──────────────────────────────────────────
            generateAIBuilds: async () => {
                const { sets, setInventories, selectedSetIds, fidelityWeight, age, aiPrompt } = get();
                const active = sets.filter((s) => selectedSetIds.includes(s.set_num));
                if (active.length === 0) { set({ error: 'Select at least one set.' }); return; }
                if (!aiPrompt.trim()) { set({ error: 'Describe what you want to build.' }); return; }

                set({ isAILoading: true, error: null });
                try {
                    // Build master bin
                    const allInventories: InventoryPart[][] = [];
                    for (const s of active) {
                        allInventories.push(setInventories[s.set_num] ?? await getSetInventoryAction(s.set_num));
                    }
                    const masterBin = aggregateInventory(allInventories);

                    const build = await generateAIBuildAction(masterBin, aiPrompt, fidelityWeight, age);
                    set((state) => ({ aiBuilds: [build, ...state.aiBuilds], isAILoading: false }));
                } catch (err) {
                    set({ isAILoading: false, error: err instanceof Error ? err.message : 'AI build generation failed' });
                }
            },
        }),
        {
            name: 'yellobricks-garage-v2',
            skipHydration: true,
        }
    )
);
