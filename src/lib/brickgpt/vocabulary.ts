export interface BrickSpec {
  partNum: string;
  width: number;
  depth: number;
  label: string;
}

/**
 * BrickGPT's deliberately small brick vocabulary. The part numbers are the
 * canonical LDraw/Rebrickable IDs for standard, unmodified bricks.
 */
export const BRICK_SPECS: readonly BrickSpec[] = [
  { partNum: '3005', width: 1, depth: 1, label: 'Brick 1 x 1' },
  { partNum: '3004', width: 1, depth: 2, label: 'Brick 1 x 2' },
  { partNum: '3010', width: 1, depth: 4, label: 'Brick 1 x 4' },
  { partNum: '3009', width: 1, depth: 6, label: 'Brick 1 x 6' },
  { partNum: '3008', width: 1, depth: 8, label: 'Brick 1 x 8' },
  { partNum: '3003', width: 2, depth: 2, label: 'Brick 2 x 2' },
  { partNum: '3001', width: 2, depth: 4, label: 'Brick 2 x 4' },
  { partNum: '2456', width: 2, depth: 6, label: 'Brick 2 x 6' },
] as const;

const SPEC_BY_PART = new Map(BRICK_SPECS.map((spec) => [spec.partNum, spec]));

export function getBrickSpec(partNum: string): BrickSpec | undefined {
  return SPEC_BY_PART.get(partNum.toLowerCase().replace(/\.dat$/i, ''));
}

export function isBrickGPTPart(partNum: string): boolean {
  return SPEC_BY_PART.has(partNum.toLowerCase().replace(/\.dat$/i, ''));
}

export function orientedSize(spec: BrickSpec, rotation: 0 | 90) {
  return rotation === 90
    ? { width: spec.depth, depth: spec.width }
    : { width: spec.width, depth: spec.depth };
}

export function brickArea(spec: BrickSpec): number {
  return spec.width * spec.depth;
}
