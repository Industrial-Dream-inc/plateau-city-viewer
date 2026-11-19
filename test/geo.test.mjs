import test from 'node:test';
import assert from 'node:assert/strict';
import { geodeticToEcef, makeEnuFrame } from '../tools/lib/geo.mjs';

test('ENU: a point 100 m north and 50 m east comes back as (50, 100, ~0)', () => {
  const lat = 35.6717, lon = 139.764;
  const enu = makeEnuFrame(lat, lon);
  const dLat = 100 / 110940; // metres per degree of latitude near 35.7 N (approx.)
  const dLon = 50 / (111320 * Math.cos(lat * Math.PI / 180));
  const [e, n, u] = enu.fromEcef(...geodeticToEcef(lat + dLat, lon + dLon, 0));
  assert.ok(Math.abs(e - 50) < 0.5, `east ${e}`);
  assert.ok(Math.abs(n - 100) < 0.5, `north ${n}`);
  assert.ok(Math.abs(u) < 0.01, `up ${u}`);
});

test('ENU: height above the ellipsoid maps to up', () => {
  const enu = makeEnuFrame(35, 139);
  const [, , u] = enu.fromEcef(...geodeticToEcef(35, 139, 42));
  assert.ok(Math.abs(u - 42) < 1e-6);
});
