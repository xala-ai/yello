import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LegoSet, Moc, InventoryPart, TieredMatchResult, snapAgeToBand, MatchRules, DEFAULT_MATCH_RULES } from '@/types/rebrickable';
import {
    getSetAction,
    getMocsForSetAction,
    getSetInventoryAction,
    findCandidateSetsAction,
    findRebrickableMocCandidatesAction,
    generateAIBuildAction,
} from '@/app/actions';
import { syncGarageUpAction, syncGarageDownAction } from '@/app/actions/auth';
import { aggregateInventory, checkBuildabilityTiered, scoreNewSetOverlap, slimInventoryForAI } from '@/lib/inventory';
import { findCrossMixBuilds } from '@/lib/crossmix';
import { learnSet } from '@/lib/brain-logic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SmartSetMatch extends LegoSet {
    matchResult?: TieredMatchResult;
    /** % of the candidate set's parts that are novel (not in existing collection) */
    noveltyScore?: number;
    /** Where this recommendation came from */
    source?: 'official' | 'rebrickable';
    /** For community MOCs: official set whose parts list we scored against */
    parentSetNum?: string;
    designerName?: string;
}

export type SmartSources = {
    /** Official LEGO sets (with building instructions on lego.com) */
    official: boolean;
    /** Rebrickable community alternate MOCs */
    rebrickable: boolean;
};

export const DEFAULT_SMART_SOURCES: SmartSources = {
    official: true,
    rebrickable: true,
};

export interface AIBuild {
    id: string;
    name: string;
    description: string;
    /** Real LDraw model with 0 STEP directives, ready for LDrawLoader. */
    ldrawText: string;
    steps: Array<{
        stepNum: number;
        partNum: string;
        colorId: number;
        colorName: string;
        x: number; y: number; z: number;
        rotation: number;
        description: string;
        loadBearing?: boolean;
    }>;
    /** Full placed geometry for the instruction viewer */
    placed?: import('@/lib/planner').PlacedBrick[];
    totalParts: number;
    estimatedFidelityScore: number;
    estimatedRigidityScore: number;
    compositeScore?: number;
    warnings?: string[];
    generatedAt: string;
}

export interface CrossMixCombo {
    comboSetNums: string[];
    label: string;
    masterPartCount: number;
    suggestedThemes: number[];
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
    aiMode: boolean;
    aiPrompt: string;

    // Cross-mix of owned sets
    crossMixes: CrossMixCombo[];

    // Fidelity / rigidity profile
    age: number;
    fidelityWeight: number;
    matchRules: MatchRules;
    smartSources: SmartSources;

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

    // Actions – Cross-mix
    findCrossMixes: () => void;

    // Actions – Profile / sync
    setAge: (age: number) => void;
    setFidelityWeight: (w: number) => void;
    setMatchRules: (rules: Partial<MatchRules>) => void;
    setSmartSources: (sources: Partial<SmartSources>) => void;
    syncGarageToCloud: () => Promise<void>;
    loadGarageFromCloud: () => Promise<void>;
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
            crossMixes: [],
            age: 18,
            fidelityWeight: 0.9,
            matchRules: { ...DEFAULT_MATCH_RULES },
            smartSources: { ...DEFAULT_SMART_SOURCES },
            isLoading: false,
            isAILoading: false,
            error: null,

