export interface LegoSet {
  set_num: string;
  name: string;
  year: number;
  theme_id: number;
  num_parts: number;
  set_img_url: string;
  set_url: string;
  last_modified_dt: string;
}

export interface Part {
  part_num: string;
  name: string;
  part_cat_id: number;
  part_url: string;
  part_img_url: string;
  external_ids: Record<string, string[]>;
  print_of: string | null;
}

export interface Color {
  id: number;
  name: string;
  rgb: string;
  is_trans: boolean;
}

export interface InventoryPart {
  id: number;
  inv_part_id: number;
  part: Part;
  color: Color;
  set_num: string;
  quantity: number;
  is_spare: boolean;
  element_id: string;
  num_sets: number;
}

export interface Moc {
  set_num: string;
  name: string;
  year: number;
  theme_id: number;
  num_parts: number;
  moc_img_url: string;
  moc_url: string;
  designer_name: string;
  designer_url: string;
  // New fields for filtering
  num_likes: number;
  num_comments: number;
  is_alternative: boolean;
  is_premium: boolean; // Check Rebrickable API docs: /lego/mocs/ returns this? Yes usually.
}

export interface BuildCheckResult {
    match_pct: number;
    missing_parts: InventoryPart[];
}

// ---------------------------------------------------------------------------
// Tiered matching + structural scoring
// ---------------------------------------------------------------------------

/** T1 = exact part + exact color. T2 = exact part, any color. T3 = structural sub (e.g. 2×3+2×3 → 2×6). */
export type MatchTier = 'T1' | 'T2' | 'T3';

export interface TierBreakdown {
    /** Parts matched exactly (same part_num, same color). */
    exactCount: number;
    /** Parts matched by shape only (same part_num, different color). */
    colorSwapCount: number;
    /** Parts matched via structural substitution (different part_num, equivalent geometry). */
    structuralSubCount: number;
    totalNeeded: number;
}

/**
 * Composite match result with per-tier breakdown and structural scores.
 *
 * fidelityScore  – 0..100: how closely the finished model will look right
 *                  (weights exact > colorSwap > structuralSub)
 * rigidityScore  – 0..100: how structurally sound the build will be
 *                  (structural subs that affect load-bearing joints reduce this)
 * compositeScore – weighted blend driven by the user's fidelityWeight slider
 */
export interface TieredMatchResult {
    percentage: number;            // overall coverage %
    fidelityScore: number;         // 0-100
    rigidityScore: number;         // 0-100
    compositeScore: number;        // 0-100 (what we sort by)
    tiers: TierBreakdown;
    missing: InventoryPart[];
    colorSwaps: InventoryPart[];
    structuralSubs: StructuralSub[];
    totalPartsNeeded: number;
    totalPartsOwned: number;
}

/** A structural substitution: how we are replacing a required part. */
export interface StructuralSub {
    required: InventoryPart;       // what the MOC/set wants
    usedParts: Array<{ part: InventoryPart; qty: number }>;  // what we provide instead
    rigidityPenalty: number;       // 0..1, how much structural integrity is lost
}

/**
 * Rigidity profile driven by user age.
 * < 5  → pure rigidity focus (young children need stable builds)
 * 5-12 → balanced
 * 13+  → pure fidelity focus (teens/adults want accurate looks)
 */
export interface RigidityProfile {
    age: number;
    /** 0 = full rigidity priority, 1 = full fidelity priority */
    fidelityWeight: number;
}

export function ageToFidelityWeight(age: number): number {
    if (age < 5)  return 0.1;
    if (age < 8)  return 0.25;
    if (age < 12) return 0.5;
    if (age < 16) return 0.7;
    return 0.9;
}
