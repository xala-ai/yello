## YelloBricks

YelloBricks is a Lego-inspired web app that takes the sets you own and suggests what else you can build.

### Key features
- **Garage**: add sets manually or import from Brickset/BrickLink CSV
- **Smart Mix**: suggests **official sets** you can build (or almost build) from a mixture of your selected sets
- **Intent search**: “I want to build a forklift/horse/castle” filters candidate sets
- **Pre-beta gate**: blocks access until email signup; forwards signups into your Google Sheet
- **3D viewer**: drag and drop `.ldr`/`.mpd` files to preview in 3D

## Setup

### 1) Install

```bash
cd /home/fd/Cursor/Lego Inspiration/brickmixer
npm install
```

### 2) Environment

Create `/home/fd/Cursor/Lego Inspiration/brickmixer/.env.local`:

```bash
REBRICKABLE_API_KEY="YOUR_REBRICKABLE_KEY"
PREBETA_APPS_SCRIPT_WEBHOOK_URL="YOUR_APPS_SCRIPT_WEBAPP_EXEC_URL"
NEXT_PUBLIC_PREBETA_GATE_DISABLED=false
```

Apps Script setup docs: `docs/google-sheets-prebeta.md`

### 3) Run

```bash
npm run dev
```

Open `http://localhost:3000`.

## Deploy (Vercel)

1. Push to GitHub (`xala-ai/yello`).
2. Import into Vercel.
3. Add env vars in Vercel:
   - `REBRICKABLE_API_KEY`
   - `PREBETA_APPS_SCRIPT_WEBHOOK_URL`
   - `NEXT_PUBLIC_PREBETA_GATE_DISABLED` (set to `false`)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
