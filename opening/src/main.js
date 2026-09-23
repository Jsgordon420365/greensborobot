// greensborobot — opening cinematic director.
// One master clock. It holds at the beckon until the visitor follows him.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { T, T2, WAIT, CITY, WHITE } from './config.js';
import { prog, clamp, lerp, smooth, easeOut, easeIn, easeInOut, backOut, spring, wobble, noise1 } from './util.js';
import { loadCharacterAssets, Bot, PeekHead, PlushArm } from './character.js';
import { WhiteStage } from './whiteStage.js';
import { City } from './city.js';
import { makeComposer } from './post.js';
import { Sound } from './audio.js';
import { rope as ropeTex } from './textures.js';

const Q = new URLSearchParams(location.search);
const DEBUG = Q.has('debug');
const CAPTURE = Q.get('cap');
const START = parseFloat(Q.get('t') || '0');
const FREEZE = Q.has('freeze') || !!CAPTURE;

// ---------------- renderer ----------------
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!CAPTURE || DEBUG });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;   // keeps the canonical greens + paper whites honest
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 200);
const look = new THREE.Vector3();

function size() {
  const w = canvas.clientWidth || window.innerWidth || 1280, h = canvas.clientHeight || window.innerHeight || 720;
  return [Math.max(w, 320), Math.max(h, 240)];
}
let W = 0, H = 0;
function resize() {
  const [w, h] = size();
  if (w === W && h === H) return;
  W = w; H = h;
  renderer.setSize(w, h, false);
  if (post) { post.composer.setSize(w, h); post.lens.uRes.value.set(w, h); }
  camera.aspect = w / h;
}
new ResizeObserver(resize).observe(canvas);

// narrow screens keep the stage's width by widening the vertical field of view
function fovFor(fov, minAspect = 1.55) {
  const a = camera.aspect;
  if (a >= minAspect) return fov;
  return Math.min(95, (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (minAspect / a)) * 180) / Math.PI);
}
function setCam(p, l, fov, roll = 0, minAspect = 1.2) {
  camera.position.set(...p);
  look.set(...l);
  camera.up.set(Math.sin(roll), Math.cos(roll), 0);
  camera.lookAt(look);
  camera.fov = fovFor(fov, minAspect);
  camera.updateProjectionMatrix();
}
const mixKey = (a, b, u) => [a.pos.map((v, i) => lerp(v, b.pos[i], u)), a.look.map((v, i) => lerp(v, b.look[i], u)), lerp(a.fov, b.fov, u)];

// ---------------- UI ----------------
const ui = {
  veil: document.getElementById('veil'),
  hint: document.getElementById('hint'),
  sound: document.getElementById('sound'),
  skip: document.getElementById('skip'),
  end: document.getElementById('end'),
  replay: document.getElementById('replay'),
  dbg: document.getElementById('dbg'),
};

// ---------------- state ----------------
const sound = new Sound();
let post = null, white, city, wBot, peek, arm, cBot, sparks;
let t = START;                  // master timeline
let loopT = 0;                  // time spent waiting at the beckon
let followed = START > WAIT.at;
let lastT = t, playing = true;
let events = [];

function follow() {
  if (followed) return;
  followed = true;
  ui.hint.classList.remove('show');
}

