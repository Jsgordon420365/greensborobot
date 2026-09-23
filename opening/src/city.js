// ACTS V–IX: miniature Greensboro, built by hand, on a stage.
// Every element exposes its animation as a pure function of the (relative) time s.
import * as THREE from 'three';
import { kraft, flutes, feltRoad, facade, backdrop, radialGlow, titleGobo } from './textures.js';
import { makeMedallion } from './whiteStage.js';
import { prog, clamp, lerp, backOut, elasticOut, easeInOut, smooth, wobble, rng, hash, noise1 } from './util.js';
import { T2, CITY, TITLE } from './config.js';

const HALF_PI = Math.PI / 2;
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, ...o });

function signTexture(text, { w = 512, h = 128, bg = '#1f6b3f', fg = '#f4f0e0', font = '700 72px "Fredoka", sans-serif', border = '#f4f0e0', vertical = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (vertical) {
    const n = text.length;
    [...text].forEach((ch, i) => g.fillText(ch, w / 2, (h * (i + 0.5)) / n));
  } else g.fillText(text, w / 2, h / 2 + 4);
  // hand-lettered wobble: speckle and a thumbprint
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// a box made of card: kraft sides, facade front, corrugated roof cap
function cardBox(w, h, d, { seed = 1, style = {}, roofTone = [160, 128, 90] } = {}) {
  const fr = facade(seed, style);
  const sd = facade(seed + 7, { ...style, win: [Math.max(1, Math.round((style.win?.[0] || 3) * d / w)), style.win?.[1] || 8], door: false });
  const frontMat = std({ map: fr.map, emissiveMap: fr.emissive, emissive: 0xffffff, emissiveIntensity: 0 });
  const sideMat = std({ map: sd.map, emissiveMap: sd.emissive, emissive: 0xffffff, emissiveIntensity: 0, color: 0xd6d0c8 });
  const top = std({ map: kraft(seed + 3, roofTone) });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [sideMat, sideMat, top, top, frontMat, sideMat]);
  m.castShadow = m.receiveShadow = true;
  m.position.y = h / 2;
  const g = new THREE.Group(); g.add(m);
  // roof cap overhang shows the corrugated edge
  const ft = flutes(seed + 5, roofTone); ft.repeat.set(w / 1.2, 1);
  const edge = std({ map: ft });
  const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, 0.07, d * 1.04), [edge, edge, top, top, edge, edge]);
  cap.position.y = h + 0.035; cap.castShadow = true;
  g.add(cap);
  g.userData.lit = [frontMat, sideMat];
  return g;
}

// wrap an object so it folds up from the page around its front-bottom edge
function hinged(obj, x, zFront, depth) {
  const hinge = new THREE.Group();
  hinge.position.set(x, 0, zFront);
  obj.position.z = -depth / 2;
  hinge.add(obj);
  return hinge;
}

