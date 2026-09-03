import generatedCorpus from './data/reference-corpus.generated.json';
import type {
  BuildBrief,
  OccupancyCell,
  ReferenceCorpus,
  ReferenceCorpusEntry,
  RetrievedReference,
} from './types';
import { getBrickSpec, type PartRole } from './vocabulary';

export interface RetrievalInventoryItem {
  partNum: string;
  qty: number;
}

export interface RetrievalOptions {
  limit?: number;
  inventory?: RetrievalInventoryItem[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isCell(value: unknown): value is OccupancyCell {
  return Array.isArray(value) && value.length === 3 &&
    value.every((coordinate) => Number.isInteger(coordinate) && coordinate >= 0);
}

function parseEntry(value: unknown): ReferenceCorpusEntry | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string' ||
      !['licensed-reference', 'authored-motif'].includes(String(value.kind)) ||
      !isRecord(value.semantic) || !isStringArray(value.semantic.tags) ||
      !isStringArray(value.semantic.features) || !isRecord(value.semantic.proportions) ||
      !isRecord(value.occupancy) || !Array.isArray(value.occupancy.cells) ||
      !value.occupancy.cells.every(isCell) || !isRecord(value.provenance) ||
      !isRecord(value.license) || !isRecord(value.fingerprints)) {
    return null;
  }

  const proportions = value.semantic.proportions;
  if (![proportions.width, proportions.height, proportions.depth].every(
    (item) => typeof item === 'number' && Number.isFinite(item) && item > 0,
  )) return null;
  if (typeof value.occupancy.gridConvention !== 'string' ||
      value.occupancy.cellCount !== value.occupancy.cells.length ||
      typeof value.provenance.sourceCollection !== 'string' ||
      typeof value.provenance.sourcePath !== 'string' ||
      typeof value.provenance.author !== 'string' ||
      typeof value.provenance.derivation !== 'string' ||
      typeof value.license.id !== 'string' ||
      typeof value.license.declaration !== 'string' ||
      typeof value.license.attributionRequired !== 'boolean' ||
      typeof value.license.url !== 'string' ||
      typeof value.fingerprints.occupancySha256 !== 'string' ||
      typeof value.fingerprints.rotationMirrorInvariantSha256 !== 'string') {
    return null;
  }
  return value as unknown as ReferenceCorpusEntry;
}

/** Validates unknown JSON before exposing it as a typed reference corpus. */
export function parseReferenceCorpus(value: unknown): ReferenceCorpus {
  if (!isRecord(value) || !Number.isInteger(value.schemaVersion) ||
      !Number.isInteger(value.corpusVersion) || typeof value.generatedBy !== 'string' ||
      !Array.isArray(value.entries)) {
    throw new Error('Invalid BrickGPT reference corpus header');
  }
  const entries = value.entries.map(parseEntry);
  if (entries.some((entry) => entry === null)) {
    throw new Error('Invalid BrickGPT reference corpus entry');
  }
  return {
    schemaVersion: value.schemaVersion as number,
    corpusVersion: value.corpusVersion as number,
    generatedBy: value.generatedBy,
    entries: entries as ReferenceCorpusEntry[],
  };
}

let cachedCorpus: ReferenceCorpus | undefined;

export function loadReferenceCorpus(): ReferenceCorpus {
  cachedCorpus ??= parseReferenceCorpus(generatedCorpus);
  return cachedCorpus;
}

const CATEGORY_TAGS: Record<BuildBrief['category'], string[]> = {
  vehicle: ['vehicle', 'car', 'truck', 'rover', 'ground'],
  forklift: ['forklift', 'vehicle', 'utility', 'chassis'],
  spacecraft: ['spacecraft', 'space', 'science-fiction', 'aircraft'],
  aircraft: ['aircraft', 'wing', 'fighter'],
  building: ['architecture', 'shelter', 'house'],
  castle: ['castle', 'architecture', 'tower', 'gateway'],
  tower: ['tower', 'architecture', 'lighthouse'],
  bridge: ['bridge', 'architecture', 'arch', 'gateway'],
  animal: ['animal', 'organic', 'creature'],
  furniture: ['furniture', 'interior'],
  sculpture: ['sculpture', 'abstract', 'monument'],
};

function intersection(left: string[], right: string[]): string[] {
  const wanted = new Set(left.map((value) => value.toLowerCase()));
  return [...new Set(right.map((value) => value.toLowerCase()).filter((value) => wanted.has(value)))].sort();
}

function scoreProportions(
  desired: BuildBrief['proportions'],
  actual: BuildBrief['proportions'],
): number {
  const distance = (
    Math.abs(desired.width - actual.width) +
    Math.abs(desired.height - actual.height) +
    Math.abs(desired.depth - actual.depth)
  ) / 3;
  return Math.max(0, 1 - distance);
}

function inventoryScore(
  entry: ReferenceCorpusEntry,
  inventory: RetrievalInventoryItem[] | undefined,
): number | null {
  if (!inventory) return null;
  const available = inventory
    .filter((item) => item.qty > 0)
    .map((item) => getBrickSpec(item.partNum))
    .filter((spec) => spec !== undefined);
  if (available.length === 0) return 0;

  const requested = new Set([...entry.semantic.tags, ...entry.semantic.features]);
  const roleChecks: Array<readonly [RegExp, PartRole[]]> = [
    [/wheel|vehicle|chassis/, ['wheel', 'axle']],
    [/wing|slope|roof/, ['slope', 'plate']],
    [/window|canopy|cockpit/, ['transparent']],
    [/arch|connector|supported-span/, ['connector', 'technic']],
  ];
  const relevant = roleChecks.filter(([pattern]) => [...requested].some((term) => pattern.test(term)));
  if (relevant.length === 0) return 1;
  const matches = relevant.filter(([, roles]) =>
    available.some((spec) => roles.some((role) => spec.roles.includes(role))),
  ).length;
  return matches / relevant.length;
}

/** Deterministic local semantic retrieval. Ties are resolved by corpus id. */
export function retrieveReferences(
  brief: BuildBrief,
  options: RetrievalOptions = {},
  corpus = loadReferenceCorpus(),
): RetrievedReference[] {
  const wantedTags = CATEGORY_TAGS[brief.category];
  const limit = Math.max(0, Math.floor(options.limit ?? 4));

  return corpus.entries
    .map((entry): RetrievedReference => {
      const matchedTags = intersection(wantedTags, entry.semantic.tags);
      const matchedFeatures = intersection(brief.requiredFeatures, entry.semantic.features);
      const proportionScore = scoreProportions(brief.proportions, entry.semantic.proportions);
      const compatibility = inventoryScore(entry, options.inventory);
      const symmetryMatch = entry.semantic.features.includes(`${brief.symmetry}-symmetry`) ? 1 : 0;
      const score = matchedTags.length * 4 + matchedFeatures.length * 3 +
        proportionScore * 2 + symmetryMatch + (compatibility ?? 0);
      return {
        entry,
        score,
        matchedTags,
        matchedFeatures,
        proportionScore,
        inventoryCompatibility: compatibility,
        provenance: entry.provenance,
        license: entry.license,
      };
    })
    .sort((left, right) => right.score - left.score || left.entry.id.localeCompare(right.entry.id))
    .slice(0, limit);
}

export const retrieveLocalReferences = retrieveReferences;
