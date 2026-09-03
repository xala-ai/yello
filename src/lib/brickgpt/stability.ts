import type { GridPlacement, OccupancyGrid } from './grid';

export interface StabilityMetrics {
  supportRatio: number;
  centerOfMass: { x: number; y: number };
  supportFootprint: { minX: number; maxX: number; minY: number; maxY: number } | null;
  centerOfMassSupported: boolean;
  centerOfMassMargin: number;
  seamStaggering: number;
  cantileverPenalty: number;
  weakConnectionPenalty: number;
  prefixStability: number;
  score: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function contactCells(grid: OccupancyGrid, placement: GridPlacement): Array<[number, number]> {
  if (placement.z === 0) {
    const cells: Array<[number, number]> = [];
    for (let y = placement.y; y < placement.y + placement.depth; y++) {
      for (let x = placement.x; x < placement.x + placement.width; x++) cells.push([x, y]);
    }
    return cells;
  }
  const cells: Array<[number, number]> = [];
  for (let y = placement.y; y < placement.y + placement.depth; y++) {
    for (let x = placement.x; x < placement.x + placement.width; x++) {
      if (grid.placementIdAt(x, y, placement.z - 1) !== 0) cells.push([x, y]);
    }
  }
  return cells;
}

function supportBounds(
  contacts: Array<[number, number]>,
): StabilityMetrics['supportFootprint'] {
  if (contacts.length === 0) return null;
  return {
    minX: Math.min(...contacts.map(([x]) => x)),
    maxX: Math.max(...contacts.map(([x]) => x + 1)),
    minY: Math.min(...contacts.map(([, y]) => y)),
    maxY: Math.max(...contacts.map(([, y]) => y + 1)),
  };
}

function centerOfMass(placements: readonly GridPlacement[]): { x: number; y: number } {
  let mass = 0;
  let xMoment = 0;
  let yMoment = 0;
  for (const placement of placements) {
    const partMass = placement.width * placement.depth * placement.height;
    mass += partMass;
    xMoment += (placement.x + placement.width / 2) * partMass;
    yMoment += (placement.y + placement.depth / 2) * partMass;
  }
  return mass === 0 ? { x: 0, y: 0 } : { x: xMoment / mass, y: yMoment / mass };
}

function projectionScore(
  center: { x: number; y: number },
  footprint: StabilityMetrics['supportFootprint'],
): { supported: boolean; margin: number } {
  if (!footprint) return { supported: false, margin: 0 };
  const supported = center.x >= footprint.minX && center.x <= footprint.maxX &&
    center.y >= footprint.minY && center.y <= footprint.maxY;
  if (!supported) return { supported, margin: 0 };
  const edgeDistance = Math.min(
    center.x - footprint.minX,
    footprint.maxX - center.x,
    center.y - footprint.minY,
    footprint.maxY - center.y,
  );
  const scale = Math.max(0.5, Math.min(
    footprint.maxX - footprint.minX,
    footprint.maxY - footprint.minY,
  ) / 2);
  return { supported, margin: clamp01(edgeDistance / scale) };
}

function seamScore(grid: OccupancyGrid, placement: GridPlacement): number {
  if (placement.z === 0) return 1;
  const supportIds = new Set<number>();
  for (const [x, y] of contactCells(grid, placement)) {
    const id = grid.placementIdAt(x, y, placement.z - 1);
    if (id !== 0) supportIds.add(id);
  }
  if (supportIds.size === 0) return 0;
  let aligned = 0;
  for (const id of supportIds) {
    const support = grid.getPlacement(id);
    if (!support) continue;
    if (support.x === placement.x || support.x + support.width === placement.x + placement.width) aligned++;
    if (support.y === placement.y || support.y + support.depth === placement.y + placement.depth) aligned++;
  }
  return clamp01(1 - aligned / Math.max(2, supportIds.size * 2));
}

function prefixScore(grid: OccupancyGrid, placements: readonly GridPlacement[]): number {
  if (placements.length === 0) return 0;
  let weakest = 1;
  for (let index = 1; index <= placements.length; index++) {
    const prefix = placements.slice(0, index);
    const baseContacts = prefix
      .filter((placement) => placement.z === 0)
      .flatMap((placement) => contactCells(grid, placement));
    const projection = projectionScore(centerOfMass(prefix), supportBounds(baseContacts));
    const connection = prefix.reduce((sum, placement) => {
      if (placement.z === 0) return sum + 1;
      return sum + clamp01(grid.supportStuds(placement) / (placement.width * placement.depth));
    }, 0) / prefix.length;
    weakest = Math.min(weakest, connection * 0.65 + (projection.supported ? 0.2 : 0) +
      projection.margin * 0.15);
  }
  return clamp01(weakest);
}

/** Cheap deterministic metrics intended for scoring thousands of search states. */
export function measureStability(grid: OccupancyGrid): StabilityMetrics {
  const placements = grid.getPlacements();
  if (placements.length === 0) {
    return {
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
    };
  }
  let supportTotal = 0;
  let cantileverTotal = 0;
  let weakConnections = 0;
  let seamTotal = 0;
  for (const placement of placements) {
    const area = placement.width * placement.depth;
    const ratio = placement.z === 0 ? 1 : clamp01(grid.supportStuds(placement) / area);
    supportTotal += ratio;
    cantileverTotal += 1 - ratio;
    if (placement.z > 0 && (grid.supportStuds(placement) <= 1 || ratio < 0.25)) weakConnections++;
    seamTotal += seamScore(grid, placement);
  }
  const contacts = placements
    .filter((placement) => placement.z === 0)
    .flatMap((placement) => contactCells(grid, placement));
  const supportFootprint = supportBounds(contacts);
  const center = centerOfMass(placements);
  const projection = projectionScore(center, supportFootprint);
  const supportRatio = supportTotal / placements.length;
  const seamStaggering = seamTotal / placements.length;
  const cantileverPenalty = cantileverTotal / placements.length;
  const weakConnectionPenalty = weakConnections / placements.length;
  const prefixStability = prefixScore(grid, placements);
  return {
    supportRatio,
    centerOfMass: center,
    supportFootprint,
    centerOfMassSupported: projection.supported,
    centerOfMassMargin: projection.margin,
    seamStaggering,
    cantileverPenalty,
    weakConnectionPenalty,
    prefixStability,
    score: clamp01(
      supportRatio * 0.3 +
      (projection.supported ? 0.12 : 0) +
      projection.margin * 0.08 +
      seamStaggering * 0.15 +
      prefixStability * 0.25 -
      cantileverPenalty * 0.06 -
      weakConnectionPenalty * 0.04,
    ),
  };
}
