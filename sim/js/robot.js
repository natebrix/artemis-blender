// ARTEMIS: swerve drive, mechanisms, auto-aim and shooting.
import * as C from './constants.js';
import { TRENCH_BOXES } from './fuel.js';

const DEG = Math.PI / 180;
const L = C.FIELD_LENGTH, W = C.FIELD_WIDTH;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
const moveToward = (v, target, maxStep) => v + clamp(target - v, -maxStep, maxStep);

// obstacles the robot cannot drive through: [x0, y0, x1, y1]
const OBSTACLES = [
  [C.BLUE_HUB.x - 0.6, C.BLUE_HUB.y - 0.6, C.BLUE_HUB.x + 0.6, C.BLUE_HUB.y + 0.6],
  [C.RED_HUB.x - 0.6, C.RED_HUB.y - 0.6, C.RED_HUB.x + 0.6, C.RED_HUB.y + 0.6],
  ...TRENCH_BOXES.slice(0, 4).map(b => [b[0], b[1], b[3], b[4]]),
];

/** Height of the floor (bumps) at a field point. */
export function floorHeight(x, y) {
  const inY = (y > C.BUMP_Y_OUTER && y < W / 2 - C.BUMP_Y_INNER) || (y > W / 2 + C.BUMP_Y_INNER && y < W - C.BUMP_Y_OUTER);
  if (!inY) return 0;
  const [a, p, b] = C.BUMP_X;
  const prof = (u, s, pk, e) => (u <= s || u >= e) ? 0 : (u < pk ? (u - s) / (pk - s) : (e - u) / (e - pk)) * C.BUMP_HEIGHT;
  return Math.max(prof(x, a, p, b), prof(x, L - b, L - p, L - a));
}

/** Ball flight in a vertical plane with drag. Returns height and vertical speed at distance d. */
function flight(speed, pitch, d, dClear) {
  let x = 0, z = 0, vx = speed * Math.cos(pitch), vz = speed * Math.sin(pitch), t = 0, zClear = Infinity;
  const dt = 0.008;
  while (x < d && t < 4) {
    const sp = Math.hypot(vx, vz), k = C.DRAG_K * sp;
    const nvx = vx - k * vx * dt, nvz = vz - (C.GRAVITY + k * vz) * dt;
    const nx = x + vx * dt, nz = z + vz * dt;
    if (dClear !== undefined && x < dClear && nx >= dClear) zClear = z + (nz - z) * (dClear - x) / (nx - x);
    if (nx >= d) {
      const f = (d - x) / (nx - x);
      return { z: z + (nz - z) * f, vz, t: t + dt * f, zClear };
    }
    x = nx; z = nz; vx = nvx; vz = nvz; t += dt;
    if (z < -3) break;
  }
  return { z: -Infinity, vz: -1, t, zClear };
}

export class Robot {
  constructor(fuel) {
    this.fuel = fuel;
    this.reset();
  }

  reset() {
    this.x = 2.0; this.y = 2.6; this.heading = 0;
    this.vx = 0; this.vy = 0; this.omega = 0;
    this.z = 0; this.pitch = 0; this.roll = 0;
    this.flatTimer = 1;
    this.headingOffset = 0;
    this.fieldRelative = true;
    this.xBrake = false;
    this.steer = [0, 0, 0, 0]; this.wheelAngle = [0, 0, 0, 0];
    this.turret = 0; this.turretVel = 0; this.hood = 0;
    this.pivot = C.INTAKE_STOW_DEG; this.pivotTarget = C.INTAKE_STOW_DEG;
    this.flywheel = 0; this.flywheelTarget = 0;
    this.intaking = false; this.ejecting = false; this.reversing = false;
    this.autoAim = true;
    this.stored = C.INITIAL_FUEL;
    this.shotTimer = 0; this.ejectTimer = 0; this.aimTimer = 0;
    this.aim = null;
    this.rollers = { intake: 0, shooter: 0, feeder: 0, spindexer: 0 };
    this.status = { ready: false, reason: 'idle', target: 'hub' };
    this.shots = 0;
  }

  get deployed() { return this.pivot < 60; }
  get xMax() { return this.pivot < 100 ? C.ROBOT_LENGTH / 2 + (C.INTAKE_REACH - C.ROBOT_LENGTH / 2) * clamp((100 - this.pivot) / 100, 0, 1) : C.ROBOT_LENGTH / 2; }
  get isFlat() { return this.flatTimer >= C.TILT_DEBOUNCE; }

