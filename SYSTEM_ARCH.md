# YelloBricks System Architecture

## Overview
YelloBricks (`yellobricks.xala.ai`) is a Next.js app that turns owned LEGO sets into:
1. **Standard Alternates** from selected sets, with semantic search
2. **Smart Mix** recommendations across official sets and Rebrickable alternates
3. **Cross Mix** combinations of owned sets
4. **AI Builds** — three inventory-constrained candidates with LDraw instructions

Deployed on **Netlify** (OpenNext adapter, auto-applied — do not pin `@netlify/plugin-nextjs`). Source: `xala-ai/yello`.

## Stack
- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4
- Zustand (local garage) + optional cloud sync when signed in
- Auth.js (`next-auth@beta`): Google OAuth, email/password, kid 2-word passphrase
- Rebrickable API for set/inventory data
- OpenRouter for schema-validated build briefs and lightweight search classification
- `@react-three/fiber` instruction viewer for AI builds

## Matching tiers
| Tier | Meaning |
|------|---------|
| Exact | Same brick + same colour |
| Shape only | Same brick, any colour |
| Brick swap | Different bricks covering the same space (e.g. 2×6 ← two 2×3s; Duplo↔System bricks) |

Duplo sets are Brain-tagged `duplo`. Mixing Duplo + System selection prompts an “out of this world” confirm before Find Builds.

Composite score blends **fidelity** and **rigidity** via `fidelityWeight` (auto from age).

## Key modules
| Path | Role |
|------|------|
| `src/lib/inventory.ts` | Aggregate + tiered buildability + novelty |
| `src/lib/structural.ts` | Geometry + substitution rules |
| `src/lib/planner.ts` | Candidate orchestration, diagnostics, attribution and compatibility API |
| `src/lib/brickgpt/brief.ts` | Validated semantic build brief + deterministic fallback |
| `src/lib/brickgpt/retrieval.ts` | Licensed reference retrieval and inventory compatibility |
| `src/lib/brickgpt/motifs.ts` | Category-specific semantic targets and reusable motifs |
| `src/lib/brickgpt/vocabulary.ts` | Curated brick, plate, tile, slope, wheel and Technic metadata |
| `src/lib/brickgpt/grid.ts` | Plate-unit occupancy, collision, rollback and connection graph |
| `src/lib/brickgpt/stability.ts` | Support, centre-of-mass, seams and prefix stability |
| `src/lib/brickgpt/sequencer.ts` | Deterministic inventory-constrained beam search |
| `src/lib/brickgpt/instructions.ts` | Support DAG and coherent dependency-ordered steps |
| `src/lib/brickgpt/ldraw-emit.ts` | Plate-unit placements → LDraw transforms and `0 STEP` |
| `src/lib/brickgpt/data/` | Generated licensed reference corpus |
| `tools/brick-corpus/` | Offline deterministic corpus compiler and attribution |
| `src/store/garage.ts` | Garage state, semantic search, Smart Mix and AI candidate state |
| `src/lib/auth.ts` / `user-store.ts` | Auth + `.data/users.json` persistence |
| `src/app/actions.ts` | Rebrickable, OpenRouter semantic filtering and AI generation |
| `src/components/InstructionViewer.tsx` | Stable data-URL adapter with metrics and attribution |
| `src/hooks/useLDraw.ts` + `LegoViewer` | Real LDraw render (Three.js `LDrawLoader`) |
| `public/ldraw/` | Colour table + packed sample `.mpd` models |
| `src/lib/ldraw-config.ts` | Parts CDN path + sample catalog |

### LDraw 3D pipeline
- **Packed models** (`.mpd` with embedded parts) load from `/ldraw/samples/` — no network parts fetch.
- **Loose models / single parts** resolve via `setPartsLibraryPath` → jsDelivr mirror of the LDraw complete library (`gkjohnson/ldraw-parts-library`). Full `complete.zip` is too large to ship in-repo; CDN is the interim “all parts” source.
- Materials from `/ldraw/colors/ldcfgalt.ldr`. Building steps use `userData.buildingStep` / `numBuildingSteps`.

