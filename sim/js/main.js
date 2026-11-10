import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as C from './constants.js';
import { FuelSim } from './fuel.js';
import { Robot } from './robot.js';
import { Input, KEYMAP } from './input.js';
import { buildField } from './field.js';

const DEG = Math.PI / 180;
const L = C.FIELD_LENGTH, W = C.FIELD_WIDTH;
const $ = id => document.getElementById(id);
const f2t = (x, y, z) => new THREE.Vector3(x, z, -y);     // field (z-up) -> three.js (y-up)

// ---------------- renderer and scene ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14161a);
scene.fog = new THREE.Fog(0x14161a, 30, 60);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.copy(f2t(L / 2 - 4, W / 2 - 5, 14));
sun.target.position.copy(f2t(L / 2, W / 2, 0));
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 7, bottom: -7, near: 2, far: 30 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target, new THREE.HemisphereLight(0xdfe8ff, 0x30343a, 0.5));

const world = new THREE.Group();          // children use field coordinates (z up)
world.rotation.x = -Math.PI / 2;
scene.add(world);
world.add(buildField());

// ---------------- simulation objects ----------------
const fuel = new FuelSim();
const robot = new Robot(fuel);
const input = new Input();
fuel.onIntake = () => { if (robot.stored >= C.HOPPER_CAPACITY) return false; robot.stored++; return true; };
let score = 0, matchTime = C.MATCH_SECONDS, matchState = 'ready', paused = false;
fuel.onScore = h => { if (h.dir === 1 && matchState === 'running') score++; };

function resetMatch() {
  fuel.clear(); fuel.spawnStartingFuel();
  robot.reset();
  score = 0; matchTime = C.MATCH_SECONDS; matchState = 'ready';
  $('banner').classList.add('hidden');
}

// fuel instances
const MAX_BALLS = fuel.max;
const ballMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(C.FUEL_RADIUS, 14, 10),
  new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.55 }), MAX_BALLS);
ballMesh.castShadow = true; ballMesh.receiveShadow = true; ballMesh.frustumCulled = false;
world.add(ballMesh);
const tmpM = new THREE.Matrix4();

// ---------------- robot model ----------------
const robotGroup = new THREE.Group();
robotGroup.rotation.order = 'ZYX';
world.add(robotGroup);
const joints = {};
const AX = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 0, -1), Z: new THREE.Vector3(0, 1, 0) }; // Blender axis in glTF space
let rollerJoints = [], sideWalls = [], hopperRestX = 0;

// fuel carried in the hopper
const slots = [];
for (let z = 0.27; z < 0.45; z += 0.14) for (let x = -0.27; x <= 0.24; x += 0.152) for (let y = -0.27; y <= 0.28; y += 0.152) {
  if (Math.hypot(x - C.TURRET_PIVOT[0], y - C.TURRET_PIVOT[1]) < 0.2) continue;
  slots.push([x + (Math.random() - 0.5) * 0.02, y + (Math.random() - 0.5) * 0.02, z]);
}
const hopperMesh = new THREE.InstancedMesh(ballMesh.geometry, ballMesh.material, slots.length);
hopperMesh.castShadow = true; hopperMesh.frustumCulled = false; hopperMesh.count = 0;
slots.forEach((s, i) => hopperMesh.setMatrixAt(i, tmpM.makeTranslation(s[0], s[1], s[2])));
robotGroup.add(hopperMesh);

