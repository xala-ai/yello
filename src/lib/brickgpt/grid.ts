export interface GridBrick {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
}

export type PlacementCheck =
  | { ok: true; supportStuds: number }
  | { ok: false; reason: 'out_of_bounds' | 'collision' | 'disconnected' };

/**
 * BrickGPT-style discrete occupancy volume. One Z unit is one standard brick
 * high; X/Y are studs. It provides the cheap validity checks used during
 * rejection sampling.
 */
export class OccupancyGrid {
  private readonly cells: Uint16Array;
  private nextId = 1;

  constructor(
    readonly width = 20,
    readonly depth = 20,
    readonly height = 20,
  ) {
    this.cells = new Uint16Array(width * depth * height);
  }

  private index(x: number, y: number, z: number): number {
    return x + y * this.width + z * this.width * this.depth;
  }

  inBounds(brick: GridBrick): boolean {
    return (
      brick.x >= 0 &&
      brick.y >= 0 &&
      brick.z >= 0 &&
      brick.x + brick.width <= this.width &&
      brick.y + brick.depth <= this.depth &&
      brick.z < this.height
    );
  }

  collides(brick: GridBrick): boolean {
    if (!this.inBounds(brick)) return true;
    for (let y = brick.y; y < brick.y + brick.depth; y++) {
      for (let x = brick.x; x < brick.x + brick.width; x++) {
        if (this.cells[this.index(x, y, brick.z)] !== 0) return true;
      }
    }
    return false;
  }

  supportStuds(brick: GridBrick): number {
    if (brick.z === 0) return brick.width * brick.depth;
    let count = 0;
    for (let y = brick.y; y < brick.y + brick.depth; y++) {
      for (let x = brick.x; x < brick.x + brick.width; x++) {
        if (this.cells[this.index(x, y, brick.z - 1)] !== 0) count++;
      }
    }
    return count;
  }

  check(brick: GridBrick): PlacementCheck {
    if (!this.inBounds(brick)) return { ok: false, reason: 'out_of_bounds' };
    if (this.collides(brick)) return { ok: false, reason: 'collision' };
    const supportStuds = this.supportStuds(brick);
    if (brick.z > 0 && supportStuds === 0) {
      return { ok: false, reason: 'disconnected' };
    }
    return { ok: true, supportStuds };
  }

  place(brick: GridBrick): number {
    const result = this.check(brick);
    if (!result.ok) throw new Error(`Invalid brick placement: ${result.reason}`);
    const id = this.nextId++;
    for (let y = brick.y; y < brick.y + brick.depth; y++) {
      for (let x = brick.x; x < brick.x + brick.width; x++) {
        this.cells[this.index(x, y, brick.z)] = id;
      }
    }
    return id;
  }

  remove(brick: GridBrick): void {
    if (!this.inBounds(brick)) return;
    for (let y = brick.y; y < brick.y + brick.depth; y++) {
      for (let x = brick.x; x < brick.x + brick.width; x++) {
        this.cells[this.index(x, y, brick.z)] = 0;
      }
    }
  }
}
