import { emitLDraw } from './brickgpt/ldraw-emit';
import {
  createAssemblyInstructions,
  type AssemblyDependency,
  type AssemblyStep,
} from './brickgpt/instructions';
import { createFallbackBuildBrief } from './brickgpt/brief';
import { loadReferenceCorpus } from './brickgpt/retrieval';
import {
  sequenceInventoryBuildCandidates,
  type BrickPlacement,
  type SequenceResult,
  type SequencerInventoryItem,
} from './brickgpt/sequencer';
import type { BuildBrief, CorpusLicense, CorpusProvenance } from './brickgpt/types';
import { getBrickSpec } from './brickgpt/vocabulary';

export interface PlacedBrick {
  placementId?: number;
  partNum: string;
  colorId: number;
  colorName: string;
  x: number;
  y: number;
  z: number;
  rot: number;
  step: number;
  description: string;
  loadBearing: boolean;
  width?: number;
  depth?: number;
  height?: number;
  dependsOn?: number[];
}

export interface BuildQualityDiagnostics {
  /** Percentage of semantic target cells occupied; null when no target exists. */
  targetApproximation: number | null;
  /** Percentage of occupied volume that lies inside the target. */
  silhouetteApproximation: number | null;
  /** Aggregate semantic approximation from locally measurable signals. */
  semanticApproximation: number | null;
  /** Required semantic features represented by compatible placed part roles. */
  featureApproximation: number | null;
  stability: number;
  prefixStability: number;
  components: number;
  inventoryUse: number;
}

export interface BuildSourceAttribution {
  id: string;
  provenance: CorpusProvenance;
  license: CorpusLicense;
}

