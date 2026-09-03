export type PartRotation = 0 | 90 | 180 | 270;
export type PartRole =
  | 'structure'
  | 'brick'
  | 'plate'
  | 'tile'
  | 'slope'
  | 'transparent'
  | 'wheel'
  | 'axle'
  | 'connector'
  | 'technic'
  | 'detail';
export type ConnectionKind = 'stud' | 'anti-stud' | 'tube' | 'axle-hole' | 'pin-hole' | 'axle' | 'pin' | 'none';

export interface PartConnection {
  kind: ConnectionKind;
  count: number;
}

export interface BrickSpec {
  /** Canonical extension-free LDraw part id. */
  partNum: string;
  ldrawId: string;
  label: string;
  /** Compatibility dimensions in studs. */
  width: number;
  depth: number;
  footprint: {
    width: number;
    depth: number;
  };
  /** Occupied vertical extent in plate-height units (one brick = three). */
  occupiedHeight: number;
  legalRotations: readonly PartRotation[];
  roles: readonly PartRole[];
  connections: {
    top: PartConnection;
    bottom: PartConnection;
  };
}

const QUARTER_TURNS = [0, 90, 180, 270] as const;

function part(
  partNum: string,
  label: string,
  width: number,
  depth: number,
  occupiedHeight: number,
  roles: readonly PartRole[],
  top: PartConnection = { kind: 'stud', count: width * depth },
  bottom: PartConnection = { kind: 'anti-stud', count: width * depth },
): BrickSpec {
  return {
    partNum,
    ldrawId: `${partNum}.dat`,
    label,
    width,
    depth,
    footprint: { width, depth },
    occupiedHeight,
    legalRotations: width === depth ? [0] : QUARTER_TURNS,
    roles,
    connections: { top, bottom },
  };
}

