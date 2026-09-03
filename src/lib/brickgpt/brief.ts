import {
  BUILD_CATEGORIES,
  type BuildBrief,
  type BuildCategory,
  type BuildScale,
  type ComplexityLevel,
  type Symmetry,
} from './types';

const CATEGORY_PATTERNS: ReadonlyArray<readonly [BuildCategory, RegExp]> = [
  ['forklift', /\b(forklift|fork\s*lift)\b/i],
  ['spacecraft', /\b(spacecraft|spaceship|space\s*ship|rocket|starfighter|ufo|satellite)\b/i],
  ['aircraft', /\b(aircraft|airplane|aeroplane|plane|jet|helicopter|glider)\b/i],
  ['castle', /\b(castle|fortress|citadel|keep)\b/i],
  ['tower', /\b(tower|lighthouse|skyscraper|spire)\b/i],
  ['bridge', /\b(bridge|viaduct|overpass)\b/i],
  ['building', /\b(building|house|home|cabin|shop|temple|architecture)\b/i],
  ['vehicle', /\b(vehicle|car|truck|van|bus|tractor|rover|motorcycle)\b/i],
  ['animal', /\b(animal|dog|cat|bird|horse|dragon|dinosaur|fish|insect)\b/i],
  ['furniture', /\b(furniture|chair|table|desk|sofa|couch|bed|shelf)\b/i],
  ['sculpture', /\b(sculpture|statue|abstract|monument|model)\b/i],
];

const FEATURE_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['wheels', /\b(wheel|wheels|tyres?|tires?)\b/i],
  ['axle', /\baxles?\b/i],
  ['forks', /\b(forks?|tines?)\b/i],
  ['mast', /\bmast\b/i],
  ['cab', /\b(cab|cockpit)\b/i],
  ['wings', /\bwings?\b/i],
  ['engines', /\b(engines?|thrusters?|motors?)\b/i],
  ['nose', /\b(nose|beak)\b/i],
  ['tail', /\btails?\b/i],
  ['roof', /\broofs?\b/i],
  ['door', /\bdoors?|entrance\b/i],
  ['windows', /\bwindows?\b/i],
  ['arch', /\barches?|arched\b/i],
  ['turrets', /\bturrets?\b/i],
  ['battlements', /\b(battlements?|crenellations?|parapets?)\b/i],
  ['supports', /\b(supports?|pillars?|piers?)\b/i],
  ['opening', /\b(opening|gateway|tunnel)\b/i],
  ['legs', /\blegs?\b/i],
  ['arms', /\barms?\b/i],
  ['head', /\bheads?\b/i],
  ['eyes', /\beyes?\b/i],
  ['seat', /\bseats?|cushion\b/i],
  ['backrest', /\bbackrests?\b/i],
  ['transparent-canopy', /\b(transparent|trans-clear|canopy|windscreen)\b/i],
  ['sloped-profile', /\b(sloped?|angled|tapered)\b/i],
];

const DEFAULT_FEATURES: Record<BuildCategory, string[]> = {
  vehicle: ['wheels', 'cab'],
  forklift: ['wheels', 'forks', 'mast', 'cab'],
  spacecraft: ['cockpit', 'engines'],
  aircraft: ['wings', 'cockpit', 'tail'],
  building: ['door', 'windows', 'roof'],
  castle: ['battlements', 'turrets', 'entrance'],
  tower: ['tall-profile', 'roof-cap'],
  bridge: ['supported-span', 'supports'],
  animal: ['head', 'body', 'legs'],
  furniture: ['supports', 'usable-surface'],
  sculpture: ['recognizable-silhouette'],
};

const SCALE_DEFAULTS: Record<BuildScale, Omit<BuildBrief['scale'], 'name'> & BuildBrief['partBudget']> = {
  micro: { targetWidth: 6, targetHeight: 5, targetDepth: 6, min: 8, max: 24 },
  small: { targetWidth: 10, targetHeight: 8, targetDepth: 8, min: 20, max: 60 },
  medium: { targetWidth: 16, targetHeight: 14, targetDepth: 12, min: 50, max: 140 },
  large: { targetWidth: 24, targetHeight: 22, targetDepth: 18, min: 120, max: 300 },
};