const loaded = Promise.all([
  new GLTFLoader().loadAsync('assets/artemis.glb'),
  fetch('assets/artemis_joints.json').then(r => r.json()),
]).then(([gltf, spec]) => {
  const wrap = new THREE.Group();
  wrap.rotation.x = Math.PI / 2;            // glTF is y-up; the robot group is z-up
  wrap.add(gltf.scene);
  robotGroup.add(wrap);
  gltf.scene.traverse(o => {
    if (o.name.startsWith('J_')) joints[o.name.slice(2)] = o;
    if (o.isMesh) {
      o.castShadow = true; o.receiveShadow = true;
      if (o.material.transparent || o.material.opacity < 1) {
        o.material.transparent = true; o.material.depthWrite = false; o.castShadow = false; o.renderOrder = 2;
        o.material.side = THREE.DoubleSide;
      }
      if (o.name.includes('Hopper_Side_Wall')) {
        const pos = o.geometry.attributes.position;
        let min = Infinity;
        for (let i = 0; i < pos.count; i++) min = Math.min(min, pos.getX(i));
        const front = [];
        for (let i = 0; i < pos.count; i++) if (pos.getX(i) > min + 0.03) front.push([i, pos.getX(i)]);
        o.frustumCulled = false;
        sideWalls.push({ pos, front });
      }
    }
  });
  rollerJoints = spec.joints.filter(j => j.name.startsWith('roller_')).map(j => ({
    node: joints[j.name], axis: AX[j.axis], group: j.control.replace('_deg', '').replace('_rollers', '').replace('_wheels', ''),
  })).filter(j => j.node);
  if (joints.hopper_ext) hopperRestX = joints.hopper_ext.position.x;
  $('loading').classList.add('hidden');
}).catch(e => { $('loading').textContent = 'Could not load the robot model: ' + e.message; console.error(e); });

const q = new THREE.Quaternion();
function setJoint(name, axis, angle) {
  const j = joints[name];
  if (j) j.quaternion.setFromAxisAngle(AX[axis], angle);
}

function updateModel() {
  robotGroup.position.set(robot.x, robot.y, robot.z);
  robotGroup.rotation.set(robot.roll, -robot.pitch, robot.heading);
  setJoint('turret', 'Z', robot.turret * DEG);
  setJoint('hood', 'X', -robot.hood * DEG);
  setJoint('intake_arm', 'Y', -(robot.pivot - C.INTAKE_STOW_DEG) * DEG);
  const slide = 0.24 * Math.min(1, Math.max(0, (C.INTAKE_STOW_DEG - robot.pivot) / 100));
  if (joints.hopper_ext) joints.hopper_ext.position.x = hopperRestX + slide;
  for (const w of sideWalls) { for (const [i, x] of w.front) w.pos.setX(i, x + slide); w.pos.needsUpdate = true; }
  C.MODULE_NAMES.forEach((n, i) => {
    setJoint('steer_' + n, 'Z', robot.steer[i]);
    setJoint('wheel_' + n, 'Y', robot.wheelAngle[i]);
  });
  setJoint('spindexer', 'Z', robot.rollers.spindexer);
  for (const r of rollerJoints) {
    const a = r.group === 'intake' ? robot.rollers.intake : r.group === 'shooter' ? robot.rollers.shooter : robot.rollers.feeder;
    r.node.quaternion.setFromAxisAngle(r.axis, a);
  }
  hopperMesh.count = Math.min(robot.stored, slots.length);
  for (let i = 0; i < fuel.n; i++) ballMesh.setMatrixAt(i, tmpM.makeTranslation(fuel.px[i], fuel.py[i], fuel.pz[i]));
  ballMesh.count = fuel.n; ballMesh.instanceMatrix.needsUpdate = true;
}

