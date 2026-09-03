import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { createFallbackBuildBrief } from '../brief';
import {
  sequenceInventoryBuild,
  sequenceInventoryBuildCandidates,
} from '../sequencer';
import {
  planBuildCandidatesFromInventory,
  planBuildFromInventory,
} from '../../planner';
import {
  assertInventoryAndGeometry,
  planSignature,
  REALISTIC_INVENTORY,
} from './fixtures';

const SMALL_INVENTORY = REALISTIC_INVENTORY
  .filter((item) => [
    '3005', '3004', '3003', '3024', '3023', '3022', '3040b', '3039', '3065',
  ].includes(item.partNum))
  .map((item) => ({ ...item, qty: Math.min(item.qty, 4) }));

describe('bounded inventory-constrained search', () => {
  it('is deterministic, bounded, conservative and candidate-diverse', () => {
    const brief = {
      ...createFallbackBuildBrief('a micro red spacecraft with cockpit, wings and engines'),
      partBudget: { min: 6, max: 12 },
      seed: 42,
    };
    const started = performance.now();
    const first = sequenceInventoryBuildCandidates(
      SMALL_INVENTORY,
      'a micro red spacecraft with cockpit, wings and engines',
      12,
      0.7,
      brief,
    );
    const elapsed = performance.now() - started;
    const second = sequenceInventoryBuildCandidates(
      SMALL_INVENTORY,
      'a micro red spacecraft with cockpit, wings and engines',
      12,
      0.7,
      brief,
    );

    expect(elapsed).toBeLessThan(2_500);
    expect(first.length).toBeGreaterThanOrEqual(2);
    expect(first).toEqual(second);
    expect(new Set(first.map((candidate) =>
      candidate.placements.map((item) =>
        `${item.partNum}:${item.colorId}:${item.x}:${item.y}:${item.z}:${item.rotation}`,
      ).join('|'),
    )).size).toBe(first.length);

    for (const candidate of first) {
      const used = candidate.placements.length;
      expect(used + candidate.unusedInventoryCount).toBe(candidate.usableInventoryCount);
      expect(candidate.componentCount).toBe(1);
      expect(candidate.stability.score).toBeGreaterThan(0.25);
      expect(candidate.stability.prefixStability).toBeGreaterThan(0.25);
      assertInventoryAndGeometry(candidate.placements.map((item) => ({
        ...item,
        rot: item.rotation,
        dependsOn: [],
      })), SMALL_INVENTORY);
    }
  });

  it('keeps the original single-result sequencer and planner APIs compatible', async () => {
    const intent = 'a micro blue tower';
    const brief = {
      ...createFallbackBuildBrief(intent),
      partBudget: { min: 5, max: 10 },
      seed: 7,
    };
    const sequence = sequenceInventoryBuild(SMALL_INVENTORY, intent, 10, 0.5, brief);
    const plans = await planBuildCandidatesFromInventory(
      SMALL_INVENTORY,
      intent,
      0.5,
      10,
      brief,
    );
    const plan = await planBuildFromInventory(SMALL_INVENTORY, intent, 0.5, 10, brief);

    expect(sequence.placements.length).toBeGreaterThan(0);
    expect(plans.length).toBeGreaterThan(0);
    expect(plan).toEqual(plans[0]);
    expect(planSignature(plan)).not.toHaveLength(0);
    expect(plan.steps.every((step) => step.dependsOn?.every((id) =>
      plan.steps.some((candidate) => candidate.placementId === id),
    ))).toBe(true);
  });
});
