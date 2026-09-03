import { createHash } from 'node:crypto';
import type { BuildPlan, PlacedBrick } from '../../planner';
import { GOLDEN_BUILD_INVENTORY } from '../golden';
import type { OccupancyCell, ReferenceCorpusEntry } from '../types';
import { getBrickSpec } from '../vocabulary';

export const REALISTIC_INVENTORY = GOLDEN_BUILD_INVENTORY;

export function assertInventoryAndGeometry(
  steps: readonly PlacedBrick[],
  inventory = REALISTIC_INVENTORY,
): void {
  const available = new Map(
    inventory.map((item) => [`${item.partNum}:${item.colorId}`, item.qty]),
  );
  const used = new Map<string, number>();
  const occupied = new Set<string>();

  for (const step of steps) {
    const spec = getBrickSpec(step.partNum);
    if (!spec) throw new Error(`Unsupported part ${step.partNum}`);
    const stockKey = `${step.partNum}:${step.colorId}`;
    used.set(stockKey, (used.get(stockKey) ?? 0) + 1);
    if ((used.get(stockKey) ?? 0) > (available.get(stockKey) ?? 0)) {
      throw new Error(`Inventory exceeded for ${stockKey}`);
    }
    const width = step.width ?? spec.width;
    const depth = step.depth ?? spec.depth;
    const height = step.height ?? spec.occupiedHeight;
    for (let z = step.z; z < step.z + height; z++) {
      for (let y = step.y; y < step.y + depth; y++) {
        for (let x = step.x; x < step.x + width; x++) {
          const cell = `${x},${y},${z}`;
          if (occupied.has(cell)) throw new Error(`Collision at ${cell}`);
          occupied.add(cell);
        }
      }
    }
  }
}

export function planSignature(plan: BuildPlan): string {
  return plan.steps
    .map((step) =>
      `${step.partNum}:${step.colorId}:${step.x}:${step.y}:${step.z}:${step.rot}`,
    )
    .join('|');
}

function normalizePoints(points: OccupancyCell[]): OccupancyCell[] {
  const min = [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis])));
  const max = [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis])));
  const span = Math.max(...max.map((value, axis) => value - min[axis]), 1);
  return [...new Set(points.map((point) =>
    point.map((value, axis) => Math.round(((value - min[axis]) / span) * 11)).join(','),
  ))].map((cell) => cell.split(',').map(Number) as unknown as OccupancyCell);
}

function variants(points: OccupancyCell[]): OccupancyCell[][] {
  const transforms: Array<(cell: OccupancyCell) => OccupancyCell> = [
    ([x, y, z]) => [x, y, z],
    ([x, y, z]) => [-x, y, z],
    ([x, y, z]) => [x, y, -z],
    ([x, y, z]) => [-x, y, -z],
    ([x, y, z]) => [z, y, x],
    ([x, y, z]) => [-z, y, x],
    ([x, y, z]) => [z, y, -x],
    ([x, y, z]) => [-z, y, -x],
  ];
  return transforms.map((transform) => normalizePoints(
    points.map((point) => transform(point)),
  ));
}

function jaccard(left: OccupancyCell[], right: OccupancyCell[]): number {
  const a = new Set(left.map((cell) => cell.join(',')));
  const b = new Set(right.map((cell) => cell.join(',')));
  let intersection = 0;
  for (const cell of a) if (b.has(cell)) intersection++;
  return intersection / Math.max(1, a.size + b.size - intersection);
}

export function sourceSimilarity(
  plan: BuildPlan,
  source: ReferenceCorpusEntry,
): number {
  const points = normalizePoints(plan.steps.map((step) => [
    Math.round(step.x + (step.width ?? 1) / 2),
    Math.round(step.z),
    Math.round(step.y + (step.depth ?? 1) / 2),
  ] as OccupancyCell));
  return Math.max(...variants(source.occupancy.cells).map((variant) => jaccard(points, variant)));
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
