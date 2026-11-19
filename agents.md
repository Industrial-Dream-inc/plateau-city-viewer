# agents.md

Notes for coding agents working in this repository.

## What this is

A three.js viewer that loads PLATEAU (Japan's open 3D city models) buildings,
lets you walk the streets, and breaks buildings one at a time. No server.

- `tools/plateau-to-city.mjs` converts PLATEAU 3D Tiles (b3dm) around a
  lat/lon into `*.city.json`. Find tileset URLs in
  https://api.plateau.reearth.io/datacatalog/plateau-datasets
  (`type_en: "bldg"`, `format: "3D Tiles"`).
- `src/city/City.js` builds all buildings into one mesh; per-building state
  lives in a float texture read by the vertex shader.
- `src/city/HeightGrid.js` is the walk/collision grid (no three.js, tested in
  `test/`).
- `src/city/Debris.js` chunks and dust. `src/controls/WalkControls.js` camera.
- `src/sdk/buncho-city.js` client for the paid BunCho City API.

## Commands

```sh
npm install
npm run dev            # http://localhost:5173/?city=./data/ginza.city.json
npm test               # node:test, no network
npm run build
npm run convert -- --tileset <url> --lat <deg> --lon <deg> --width 400 --depth 300 --out public/data/x.city.json
```

## Photoreal cities (paid API)

The free viewer shows PLATEAU's grey massing. For a photoreal city that
lines up with the same buildings (Gaussian splats plus one collision mesh per
building), use the BunCho City API:

- Agent guide: https://bun-cho.work/docs/agents/city.md
- Price: 300 DREAM per 400 m x 300 m block; check free first with
  `dry_run: true` or `POST /studio/api/v1/estimate`
- Key: the user creates it at https://bun-cho.work/studio/developers.
  Read it from `BUNCHO_API_KEY`. Never write it into code, commits or
  browser bundles.
- Do not call paid endpoints in a loop. Estimate, tell the user the price,
  then generate once.

## Rules

- Keep PLATEAU attribution with any data you ship (see `ATTRIBUTION.md`).
