## YelloBricks

Mix owned LEGO sets → Smart Mix / Cross Mix / AI builds with tiered matching and step instructions.

Live: https://yellobricks.xala.ai · Repo: `xala-ai/yello`

### Features
- **Garage** — add sets / CSV import (Brickset/BrickLink)
- **Smart Mix** — T1/T2/T3 match tiers, fidelity↔rigidity scoring, age auto-tune, novelty “best to buy”
- **Cross Mix** — useful combinations of 2–3 owned sets
- **AI Builds** — inventory-constrained planner + OpenRouter naming; 3D step viewer
- **Auth** — Google, email/password, kids 2-word passphrase; Save/Load garage

### Setup

```bash
cd yello
npm install
cp .env.example .env.local   # fill keys
npm run dev
```

See `SYSTEM_ARCH.md` for architecture and Netlify env vars.

OpenRouter project key (local agents): `~/.config/agent-secrets/yellobricks.env` — never commit.