// ---------------- boot ----------------
async function boot() {
  resize();
  try { await Promise.race([document.fonts.load('600 64px "Fredoka"'), new Promise((r) => setTimeout(r, 2500))]); } catch { /* fall back to the system font */ }
  const assets = await loadCharacterAssets('media/');
  white = new WhiteStage(envMap);
  wBot = new Bot(assets, WHITE.charHeight);
  white.scene.add(wBot.root);
  peek = new PeekHead(assets, WHITE.charHeight);
  white.scene.add(peek.root);
  arm = new PlushArm(WHITE.charHeight, envMap);
  white.scene.add(arm.root);
  cBot = new Bot(assets, CITY.charHeight);
  city = new City(envMap, cBot);
  city.scene.add(cBot.root);
  buildSwingProps();
  post = makeComposer(renderer, white.scene, camera);
  post.composer.setSize(W, H); post.lens.uRes.value.set(W, H);
  // event list: absolute times
  events = [
    { t: T.glint, type: 'glint' }, { t: T.rattle, type: 'rattle' }, { t: T.lift[0], type: 'lift' },
    { t: T.eyesUp[0] + 0.2, type: 'eyes' }, { t: T.lookL, type: 'look', pan: -0.4 }, { t: T.lookR, type: 'look', pan: 0.4 },
    ...T.blinks.map((b) => ({ t: b, type: 'blink' })), { t: T.recognise, type: 'recognise' },
    { t: T.pop, type: 'popOut' }, { t: T.pop + 0.55, type: 'clatter' }, { t: T.popLand, type: 'land', gain: 0.4 },
    { t: T.wave[0], type: 'wave' }, { t: T.reach[0], type: 'stretch' },
    { t: WAIT.at + T2.retract[0], type: 'retract' }, { t: WAIT.at + T2.hop[0], type: 'hop' }, { t: WAIT.at + T2.hop[0] + 0.25, type: 'dive' },
    { t: WAIT.at + T2.creak, type: 'creak' }, { t: WAIT.at + T2.swing[0] - 0.15, type: 'swoosh' },
    { t: WAIT.at + T2.swing[1], type: 'release' }, { t: WAIT.at + T2.swing[1] + 0.1, type: 'flipWhoosh' },
    { t: WAIT.at + T2.land, type: 'land', gain: 0.55, freq: 70 }, { t: WAIT.at + T2.snap, type: 'snap' },
    ...city.events.map((e) => ({ ...e, t: e.t + WAIT.at, type: e.type === 'lift' ? 'lift2' : e.type })),
  ].sort((a, b) => a.t - b.t);
  ui.veil.classList.add('ready');
  if (DEBUG) setupDebug();
  requestAnimationFrame(frame);
}

// rope + snap sparks live in the city
let ropeMesh;
function buildSwingProps() {
  ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8, 1, true).translate(0, 0.5, 0),
    new THREE.MeshStandardMaterial({ map: ropeTex(), roughness: 1, color: 0xbba27a }));
  ropeMesh.castShadow = true;
  city.scene.add(ropeMesh);
  sparks = [];
  const shape = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.03 : 0.08; if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const g = new THREE.ShapeGeometry(shape);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 1.4), transparent: true, side: THREE.DoubleSide, toneMapped: false }));
    city.scene.add(m); sparks.push(m);
  }
}

