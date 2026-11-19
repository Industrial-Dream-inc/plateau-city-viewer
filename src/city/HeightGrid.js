// A 2D grid over the city that stores, per cell, which building stands there
// and how high its roof is. Walking, standing on roofs and "is this spot free"
// all read from it. Breaking a building clears its cells.
//
// No three.js dependency, so it also runs in Node tests.

export class HeightGrid {
  /**
   * @param {number} width  metres along x
   * @param {number} depth  metres along z
   * @param {number} cell   metres per cell
   */
  constructor(width, depth, cell = 1) {
    this.cell = cell;
    this.nx = Math.ceil(width / cell);
    this.nz = Math.ceil(depth / cell);
    this.x0 = -width / 2;
    this.z0 = -depth / 2;
    this.owner = new Int32Array(this.nx * this.nz).fill(-1);
    this.height = new Float32Array(this.nx * this.nz);
    this.cellsOf = new Map(); // building id (index) -> cell indices
  }

  index(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), k = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) return -1;
    return k * this.nx + i;
  }

  /** Rasterise the top-down projection of a building's triangles. */
  addBuilding(bid, positions, indices) {
    const cells = this.cellsOf.get(bid) || [];
    const c = this.cell;
    for (let t = 0; t < indices.length; t += 3) {
      const a = indices[t] * 3, b = indices[t + 1] * 3, d = indices[t + 2] * 3;
      const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
      const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
      const dx = positions[d], dy = positions[d + 1], dz = positions[d + 2];
      const area = (bx - ax) * (dz - az) - (dx - ax) * (bz - az);
      if (Math.abs(area) < 1e-6) continue; // vertical wall: no footprint
      const minI = Math.max(0, Math.floor((Math.min(ax, bx, dx) - this.x0) / c));
      const maxI = Math.min(this.nx - 1, Math.floor((Math.max(ax, bx, dx) - this.x0) / c));
      const minK = Math.max(0, Math.floor((Math.min(az, bz, dz) - this.z0) / c));
      const maxK = Math.min(this.nz - 1, Math.floor((Math.max(az, bz, dz) - this.z0) / c));
      for (let k = minK; k <= maxK; k++) {
        const pz = this.z0 + (k + 0.5) * c;
        for (let i = minI; i <= maxI; i++) {
          const px = this.x0 + (i + 0.5) * c;
          const w0 = ((bx - px) * (dz - pz) - (dx - px) * (bz - pz)) / area;
          const w1 = ((dx - px) * (az - pz) - (ax - px) * (dz - pz)) / area;
          const w2 = 1 - w0 - w1;
          if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
          const y = w0 * ay + w1 * by + w2 * dy;
          const idx = k * this.nx + i;
          if (this.owner[idx] !== bid) {
            if (this.owner[idx] !== -1 && this.height[idx] >= y) continue; // a taller building already owns it
            this.owner[idx] = bid; this.height[idx] = y; cells.push(idx);
          } else if (y > this.height[idx]) this.height[idx] = y;
        }
      }
    }
    this.cellsOf.set(bid, cells);
  }

  /** Ground height (roof if a standing building covers the spot, else 0). */
  groundAt(x, z) {
    const i = this.index(x, z);
    if (i < 0 || this.owner[i] < 0) return 0;
    return this.height[i];
  }

  buildingAt(x, z) {
    const i = this.index(x, z);
    return i < 0 ? -1 : this.owner[i];
  }

  /** Remove a building: its cells become street level. */
  clearBuilding(bid) {
    for (const idx of this.cellsOf.get(bid) || []) {
      if (this.owner[idx] === bid) { this.owner[idx] = -1; this.height[idx] = 0; }
    }
  }

  /** Nearest street-level spot to (x, z), searching outward in rings. */
  findFreeSpot(x, z, maxR = 200) {
    for (let r = 0; r <= maxR; r += this.cell) {
      const steps = Math.max(8, Math.ceil(2 * Math.PI * r / this.cell));
      for (let s = 0; s < steps; s++) {
        const a = s / steps * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (this.index(px, pz) >= 0 && this.groundAt(px, pz) === 0 &&
            this.groundAt(px + 1, pz) === 0 && this.groundAt(px - 1, pz) === 0 &&
            this.groundAt(px, pz + 1) === 0 && this.groundAt(px, pz - 1) === 0) return [px, pz];
      }
    }
    return [x, z];
  }
}
