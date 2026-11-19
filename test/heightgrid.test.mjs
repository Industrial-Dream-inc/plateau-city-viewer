import test from 'node:test';
import assert from 'node:assert/strict';
import { HeightGrid } from '../src/city/HeightGrid.js';

// a 10 x 10 m box, 20 m tall, centred at (5, 5): top + bottom faces only
const box = (x0, z0, s, h) => ({
  p: [x0, h, z0, x0 + s, h, z0, x0 + s, h, z0 + s, x0, h, z0 + s],
  i: [0, 2, 1, 0, 3, 2],
});

test('roof height inside, street outside', () => {
  const g = new HeightGrid(40, 40, 1);
  const b = box(0, 0, 10, 20);
  g.addBuilding(0, b.p, b.i);
  assert.equal(g.groundAt(5, 5), 20);
  assert.equal(g.buildingAt(5, 5), 0);
  assert.equal(g.groundAt(15, 5), 0);
  assert.equal(g.buildingAt(15, 5), -1);
});

test('clearing a building frees its cells', () => {
  const g = new HeightGrid(40, 40, 1);
  const b = box(0, 0, 10, 20);
  g.addBuilding(7, b.p, b.i);
  g.clearBuilding(7);
  assert.equal(g.groundAt(5, 5), 0);
  assert.equal(g.buildingAt(5, 5), -1);
});

test('taller building wins a shared cell', () => {
  const g = new HeightGrid(40, 40, 1);
  const lo = box(0, 0, 10, 5), hi = box(5, 0, 10, 30);
  g.addBuilding(0, lo.p, lo.i);
  g.addBuilding(1, hi.p, hi.i);
  assert.equal(g.buildingAt(7, 5), 1);
  assert.equal(g.groundAt(7, 5), 30);
  assert.equal(g.buildingAt(2, 5), 0);
});

test('findFreeSpot leaves the footprint', () => {
  const g = new HeightGrid(60, 60, 1);
  const b = box(-10, -10, 20, 20);
  g.addBuilding(0, b.p, b.i);
  const [x, z] = g.findFreeSpot(0, 0);
  assert.equal(g.groundAt(x, z), 0);
});
