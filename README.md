# MCDA Next.js V.2

Next.js migration of the MCDA v25 single-file application.

## Included analysis models

- SAW
- WPM
- Distance Target
- MOORA
- WASPAS
- ARAS
- COPRAS
- EDAS
- GRA
- TOPSIS
- VIKOR
- PROMETHEE II
- ELECTRE I

The application preserves the v25 behavior, including purpose-grouped model selection, comparative ranking, complexity-ordered Rank Movement, complexity-ordered Sensitivity tables, grayscale Sensitivity trajectories, fullscreen chart/table controls, narrative interpretation, Excel import/export, CSV exports and TOPSIS PDF reporting.

## Architecture

- `app/` — Next.js App Router entry points and modular global styles.
- `components/McdaApp.tsx` — client-side application bootstrap and SheetJS bridge.
- `lib/mcdaMarkup.ts` — migrated dashboard markup.
- `public/mcda-loader.js` — browser bootstrap for the verified v25 calculation/rendering engine.
- `public/engine-data/part-*.txt` — gzip/base64 static engine payload split into small repository-friendly chunks.
- `public/mcda-logo.svg` — lightweight logo asset.

This is an incremental migration: Next.js owns the application shell, routing, dependencies and styles, while the verified v25 computational engine is isolated behind a loader to preserve numerical/UI parity. This gives the project a clean path for progressively moving individual calculation and visualization modules into React components/hooks later without changing the existing results all at once.

The engine loader uses the browser `DecompressionStream` API, so a current Chrome, Edge, Firefox or Safari release is recommended.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production build

```bash
npm run build
npm start
```

## Docker

```bash
docker build -t mcda-nextjs-v2 .
docker run --rm -p 3000:3000 mcda-nextjs-v2
```
