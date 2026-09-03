export const BUILD_CATEGORIES = [
  'vehicle',
  'forklift',
  'spacecraft',
  'aircraft',
  'building',
  'castle',
  'tower',
  'bridge',
  'animal',
  'furniture',
  'sculpture',
] as const;

export type BuildCategory = (typeof BUILD_CATEGORIES)[number];
export type BuildScale = 'micro' | 'small' | 'medium' | 'large';
export type Symmetry = 'none' | 'bilateral' | 'rotational' | 'fourfold';
export type ComplexityLevel = 'simple' | 'moderate' | 'detailed';
export type Axis = 'x' | 'y' | 'z';
export type OccupancyCell = readonly [x: number, y: number, z: number];

export interface BuildBrief {
  category: BuildCategory;
  scale: {
    name: BuildScale;
    targetWidth: number;
    targetHeight: number;
    targetDepth: number;
  };
  partBudget: {
    min: number;
    max: number;
  };
  /** Relative extents, normalized so the longest axis is 1. */
  proportions: {
    width: number;
    height: number;
    depth: number;
  };
  symmetry: Symmetry;
  requiredFeatures: string[];
  palette: {
    colors: string[];
    allowTransparent: boolean;
  };
  complexity: {
    level: ComplexityLevel;
    detailBudget: number;
  };
  /** Unsigned 32-bit seed used for deterministic downstream choices. */
  seed: number;
}

export interface CorpusProvenance {
  sourceCollection: string;
  sourcePath: string;
  sourceUrl?: string;
  modelName?: string;
  author: string;
  sourceSha256?: string;
  derivation: string;
}

export interface CorpusLicense {
  id: string;
  declaration: string;
  attributionRequired: boolean;
  url: string;
}

export interface ReferenceCorpusEntry {
  id: string;
  kind: 'licensed-reference' | 'authored-motif';
  title: string;
  semantic: {
    tags: string[];
    features: string[];
    proportions: BuildBrief['proportions'];
  };
  occupancy: {
    gridConvention: string;
    cells: OccupancyCell[];
    cellCount: number;
    dimensions?: {
      width: number;
      height: number;
      depth: number;
    };
    sourcePartPlacementCount?: number;
  };
  provenance: CorpusProvenance;
  license: CorpusLicense;
  fingerprints: {
    occupancySha256: string;
    rotationMirrorInvariantSha256: string;
  };
  nearDuplicateCheck?: {
    method: string;
    rejectionThreshold: number;
    nearestEntryId: string | null;
    nearestSimilarity: number;
    passed: boolean;
  };
}

export interface ReferenceCorpus {
  schemaVersion: number;
  corpusVersion: number;
  generatedBy: string;
  entries: ReferenceCorpusEntry[];
}

export interface RetrievedReference {
  entry: ReferenceCorpusEntry;
  score: number;
  matchedTags: string[];
  matchedFeatures: string[];
  proportionScore: number;
  inventoryCompatibility: number | null;
  provenance: CorpusProvenance;
  license: CorpusLicense;
}

export interface SemanticCell {
  x: number;
  y: number;
  z: number;
  regions: string[];
  features: string[];
  sourceIds: string[];
}

export interface SemanticTarget {
  cells: SemanticCell[];
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  requiredFeatures: string[];
  sourceIds: string[];
}
