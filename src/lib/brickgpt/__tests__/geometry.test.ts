import { describe, expect, it } from 'vitest';
import {
  createAssemblyInstructions,
  deriveSupportDependencyDag,
} from '../instructions';
import { OccupancyGrid } from '../grid';
import { emitLDraw } from '../ldraw-emit';
import type { BrickPlacement } from '../sequencer';
import { measureStability } from '../stability';

function placement(
  placementId: number,
  values: Partial<BrickPlacement> = {},
): BrickPlacement {
  return {
    placementId,
    partNum: '3020',
    colorId: 4,
    colorName: 'Red',
    x: 0,
    y: 0,
    z: 0,
    width: 2,
    depth: 4,
    height: 1,
    rotation: 0,
    step: 1,
    description: 'Place plate',
    supportStuds: 8,
    loadBearing: true,
    roles: ['structure', 'plate'],
    ...values,
  };
}

describe('plate-unit occupancy grid', () => {
  it('detects collisions and only accepts mating vertical connections', () => {
    const grid = new OccupancyGrid(8, 8, 12);
    const base = grid.place({ x: 1, y: 1, z: 0, width: 2, depth: 4, height: 1 });

    expect(grid.check({ x: 1, y: 1, z: 0, width: 1, depth: 1 })).toEqual({
      ok: false,
      reason: 'collision',
    });
    expect(grid.check({ x: 1, y: 1, z: 1, width: 2, depth: 2, height: 3 }))
      .toMatchObject({ ok: true, supportStuds: 4, supportIds: [base] });
    expect(grid.check({ x: 5, y: 5, z: 1, width: 1, depth: 1 }))
      .toEqual({ ok: false, reason: 'disconnected' });

    grid.place({
      x: 4,
      y: 1,
      z: 0,
      width: 1,
      depth: 1,
      topConnection: { kind: 'none', count: 0 },
    });
    expect(grid.check({ x: 4, y: 1, z: 1, width: 1, depth: 1 }))
      .toEqual({ ok: false, reason: 'disconnected' });
  });

  it('clones independently and removes complete multi-plate placements', () => {
    const grid = new OccupancyGrid(6, 6, 9);
    const id = grid.place({ x: 1, y: 2, z: 0, width: 2, depth: 2, height: 3 });
    const clone = grid.clone();
    clone.remove(id);

    expect(clone.getPlacements()).toHaveLength(0);
    expect(clone.placementIdAt(1, 2, 2)).toBe(0);
    expect(grid.getPlacements()).toHaveLength(1);
    expect(grid.placementIdAt(2, 3, 2)).toBe(id);

    grid.remove({ x: 2, y: 3, z: 1, width: 1, depth: 1 });
    expect(grid.getPlacements()).toHaveLength(0);
  });
});

describe('stability and dependency ordering', () => {
  it('measures stable prefixes and penalizes weak cantilevers', () => {
    const stable = new OccupancyGrid(8, 8, 12);
    stable.place({ x: 2, y: 2, z: 0, width: 4, depth: 4, height: 1 });
    stable.place({ x: 2, y: 2, z: 1, width: 2, depth: 4, height: 1 });
    stable.place({ x: 4, y: 2, z: 1, width: 2, depth: 4, height: 1 });
    const stableMetrics = measureStability(stable);

    const weak = new OccupancyGrid(8, 8, 12);
    weak.place({ x: 1, y: 1, z: 0, width: 1, depth: 1, height: 1 });
    weak.place({ x: 1, y: 1, z: 1, width: 4, depth: 1, height: 1 });
    const weakMetrics = measureStability(weak);

    expect(stableMetrics.centerOfMassSupported).toBe(true);
    expect(stableMetrics.prefixStability).toBeGreaterThanOrEqual(0.8);
    expect(stableMetrics.score).toBeGreaterThan(weakMetrics.score);
    expect(weakMetrics.cantileverPenalty).toBeGreaterThan(0);
  });

  it('derives a support DAG and emits dependencies before dependants', () => {
    const top = placement(3, { x: 0, y: 0, z: 2, width: 4, depth: 4 });
    const left = placement(2, { x: 2, y: 0, z: 1, width: 2, depth: 4 });
    const base = placement(1, { x: 0, y: 0, z: 0, width: 4, depth: 4 });
    const right = placement(4, { x: 0, y: 0, z: 1, width: 2, depth: 4 });
    const shuffled = [top, left, base, right];
    const dag = deriveSupportDependencyDag(shuffled);
    const instructions = createAssemblyInstructions(shuffled);
    const index = new Map(
      instructions.placements.map((item, itemIndex) => [item.placementId, itemIndex]),
    );

    expect(dag.find((item) => item.placementId === 3)?.dependsOn).toEqual([2, 4]);
    for (const dependency of instructions.dependencies) {
      for (const parent of dependency.dependsOn) {
        expect(index.get(parent)).toBeLessThan(index.get(dependency.placementId)!);
      }
    }
    expect(instructions.warnings).not.toContain(
      'The support graph was cyclic; instruction ordering is incomplete.',
    );
  });
});

describe('LDraw emission', () => {
  it('uses 20 LDU studs, 8 LDU plates, legal transforms and STEP boundaries', () => {
    const text = emitLDraw([
      placement(1, { x: 1, y: 2, z: 0, width: 2, depth: 4, step: 1 }),
      placement(2, {
        partNum: '3023',
        x: 3,
        y: 1,
        z: 1,
        width: 2,
        depth: 1,
        rotation: 90,
        step: 2,
      }),
    ], 'Plate coordinate test');
    const partLines = text.split('\n').filter((line) => line.startsWith('1 '));

    expect(partLines[0]).toBe('1 4 40 0 80 1 0 0 0 1 0 0 0 1 3020.dat');
    expect(partLines[1]).toBe('1 4 80 -8 30 0 0 1 0 1 0 -1 0 0 3023.dat');
    expect(text.match(/^0 STEP$/gm)).toHaveLength(1);
    expect(text.indexOf('0 STEP')).toBeGreaterThan(text.indexOf(partLines[0]));
    expect(text.indexOf('0 STEP')).toBeLessThan(text.indexOf(partLines[1]));
  });
});