// ---------------- ACTS I–IV: the white world ----------------
function whiteFrame(t, loop) {
  const S = white;
  const rel = t - WAIT.at;
  // --- camera ---
  const K0 = WHITE.camera0;
  const K1 = { pos: [0, 6.3, 10.6], look: [0, 0.05, 0.2], fov: 26 };
  const K2 = { pos: [0, 1.7, 5.4], look: [0, 0.12, 0.6], fov: 28 };        // low: eye to eye with the slit        // eye to eye with the slit
  const K3 = { pos: [0, 3.5, 11.8], look: [0, 1.65, 1.0], fov: 30 };       // he is out: full figure
  const K4 = { pos: [0.2, 2.35, 8.6], look: [0.1, 1.6, 1.2], fov: 58 };    // the reach: wide + close
  let p, l, f, roll = 0;
  if (t < T.pushIn[1]) [p, l, f] = mixKey(K0, K1, easeInOut(prog(t, 0, T.pushIn[1])));
  else if (t < T.pop) [p, l, f] = mixKey(K1, K2, easeInOut(prog(t, T.pushIn[1], T.lift[1] + 1.2)));
  else if (t < T.reach[0]) [p, l, f] = mixKey(K2, K3, easeInOut(prog(t, T.pop, T.popLand + 0.4)));
  else if (!followed || rel < T2.hop[0]) {
    [p, l, f] = mixKey(K3, K4, easeInOut(prog(t, T.reach[0], T.reach[1])));
    // breathing handheld while he waits for us
    p[0] += noise1(loop * 0.7) * 0.04; p[1] += noise1(loop * 0.6 + 9) * 0.03;
  } else {
    // follow him down: rise over the hole, look straight in, then fall through it
    const a = easeInOut(prog(rel, T2.descend[0], T2.descend[0] + 1.0));
    const b = easeIn(prog(rel, T2.descend[0] + 0.8, T2.descend[1]));
    const P1 = [0, 4.6, 2.6], L1 = [0, -1.5, -0.05];
    const P2 = [0, -0.25, 0.0], L2 = [0, -6, -0.2];
    p = K4.pos.map((v, i) => lerp(lerp(v, P1[i], a), P2[i], b));
    l = K4.look.map((v, i) => lerp(lerp(v, L1[i], a), L2[i], b));
    f = lerp(lerp(K4.fov, 40, a), 70, b);
    roll = b * b * 1.2;
  }
  if (t > T.popLand && t < T.popLand + 0.4) p[1] += wobble(t - T.popLand, 9, 12) * 0.05;
  setCam(p, l, f, roll);

  // --- the medallion / cover ---
  const med = S.medallion;
  if (t < T.pop) {
    if (med.parent !== S.hinge) { S.hinge.add(med); med.position.set(0, 0, S.R * 1.02); med.rotation.set(0, 0, 0); med.quaternion.identity(); }
    const rattle = prog(t, T.rattle, T.rattle + 0.35);
    let ang = rattle > 0 && rattle < 1 ? Math.sin(rattle * 40) * 0.012 * (1 - rattle) : 0;
    ang += backOut(prog(t, T.lift[0], T.lift[1]), 2) * 0.125;
    ang += smooth(prog(t, T.recognise - 0.1, T.recognise + 0.2)) * 0.04;
    ang += (t > T.lift[1] ? Math.sin(t * 2.1) * 0.006 : 0);
    // just before the pop, a shove from below
    ang += Math.max(0, Math.sin(prog(t, T.pop - 0.35, T.pop) * Math.PI)) * 0.05;
    S.hinge.rotation.x = -ang;
  } else {
    // thrown free: tumbles off to the right and settles like a coin
    if (med.parent !== S.coverFree) { S.coverFree.add(med); med.position.set(0, 0, 0); }
    S.hinge.rotation.x = 0;
    const u = t - T.pop, fl = 0.55;
    const end = new THREE.Vector3(2.75, 0, -0.35);
    const q = new THREE.Quaternion();
    if (u < fl) {
      const k = u / fl;
      S.coverFree.position.set(lerp(0, end.x, k), 0.08 + 2.2 * k - 2.28 * k * k * 1.0, lerp(0, end.z, k));
      q.setFromEuler(new THREE.Euler(-Math.PI * 2 * easeOut(k), k * 0.8, k * 0.6));
    } else {
      // Euler's-disk settle: tilt decays, precession speeds up
      const v = u - fl;
      const tilt = 0.22 * Math.exp(-2.3 * v);
      const phi = 7 * v + 9 * v * v;
      const axis = new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi));
      q.setFromAxisAngle(axis, tilt);
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.8, 0)));
      S.coverFree.position.set(end.x, Math.sin(tilt) * S.R * 1.07 * 0.9, end.z);
    }
    S.coverFree.quaternion.copy(q);
  }
  // glint sweeping across the gold
  const gp = prog(t, T.glint, T.glint + 1.0);
  S.glint.intensity = Math.sin(gp * Math.PI) * 6;
  S.glint.position.set(lerp(-1.6, 1.6, gp), 0.7, lerp(0.8, -0.4, gp));

  // --- peek head (Act II) ---
  const peekOn = t >= T.eyesUp[0] - 0.2 && t < T.pop + 0.02;
  peek.root.visible = peekOn;
  if (peekOn) {
    const up = easeOut(prog(t, T.eyesUp[0], T.eyesUp[1]));
    const rec = spring(t - T.recognise, 2.2, 5);
    const eyeY = lerp(-0.8, -0.03, up) + Math.sin(t * 1.9) * 0.01 + (t > T.recognise ? 0.05 * rec : 0);   // eye line sits in the visible band of the slit
    peek.root.position.set(0, 0, 0.62);
    peek.root.rotation.y = Math.atan2(camera.position.x, camera.position.z - 0.62);
    peek.setEyeY(eyeY);
    peek.root.scale.setScalar(1 + (t > T.recognise ? 0.06 * (rec - Math.max(0, rec - 1)) : 0));
    let fr = 'open';
    if (t >= T.lookL && t < T.lookR - 0.25) fr = 'left';
    else if (t >= T.lookR && t < T.lookC) fr = 'right';
    for (const b of T.blinks) { const d = t - b; if (d >= 0 && d < 0.05) fr = 'half'; else if (d >= 0.05 && d < 0.1) fr = 'closed'; else if (d >= 0.1 && d < 0.14) fr = 'half'; }
    if (t > T.blinks[2] + 0.25 && t < T.recognise - 0.05) fr = 'half';     // a squint: who's there?
    peek.frame(fr);
    // hide anything of him that would poke up through the cover
    const coverPlane = peek.clip || (peek.clip = new THREE.Plane());
    const n = new THREE.Vector3(0, 1, 0).applyQuaternion(S.hinge.getWorldQuaternion(new THREE.Quaternion()));
    coverPlane.setFromNormalAndCoplanarPoint(n.clone().negate(), S.hinge.getWorldPosition(new THREE.Vector3()));
    peek.mat.clippingPlanes = [coverPlane];
  }

  // --- greensborobot, full figure (Act III–IV) ---
  const mode = t < T.pop ? 'hidden' : (!followed || rel < T2.turn[0]) ? 'card' : rel < T2.hop[1] ? 'tuck' : 'hidden';
  wBot.root.visible = mode !== 'hidden';
  arm.root.visible = false;
  const standZ = 1.95;
  if (mode === 'card') {
    const u = prog(t, T.pop, T.popLand);
    let x = 0, y, z = lerp(0.2, standZ, easeOut(u)), sx = 1, sy = 1;
    if (t < T.popLand) {
      wBot.setPose('jump');
      y = lerp(-2.2, 0, u) + Math.sin(u * Math.PI) * 2.3;
      sy = 1 + (u < 0.25 ? 0.25 * (1 - u / 0.25) : 0); sx = 1 / Math.sqrt(sy);
    } else {
      y = 0;
      const land = t - T.popLand;
      const sq = Math.exp(-7 * land) * Math.cos(15 * land);
      sy = 1 - 0.22 * sq; sx = 1 + 0.18 * sq;
      if (t >= T.wave[0] && t < T.wave[1]) {
        const k = Math.floor((t - T.wave[0]) * 5) % 2;
        wBot.setPose(k ? 'wave_low' : 'wave_high');
      } else if (t >= T.reach[0]) wBot.setPose('stand');
      else wBot.setPose('stand');
      sy *= 1 + Math.sin(t * 2.4) * 0.008;
    }
    if (followed) {
      // anticipation crouch before the turn
      const c = prog(rel, 0.0, T2.turn[0]);
      sy *= 1 - 0.18 * smooth(c); sx *= 1 + 0.1 * smooth(c);
    }
    wBot.root.position.set(x, y, z);
    wBot.update(camera, { mode: 'card', sx, sy, blob: y < 0.01 ? 1 : clamp(1 - y / 2) * (z > 1.2 ? 1 : 0) });
    // the reach: a plush arm coming at us
    if (t >= T.reach[0] && (!followed || rel < T2.retract[1])) {
      arm.root.visible = true;
      const H = WHITE.charHeight;
      const shoulder = new THREE.Vector3(0.2 * H, 0.47 * H, 0.08).applyAxisAngle(new THREE.Vector3(0, 1, 0), wBot.card.rotation.y).add(wBot.root.position);
      arm.root.position.copy(shoulder);
      // where the hand ends up, in camera space: low-right, close enough to invade our space
      const wide = Math.min(1, camera.aspect / 1.6);   // on a tall phone the hand comes low instead of wide
      const target = camera.position.clone().add(new THREE.Vector3(0.66 * wide, -0.12 - 0.55 * (1 - wide), -1.75).applyQuaternion(camera.quaternion));
      arm.root.lookAt(target);
      const full = shoulder.distanceTo(target) - 0.1 * H;
      let r = lerp(0.12 * H, full, easeInOut(prog(t, T.reach[0], T.reach[1])));
      if (followed) r = lerp(r, 0.05, easeIn(prog(rel, T2.retract[0], T2.retract[1])));
      const bcn = !followed ? Math.pow(Math.max(0, Math.sin(loop * Math.PI * 2 * 0.9)), 1.5) : 0;
      arm.update(camera, { reach: r, curl: t < T.reach[1] ? 0.05 : 0.08 + 0.55 * bcn, light: [-0.7, 0.8, 0.5], amb: 0.38, tint: 1.12 });
      // the whole hand sways with each beckon
      arm.root.rotateX(-bcn * 0.06);
      if (!followed && t >= WAIT.at && Math.floor(loop * 0.9) !== Math.floor((loop - 1 / 60) * 0.9)) sound.play({ type: 'beckon' });
    }
  } else if (mode === 'tuck') {
    // he turns his back on us (the model gives us his back) and cannonballs in
    const tu = easeInOut(prog(rel, T2.turn[0], T2.turn[1]));
    const hu = prog(rel, T2.hop[0], T2.hop[1]);
    const r = wBot.tuckRadius;
    const z = lerp(standZ, 0.0, easeInOut(hu));
    const y = r + Math.sin(Math.min(1, hu * 1.6) * Math.PI) * 1.4 * (hu < 0.62 ? 1 : 0) - (hu > 0.45 ? easeIn(prog(hu, 0.45, 1)) * 5 : 0);
    wBot.root.position.set(0, y, z);
    wBot.tuck.rotation.set(-hu * 1.6, lerp(0, Math.PI, tu), 0);
    wBot.update(camera, { mode: 'tuck', blob: clamp(1 - (y - r) / 1.5) * (z > 1.2 ? 1 : 0), blobY: 0.002 });
    wBot.blob.position.y = -y + 0.003;
  }
  // lens
  const L = post.lens;
  const reachK = t >= T.reach[0] && (!followed || rel < T2.retract[1]) ? easeInOut(prog(t, T.reach[0], T.reach[1])) * (followed ? 1 - prog(rel, T2.retract[0], T2.retract[1]) : 1) : 0;
  L.uBarrel.value = reachK * 0.95;
  L.uRush.value = followed ? easeIn(prog(rel, T2.descend[0] + 0.5, T2.black)) * 1.0 : 0;
  L.uTilt.value = 0;
  L.uVignette.value = 0.18 + reachK * 0.25;
  L.uFringe.value = 0.0;
  L.uGrain.value = 0.02;
  post.bloom.strength = 0.0;     // no haze on white
}

