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

- `app/` — Next.js App Router entry points and global styles.
- `components/McdaApp.tsx` — client-side application bootstrap.
- `lib/mcdaMarkup.ts` — migrated dashboard markup.
- `public/mcda-engine.js` — the v25 MCDA calculation/rendering engine, isolated from the React shell to preserve numerical/UI parity during migration.
- `public/mcda-logo.png` — extracted logo asset (no large base64 image embedded in the page).

This is an incremental migration: Next.js owns the application shell and dependency loading, while the verified v25 computational engine remains isolated as browser JavaScript. That keeps the existing formulas and results intact and provides a clean path to progressively move individual modules to React components/hooks later.

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