            // ── Profile ─────────────────────────────────────────────────────
            setAge: (age) => {
                const band = snapAgeToBand(age);
                set({ age: band.age, fidelityWeight: band.fidelityWeight });
            },
            setFidelityWeight: (fidelityWeight) => set({ fidelityWeight }),
            setMatchRules: (partial) =>
                set((state) => ({ matchRules: { ...state.matchRules, ...partial } })),
            setSmartSources: (partial) =>
                set((state) => ({ smartSources: { ...state.smartSources, ...partial } })),

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
                set((state) => {
                    const selectedSetIds = state.selectedSetIds.includes(setNum)
                        ? state.selectedSetIds.filter((id) => id !== setNum)
                        : [...state.selectedSetIds, setNum];
                    // Re-prompt if mix state changes
                    if (typeof sessionStorage !== 'undefined') {
                        sessionStorage.removeItem('yellobricks-cross-scale-ack');
                    }
                    return { selectedSetIds };
                }),

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
                    const uniqueMap = new Map<string, Moc>();
                    for (const s of active) {
                        try {
                            const list = await getMocsForSetAction(s.set_num);
                            for (const m of list) uniqueMap.set(m.set_num, m);
                        } catch { /* skip */ }
                        await new Promise((r) => setTimeout(r, 150));
                    }
                    set({ mocs: Array.from(uniqueMap.values()), isLoading: false });
                } catch (err) {
                    set({ isLoading: false, error: err instanceof Error ? err.message : 'Failed to find builds' });
                }
            },

            // ── Smart Mix (official sets + Rebrickable community alts) ───────
            findSmartBuilds: async (searchQuery?: string) => {
                const { sets, setInventories, selectedSetIds, fidelityWeight, matchRules, smartSources } = get();
                const active = sets.filter((s) => selectedSetIds.includes(s.set_num));
                if (active.length === 0) { set({ error: 'Select at least one set.' }); return; }

                const sources = {
                    official: smartSources?.official !== false,
                    rebrickable: smartSources?.rebrickable !== false,
                };
                if (!sources.official && !sources.rebrickable) {
                    set({ error: 'Turn on Official and/or Rebrickable sources.' });
                    return;
                }

                set({ isLoading: true, error: null });
                try {
                    const allInventories: InventoryPart[][] = [];
                    for (const s of active) {
                        const inv = setInventories[s.set_num] ?? await getSetInventoryAction(s.set_num);
                        allInventories.push(inv);
                        if (!setInventories[s.set_num]) {
                            set((state) => ({ setInventories: { ...state.setInventories, [s.set_num]: inv } }));
                        }
                    }
                    const masterBin = aggregateInventory(allInventories);
                    const totalParts = masterBin.reduce((sum, p) => sum + p.quantity, 0);
                    // Prefer candidates you can actually finish — not giant UCS sets
                    const minParts = searchQuery ? 1 : Math.max(10, Math.floor(totalParts * 0.03));
                    const maxParts = Math.max(80, Math.floor(totalParts * 1.8));
                    const themeCounts = new Map<number, number>();
                    active.forEach((s) => themeCounts.set(s.theme_id, (themeCounts.get(s.theme_id) ?? 0) + 1));
                    const topThemes = [...themeCounts.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);

                    type WorkItem = {
                        set: LegoSet;
                        source: 'official' | 'rebrickable';
                        parentSetNum?: string;
                        designerName?: string;
                        inventoryKey: string;
                    };
                    const work: WorkItem[] = [];

                    let officialHits: LegoSet[] = [];
                    if (sources.official || sources.rebrickable) {
                        // Official search seeds both official scoring and MOC parent sets
                        officialHits = await findCandidateSetsAction(topThemes, minParts, maxParts, searchQuery);
                    }

                    if (sources.official) {
                        // Prefer part counts near garage size; evaluate more than before
                        const ranked = [...officialHits].sort((a, b) => {
                            const da = Math.abs(a.num_parts - totalParts * 0.6);
                            const db = Math.abs(b.num_parts - totalParts * 0.6);
                            return da - db;
                        });
                        for (const c of ranked.slice(0, 18)) {
                            if (sets.some((s) => s.set_num === c.set_num)) continue;
                            work.push({ set: c, source: 'official', inventoryKey: c.set_num });
                        }
                    }

                    if (sources.rebrickable) {
                        const mocs = await findRebrickableMocCandidatesAction(
                            active.map((s) => s.set_num),
                            searchQuery,
                            officialHits,
                        );
                        const owned = new Set(active.map((s) => s.set_num));
                        // Prefer MOCs of owned sets, then smaller builds
                        const sortedMocs = [...mocs].sort((a, b) => {
                            const ao = owned.has(a.parent_set_num) ? 0 : 1;
                            const bo = owned.has(b.parent_set_num) ? 0 : 1;
                            if (ao !== bo) return ao - bo;
                            return (a.num_parts ?? 0) - (b.num_parts ?? 0);
                        });
                        for (const m of sortedMocs.slice(0, 24)) {
                            work.push({
                                set: {
                                    set_num: m.set_num,
                                    name: m.name,
                                    year: m.year,
                                    theme_id: m.theme_id,
                                    num_parts: m.num_parts,
                                    set_img_url: m.moc_img_url,
                                    set_url: m.moc_url,
                                    last_modified_dt: '',
                                },
                                source: 'rebrickable',
                                parentSetNum: m.parent_set_num,
                                designerName: m.designer_name,
                                inventoryKey: m.parent_set_num,
                            });
                        }
                    }

                    const invCache: Record<string, InventoryPart[]> = { ...get().setInventories };
                    const results: SmartSetMatch[] = [];

                    for (const item of work) {
                        try {
                            let inv = invCache[item.inventoryKey];
                            if (!inv) {
                                inv = await getSetInventoryAction(item.inventoryKey);
                                invCache[item.inventoryKey] = inv;
                                if (inv.length) {
                                    set((state) => ({
                                        setInventories: { ...state.setInventories, [item.inventoryKey]: inv },
                                    }));
                                }
                            }
                            if (!inv?.length) continue;

                            const matchResult = checkBuildabilityTiered(inv, masterBin, fidelityWeight, matchRules);
                            const noveltyScore = scoreNewSetOverlap(inv, masterBin);

                            // Drop hopeless "buy half a UCS" recommendations unless browsing novelty
                            if (matchResult.percentage < 35 && noveltyScore > 55) continue;

                            results.push({
                                ...item.set,
                                matchResult,
                                noveltyScore,
                                source: item.source,
                                parentSetNum: item.parentSetNum,
                                designerName: item.designerName,
                            });
                        } catch {
                            // skip one bad/rate-limited candidate
                        }
                        await new Promise((r) => setTimeout(r, 160));
                    }

                    results.sort((a, b) => (b.matchResult?.compositeScore ?? 0) - (a.matchResult?.compositeScore ?? 0));
                    if (results.length === 0) {
                        set({
                            smartMatches: [],
                            isLoading: false,
                            error: 'No Smart Mix results yet — try another search, widen sources, or wait if Rebrickable is busy.',
                        });
                    } else {
                        set({ smartMatches: results, isLoading: false, error: null });
                    }
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
                    const allInventories: InventoryPart[][] = [];
                    for (const s of active) {
                        allInventories.push(setInventories[s.set_num] ?? await getSetInventoryAction(s.set_num));
                    }
                    const masterBin = aggregateInventory(allInventories);
                    const slim = slimInventoryForAI(masterBin);

                    const build = await generateAIBuildAction(slim, aiPrompt, fidelityWeight, age);
                    set((state) => ({ aiBuilds: [build, ...state.aiBuilds], isAILoading: false }));
                } catch (err) {
                    set({ isAILoading: false, error: err instanceof Error ? err.message : 'AI build generation failed' });
                }
            },

            findCrossMixes: () => {
                const { sets, setInventories, selectedSetIds, fidelityWeight } = get();
                const active = sets.filter((s) => selectedSetIds.includes(s.set_num));
                if (active.length < 2) {
                    set({ error: 'Select at least two sets for cross-mix.', crossMixes: [] });
                    return;
                }
                const combos = findCrossMixBuilds(
                    active.map((s) => ({
                        set_num: s.set_num,
                        name: s.name,
                        theme_id: s.theme_id,
                        num_parts: s.num_parts,
                    })),
                    setInventories as Record<string, Array<{ part: { part_num: string }; color: { id: number }; quantity: number }>>,
                    fidelityWeight,
                );
                set({ crossMixes: combos, error: null });
            },

            syncGarageToCloud: async () => {
                const { sets, selectedSetIds, age, fidelityWeight } = get();
                await syncGarageUpAction({ sets, selectedSetIds, age, fidelityWeight });
            },

            loadGarageFromCloud: async () => {
                const data = await syncGarageDownAction();
                if (!data) return;
                set({
                    sets: data.sets ?? get().sets,
                    selectedSetIds: data.selectedSetIds ?? get().selectedSetIds,
                    age: data.age ?? get().age,
                    fidelityWeight: data.fidelityWeight ?? get().fidelityWeight,
                });
            },
        }),
        {
            name: 'yellobricks-garage-v2',
            skipHydration: true,
            partialize: (s) => ({
                sets: s.sets,
                selectedSetIds: s.selectedSetIds,
                setInventories: s.setInventories,
                age: s.age,
                fidelityWeight: s.fidelityWeight,
                aiMode: s.aiMode,
                aiPrompt: s.aiPrompt,
                matchRules: s.matchRules,
                smartSources: s.smartSources,
            }),
            onRehydrateStorage: () => (state) => {
                if (state) {
                    state.error = null;
                    state.isLoading = false;
                    state.isAILoading = false;
                    const band = snapAgeToBand(state.age ?? 18);
                    state.age = band.age;
                    if (state.fidelityWeight == null) state.fidelityWeight = band.fidelityWeight;
                    state.matchRules = { ...DEFAULT_MATCH_RULES, ...(state.matchRules || {}) };
                    state.smartSources = { ...DEFAULT_SMART_SOURCES, ...(state.smartSources || {}) };
                }
            },
        }
    )
);