// ---------------- cameras ----------------
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
const CAMERAS = ['Driver station', 'Follow', 'Overhead', 'Chase'];
let camIndex = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camSnap = true;
function updateCamera(dt) {
  let p, l, up = new THREE.Vector3(0, 1, 0), fov = 50;
  const r = robot;
  if (camIndex === 0) {            // standing behind the blue alliance wall
    p = f2t(-3.6, W / 2, 2.6); l = f2t(Math.max(3.5, Math.min(L - 4, r.x * 0.55 + 2.2)), W / 2 + (r.y - W / 2) * 0.35, 0.2); fov = 52;
  } else if (camIndex === 1) {     // behind the robot, field-aligned so the controls stay intuitive
    const cx = Math.max(0.3, r.x - 3.4), near = 3.4 - (r.x - cx);   // stay inside the alliance wall
    p = f2t(cx, r.y, 2.3 + near * 1.1); l = f2t(r.x + 1.2 - near * 0.3, r.y, 0.4);
  } else if (camIndex === 2) {     // overhead, +x up the screen
    p = f2t(r.x, r.y, 11); l = f2t(r.x, r.y, 0); up = new THREE.Vector3(1, 0, 0); fov = 45;
  } else {                         // chase: behind the robot's own heading
    const c = Math.cos(r.heading), s = Math.sin(r.heading);
    p = f2t(r.x - 2.6 * c, r.y - 2.6 * s, 1.7); l = f2t(r.x + 1.5 * c, r.y + 1.5 * s, 0.5);
  }
  const k = camSnap ? 1 : Math.min(1, dt * (camIndex === 3 ? 5 : 8));
  camPos.lerp(p, k); camLook.lerp(l, k); camSnap = false;
  camera.position.copy(camPos); camera.up.copy(up); camera.lookAt(camLook);
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

// ---------------- HUD ----------------
$('keys').innerHTML = KEYMAP.map(([k, pad, what]) =>
  `<tr><td class="k">${k}</td><td class="p">${pad}</td><td>${what}</td></tr>`).join('');
function fmtTime(t) { const s = Math.max(0, Math.ceil(t)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
let hudTimer = 0;
function updateHud(dt) {
  hudTimer -= dt; if (hudTimer > 0) return; hudTimer = 0.08;
  $('clock').textContent = fmtTime(matchTime);
  $('score').textContent = score;
  $('stored').textContent = robot.stored;
  $('storedBar').style.width = (100 * robot.stored / C.HOPPER_CAPACITY) + '%';
  $('rps').textContent = robot.flywheel.toFixed(0);
  $('rpsBar').style.width = (100 * robot.flywheel / C.MAX_SHOOTER_RPS) + '%';
  const st = $('status');
  st.textContent = robot.status.reason + (robot.autoAim && robot.aim ? ` · ${robot.status.target} ${robot.aim.dist.toFixed(1)} m` : '');
  st.className = robot.status.ready ? 'ok' : (robot.aim ? '' : 'warn');
  $('speed').textContent = Math.hypot(robot.vx, robot.vy).toFixed(1);
  $('cam').textContent = CAMERAS[camIndex];
  $('pad').textContent = input.gamepadName ? 'Controller: ' + input.gamepadName.slice(0, 38) : 'Keyboard (a controller works too)';
  $('phase').textContent = matchState === 'ready' ? 'Drive to start the clock' : paused ? 'Paused' :
    matchTime > C.MATCH_SECONDS - 20 ? 'First 20 s' : matchTime <= 30 ? 'Last 30 s' : 'Teleop';
}

// ---------------- main loop ----------------
resetMatch();
let last = performance.now(), acc = 0;
function tick(dt) {
  const s = input.poll();
  for (const code of input.takeUi()) {
    if (code === 'KeyC') { camIndex = (camIndex + 1) % CAMERAS.length; }
    if (/^Digit[1-4]$/.test(code)) camIndex = +code.slice(5) - 1;
    if (code === 'KeyP') paused = !paused;
    if (code === 'KeyH') $('help').classList.toggle('hidden');
    if (code === 'Enter') resetMatch();
  }
  if (matchState === 'ready' && input.anyInput) { matchState = 'running'; $('help').classList.add('hidden'); }
  if (paused) return;
  acc = Math.min(acc + dt, 0.06);
  while (acc >= C.PHYSICS_DT) {
    acc -= C.PHYSICS_DT;
    if (matchState === 'running') {
      matchTime -= C.PHYSICS_DT;
      if (matchTime <= 0) {
        matchState = 'over'; matchTime = 0;
        $('bannerText').innerHTML = `Match over<br><b>${score}</b> fuel scored`;
        $('banner').classList.remove('hidden');
      }
    }
    robot.step(C.PHYSICS_DT, s, matchState !== 'over');
    s.pressed = {};                       // button edges apply to one physics step only
    fuel.robot = { x: robot.x, y: robot.y, z: robot.z, heading: robot.heading, vx: robot.vx, vy: robot.vy, omega: robot.omega,
      xMin: -C.ROBOT_LENGTH / 2, xMax: robot.xMax, intakeReach: C.INTAKE_REACH, intaking: robot.intaking, catchEnabled: true };
    fuel.step(C.PHYSICS_DT);
  }
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  tick(dt);
  updateModel(); updateCamera(dt); updateHud(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// for automated tests and tinkering in the console
window.sim = { robot, fuel, input, C, loaded, get score() { return score; }, get matchState() { return matchState; },
  get matchTime() { return matchTime; }, setCamera(i) { camIndex = i; camSnap = true; }, resetMatch, tick,
  render() { updateModel(); updateCamera(1); renderer.render(scene, camera); } };
