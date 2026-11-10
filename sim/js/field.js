// REBUILT field visuals, built from the same dimensions the physics uses
// (FuelSim.java in the robot code). Geometry is in field coordinates:
// x along the field, y across, z up, origin at the blue alliance's right corner.
import * as THREE from 'three';
import * as C from './constants.js';
import { TRENCH_BOXES } from './fuel.js';

const L = C.FIELD_LENGTH, W = C.FIELD_WIDTH;
const BLUE = 0x1f4fd8, RED = 0xc8202a;

function box(x0, y0, z0, x1, y1, z1, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function carpetTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3d4046'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 50 + Math.random() * 40;
    g.fillStyle = `rgba(${v},${v + 2},${v + 8},0.35)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(L / 0.6, W / 0.6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function line(x0, y0, x1, y1, color, width = 0.05) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, width),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.003);
  m.rotation.z = Math.atan2(dy, dx);
  m.receiveShadow = true;
  return m;
}

function bump(x0, xp, x1, y0, y1, color) {
  // triangular prism: rises from x0 to the peak at xp, falls to x1
  const shape = new THREE.Shape();
  shape.moveTo(x0, 0); shape.lineTo(xp, C.BUMP_HEIGHT); shape.lineTo(x1, 0); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  // extrude is along +z of the shape's plane (x, height); map (x, h, d) -> (x, y0 + d, h)
  geo.applyMatrix4(new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, y0, 0, 1, 0, 0, 0, 0, 0, 1));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.75, side: THREE.DoubleSide }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function hub(h, color) {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.3 });
  const panel = new THREE.MeshStandardMaterial({ color, roughness: 0.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const s = C.HUB.side / 2, top = C.HUB.entryHeight;
  // body panels (open at the bottom on the exit side, where scored fuel rolls out)
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const isExit = dx === h.dir;
    const z0 = isExit ? 1.05 : 0.0;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(C.HUB.side, top - 0.1 - z0), panel);
    p.position.set(h.x + dx * s, h.y + dy * s, (top - 0.1 + z0) / 2);
    p.rotation.set(Math.PI / 2, dx !== 0 ? Math.PI / 2 : 0, 0);
    p.castShadow = true;
    g.add(p);
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.add(box(h.x + sx * s - 0.03, h.y + sy * s - 0.03, 0, h.x + sx * s + 0.03, h.y + sy * s + 0.03, top - 0.1, frame));
  // funnel: wide opening at the entry height narrowing into the body
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(C.HUB.entryRadius, 0.3, 0.5, 6, 1, true),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
  funnel.rotation.x = Math.PI / 2; funnel.position.set(h.x, h.y, top - 0.25);
  funnel.castShadow = true;
  g.add(funnel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(C.HUB.entryRadius, 0.025, 8, 6), frame);
  rim.position.set(h.x, h.y, top); rim.rotation.z = Math.PI / 6;
  g.add(rim);
  // backstop net on the neutral-zone side
  const netTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); x.strokeStyle = 'rgba(230,230,230,0.9)'; x.lineWidth = 3;
    x.strokeRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(15, 16);
    return t;
  })();
  const nx = h.x + C.HUB.netOffset * h.dir;
  const net = new THREE.Mesh(new THREE.PlaneGeometry(C.HUB.netWidth, C.HUB.netMax - C.HUB.netMin),
    new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  net.position.set(nx, h.y, (C.HUB.netMax + C.HUB.netMin) / 2); net.rotation.set(Math.PI / 2, Math.PI / 2, 0);
  g.add(net);
  for (const sy of [-1, 1]) g.add(box(nx - 0.02, h.y + sy * C.HUB.netWidth / 2 - 0.02, 0, nx + 0.02, h.y + sy * C.HUB.netWidth / 2 + 0.02, C.HUB.netMax, frame));
  g.add(box(nx - 0.02, h.y - C.HUB.netWidth / 2, C.HUB.netMax - 0.04, nx + 0.02, h.y + C.HUB.netWidth / 2, C.HUB.netMax, frame));
  return g;
}

export function buildField() {
  const g = new THREE.Group();
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(L, W),
    new THREE.MeshStandardMaterial({ map: carpetTexture(), roughness: 0.95 }));
  carpet.position.set(L / 2, W / 2, 0); carpet.receiveShadow = true;
  g.add(carpet);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(L + 12, W + 10),
    new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 1 }));
  apron.position.set(L / 2, W / 2, -0.01); apron.receiveShadow = true;
  g.add(apron);

  // lines: field border, centre line, alliance-zone lines at the hub-side edge of the bumps
  g.add(line(L / 2, 0, L / 2, W, 0xe8e8e8));
  g.add(line(C.BUMP_X[0], 0, C.BUMP_X[0], W, BLUE));
  g.add(line(L - C.BUMP_X[0], 0, L - C.BUMP_X[0], W, RED));
  // depot markings where the starting fuel sits
  for (const [x, y, col] of [[0.31, 5.95, BLUE], [L - 0.31, 2.09, RED]]) {
    g.add(line(x - 0.31, y - 0.5, x + 0.31, y - 0.5, col, 0.04));
    g.add(line(x - 0.31, y + 0.5, x + 0.31, y + 0.5, col, 0.04));
    g.add(line(x + (x < L / 2 ? 0.31 : -0.31), y - 0.5, x + (x < L / 2 ? 0.31 : -0.31), y + 0.5, col, 0.04));
  }

  // perimeter: guardrails on the long sides, alliance walls on the ends
  const rail = new THREE.MeshStandardMaterial({ color: 0xb9bdc4, roughness: 0.45, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe6ff, roughness: 0.1, transparent: true, opacity: 0.13, depthWrite: false });
  for (const y of [-0.03, W]) {
    g.add(box(0, y, 0, L, y + 0.03, 0.08, rail));
    g.add(box(0, y, 0.47, L, y + 0.03, 0.51, rail));
    const p = box(0, y + 0.01, 0.08, L, y + 0.02, 0.47, glass); p.castShadow = false; g.add(p);
    for (let x = 0; x <= L + 0.01; x += L / 12) g.add(box(x - 0.02, y, 0, x + 0.02, y + 0.03, 0.51, rail));
  }
  for (const [x, col] of [[-0.04, BLUE], [L, RED]]) {
    const wallMat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
    g.add(box(x, 0, 0, x + 0.04, W, 0.5, wallMat));
    const p = box(x + 0.01, 0, 0.5, x + 0.03, W, 1.98, glass); p.castShadow = false; g.add(p);
    g.add(box(x, 0, 1.94, x + 0.04, W, 1.98, rail));
    for (let y = 0; y <= W + 0.01; y += W / 4) g.add(box(x, y - 0.02, 0.5, x + 0.04, y + 0.02, 1.98, rail));
  }

  // bumps
  const [a, p, b] = C.BUMP_X;
  for (const [y0, y1] of [[C.BUMP_Y_OUTER, W / 2 - C.BUMP_Y_INNER], [W / 2 + C.BUMP_Y_INNER, W - C.BUMP_Y_OUTER]]) {
    g.add(bump(a, p, b, y0, y1, BLUE));
    g.add(bump(L - b, L - p, L - a, y0, y1, RED));
  }

  // trenches: a block beside each bump and a bar across the lane
  const trenchMat = new THREE.MeshStandardMaterial({ color: 0x30343b, roughness: 0.55, metalness: 0.4 });
  TRENCH_BOXES.forEach((t, i) => {
    const m = box(t[0], t[1], t[2], t[3], t[4], t[5], trenchMat);
    g.add(m);
    if (i >= 4) {   // bar: add the outer upright at the guardrail
      const yWall = t[1] < 1 ? 0 : W - 0.06;
      g.add(box(t[0], yWall, 0, t[3], yWall + 0.06, t[2], trenchMat));
    }
  });

  g.add(hub(C.BLUE_HUB, BLUE));
  g.add(hub(C.RED_HUB, RED));
  return g;
}
