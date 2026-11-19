import * as THREE from 'three';

/**
 * Falling chunks (instanced boxes with simple physics) and dust clouds
 * (soft sprites). Both are fixed-size pools: the oldest piece is reused.
 */
export class Debris {
  constructor(scene, { chunks = 1600, dust = 1400, groundAt = () => 0 } = {}) {
    this.groundAt = groundAt;

    // --- chunks
    this.max = chunks;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    this.mesh = new THREE.InstancedMesh(box, mat, chunks);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.p = new Float32Array(chunks * 3);
    this.v = new Float32Array(chunks * 3);
    this.r = new Float32Array(chunks * 3); // rotation
    this.w = new Float32Array(chunks * 3); // spin
    this.s = new Float32Array(chunks * 3); // size
    this.rest = new Uint8Array(chunks);
    this.next = 0;
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < chunks; i++) this.mesh.setColorAt(i, white);
    scene.add(this.mesh);

    // --- dust
    this.dmax = dust;
    const g = new THREE.BufferGeometry();
    this.dp = new Float32Array(dust * 3);
    this.dv = new Float32Array(dust * 3);
    this.dlife = new Float32Array(dust);   // 0..1 remaining
    this.dspan = new Float32Array(dust);   // seconds
    this.dsize = new Float32Array(dust);
    this.dalpha = new Float32Array(dust);
    g.setAttribute('position', new THREE.BufferAttribute(this.dp, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.dsize, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.dalpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.dust = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 400 } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale / max(1.0, -mv.z);
          vA = aAlpha;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.0, r) * vA;
          gl_FragColor = vec4(vec3(0.62, 0.6, 0.57), a);
        }`,
    }));
    this.dust.frustumCulled = false;
    this.dnext = 0;
    scene.add(this.dust);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  /** Throw one chunk. */
  chunk(pos, vel, size, color) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    this.p.set([pos.x, pos.y, pos.z], i * 3);
    this.v.set([vel.x, vel.y, vel.z], i * 3);
    this.r.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
    this.w.set([(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8], i * 3);
    this.s.set([size * (0.6 + Math.random() * 0.8), size * (0.4 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8)], i * 3);
    this.rest[i] = 0;
    this._c.copy(color).multiplyScalar(0.7 + Math.random() * 0.3);
    this.mesh.setColorAt(i, this._c);
    this.mesh.instanceColor.needsUpdate = true;
  }

  /** Small burst where a hit lands. */
  impact(point, normal, color, n = 10) {
    for (let k = 0; k < n; k++) {
      const v = new THREE.Vector3(normal.x, 0.6, normal.z).normalize().multiplyScalar(4 + Math.random() * 8);
      v.x += (Math.random() - 0.5) * 6; v.z += (Math.random() - 0.5) * 6; v.y += Math.random() * 4;
      this.chunk(point, v, 0.3 + Math.random() * 0.6, color);
    }
    this.puff(point, 6, 2.5, 1.5);
  }

  /** A cloud of dust around a point. */
  puff(point, n, size, spread, life = 3) {
    for (let k = 0; k < n; k++) {
      const i = this.dnext; this.dnext = (this.dnext + 1) % this.dmax;
      this.dp[i * 3] = point.x + (Math.random() - 0.5) * spread;
      this.dp[i * 3 + 1] = point.y + Math.random() * spread * 0.3;
      this.dp[i * 3 + 2] = point.z + (Math.random() - 0.5) * spread;
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 4;
      this.dv[i * 3] = Math.cos(a) * sp; this.dv[i * 3 + 1] = 0.5 + Math.random() * 2; this.dv[i * 3 + 2] = Math.sin(a) * sp;
      this.dlife[i] = 1; this.dspan[i] = life * (0.7 + Math.random() * 0.6);
      this.dsize[i] = size * (0.6 + Math.random() * 0.8);
    }
  }

  /** Chunks and dust for a building that has started to fall. */
  collapseBurst(b) {
    const w = b.max.x - b.min.x, d = b.max.z - b.min.z;
    const scale = Math.min(1.8, 0.4 + Math.sqrt(w * d) / 30);
    const n = Math.min(220, 40 + Math.round(w * d * b.height / 1200));
    for (let k = 0; k < n; k++) {
      const p = new THREE.Vector3(
        b.min.x + Math.random() * w, Math.random() * b.height, b.min.z + Math.random() * d);
      const out = new THREE.Vector3(p.x - b.center.x, 0, p.z - b.center.z).normalize().multiplyScalar(2 + Math.random() * 6);
      out.y = Math.random() * 3;
      this.chunk(p, out, scale * (0.4 + Math.random() * 0.8), b.color);
    }
    const ring = Math.min(120, 30 + Math.round((w + d) * 1.2));
    for (let k = 0; k < ring; k++) {
      const a = k / ring * Math.PI * 2;
      const p = new THREE.Vector3(b.center.x + Math.cos(a) * w * 0.6, 1, b.center.z + Math.sin(a) * d * 0.6);
      this.puff(p, 1, 6 + scale * 3, 4, 4 + Math.random() * 3);
    }
  }

  update(dt) {
    const g = -22;
    for (let i = 0; i < this.mesh.count; i++) {
      const k = i * 3;
      if (this.rest[i]) {
        // wake up if what it was lying on has been destroyed
        if (this.p[k + 1] - this.s[k + 1] / 2 > this.groundAt(this.p[k], this.p[k + 2]) + 0.05) this.rest[i] = 0;
        else continue;
      }
      this.v[k + 1] += g * dt;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      this.r[k] += this.w[k] * dt; this.r[k + 1] += this.w[k + 1] * dt; this.r[k + 2] += this.w[k + 2] * dt;
      const floor = this.groundAt(this.p[k], this.p[k + 2]) + this.s[k + 1] / 2;
      if (this.p[k + 1] < floor) {
        this.p[k + 1] = floor;
        if (Math.abs(this.v[k + 1]) < 2) {
          this.v[k] *= 0.5; this.v[k + 2] *= 0.5; this.v[k + 1] = 0;
          this.w[k] *= 0.5; this.w[k + 1] *= 0.5; this.w[k + 2] *= 0.5;
          if (Math.hypot(this.v[k], this.v[k + 2]) < 0.2) this.rest[i] = 1;
        } else {
          this.v[k + 1] *= -0.3; this.v[k] *= 0.6; this.v[k + 2] *= 0.6;
        }
      }
      this._e.set(this.r[k], this.r[k + 1], this.r[k + 2]);
      this._q.setFromEuler(this._e);
      this._v.set(this.s[k], this.s[k + 1], this.s[k + 2]);
      this._p.set(this.p[k], this.p[k + 1], this.p[k + 2]);
      this._m.compose(this._p, this._q, this._v);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.dmax; i++) {
      if (this.dlife[i] <= 0) { this.dalpha[i] = 0; continue; }
      const k = i * 3;
      this.dlife[i] -= dt / this.dspan[i];
      this.dv[k] *= 0.97; this.dv[k + 2] *= 0.97; this.dv[k + 1] *= 0.98;
      this.dp[k] += this.dv[k] * dt; this.dp[k + 1] += this.dv[k + 1] * dt; this.dp[k + 2] += this.dv[k + 2] * dt;
      this.dsize[i] += dt * 2.5;
      const life = Math.max(0, this.dlife[i]);
      this.dalpha[i] = Math.min(1, (1 - life) * 6) * life * 0.8;
    }
    const ga = this.dust.geometry.attributes;
    ga.position.needsUpdate = true; ga.aSize.needsUpdate = true; ga.aAlpha.needsUpdate = true;
  }
}
