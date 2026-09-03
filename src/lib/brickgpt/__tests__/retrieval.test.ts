import corpusJson from '../data/reference-corpus.generated.json';
import { describe, expect, it } from 'vitest';
import { createFallbackBuildBrief } from '../brief';
import {
  loadReferenceCorpus,
  parseReferenceCorpus,
  retrieveReferences,
} from '../retrieval';
import { REALISTIC_INVENTORY } from './fixtures';

describe('reference corpus validation and retrieval', () => {
  it('validates the generated corpus, provenance, licenses and duplicate guard', () => {
    const corpus = parseReferenceCorpus(corpusJson);
    const raw = corpusJson as typeof corpusJson & {
      checks: {
        nearDuplicates: {
          maximumSimilarity: number;
          rejectionThreshold: number;
          passed: boolean;
          pairsChecked: number;
        };
      };
    };

    expect(corpus.entries.length).toBeGreaterThanOrEqual(8);
    expect(new Set(corpus.entries.map((entry) => entry.id)).size).toBe(corpus.entries.length);
    expect(raw.checks.nearDuplicates.passed).toBe(true);
    expect(raw.checks.nearDuplicates.pairsChecked).toBeGreaterThan(0);
    expect(raw.checks.nearDuplicates.maximumSimilarity)
      .toBeLessThan(raw.checks.nearDuplicates.rejectionThreshold);

    for (const entry of corpus.entries) {
      expect(entry.occupancy.cellCount).toBe(entry.occupancy.cells.length);
      expect(entry.provenance.author).not.toHaveLength(0);
      expect(entry.provenance.sourcePath).not.toHaveLength(0);
      expect(entry.provenance.derivation).not.toHaveLength(0);
      expect(entry.license.id).toMatch(/^(CCAL-2\.0|CC0-1\.0)$/);
      expect(entry.fingerprints.occupancySha256).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.nearDuplicateCheck?.passed).toBe(true);
      expect(entry.nearDuplicateCheck?.nearestSimilarity)
        .toBeLessThan(entry.nearDuplicateCheck?.rejectionThreshold ?? 0);
    }
  });

  it('rejects invalid headers and entries', () => {
    expect(() => parseReferenceCorpus({ entries: [] })).toThrow(/header/);
    const invalid = structuredClone(corpusJson);
    invalid.entries[0].occupancy.cellCount++;
    expect(() => parseReferenceCorpus(invalid)).toThrow(/entry/);
  });

  it('retrieves deterministic category matches with inventory and attribution', () => {
    const brief = createFallbackBuildBrief('a yellow forklift with wheels, forks, mast and cab');
    const inventory = REALISTIC_INVENTORY.map(({ partNum, qty }) => ({ partNum, qty }));
    const first = retrieveReferences(brief, { limit: 4, inventory });
    const second = retrieveReferences(brief, { limit: 4, inventory }, loadReferenceCorpus());

    expect(first).toEqual(second);
    expect(first).toHaveLength(4);
    expect(first[0].score).toBeGreaterThanOrEqual(first[1].score);
    expect(first.some((result) =>
      result.matchedTags.includes('vehicle') || result.matchedTags.includes('chassis'),
    )).toBe(true);
    for (const result of first) {
      expect(result.provenance).toEqual(result.entry.provenance);
      expect(result.license).toEqual(result.entry.license);
      expect(result.inventoryCompatibility).toBeGreaterThanOrEqual(0);
      expect(result.inventoryCompatibility).toBeLessThanOrEqual(1);
    }
  });
});
