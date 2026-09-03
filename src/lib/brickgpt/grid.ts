export interface GridBrick {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  /** Vertical occupancy in plate units. */
  height?: number;
  topConnection?: GridConnection;
  bottomConnection?: GridConnection;
}

export interface GridConnection {
  kind: 'stud' | 'anti-stud' | 'tube' | 'axle-hole' | 'pin-hole' | 'axle' | 'pin' | 'none';
  count: number;
}

export interface GridPlacement extends Required<Pick<GridBrick, 'x' | 'y' | 'z' | 'width' | 'depth'>> {
  id: number;
  height: number;
  topConnection: GridConnection;
  bottomConnection: GridConnection;
}

export type PlacementCheck =
  | { ok: true; supportStuds: number; supportIds: number[] }
  | { ok: false; reason: 'out_of_bounds' | 'collision' | 'disconnected' };

/**
 * Discrete occupancy volume. X/Y are studs and one Z unit is one plate.
 * Placement metadata is retained so search states can be cloned and rolled
 * back without reconstructing geometry.
 */
export class OccupancyGrid {
  private readonly cells: Uint32Array;
  private readonly placements = new Map<number, GridPlacement>();
  private nextId = 1;

  constructor(
    readonly width = 20,
    readonly depth = 20,
    readonly height = 20,
  ) {
    this.cells = new Uint32Array(width * depth * height);
  }

  private index(x: number, y: number, z: number): number {
    return x + y * this.width + z * this.width * this.depth;
  }

  inBounds(brick: GridBrick): boolean {
    const height = brick.height ?? 1;
    return (
      brick.x >= 0 &&
      brick.y >= 0 &&
      brick.z >= 0 &&
      brick.width > 0 &&
      brick.depth > 0 &&
      height > 0 &&
      brick.x + brick.width <= this.width &&
      brick.y + brick.depth <= this.depth &&
      brick.z + height <= this.height
    );
  }

  collides(brick: GridBrick): boolean {
    if (!this.inBounds(brick)) return true;
    const height = brick.height ?? 1;
    for (let z = brick.z; z < brick.z + height; z++) {
      for (let y = brick.y; y < brick.y + brick.depth; y++) {
        for (let x = brick.x; x < brick.x + brick.width; x++) {
          if (this.cells[this.index(x, y, z)] !== 0) return true;
        }
      }
    }
    return false;
  }

  private connectionsMate(top: GridConnection, bottom: GridConnection): boolean {
    if (top.kind === 'none' || bottom.kind === 'none') return false;
    if (top.kind === 'stud') return bottom.kind === 'anti-stud' || bottom.kind === 'tube';
    if (top.kind === 'axle') return bottom.kind === 'axle-hole';
    if (top.kind === 'pin') return bottom.kind === 'pin-hole';
    return false;
  }

  support(brick: GridBrick): { studs: number; ids: number[] } {
    if (brick.z === 0) return { studs: brick.width * brick.depth, ids: [] };
    const bottom = brick.bottomConnection ?? { kind: 'anti-stud', count: brick.width * brick.depth };
    const ids = new Set<number>();
    const contactsById = new Map<number, number>();
    for (let y = brick.y; y < brick.y + brick.depth; y++) {
      for (let x = brick.x; x < brick.x + brick.width; x++) {
        const id = this.cells[this.index(x, y, brick.z - 1)];
        if (id === 0) continue;
        const support = this.placements.get(id);
        if (support && support.z + support.height === brick.z &&
            this.connectionsMate(support.topConnection, bottom)) {
          ids.add(id);
          contactsById.set(id, (contactsById.get(id) ?? 0) + 1);
        }
      }
    }
    const count = [...contactsById].reduce((sum, [id, contacts]) => {
      const support = this.placements.get(id);
      return sum + Math.min(contacts, support?.topConnection.count ?? 0);
    }, 0);
    return {
      studs: Math.min(count, Math.max(0, bottom.count)),
      ids: [...ids].sort((a, b) => a - b),
    };
  }

  supportStuds(brick: GridBrick): number {
    return this.support(brick).studs;
  }

