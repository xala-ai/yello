import { OccupancyGrid } from './grid';
import {
  BRICK_SPECS,
  brickArea,
  getBrickSpec,
  orientedSize,
  type BrickSpec,
} from './vocabulary';

export interface SequencerInventoryItem {
  partNum: string;
  name: string;
  colorId: number;
  colorName: string;
  qty: number;
}

export interface BrickPlacement {
  partNum: string;
  colorId: number;
  colorName: string;
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  rotation: 0 | 90;
  step: number;
  description: string;
  supportStuds: number;
  loadBearing: boolean;
}

export interface SequenceResult {
  placements: BrickPlacement[];
  rejected: Record<string, number>;
  usableInventoryCount: number;
  unusedInventoryCount: number;
  intentKind: IntentKind;
}

type IntentKind = 'house' | 'tower' | 'vehicle' | 'spacecraft' | 'bridge' | 'sculpture';

interface StockItem extends SequencerInventoryItem {
  key: string;
  spec: BrickSpec;
  remaining: number;
}

function classifyIntent(intent: string): IntentKind {
  const text = intent.toLowerCase();
  if (/(spaceship|space ship|rocket|plane|aircraft|jet|x-wing)/.test(text)) return 'spacecraft';
  if (/(car|truck|vehicle|forklift|tractor|bus|van|rover)/.test(text)) return 'vehicle';
  if (/(tower|skyscraper|lighthouse|tall)/.test(text)) return 'tower';
  if (/(bridge|arch|gateway)/.test(text)) return 'bridge';
  if (/(house|home|building|castle|fort)/.test(text)) return 'house';
  return 'sculpture';
}

function cellKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

function addRect(
  target: Set<string>,
  x0: number,
  y0: number,
  width: number,
  depth: number,
  z: number,
  perimeter = false,
) {
  for (let y = y0; y < y0 + depth; y++) {
    for (let x = x0; x < x0 + width; x++) {
      if (
        !perimeter ||
        x === x0 ||
        y === y0 ||
        x === x0 + width - 1 ||
        y === y0 + depth - 1
      ) {
        target.add(cellKey(x, y, z));
      }
    }
  }
}

function buildTarget(kind: IntentKind, usableStuds: number, maxBricks: number): Set<string> {
  const target = new Set<string>();
  const side = Math.max(4, Math.min(12, Math.floor(Math.sqrt(Math.max(16, usableStuds * 0.45)))));
  const width = Math.min(16, side + (kind === 'vehicle' || kind === 'bridge' ? 4 : 0));
  const depth = Math.max(4, Math.min(12, kind === 'vehicle' ? Math.ceil(side / 2) : side));
  const maxLayers = Math.max(2, Math.min(kind === 'tower' ? 10 : 6, Math.ceil(maxBricks / 10)));

  addRect(target, 1, 1, width, depth, 0);

  if (kind === 'vehicle') {
    addRect(target, 2, 1, Math.max(2, width - 2), depth, 1);
    addRect(target, Math.floor(width * 0.38), 2, Math.max(2, Math.floor(width * 0.35)), Math.max(2, depth - 2), 2);
    addRect(target, width - 3, 1, 2, depth, 2);
  } else if (kind === 'spacecraft') {
    addRect(target, Math.floor(width / 2) - 1, 1, 2, depth, 1);
    addRect(target, 2, Math.floor(depth / 2) - 1, Math.max(2, width - 2), 2, 1);
    addRect(target, Math.floor(width / 2) - 1, 2, 2, Math.max(2, depth - 2), 2);
  } else if (kind === 'bridge') {
    addRect(target, 1, 1, 2, depth, 1);
    addRect(target, width - 1, 1, 2, depth, 1);
    addRect(target, 1, 1, width, 2, 2);
    addRect(target, 1, depth - 1, width, 2, 2);
  } else if (kind === 'sculpture') {
    for (let z = 1; z < maxLayers; z++) {
      const inset = Math.min(Math.floor((width - 2) / 2), Math.floor(z / 2));
      addRect(target, 1 + inset, 1 + inset, Math.max(2, width - inset * 2), Math.max(2, depth - inset * 2), z);
    }
  } else {
    for (let z = 1; z < maxLayers; z++) {
      addRect(target, 1, 1, width, depth, z, true);
    }
    if (kind === 'house') {
      addRect(target, 2, 2, Math.max(2, width - 2), Math.max(2, depth - 2), maxLayers);
    }
  }
  return target;
}