  /** Where the ball leaves the shooter, in field coordinates. */
  launchPoint() {
    const t = this.turret * DEG;
    const lx = C.TURRET_PIVOT[0] + C.LAUNCH_LOCAL[0] * Math.cos(t) - C.LAUNCH_LOCAL[1] * Math.sin(t);
    const ly = C.TURRET_PIVOT[1] + C.LAUNCH_LOCAL[0] * Math.sin(t) + C.LAUNCH_LOCAL[1] * Math.cos(t);
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return { x: this.x + lx * c - ly * s, y: this.y + lx * s + ly * c, z: this.z + C.LAUNCH_LOCAL[2], lx, ly };
  }

  inTrenchZone() {
    const look = C.TRENCH_LOOKAHEAD_SEC;
    const fx = this.x + this.vx * look, fy = this.y + this.vy * look;
    const near = (x, y) => (y < C.TRENCH_WIDTH + C.TRENCH_BLOCK_WIDTH + 0.3 || y > W - 1.57 - 0.3) &&
      ((x > 3.96 - 0.75 && x < 5.18 + 0.75) || (x > L - 5.18 - 0.75 && x < L - 3.96 + 0.75));
    return near(this.x, this.y) || near(fx, fy);
  }

  // ---- auto-aim: lowest launch angle that drops the ball into the hub ----
  solveAim() {
    const lp = this.launchPoint();
    const hubShot = this.x < C.HUB_POSE[0];
    let tx, ty, tz, dClearOff;
    if (hubShot) {
      tx = C.BLUE_HUB.x; ty = C.BLUE_HUB.y; tz = C.HUB.entryHeight; dClearOff = C.HUB.entryRadius + 0.06;
    } else {
      tx = 1.0; ty = C.HUB_POSE[1] + (this.y < C.HUB_POSE[1] ? -C.PASS_OFFSET : C.PASS_OFFSET); tz = C.FUEL_RADIUS;
    }
    // launch-point velocity (robot translation + rotation)
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const rx = lp.lx * c - lp.ly * s, ry = lp.lx * s + lp.ly * c;
    const lvx = this.vx - this.omega * ry, lvy = this.vy + this.omega * rx;
    const vmax = C.MAX_SHOOTER_RPS * C.SHOOTER_M_PER_REV * (1 - C.PERCENT_LOSS);
    let sol = null, tof = 0;
    for (let iter = 0; iter < 3; iter++) {
      // aim at where the target appears once the robot's own motion is removed
      const ax = tx - lvx * tof - lp.x, ay = ty - lvy * tof - lp.y;
      const d = Math.hypot(ax, ay), dz = tz - lp.z;
      sol = null;
      for (let pitchDeg = C.PITCH_LIMITS[0]; pitchDeg <= 88; pitchDeg += 1) {
        const pitch = pitchDeg * DEG;
        let lo = 2, hi = vmax;
        const top = flight(hi, pitch, d);
        if (top.z < dz) continue;                       // cannot reach even at full speed
        for (let k = 0; k < 18; k++) {
          const mid = (lo + hi) / 2;
          if (flight(mid, pitch, d).z < dz) lo = mid; else hi = mid;
        }
        const f = flight(hi, pitch, d, hubShot ? d - dClearOff : undefined);
        if (f.vz >= 0) continue;                        // must be falling at the target
        if (hubShot && f.zClear < C.HUB.entryHeight + C.HUB_SHOT_PADDING + C.FUEL_RADIUS) continue; // clip the rim
        sol = { yaw: Math.atan2(ay, ax), pitchDeg, speed: hi * (hubShot ? 1 : C.PASS_SPEED_SCALE), tof: f.t, dist: d };
        break;
      }
      if (!sol) break;
      tof = sol.tof;
    }
    this.status.target = hubShot ? 'hub' : 'pass';
    this.aim = sol;
  }

