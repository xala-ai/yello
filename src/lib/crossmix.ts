export interface OwnedSet {
  set_num: string;
  name: string;
  theme_id: number;
  num_parts: number;
}

export interface InventoryPart {
  part: { part_num: string };
  color: { id: number };
  quantity: number;
}

export interface CrossMixResult {
  comboSetNums: string[];
  label: string;
  masterPartCount: number;
  suggestedThemes: number[];
}

function combinations<T>(arr: T[], minK: number, maxK: number): T[][] {
  const results: T[][] = [];
  function helper(start: number, current: T[]) {
    if (current.length >= minK) {
      results.push([...current]);
    }
    if (current.length >= maxK) return;
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      helper(i + 1, current);
      current.pop();
    }
  }
  helper(0, []);
  return results;
}

function aggregateInventory(
  setNums: string[],
  inventories: Record<string, InventoryPart[]>
): Map<string, { partNum: string; colorId: number; totalQty: number }> {
  const agg = new Map<string, { partNum: string; colorId: number; totalQty: number }>();
  for (const sn of setNums) {
    const inv = inventories[sn];
    if (!inv) continue;
    for (const item of inv) {
      const key = `${item.part.part_num}__${item.color.id}`;
      const existing = agg.get(key);
      if (existing) {
        existing.totalQty += item.quantity;
      } else {
        agg.set(key, {
          partNum: item.part.part_num,
          colorId: item.color.id,
          totalQty: item.quantity,
        });
      }
    }
  }
  return agg;
}

function scoreCombo(
  agg: Map<string, { partNum: string; colorId: number; totalQty: number }>,
  fidelityWeight: number
): number {
  const uniqueParts = agg.size;
  let totalParts = 0;
  let bulkParts = 0; // parts with qty >= 4
  const colorDiversity = new Set<number>();

  for (const [, val] of agg) {
    totalParts += val.totalQty;
    if (val.totalQty >= 4) bulkParts += val.totalQty;
    colorDiversity.add(val.colorId);
  }

  const diversityScore = Math.min(1, uniqueParts / 80);
  const bulkScore = totalParts > 0 ? Math.min(1, bulkParts / totalParts) : 0;
  const colorScore = Math.min(1, colorDiversity.size / 15);
  const volumeScore = Math.min(1, totalParts / 500);

  const fw = Math.max(0, Math.min(1, fidelityWeight));
  return (
    fw * (diversityScore * 0.5 + colorScore * 0.5) +
    (1 - fw) * (bulkScore * 0.5 + volumeScore * 0.5)
  );
}

export function findCrossMixBuilds(
  ownedSets: OwnedSet[],
  inventories: Record<string, InventoryPart[]>,
  fidelityWeight: number
): CrossMixResult[] {
  if (ownedSets.length < 2) return [];

  const maxSetsForCombos = ownedSets.slice(0, 10);
  const combos = combinations(maxSetsForCombos, 2, 3);

  const scored: Array<{ combo: OwnedSet[]; score: number; agg: Map<string, { partNum: string; colorId: number; totalQty: number }> }> = [];

  for (const combo of combos) {
    const setNums = combo.map(s => s.set_num);
    const agg = aggregateInventory(setNums, inventories);
    if (agg.size === 0) continue;
    const score = scoreCombo(agg, fidelityWeight);
    scored.push({ combo, score, agg });
  }

  scored.sort((a, b) => b.score - a.score);

  const topResults = scored.slice(0, 20);

  return topResults.map(({ combo, agg }) => {
    const setNums = combo.map(s => s.set_num);
    const names = combo.map(s => s.name);
    let totalParts = 0;
    for (const [, val] of agg) totalParts += val.totalQty;

    const themeIds = [...new Set(combo.map(s => s.theme_id))];

    return {
      comboSetNums: setNums,
      label: names.join(' + '),
      masterPartCount: totalParts,
      suggestedThemes: themeIds,
    };
  });
}
