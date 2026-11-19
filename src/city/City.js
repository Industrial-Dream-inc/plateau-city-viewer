import * as THREE from 'three';
import { HeightGrid } from './HeightGrid.js';

const STATE_W = 256; // buildings per row in the state textures

/**
 * A city of breakable buildings drawn in ONE draw call.
 *
 * Every vertex carries the index of its building. Two small float textures
 * hold per-building state (collapse progress, alive, hit flash, fall
 * direction) and info (centre, height, seed). The vertex shader reads them,
 * so collapsing a building costs one texel write instead of a buffer upload.
 */
export class City {
  /** @param {object} data  parsed city JSON (see tools/plateau-to-city.mjs) */
  constructor(data) {
    this.data = data;
    this.width = data.size[0];
    this.depth = data.size[1];
    this.buildings = [];
    this.grid = new HeightGrid(this.width, this.depth, 1);
    this.listeners = { hit: [], collapse: [], destroyed: [] };

    const n = data.buildings.length;
    const rows = Math.max(1, Math.ceil(n / STATE_W));
    this.stateData = new Float32Array(STATE_W * rows * 4);
    this.infoData = new Float32Array(STATE_W * rows * 4);
    // One texture, two texels per building: (2i) state, (2i+1) info.
    // A single sampler avoids a driver issue seen with two float samplers in
    // the vertex shader (buildings flickered flat on high-DPI canvases).
    this.texData = new Float32Array(STATE_W * 2 * rows * 4);
    this.stateTex = makeTex(this.texData, rows);
    this._dirty = true;

    let triCount = 0;
    for (const b of data.buildings) triCount += b.i.length / 3;
    const pos = new Float32Array(triCount * 9);
    const nor = new Float32Array(triCount * 9);
    const col = new Float32Array(triCount * 9);
    const bidAttr = new Float32Array(triCount * 3);

    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    let o = 0;
    data.buildings.forEach((b, bid) => {
      const p = Float32Array.from(b.p, (v) => v / 10); // decimetres -> metres
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
      for (let k = 0; k < p.length; k += 3) {
        minX = Math.min(minX, p[k]); maxX = Math.max(maxX, p[k]);
        minZ = Math.min(minZ, p[k + 2]); maxZ = Math.max(maxZ, p[k + 2]);
        maxY = Math.max(maxY, p[k + 1]);
      }
      const seed = hash01(b.id);
      const base = paletteFor(b.usage, seed);
      for (let t = 0; t < b.i.length; t += 3) {
        va.fromArray(p, b.i[t] * 3); vb.fromArray(p, b.i[t + 1] * 3); vc.fromArray(p, b.i[t + 2] * 3);
        e1.subVectors(vb, va); e2.subVectors(vc, va); e1.cross(e2).normalize();
        for (const v of [va, vb, vc]) {
          pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
          nor[o * 3] = e1.x; nor[o * 3 + 1] = e1.y; nor[o * 3 + 2] = e1.z;
          // roofs a little darker, so streets read from above
          const roof = e1.y > 0.7 ? 0.82 : 1;
          col[o * 3] = base.r * roof; col[o * 3 + 1] = base.g * roof; col[o * 3 + 2] = base.b * roof;
          bidAttr[o] = bid;
          o++;
        }
      }
      this.grid.addBuilding(bid, p, b.i);
      const footprint = (maxX - minX) * (maxZ - minZ);
      const hp = Math.max(1, Math.min(14, Math.round(footprint * maxY / 6000) + 1));
      this.buildings.push({
        id: b.id, usage: b.usage, name: b.name,
        min: new THREE.Vector3(minX, 0, minZ), max: new THREE.Vector3(maxX, maxY, maxZ),
        center: new THREE.Vector3((minX + maxX) / 2, maxY / 2, (minZ + maxZ) / 2),
        height: maxY, hp, maxHp: hp, state: 'standing', progress: 0, color: base,
      });
      this.setInfo(bid, (minX + maxX) / 2, (minZ + maxZ) / 2, maxY, seed);
      this.setState(bid, 0, 1, 0, 0);
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aBid', new THREE.BufferAttribute(bidAttr, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();

    this._sync();
    this.uniforms = { uState: { value: this.stateTex }, uTime: { value: 0 } };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
    mat.onBeforeCompile = (shader) => patchShader(shader, this.uniforms);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; // vertices move in the shader
    this.mesh.name = 'city';
  }

  on(ev, fn) { this.listeners[ev].push(fn); }
  emit(ev, ...args) { for (const fn of this.listeners[ev]) fn(...args); }

  setState(bid, progress, alive, flash, dir) {
    const k = bid * 4;
    this.stateData[k] = progress; this.stateData[k + 1] = alive; this.stateData[k + 2] = flash; this.stateData[k + 3] = dir;
    this._dirty = true;
  }
  setInfo(bid, cx, cz, h, seed) {
    const k = bid * 4;
    this.infoData[k] = cx; this.infoData[k + 1] = cz; this.infoData[k + 2] = h; this.infoData[k + 3] = seed;
    this._dirty = true;
  }

  _sync() {
    const n = this.stateData.length / 4, d = this.texData;
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / STATE_W), col = i % STATE_W;
      const o = (row * STATE_W * 2 + col * 2) * 4;
      d.set(this.stateData.subarray(i * 4, i * 4 + 4), o);
      d.set(this.infoData.subarray(i * 4, i * 4 + 4), o + 4);
    }
    this.stateTex.needsUpdate = true;
    this._dirty = false;
  }

