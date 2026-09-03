import { createFallbackBuildBrief } from './brief';
import { OccupancyGrid, type GridBrick } from './grid';
import { composeSemanticTarget } from './motifs';
import { retrieveReferences } from './retrieval';
import { measureStability, type StabilityMetrics } from './stability';
import type { BuildBrief, SemanticCell } from './types';
import {
  BRICK_SPECS,
  brickArea,
  getBrickSpec,
  orientedSize,
  type BrickSpec,
  type PartRotation,
  type PartRole,
} from './vocabulary';

export interface SequencerInventoryItem {
  partNum: string;
  name: string;
  colorId: number;
  colorName: string;
  qty: number;
}

export interface BrickPlacement {
  placementId: number;
  partNum: string;
  colorId: number;
  colorName: string;
  x: number;
  y: number;
  /** Plate-height units. */
  z: number;
  width: number;
  depth: number;
  height: number;
  rotation: PartRotation;
  step: number;
  description: string;
  supportStuds: number;
  loadBearing: boolean;
  roles: readonly PartRole[];
}

export interface SequenceResult {
  placements: BrickPlacement[];
  rejected: Record<string, number>;
  usableInventoryCount: number;
  unusedInventoryCount: number;
  intentKind: IntentKind;
  score: number;
  componentCount: number;
  stability: StabilityMetrics;
  semanticSourceIds: string[];
  diagnostics: SequenceQualityDiagnostics;
}

export interface SequenceQualityDiagnostics {
  targetCoverage: number | null;
  silhouettePrecision: number | null;
  featureCoverage: number | null;
  symmetry: number | null;
  colorFidelity: number | null;
  semanticApproximation: number | null;
  inventoryUse: number;
}

type IntentKind = 'house' | 'tower' | 'vehicle' | 'spacecraft' | 'bridge' | 'sculpture';

interface StockItem extends SequencerInventoryItem {
  key: string;
  spec: BrickSpec;
}

interface TargetVoxel {
  x: number;
  y: number;
  z: number;
  features: string[];
  regions: string[];
}

interface SearchState {
  grid: OccupancyGrid;
  placements: BrickPlacement[];
  remaining: number[];
  covered: Set<string>;
  matchedFeatures: Set<string>;
  offTarget: number;
  colorMatches: number;
  score: number;
  stability: StabilityMetrics;
}

interface Candidate {
  stockIndex: number;
  rotation: 0 | 90;
  brick: Required<Pick<GridBrick, 'x' | 'y' | 'z' | 'width' | 'depth' | 'height'>> & GridBrick;
  targetOverlap: TargetVoxel[];
  roleMatches: string[];
}

const EMPTY_STABILITY = measureStability(new OccupancyGrid(1, 1, 1));

function intentKind(brief: BuildBrief): IntentKind {
  if (brief.category === 'vehicle' || brief.category === 'forklift') return 'vehicle';
  if (brief.category === 'spacecraft' || brief.category === 'aircraft') return 'spacecraft';
  if (brief.category === 'tower') return 'tower';
  if (brief.category === 'bridge') return 'bridge';
  if (brief.category === 'building' || brief.category === 'castle') return 'house';
  return 'sculpture';
}

