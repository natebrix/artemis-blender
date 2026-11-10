// Fuel (ball) physics: a JavaScript port of FuelSim.java from the robot code
// (itself based on https://github.com/hammerheads5000/FuelSim).
import * as C from './constants.js';

const R = C.FUEL_RADIUS;
const L = C.FIELD_LENGTH, W = C.FIELD_WIDTH;
const TW = C.TRENCH_WIDTH, TB = C.TRENCH_BLOCK_WIDTH, TH = C.TRENCH_HEIGHT;
const BARH = C.TRENCH_BAR_HEIGHT, BARW = C.TRENCH_BAR_WIDTH;

// Floor, bumps and trench tops as lines in the X-Z plane, each valid over a Y range.
// [x0, y0, z0, x1, y1, z1]
const LINES = [
  [0, 0, 0, L, W, 0],
  [3.96, 1.57, 0, 4.61, W / 2 - 0.60, 0.165],
  [3.96, W / 2 + 0.60, 0, 4.61, W - 1.57, 0.165],
  [4.61, 1.57, 0.165, 5.18, W / 2 - 0.60, 0],
  [4.61, W / 2 + 0.60, 0.165, 5.18, W - 1.57, 0],
  [L - 5.18, 1.57, 0, L - 4.61, W / 2 - 0.60, 0.165],
  [L - 5.18, W / 2 + 0.60, 0, L - 4.61, W - 1.57, 0.165],
  [L - 4.61, 1.57, 0.165, L - 3.96, W / 2 - 0.60, 0],
  [L - 4.61, W / 2 + 0.60, 0.165, L - 3.96, W - 1.57, 0],
  [3.96, TW, TH, 5.18, TW + TB, TH],
  [3.96, W - 1.57, TH, 5.18, W - 1.57 + TB, TH],
  [L - 5.18, TW, TH, L - 3.96, TW + TB, TH],
  [L - 5.18, W - 1.57, TH, L - 3.96, W - 1.57 + TB, TH],
  [4.61 - BARW / 2, 0, TH + BARH, 4.61 + BARW / 2, TW + TB, TH + BARH],
  [4.61 - BARW / 2, W - 1.57, TH + BARH, 4.61 + BARW / 2, W, TH + BARH],
  [L - 4.61 - BARW / 2, 0, TH + BARH, L - 4.61 + BARW / 2, TW + TB, TH + BARH],
  [L - 4.61 - BARW / 2, W - 1.57, TH + BARH, L - 4.61 + BARW / 2, W, TH + BARH],
];

// Solid boxes: [x0, y0, z0, x1, y1, z1]
export const TRENCH_BOXES = [
  [3.96, TW, 0, 5.18, TW + TB, TH],
  [3.96, W - 1.57, 0, 5.18, W - 1.57 + TB, TH],
  [L - 5.18, TW, 0, L - 3.96, TW + TB, TH],
  [L - 5.18, W - 1.57, 0, L - 3.96, W - 1.57 + TB, TH],
  [4.61 - BARW / 2, 0, TH, 4.61 + BARW / 2, TW + TB, TH + BARH],
  [4.61 - BARW / 2, W - 1.57, TH, 4.61 + BARW / 2, W, TH + BARH],
  [L - 4.61 - BARW / 2, 0, TH, L - 4.61 + BARW / 2, TW + TB, TH + BARH],
  [L - 4.61 - BARW / 2, W - 1.57, TH, L - 4.61 + BARW / 2, W, TH + BARH],
];

const CELL = 0.25;
const COLS = Math.ceil(L / CELL), ROWS = Math.ceil(W / CELL);

export class FuelSim {
  constructor(max = 700) {
    this.max = max;
    this.n = 0;
    this.px = new Float32Array(max); this.py = new Float32Array(max); this.pz = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vz = new Float32Array(max);
    this.awake = new Uint8Array(max);
    this.cellHead = new Int32Array(COLS * ROWS);
    this.next = new Int32Array(max);
    this.hubs = [{ ...C.BLUE_HUB, score: 0 }, { ...C.RED_HUB, score: 0 }];
    this.airResistance = true;
    this.robot = null;       // set by the simulator each step
    this.onIntake = null;    // (count) => accepted?
    this.onScore = null;
  }