  check(brick: GridBrick): PlacementCheck {
    if (!this.inBounds(brick)) return { ok: false, reason: 'out_of_bounds' };
    if (this.collides(brick)) return { ok: false, reason: 'collision' };
    const support = this.support(brick);
    const supportStuds = support.studs;
    if (brick.z > 0 && supportStuds === 0) {
      return { ok: false, reason: 'disconnected' };
    }
    return { ok: true, supportStuds, supportIds: support.ids };
  }

  place(brick: GridBrick): number {
    const result = this.check(brick);
    if (!result.ok) throw new Error(`Invalid brick placement: ${result.reason}`);
    const id = this.nextId++;
    const placement: GridPlacement = {
      id,
      x: brick.x,
      y: brick.y,
      z: brick.z,
      width: brick.width,
      depth: brick.depth,
      height: brick.height ?? 1,
      topConnection: brick.topConnection ?? { kind: 'stud', count: brick.width * brick.depth },
      bottomConnection: brick.bottomConnection ?? { kind: 'anti-stud', count: brick.width * brick.depth },
    };
    this.placements.set(id, placement);
    for (let z = placement.z; z < placement.z + placement.height; z++) {
      for (let y = placement.y; y < placement.y + placement.depth; y++) {
        for (let x = placement.x; x < placement.x + placement.width; x++) {
          this.cells[this.index(x, y, z)] = id;
        }
      }
    }
    return id;
  }

  remove(brickOrId: GridBrick | number): void {
    if (typeof brickOrId !== 'number' &&
        (brickOrId.x < 0 || brickOrId.y < 0 || brickOrId.z < 0 ||
         brickOrId.x >= this.width || brickOrId.y >= this.depth || brickOrId.z >= this.height)) {
      return;
    }
    const id = typeof brickOrId === 'number'
      ? brickOrId
      : this.cells[this.index(brickOrId.x, brickOrId.y, brickOrId.z)];
    const placement = this.placements.get(id);
    if (!placement) return;
    for (let z = placement.z; z < placement.z + placement.height; z++) {
      for (let y = placement.y; y < placement.y + placement.depth; y++) {
        for (let x = placement.x; x < placement.x + placement.width; x++) {
          if (this.cells[this.index(x, y, z)] === id) {
            this.cells[this.index(x, y, z)] = 0;
          }
        }
      }
    }
    this.placements.delete(id);
  }

  getPlacement(id: number): GridPlacement | undefined {
    return this.placements.get(id);
  }

  getPlacements(): GridPlacement[] {
    return [...this.placements.values()].sort((a, b) => a.id - b.id);
  }

  placementIdAt(x: number, y: number, z: number): number {
    if (x < 0 || y < 0 || z < 0 || x >= this.width || y >= this.depth || z >= this.height) return 0;
    return this.cells[this.index(x, y, z)];
  }

  connectedComponents(): number[][] {
    const adjacency = new Map<number, Set<number>>();
    for (const placement of this.placements.values()) adjacency.set(placement.id, new Set());
    for (const placement of this.placements.values()) {
      const supportIds = this.support(placement).ids;
      for (const supportId of supportIds) {
        adjacency.get(placement.id)?.add(supportId);
        adjacency.get(supportId)?.add(placement.id);
      }
    }
    const seen = new Set<number>();
    const components: number[][] = [];
    for (const id of [...adjacency.keys()].sort((a, b) => a - b)) {
      if (seen.has(id)) continue;
      const component: number[] = [];
      const pending = [id];
      seen.add(id);
      while (pending.length > 0) {
        const current = pending.pop()!;
        component.push(current);
        for (const neighbour of adjacency.get(current) ?? []) {
          if (!seen.has(neighbour)) {
            seen.add(neighbour);
            pending.push(neighbour);
          }
        }
      }
      components.push(component.sort((a, b) => a - b));
    }
    return components;
  }

  clone(): OccupancyGrid {
    const copy = new OccupancyGrid(this.width, this.depth, this.height);
    copy.cells.set(this.cells);
    copy.nextId = this.nextId;
    for (const [id, placement] of this.placements) {
      copy.placements.set(id, {
        ...placement,
        topConnection: { ...placement.topConnection },
        bottomConnection: { ...placement.bottomConnection },
      });
    }
    return copy;
  }
}