// ---------------- ACTS V–IX: the city ----------------
const tmpV = new THREE.Vector3();
function cityFrame(t) {
  const s = t - WAIT.at;
  city.update(s, t);
  // --- camera ---
  const C0 = CITY.camera, CF = CITY.final;
  let [p, l, f] = [C0.pos.slice(), C0.look.slice(), C0.fov];
  // taking it in: a slow, reverent push and drift
  const ti = easeInOut(prog(s, T2.takeIn[0], T2.takeIn[1]));
  p[2] -= ti * 0.8; p[0] += Math.sin(ti * Math.PI) * 0.6; p[1] -= ti * 0.2;
  // the building of the world: we start a touch closer to the stars, then settle
  const bu = easeInOut(prog(s, T2.black, T2.build[0] + 1));
  l[1] += (1 - bu) * 3.5;
  // flinch as something huge passes over our shoulder
  const fl = s - (T2.swing[0] + 0.95);   // the moment he passes over our shoulder
  if (fl > 0) { p[1] -= wobble(fl, 1.1, 2.4) * 0.32; p[0] -= wobble(fl, 1.1, 2.4) * 0.25; l[0] += wobble(fl, 0.9, 2) * 0.35; }
  // landing shake
  const ls = s - T2.land;
  if (ls > 0) { p[1] += wobble(ls, 11, 7) * 0.07; p[0] += wobble(ls, 13, 8) * 0.04; }
  // Act IX: pull back and look up so the title and he share the frame
  const fu = easeInOut(prog(s, T2.snap - 0.4, T2.title[0] + 0.6));
  p = p.map((v, i) => lerp(v, CF.pos[i], fu)); l = l.map((v, i) => lerp(v, CF.look[i], fu)); f = lerp(f, CF.fov, fu);
  p[0] += noise1(t * 0.3) * 0.03; p[1] += noise1(t * 0.27 + 5) * 0.02;
  setCam(p, l, f, 0, 0.85);   // phones: crop into the centre of the stage rather than shrink it

  // --- greensborobot ---
  const B = cBot, Hh = CITY.charHeight;
  const sw0 = T2.swing[0], sw1 = T2.swing[1];
  const pivot = new THREE.Vector3(...CITY.pivot), A = new THREE.Vector3(...CITY.swingStart), R = new THREE.Vector3(...CITY.swingRelease), Lnd = new THREE.Vector3(...CITY.landing);
  const dA = A.clone().sub(pivot), dR = R.clone().sub(pivot);
  const LA = dA.length(), LR = dR.length(); dA.normalize(); dR.normalize();
  const qA = new THREE.Quaternion(), qR = new THREE.Quaternion().setFromUnitVectors(dA, dR);
  const armOnRope = new THREE.Vector3();
  ropeMesh.visible = false;
  B.root.visible = s > sw0;
  const tint = new THREE.Color(1.0, 0.93, 0.86);
  const lamp = smooth(prog(s, T2.windows[0], T2.windows[1]));
  if (s > sw0 && s < sw1) {
    // the swing: a pendulum arc from behind our head toward the stage
    const u = prog(s, sw0, sw1);
    const e = 1 - Math.cos((u * Math.PI) / 2);
    const q = qA.clone().slerp(qR, e);
    const d = dA.clone().applyQuaternion(q);
    const len = lerp(LA, LR, e);
    const hands = pivot.clone().addScaledVector(d, len);
    B.setPose('jump');
    const hj = (586 / 678) * Hh;
    B.root.position.copy(hands).add(new THREE.Vector3(0, -hj * 0.93, 0));
    const dist = camera.position.distanceTo(B.root.position);
    const dark = clamp((dist - 2.0) / 7);
    B.update(camera, { mode: 'card', roll: -0.25 * (1 - e), tint: lerp(0.12, 1, smooth(dark)), tintColor: tint, blob: 0 });
    ropeMesh.visible = true; armOnRope.copy(hands);
  } else if (s >= sw1 && s < T2.land) {
    // release, somersault (the model: a true 3D tuck), land centre stage
    const u = prog(s, sw1, T2.land);
    const r = B.tuckRadius;
    const P = R.clone().lerp(Lnd, u); P.y = lerp(R.y, r, u) + Math.sin(u * Math.PI) * 1.7;
    B.root.position.copy(P);
    B.tuck.rotation.set(-Math.PI * 2 * easeInOut(u) - 0.3 * (1 - u), 0, 0);
    B.update(camera, { mode: 'tuck', blob: clamp(1 - (P.y - r) / 2.5), blobY: 0 });
    B.blob.position.y = -P.y + 0.01;
    // the rope swings back up and away
    const k = easeOut(clamp((s - sw1) / 1.0));
    const back = dA.clone().applyQuaternion(qA.clone().slerp(qR, 1 - k * 0.55));
    armOnRope.copy(pivot).addScaledVector(back, LR - k * 6);
    ropeMesh.visible = k < 1;
  } else if (s >= T2.land) {
    // centre stage, inside his city
    const lu = s - T2.land;
    const sq = Math.exp(-6 * lu) * Math.cos(13 * lu);
    let sy = 1 - 0.3 * sq, sx = 1 + 0.22 * sq, x = Lnd.x, flip = 1;
    let pose = 'stand';
    if (s > T2.snap - 0.25 && s < T2.snap + 0.55) pose = 'wave_high';
    const walk = prog(s, T2.beaconUp[1] - 0.1, T2.beaconFlip[0]);
    if (walk > 0) { x = lerp(Lnd.x, CITY.manhole[0] - 0.85, smooth(walk)); flip = -1; pose = walk < 1 ? (Math.floor(walk * 6) % 2 ? 'step' : 'stand34') : 'stand34'; }
    if (s >= T2.beaconFlip[0] - 0.1 && s < T2.beaconFlip[1] + 0.25) { pose = 'wave_low'; flip = -1; }
    if (s >= T2.beaconFlip[1] + 0.25) {
      flip = 1; pose = 'stand';
      const w = s - (T2.title[0] + 0.9);
      if (w > 0 && w < 1.6) pose = Math.floor(w * 5) % 2 ? 'wave_low' : 'wave_high';
    }
    const hop = walk > 0 && walk < 1 ? Math.abs(Math.sin(walk * Math.PI * 3)) * 0.08 : 0;
    sy *= 1 + Math.sin(t * 2.2) * 0.008;
    B.setPose(pose);
    B.root.position.set(x, hop, Lnd.z);
    const beam = smooth(prog(s, T2.beaconUp[1], T2.beaconFlip[1]));
    B.update(camera, { mode: 'card', sx, sy, flipX: flip, tint: 1, tintColor: tint.clone().lerp(new THREE.Color(0.9, 1.05, 0.85), beam * 0.35), blob: 0.9 });
  }
  if (ropeMesh.visible) {
    const dir = armOnRope.clone().sub(pivot);
    ropeMesh.position.copy(pivot);
    ropeMesh.scale.set(1, dir.length(), 1);
    ropeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    ropeMesh.material.map.repeat.y = ropeMesh.scale.y * 2;
  }
  // snap sparks from his raised hand
  const su = s - T2.snap;
  const hand = B.mesh.localToWorld(tmpV.set(0.4, 0.73, 0.02));
  sparks.forEach((m, i) => {
    m.visible = su > 0 && su < 0.7;
    if (!m.visible) return;
    const a = (i / sparks.length) * Math.PI * 2 + 0.3, v = 0.9 + (i % 3) * 0.3;
    m.position.set(hand.x + Math.cos(a) * v * su, hand.y + Math.sin(a) * v * su - su * su * 0.8, hand.z + 0.05);
    m.quaternion.copy(camera.quaternion); m.rotateZ(su * 8 + i);
    m.scale.setScalar(Math.max(0.01, 1 - su / 0.7));
  });
  // lens: miniature photography
  const L = post.lens;
  L.uBarrel.value = 0.0;
  L.uRush.value = 0;
  const swingNear = s > sw0 + 0.7 && s < sw0 + 1.3 ? Math.sin(prog(s, sw0 + 0.7, sw0 + 1.3) * Math.PI) : 0;
  L.uBarrel.value = swingNear * 0.25;
  L.uTilt.value = lerp(5, 3.5, fu) * (1 - swingNear);
  L.uTiltCenter.value = lerp(0.4, 0.38, fu);
  L.uTiltBand.value = lerp(0.14, 0.24, fu);
  L.uVignette.value = 0.45;
  L.uFringe.value = 0.0015;
  L.uGrain.value = 0.04;
  post.bloom.strength = 0.16; post.bloom.threshold = 0.98; post.bloom.radius = 0.3;   // tuned for three r185's bloom (much hotter than r169's)
  // beds
  sound.setBeds({ crickets: lamp, city: smooth(prog(s, T2.cars, T2.cars + 3)), hum: smooth(prog(s, T2.beaconUp[1], T2.beaconUp[1] + 0.5)) });
}