const DEFAULT_PROPORTIONS: Record<BuildCategory, BuildBrief['proportions']> = {
  vehicle: { width: 1, height: 0.4, depth: 0.55 },
  forklift: { width: 1, height: 0.8, depth: 0.6 },
  spacecraft: { width: 1, height: 0.3, depth: 0.9 },
  aircraft: { width: 1, height: 0.25, depth: 0.8 },
  building: { width: 0.8, height: 1, depth: 0.7 },
  castle: { width: 1, height: 0.8, depth: 0.8 },
  tower: { width: 0.35, height: 1, depth: 0.35 },
  bridge: { width: 1, height: 0.35, depth: 0.3 },
  animal: { width: 0.75, height: 0.7, depth: 1 },
  furniture: { width: 1, height: 0.7, depth: 0.75 },
  sculpture: { width: 0.7, height: 1, depth: 0.7 },
};

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))].sort();
}

function inferScale(text: string): BuildScale {
  if (/\b(micro|tiny|miniature)\b/i.test(text)) return 'micro';
  if (/\b(large|huge|big|massive)\b/i.test(text)) return 'large';
  if (/\b(medium|mid[\s-]?size)\b/i.test(text)) return 'medium';
  return 'small';
}

function inferCategory(text: string): BuildCategory {
  return CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? 'sculpture';
}

function inferSymmetry(text: string, category: BuildCategory): Symmetry {
  if (/\b(asymmetric|asymmetrical)\b/i.test(text)) return 'none';
  if (/\b(fourfold|four-way|radial)\b/i.test(text)) return 'fourfold';
  if (/\b(rotational|round|circular)\b/i.test(text)) return 'rotational';
  if (/\b(symmetrical|symmetric|bilateral|mirrored)\b/i.test(text)) return 'bilateral';
  if (['vehicle', 'forklift', 'spacecraft', 'aircraft', 'animal', 'bridge'].includes(category)) {
    return 'bilateral';
  }
  return category === 'tower' ? 'rotational' : 'none';
}

function inferComplexity(text: string): BuildBrief['complexity'] {
  let level: ComplexityLevel = 'moderate';
  if (/\b(simple|easy|minimal|basic)\b/i.test(text)) level = 'simple';
  if (/\b(detailed|complex|intricate|advanced)\b/i.test(text)) level = 'detailed';
  return { level, detailBudget: level === 'simple' ? 2 : level === 'detailed' ? 8 : 5 };
}

function inferPartBudget(
  text: string,
  defaults: BuildBrief['partBudget'],
): BuildBrief['partBudget'] {
  const range = text.match(/\b(\d{1,4})\s*(?:-|to)\s*(\d{1,4})\s*(?:parts?|pieces?|bricks?)\b/i);
  if (range) {
    const first = Number(range[1]);
    const second = Number(range[2]);
    return { min: Math.min(first, second), max: Math.max(first, second) };
  }
  const maximum = text.match(/\b(?:under|up to|max(?:imum)?(?: of)?)\s*(\d{1,4})\s*(?:parts?|pieces?|bricks?)\b/i);
  if (maximum) return { min: Math.min(defaults.min, Number(maximum[1])), max: Number(maximum[1]) };
  const exact = text.match(/\b(\d{1,4})\s*(?:parts?|pieces?|bricks?)\b/i);
  if (exact) {
    const target = Number(exact[1]);
    return { min: Math.max(0, Math.floor(target * 0.8)), max: Math.ceil(target * 1.2) };
  }
  return defaults;
}

function inferProportions(
  text: string,
  category: BuildCategory,
): BuildBrief['proportions'] {
  const proportions = { ...DEFAULT_PROPORTIONS[category] };
  if (/\b(tall|vertical|slender)\b/i.test(text)) {
    proportions.height = 1;
    proportions.width = Math.min(proportions.width, 0.45);
  }
  if (/\b(wide|broad)\b/i.test(text)) proportions.width = 1;
  if (/\b(long|elongated)\b/i.test(text)) {
    proportions.depth = 1;
    proportions.width = Math.min(proportions.width, 0.65);
  }
  if (/\b(low|flat|squat)\b/i.test(text)) proportions.height = Math.min(proportions.height, 0.3);
  const longest = Math.max(proportions.width, proportions.height, proportions.depth);
  return {
    width: proportions.width / longest,
    height: proportions.height / longest,
    depth: proportions.depth / longest,
  };
}

function inferPalette(text: string): BuildBrief['palette'] {
  const knownColors = [
    'black', 'white', 'gray', 'grey', 'red', 'blue', 'green', 'yellow', 'orange',
    'brown', 'tan', 'pink', 'purple', 'lime', 'silver', 'gold',
  ];
  const colors = knownColors.filter((color) => new RegExp(`\\b${color}\\b`, 'i').test(text));
  return {
    colors: unique(colors.length > 0 ? colors : ['red', 'white', 'black']),
    allowTransparent: /\b(transparent|trans-clear|window|canopy|windscreen)\b/i.test(text),
  };
}

