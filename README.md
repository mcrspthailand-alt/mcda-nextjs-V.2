# MCDA Next.js V.2

Next.js migration of the MCDA **v26 Dynamic Selected-Model PDF Export** application.

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

## v26 behavior preserved

- Purpose-grouped multi-model selection
- Comparative ranking and complexity-ordered Rank Movement
- Complexity-ordered Sensitivity tables
- Grayscale Sensitivity trajectories with fullscreen controls
- 500–1000 word narrative interpretation
- Excel import/export and CSV export
- **Dynamic PDF export that follows the selected models**
  - SAW selected → SAW result + SAW Sensitivity in PDF
  - SAW + TOPSIS selected → both models in PDF
  - SAW + TOPSIS + VIKOR selected → all three models in PDF
  - the same behavior applies to all 13 supported models

## Architecture

- `app/` — Next.js App Router and global styles
- `components/McdaApp.tsx` — client bootstrap
- `lib/mcdaMarkup.ts` — migrated v26 dashboard markup
- `public/mcda-loader.js` — loads the compressed browser engine
- `public/engine-data/part-*.txt` — gzip/base64 chunks of the v26 calculation/report engine
- `public/mcda-logo.svg` — logo asset

The browser engine is intentionally isolated from the React shell to preserve numerical and report parity with the verified single-file v26 implementation while allowing gradual refactoring into TypeScript modules later.

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

## Docker / Easypanel

```bash
docker build -t mcda-nextjs-v2 .
docker run --rm -p 3000:3000 mcda-nextjs-v2
```

Health endpoint: `/api/health`
