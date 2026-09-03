# YelloBricks System Architecture

## Overview
YelloBricks (`yellobricks.xala.ai`) is a Next.js app that turns owned LEGO sets into:
1. **Smart Mix** recommendations (official sets you can almost build)
2. **Cross Mix** combinations of owned sets
3. **AI Builds** — novel builds from your inventory with step instructions

Deployed on **Netlify** (OpenNext adapter, auto-applied — do not pin `@netlify/plugin-nextjs`). Source: `xala-ai/yello`.

## Stack
- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4
- Zustand (local garage) + optional cloud sync when signed in
- Auth.js (`next-auth@beta`): Google OAuth, email/password, kid 2-word passphrase
- Rebrickable API for set/inventory data
- OpenRouter for naming/enrichment (default `anthropic/claude-opus-4.6`)
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
| `src/lib/planner.ts` | BrickGPT-lite orchestration + scores + LDraw output |
| `src/lib/brickgpt/vocabulary.ts` | BrickGPT standard-brick vocabulary and LDraw IDs |
| `src/lib/brickgpt/grid.ts` | 20³ stud occupancy, collision, bounds and connectivity |
| `src/lib/brickgpt/sequencer.ts` | Inventory-constrained next-brick rejection loop |
| `src/lib/brickgpt/ldraw-emit.ts` | Placements → LDraw type-1 lines and `0 STEP` |
| `src/store/garage.ts` | Garage state; Smart Mix pulls Official + Rebrickable with source toggles |
| `src/lib/auth.ts` / `user-store.ts` | Auth + `.data/users.json` persistence |
| `src/app/actions.ts` | Rebrickable + hybrid AI generate |
| `src/components/InstructionViewer.tsx` | AI LDraw blob adapter with real-part instructions |
| `src/hooks/useLDraw.ts` + `LegoViewer` | Real LDraw render (Three.js `LDrawLoader`) |
| `public/ldraw/` | Colour table + packed sample `.mpd` models |
| `src/lib/ldraw-config.ts` | Parts CDN path + sample catalog |

### LDraw 3D pipeline
- **Packed models** (`.mpd` with embedded parts) load from `/ldraw/samples/` — no network parts fetch.
- **Loose models / single parts** resolve via `setPartsLibraryPath` → jsDelivr mirror of the LDraw complete library (`gkjohnson/ldraw-parts-library`). Full `complete.zip` is too large to ship in-repo; CDN is the interim “all parts” source.
- Materials from `/ldraw/colors/ldcfgalt.ldr`. Building steps use `userData.buildingStep` / `numBuildingSteps`.

### AI Builds: BrickGPT-lite
- Netlify does not host the BrickGPT Llama weights or Gurobi. The serverless planner ports BrickGPT's constrained generation loop instead: standard-brick vocabulary, 20³ stud grid, bounds/collision rejection, inventory depletion and connectivity-based stability.
- Supported v1 geometry: standard `1×1`, `1×2`, `1×4`, `1×6`, `1×8`, `2×2`, `2×4`, and `2×6` bricks, including 90° rotations. Exotic parts and Duplo are not placed.
- Prompt intent selects a target silhouette. The sequencer greedily tries the largest available garage brick, rejects invalid candidates, and falls back to smaller/oriented bricks.
- Output is a real `.ldr` model with `0 STEP` layers. `InstructionViewer` creates a browser blob URL and passes it to the same `LDrawLoader` pipeline as the explorer.
- OpenRouter only enriches the generated name and description; it does not supply unvalidated coordinates.

## Env (Netlify / local)
```
REBRICKABLE_API_KEY=          # server-only; never NEXT_PUBLIC_ (leaks to the browser)
OPENROUTER_API_KEY=          # project key (see agent-secrets/yellobricks.env)
AI_BUILD_MODEL=anthropic/claude-opus-4.6
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
Garage → master bin → Smart Mix / Cross Mix / BrickGPT-lite → validated placements → LDraw STEP model → instructions