export interface BuildPlan {
  id: string;
  name: string;
  description: string;
  steps: PlacedBrick[];
  ldrawText: string;
  fidelityScore: number;
  rigidityScore: number;
  compositeScore: number;
  warnings: string[];
  diagnostics: BuildQualityDiagnostics;
  sources: BuildSourceAttribution[];
  assemblySteps: AssemblyStep[];
  dependencyDag: AssemblyDependency[];
  seed: number;
  candidateRank: number;
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicId(seed: number, rank: number, placements: readonly BrickPlacement[]): string {
  const signature = placements
    .map((placement) =>
      `${placement.partNum}:${placement.colorId}:${placement.x}:${placement.y}:${placement.z}:${placement.rotation}`,
    )
    .join('|');
  const first = hashSeed(`${seed}:${rank}:${signature}`).toString(36).padStart(7, '0');
  const second = hashSeed(`${signature}:${rank}:${seed}`).toString(36).padStart(7, '0');
  return `${first}${second}`.slice(0, 12);
}

function buildName(kind: string, intent: string): string {
  if (kind === 'house') return 'YelloBricks House';
  if (kind === 'vehicle') return 'YelloBricks Vehicle';
  if (kind === 'spacecraft') return 'YelloBricks Spacecraft';
  if (kind === 'tower') return 'YelloBricks Tower';
  if (kind === 'bridge') return 'YelloBricks Bridge';
  return intent.trim() ? `YelloBricks: ${intent.trim().slice(0, 40)}` : 'YelloBricks Sculpture';
}

function percent(value: number | null): number | null {
  return value === null ? null : Math.round(Math.max(0, Math.min(1, value)) * 100);
}

function sourceAttributions(sourceIds: readonly string[]): BuildSourceAttribution[] {
  const wanted = new Set(sourceIds);
  return loadReferenceCorpus().entries
    .filter((entry) => wanted.has(entry.id))
    .map((entry) => ({
      id: entry.id,
      provenance: entry.provenance,
      license: entry.license,
    }));
}

function emptySequence(
  inventorySummary: readonly SequencerInventoryItem[],
  brief: BuildBrief,
): SequenceResult {
  const category = brief.category;
  const intentKind =
    category === 'vehicle' || category === 'forklift' ? 'vehicle' :
    category === 'spacecraft' || category === 'aircraft' ? 'spacecraft' :
    category === 'tower' ? 'tower' :
    category === 'bridge' ? 'bridge' :
    category === 'building' || category === 'castle' ? 'house' :
    'sculpture';
  const usableInventoryCount = inventorySummary.reduce(
    (sum, item) => sum + (getBrickSpec(item.partNum) ? Math.max(0, item.qty) : 0),
    0,
  );
  return {
    placements: [],
    rejected: {},
    usableInventoryCount,
    unusedInventoryCount: usableInventoryCount,
    intentKind,
    score: 0,
    componentCount: 0,
    stability: {
      supportRatio: 0,
      centerOfMass: { x: 0, y: 0 },
      supportFootprint: null,
      centerOfMassSupported: false,
      centerOfMassMargin: 0,
      seamStaggering: 0,
      cantileverPenalty: 1,
      weakConnectionPenalty: 1,
      prefixStability: 0,
      score: 0,
    },
    semanticSourceIds: [],
    diagnostics: {
      targetCoverage: null,
      silhouettePrecision: null,
      featureCoverage: null,
      symmetry: null,
      colorFidelity: null,
      semanticApproximation: null,
      inventoryUse: 0,
    },
  };
}

function buildPlan(
  sequence: SequenceResult,
  intent: string,
  fidelityWeight: number,
  rank: number,
  brief: BuildBrief,
): BuildPlan {
  const instructions = createAssemblyInstructions(sequence.placements);
  const name = buildName(sequence.intentKind, intent);
  const warnings: string[] = [];

  if (sequence.usableInventoryCount === 0) {
    warnings.push(
      'No supported BrickGPT parts were found in the supplied inventory.',
    );
  }
  if (instructions.placements.length === 0) {
    warnings.push('No connected, collision-free structure could be generated from the supported bricks.');
  } else if (instructions.placements.length < 5) {
    warnings.push('Only a small connected structure could be made from the supported bricks.');
  }
  if (sequence.componentCount > 1) {
    warnings.push(`The finalized model has ${sequence.componentCount} disconnected components.`);
  }
  if (sequence.stability.prefixStability < 0.5 && instructions.placements.length > 0) {
    warnings.push('Some intermediate assembly prefixes have limited support.');
  }
  if (sequence.diagnostics.targetCoverage !== null && sequence.diagnostics.targetCoverage < 0.5) {
    warnings.push('Inventory constraints produced a coarse approximation of the requested target.');
  }
  warnings.push(...instructions.warnings);

  const dependencyByPlacement = new Map(
    instructions.dependencies.map((dependency) => [dependency.placementId, dependency.dependsOn]),
  );
  const steps: PlacedBrick[] = instructions.placements.map((brick) => ({
    placementId: brick.placementId,
    partNum: brick.partNum,
    colorId: brick.colorId,
    colorName: brick.colorName,
    x: brick.x,
    y: brick.y,
    z: brick.z,
    rot: brick.rotation,
    step: brick.step,
    description: brick.description,
    loadBearing: brick.loadBearing,
    width: brick.width,
    depth: brick.depth,
    height: brick.height,
    dependsOn: dependencyByPlacement.get(brick.placementId) ?? [],
  }));

  const fidelityScore = percent(sequence.diagnostics.semanticApproximation) ?? 0;
  const rigidityScore = percent(sequence.stability.score) ?? 0;
  const weight = Math.max(0, Math.min(1, fidelityWeight));
  const compositeScore = Math.round(fidelityScore * weight + rigidityScore * (1 - weight));
  const ldrawText = emitLDraw(instructions.placements, name);
  const candidateSeed = hashSeed(`${brief.seed}:${rank}`);

  return {
    id: deterministicId(candidateSeed, rank, instructions.placements),
    name,
    description:
      `A ${sequence.intentKind} generated as ${instructions.placements.length} real LDraw bricks ` +
      `across ${instructions.steps.length} connected assembly steps from your garage inventory.`,
    steps,
    ldrawText,
    fidelityScore,
    rigidityScore,
    compositeScore,
    warnings: [...new Set(warnings)],
    diagnostics: {
      targetApproximation: percent(sequence.diagnostics.targetCoverage),
      silhouetteApproximation: percent(sequence.diagnostics.silhouettePrecision),
      semanticApproximation: percent(sequence.diagnostics.semanticApproximation),
      featureApproximation: percent(sequence.diagnostics.featureCoverage),
      stability: percent(sequence.stability.score) ?? 0,
      prefixStability: percent(sequence.stability.prefixStability) ?? 0,
      components: sequence.componentCount,
      inventoryUse: percent(sequence.diagnostics.inventoryUse) ?? 0,
    },
    sources: sourceAttributions(sequence.semanticSourceIds),
    assemblySteps: instructions.steps,
    dependencyDag: instructions.dependencies,
    seed: candidateSeed,
    candidateRank: rank,
  };
}

/**
 * Plans as many as three deterministic, inventory-constrained local candidates.
 * This orchestration does not make a network or OpenRouter call.
 */
export async function planBuildCandidatesFromInventory(
  inventorySummary: SequencerInventoryItem[],
  intent: string,
  fidelityWeight: number,
  age: number,
  briefOverride?: BuildBrief,
): Promise<BuildPlan[]> {
  const brief = briefOverride ?? createFallbackBuildBrief(intent);
  const sequences = sequenceInventoryBuildCandidates(
    inventorySummary,
    intent,
    age,
    fidelityWeight,
    brief,
  );
  const available = sequences.length > 0
    ? sequences.slice(0, 3)
    : [emptySequence(inventorySummary, brief)];
  return available.map((sequence, index) =>
    buildPlan(sequence, intent, fidelityWeight, index + 1, brief),
  );
}

/** Preserves the original API by returning the best locally planned candidate. */
export async function planBuildFromInventory(
  inventorySummary: SequencerInventoryItem[],
  intent: string,
  fidelityWeight: number,
  age: number,
  briefOverride?: BuildBrief,
): Promise<BuildPlan> {
  const candidates = await planBuildCandidatesFromInventory(
    inventorySummary,
    intent,
    fidelityWeight,
    age,
    briefOverride,
  );
  return candidates[0];
}