  step(dt, input, matchActive) {
    const enabled = matchActive;
    // ---------------- drive ----------------
    let tvx = 0, tvy = 0, tom = 0;
    this.xBrake = false;
    if (enabled) {
      const db = v => Math.abs(v) < C.STICK_DEADBAND ? 0 : (v - Math.sign(v) * C.STICK_DEADBAND) / (1 - C.STICK_DEADBAND);
      let fwd = db(input.ly), left = db(input.lx), rot = db(input.rx);
      const m = Math.hypot(fwd, left);
      if (m > 1) { fwd /= m; left /= m; }
      let ux = fwd * C.MAX_VELOCITY, uy = left * C.MAX_VELOCITY;
      const frame = this.fieldRelative ? this.headingOffset : this.heading;
      tvx = ux * Math.cos(frame) - uy * Math.sin(frame);
      tvy = ux * Math.sin(frame) + uy * Math.cos(frame);
      tom = rot * C.MAX_ANGULAR_VELOCITY;
      if (input.povX || input.povY) {               // D-pad nudges, robot-relative
        const nx = input.povY * C.NUDGE_SPEED, ny = input.povX * C.NUDGE_SPEED;
        tvx = nx * Math.cos(this.heading) - ny * Math.sin(this.heading);
        tvy = nx * Math.sin(this.heading) + ny * Math.cos(this.heading);
      }
      if (input.a) {                                // trench align: hold a lane's centre line
        const lane = this.y < W / 2 ? C.HUB_POSE[1] - C.TRENCH_ALIGN_Y : C.HUB_POSE[1] + C.TRENCH_ALIGN_Y;
        tvy = clamp((lane - this.y) * 5, -C.TRENCH_ALIGN_MAX_V, C.TRENCH_ALIGN_MAX_V);
        const snap = Math.round(this.heading / (Math.PI / 2)) * (Math.PI / 2);
        tom = clamp(wrapPi(snap - this.heading) * 5, -4, 4);
      }
      if (input.x) { tvx = 0; tvy = 0; tom = 0; this.xBrake = true; }
    }
    const brake = this.xBrake ? 3 : 1;
    const dvx = tvx - this.vx, dvy = tvy - this.vy, dv = Math.hypot(dvx, dvy);
    const maxDv = C.TRANSLATION_SLEW * brake * dt;
    if (dv > maxDv) { this.vx += dvx / dv * maxDv; this.vy += dvy / dv * maxDv; } else { this.vx = tvx; this.vy = tvy; }
    this.omega = moveToward(this.omega, tom, C.ROTATION_SLEW * dt);
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.heading = wrapPi(this.heading + this.omega * dt);
    this.collide();

    // bumps: ride height and tilt from the four wheel contact heights
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const h = C.MODULES.map(([mx, my]) => floorHeight(this.x + mx * c - my * s, this.y + mx * s + my * c));
    const k = Math.min(1, dt * 30);
    this.z += ((h[0] + h[1] + h[2] + h[3]) / 4 - this.z) * k;
    this.pitch += (Math.atan2((h[0] + h[1] - h[2] - h[3]) / 2, 0.528) - this.pitch) * k;   // nose up
    this.roll += (Math.atan2((h[0] + h[2] - h[1] - h[3]) / 2, 0.578) - this.roll) * k;     // left up
    const tilt = Math.max(Math.abs(this.pitch), Math.abs(this.roll)) / DEG;
    this.flatTimer = tilt < C.TILT_THRESHOLD_DEG ? this.flatTimer + dt : 0;

    // swerve module visuals
    const lvx = this.vx * c + this.vy * s, lvy = -this.vx * s + this.vy * c;
    C.MODULES.forEach(([mx, my], i) => {
      let wx = lvx - this.omega * my, wy = lvy + this.omega * mx;
      let sp = Math.hypot(wx, wy);
      if (this.xBrake && sp < 0.05) { this.steer[i] = moveToward(this.steer[i], Math.atan2(my, mx), 20 * dt); return; }
      if (sp > 0.03) {
        let a = Math.atan2(wy, wx), d = wrapPi(a - this.steer[i]);
        if (Math.abs(d) > Math.PI / 2) { d = wrapPi(d + Math.PI); sp = -sp; }   // drive backwards rather than spin 180
        this.steer[i] += clamp(d, -25 * dt, 25 * dt);
        this.wheelAngle[i] += sp / C.WHEEL_RADIUS * dt;
      }
    });

    // ---------------- intake ----------------
    if (enabled) {
      if (input.pressed.y) this.pivotTarget = C.INTAKE_STOW_DEG;
      if (input.lt > 0.3 || input.rb) this.pivotTarget = C.INTAKE_READY_DEG;
      this.intaking = input.lt > 0.3 && this.pivot < 12 && this.stored < C.HOPPER_CAPACITY;
      this.ejecting = !!input.rb && this.pivot < 12;
      this.reversing = !!input.lb;
      if (input.pressed.start) this.autoAim = !this.autoAim;
      if (input.pressed.b) this.headingOffset = this.heading;
      if (input.pressed.back) { this.pivotTarget = C.INTAKE_STOW_DEG; this.autoAim = true; this.fieldRelative = true; this.headingOffset = 0; }
    } else { this.intaking = false; this.ejecting = false; this.reversing = false; }
    this.pivot = moveToward(this.pivot, this.pivotTarget, C.PIVOT_MAX_VEL * dt);
    const rollDir = (input.lt > 0.3 && enabled ? 1 : 0) - (this.ejecting ? 1 : 0);
    this.rollers.intake += rollDir * 26 * 2 * Math.PI * dt;
    if (this.ejecting) {
      this.ejectTimer -= dt;
      if (this.stored > 0 && this.ejectTimer <= 0) {
        this.ejectTimer = C.EJECT_INTERVAL;
        this.stored--;
        const ex = C.INTAKE_REACH + 0.12, ey = (Math.random() - 0.5) * 0.5;
        this.fuel.spawn(this.x + ex * c - ey * s, this.y + ex * s + ey * c, this.z + 0.09,
          this.vx + 1.6 * c, this.vy + 1.6 * s, 0);
      }
    }

    // ---------------- aim ----------------
    this.aimTimer -= dt;
    if (this.aimTimer <= 0) { this.aimTimer = 0.04; if (this.autoAim) this.solveAim(); else this.aim = null; }
    const trench = this.inTrenchZone();
    let turretTarget = 0, hoodTarget = 0, wantSpeed = 0;
    const aim = this.aim;
    if (aim && enabled) {
      // turret angle relative to the robot; pick the reachable equivalent closest to now
      let t = wrapPi(aim.yaw - this.heading - C.TURRET_FORWARD_DEG * DEG) / DEG;
      const opts = [t, t + 360, t - 360].filter(a => a >= C.TURRET_LIMITS[0] && a <= C.TURRET_LIMITS[1]);
      if (opts.length) turretTarget = opts.reduce((b, a) => Math.abs(a - this.turret) < Math.abs(b - this.turret) ? a : b);
      hoodTarget = trench ? 0 : clamp(90 - aim.pitchDeg, ...C.HOOD_LIMITS);
      wantSpeed = aim.speed;
    }
    // turret: speed- and acceleration-limited; feed forward the robot's own rotation
    const err = turretTarget - this.turret;
    const stopV = Math.sqrt(2 * C.TURRET_MAX_ACC * Math.abs(err)) * Math.sign(err);
    const tv = clamp(stopV, -C.TURRET_MAX_VEL, C.TURRET_MAX_VEL);
    this.turretVel = moveToward(this.turretVel, tv, C.TURRET_MAX_ACC * dt);
    this.turret = clamp(this.turret + this.turretVel * dt, ...C.TURRET_LIMITS);
    if (Math.abs(err) < 0.05 && Math.abs(this.turretVel) < 5) { this.turret = turretTarget; this.turretVel = 0; }
    this.hood = moveToward(this.hood, hoodTarget, C.HOOD_MAX_VEL * dt);

    // ---------------- shooter ----------------
    const trigger = enabled && input.rt > 0.3;
    const canShoot = !!aim && this.isFlat && !trench && !this.reversing;
    this.flywheelTarget = trigger && canShoot && this.stored > 0
      ? clamp(wantSpeed / (C.SHOOTER_M_PER_REV * (1 - C.PERCENT_LOSS)), 0, C.MAX_SHOOTER_RPS) : 0;
    this.flywheel = moveToward(this.flywheel, this.flywheelTarget,
      (this.flywheelTarget > this.flywheel ? C.FLYWHEEL_ACCEL : C.FLYWHEEL_DECEL) * dt);
    const turretOk = Math.abs(turretTarget - this.turret) <= C.TURRET_TOLERANCE_DEG * 0.2;
    const hoodOk = Math.abs(hoodTarget - this.hood) <= C.HOOD_TOLERANCE_DEG * 0.25;
    const speedOk = this.flywheelTarget > 0 && this.flywheel >= this.flywheelTarget * 0.985;
    const ready = trigger && canShoot && turretOk && hoodOk && speedOk && this.stored > 0;
    this.status.ready = ready;
    this.status.reason = !this.autoAim ? 'auto-aim off' : !aim ? 'no shot from here' : trench ? 'hood down for trench'
      : !this.isFlat ? 'not level' : this.stored <= 0 ? 'empty' : !trigger ? 'aimed' : !speedOk ? 'spinning up'
      : !turretOk ? 'turret moving' : !hoodOk ? 'hood moving' : 'firing';
    this.shotTimer -= dt;
    const feeding = ready;
    if (ready && this.shotTimer <= 0) { this.shotTimer = C.SHOT_INTERVAL; this.launch(); }
    this.rollers.shooter += this.flywheel * 2 * Math.PI * dt;
    const feedDir = this.reversing ? -1 : feeding ? 1 : 0;
    this.rollers.feeder += feedDir * 40 * 2 * Math.PI * dt;
    this.rollers.spindexer -= feedDir * 2 * 2 * Math.PI * dt;
  }