function key(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function normalizeColor(value: string): string {
  return value.trim().toLowerCase().replace('grey', 'gray').replace(/^bright /, '');
}

function targetVoxels(cells: readonly SemanticCell[]): TargetVoxel[] {
  const voxels: TargetVoxel[] = [];
  for (const cell of cells) {
    // Corpus convention is x=width, y=height, z=depth. Expand each semantic
    // height cell to one brick (three plates) without changing its footprint.
    for (let plate = 0; plate < 3; plate++) {
      voxels.push({
        x: cell.x,
        y: cell.z,
        z: cell.y * 3 + plate,
        features: cell.features,
        regions: cell.regions,
      });
    }
  }
  return voxels;
}

function rolesForFeature(feature: string): PartRole[] {
  if (/wheel/.test(feature)) return ['wheel'];
  if (/axle/.test(feature)) return ['axle', 'technic'];
  if (/window|canopy|cockpit/.test(feature)) return ['transparent'];
  if (/roof|slope|nose|tail|wing/.test(feature)) return ['slope', 'plate'];
  if (/eye|detail|battlement|turret|engine/.test(feature)) return ['detail', 'tile', 'slope'];
  if (/support|mast|body|chassis|wall|span|fork|leg/.test(feature)) {
    return ['structure', 'brick', 'plate', 'technic'];
  }
  return ['structure', 'brick', 'plate', 'slope', 'detail'];
}

function featureRoleMatches(spec: BrickSpec, voxels: readonly TargetVoxel[]): string[] {
  const features = new Set(voxels.flatMap((voxel) => voxel.features));
  return [...features].filter((feature) =>
    rolesForFeature(feature).some((role) => spec.roles.includes(role)),
  );
}

function gridBrick(
  stock: StockItem,
  x: number,
  y: number,
  z: number,
  rotation: 0 | 90,
): Candidate['brick'] {
  const size = orientedSize(stock.spec, rotation);
  const simplifiedRunningGear = stock.spec.roles.includes('wheel') ||
    stock.spec.roles.includes('axle');
  return {
    x,
    y,
    z,
    width: size.width,
    depth: size.depth,
    height: stock.spec.occupiedHeight,
    topConnection: simplifiedRunningGear
      ? { kind: 'none', count: 0 }
      : stock.spec.connections.top,
    bottomConnection: simplifiedRunningGear
      ? { kind: 'anti-stud', count: Math.max(1, size.width * size.depth) }
      : stock.spec.connections.bottom,
  };
}

function occupiedTargetVoxels(
  brick: Candidate['brick'],
  targetByKey: ReadonlyMap<string, TargetVoxel>,
): TargetVoxel[] {
  const overlap: TargetVoxel[] = [];
  for (let z = brick.z; z < brick.z + brick.height; z++) {
    for (let y = brick.y; y < brick.y + brick.depth; y++) {
      for (let x = brick.x; x < brick.x + brick.width; x++) {
        const voxel = targetByKey.get(key(x, y, z));
        if (voxel) overlap.push(voxel);
      }
    }
  }
  return overlap;
}

function candidatePlacements(
  state: SearchState,
  stock: readonly StockItem[],
  target: readonly TargetVoxel[],
  targetByKey: ReadonlyMap<string, TargetVoxel>,
  rejected: Record<string, number>,
  brief: BuildBrief,
): Candidate[] {
  const targetFrontier = target
    .filter((voxel) =>
      state.grid.placementIdAt(voxel.x, voxel.y, voxel.z) === 0 &&
      (state.placements.length === 0
        ? voxel.z === 0
        : voxel.z > 0 && state.grid.placementIdAt(voxel.x, voxel.y, voxel.z - 1) !== 0),
    );
  const supportFrontier: TargetVoxel[] = state.grid.getPlacements().flatMap((placement) => {
    const z = placement.z + placement.height;
    const cells: TargetVoxel[] = [];
    for (let y = placement.y; y < placement.y + placement.depth; y++) {
      for (let x = placement.x; x < placement.x + placement.width; x++) {
        if (state.grid.placementIdAt(x, y, z) === 0) {
          cells.push({ x, y, z, features: [], regions: [] });
        }
      }
    }
    return cells;
  });
  const frontier = [...targetFrontier, ...supportFrontier]
    .sort((a, b) =>
      b.features.length - a.features.length || a.z - b.z || a.y - b.y || a.x - b.x,
    )
    .slice(0, 6);
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  const availableStock = stock
    .map((item, index) => ({ item, index }))
    .filter(({ index }) => state.remaining[index] > 0);
  const required = new Set(brief.requiredFeatures);

  for (const voxel of frontier) {
    const frontierStart = candidates.length;
    const stockOrder = [...availableStock]
      .sort((left, right) => {
        const leftMatches = featureRoleMatches(left.item.spec, [voxel]);
        const rightMatches = featureRoleMatches(right.item.spec, [voxel]);
        const leftRequired = leftMatches.filter((feature) =>
          required.has(feature) && !state.matchedFeatures.has(feature),
        ).length;
        const rightRequired = rightMatches.filter((feature) =>
          required.has(feature) && !state.matchedFeatures.has(feature),
        ).length;
        return rightRequired - leftRequired ||
          brickArea(right.item.spec) - brickArea(left.item.spec) ||
          left.item.key.localeCompare(right.item.key);
      })
      .slice(0, 20);
    stockLoop: for (const { item, index: stockIndex } of stockOrder) {
      const rotations: Array<0 | 90> = item.spec.legalRotations.includes(90) ? [0, 90] : [0];
      for (const rotation of rotations) {
        const size = orientedSize(item.spec, rotation);
        const zStarts = [...new Set([voxel.z, voxel.z - item.spec.occupiedHeight + 1])]
          .filter((z) => z >= 0);
        for (const z of zStarts) {
          for (let offsetY = 0; offsetY < size.depth; offsetY++) {
            for (let offsetX = 0; offsetX < size.width; offsetX++) {
              const brick = gridBrick(item, voxel.x - offsetX, voxel.y - offsetY, z, rotation);
              const signature = `${stockIndex}:${rotation}:${brick.x}:${brick.y}:${brick.z}`;
              if (seen.has(signature)) continue;
              seen.add(signature);
              if (state.placements.length === 0 && item.spec.connections.top.kind !== 'stud') {
                rejected.non_extendable_base = (rejected.non_extendable_base ?? 0) + 1;
                continue;
              }
              const check = state.grid.check(brick);
              if (!check.ok) {
                rejected[check.reason] = (rejected[check.reason] ?? 0) + 1;
                continue;
              }
              if (state.placements.length > 0 && check.supportIds.length === 0) {
                rejected.disconnected = (rejected.disconnected ?? 0) + 1;
                continue;
              }
              const overlap = occupiedTargetVoxels(brick, targetByKey)
                .filter((cell) => !state.covered.has(key(cell.x, cell.y, cell.z)));
              candidates.push({
                stockIndex,
                rotation,
                brick,
                targetOverlap: overlap,
                roleMatches: featureRoleMatches(item.spec, overlap),
              });
              if (candidates.length >= 12) return candidates;
              if (candidates.length - frontierStart >= 2) break stockLoop;
            }
          }
        }
      }
    }
  }
  return candidates;
}

function symmetryScore(state: SearchState, target: readonly TargetVoxel[], brief: BuildBrief): number {
  if (brief.symmetry === 'none' || target.length === 0) return 1;
  const maxX = Math.max(...target.map((cell) => cell.x));
  let matched = 0;
  for (const covered of state.covered) {
    const [x, y, z] = covered.split(',').map(Number);
    if (state.covered.has(key(maxX - x, y, z))) matched++;
  }
  return state.covered.size === 0 ? 0 : matched / state.covered.size;
}

function scoreState(
  state: SearchState,
  target: readonly TargetVoxel[],
  brief: BuildBrief,
  fidelityWeight: number,
): number {
  const targetCoverage = state.covered.size / Math.max(1, target.length);
  const occupied = state.covered.size + state.offTarget;
  const silhouette = state.covered.size / Math.max(1, occupied);
  const featureCoverage = brief.requiredFeatures.filter((feature) =>
    state.matchedFeatures.has(feature),
  ).length / Math.max(1, brief.requiredFeatures.length);
  const symmetry = symmetryScore(state, target, brief);
  const colorFidelity = state.colorMatches / Math.max(1, state.placements.length);
  const inventoryTotal = state.placements.length +
    state.remaining.reduce((sum, quantity) => sum + quantity, 0);
  const inventoryUse = state.placements.length / Math.max(
    1,
    Math.min(inventoryTotal, brief.partBudget.max),
  );
  const components = state.grid.connectedComponents().length;
  const connectionPenalty = Math.max(0, components - 1) / Math.max(1, state.placements.length);
  const semantic = targetCoverage * 0.48 + silhouette * 0.18 +
    featureCoverage * 0.16 + symmetry * 0.07 + colorFidelity * 0.07 + inventoryUse * 0.04;
  const structural = state.stability.score * 0.72 +
    state.stability.seamStaggering * 0.18 - connectionPenalty * 0.1;
  const semanticWeight = 0.25 + fidelityWeight * 0.75;
  const structuralWeight = 0.25 + (1 - fidelityWeight) * 0.75;
  return semantic * semanticWeight + structural * structuralWeight +
    targetCoverage * 0.35 + state.placements.length * 0.0001;
}

function addCandidate(
  state: SearchState,
  candidate: Candidate,
  stock: readonly StockItem[],
  target: readonly TargetVoxel[],
  brief: BuildBrief,
  fidelityWeight: number,
  kind: IntentKind,
): SearchState {
  const item = stock[candidate.stockIndex];
  const grid = state.grid.clone();
  const check = grid.check(candidate.brick);
  if (!check.ok) return state;
  const placementId = grid.place(candidate.brick);
  const covered = new Set(state.covered);
  for (const voxel of candidate.targetOverlap) covered.add(key(voxel.x, voxel.y, voxel.z));
  const matchedFeatures = new Set(state.matchedFeatures);
  for (const feature of candidate.roleMatches) matchedFeatures.add(feature);
  const volume = candidate.brick.width * candidate.brick.depth * candidate.brick.height;
  const remaining = [...state.remaining];
  remaining[candidate.stockIndex]--;
  const palette = new Set(brief.palette.colors.map(normalizeColor));
  const colorMatch = palette.has(normalizeColor(item.colorName)) ||
    (brief.palette.allowTransparent && /trans|clear/i.test(item.colorName));
  const placement: BrickPlacement = {
    placementId,
    partNum: item.partNum,
    colorId: item.colorId,
    colorName: item.colorName,
    x: candidate.brick.x,
    y: candidate.brick.y,
    z: candidate.brick.z,
    width: candidate.brick.width,
    depth: candidate.brick.depth,
    height: candidate.brick.height,
    rotation: candidate.rotation,
    step: candidate.brick.z + 1,
    description: describePlacement(kind, candidate.brick.z, item),
    supportStuds: check.supportStuds,
    loadBearing: candidate.brick.z <= 3 || check.supportStuds >= 2,
    roles: item.spec.roles,
  };
  const next: SearchState = {
    grid,
    placements: [...state.placements, placement],
    remaining,
    covered,
    matchedFeatures,
    offTarget: state.offTarget + volume - candidate.targetOverlap.length,
    colorMatches: state.colorMatches + Number(colorMatch),
    score: 0,
    stability: measureStability(grid),
  };
  next.score = scoreState(next, target, brief, fidelityWeight);
  return next;
}

function describePlacement(kind: IntentKind, z: number, item: StockItem): string {
  if (z === 0) return `Build the base with ${item.name}`;
  if (kind === 'vehicle') return `Shape the chassis and body with ${item.name}`;
  if (kind === 'spacecraft') return `Shape the fuselage and profile with ${item.name}`;
  if (kind === 'bridge') return `Join the supported span with ${item.name}`;
  if (kind === 'house') return `Raise the walls and roof with ${item.name}`;
  return `Shape the next section with ${item.name}`;
}

function placementSignature(placement: BrickPlacement): string {
  return `${placement.partNum}:${placement.colorId}:${placement.x}:${placement.y}:${placement.z}:${placement.rotation}`;
}

function difference(left: SearchState, right: SearchState): number {
  const a = new Set(left.placements.map(placementSignature));
  const b = new Set(right.placements.map(placementSignature));
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection++;
  return 1 - intersection / Math.max(1, a.size + b.size - intersection);
}

function toResult(
  state: SearchState,
  stock: readonly StockItem[],
  usableInventoryCount: number,
  rejected: Record<string, number>,
  kind: IntentKind,
  sourceIds: string[],
  target: readonly TargetVoxel[],
  brief: BuildBrief,
): SequenceResult {
  const targetCoverage = target.length > 0
    ? state.covered.size / target.length
    : null;
  const occupied = state.covered.size + state.offTarget;
  const silhouettePrecision = occupied > 0
    ? state.covered.size / occupied
    : null;
  const featureCoverage = brief.requiredFeatures.length > 0
    ? brief.requiredFeatures.filter((feature) => state.matchedFeatures.has(feature)).length /
      brief.requiredFeatures.length
    : null;
  const symmetry = target.length > 0 ? symmetryScore(state, target, brief) : null;
  const colorFidelity = state.placements.length > 0
    ? state.colorMatches / state.placements.length
    : null;
  const inventoryUse = state.placements.length / Math.max(1, usableInventoryCount);
  const semanticTerms = [
    targetCoverage,
    silhouettePrecision,
    featureCoverage,
    symmetry,
    colorFidelity,
  ].filter((value): value is number => value !== null);
  return {
    placements: state.placements,
    rejected: { ...rejected },
    usableInventoryCount,
    unusedInventoryCount: state.remaining.reduce((sum, qty) => sum + qty, 0),
    intentKind: kind,
    score: state.score,
    componentCount: state.grid.connectedComponents().length,
    stability: state.stability,
    semanticSourceIds: sourceIds,
    diagnostics: {
      targetCoverage,
      silhouettePrecision,
      featureCoverage,
      symmetry,
      colorFidelity,
      semanticApproximation: semanticTerms.length > 0
        ? semanticTerms.reduce((sum, value) => sum + value, 0) / semanticTerms.length
        : null,
      inventoryUse,
    },
  };
}

/**
 * Deterministic bounded beam search over real inventory. The fourth argument is
 * optional so the original three-argument API remains source compatible.
 */
export function sequenceInventoryBuildCandidates(
  inventory: SequencerInventoryItem[],
  intent: string,
  age: number,
  fidelityWeight = 0.7,
  briefOverride?: BuildBrief,
): SequenceResult[] {
  const brief = briefOverride ?? createFallbackBuildBrief(intent);
  const weight = Math.max(0, Math.min(1, fidelityWeight));
  const stock: StockItem[] = inventory
    .map((item) => {
      const spec = getBrickSpec(item.partNum);
      return spec ? { ...item, spec, key: `${item.partNum}__${item.colorId}` } : null;
    })
    .filter((item): item is StockItem => item !== null && item.qty > 0)
    .sort((a, b) => a.key.localeCompare(b.key));
  const usableInventoryCount = stock.reduce((sum, item) => sum + Math.max(0, item.qty), 0);
  const references = retrieveReferences(brief, { limit: 3, inventory });
  const semanticTarget = composeSemanticTarget(brief, references);
  const target = targetVoxels(semanticTarget.cells);
  const targetByKey = new Map(target.map((voxel) => [key(voxel.x, voxel.y, voxel.z), voxel]));
  const maxX = Math.max(0, ...target.map((voxel) => voxel.x));
  const maxY = Math.max(0, ...target.map((voxel) => voxel.y));
  const maxZ = Math.max(0, ...target.map((voxel) => voxel.z));
  const grid = new OccupancyGrid(
    Math.max(4, Math.min(28, maxX + 2)),
    Math.max(4, Math.min(24, maxY + 2)),
    Math.max(6, Math.min(72, maxZ + 7)),
  );
  const initial: SearchState = {
    grid,
    placements: [],
    remaining: stock.map((item) => Math.max(0, item.qty)),
    covered: new Set(),
    matchedFeatures: new Set(),
    offTarget: 0,
    colorMatches: 0,
    score: 0,
    stability: EMPTY_STABILITY,
  };
  const rejected: Record<string, number> = {};
  const beamWidth = usableInventoryCount <= 40 ? 10 : 8;
  // Deterministic operation budget: avoids load-dependent wall-clock cutoffs
  // while keeping a typical serverless run near two seconds.
  const expansionCap = 2000;
  const ageCap = age < 6 ? 20 : age < 10 ? 40 : 80;
  const partCap = Math.min(usableInventoryCount, brief.partBudget.max, ageCap);
  let expansions = 0;
  let beam = [initial];
  const completed: SearchState[] = [];

  for (let iteration = 0; iteration < partCap && beam.length > 0; iteration++) {
    const children: SearchState[] = [];
    for (const state of beam) {
      const candidates = candidatePlacements(state, stock, target, targetByKey, rejected, brief);
      if (candidates.length === 0) completed.push(state);
      for (const candidate of candidates) {
        if (expansions >= expansionCap) break;
        const child = addCandidate(state, candidate, stock, target, brief, weight, intentKind(brief));
        if (child !== state) children.push(child);
        expansions++;
      }
      if (expansions >= expansionCap) break;
    }
    completed.push(...beam);
    if (children.length === 0 || expansions >= expansionCap) break;
    children.sort((a, b) => b.score - a.score ||
      b.covered.size - a.covered.size ||
      a.placements.map(placementSignature).join('|').localeCompare(
        b.placements.map(placementSignature).join('|'),
      ));
    beam = children.slice(0, beamWidth);
  }

  const viable = [...completed, ...beam].filter((state) => state.placements.length > 0);
  const deepest = Math.max(0, ...viable.map((state) => state.placements.length));
  const requestedFloor = Math.min(partCap, Math.max(15, brief.partBudget.min));
  const minimumUsefulLength = Math.min(deepest, Math.max(requestedFloor, deepest - 2));
  const deepStates = viable
    .filter((state) => state.placements.length >= minimumUsefulLength);
  const requiredMatchCount = (state: SearchState) => brief.requiredFeatures.filter((feature) =>
    state.matchedFeatures.has(feature),
  ).length;
  const bestFeatureCount = Math.max(0, ...deepStates.map(requiredMatchCount));
  const ranked = deepStates
    .filter((state) => requiredMatchCount(state) === bestFeatureCount)
    .sort((a, b) => b.score - a.score || b.placements.length - a.placements.length);
  const distinct: SearchState[] = [];
  for (const state of ranked) {
    if (distinct.every((existing) => difference(existing, state) >= 0.1)) distinct.push(state);
    if (distinct.length === 3) break;
  }
  return distinct.map((state) => toResult(
    state,
    stock,
    usableInventoryCount,
    rejected,
    intentKind(brief),
    semanticTarget.sourceIds,
    target,
    brief,
  ));
}

/** Preserves the original API while returning the best bounded-search plan. */
export function sequenceInventoryBuild(
  inventory: SequencerInventoryItem[],
  intent: string,
  age: number,
  fidelityWeight?: number,
  briefOverride?: BuildBrief,
): SequenceResult {
  const candidates = sequenceInventoryBuildCandidates(
    inventory,
    intent,
    age,
    fidelityWeight,
    briefOverride,
  );
  if (candidates[0]) return candidates[0];
  const usableInventoryCount = inventory.reduce((sum, item) =>
    sum + (getBrickSpec(item.partNum) ? Math.max(0, item.qty) : 0), 0);
  return {
    placements: [],
    rejected: {},
    usableInventoryCount,
    unusedInventoryCount: usableInventoryCount,
    intentKind: intentKind(briefOverride ?? createFallbackBuildBrief(intent)),
    score: 0,
    componentCount: 0,
    stability: EMPTY_STABILITY,
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

export { BRICK_SPECS };