### AI Builds: BrickGPT-lite
- Netlify does not host BrickGPT model weights or Gurobi. OpenRouter converts a prompt into a strict semantic brief; it never supplies unchecked brick coordinates.
- The local deterministic engine retrieves licensed references, composes category motifs, then runs bounded beam search against the selected garage inventory.
- Geometry uses stud X/Y coordinates and plate-height Z units. The vocabulary covers common bricks, plates, tiles, slopes, windows, wheels, axles and Technic connectors.
- Every candidate is checked for inventory conservation, collision, legal support, connectivity, semantic coverage, symmetry, colour coherence, seam staggering and prefix stability.
- Generation returns up to three distinct candidates with quality diagnostics and source attribution.
- The support graph is topologically ordered into coherent assembly steps. LDraw output uses 20 LDU per stud, 8 LDU per plate and real `0 STEP` boundaries.
- The instruction viewer exposes each step, warnings, dependency information, stability metrics and licensed reference sources.

### Reference corpus and rights
- `node tools/brick-corpus/compile.mjs` deterministically compiles the bundled, header-verified CCAL LDraw models and independently authored CC0 motifs.
- The generated artifact records provenance, licenses, source hashes, occupancy fingerprints and near-duplicate checks.
- Rebrickable MOC inventories and files are not collected. StableText2Brick is excluded from production data because its upstream commercial rights are not cleared.
- Approximate set/MOC builds use only the selected garage as stock and the public name as semantic inspiration. Source instructions and restricted MOC geometry are not reproduced.

### Semantic search
- The global build search remains on **Standard Alternates** when submitted there.
- Standard Alternates fetches Rebrickable alternates for selected sets, then a small OpenRouter classifier keeps direct and closely related object names.
- Switching to **Smart Mix** preserves the same query and applies one semantic classification pass across both official LEGO and Rebrickable candidates before expensive inventory matching.
- Candidate IDs are validated locally. A deterministic synonym fallback handles unavailable, malformed or over-broad model responses.

### Quality gates
```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run corpus:check
```

Vitest covers brief parsing, corpus provenance, duplicate safeguards, geometry, inventory conservation, deterministic search, diversity, stability, instruction dependencies, LDraw transforms and golden prompts. In development, `/dev/brickgpt-gallery` renders fixed-seed golden outputs; it returns 404 in production.

## Env (Netlify / local)
```
REBRICKABLE_API_KEY=          # server-only; never NEXT_PUBLIC_ (leaks to the browser)
OPENROUTER_API_KEY=          # project key (see agent-secrets/yellobricks.env)
AI_BUILD_MODEL=anthropic/claude-opus-4.6
SEARCH_FILTER_MODEL=openai/gpt-4o-mini
AUTH_SECRET=
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://yellobricks.xala.ai
GOOGLE_CLIENT_ID=            # optional
GOOGLE_CLIENT_SECRET=        # optional
PREBETA_APPS_SCRIPT_WEBHOOK_URL=
NEXT_PUBLIC_PREBETA_GATE_DISABLED=false
```

**Agent Netlify API access (host machine):** `~/.config/agent-secrets/netlify.env` → `NETLIFY_AUTH_TOKEN` (personal access token, ~90-day expiry ≈ 2026-12-02). Used to manage site/env via Netlify API — not a site env var itself. See OB `System/Development Tools.md` → Netlify.
## Auth notes
- Adults: email+password or Google
- Kids: `word.word` (each word at least 4 letters); no typed password
- Garage sync: Save/Load on home when signed in (server `.data/` — for durable prod, swap to Postgres/Blobs)

## Data flow
Search → Rebrickable metadata → OpenRouter semantic filter → inventory matching

Garage + prompt → validated semantic brief → licensed retrieval + motifs → bounded beam search → stable support DAG → LDraw STEP model → instruction viewer