  launch() {
    const lp = this.launchPoint();
    const speed = this.flywheel * C.SHOOTER_M_PER_REV * (1 - C.PERCENT_LOSS) * (1 + (Math.random() - 0.5) * 0.012);
    const pitch = (90 - this.hood + (Math.random() - 0.5) * 0.5) * DEG;
    const yaw = this.heading + (this.turret + C.TURRET_FORWARD_DEG + (Math.random() - 0.5) * 0.6) * DEG;
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const rx = lp.lx * c - lp.ly * s, ry = lp.lx * s + lp.ly * c;
    const hv = speed * Math.cos(pitch);
    this.fuel.spawn(lp.x, lp.y, lp.z,
      hv * Math.cos(yaw) + this.vx - this.omega * ry,
      hv * Math.sin(yaw) + this.vy + this.omega * rx,
      speed * Math.sin(pitch));
    this.stored--; this.shots++;
  }

  // keep the bumper rectangle (plus the deployed intake) inside the field and out of obstacles
  collide() {
    const xMin = -C.ROBOT_LENGTH / 2, xMax = this.xMax, hw = C.ROBOT_WIDTH / 2;
    for (let pass = 0; pass < 2; pass++) {
      const c = Math.cos(this.heading), s = Math.sin(this.heading);
      const cor = [[xMin, -hw], [xMin, hw], [xMax, -hw], [xMax, hw]].map(([a, b]) => [this.x + a * c - b * s, this.y + a * s + b * c]);
      const xs = cor.map(p => p[0]), ys = cor.map(p => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      if (minX < 0) { this.x -= minX; if (this.vx < 0) this.vx = 0; }
      if (maxX > L) { this.x -= maxX - L; if (this.vx > 0) this.vx = 0; }
      if (minY < 0) { this.y -= minY; if (this.vy < 0) this.vy = 0; }
      if (maxY > W) { this.y -= maxY - W; if (this.vy > 0) this.vy = 0; }
      const cx = this.x + (xMin + xMax) / 2 * c, cy = this.y + (xMin + xMax) / 2 * s, hl = (xMax - xMin) / 2;
      for (const o of OBSTACLES) {
        if (maxX < o[0] || minX > o[2] || maxY < o[1] || minY > o[3]) continue;
        const ox = (o[0] + o[2]) / 2, oy = (o[1] + o[3]) / 2, ohx = (o[2] - o[0]) / 2, ohy = (o[3] - o[1]) / 2;
        // separating-axis test: field axes and robot axes
        let best = Infinity, bx = 0, by = 0, hit = true;
        for (const [ax, ay] of [[1, 0], [0, 1], [c, s], [-s, c]]) {
          const rr = hl * Math.abs(ax * c + ay * s) + hw * Math.abs(-ax * s + ay * c);
          const ro = ohx * Math.abs(ax) + ohy * Math.abs(ay);
          const d = (cx - ox) * ax + (cy - oy) * ay;
          const overlap = rr + ro - Math.abs(d);
          if (overlap <= 0) { hit = false; break; }
          if (overlap < best) { best = overlap; const sg = d < 0 ? -1 : 1; bx = ax * sg; by = ay * sg; }
        }
        if (!hit) continue;
        this.x += bx * best; this.y += by * best;
        const vn = this.vx * bx + this.vy * by;
        if (vn < 0) { this.vx -= bx * vn; this.vy -= by * vn; }
        this.omega *= 0.9;
      }
    }
  }
}