// ---------------- main loop ----------------
let prevNow = performance.now(), frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  step(now);
}
function step(now) {
  resize();
  const dt = Math.min(0.05, (now - prevNow) / 1000); prevNow = now;
  if (playing && !FREEZE) {
    if (t < WAIT.at || followed) t += dt;
    else {
      t = WAIT.at; loopT += dt;
      if (loopT > WAIT.hintAfter) ui.hint.classList.add('show');
      if (WAIT.autoAdvance && loopT > WAIT.autoAdvance) follow();
    }
  }
  if (FREEZE && t >= WAIT.at && !followed) loopT = parseFloat(Q.get('loop') || '0.2');
  // sound events crossed this frame
  if (!FREEZE) for (const e of events) if (e.t > lastT && e.t <= t) sound.play(e);
  lastT = t;
  const rel = t - WAIT.at;
  const inCity = followed && rel >= T2.black;
  // white veil at the very start: the object resolves out of pure white
  ui.veil.style.opacity = 1 - smooth(prog(t, T.medallionIn[0], T.medallionIn[1]));
  document.body.classList.toggle('dark', inCity || (followed && rel > T2.descend[0] + 1.2));
  if (!inCity) {
    whiteFrame(t, loopT);
    post.renderPass.scene = white.scene;
  } else {
    cityFrame(t);
    post.renderPass.scene = city.scene;
  }
  // the hole has eaten the screen: hold black between worlds
  post.lens.uFade.value = followed && rel > T2.black - 0.12 && rel < T2.stars[0] - 0.3 ? 1 : 0;
  if (followed && rel >= T2.black && rel < T2.stars[0]) post.lens.uFade.value = 1 - smooth(prog(rel, T2.stars[0] - 0.3, T2.stars[0]));
  post.lens.uTime.value = now / 1000;
  post.composer.render();
  // end card
  if (followed && rel > T2.enterHint) ui.end.classList.add('show'); else ui.end.classList.remove('show');
  if (DEBUG) ui.dbg.textContent = `t ${t.toFixed(2)}  rel ${rel.toFixed(2)}  ${inCity ? 'city' : 'white'}  ${followed ? '' : 'waiting ' + loopT.toFixed(1)}`;
  if (CAPTURE && ++frames === 6) {
    fetch(`/__frame?name=${encodeURIComponent(CAPTURE)}.png`, { method: 'POST', body: canvas.toDataURL('image/png') }).then(() => (document.title = 'captured'));
  }
}

