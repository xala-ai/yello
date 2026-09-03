# YelloBricks System Architecture

## Overview
YelloBricks (`yellobricks.xala.ai`) is a Next.js app that turns owned LEGO sets into:
1. **Smart Mix** recommendations (official sets you can almost build)
2. **Cross Mix** combinations of owned sets
3. **AI Builds** — novel builds from your inventory with step instructions

Deployed on **Netlify** (Next.js runtime). Source: `xala-ai/yello`.

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
| T1 | Exact part + exact color |
| T2 | Exact part, any color |
| T3 | Structural substitution (e.g. 2×6 ← two 2×3) with rigidity penalty |

Composite score blends **fidelity** and **rigidity** via `fidelityWeight` (auto from age).

## Key modules
| Path | Role |
|------|------|
| `src/lib/inventory.ts` | Aggregate + tiered buildability + novelty |
| `src/lib/structural.ts` | Geometry + substitution rules |
| `src/lib/planner.ts` | Inventory-constrained local build planner |
| `src/lib/crossmix.ts` | 2–3 set combination discovery |
| `src/lib/auth.ts` / `user-store.ts` | Auth + `.data/users.json` persistence |
| `src/app/actions.ts` | Rebrickable + hybrid AI generate |
| `src/components/InstructionViewer.tsx` | Step-by-step 3D instructions |

## Env (Netlify / local)
```
REBRICKABLE_API_KEY=
OPENROUTER_API_KEY=          # project key (see agent-secrets/yellobricks.env)
AI_BUILD_MODEL=anthropic/claude-opus-4.6
AUTH_SECRET=
NEXTAUTH_URL=https://yellobricks.xala.ai
GOOGLE_CLIENT_ID=            # optional
GOOGLE_CLIENT_SECRET=        # optional
PREBETA_APPS_SCRIPT_WEBHOOK_URL=
NEXT_PUBLIC_PREBETA_GATE_DISABLED=false
```

## Auth notes
- Adults: email+password or Google
- Kids: `word.word` (each word exactly 5 letters); no typed password
- Garage sync: Save/Load on home when signed in (server `.data/` — for durable prod, swap to Postgres/Blobs)

## Data flow
Garage → master bin → Smart Mix / Cross Mix / AI planner → scores + instructions