  /** Building index under a raycast hit, skipping fallen ones. */
  pick(raycaster) {
    for (const hit of raycaster.intersectObject(this.mesh, false)) {
      const bid = this.mesh.geometry.attributes.aBid.getX(hit.face.a);
      if (this.buildings[bid].state === 'standing') return { bid, point: hit.point, normal: hit.face.normal };
    }
    return null;
  }

  /** Apply damage to one building. Returns true if this hit made it fall. */
  damage(bid, amount, from) {
    const b = this.buildings[bid];
    if (!b || b.state !== 'standing') return false;
    b.hp -= amount;
    this.stateData[bid * 4 + 2] = 1; // flash
    this._dirty = true;
    this.emit('hit', bid, b);
    if (b.hp <= 0) { this.collapse(bid, from); return true; }
    return false;
  }

  /** Damage every standing building whose box is within `radius` of a point. */
  damageSphere(point, radius, amount) {
    const fallen = [];
    const q = new THREE.Vector3();
    this.buildings.forEach((b, bid) => {
      if (b.state !== 'standing') return;
      q.copy(point).clamp(b.min, b.max);
      const d = q.distanceTo(point);
      if (d > radius) return;
      if (this.damage(bid, amount * (1 - 0.6 * d / radius), point)) fallen.push(bid);
    });
    return fallen;
  }

  collapse(bid, from) {
    const b = this.buildings[bid];
    if (b.state !== 'standing') return;
    b.state = 'collapsing';
    b.progress = 0;
    b.duration = 1.6 + Math.min(3, b.height / 40);
    // fall away from whatever hit it
    const dx = b.center.x - (from ? from.x : b.center.x + Math.random() - 0.5);
    const dz = b.center.z - (from ? from.z : b.center.z + Math.random() - 0.5);
    b.dir = Math.atan2(dz, dx);
    this.setState(bid, 0.001, 1, 1, b.dir);
    // the footprint stops being solid as soon as it starts to fall, so
    // debris and the walker drop with it instead of resting on thin air
    this.grid.clearBuilding(bid);
    this.emit('collapse', bid, b);
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;
    let dirty = false;
    for (let bid = 0; bid < this.buildings.length; bid++) {
      const b = this.buildings[bid];
      const k = bid * 4;
      if (this.stateData[k + 2] > 0) { this.stateData[k + 2] = Math.max(0, this.stateData[k + 2] - dt * 4); dirty = true; }
      if (b.state !== 'collapsing') continue;
      b.progress = Math.min(1, b.progress + dt / b.duration);
      this.stateData[k] = easeIn(b.progress);
      dirty = true;
      if (b.progress >= 1) {
        b.state = 'gone';
        this.stateData[k + 1] = 0;
        this.emit('destroyed', bid, b);
      }
    }
    if (dirty || this._dirty) this._sync();
  }

