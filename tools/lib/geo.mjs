// Geodesy helpers: GRS80/WGS84 ellipsoid (identical to < 1 mm for this use).
const A = 6378137.0, F = 1 / 298.257222101, E2 = F * (2 - F);

export function geodeticToEcef(latDeg, lonDeg, h = 0) {
  const p = latDeg * Math.PI / 180, l = lonDeg * Math.PI / 180;
  const s = Math.sin(p), N = A / Math.sqrt(1 - E2 * s * s);
  return [(N + h) * Math.cos(p) * Math.cos(l), (N + h) * Math.cos(p) * Math.sin(l), (N * (1 - E2) + h) * s];
}

// Local east-north-up frame at a point. Fine for areas of a few kilometres.
export function makeEnuFrame(latDeg, lonDeg) {
  const p = latDeg * Math.PI / 180, l = lonDeg * Math.PI / 180;
  const sp = Math.sin(p), cp = Math.cos(p), sl = Math.sin(l), cl = Math.cos(l);
  const [ox, oy, oz] = geodeticToEcef(latDeg, lonDeg, 0);
  return {
    fromEcef(x, y, z) {
      const dx = x - ox, dy = y - oy, dz = z - oz;
      return [
        -sl * dx + cl * dy,
        -sp * cl * dx - sp * sl * dy + cp * dz,
        cp * cl * dx + cp * sl * dy + sp * dz,
      ];
    },
  };
}

// 3D Tiles region = [west, south, east, north, minH, maxH] in radians.
export function regionIntersects(r, c) {
  return !(r[2] < c.west || r[0] > c.east || r[3] < c.south || r[1] > c.north);
}