  clear() { this.n = 0; this.hubs.forEach(h => (h.score = 0)); }

  spawn(x, y, z, vx = 0, vy = 0, vz = 0) {
    if (this.n >= this.max) return -1;
    const i = this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.awake[i] = 1;
    return i;
  }

  remove(i) {
    const j = --this.n;
    if (i !== j) {
      this.px[i] = this.px[j]; this.py[i] = this.py[j]; this.pz[i] = this.pz[j];
      this.vx[i] = this.vx[j]; this.vy[i] = this.vy[j]; this.vz[i] = this.vz[j];
      this.awake[i] = this.awake[j];
    }
  }

  // code: FuelSim.spawnStartingFuel()
  spawnStartingFuel() {
    const cx = L / 2, cy = W / 2;
    for (let i = 0; i < 15; i++) {
      for (let j = 0; j < 6; j++) {
        const dx = 0.076 + 0.152 * j, dy = 0.0254 + 0.076 + 0.152 * i;
        this.spawn(cx + dx, cy + dy, R); this.spawn(cx - dx, cy + dy, R);
        this.spawn(cx + dx, cy - dy, R); this.spawn(cx - dx, cy - dy, R);
      }
    }
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 4; j++) {
        const dx = 0.076 + 0.152 * j, dy = 0.076 + 0.152 * i;
        this.spawn(dx, 5.95 + dy, R); this.spawn(dx, 5.95 - dy, R);
        this.spawn(L - dx, 2.09 + dy, R); this.spawn(L - dx, 2.09 - dy, R);
      }
    }
    for (let i = 0; i < this.n; i++) this.awake[i] = 0;
  }

  step(dt) {
    const { px, py, pz, vx, vy, vz, awake } = this;
    for (let i = 0; i < this.n; i++) {
      if (!awake[i]) continue;
      px[i] += vx[i] * dt; py[i] += vy[i] * dt; pz[i] += vz[i] * dt;
      if (pz[i] > R) {
        let ax = 0, ay = 0, az = -C.GRAVITY;
        if (this.airResistance) {
          const sp = Math.hypot(vx[i], vy[i], vz[i]);
          if (sp > 1e-6) { const k = C.DRAG_K * sp; ax -= k * vx[i]; ay -= k * vy[i]; az -= k * vz[i]; }
        }
        vx[i] += ax * dt; vy[i] += ay * dt; vz[i] += az * dt;
      }
      if (Math.abs(vz[i]) < 0.05 && pz[i] <= R + 0.03) {
        vz[i] = 0;
        const f = 1 - C.FRICTION * dt;
        vx[i] *= f; vy[i] *= f;
        // settle slow balls on flat carpet so resting fuel costs nothing
        if (vx[i] * vx[i] + vy[i] * vy[i] < 0.0009 && !this._onBump(px[i])) {
          vx[i] = 0; vy[i] = 0; pz[i] = R; awake[i] = 0;
        }
      }
      this._field(i, dt);
    }
    this._pairs();
    if (this.robot) this._robot();
  }

  _onBump(x) {
    return (x > 3.9 && x < 5.25) || (x > L - 5.25 && x < L - 3.9);
  }

  _line(i, ln) {
    const { px, py, pz, vx, vz } = this;
    if (py[i] < ln[1] || py[i] > ln[4]) return;
    const lx = ln[3] - ln[0], lz = ln[5] - ln[2];
    const len2 = lx * lx + lz * lz;
    const t = ((px[i] - ln[0]) * lx + (pz[i] - ln[2]) * lz) / len2;
    if (t < 0 || t > 1) return;
    const qx = ln[0] + lx * t, qz = ln[2] + lz * t;
    const dist = Math.hypot(px[i] - qx, pz[i] - qz);
    if (dist > R) return;
    const len = Math.sqrt(len2);
    const nx = -lz / len, nz = lx / len;
    px[i] += nx * (R - dist); pz[i] += nz * (R - dist);
    const vn = vx[i] * nx + vz[i] * nz;
    if (vn > 0) return;
    vx[i] -= nx * (1 + C.FIELD_COR) * vn; vz[i] -= nz * (1 + C.FIELD_COR) * vn;
  }

  _box(i, b) {
    const { px, py, pz, vx, vy } = this;
    if (pz[i] > b[5] + R || pz[i] < b[2] - R) return;
    const dL = b[0] - R - px[i], dR = px[i] - b[3] - R;
    const dT = py[i] - b[4] - R, dB = b[1] - R - py[i];
    if (dL > 0 || dR > 0 || dT > 0 || dB > 0) return;
    if (px[i] < b[0] || (dL >= dR && dL >= dT && dL >= dB)) {
      px[i] += dL; vx[i] += -(1 + C.FIELD_COR) * vx[i];
    } else if (px[i] >= b[3] || (dR >= dL && dR >= dT && dR >= dB)) {
      px[i] -= dR; vx[i] += -(1 + C.FIELD_COR) * vx[i];
    } else if (py[i] > b[4] || (dT >= dL && dT >= dR && dT >= dB)) {
      py[i] -= dT; vy[i] += -(1 + C.FIELD_COR) * vy[i];
    } else {
      py[i] += dB; vy[i] += -(1 + C.FIELD_COR) * vy[i];
    }
  }

  _field(i, dt) {
    const { px, py, pz, vx, vy, vz } = this;
    for (let k = 0; k < LINES.length; k++) this._line(i, LINES[k]);
    if (px[i] < R && vx[i] < 0) { px[i] = R; vx[i] *= -C.FIELD_COR; }
    else if (px[i] > L - R && vx[i] > 0) { px[i] = L - R; vx[i] *= -C.FIELD_COR; }
    if (py[i] < R && vy[i] < 0) { py[i] = R; vy[i] *= -C.FIELD_COR; }
    else if (py[i] > W - R && vy[i] > 0) { py[i] = W - R; vy[i] *= -C.FIELD_COR; }
    for (const h of this.hubs) {
      // scored: fell through the entry plane inside the opening
      const d = Math.hypot(px[i] - h.x, py[i] - h.y);
      if (d <= C.HUB.entryRadius && pz[i] <= C.HUB.entryHeight && pz[i] - vz[i] * dt > C.HUB.entryHeight) {
        px[i] = h.exit[0]; py[i] = h.exit[1]; pz[i] = h.exit[2];
        vx[i] = h.dir * (Math.random() + 0.1) * 1.5; vy[i] = Math.random() * 2 - 1; vz[i] = 0;
        h.score++;
        if (this.onScore) this.onScore(h);
        continue;
      }
      this._box(i, [h.x - 0.6, h.y - 0.6, 0, h.x + 0.6, h.y + 0.6, C.HUB.entryHeight - 0.1]);
      // net behind the hub
      if (pz[i] <= C.HUB.netMax && pz[i] >= C.HUB.netMin &&
          py[i] <= h.y + C.HUB.netWidth / 2 && py[i] >= h.y - C.HUB.netWidth / 2) {
        const nx = h.x + C.HUB.netOffset * h.dir;
        let push = 0;
        if (px[i] > nx) push = Math.max(0, nx - (px[i] - R)); else push = Math.min(0, nx - (px[i] + R));
        if (push !== 0) { px[i] += push; vx[i] = -vx[i] * C.NET_COR; vy[i] *= C.NET_COR; }
      }
    }
    for (let k = 0; k < TRENCH_BOXES.length; k++) this._box(i, TRENCH_BOXES[k]);
  }

  _pairs() {
    const { px, py, pz, vx, vy, vz, awake, cellHead, next } = this;
    cellHead.fill(-1);
    for (let i = 0; i < this.n; i++) {
      const c = (px[i] / CELL) | 0, r = (py[i] / CELL) | 0;
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) { next[i] = -1; continue; }
      const k = c * ROWS + r;
      next[i] = cellHead[k]; cellHead[k] = i;
    }
    const D = 2 * R, D2 = D * D;
    for (let i = 0; i < this.n; i++) {
      if (!awake[i]) continue;            // a resting ball only reacts when a moving one hits it
      const c = (px[i] / CELL) | 0, r = (py[i] / CELL) | 0;
      for (let ci = c - 1; ci <= c + 1; ci++) {
        if (ci < 0 || ci >= COLS) continue;
        for (let ri = r - 1; ri <= r + 1; ri++) {
          if (ri < 0 || ri >= ROWS) continue;
          for (let j = cellHead[ci * ROWS + ri]; j !== -1; j = next[j]) {
            if (j === i || (awake[j] && j < i)) continue;
            let nx = px[i] - px[j], ny = py[i] - py[j], nz = pz[i] - pz[j];
            let d2 = nx * nx + ny * ny + nz * nz;
            if (d2 >= D2) continue;
            let d = Math.sqrt(d2);
            if (d === 0) { nx = 1; ny = 0; nz = 0; d = 1; }
            nx /= d; ny /= d; nz /= d;
            const imp = 0.5 * (1 + C.FUEL_COR) *
              ((vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny + (vz[j] - vz[i]) * nz);
            const pen = (D - d) / 2;
            px[i] += nx * pen; py[i] += ny * pen; pz[i] += nz * pen;
            px[j] -= nx * pen; py[j] -= ny * pen; pz[j] -= nz * pen;
            vx[i] += nx * imp; vy[i] += ny * imp; vz[i] += nz * imp;
            vx[j] -= nx * imp; vy[j] -= ny * imp; vz[j] -= nz * imp;
            awake[j] = 1;
          }
        }
      }
    }
  }

  // Robot: bumper rectangle (code: handleRobotCollision), an intake zone in
  // front of it, and the open hopper on top, which catches falling fuel.
  _robot() {
    const rb = this.robot;
    const { px, py, pz, vx, vy, vz, awake } = this;
    const cos = Math.cos(rb.heading), sin = Math.sin(rb.heading);
    const reach = Math.max(rb.xMax, rb.intakeReach) + 0.5;
    for (let i = this.n - 1; i >= 0; i--) {
      const dx = px[i] - rb.x, dy = py[i] - rb.y;
      if (Math.abs(dx) > reach + 0.6 || Math.abs(dy) > reach + 0.6) continue;
      const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;   // robot frame
      const z = pz[i] - rb.z;
      // intake
      if (rb.intaking && z < C.BUMPER_HEIGHT && lx >= C.ROBOT_LENGTH / 2 - 0.02 && lx <= rb.intakeReach + R &&
          Math.abs(ly) <= C.INTAKE_HALF_WIDTH) {
        if (this.onIntake && this.onIntake()) { this.remove(i); continue; }
      }
      // hopper catch
      if (z > C.BUMPER_HEIGHT && z < 0.62 && vz[i] < 0 && lx > -0.36 && lx < 0.36 && Math.abs(ly) < 0.36) {
        if (rb.catchEnabled && this.onIntake && this.onIntake()) { this.remove(i); continue; }
        vz[i] = Math.abs(vz[i]) * 0.3 + 0.5;
        const o = 1.2 / Math.max(0.05, Math.hypot(lx, ly));
        vx[i] += (lx * cos - ly * sin) * o; vy[i] += (lx * sin + ly * cos) * o;
        awake[i] = 1;
        continue;
      }
      if (z > C.BUMPER_HEIGHT) continue;
      const hw = C.ROBOT_WIDTH / 2;
      const dBack = -R - (lx - rb.xMin), dFront = -R - (rb.xMax - lx);
      const dRight = -R - (ly + hw), dLeft = -R - (hw - ly);
      if (dBack > 0 || dFront > 0 || dRight > 0 || dLeft > 0) continue;
      let ox = 0, oy = 0;
      if (dBack >= dFront && dBack >= dRight && dBack >= dLeft) ox = dBack;
      else if (dFront >= dRight && dFront >= dLeft) ox = -dFront;
      else if (dRight >= dLeft) oy = dRight;
      else oy = -dLeft;
      const wx = ox * cos - oy * sin, wy = ox * sin + oy * cos;
      px[i] += wx; py[i] += wy;
      const m = Math.hypot(wx, wy) || 1;
      const nx = wx / m, ny = wy / m;
      const vn = vx[i] * nx + vy[i] * ny;
      if (vn < 0) { vx[i] -= nx * vn * (1 + C.ROBOT_COR); vy[i] -= ny * vn * (1 + C.ROBOT_COR); }
      // velocity of the robot surface at the contact point
      const rvx = rb.vx - rb.omega * dy, rvy = rb.vy + rb.omega * dx;
      const rn = rvx * nx + rvy * ny;
      if (rn > 0) { vx[i] += nx * rn; vy[i] += ny * rn; }
      awake[i] = 1;
    }
  }
}
