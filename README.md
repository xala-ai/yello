## YelloBricks

Mix owned LEGO sets → Smart Mix / Cross Mix / AI builds with tiered matching and step instructions.

Live: https://yellobricks.xala.ai · Repo: `xala-ai/yello`

### Features
- **Garage** — add sets / CSV import (Brickset/BrickLink)
- **Standard Alternates** — Rebrickable alternates for selected sets with OpenRouter semantic filtering
- **Smart Mix** — semantically filtered official LEGO + Rebrickable candidates, tiered brick matching, fidelity↔rigidity scoring and source toggles
- **Cross Mix** — useful combinations of 2–3 owned sets
- **AI Builds** — up to three licensed-reference, motif-guided, inventory-constrained builds with stability diagnostics and real LDraw steps
- **Inspired builds** — original name-inspired models using selected garage stock; restricted MOC files and inventories are not fetched
- **Auth** — Google, email/password, kids 2-word passphrase; Save/Load garage

### Setup

```bash
cd yello
npm install
cp .env.example .env.local   # fill keys
npm run dev
```

### Verification

```bash
npm test
npm run lint
npm run typecheck
npm run corpus:check
npm run build
```

The development-only golden gallery is available at `/dev/brickgpt-gallery`.

See `SYSTEM_ARCH.md` for architecture and Netlify env vars.

OpenRouter project key (local agents): `~/.config/agent-secrets/yellobricks.env` — never commit.