export function createFallbackBuildBrief(prompt = ''): BuildBrief {
  const normalized = prompt.trim().replace(/\s+/g, ' ');
  const category = inferCategory(normalized);
  const scaleName = inferScale(normalized);
  const defaults = SCALE_DEFAULTS[scaleName];
  const explicitFeatures = FEATURE_PATTERNS
    .filter(([, pattern]) => pattern.test(normalized))
    .map(([feature]) => feature);
  const requiredFeatures = unique([...DEFAULT_FEATURES[category], ...explicitFeatures]);
  const partBudget = inferPartBudget(normalized, { min: defaults.min, max: defaults.max });

  return {
    category,
    scale: {
      name: scaleName,
      targetWidth: defaults.targetWidth,
      targetHeight: defaults.targetHeight,
      targetDepth: defaults.targetDepth,
    },
    partBudget,
    proportions: inferProportions(normalized, category),
    symmetry: inferSymmetry(normalized, category),
    requiredFeatures,
    palette: inferPalette(normalized),
    complexity: inferComplexity(normalized),
    seed: hashSeed(normalized.toLowerCase() || 'brickgpt'),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function validateBuildBrief(value: unknown): value is BuildBrief {
  if (!isRecord(value) || !BUILD_CATEGORIES.includes(value.category as BuildCategory)) return false;
  const scale = value.scale;
  const budget = value.partBudget;
  const proportions = value.proportions;
  const palette = value.palette;
  const complexity = value.complexity;
  if (!isRecord(scale) || !['micro', 'small', 'medium', 'large'].includes(String(scale.name))) return false;
  if (!finiteNumber(scale.targetWidth, 1, 256) || !finiteNumber(scale.targetHeight, 1, 256) ||
      !finiteNumber(scale.targetDepth, 1, 256)) return false;
  if (!isRecord(budget) || !finiteNumber(budget.min, 0, 10000) ||
      !finiteNumber(budget.max, budget.min, 10000)) return false;
  if (!isRecord(proportions) || !finiteNumber(proportions.width, 0.01, 1) ||
      !finiteNumber(proportions.height, 0.01, 1) || !finiteNumber(proportions.depth, 0.01, 1)) return false;
  if (!['none', 'bilateral', 'rotational', 'fourfold'].includes(String(value.symmetry))) return false;
  if (!Array.isArray(value.requiredFeatures) || !value.requiredFeatures.every((item) => typeof item === 'string')) return false;
  if (!isRecord(palette) || !Array.isArray(palette.colors) ||
      !palette.colors.every((item) => typeof item === 'string') ||
      typeof palette.allowTransparent !== 'boolean') return false;
  if (!isRecord(complexity) || !['simple', 'moderate', 'detailed'].includes(String(complexity.level)) ||
      !finiteNumber(complexity.detailBudget, 0, 100)) return false;
  return Number.isInteger(value.seed) && finiteNumber(value.seed, 0, 0xffffffff);
}

/**
 * Parses either future OpenRouter JSON or a plain prompt. Invalid, fenced, or
 * partial model output safely falls back to deterministic prompt parsing.
 */
export function parseBuildBrief(input: unknown, fallbackPrompt = ''): BuildBrief {
  if (validateBuildBrief(input)) return input;
  if (isRecord(input)) {
    if (validateBuildBrief(input.brief)) return input.brief;
    if (validateBuildBrief(input.buildBrief)) return input.buildBrief;
  }
  if (typeof input !== 'string') return createFallbackBuildBrief(fallbackPrompt);

  const trimmed = input.trim();
  const jsonText = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (validateBuildBrief(parsed)) return parsed;
    if (isRecord(parsed) && validateBuildBrief(parsed.brief)) return parsed.brief;
    if (isRecord(parsed) && validateBuildBrief(parsed.buildBrief)) return parsed.buildBrief;
  } catch {
    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      try {
        const embedded: unknown = JSON.parse(jsonText.slice(firstBrace, lastBrace + 1));
        if (validateBuildBrief(embedded)) return embedded;
        if (isRecord(embedded) && validateBuildBrief(embedded.brief)) return embedded.brief;
        if (isRecord(embedded) && validateBuildBrief(embedded.buildBrief)) return embedded.buildBrief;
      } catch {
        // Fall through to deterministic prompt parsing.
      }
    }
  }
  return createFallbackBuildBrief(fallbackPrompt || input);
}

export const parseBuildPrompt = createFallbackBuildBrief;
