import * as THREE from 'three';

/**
 * First-person walking camera that collides with a HeightGrid.
 *
 * Desktop: click to capture the mouse, WASD / arrows to move, Shift to run,
 *          Space to jump, F to fly.
 * Touch:   drag on the left half to move, on the right half to look.
 *
 * You can climb anything lower than `stepHeight`, stand on roofs, and fall
 * when the building under you is destroyed.
 */
export class WalkControls {
  constructor(camera, dom, grid, opts = {}) {
    this.camera = camera;
    this.dom = dom;
    this.grid = grid;
    this.eyeHeight = opts.eyeHeight ?? 1.7;
    this.radius = opts.radius ?? 0.35;
    this.stepHeight = opts.stepHeight ?? 0.6;
    this.walkSpeed = opts.walkSpeed ?? 6;
    this.runSpeed = opts.runSpeed ?? 18;
    this.jumpSpeed = opts.jumpSpeed ?? 9;
    this.gravity = opts.gravity ?? 24;
    this.flying = false;

    this.pos = new THREE.Vector3(0, 0, 0); // feet
    this.vy = 0;
    this.yaw = 0; this.pitch = 0;
    this.keys = new Set();
    this.locked = false;
    this.touchMove = null; this.touchLook = null;
    this.moveVec = new THREE.Vector2();

    this._onKey = (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.type === 'keydown') {
        this.keys.add(e.code);
        if (e.code === 'Space' && this.onGround) this.vy = this.jumpSpeed;
        if (e.code === 'KeyF') { this.flying = !this.flying; this.vy = 0; }
      } else this.keys.delete(e.code);
    };
    this._onMouse = (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.5, 1.5);
    };
    this._onLock = () => { this.locked = document.pointerLockElement === dom; };
    addEventListener('keydown', this._onKey);
    addEventListener('keyup', this._onKey);
    addEventListener('mousemove', this._onMouse);
    document.addEventListener('pointerlockchange', this._onLock);

    // touch: left half moves, right half looks
    dom.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        const left = t.clientX < innerWidth / 2;
        if (left && !this.touchMove) this.touchMove = { id: t.identifier, x: t.clientX, y: t.clientY };
        else if (!left && !this.touchLook) this.touchLook = { id: t.identifier, x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY, t0: performance.now() };
      }
    }, { passive: true });
    dom.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (this.touchMove?.id === t.identifier) {
          this.moveVec.set((t.clientX - this.touchMove.x) / 60, (t.clientY - this.touchMove.y) / 60).clampLength(0, 1.5);
        } else if (this.touchLook?.id === t.identifier) {
          this.yaw -= (t.clientX - this.touchLook.x) * 0.005;
          this.pitch = THREE.MathUtils.clamp(this.pitch - (t.clientY - this.touchLook.y) * 0.005, -1.5, 1.5);
          this.touchLook.x = t.clientX; this.touchLook.y = t.clientY;
        }
      }
    }, { passive: true });
    dom.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (this.touchMove?.id === t.identifier) { this.touchMove = null; this.moveVec.set(0, 0); }
        if (this.touchLook?.id === t.identifier) {
          const l = this.touchLook; this.touchLook = null;
          // a short tap without dragging counts as a "fire" at that spot
          if (Math.hypot(t.clientX - l.x0, t.clientY - l.y0) < 12 && performance.now() - l.t0 < 300) this.onTap?.(t.clientX, t.clientY);
        }
      }
    }, { passive: true });
  }

  lock() { this.dom.requestPointerLock?.(); }

  /** Place the walker at (x, z) on the nearest free street spot. */
  spawn(x, z, yaw = 0) {
    const [fx, fz] = this.grid.findFreeSpot(x, z);
    this.pos.set(fx, 0, fz); this.vy = 0; this.yaw = yaw; this.pitch = 0;
  }

  get onGround() { return this.pos.y <= this.groundUnder(this.pos.x, this.pos.z) + 0.01; }

  groundUnder(x, z) {
    const r = this.radius * 0.7;
    return Math.max(this.grid.groundAt(x, z), this.grid.groundAt(x + r, z), this.grid.groundAt(x - r, z),
      this.grid.groundAt(x, z + r), this.grid.groundAt(x, z - r));
  }

  blocked(x, z) {
    const lim = this.pos.y + this.stepHeight;
    if (this.grid.index(x, z) < 0) return true; // edge of the map
    const r = this.radius;
    for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r], [r * .7, r * .7], [-r * .7, r * .7], [r * .7, -r * .7], [-r * .7, -r * .7]]) {
      if (this.grid.groundAt(x + dx, z + dz) > lim) return true;
    }
    return false;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - this.moveVec.y;
    const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + this.moveVec.x;
    const run = k.has('ShiftLeft') || k.has('ShiftRight') || this.moveVec.length() > 1.2;
    const speed = (run ? this.runSpeed : this.walkSpeed) * (this.flying ? 3 : 1);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let dx = (-sin * f + cos * s) * speed * dt;
    let dz = (-cos * f - sin * s) * speed * dt;

    if (this.flying) {
      const up = (k.has('Space') ? 1 : 0) - (k.has('KeyC') || k.has('ControlLeft') ? 1 : 0);
      this.pos.x += dx; this.pos.z += dz;
      this.pos.y = Math.max(this.groundUnder(this.pos.x, this.pos.z), this.pos.y + up * speed * dt + Math.sin(this.pitch) * f * speed * dt);
    } else {
      // slide along walls: try each axis on its own
      if (!this.blocked(this.pos.x + dx, this.pos.z)) this.pos.x += dx;
      if (!this.blocked(this.pos.x, this.pos.z + dz)) this.pos.z += dz;
      const ground = this.groundUnder(this.pos.x, this.pos.z);
      this.vy -= this.gravity * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) {
        // step up small ledges smoothly, land on everything else
        this.pos.y = ground; this.vy = 0;
      }
    }
    this.camera.position.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
