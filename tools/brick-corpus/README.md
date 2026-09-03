# Brick reference corpus

This offline compiler creates the compact retrieval corpus used by BrickGPT. It reads only the LDraw sample MPDs already bundled in this repository and the generic cell motifs declared in `sources.mjs`. It performs no network requests.

Generate and verify the artifact:

```sh
node tools/brick-corpus/compile.mjs
node tools/brick-corpus/compile.mjs --check
```

The output is `src/lib/brickgpt/data/reference-corpus.generated.json`. Generation is deterministic for a fixed set of inputs.

## Rights and provenance

Each LDraw descriptor must match the model name, author, and model-level CCAL declaration embedded in its MPD. Compilation fails if that evidence changes or is absent. Each generated entry records the source path and SHA-256 digest, license metadata, semantic descriptors, normalized color-independent occupancy, and geometry fingerprints.

`car.ldr_Packed.mpd` is intentionally excluded because its root model does not contain an explicit model-level license declaration. Rebrickable MOCs, StableText2Brick, and other downloaded or scraped MOCs are not inputs.

The abstract motifs in `sources.mjs` were independently authored for this corpus and are released under CC0 1.0. They encode generic occupied cells rather than copied model geometry.

## Duplicate policy

The compiler computes exact occupancy fingerprints and fingerprints invariant to horizontal rotations and mirrors. It also compares every entry using maximum Jaccard similarity over those transforms and rejects a corpus pair at or above the recorded threshold. These color-independent checks are intended to support future output-distance checks against recognizable source shapes.

See `ATTRIBUTION.md` for redistribution notices.