// ---------------- input ----------------
function onActivate(e) {
  if (e && e.target && e.target.closest && e.target.closest('button, a')) return;
  sound.enable().then(() => updateSoundLabel());
  if (t >= T.reach[0] && !followed) follow();
}
canvas.addEventListener('pointerdown', onActivate);
window.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); } });
function updateSoundLabel() { ui.sound.textContent = sound.enabled ? 'Turn sound off' : 'Turn sound on'; ui.sound.setAttribute('aria-pressed', sound.enabled); }
ui.sound.addEventListener('click', async () => { if (sound.enabled) sound.disable(); else await sound.enable(); updateSoundLabel(); });
ui.skip.addEventListener('click', () => { followed = true; t = WAIT.at + T2.title[1] + 0.5; lastT = t; });
ui.replay.addEventListener('click', () => { t = 0; lastT = 0; loopT = 0; followed = false; ui.end.classList.remove('show'); });

function setupDebug() {
  ui.dbg.style.display = 'block';
  window.__gbb = { step, obj: () => ({ camera, arm, wBot, cBot, city, white, post, renderer }), get t() { return t; }, set t(v) { t = v; lastT = v; followed = v > WAIT.at; }, follow, sound,
    // render one frozen moment and post it to the dev server (works with the tab hidden)
    async shot(time, name, loop = 0.3) {
      t = time; lastT = time; followed = time > WAIT.at; loopT = loop; playing = false;
      step(performance.now()); step(performance.now());
      const url = renderer.domElement.toDataURL('image/jpeg', 0.88);
      await fetch(`/__frame?name=${encodeURIComponent(name)}.jpg`, { method: 'POST', body: url });
      return name;
    } };
}

boot().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:0;left:0;color:#900">${e.stack || e}</pre>`); });