/** Common, legal LDraw primitives suitable for inventory-constrained planning. */
export const BRICK_SPECS: readonly BrickSpec[] = [
  // Standard bricks (three plates high).
  part('3005', 'Brick 1 x 1', 1, 1, 3, ['structure', 'brick']),
  part('3004', 'Brick 1 x 2', 1, 2, 3, ['structure', 'brick']),
  part('3622', 'Brick 1 x 3', 1, 3, 3, ['structure', 'brick']),
  part('3010', 'Brick 1 x 4', 1, 4, 3, ['structure', 'brick']),
  part('3009', 'Brick 1 x 6', 1, 6, 3, ['structure', 'brick']),
  part('3008', 'Brick 1 x 8', 1, 8, 3, ['structure', 'brick']),
  part('3003', 'Brick 2 x 2', 2, 2, 3, ['structure', 'brick']),
  part('3002', 'Brick 2 x 3', 2, 3, 3, ['structure', 'brick']),
  part('3001', 'Brick 2 x 4', 2, 4, 3, ['structure', 'brick']),
  part('2456', 'Brick 2 x 6', 2, 6, 3, ['structure', 'brick']),
  part('3007', 'Brick 2 x 8', 2, 8, 3, ['structure', 'brick']),

  // Plates (one plate high).
  part('3024', 'Plate 1 x 1', 1, 1, 1, ['structure', 'plate']),
  part('3023', 'Plate 1 x 2', 1, 2, 1, ['structure', 'plate']),
  part('3623', 'Plate 1 x 3', 1, 3, 1, ['structure', 'plate']),
  part('3710', 'Plate 1 x 4', 1, 4, 1, ['structure', 'plate']),
  part('3666', 'Plate 1 x 6', 1, 6, 1, ['structure', 'plate']),
  part('3460', 'Plate 1 x 8', 1, 8, 1, ['structure', 'plate']),
  part('3022', 'Plate 2 x 2', 2, 2, 1, ['structure', 'plate']),
  part('3021', 'Plate 2 x 3', 2, 3, 1, ['structure', 'plate']),
  part('3020', 'Plate 2 x 4', 2, 4, 1, ['structure', 'plate']),
  part('3795', 'Plate 2 x 6', 2, 6, 1, ['structure', 'plate']),
  part('3034', 'Plate 2 x 8', 2, 8, 1, ['structure', 'plate']),
  part('3031', 'Plate 4 x 4', 4, 4, 1, ['structure', 'plate']),

  // Tiles retain underside attachment but have no top studs.
  part('3070b', 'Tile 1 x 1', 1, 1, 1, ['tile', 'detail'], { kind: 'none', count: 0 }),
  part('3069b', 'Tile 1 x 2', 1, 2, 1, ['tile', 'detail'], { kind: 'none', count: 0 }),
  part('63864', 'Tile 1 x 3', 1, 3, 1, ['tile', 'detail'], { kind: 'none', count: 0 }),
  part('2431', 'Tile 1 x 4', 1, 4, 1, ['tile', 'detail'], { kind: 'none', count: 0 }),
  part('3068b', 'Tile 2 x 2', 2, 2, 1, ['tile', 'detail'], { kind: 'none', count: 0 }),

  // Common roof, nose, and shaping slopes.
  part('3040b', 'Slope 45 1 x 2', 1, 2, 3, ['slope', 'detail']),
  part('3039', 'Slope 45 2 x 2', 2, 2, 3, ['slope', 'detail']),
  part('3298', 'Slope 33 2 x 3', 2, 3, 3, ['slope', 'detail']),
  part('3037', 'Slope 45 2 x 4', 2, 4, 3, ['slope', 'detail']),
  part('3045', 'Double Slope 45 2 x 2', 2, 2, 3, ['slope', 'detail']),

  // Parts commonly used as transparent windows and canopies.
  part('3065', 'Brick 1 x 2 without top studs', 1, 2, 3, ['transparent', 'detail'], { kind: 'none', count: 0 }),
  part('60592', 'Window 1 x 2 x 2', 1, 2, 6, ['transparent', 'detail']),
  part('62360', 'Windscreen 2 x 4 x 1', 2, 4, 3, ['transparent', 'slope', 'detail']),

  // Running gear and Technic connections. Footprints are planning envelopes.
  part('55982', 'Wheel 18 x 14', 2, 1, 5, ['wheel', 'detail'],
    { kind: 'axle-hole', count: 1 }, { kind: 'axle-hole', count: 1 }),
  part('6014', 'Wheel 11 x 8', 1, 1, 3, ['wheel', 'detail'],
    { kind: 'axle-hole', count: 1 }, { kind: 'axle-hole', count: 1 }),
  part('3705', 'Technic Axle 4', 1, 4, 1, ['axle', 'technic', 'connector'],
    { kind: 'axle', count: 1 }, { kind: 'axle', count: 1 }),
  part('3706', 'Technic Axle 6', 1, 6, 1, ['axle', 'technic', 'connector'],
    { kind: 'axle', count: 1 }, { kind: 'axle', count: 1 }),
  part('2780', 'Technic Pin with Friction', 1, 1, 1, ['technic', 'connector'],
    { kind: 'pin', count: 1 }, { kind: 'pin', count: 1 }),
  part('3673', 'Technic Pin', 1, 1, 1, ['technic', 'connector'],
    { kind: 'pin', count: 1 }, { kind: 'pin', count: 1 }),
  part('3700', 'Technic Brick 1 x 2 with Hole', 1, 2, 3, ['structure', 'brick', 'technic', 'connector'],
    { kind: 'stud', count: 2 }, { kind: 'anti-stud', count: 2 }),
  part('3701', 'Technic Brick 1 x 4 with Holes', 1, 4, 3, ['structure', 'brick', 'technic', 'connector'],
    { kind: 'stud', count: 4 }, { kind: 'anti-stud', count: 4 }),
] as const;

const SPEC_BY_PART = new Map(BRICK_SPECS.map((spec) => [spec.partNum, spec]));

export function getBrickSpec(partNum: string): BrickSpec | undefined {
  return SPEC_BY_PART.get(partNum.toLowerCase().replace(/\.dat$/i, ''));
}

export function isBrickGPTPart(partNum: string): boolean {
  return SPEC_BY_PART.has(partNum.toLowerCase().replace(/\.dat$/i, ''));
}

export function orientedSize(spec: BrickSpec, rotation: PartRotation) {
  return rotation === 90 || rotation === 270
    ? { width: spec.depth, depth: spec.width }
    : { width: spec.width, depth: spec.depth };
}

export function brickArea(spec: BrickSpec): number {
  return spec.width * spec.depth;
}