function extrudedFlat(points, depth, faceMat, edgeMat) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  const m = new THREE.Mesh(geo, [faceMat, edgeMat]);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function starShape(r1, r2, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 + HALF_PI, r = i % 2 ? r2 : r1;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
export class City {
  constructor(envMap, bot) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.environment = envMap;
    this.bot = bot;
    this.items = [];          // {update(s)}
    this.events = [];         // {t, type, ...} for sound
    this.r = rng(2024);
    this.buildLights();
    this.buildStage();
    this.buildSky();
    this.buildSkyline();
    this.buildLandmarks();
    this.buildRoad();
    this.buildPlaza();
    this.buildMoon();
    this.buildTraffic();
    this.buildPeople();
    this.buildBeacon();
    this.buildDust();
    this.events.sort((a, b) => a.t - b.t);
  }

  on(t, type, extra = {}) { this.events.push({ t, type, ...extra }); }

  // --- lighting: stage lights come up; dusk ambience; practicals later ---
  buildLights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0x6f86c8, 0x2a2016, 0);
    s.add(this.hemi);
    this.key = new THREE.SpotLight(0xffd9a8, 0, 60, 0.55, 0.6, 1.2);
    this.key.position.set(-7, 16, 15);
    this.key.target.position.set(0, 0, -1);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0003; this.key.shadow.radius = 4; this.key.shadow.blurSamples = 12;
    s.add(this.key, this.key.target);
    this.rimL = new THREE.SpotLight(0x8fb0ff, 0, 50, 0.6, 0.8, 1.4);
    this.rimL.position.set(10, 10, -12); this.rimL.target.position.set(0, 1, 0);
    s.add(this.rimL, this.rimL.target);
    this.items.push({ update: (s) => {
      const up = smooth(prog(s, T2.backdrop[0], T2.build[0] + 1.2));
      const dusk = smooth(prog(s, T2.windows[0] - 0.5, T2.windows[1] + 1.5));
      this.hemi.intensity = up * lerp(0.9, 0.5, dusk);
      this.key.intensity = up * lerp(95, 62, dusk);
      this.rimL.intensity = up * 40;
    } });
  }

  buildStage() {
    const s = this.scene;
    // the board everything is glued onto
    const top = kraft(301, [176, 146, 104]); top.repeat.set(5, 3);
    const ft = flutes(302, [176, 146, 104], 2); ft.repeat.set(14, 1);
    const edge = std({ map: ft });
    const board = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 15), [edge, edge, std({ map: top }), edge, edge, edge]);
    board.position.set(0, -0.25, -1);
    board.receiveShadow = true;
    s.add(board);
    // the (dim) workbench below the stage
    const table = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 40), std({ color: 0x1b140e, roughness: 0.7 }));
    table.position.set(0, -1.05, 0); table.receiveShadow = true;
    s.add(table);
    this.board = board;
    // board itself appears in the stage lights (fades with them) — it's the "page"
  }

  buildSky() {
    const s = this.scene;
    const mat = new THREE.MeshBasicMaterial({ map: backdrop(), color: 0x000000, toneMapped: true });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(46, 34), mat);
    sky.position.set(0, 13.5, -9.2);   // tall enough for phones held upright
    s.add(sky);
    this.sky = sky;
    this.items.push({ update: (s) => {
      const k = smooth(prog(s, T2.backdrop[0], T2.backdrop[1]));
      mat.color.setScalar(k * 0.95);
    } });
    // stars, one at a time: gold paper, pinned or hung on thread
    const n = 17;
    const gold = std({ color: 0xe6c768, metalness: 0.6, roughness: 0.35, emissive: 0xffd780, emissiveIntensity: 0 });
    const goldEdge = std({ map: flutes(401, [200, 170, 90]) });
    const geo = new THREE.ExtrudeGeometry(new THREE.Shape(starShape(0.28, 0.12).map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.04, bevelEnabled: false });
    const [t0, t1] = T2.stars;
    const r = rng(9);
    const spots = [];
    for (let i = 0; i < n; i++) {
      let x, y, ok = false, tries = 0;
      while (!ok && tries++ < 50) {
        x = (r() - 0.5) * 30; y = 6.6 + r() * 5.2;
        ok = spots.every(([a, b]) => Math.hypot(a - x, b - y) > 2.6) && Math.hypot(x + 6.9, y - 9.2) > 2.3;
      }
      spots.push([x, y]);
    }
    spots.forEach(([x, y], i) => {
      const hung = i % 3 === 1;
      const st = new THREE.Mesh(geo, [gold.clone(), goldEdge]);
      const z = hung ? -7.2 : -9.05;
      const sc = hung ? 1 : 0.6 + r() * 0.6;
      st.position.set(x, y, z);
      st.rotation.z = (r() - 0.5) * 0.6;
      st.castShadow = true;
      s.add(st);
      let thread = null;
      if (hung) {
        thread = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 4), std({ color: 0xe8e0cc }));
        thread.position.set(x, y + 0.25 + 6, z); thread.scale.y = 12;
        s.add(thread);
      }
      // accelerating reveal: slow first few, then quicker
      const at = t0 + (t1 - t0) * Math.pow(i / (n - 1), 0.75);
      this.on(at, 'star', { i });
      const seed = hash(i * 3.7);
      this.items.push({ update: (s, abs) => {
        const p = prog(s, at, at + 0.55);
        const k = elasticOut(p);
        st.visible = p > 0;
        if (thread) thread.visible = p > 0;
        const sw = hung ? Math.sin(abs * 0.9 + seed * 6) * 0.06 : 0;
        st.scale.setScalar(Math.max(0.001, k * sc));
        st.rotation.y = hung ? Math.sin(abs * 0.7 + seed * 5) * 0.5 : 0;
        st.position.x = x + sw;
        const tw = 0.6 + 0.4 * Math.sin(abs * (1.5 + seed * 2) + seed * 10);
        st.material[0].emissiveIntensity = (p > 0 ? 0.9 * (1 - p) * 3 + 0.35 * tw : 0);
      } });
    });
  }

  // two rows of cut-card skyline silhouettes, with their own little windows
  buildSkyline() {
    const s = this.scene;
    const r = rng(77);
    const winGeo = new THREE.PlaneGeometry(0.13, 0.17);
    const rows = [
      { z: -8.3, base: 3.2, var: 4.2, tone: [95, 104, 128], x0: -17, x1: 17, t: 0.0 },
      { z: -7.0, base: 1.8, var: 3.0, tone: [150, 124, 92], x0: -16, x1: 16, t: 0.7 },
    ];
    rows.forEach((row, ri) => {
      const pts = [[row.x0, 0]];
      let x = row.x0; const tops = [];
      while (x < row.x1) {
        const w = 0.9 + r() * 1.8, h = row.base + r() * row.var;
        pts.push([x, h]);
        if (r() < 0.25) { pts.push([x + w * 0.3, h]); pts.push([x + w * 0.5, h + 0.6 + r() * 1.2]); pts.push([x + w * 0.7, h]); }
        pts.push([x + w, h]);
        tops.push([x, x + w, h]);
        x += w;
      }
      pts.push([x, 0]);
      const kt = kraft(500 + ri, row.tone); kt.repeat.set(0.18, 0.18);
      const et = flutes(510 + ri, row.tone); et.repeat.set(0.5, 1);
      const face = std({ map: kt, color: ri === 0 ? 0x9aa6c8 : 0xffffff });
      const flat = extrudedFlat(pts, 0.08, face, std({ map: et }));
      const hinge = new THREE.Group();
      hinge.position.set(0, 0, row.z + 0.08);
      flat.position.z = -0.08;
      hinge.add(flat);
      // windows as tiny lit squares stuck on
      const wins = [];
      for (const [a, b, h] of tops) for (let wx = a + 0.3; wx < b - 0.2; wx += 0.42) for (let wy = 0.6; wy < h - 0.4; wy += 0.6) if (r() < 0.45) wins.push([wx, wy]);
      const im = new THREE.InstancedMesh(winGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), wins.length);
      const m4 = new THREE.Matrix4();
      wins.forEach(([wx, wy], i) => { m4.makeTranslation(wx + (r() - 0.5) * 0.05, wy, 0.01); im.setMatrixAt(i, m4); im.setColorAt(i, new THREE.Color(0, 0, 0)); });
      hinge.add(im);
      s.add(hinge);
      const at = T2.build[0] + row.t;
      this.on(at, 'fold', { size: 2 });
      const onAt = wins.map(() => T2.windows[0] + r() * (T2.windows[1] - T2.windows[0]));
      const warm = wins.map(() => (r() < 0.8 ? new THREE.Color(1.6, 1.05, 0.45) : new THREE.Color(0.7, 0.85, 1.4)));
      const c = new THREE.Color();
      this.items.push({ update: (s) => {
        const p = prog(s, at, at + 1.1);
        hinge.visible = p > 0;
        hinge.rotation.x = -HALF_PI * (1 - backOut(p, 1.2));
        wins.forEach((_, i) => {
          const q = clamp((s - onAt[i]) * 8);
          const flick = q > 0 && q < 1 ? (Math.sin(i * 91 + s * 60) > 0 ? 1 : 0.2) : q;
          im.setColorAt(i, c.copy(warm[i]).multiplyScalar(flick));
        });
        im.instanceColor.needsUpdate = true;
      } });
      this.skylineHinges = (this.skylineHinges || []).concat([hinge]);
    });
  }

  addFold(obj, { x, z, depth, at, dur = 0.95, stuck = false, crooked = 0, lit = [] }) {
    const hinge = hinged(obj, x, z, depth);
    for (const m of lit) if (!m.emissiveMap && m.map) { m.emissiveMap = m.map; m.userData.sign = true; }   // painted signs glow in their own colours
    hinge.rotation.z = crooked;
    this.scene.add(hinge);
    this.on(at, 'fold', { size: depth });
    const wOn = T2.windows[0] + this.r() * (T2.windows[1] - T2.windows[0] - 0.6);
    const seed = this.r() * 10;
    this.items.push({ update: (s) => {
      let p = prog(s, at, at + dur);
      if (stuck) {
        // this one catches halfway, hesitates, then gets its nudge
        const a = prog(s, at, at + dur * 0.45), b = prog(s, at + dur * 0.45 + 0.55, at + dur * 0.45 + 0.55 + dur * 0.5);
        p = a * 0.42 + b * 0.58;
      }
      hinge.visible = p > 0;
      const land = s - T2.land;
      const quake = land > 0 ? wobble(land, 4.5, 4) * 0.035 * (0.6 + 0.4 * Math.sin(seed)) : 0;
      hinge.rotation.x = -HALF_PI * (1 - backOut(p, 1.35)) + quake;
      const q = clamp((s - wOn) * 5);
      const flick = q > 0 && q < 1 ? (Math.sin(seed * 50 + s * 45) > 0.2 ? 1 : 0.15) : q;
      for (const m of lit) m.emissiveIntensity = flick * (m.userData.sign ? 0.55 : 1.35);
    } });
    if (stuck) this.on(at + dur * 0.45 + 0.55, 'nudge');
    return hinge;
  }

  buildLandmarks() {
    const b0 = T2.build[0] + 1.3, span = T2.build[1] - b0;
    const at = (k) => b0 + span * k;

    // Jefferson Standard Building — the neo-gothic 1923 tower (pale terracotta)
    {
      const g = new THREE.Group();
      const tone = [214, 196, 162];
      const base = cardBox(2.3, 5.0, 1.7, { seed: 11, style: { tone, win: [5, 13], trim: 'rgba(120,90,60,0.5)', lit: 0.55 } });
      const mid = cardBox(1.5, 1.2, 1.2, { seed: 12, style: { tone, win: [3, 2] } }); mid.position.y = 5.07;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.9, 4), std({ map: kraft(13, [150, 120, 100]) }));
      crown.position.y = 6.75; crown.rotation.y = Math.PI / 4; crown.castShadow = true;
      g.add(base, mid, crown);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const pin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 4), std({ color: 0xd8c4a0 }));
        pin.position.set(sx * 0.68, 6.5, sz * 0.52); g.add(pin);
      }
      this.addFold(g, { x: -3.3, z: -3.1, depth: 1.7, at: at(0.25), lit: [...base.userData.lit, ...mid.userData.lit] });
    }
    // Lincoln Financial tower — the tall modern slab with the pointed cap
    {
      const g = new THREE.Group();
      const body = cardBox(2.2, 7.4, 1.8, { seed: 21, style: { tone: [150, 162, 176], paint: 'rgba(120,140,170,1)', win: [6, 18], winW: 0.7, winH: 0.5, lit: 0.5 } });
      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.3, 4), std({ color: 0xc9b98a, metalness: 0.4, roughness: 0.4 }));
      cap.position.y = 8.15; cap.rotation.y = Math.PI / 4; cap.castShadow = true;
      g.add(body, cap);
      this.addFold(g, { x: 1.2, z: -4.2, depth: 1.8, at: at(0.05), lit: body.userData.lit, crooked: 0.012 });
    }
    // Carolina Theatre with its vertical blade sign and marquee
    {
      const g = new THREE.Group();
      const body = cardBox(2.6, 3.0, 1.6, { seed: 31, style: { tone: [170, 92, 70], brick: true, win: [4, 4], lit: 0.7 } });
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 2.4, 0.12), [std({ color: 0x8c2b22 }), std({ color: 0x8c2b22 }), std({ color: 0x8c2b22 }), std({ color: 0x8c2b22 }),
        std({ map: signTexture('CAROLINA', { w: 128, h: 720, bg: '#9b2a20', fg: '#ffe9b0', font: '700 84px "Fredoka", sans-serif', vertical: true }), emissive: 0xffffff, emissiveIntensity: 0 }), std({ color: 0x8c2b22 })]);
      blade.position.set(0.7, 3.1, 0.95); blade.rotation.y = 0.0;
      const marq = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.42, 0.5), [std({ color: 0x2d2a26 }), std({ color: 0x2d2a26 }), std({ color: 0x2d2a26 }), std({ color: 0x2d2a26 }),
        std({ map: signTexture('THEATRE', { w: 512, h: 96, bg: '#f2ead0', fg: '#8e241c', border: '#c9a24a', font: '700 64px "Fredoka", sans-serif' }), emissive: 0xffffff, emissiveIntensity: 0 }), std({ color: 0x2d2a26 })]);
      marq.position.set(0, 1.25, 1.0);
      g.add(body, blade, marq);
      const signs = [blade.material[4], marq.material[4]];
      this.addFold(g, { x: -6.4, z: -1.9, depth: 1.6, at: at(0.55), lit: [...body.userData.lit, ...signs] });
    }
    // Revolution Mill: brick mill + smokestack (+ cotton-wool smoke)
    {
      const g = new THREE.Group();
      const mill = cardBox(3.4, 2.2, 1.6, { seed: 41, style: { tone: [158, 78, 58], brick: true, win: [7, 3], winW: 0.5, winH: 0.7, lit: 0.6 } });
      const brick = facade(42, { tone: [150, 72, 55], brick: true, win: [1, 1], lit: 0 }).map;
      brick.repeat.set(1, 3);
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 5.8, 20), std({ map: brick }));
      stack.position.set(1.15, 2.9, -0.3); stack.castShadow = true;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.15, 20), std({ color: 0x2c2420 })); band.position.set(1.15, 5.7, -0.3);
      g.add(mill, stack, band);
      const hinge = this.addFold(g, { x: 5.2, z: -2.3, depth: 1.6, at: at(0.7), lit: mill.userData.lit });
      // smoke: cotton puffs drifting up, looping — obviously cotton
      const cotton = std({ color: 0xf2efe8, roughness: 1 });
      const puffs = [];
      for (let i = 0; i < 6; i++) {
        const p = new THREE.Group();
        for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 + k * 0.03, 1), cotton); b.position.set((k - 1.5) * 0.12, (k % 2) * 0.08, 0); p.add(b); }
        this.scene.add(p); puffs.push(p);
      }
      this.items.push({ update: (s, abs) => {
        const on = prog(s, T2.windows[0], T2.windows[0] + 1);
        puffs.forEach((p, i) => {
          const u = ((abs * 0.12 + i / puffs.length) % 1);
          p.visible = on > 0 && hinge.rotation.x > -0.1;
          p.position.set(5.2 + 1.15 + u * 1.6 + Math.sin(u * 6 + i) * 0.1, 6.0 + u * 2.3, -3.1 - 0.3);
          p.scale.setScalar((0.5 + u * 1.2) * on * (1 - Math.pow(u, 4)));
        });
      } });
    }
    // water tower on dowel legs: "GSO"
    {
      const g = new THREE.Group();
      const legMat = std({ color: 0x6b5236 });
      for (const [lx, lz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
        const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.2, 8), legMat); l.position.set(lx, 1.6, lz); l.castShadow = true; g.add(l);
      }
      const brace = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.03, 6, 24), legMat); brace.rotation.x = HALF_PI; brace.position.y = 1.6; g.add(brace);
      const tankTex = signTexture('GSO', { w: 1024, h: 256, bg: '#2f6b4c', fg: '#f4f0e0', border: '#2f6b4c', font: '700 150px "Fredoka", sans-serif' });
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.25, 32), [std({ map: tankTex }), std({ color: 0x2f6b4c }), std({ color: 0x2f6b4c })]);
      tank.position.y = 3.8; tank.rotation.y = -0.4; tank.castShadow = true;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.6, 32), std({ color: 0x28543d })); roof.position.y = 4.72; roof.castShadow = true;
      g.add(tank, roof);
      this.addFold(g, { x: -9.4, z: -3.4, depth: 1.0, at: at(0.4), stuck: true });
    }
    // filler buildings on the block (brick, cream, kraft)
    const fill = [
      { x: -1.1, z: -2.6, w: 1.6, h: 3.6, d: 1.4, tone: [196, 176, 140], k: 0.15 },
      { x: 3.4, z: -2.9, w: 1.5, h: 4.4, d: 1.3, tone: [176, 96, 74], brick: true, k: 0.3 },
      { x: -8.6, z: -1.6, w: 1.7, h: 2.4, d: 1.3, tone: [205, 190, 160], k: 0.62 },
      { x: 8.2, z: -1.9, w: 2.0, h: 3.0, d: 1.4, tone: [184, 150, 100], k: 0.8 },
      { x: -11.3, z: -2.4, w: 1.9, h: 4.0, d: 1.5, tone: [150, 160, 170], k: 0.5 },
      { x: 10.9, z: -3.1, w: 2.1, h: 5.2, d: 1.6, tone: [196, 170, 130], k: 0.9 },
      { x: 7.0, z: -5.2, w: 1.8, h: 6.0, d: 1.4, tone: [168, 150, 128], k: 0.1 },
      { x: -5.9, z: -5.0, w: 2.0, h: 5.5, d: 1.4, tone: [176, 120, 96], brick: true, k: 0.2 },
    ];
    fill.forEach((f, i) => {
      const b = cardBox(f.w, f.h, f.d, { seed: 60 + i, style: { tone: f.tone, brick: f.brick, win: [Math.round(f.w * 2.2), Math.round(f.h * 2.2)], door: true } });
      this.addFold(b, { x: f.x, z: f.z, depth: f.d, at: at(f.k) - 0.3, crooked: (this.r() - 0.5) * 0.03, lit: b.userData.lit });
    });
    // storefront with the green-and-white awning: "GREENSBORO"
    {
      const g = cardBox(3.0, 1.9, 1.2, { seed: 80, style: { tone: [196, 180, 150], win: [3, 2], winW: 0.8, winH: 0.55, door: true, lit: 0.9 } });
      const aw = document.createElement('canvas'); aw.width = 256; aw.height = 64; const ag = aw.getContext('2d');
      for (let i = 0; i < 16; i++) { ag.fillStyle = i % 2 ? '#f1ede0' : '#2a7a4a'; ag.fillRect(i * 16, 0, 16, 64); }
      const awt = new THREE.CanvasTexture(aw); awt.colorSpace = THREE.SRGBColorSpace;
      const awning = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.05, 0.6), std({ map: awt })); awning.position.set(0, 1.0, 0.85); awning.rotation.x = 0.35;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.38), std({ map: signTexture('GREENSBORO', { w: 768, h: 112, bg: '#4a3522', fg: '#f3dfa8', border: '#c9a24a', font: '700 72px "Fredoka", sans-serif' }), emissive: 0xffffff, emissiveIntensity: 0 }));
      sign.position.set(0, 1.55, 0.61);
      g.add(awning, sign);
      this.addFold(g, { x: 5.9, z: 0.0 - 1.6 + 0.05, depth: 1.2, at: at(0.85), lit: [...g.userData.lit, sign.material] });
    }
    // two out-of-focus foreground blocks at the frame edges (depth, and a frame)
    for (const [x, h] of [[-9.5, 2.6], [9.8, 3.2]]) {
      const b = cardBox(2.2, h, 1.6, { seed: 90 + x, style: { tone: [170, 140, 100], win: [3, 4], lit: 0.4 } });
      this.addFold(b, { x, z: 6.3, depth: 1.6, at: T2.build[1] - 0.4, lit: b.userData.lit });
    }
  }

  buildRoad() {
    const s = this.scene;
    const L = 29, W = 2.3, z = 0.15, x0 = -L / 2;
    const tex = feltRoad(); tex.repeat.set(L / 5, 1);
    this.roadClip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), x0);
    const road = new THREE.Mesh(new THREE.BoxGeometry(L, 0.04, W), std({ map: tex, clippingPlanes: [this.roadClip] }));
    road.position.set(0, 0.02, z);
    road.receiveShadow = true;
    s.add(road);
    // the spool it unrolls from
    const spoolMat = std({ map: tex });
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, W * 1.01, 40), [spoolMat, std({ map: flutes(700, [80, 80, 78]) }), std({ map: flutes(700, [80, 80, 78]) })]);
    spool.rotation.x = HALF_PI; spool.castShadow = true;
    const spoolG = new THREE.Group(); spoolG.add(spool); s.add(spoolG);
    // sidewalks: strips of kraft that flap down on either side as the road passes
    const sw = [];
    for (const [sz, d] of [[z - W / 2 - 0.35, 0.7], [z + W / 2 + 0.35, 0.7]]) {
      const kt = kraft(710 + sz, [196, 178, 146], false); kt.repeat.set(12, 0.3);
      const m = new THREE.Mesh(new THREE.BoxGeometry(L, 0.06, d), std({ map: kt, clippingPlanes: [this.roadClip] }));
      m.position.set(0, 0.03, sz); m.receiveShadow = true; s.add(m); sw.push(m);
    }
    const [t0, t1] = T2.road;
    this.on(t0, 'unroll', { dur: t1 - t0 });
    this.items.push({ update: (s) => {
      const p = easeInOut(prog(s, t0, t1));
      const xe = x0 + L * p;
      this.roadClip.constant = xe;          // show everything with x < xe
      const R = lerp(0.45, 0.14, p);
      spoolG.visible = p > 0 && p < 1;
      spool.scale.set(R, 1, R);
      spoolG.position.set(xe + R * 0.2, R + 0.02, z);
      spool.rotation.y = 0; spoolG.rotation.z = -(L * p) / 0.3;   // it rolls
      road.visible = sw[0].visible = sw[1].visible = p > 0;
    } });
    this.roadZ = z;
  }

  buildPlaza() {
    const s = this.scene;
    const r = this.r;
    // flocked-foam trees on dowel trunks (train-set trees)
    const flock = (seed) => {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      g.fillStyle = '#2f6a2c'; g.fillRect(0, 0, 128, 128);
      const rr = rng(seed);
      for (let i = 0; i < 1400; i++) { const v = rr(); g.fillStyle = v < 0.5 ? 'rgba(20,50,20,0.6)' : v < 0.85 ? 'rgba(80,140,60,0.6)' : 'rgba(150,190,90,0.5)'; g.fillRect(rr() * 128, rr() * 128, 2, 2); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    const foliage = [std({ map: flock(1) }), std({ map: flock(2), color: 0xcfe3b0 }), std({ map: flock(3), color: 0xb7d39a })];
    const trunkMat = std({ color: 0x5a412a });
    const treeSpots = [
      [-12.5, -1.3], [-10.2, -1.2], [-7.7, -0.95], [-4.6, -1.3], [-2.2, -1.25], [2.4, -1.3], [4.4, -1.1], [7.2, -1.05], [9.8, -1.25], [12.4, -1.2],
      [-6.8, 2.6], [-4.4, 4.6], [-2.6, 2.4], [2.9, 2.5], [4.6, 4.4], [6.8, 2.8], [-8.3, 4.3], [8.4, 4.6],
    ];
    const [t0, t1] = T2.trees;
    this.trees = [];
    treeSpots.forEach(([x, z], i) => {
      const g = new THREE.Group();
      const h = 0.55 + r() * 0.5;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, h, 8), trunkMat); trunk.position.y = h / 2; trunk.castShadow = true; g.add(trunk);
      const fm = foliage[i % 3];
      const n = 3 + (r() * 3 | 0);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + r() * 0.2, 2), fm);
        b.position.set((r() - 0.5) * 0.45, h + 0.15 + r() * 0.5, (r() - 0.5) * 0.35); b.castShadow = true; g.add(b);
      }
      g.position.set(x, 0, z);
      g.rotation.y = r() * 6; g.rotation.z = (r() - 0.5) * 0.08;   // not quite straight: hand-glued
      s.add(g);
      const at = t0 + (t1 - t0) * (i / treeSpots.length) + (r() - 0.5) * 0.2;
      this.on(at, 'pop', { pitch: 0.8 + r() * 0.5 });
      const ph = r() * 6;
      this.items.push({ update: (s) => {
        const p = prog(s, at, at + 0.6);
        g.visible = p > 0;
        const k = elasticOut(p);
        const land = s - T2.land;
        const dist = Math.hypot(x - CITY.landing[0], z - CITY.landing[2]);
        const shake = land > 0 ? wobble(land - dist * 0.03, 6, 5) * 0.12 / (0.5 + dist * 0.3) : 0;
        g.scale.set(Math.max(0.001, k), Math.max(0.001, k * (1 + shake)), Math.max(0.001, k));
        g.rotation.x = shake * 0.8 + Math.sin(s * 0.8 + ph) * 0.01;
      } });
      this.trees.push(g);
    });

    // lamps: dowel posts + bead bulbs, each clicks on
    const lampSpots = [[-11, 1.75], [-7.4, 1.75], [-3.8, 1.75], [3.6, 1.75], [7.2, 1.75], [10.8, 1.75], [-9.1, -1.4], [-0.3, -1.45], [9.0, -1.4], [-5.5, 5.2], [5.6, 5.3], [0.1, 5.4]];
    const postMat = std({ color: 0x23201d, metalness: 0.3, roughness: 0.6 });
    const poolTex = radialGlow('rgba(255,196,120,1)', 'rgba(255,160,80,0)');
    const haloTex = radialGlow('rgba(255,230,170,1)', 'rgba(255,190,110,0)');
    this.lamps = [];
    const [l0, l1] = T2.lamps;
    lampSpots.forEach(([x, z], i) => {
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 1.05, 8), postMat); post.position.y = 0.52; post.castShadow = true;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.03), postMat); arm.position.set(0.08, 1.02, 0);
      const bulbMat = new THREE.MeshStandardMaterial({ color: 0x2a2620, emissive: 0xffc27a, emissiveIntensity: 0 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), bulbMat); bulb.position.set(0.16, 0.97, 0);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      halo.scale.setScalar(0.8); halo.position.copy(bulb.position);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: poolTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      pool.rotation.x = -HALF_PI; pool.position.set(0.16, 0.065, 0); pool.renderOrder = 2;
      g.add(post, arm, bulb, halo, pool);
      g.position.set(x, 0, z); g.rotation.z = (r() - 0.5) * 0.05;
      s.add(g);
      const pa = T2.props[0] + (T2.props[1] - T2.props[0]) * (i / lampSpots.length);
      const on = l0 + (l1 - l0) * ((i * 7) % lampSpots.length) / lampSpots.length;
      this.on(pa, 'pop', { pitch: 1.3 });
      this.on(on, 'click', { pan: x / 12 });
      this.items.push({ update: (s, abs) => {
        const p = prog(s, pa, pa + 0.45);
        g.visible = p > 0;
        g.scale.set(1, Math.max(0.001, backOut(p)), 1);
        let q = clamp((s - on) * 10);
        if (q > 0 && q < 1) q = Math.sin(i * 30 + s * 80) > 0 ? 1 : 0.1;
        const fl = 0.93 + 0.07 * noise1(abs * 7 + i * 13);
        bulbMat.emissiveIntensity = q * 3.2 * fl;
        halo.material.opacity = q * 0.85 * fl;
        pool.material.opacity = q * 0.55 * fl;
      } });
      this.lamps.push(g);
    });

    // string lights across the plaza, sagging on their threads
    const bulbs = [];
    const lines = [[[-6.5, 2.9, 5.6], [6.5, 2.9, 5.8]], [[-6.2, 2.7, 2.0], [6.4, 2.7, 2.1]]];
    const threadMat = new THREE.LineBasicMaterial({ color: 0x3a3228 });
    const bulbGeo = new THREE.SphereGeometry(0.035, 6, 4);
    const lineGroups = [];
    lines.forEach(([a, b], li) => {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24; const sag = Math.sin(u * Math.PI) * 0.45;
        pts.push(new THREE.Vector3(lerp(a[0], b[0], u), lerp(a[1], b[1], u) - sag, lerp(a[2], b[2], u)));
      }
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), threadMat);
      const g = new THREE.Group(); g.add(line);
      pts.forEach((p, i) => { if (i % 2 === 0) { const m = new THREE.Mesh(bulbGeo, new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false })); m.position.copy(p); g.add(m); bulbs.push({ m, li, i }); } });
      s.add(g); lineGroups.push(g);
    });
    // poles that hold them
    for (const [x, z, h] of [[-6.5, 5.6, 2.9], [6.5, 5.8, 2.9], [-6.2, 2.0, 2.7], [6.4, 2.1, 2.7]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 6), trunkMat); p.position.set(x, h / 2, z); s.add(p); lineGroups.push(p);
    }
    const warm = new THREE.Color(2.2, 1.5, 0.7);
    this.items.push({ update: (s, abs) => {
      const vis = s > T2.props[1] - 0.3;
      lineGroups.forEach((g) => (g.visible = vis));
      bulbs.forEach(({ m, li, i }) => {
        const on = T2.lamps[1] + li * 0.25 + i * 0.03;       // chase along each string
        const q = clamp((s - on) * 12);
        m.material.color.copy(warm).multiplyScalar(q * (0.85 + 0.15 * Math.sin(abs * 3 + i)));
      });
    } });

    // signs: ELM ST and LeBauer Park
    const mkSign = (text, x, z, w, rotY) => {
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), postMat); post.position.y = 0.6;
      const pl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.24, 0.03), [postMat, postMat, postMat, postMat, std({ map: signTexture(text, { w: 512, h: 112, font: '700 64px "Fredoka", sans-serif' }) }), std({ color: 0x1f6b3f })]);
      pl.position.y = 1.2; pl.castShadow = true;
      g.add(post, pl); g.position.set(x, 0, z); g.rotation.y = rotY;
      s.add(g);
      const at = T2.props[0] + r() * 0.8;
      this.on(at, 'pop', { pitch: 1.0 });
      this.items.push({ update: (s) => { const p = prog(s, at, at + 0.5); g.visible = p > 0; g.scale.setScalar(Math.max(0.001, elasticOut(p))); } });
    };
    mkSign('ELM ST', -1.7, 1.6, 0.9, 0.2);
    mkSign('LEBAUER PARK', 3.9, 5.2, 1.5, -0.25);

    // benches
    for (const [x, z, ry] of [[-3.9, 3.4, 0.3], [3.0, 5.6, -0.2]]) {
      const g = new THREE.Group();
      const wood = std({ map: kraft(900 + x, [140, 96, 60]) });
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.25), wood); seat.position.y = 0.22;
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.04), wood); back.position.set(0, 0.36, -0.12);
      for (const lx of [-0.34, 0.34]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.22), postMat); l.position.set(lx, 0.11, 0); g.add(l); }
      g.add(seat, back); g.position.set(x, 0, z); g.rotation.y = ry; g.traverse((o) => (o.castShadow = true));
      s.add(g);
      const at = T2.props[0] + 0.3 + r();
      this.on(at, 'pop', { pitch: 0.9 });
      this.items.push({ update: (s) => { const p = prog(s, at, at + 0.5); g.visible = p > 0; g.scale.setScalar(Math.max(0.001, backOut(p))); } });
    }
    // brick wall for the cat
    {
      const wall = cardBox(1.5, 0.5, 0.35, { seed: 950, style: { tone: [158, 78, 58], brick: true, win: [1, 1], lit: 0 } });
      wall.position.set(-8.9, 0, 2.6);
      s.add(wall);
      const at = T2.props[0] + 0.6;
      this.on(at, 'pop', { pitch: 0.7 });
      this.items.push({ update: (s) => { const p = prog(s, at, at + 0.5); wall.visible = p > 0; wall.scale.set(1, Math.max(0.001, backOut(p)), 1); } });
      this.catWall = [-8.9, 0.57, 2.6];
    }
    // the city's own manhole: the same medallion, smaller
    {
      const m = makeMedallion(0.42, { layers: 3, thickness: 0.05 });
      const hingeG = new THREE.Group();
      hingeG.position.set(CITY.manhole[0], 0.001, CITY.manhole[2] - 0.43);
      m.position.z = 0.43;
      hingeG.add(m);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.41, 40), new THREE.MeshBasicMaterial({ color: 0x050505 }));
      hole.rotation.x = -HALF_PI; hole.position.set(CITY.manhole[0], 0.004, CITY.manhole[2]);
      s.add(hingeG, hole);
      const at = T2.props[0] + 0.2;
      this.on(at, 'pop', { pitch: 1.1 });
      this.cityCover = hingeG;
      this.items.push({ update: (s) => {
        const p = prog(s, at, at + 0.5);
        hingeG.visible = hole.visible = p > 0;
        m.scale.setScalar(Math.max(0.001, elasticOut(p)));
        hole.scale.setScalar(Math.max(0.001, elasticOut(p)));
        // the snap flings it open for the beacon
        const o = prog(s, T2.beaconUp[0] - 0.1, T2.beaconUp[0] + 0.35);
        hingeG.rotation.x = -backOut(o, 2) * 1.95;
      } });
    }
  }

  buildMoon() {
    const s = this.scene;
    // crescent: the part of a disc outside an offset disc, traced as one outline
    const R = 1.05, C2 = new THREE.Vector2(0.5, 0.22), R2 = 0.9;
    const pts = [];
    const N = 64;
    for (let i = 0; i <= N; i++) {            // outer rim, only where it is outside the bite
      const a = (i / N) * Math.PI * 2, p = new THREE.Vector2(Math.cos(a) * R, Math.sin(a) * R);
      if (p.distanceTo(C2) >= R2) pts.push({ p, a });
    }
    // order the rim points so the arc is contiguous, starting just after the gap
    let gap = 0; for (let i = 1; i < pts.length; i++) if (pts[i].a - pts[i - 1].a > 0.2) gap = i;
    const rim = pts.slice(gap).concat(pts.slice(0, gap)).map((o) => o.p);
    const shape = new THREE.Shape(rim);
    // inner edge: back along the bite's circle, from the rim's end to its start
    const e = rim[rim.length - 1], s0 = rim[0];
    let a0 = Math.atan2(e.y - C2.y, e.x - C2.x), a1 = Math.atan2(s0.y - C2.y, s0.x - C2.x);
    // go the way that stays inside the moon's disc
    const mid = (x, y, cw) => { let d = y - x; if (cw && d > 0) d -= Math.PI * 2; if (!cw && d < 0) d += Math.PI * 2; return x + d / 2; };
    const inside = (ang) => new THREE.Vector2(C2.x + Math.cos(ang) * R2, C2.y + Math.sin(ang) * R2).length() < R;
    const cw = inside(mid(a0, a1, true));
    shape.absarc(C2.x, C2.y, R2, a0, a1, cw);
    const tie = new THREE.Vector2(Math.cos(1.75) * R * 0.9, Math.sin(1.75) * R * 0.9);   // punched hole near the top horn
    const punched = new THREE.Path(); punched.absarc(tie.x, tie.y, 0.045, 0, Math.PI * 2, true);
    shape.holes.push(punched);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.07, bevelEnabled: false, curveSegments: 48 });
    const face = std({ color: 0xf0d060, map: kraft(1001, [240, 210, 110], false), emissive: 0xffd060, emissiveIntensity: 0.0 });
    const edge = std({ map: flutes(1002, [220, 190, 110]) });
    const moon = new THREE.Mesh(geo, [face, edge]);
    moon.castShadow = true;
    const holder = new THREE.Group();     // pivot = where the string ties on
    moon.position.set(-tie.x, -tie.y, -0.035);
    holder.add(moon);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 5), std({ color: 0xf0e8d4 }));
    s.add(holder, str);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialGlow('rgba(255,236,170,1)', 'rgba(255,220,140,0)'), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    glow.scale.setScalar(4.2);
    s.add(glow);
    const rest = new THREE.Vector3(-6.9, 9.75, -6.4);   // clear of the mill smoke, above the water tower
    const t0 = T2.moon;
    this.on(t0, 'moonDrop');
    this.on(t0 + 0.42, 'moonCatch');
    this.items.push({ update: (s, abs) => {
      const u = s - t0;
      holder.visible = str.visible = u > 0;
      // falls, string catches, bounces on its stretch, swings, settles a bit crooked
      let y;
      if (u < 0.42) y = rest.y + 9 - 9 * (u / 0.42) ** 2 - 0.35 * (u / 0.42);
      else y = rest.y - 0.35 * Math.exp(-4 * (u - 0.42)) * Math.cos(9 * (u - 0.42));
      const land = s - T2.land;
      const sway = (u > 0.42 ? 0.3 * Math.exp(-1.2 * (u - 0.42)) * Math.sin(3.2 * (u - 0.42)) : 0.05) + 0.01 * Math.sin(abs * 0.7) + (land > 0 ? wobble(land, 1.3, 1.2) * 0.1 : 0);
      holder.position.set(rest.x, y, rest.z);
      holder.rotation.z = -0.13 + sway;                 // hangs crooked, on purpose
      holder.rotation.y = 0.2 * Math.sin(abs * 0.4);
      const topY = 26;
      str.position.set(rest.x, (y + topY) / 2, rest.z);
      str.scale.y = topY - y;
      const lit = smooth(prog(s, T2.windows[0], T2.windows[1]));
      face.emissiveIntensity = 0.12 + lit * 0.35;
      glow.material.opacity = (u > 0 ? 0.12 + lit * 0.18 : 0);
      glow.position.set(rest.x - 0.2, y - 0.9, rest.z - 2.6);
    } });
  }

  buildTraffic() {
    const s = this.scene;
    const r = this.r;
    const colors = [0xc0392b, 0xe6b53a, 0x2e6fb0, 0x3f8f58, 0xd9d2c0, 0xc0392b, 0x2e6fb0, 0xe6b53a];
    const glow = radialGlow('rgba(255,236,190,1)', 'rgba(255,220,160,0)');
    // one shared "traffic clock": cars ease to a stop when he lands, then carry on
    const dt = 1 / 60, table = [0];
    const vAt = (s) => {
      const l = T2.land;
      if (s < l - 0.25) return 1;
      if (s < l + 0.25) return lerp(1, 0, smooth(prog(s, l - 0.25, l + 0.25)));
      if (s < l + 1.8) return 0;
      return smooth(prog(s, l + 1.8, l + 3.0));
    };
    for (let s = 0; s < 400; s += dt) table.push(table[table.length - 1] + vAt(s) * dt);
    const dist = (s) => { const i = clamp(s / dt, 0, table.length - 2); const k = Math.floor(i); return lerp(table[k], table[k + 1], i - k); };
    this.cars = [];
    colors.forEach((col, i) => {
      const g = new THREE.Group();
      const paint = std({ color: col, roughness: 0.55 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.3), paint); body.position.y = 0.15;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.26), paint); cab.position.set(-0.04, 0.29, 0);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.09, 0.27), std({ color: 0x1b2230, roughness: 0.2, metalness: 0.4 })); glass.position.set(-0.04, 0.29, 0);
      g.add(body, cab, glass);
      const wheelMat = std({ color: 0x1a1a1a });
      const wheels = [];
      for (const [wx, wz] of [[-0.2, 0.15], [0.2, 0.15], [-0.2, -0.15], [0.2, -0.15]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 12), wheelMat); w.rotation.x = HALF_PI; w.position.set(wx, 0.075, wz); g.add(w); wheels.push(w);
      }
      const hlMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
      for (const wz of [-0.09, 0.09]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), hlMat); h.position.set(0.31, 0.16, wz); g.add(h); }
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.6), new THREE.MeshBasicMaterial({ map: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      beam.rotation.x = -HALF_PI; beam.position.set(0.85, 0.05, 0); g.add(beam);
      g.traverse((o) => { if (o.isMesh && o !== beam) o.castShadow = true; });
      s.add(g);
      const dir = i % 2 ? -1 : 1;
      const lane = this.roadZ + (dir > 0 ? -0.5 : 0.55);
      const speed = 1.3 + r() * 0.8;
      const start = T2.cars + i * 0.9;
      const bob = r() * 6;
      this.on(start, 'car', { dir });
      this.items.push({ update: (s, abs) => {
        g.visible = s > start;
        const d = (dist(s) - dist(start)) * speed;
        const span = 30;
        const x = (((d % span) + span) % span) - 15;
        g.position.set(dir * x, 0.04 + Math.abs(Math.sin(abs * 9 + bob)) * 0.01 * vAt(s), lane);
        g.rotation.y = dir > 0 ? 0 : Math.PI;
        g.rotation.z = (vAt(s) < 0.5 && s > T2.land - 0.3 && s < T2.land + 0.6) ? 0.06 * wobble(s - T2.land + 0.3, 2, 4) : 0;   // nose-dive braking
        for (const w of wheels) w.rotation.y = -d * speed * 4;
        const on = smooth(prog(s, T2.windows[0], T2.windows[0] + 1));
        hlMat.color.setRGB(3 * on, 2.6 * on, 1.8 * on);
        beam.material.opacity = 0.5 * on;
      } });
      this.cars.push(g);
    });
    this.trafficSpeed = vAt;
  }

  buildPeople() {
    const s = this.scene;
    const r = this.r;
    const skin = ['#8d5a3b', '#e0b48f', '#5b3a26', '#c68a62', '#f1c7a5', '#7a4a30'];
    const cloth = ['#c0392b', '#2e6fb0', '#e6b53a', '#3f8f58', '#7d4a9e', '#d56f2c', '#27496d', '#9e2f55', '#46705a'];
    const personTex = (seed) => {
      const rr = rng(seed);
      const c = document.createElement('canvas'); c.width = 96; c.height = 256; const g = c.getContext('2d');
      const sk = skin[(rr() * skin.length) | 0], top = cloth[(rr() * cloth.length) | 0], bottom = rr() < 0.5 ? '#2b2b33' : cloth[(rr() * cloth.length) | 0];
      g.fillStyle = sk; g.beginPath(); g.arc(48, 34, 22, 0, 7); g.fill();
      g.fillStyle = rr() < 0.5 ? '#2a1a10' : '#161616'; g.beginPath(); g.arc(48, 28, 23, Math.PI, 0); g.fill();
      g.fillStyle = top; g.beginPath(); g.roundRect(20, 58, 56, 92, 18); g.fill();
      if (rr() < 0.5) { g.fillStyle = bottom; g.fillRect(22, 146, 52, 20); }
      g.fillStyle = bottom; g.fillRect(26, 150, 19, 96); g.fillRect(51, 150, 19, 96);
      g.fillStyle = '#1a1512'; g.fillRect(24, 238, 23, 12); g.fillRect(49, 238, 23, 12);
      g.fillStyle = sk; g.fillRect(12, 68, 10, 60); g.fillRect(74, 68, 10, 60);
      // hand-drawn outline wobble
      g.strokeStyle = 'rgba(30,20,10,0.5)'; g.lineWidth = 2; g.strokeRect(20, 58, 56, 92);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    const standMat = std({ map: kraft(1200, [190, 160, 120]) });
    const mkPerson = (seed, h = 0.34) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.375, h), new THREE.MeshStandardMaterial({ map: personTex(seed), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }));
      m.position.y = h / 2 + 0.02; m.castShadow = true;
      m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: m.material.map, alphaTest: 0.5 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(h * 0.35, 0.02, 0.07), standMat); base.position.y = 0.01;   // the little card stand
      g.add(m, base);
      g.userData.card = m;
      s.add(g);
      return g;
    };
    const dogTex = (seed, col) => {
      const c = document.createElement('canvas'); c.width = 160; c.height = 110; const g = c.getContext('2d');
      g.fillStyle = col;
      g.beginPath(); g.ellipse(80, 56, 46, 20, 0, 0, 7); g.fill();                 // body
      g.beginPath(); g.ellipse(128, 34, 18, 15, 0, 0, 7); g.fill();                // head
      g.beginPath(); g.ellipse(142, 40, 12, 7, 0.2, 0, 7); g.fill();               // snout
      g.beginPath(); g.moveTo(118, 22); g.lineTo(112, 4); g.lineTo(126, 18); g.fill(); // ear
      for (const lx of [44, 58, 100, 112]) g.fillRect(lx, 64, 8, 36);              // legs
      g.fillStyle = '#111'; g.beginPath(); g.arc(152, 38, 3, 0, 7); g.fill(); g.beginPath(); g.arc(132, 30, 2.5, 0, 7); g.fill();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    const mkDog = (col) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.235), new THREE.MeshStandardMaterial({ map: dogTex(1, col), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }));
      m.position.y = 0.13; m.castShadow = true;
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.01), std({ color: col }));
      tail.geometry.translate(-0.05, 0, 0); tail.position.set(-0.14, 0.17, 0);
      g.add(m, tail); g.userData.tail = tail; g.userData.card = m;
      s.add(g);
      return g;
    };

    // walkers: {path: [x0,x1], z, speed, enter}
    this.walkers = [];
    const L = CITY.landing;
    const add = (obj, { z, x0, x1, speed, enter, bob = 1, kind = 'person' }) => {
      const ph = r() * 10;
      this.walkers.push(obj);
      this.items.push({ update: (s, abs) => {
        const u = s - enter;
        obj.visible = u > 0;
        if (u <= 0) return;
        // walk back and forth along the path; entering from the wings
        const len = Math.abs(x1 - x0);
        const d = (u * speed) % (2 * len);
        const fwd = d < len;
        let x = fwd ? x0 + Math.sign(x1 - x0) * d : x1 - Math.sign(x1 - x0) * (d - len);
        // freeze + look when he lands
        const land = s - T2.land;
        const facing = (fwd ? 1 : -1) * Math.sign(x1 - x0);
        let flip = facing, hop = 0, stopped = 1;
        if (land > -0.1 && land < 3.2) {
          stopped = 0;
          flip = Math.sign(L[0] - x) || 1;
          hop = land > 0 ? Math.max(0, Math.sin(Math.min(land * 7, Math.PI))) * 0.12 * (kind === 'dog' ? 1.3 : 1) : 0;
        }
        const step = Math.abs(Math.sin(abs * 7 * speed + ph)) * 0.025 * bob * stopped;
        obj.position.set(x, step + hop, z);
        obj.userData.card.scale.x = flip;
        obj.userData.card.rotation.z = Math.sin(abs * 7 * speed + ph) * 0.06 * stopped;
        if (obj.userData.tail) obj.userData.tail.rotation.z = 0.5 + Math.sin(abs * 18) * 0.5;
        if (obj.userData.tail) { obj.userData.tail.position.x = -0.14 * flip; obj.userData.tail.scale.x = flip; }
      } });
    };
    const P = T2.people, D = T2.dogs;
    const roadZ = this.roadZ;
    const specs = [
      { z: roadZ - 1.55, x0: -14, x1: -3, speed: 0.55, enter: P },
      { z: roadZ - 1.5, x0: 14, x1: 4, speed: 0.5, enter: P + 0.5 },
      { z: roadZ + 1.55, x0: -14, x1: -1.5, speed: 0.6, enter: P + 0.9 },
      { z: roadZ + 1.6, x0: 14, x1: 2.2, speed: 0.45, enter: P + 1.3 },
      { z: 3.9, x0: -7.5, x1: -2.4, speed: 0.35, enter: P + 1.8 },
      { z: 4.9, x0: 6.8, x1: 2.0, speed: 0.3, enter: P + 2.2 },
      { z: roadZ - 1.45, x0: -13, x1: 11, speed: 0.7, enter: P + 2.7 },
      { z: 2.3, x0: 8.5, x1: 2.4, speed: 0.4, enter: P + 3.1 },
      { z: 5.3, x0: -3, x1: -6.5, speed: 0.25, enter: P + 3.6 },
    ];
    specs.forEach((sp, i) => { add(mkPerson(1300 + i, 0.3 + r() * 0.08), sp); this.on(sp.enter + 0.6, 'steps', { pan: sp.x0 / 14 }); });
    // a couple on the bench (still, but breathing)
    const sit1 = mkPerson(1400, 0.3); sit1.position.set(-4.05, 0.1, 3.45);
    const sit2 = mkPerson(1401, 0.29); sit2.position.set(-3.72, 0.1, 3.5);
    for (const [o, k] of [[sit1, 0], [sit2, 1]]) this.items.push({ update: (s, abs) => { o.visible = s > P + 0.4; o.userData.card.scale.y = 1 + Math.sin(abs * 1.3 + k) * 0.01; } });
    // dogs, walking with their people (and a leash of real string)
    const dogSpecs = [
      { col: '#b88a4a', z: roadZ + 1.5, x0: -13, x1: 0.5, speed: 0.6, enter: D },
      { col: '#2b2622', z: 4.3, x0: 7.5, x1: 1.8, speed: 0.4, enter: D + 1.2 },
    ];
    dogSpecs.forEach((sp, i) => {
      const dog = mkDog(sp.col);
      add(dog, { ...sp, kind: 'dog', bob: 2 });
      const owner = mkPerson(1500 + i, 0.33);
      add(owner, { ...sp, z: sp.z - 0.05, x0: sp.x0 - Math.sign(sp.x1 - sp.x0) * 0.55, x1: sp.x1 - Math.sign(sp.x1 - sp.x0) * 0.55 });
      const leash = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xc0392b }));
      s.add(leash);
      this.items.push({ update: () => {
        leash.visible = dog.visible;
        const a = owner.position, b = dog.position;
        const pos = leash.geometry.attributes.position;
        pos.setXYZ(0, a.x + (b.x > a.x ? 0.06 : -0.06), a.y + 0.2, a.z + 0.01); pos.setXYZ(1, b.x, b.y + 0.18, b.z); pos.needsUpdate = true;
      } });
      this.on(sp.enter + 1.5, 'bark', { pan: sp.x0 / 14, pitch: i ? 0.8 : 1.15 });
    });
    this.on(T2.land + 0.35, 'bark', { pan: 0.2, pitch: 1.2 });
    this.on(T2.land + 0.7, 'bark', { pan: -0.3, pitch: 0.85 });
    // a cat on the wall, tail swishing
    {
      const c = document.createElement('canvas'); c.width = 100; c.height = 110; const g = c.getContext('2d');
      g.fillStyle = '#d2873a';
      g.beginPath(); g.ellipse(50, 75, 26, 30, 0, 0, 7); g.fill(); g.beginPath(); g.arc(50, 32, 20, 0, 7); g.fill();
      g.beginPath(); g.moveTo(33, 22); g.lineTo(36, 2); g.lineTo(46, 16); g.fill(); g.beginPath(); g.moveTo(67, 22); g.lineTo(64, 2); g.lineTo(54, 16); g.fill();
      g.fillStyle = '#1a2a10'; g.beginPath(); g.arc(43, 32, 3, 0, 7); g.arc(57, 32, 3, 0, 7); g.fill();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const cat = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.29), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }));
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.01), std({ color: 0xd2873a })); tail.geometry.translate(0, 0.1, 0);
      const g2 = new THREE.Group(); cat.position.y = 0.145; tail.position.set(0.1, 0.05, -0.01); g2.add(cat, tail);
      g2.position.set(...this.catWall); s.add(g2);
      this.items.push({ update: (s, abs) => {
        g2.visible = s > P + 1;
        tail.rotation.z = -0.4 + Math.sin(abs * 2.2) * 0.35;
        const land = s - T2.land;
        g2.position.y = this.catWall[1] + (land > 0 ? Math.max(0, Math.sin(Math.min(land * 5, Math.PI))) * 0.3 : 0);   // cat startles
      } });
    }
  }

  // ACT IX: the theatrical beacon that rises out of the city's manhole
  buildBeacon() {
    const s = this.scene;
    const [mx, , mz] = CITY.manhole;
    const lift = new THREE.Group();       // rises out of the hole
    lift.position.set(mx, 0, mz);
    s.add(lift);
    const brass = std({ color: 0xc9a14e, metalness: 0.85, roughness: 0.35 });
    const card = std({ map: kraft(1600, [170, 140, 100]) });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.14, 24), card); base.position.y = 0.07;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), brass); post.position.y = 0.28;
    const yoke = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 24, Math.PI), brass); yoke.position.y = 0.55; yoke.rotation.z = Math.PI;
    lift.add(base, post, yoke);
    this.lamp = new THREE.Group();        // tilts: faces us, then flips skyward
    this.lamp.position.y = 0.58;
    lift.add(this.lamp);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.55, 28, 1, true), brass);
    drum.rotation.x = HALF_PI;
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.3, 28), card); back.position.z = -0.275; back.rotation.y = Math.PI;
    const lensMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.24, 32), lensMat); lens.position.z = 0.276;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 8, 32), brass); ring.position.z = 0.28;
    const gel = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.24, 32), new THREE.MeshBasicMaterial({ color: 0x3aa860, transparent: true, opacity: 0.55, toneMapped: false })); gel.position.z = 0.283;
    this.lamp.add(drum, back, lens, ring, gel);
    this.lamp.traverse((o) => (o.castShadow = true));
    // lens flare when it points at us
    const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialGlow('rgba(240,255,220,1)', 'rgba(160,255,120,0)'), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false }));
    flare.position.z = 0.4; this.lamp.add(flare);
    // the beam: a soft additive cone with drifting dust
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uI: { value: 0 }, uT: { value: 0 } },
      vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv=uv; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform float uI; uniform float uT; varying vec2 vUv; varying vec3 vP;
        float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
        void main(){ float along = vUv.y;
          float edge = sin(vUv.x*3.14159*2.0); edge = 0.35 + 0.65*abs(edge);
          float dust = h(floor(vec2(vUv.x*80., vUv.y*140. - uT*8.)));
          dust = step(0.985, dust)*1.5;
          float a = uI * (0.42 + dust*0.5) * (1.0 - along*0.8) * edge;
          gl_FragColor = vec4(vec3(0.78,1.0,0.62)*a, a); }`,
    });
    const beamLen = 22;
    const beamGeo = new THREE.CylinderGeometry(3.0, 0.22, beamLen, 40, 1, true).translate(0, beamLen / 2, 0).rotateX(HALF_PI);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.z = 0.28;
    this.lamp.add(beam);
    // a real light, so the city is lit by it too
    const spot = new THREE.SpotLight(0xc8ffa8, 0, 40, 0.16, 0.5, 1);
    spot.position.set(0, 0, 0.3);
    const tgt = new THREE.Object3D(); tgt.position.set(0, 0, 5); this.lamp.add(spot, tgt); spot.target = tgt;
    // the projected title on the sky
    const gobo = new THREE.Mesh(new THREE.PlaneGeometry(15, 5.6), new THREE.MeshBasicMaterial({ map: titleGobo(TITLE.text, TITLE.font), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false }));
    gobo.position.set(-0.6, 12.6, -9.1);
    s.add(gobo);
    this.gobo = gobo;
    const aimUp = new THREE.Vector3();
    this.on(T2.beaconUp[0], 'lift');
    this.on(T2.beaconUp[1] - 0.1, 'lampOn');
    this.on(T2.beaconFlip[0], 'flip');
    this.on(T2.title[0], 'title');
    this.items.push({ update: (s, abs) => {
      const up = backOut(prog(s, T2.beaconUp[0], T2.beaconUp[1]), 1.4);
      lift.visible = s > T2.beaconUp[0];
      lift.position.y = lerp(-1.4, 0.0, up);
      const on = prog(s, T2.beaconUp[1] - 0.1, T2.beaconUp[1] + 0.2);
      const onFlick = on > 0 && on < 1 ? (Math.sin(s * 90) > 0 ? 1 : 0.2) : on;
      // aim: first at the audience (straight at the camera), then flipped up at the sky
      const f = easeInOut(prog(s, T2.beaconFlip[0], T2.beaconFlip[1]));
      const camDir = Math.atan2(3.35 - 0.6, 13.6 - mz);             // pitch to face the camera
      aimUp.set(gobo.position.x - mx, gobo.position.y - 0.6, gobo.position.z - mz);
      const skyPitch = -Math.atan2(aimUp.y, -aimUp.z);                // pitch to the gobo
      const skyYaw = Math.atan2(aimUp.x, -aimUp.z);
      // rotate from facing +z (camera) through vertical to facing the sky behind
      const camYaw = Math.atan2(-mx, 13.6 - mz);
      const pitch = lerp(-camDir, -Math.PI - skyPitch, f + wobble(s - T2.beaconFlip[1], 3, 5) * 0.05);   // up and over, never through the floor
      this.lamp.rotation.set(pitch, lerp(camYaw, -skyYaw, f), 0, 'YXZ');
      const settle = smooth(prog(s, T2.beaconFlip[1] - 0.2, T2.title[1]));
      lensMat.color.setRGB(4 * onFlick, 5 * onFlick, 3.4 * onFlick);
      // glare straight into our eyes before the flip
      flare.material.opacity = onFlick * (1 - f) * 0.95;
      flare.scale.setScalar(2.6 + (1 - f) * 2);
      beamMat.uniforms.uI.value = onFlick * (0.35 + 0.65 * f) * (0.93 + 0.07 * noise1(abs * 9));
      beamMat.uniforms.uT.value = abs;
      beam.visible = onFlick > 0;
      spot.intensity = onFlick * 60;
      // title warms up like a projector: flicker, then steady
      const tp = prog(s, T2.title[0], T2.title[1]);
      let ti = smooth(tp);
      if (tp > 0 && tp < 0.55) ti *= (Math.sin(s * 47) > -0.2 ? 1 : 0.25);
      gobo.material.opacity = ti * (0.9 + 0.1 * noise1(abs * 6)) * settle;
      gobo.position.x = -0.6 + noise1(abs * 0.5) * 0.04;
    } });
    this.beaconLift = lift;
  }

  // paper confetti / dust on landing
  buildDust() {
    const n = 40;
    const geo = new THREE.PlaneGeometry(0.06, 0.04);
    const mat = std({ map: kraft(1700, [200, 170, 120], false), side: THREE.DoubleSide });
    const im = new THREE.InstancedMesh(geo, mat, n);
    const r = rng(55);
    const parts = Array.from({ length: n }, () => ({ a: r() * Math.PI * 2, v: 0.8 + r() * 1.6, up: 1.2 + r() * 2.2, spin: (r() - 0.5) * 20 }));
    this.scene.add(im);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
    const [lx, , lz] = CITY.landing;
    this.items.push({ update: (s) => {
      const u = s - T2.land;
      im.visible = u > 0 && u < 2.5;
      if (!im.visible) return;
      parts.forEach((pt, i) => {
        const y = Math.max(0.01, pt.up * u - 4.5 * u * u);
        const drift = 1 - Math.exp(-2.5 * u);
        p.set(lx + Math.cos(pt.a) * pt.v * drift, y, lz + Math.sin(pt.a) * pt.v * drift * 0.6);
        e.set(pt.spin * u, pt.spin * u * 0.7, 0); q.setFromEuler(e);
        sc.setScalar(y > 0.011 ? 1 : 1 - clamp((u - 0.8) / 1.5));
        m4.compose(p, q, sc); im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
    } });
  }

  update(s, abs) {
    for (const it of this.items) it.update(s, abs);
  }
}
