import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { planBuildCandidatesFromInventory } from '../../planner';
import { createFallbackBuildBrief } from '../brief';
import { GOLDEN_BUILD_PROMPTS } from '../golden';
import { loadReferenceCorpus } from '../retrieval';
import {
  assertInventoryAndGeometry,
  planSignature,
  REALISTIC_INVENTORY,
  sourceSimilarity,
} from './fixtures';

const plansByCategory = new Map<string, Awaited<ReturnType<typeof planBuildCandidatesFromInventory>>[number]>();

describe('fixed-seed golden build prompts', () => {
  it.each(GOLDEN_BUILD_PROMPTS)(
    '%s produces a legal, useful, original build',
    async (category, prompt) => {
      const brief = {
        ...createFallbackBuildBrief(prompt),
        category,
        partBudget: { min: 10, max: 32 },
        seed: 0x5eed0000 + GOLDEN_BUILD_PROMPTS.findIndex((item) => item[0] === category),
      };
      const started = performance.now();
      const plans = await planBuildCandidatesFromInventory(
        REALISTIC_INVENTORY,
        prompt,
        0.72,
        14,
        brief,
      );
      const elapsed = performance.now() - started;
      const plan = plans[0];
      plansByCategory.set(category, plan);

      // The search has a deterministic expansion cap; allow CI contention
      // without turning this into a flaky wall-clock micro-benchmark.
      expect(elapsed).toBeLessThan(10_000);
      expect(plan.steps.length).toBeGreaterThanOrEqual(15);
      assertInventoryAndGeometry(plan.steps);
      expect(plan.diagnostics.components).toBe(1);
      expect(plan.diagnostics.stability).toBeGreaterThanOrEqual(30);
      expect(plan.diagnostics.prefixStability).toBeGreaterThanOrEqual(25);
      expect(plan.diagnostics.semanticApproximation).not.toBeNull();
      expect(plan.diagnostics.semanticApproximation ?? 0).toBeGreaterThanOrEqual(50);
      expect(plan.diagnostics.featureApproximation ?? 0).toBeGreaterThanOrEqual(80);
      expect(plan.sources.length).toBeGreaterThan(0);
      expect(plan.ldrawText.match(/^1 /gm)).toHaveLength(plan.steps.length);
      expect(plan.ldrawText.match(/^0 STEP$/gm) ?? [])
        .toHaveLength(Math.max(0, plan.assemblySteps.length - 1));

      const corpusById = new Map(
        loadReferenceCorpus().entries.map((entry) => [entry.id, entry]),
      );
      for (const source of plan.sources) {
        const entry = corpusById.get(source.id);
        expect(entry).toBeDefined();
        expect(entry?.nearDuplicateCheck?.passed).toBe(true);
        expect(entry?.nearDuplicateCheck?.nearestSimilarity)
          .toBeLessThan(entry?.nearDuplicateCheck?.rejectionThreshold ?? 0);
        expect(sourceSimilarity(plan, entry!)).toBeLessThan(0.92);
      }
    },
  );

  it('keeps category geometry and feature-part signatures distinct', () => {
    expect(plansByCategory.size).toBe(GOLDEN_BUILD_PROMPTS.length);
    const geometrySignatures = [...plansByCategory.values()].map((plan) =>
      plan.steps
        .map((step) =>
          `${step.x}:${step.y}:${step.z}:${step.width}:${step.depth}:${step.height}`,
        )
        .sort()
        .join('|'),
    );
    expect(new Set(geometrySignatures).size).toBe(GOLDEN_BUILD_PROMPTS.length);

    expect(plansByCategory.get('vehicle')?.steps.some((step) =>
      ['55982', '6014'].includes(step.partNum),
    )).toBe(true);
    expect(plansByCategory.get('forklift')?.steps.some((step) =>
      ['55982', '6014'].includes(step.partNum),
    )).toBe(true);
    for (const category of ['spacecraft', 'aircraft', 'building', 'castle', 'tower']) {
      expect(plansByCategory.get(category)?.steps.some((step) =>
        ['3065', '60592', '62360'].includes(step.partNum),
      )).toBe(true);
    }
    expect(new Set([...plansByCategory.values()].map(planSignature)).size)
      .toBe(GOLDEN_BUILD_PROMPTS.length);
  });
});
