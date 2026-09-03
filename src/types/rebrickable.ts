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

// ---------------------------------------------------------------------------
// Match rules (kid-friendly names in the UI)
// ---------------------------------------------------------------------------

/** How flexible matching is allowed to be. Exact colour+shape is always tried first. */
export interface MatchRules {
    /** Same brick shape, any colour (e.g. red 2×4 counts as blue 2×4). */
    ignoreColor: boolean;
    /** Allow brick swaps like one 2×6 from two 2×3s (and Duplo↔System bricks). */
    allowSubstitution: boolean;
}

export const DEFAULT_MATCH_RULES: MatchRules = {
    ignoreColor: true,
    allowSubstitution: true,
};

/** @deprecated Internal codes — prefer MatchRules + plain UI labels. */
export type MatchTier = 'T1' | 'T2' | 'T3';

export interface TierBreakdown {
    /** Same brick + same colour. */
    exactCount: number;
    /** Same brick shape, different colour. */
    colorSwapCount: number;
    /** Different bricks that still cover the same space (e.g. 2×6 ← two 2×3s). */
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
 * Builder profile age bands (UI labels) and representative ages for scoring.
 * Fidelity rises with age: young kids → rigidity, teens/adults → looks.
 */
export const AGE_BANDS = [
    { id: '4',     label: '4',     age: 4,  fidelityWeight: 0.1  },
    { id: '5-6',   label: '5–6',   age: 6,  fidelityWeight: 0.2  },
    { id: '7-8',   label: '7–8',   age: 8,  fidelityWeight: 0.35 },
    { id: '9-12',  label: '9–12',  age: 10, fidelityWeight: 0.5  },
    { id: '12-16', label: '12–16', age: 14, fidelityWeight: 0.7  },
    { id: '16+',   label: '16+',   age: 18, fidelityWeight: 0.9  },
] as const;

export type AgeBandId = (typeof AGE_BANDS)[number]['id'];

export interface RigidityProfile {
    age: number;
    /** 0 = full rigidity priority, 1 = full fidelity priority */
    fidelityWeight: number;
}

/** Snap a stored/legacy numeric age onto the nearest band. */
export function snapAgeToBand(age: number): (typeof AGE_BANDS)[number] {
    if (!Number.isFinite(age) || age <= 4) return AGE_BANDS[0];
    if (age <= 6) return AGE_BANDS[1];
    if (age <= 8) return AGE_BANDS[2];
    if (age <= 11) return AGE_BANDS[3];
    if (age < 16) return AGE_BANDS[4];
    return AGE_BANDS[5];
}

export function ageToFidelityWeight(age: number): number {
    return snapAgeToBand(age).fidelityWeight;
}

export function ageBandIndex(age: number): number {
    const band = snapAgeToBand(age);
    return AGE_BANDS.findIndex((b) => b.id === band.id);
}

/** Age 9+ can see “Fidelity / Rigidity”; younger builders get plain words. */
export function usesAdvancedScoreLabels(age: number): boolean {
    return snapAgeToBand(age).age >= 9;
}