  get standingCount() { return this.buildings.filter((b) => b.state === 'standing').length; }
}

function makeTex(data, rows) {
  const t = new THREE.DataTexture(data, STATE_W * 2, rows, THREE.RGBAFormat, THREE.FloatType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

const easeIn = (t) => t * t * (3 - 2 * t);

function hash01(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

// Muted facade colours by PLATEAU usage (bldg:usage), varied per building.
function paletteFor(usage = '', seed) {
  let hsl;
  if (/商業|店舗/.test(usage)) hsl = [0.08, 0.18, 0.72];
  else if (/業務|官公庁/.test(usage)) hsl = [0.58, 0.08, 0.70];
  else if (/住宅|共同/.test(usage)) hsl = [0.10, 0.14, 0.78];
  else if (/宿泊|文教|医療|厚生/.test(usage)) hsl = [0.0, 0.06, 0.80];
  else hsl = [0.6, 0.04, 0.74];
  return new THREE.Color().setHSL(hsl[0] + (seed - 0.5) * 0.04, hsl[1], hsl[2] + (seed - 0.5) * 0.12);
}

function patchShader(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>
      attribute float aBid;
      uniform sampler2D uState;
      uniform float uTime;
      varying float vFlash;
      varying vec3 vWP;
      varying vec3 vWN;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      int bidI = int(aBid + 0.5);
      ivec2 tc = ivec2((bidI % ${STATE_W}) * 2, bidI / ${STATE_W});
      vec4 st = texelFetch(uState, tc, 0);
      vec4 info = texelFetch(uState, tc + ivec2(1, 0), 0);
      vFlash = st.b;
      vWN = normal;
      if (st.g < 0.5) {
        transformed = vec3(0.0, -1000.0, 0.0);       // gone
      } else if (st.r > 0.0) {
        float p = st.r;
        float h = max(info.b, 1.0);
        vec3 rel = transformed - vec3(info.r, 0.0, info.g);
        // shake, strongest at the start
        float s = (1.0 - p) * 0.6 * sin(uTime * 37.0 + info.a * 40.0) * (rel.y / h);
        rel.x += s; rel.z += s * 0.7;
        // lean toward the fall direction
        vec2 dir = vec2(cos(st.a), sin(st.a));
        float ang = p * 0.45;
        float along = dot(rel.xz, dir);
        float ny = rel.y * cos(ang) - along * sin(ang);
        float na = rel.y * sin(ang) + along * cos(ang);
        rel.xz += dir * (na - along);
        // pancake down into the ground
        rel.y = ny * (1.0 - p) - p * 2.0;
        transformed = rel + vec3(info.r, 0.0, info.g);
      }
      vWP = transformed;`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      varying float vFlash;
      varying vec3 vWP;
      varying vec3 vWN;`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      // procedural windows on walls: storeys every 3.6 m, bays every 2.4 m
      if (abs(vWN.y) < 0.3 && vWP.y > 4.0) {
        vec2 t = normalize(vec2(-vWN.z, vWN.x));
        float u = fract(dot(vWP.xz, t) / 2.4);
        float v = fract(vWP.y / 3.6);
        float win = step(0.18, u) * step(u, 0.82) * step(0.3, v) * step(v, 0.86);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.17, 0.23), win * 0.8);
      } else if (abs(vWN.y) < 0.3) {
        diffuseColor.rgb *= 0.78;                     // street-level band
      }
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.55, 0.25), vFlash * 0.7);`);
}
