#!/usr/bin/env node
// Convert PLATEAU building 3D Tiles (b3dm, LOD1/LOD2) around a point into a
// compact city JSON that the viewer loads: one triangle mesh per building in
// local metres (x = east, y = up, z = south), plus id / height / usage.
//
//   node tools/plateau-to-city.mjs \
//     --tileset https://assets.cms.plateau.reearth.io/.../tileset.json \
//     [--tileset <another ward's tileset.json>] \
//     --lat 35.6717 --lon 139.7640 --width 400 --depth 300 \
//     --name ginza --out public/data/ginza.city.json
//
// Find a tileset URL for a city with the PLATEAU data catalog:
//   https://api.plateau.reearth.io/datacatalog/plateau-datasets
// (entries with "type_en": "bldg" and "format": "3D Tiles").

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { decodeB3dm } from './lib/b3dm.mjs';
import { makeEnuFrame, regionIntersects } from './lib/geo.mjs';

const { values: a } = parseArgs({
  options: {
    tileset: { type: 'string', multiple: true },
    lat: { type: 'string' },
    lon: { type: 'string' },
    width: { type: 'string', default: '400' },
    depth: { type: 'string', default: '300' },
    name: { type: 'string', default: 'city' },
    out: { type: 'string' },
    cache: { type: 'string', default: '.cache/tiles' },
    attribution: { type: 'string', default: '' },
    'keep-terrain': { type: 'boolean', default: false },
  },
});

if (!a.tileset?.length || !a.lat || !a.lon || !a.out) {
  console.error('usage: plateau-to-city.mjs --tileset <url|path> --lat <deg> --lon <deg> [--width 400 --depth 300] --out <file>');
  process.exit(2);
}

const lat = Number(a.lat), lon = Number(a.lon);
const width = Number(a.width), depth = Number(a.depth);
const enu = makeEnuFrame(lat, lon);

// crop rectangle in radians (small-area approximation is fine for <= a few km)
const mPerDegLat = 111320, mPerDegLon = 111320 * Math.cos(lat * Math.PI / 180);
const rad = Math.PI / 180;
const crop = {
  west: (lon - width / 2 / mPerDegLon) * rad, east: (lon + width / 2 / mPerDegLon) * rad,
  south: (lat - depth / 2 / mPerDegLat) * rad, north: (lat + depth / 2 / mPerDegLat) * rad,
};

async function load(uri) {
  if (/^https?:/.test(uri)) {
    const key = path.join(a.cache, Buffer.from(uri).toString('base64url').slice(-120));
    try { return await fs.readFile(key); } catch {}
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`${res.status} ${uri}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.mkdir(a.cache, { recursive: true });
    await fs.writeFile(key, buf);
    return buf;
  }
  return fs.readFile(uri);
}
const resolve = (base, rel) => /^https?:/.test(base) ? new URL(rel, base).href : path.join(path.dirname(base), rel);

// Collect the finest tiles (leaves) whose region touches the crop. PLATEAU
// building tilesets use REPLACE refinement, so leaves hold every building once.
const leaves = [];
async function walk(node, baseUri) {
  const bv = node.boundingVolume?.region;
  if (bv && !regionIntersects(bv, crop)) return;
  const kids = node.children || [];
  if (kids.length) { for (const k of kids) await walk(k, baseUri); return; }
  const uri = node.content?.uri || node.content?.url;
  if (!uri) return;
  const full = resolve(baseUri, uri);
  if (full.endsWith('.json')) {
    const sub = JSON.parse(await load(full));
    await walk(sub.root, full);
  } else leaves.push(full);
}

// --tileset may be given more than once (e.g. two wards that meet in the crop)
for (const tilesetUri of a.tileset) {
  const tileset = JSON.parse(await load(tilesetUri));
  await walk(tileset.root, tilesetUri);
}
console.error(`tiles in range: ${leaves.length}`);

const buildings = new Map();
for (const uri of leaves) {
  if (!uri.endsWith('.b3dm')) { console.error(`skip (not b3dm): ${uri}`); continue; }
  const tile = await decodeB3dm(await load(uri));
  for (const f of tile.features) {
    // ECEF -> local ENU metres; three.js frame: x = east, y = up, z = -north
    const n = f.positions.length / 3;
    const pos = new Float64Array(n * 3);
    let cx = 0, cz = 0, minY = Infinity;
    for (let i = 0; i < n; i++) {
      const [e, nn, u] = enu.fromEcef(f.positions[i * 3], f.positions[i * 3 + 1], f.positions[i * 3 + 2]);
      pos[i * 3] = e; pos[i * 3 + 1] = u; pos[i * 3 + 2] = -nn;
      cx += e; cz += -nn; if (u < minY) minY = u;
    }
    cx /= n; cz /= n;
    if (Math.abs(cx) > width / 2 || Math.abs(cz) > depth / 2) continue;
    const id = f.props.buildingId || f.props.gmlId || `b${buildings.size}`;
    if (buildings.has(id)) continue; // same building split across tiles: keep first
    buildings.set(id, { id, pos, idx: f.indices, minY, props: f.props });
  }
}

// Put every building on a flat ground at y = 0 unless asked to keep terrain.
let ground = 0;
if (a['keep-terrain']) {
  const mins = [...buildings.values()].map(b => b.minY).sort((x, y) => x - y);
  ground = mins[Math.floor(mins.length / 2)] || 0;
}

const out = {
  format: 'plateau-city-viewer/city@1',
  name: a.name,
  center: [lat, lon],
  size: [width, depth],
  units: 'decimetres (integer) in positions; x=east y=up z=south',
  attribution: a.attribution || 'Source: MLIT Project PLATEAU 3D city model (processed). https://www.mlit.go.jp/plateau/',
  source: a.tileset,
  buildings: [],
};

for (const b of buildings.values()) {
  const base = a['keep-terrain'] ? ground : b.minY;
  // weld identical vertices after quantising to 1 dm
  const map = new Map(); const q = []; const idx = [];
  const remap = new Int32Array(b.pos.length / 3);
  for (let i = 0; i < remap.length; i++) {
    const x = Math.round(b.pos[i * 3] * 10), y = Math.round((b.pos[i * 3 + 1] - base) * 10), z = Math.round(b.pos[i * 3 + 2] * 10);
    const k = `${x},${y},${z}`;
    let j = map.get(k);
    if (j === undefined) { j = q.length / 3; map.set(k, j); q.push(x, y, z); }
    remap[i] = j;
  }
  for (let i = 0; i < b.idx.length; i += 3) {
    const i0 = remap[b.idx[i]], i1 = remap[b.idx[i + 1]], i2 = remap[b.idx[i + 2]];
    if (i0 === i1 || i1 === i2 || i0 === i2) continue;
    idx.push(i0, i1, i2);
  }
  if (!idx.length) continue;
  out.buildings.push({
    id: b.id,
    h: b.props.measuredHeight ?? null,
    usage: b.props.usage ?? null,
    name: b.props.name ?? null,
    p: q,
    i: idx,
  });
}

await fs.mkdir(path.dirname(a.out), { recursive: true });
await fs.writeFile(a.out, JSON.stringify(out));
const st = await fs.stat(a.out);
console.error(`wrote ${out.buildings.length} buildings -> ${a.out} (${(st.size / 1024).toFixed(0)} KiB)`);
