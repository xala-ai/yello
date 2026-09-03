import { describe, expect, it } from 'vitest';
import {
  createFallbackBuildBrief,
  parseBuildBrief,
  validateBuildBrief,
} from '../brief';

describe('BuildBrief parsing and validation', () => {
  it('deterministically extracts category, scale, budget, features, palette and symmetry', () => {
    const prompt = 'A tiny symmetrical red and blue helicopter with a transparent canopy, wings and tail, 18 parts';
    const first = createFallbackBuildBrief(prompt);
    const second = createFallbackBuildBrief(prompt);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      category: 'aircraft',
      scale: { name: 'micro' },
      partBudget: { min: 14, max: 22 },
      symmetry: 'bilateral',
      palette: { colors: ['blue', 'red'], allowTransparent: true },
    });
    expect(first.requiredFeatures).toEqual(
      expect.arrayContaining(['wings', 'tail', 'transparent-canopy']),
    );
    expect(validateBuildBrief(first)).toBe(true);
  });

  it('accepts direct, wrapped, fenced and embedded valid JSON', () => {
    const brief = createFallbackBuildBrief('a small yellow forklift');
    for (const input of [
      brief,
      { brief },
      { buildBrief: brief },
      `\`\`\`json\n${JSON.stringify(brief)}\n\`\`\``,
      `Model output:\n${JSON.stringify({ brief })}\nDone.`,
    ]) {
      expect(parseBuildBrief(input, 'fallback')).toEqual(brief);
    }
  });

  it('rejects malformed ranges and falls back to prompt parsing', () => {
    const valid = createFallbackBuildBrief('a bridge');
    expect(validateBuildBrief({ ...valid, partBudget: { min: 20, max: 10 } })).toBe(false);
    expect(validateBuildBrief({ ...valid, seed: -1 })).toBe(false);
    expect(validateBuildBrief({ ...valid, category: 'spaceship' })).toBe(false);

    const parsed = parseBuildBrief('```json\n{"category":"vehicle"}\n```', 'a tall castle');
    expect(parsed.category).toBe('castle');
    expect(parsed.proportions.height).toBe(1);
  });
});