function cellsFitTarget(
  target: Set<string>,
  occupied: Set<string>,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
): boolean {
  for (let yy = y; yy < y + depth; yy++) {
    for (let xx = x; xx < x + width; xx++) {
      const key = cellKey(xx, yy, z);
      if (!target.has(key) || occupied.has(key)) return false;
    }
  }
  return true;
}

function markOccupied(
  occupied: Set<string>,
  x: number,
  y: number,
  z: number,
  width: number,
  depth: number,
) {
  for (let yy = y; yy < y + depth; yy++) {
    for (let xx = x; xx < x + width; xx++) occupied.add(cellKey(xx, yy, z));
  }
}

function stepDescription(kind: IntentKind, z: number, item: StockItem): string {
  if (z === 0) return `Build the base with ${item.name}`;
  if (kind === 'vehicle' && z === 1) return `Shape the chassis with ${item.name}`;
  if (kind === 'spacecraft' && z > 0) return `Build the fuselage and wings with ${item.name}`;
  if (kind === 'bridge') return `Join the bridge section with ${item.name}`;
  if (kind === 'house' && z > 0) return `Raise wall layer ${z} with ${item.name}`;
  return `Add layer ${z + 1} with ${item.name}`;
}

/**
 * A serverless BrickGPT-style decoder: each accepted placement is the next
 * brick token; invalid candidates are rejected and a smaller/oriented brick is
 * tried. The target silhouette supplies prompt semantics while the grid and
 * garage stock enforce buildability.
 */
export function sequenceInventoryBuild(
  inventory: SequencerInventoryItem[],
  intent: string,
  age: number,
): SequenceResult {
  const maxBricks = age < 6 ? 20 : age < 10 ? 40 : 80;
  const stock: StockItem[] = inventory
    .map((item) => {
      const spec = getBrickSpec(item.partNum);
      return spec
        ? { ...item, spec, key: `${item.partNum}__${item.colorId}`, remaining: Math.max(0, item.qty) }
        : null;
    })
    .filter((item): item is StockItem => item !== null && item.remaining > 0)
    .sort((a, b) => brickArea(b.spec) - brickArea(a.spec));

  const usableInventoryCount = stock.reduce((sum, item) => sum + item.remaining, 0);
  const usableStuds = stock.reduce((sum, item) => sum + item.remaining * brickArea(item.spec), 0);
  const intentKind = classifyIntent(intent);
  const target = buildTarget(intentKind, usableStuds, maxBricks);
  const occupied = new Set<string>();
  const grid = new OccupancyGrid(20, 20, 20);
  const placements: BrickPlacement[] = [];
  const rejected: Record<string, number> = {};
  const reject = (reason: string) => {
    rejected[reason] = (rejected[reason] ?? 0) + 1;
  };

  const targetCells = [...target]
    .map((key) => key.split(',').map(Number) as [number, number, number])
    .sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);

  for (const [x, y, z] of targetCells) {
    if (placements.length >= maxBricks || occupied.has(cellKey(x, y, z))) continue;
    let accepted = false;

    // Stock remains largest-first; rotating the preference each layer creates
    // overlapping seams instead of vertical stacks.
    const available = stock.filter((item) => item.remaining > 0);

    for (const item of available) {
      const rotations: Array<0 | 90> = z % 2 === 0 ? [0, 90] : [90, 0];
      for (const rotation of rotations) {
        const size = orientedSize(item.spec, rotation);
        if (!cellsFitTarget(target, occupied, x, y, z, size.width, size.depth)) {
          reject('target_mismatch');
          continue;
        }
        const check = grid.check({ x, y, z, width: size.width, depth: size.depth });
        if (!check.ok) {
          reject(check.reason);
          continue;
        }

        grid.place({ x, y, z, width: size.width, depth: size.depth });
        markOccupied(occupied, x, y, z, size.width, size.depth);
        item.remaining--;
        placements.push({
          partNum: item.partNum,
          colorId: item.colorId,
          colorName: item.colorName,
          x,
          y,
          z,
          width: size.width,
          depth: size.depth,
          rotation,
          step: z + 1,
          description: stepDescription(intentKind, z, item),
          supportStuds: check.supportStuds,
          loadBearing: z <= 1,
        });
        accepted = true;
        break;
      }
      if (accepted) break;
    }
    if (!accepted) reject('inventory_or_support');
  }

  return {
    placements,
    rejected,
    usableInventoryCount,
    unusedInventoryCount: stock.reduce((sum, item) => sum + item.remaining, 0),
    intentKind,
  };
}

export { BRICK_SPECS };
