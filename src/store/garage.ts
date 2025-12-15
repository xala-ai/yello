import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LegoSet, Moc, InventoryPart } from '@/types/rebrickable';
import { getSetAction, getMocsForSetAction, getSetInventoryAction, findCandidateSetsAction } from '@/app/actions';
import { aggregateInventory, checkBuildability, MatchResult } from '@/lib/inventory';
import { learnSet } from '@/lib/brain-logic';

interface SmartMatch extends Moc {
    matchResult?: MatchResult;
}

interface SmartSetMatch extends LegoSet {
  matchResult?: MatchResult;
}

interface GarageState {
  sets: LegoSet[];
  selectedSetIds: string[];
  setInventories: Record<string, InventoryPart[]>;
  mocs: Moc[];
  smartMatches: SmartSetMatch[];

  isLoading: boolean;
  error: string | null;

  // Actions
  addSet: (setNum: string) => Promise<void>;
  removeSet: (setNum: string) => void;
  toggleSetSelection: (setNum: string) => void;
  selectAllSets: (selected: boolean) => void;
  clearGarage: () => void;
  findBuilds: () => Promise<void>;
  findSmartBuilds: (searchQuery?: string) => Promise<void>; // Updated signature
}

export const useGarageStore = create<GarageState>()(
  persist(
    (set, get) => ({
      // ... (state init)
      sets: [],
      selectedSetIds: [],
      setInventories: {},
      mocs: [],
      smartMatches: [],
      isLoading: false,
      error: null,

      // ... (existing actions)
      addSet: async (setNum: string) => {
        // Check if already exists
        if (get().sets.find((s) => s.set_num === setNum)) {
            return;
        }

        set({ isLoading: true, error: null });
        try {
          // Fetch Set Info
          const setInfo = await getSetAction(setNum);

          // Fetch Inventory Immediately (to cache it)
          const inventory = await getSetInventoryAction(setNum);

          // "Learn" the set (add to Brain)
          learnSet(setInfo, inventory);

          set((state) => ({
            sets: [...state.sets, setInfo],
            // Auto-select new set?
            selectedSetIds: [...state.selectedSetIds, setNum],
            setInventories: {
                ...state.setInventories,
                [setNum]: inventory
            },
            isLoading: false,
          }));
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to add set'
          });
        }
      },

      removeSet: (setNum: string) => {
        set((state) => {
            const newInventories = { ...state.setInventories };
            delete newInventories[setNum];

            return {
                sets: state.sets.filter((s) => s.set_num !== setNum),
                selectedSetIds: state.selectedSetIds.filter(id => id !== setNum),
                setInventories: newInventories,
                mocs: [],
                smartMatches: []
            };
        });
      },

      toggleSetSelection: (setNum: string) => {
          set((state) => {
              const isSelected = state.selectedSetIds.includes(setNum);
              return {
                  selectedSetIds: isSelected
                    ? state.selectedSetIds.filter(id => id !== setNum)
                    : [...state.selectedSetIds, setNum]
              };
          });
      },

      selectAllSets: (selected: boolean) => {
          set((state) => ({
              selectedSetIds: selected ? state.sets.map(s => s.set_num) : []
          }));
      },

      clearGarage: () => set({ sets: [], selectedSetIds: [], setInventories: {}, mocs: [], smartMatches: [], error: null }),

      findBuilds: async () => {
        const { sets, selectedSetIds } = get();
        if (sets.length === 0) return;

        const activeSets = sets.filter(s => selectedSetIds.includes(s.set_num));

        if (activeSets.length === 0) {
            set({ error: "Please select at least one set." });
            return;
        }

        set({ isLoading: true, error: null });
        try {
            const promises = activeSets.map(s => getMocsForSetAction(s.set_num));
            const results = await Promise.all(promises);

            const allMocs = results.flat();
            const uniqueMocs = Array.from(new Map(allMocs.map(m => [m.set_num, m])).values());

            set({ mocs: uniqueMocs, isLoading: false });
        } catch (err) {
            set({
                isLoading: false,
                error: err instanceof Error ? err.message : 'Failed to find builds'
            });
        }
      },

      findSmartBuilds: async (searchQuery?: string) => {
          const { sets, setInventories, selectedSetIds } = get();
          if (sets.length === 0) return;

          const activeSets = sets.filter(s => selectedSetIds.includes(s.set_num));

          if (activeSets.length === 0) {
             set({ error: "Please select at least one set." });
             return;
          }

          set({ isLoading: true, error: null });

          try {
              // 1. Build Master Bin from Cache
              const allInventories: InventoryPart[][] = [];
              for (const s of activeSets) {
                  if (setInventories[s.set_num]) {
                      allInventories.push(setInventories[s.set_num]);
                  } else {
                      const inv = await getSetInventoryAction(s.set_num);
                      allInventories.push(inv);
                      set(state => ({
                          setInventories: { ...state.setInventories, [s.set_num]: inv }
                      }));
                  }
              }
              const masterBin = aggregateInventory(allInventories);

              // 2. Determine Search Criteria (Use official sets as candidates; MOC inventory is not available with API key)
              const totalParts = masterBin.reduce((sum, part) => sum + part.quantity, 0);
              const minParts = Math.max(10, Math.floor(totalParts * 0.05));
              const maxParts = Math.floor(totalParts * 1.5);

              // Use Semantic Tags + Top Themes
              const themeCounts = new Map<number, number>();
              activeSets.forEach(s => themeCounts.set(s.theme_id, (themeCounts.get(s.theme_id) || 0) + 1));
              const topThemes = Array.from(themeCounts.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(e => e[0]);

              // 3. Find Candidate Official Sets (similar complexity/theme)
              const candidateSets = await findCandidateSetsAction(topThemes, minParts, maxParts, searchQuery);
              const topCandidates = candidateSets.slice(0, 20); // top 10-20 creations as requested

              // 4. Check Buildability against candidate set inventories
              const results: SmartSetMatch[] = [];
              for (const candidate of topCandidates) {
                // Do not recommend sets the user already owns (selected or not)
                if (sets.some((s) => s.set_num === candidate.set_num)) continue;

                const candidateInv = await getSetInventoryAction(candidate.set_num);
                if (!candidateInv || candidateInv.length === 0) continue;

                const match = checkBuildability(candidateInv, masterBin);
                results.push({ ...candidate, matchResult: match });
              }

              results.sort((a, b) => (b.matchResult?.percentage || 0) - (a.matchResult?.percentage || 0));

              set({ smartMatches: results, isLoading: false });

          } catch (err) {
             set({
                isLoading: false,
                error: err instanceof Error ? err.message : 'Failed to find smart builds'
            });
          }
      }
    }),
    {
      name: 'brickmixer-garage',
      skipHydration: true, // We will handle hydration manually to prevent SSR mismatch
    }
  )
);
