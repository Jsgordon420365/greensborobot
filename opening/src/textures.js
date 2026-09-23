// Hand-made material kit, painted procedurally onto canvases.
// The point is *evidence of making*: fibres, corrugation, crooked cuts, glue, pencil.
import * as THREE from 'three';
import { rng } from './util.js';

const cache = new Map();
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function fibres(g, w, h, r, n, alpha, light = false) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, l = 2 + r() * 10, a = r() * Math.PI;
    g.strokeStyle = light ? `rgba(255,245,225,${alpha * r()})` : `rgba(60,38,15,${alpha * r()})`;
    g.lineWidth = 0.6 + r() * 0.8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}
function speckle(g, w, h, r, n, col, a) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${col},${a * r()})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

// Kraft cardboard face. tone: [r,g,b]; ribs: faint corrugation showing through the liner.
export function kraft(seed = 1, tone = [186, 150, 104], ribs = true, size = 512) {
  const key = `kraft${seed}${tone}${ribs}${size}`;
  if (cache.has(key)) return cache.get(key);
  const r = rng(seed);
  const [c, g] = canvas(size, size);
  g.fillStyle = `rgb(${tone})`; g.fillRect(0, 0, size, size);
  // mottling
  for (let i = 0; i < 70; i++) {
    const x = r() * size, y = r() * size, rad = 20 + r() * 90;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    const d = r() < 0.5 ? '70,45,20' : '255,235,200';
    gr.addColorStop(0, `rgba(${d},${0.05 + r() * 0.06})`); gr.addColorStop(1, `rgba(${d},0)`);
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  if (ribs) for (let x = 0; x < size; x += 9) {
    g.fillStyle = 'rgba(80,50,20,0.07)'; g.fillRect(x, 0, 3, size);
    g.fillStyle = 'rgba(255,240,210,0.05)'; g.fillRect(x + 4, 0, 2, size);
  }
  fibres(g, size, size, r, 2600, 0.22);
  fibres(g, size, size, r, 900, 0.18, true);
  speckle(g, size, size, r, 1500, '40,25,10', 0.35);
  // a glue smear and a pencil mark or two — human traces
  if (r() < 0.8) {
    g.fillStyle = 'rgba(255,250,220,0.10)';
    g.beginPath(); g.ellipse(r() * size, r() * size, 30 + r() * 40, 8 + r() * 10, r() * 3, 0, 7); g.fill();
  }
  g.strokeStyle = 'rgba(70,70,80,0.25)'; g.lineWidth = 1;
  for (let i = 0; i < 2; i++) {
    const x = r() * size, y = r() * size;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + r() * 60, y + (r() - 0.5) * 6); g.stroke();
  }
  const t = tex(c);
  cache.set(key, t);
  return t;
}

// Corrugated edge: the cross-section you see when cardboard is cut.
export function flutes(seed = 3, tone = [176, 140, 96], layers = 1) {
  const key = `flutes${seed}${tone}${layers}`;
  if (cache.has(key)) return cache.get(key);
  const r = rng(seed);
  const W = 512, H = 64 * layers;
  const [c, g] = canvas(W, H);
  const dark = `rgb(${tone.map((v) => v * 0.45 | 0)})`;
  g.fillStyle = dark; g.fillRect(0, 0, W, H);
  for (let L = 0; L < layers; L++) {
    const y0 = L * 64;
    g.fillStyle = `rgb(${tone})`;
    g.fillRect(0, y0 + 2, W, 7); g.fillRect(0, y0 + 55, W, 7);   // liners
    g.strokeStyle = `rgb(${tone.map((v) => v * 0.92 | 0)})`; g.lineWidth = 4;
    g.beginPath();
    for (let x = 0; x <= W; x += 2) {
      const y = y0 + 32 + Math.sin((x / 26) * Math.PI) * 20 + (r() - 0.5) * 1.2;
      if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  fibres(g, W, H, r, 500, 0.3);
  // torn fuzz on the edges
  speckle(g, W, H, r, 800, '255,235,200', 0.25);
  const t = tex(c);
  cache.set(key, t);
  return t;
}

export function whitePaper() {
  if (cache.has('white')) return cache.get('white');
  const r = rng(11);
  const [c, g] = canvas(1024, 1024);
  g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, 1024, 1024);
  fibres(g, 1024, 1024, r, 3000, 0.035);
  fibres(g, 1024, 1024, r, 1500, 0.25, true);
  const t = tex(c, { repeat: [6, 6] });
  cache.set('white', t);
  return t;
}

// Grey felt road with hand-painted yellow dashes (after the reference film).
export function feltRoad() {
  if (cache.has('felt')) return cache.get('felt');
  const r = rng(21);
  const W = 1024, H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#4b4a48'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26000; i++) {
    const v = 50 + r() * 60 | 0;
    g.fillStyle = `rgba(${v},${v},${v - 2},0.5)`;
    g.fillRect(r() * W, r() * H, 1 + r() * 2, 1);
  }
  fibres(g, W, H, r, 1600, 0.35, true);
  // dashes: slightly crooked, brushy
  for (let x = 20; x < W; x += 128) {
    const y = H / 2 + (r() - 0.5) * 5, len = 64 + r() * 10, th = 8 + r() * 2;
    g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 0.05);
    g.fillStyle = '#d9b43a'; g.globalAlpha = 0.92;
    g.beginPath(); g.roundRect(0, -th / 2, len, th, 3); g.fill();
    g.globalAlpha = 0.25; g.fillStyle = '#6b5a20';
    for (let k = 0; k < 40; k++) g.fillRect(r() * len, -th / 2 + r() * th, 2, 1);
    g.restore();
  }
  // edge stitching
  g.strokeStyle = 'rgba(200,190,170,0.35)'; g.setLineDash([6, 7]); g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, 10); g.lineTo(W, 12); g.moveTo(0, H - 10); g.lineTo(W, H - 12); g.stroke();
  const t = tex(c);
  cache.set('felt', t);
  return t;
}

// The medallion / manhole face: emerald card with raised gold-leaf inlays.
// Returns { map, metal, bump } canvases-as-textures.
export function medallionFace() {
  if (cache.has('medal')) return cache.get('medal');
  const S = 1024, C = S / 2;
  const mk = () => canvas(S, S);
  const [cm, gm] = mk(), [cx, gx] = mk(), [cb, gb] = mk();
  const r = rng(5);
  const green = '#1d5a3a', gold = '#cdb266';
  // base
  gm.fillStyle = green; gm.fillRect(0, 0, S, S);
  gx.fillStyle = '#000'; gx.fillRect(0, 0, S, S);
  gb.fillStyle = '#404040'; gb.fillRect(0, 0, S, S);
  // paint every gold element to all three canvases at once
  const paint = (fn) => {
    for (const [g, col] of [[gm, gold], [gx, '#fff'], [gb, '#c8c8c8']]) {
      g.save(); g.translate(C, C); g.fillStyle = col; g.strokeStyle = col; fn(g); g.restore();
    }
  };
  const ring = (g, r0, w) => { g.lineWidth = w; g.beginPath(); g.arc(0, 0, r0, 0, 7); g.stroke(); };
  paint((g) => ring(g, 490, 36));                    // outer gold rim
  paint((g) => ring(g, 420, 14));                    // inner rim line
  paint((g) => ring(g, 118, 22));                    // centre ring
  for (let k = 0; k < 4; k++) {
    paint((g) => {
      g.rotate((k * Math.PI) / 2 + (r() - 0.5) * 0.015);   // hand-cut: not quite square
      // cross-bar from centre ring to inner rim
      g.lineWidth = 16;
      g.beginPath(); g.moveTo(0, -130); g.lineTo(0, -410); g.stroke();
      // arrow/trapezoid frame pointing inward
      g.lineWidth = 15; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(-170, -385); g.lineTo(170, -385); g.lineTo(62, -175); g.lineTo(-62, -175); g.closePath(); g.stroke();
      // inner solid triangle
      g.beginPath(); g.moveTo(-70, -345); g.lineTo(70, -345); g.lineTo(0, -235); g.closePath(); g.fill();
      // diagonal chevron between arms
      g.rotate(Math.PI / 4); g.lineWidth = 13;
      g.beginPath(); g.moveTo(-95, -350); g.lineTo(0, -265); g.lineTo(95, -350); g.stroke();
    });
  }
  // paper texture + slight misregistration grime
  fibres(gm, S, S, r, 5000, 0.18);
  fibres(gm, S, S, r, 2000, 0.12, true);
  speckle(gm, S, S, r, 3000, '10,20,10', 0.3);
  // gold leaf crackle
  gm.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 400; i++) {
    gm.strokeStyle = `rgba(255,240,190,${0.15 * r()})`; gm.lineWidth = 1;
    const x = r() * S, y = r() * S;
    gm.beginPath(); gm.moveTo(x, y); gm.lineTo(x + (r() - 0.5) * 20, y + (r() - 0.5) * 20); gm.stroke();
  }
  gm.globalCompositeOperation = 'source-over';
  gb.filter = 'blur(2px)'; gb.drawImage(cb, 0, 0); gb.filter = 'none';
  const out = { map: tex(cm), metal: tex(cx, { srgb: false }), bump: tex(cb, { srgb: false }) };
  cache.set('medal', out);
  return out;
}

// Facade for a cardboard building. style: {tone, win:[cols,rows], winW, winH, trim, paint}
// Returns { map, emissive } so windows can light up independently.
export function facade(seed, style = {}) {
  const r = rng(seed);
  const W = 256, H = 512;
  const [c, g] = canvas(W, H), [ce, ge] = canvas(W, H);
  const tone = style.tone || [190, 156, 110];
  g.drawImage(kraft(seed + 100, tone, style.ribs !== false, 256).image, 0, 0, W, W);
  g.drawImage(kraft(seed + 101, tone, style.ribs !== false, 256).image, 0, W, W, W);
  if (style.paint) { g.fillStyle = style.paint; g.globalAlpha = 0.55; g.fillRect(0, 0, W, H); g.globalAlpha = 1; fibres(g, W, H, r, 800, 0.2); }
  if (style.brick) {
    g.strokeStyle = 'rgba(60,25,15,0.35)'; g.lineWidth = 1;
    for (let y = 0; y < H; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      for (let x = (y / 8) % 2 ? 0 : 8; x < W; x += 16) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 8); g.stroke(); } }
  }
  ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
  const [cols, rows] = style.win || [4, 10];
  const mx = style.margin ?? 26, top = style.top ?? 30, bot = style.bottom ?? 40;
  const cw = (W - mx * 2) / cols, rh = (H - top - bot) / rows;
  const ww = cw * (style.winW || 0.55), wh = rh * (style.winH || 0.6);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = mx + i * cw + (cw - ww) / 2 + (r() - 0.5) * 2.5;      // hand-cut windows: not aligned
    const y = top + j * rh + (rh - wh) / 2 + (r() - 0.5) * 2.5;
    // cut-out window: dark hole with a shadowed edge
    g.fillStyle = 'rgba(25,18,12,0.92)'; g.fillRect(x, y, ww, wh);
    g.fillStyle = 'rgba(255,240,210,0.25)'; g.fillRect(x, y + wh, ww, 2);
    if (style.trim) { g.fillStyle = style.trim; g.fillRect(x - 2, y - 3, ww + 4, 3); }
    const lit = r() < (style.lit ?? 0.62);
    if (lit) {
      const warm = r() < 0.85;
      ge.fillStyle = warm ? `rgb(255,${190 + r() * 40 | 0},${90 + r() * 50 | 0})` : 'rgb(170,200,255)';
      ge.globalAlpha = 0.6 + r() * 0.4;
      ge.fillRect(x + 1, y + 1, ww - 2, wh - 2);
      // curtain / silhouette in some windows
      if (r() < 0.25) { ge.fillStyle = 'rgba(0,0,0,0.5)'; ge.fillRect(x + 1, y + 1, ww * 0.35, wh - 2); }
      ge.globalAlpha = 1;
    }
  }
  if (style.door) { g.fillStyle = 'rgba(30,20,12,0.95)'; g.fillRect(W / 2 - 16, H - 42, 32, 42); ge.fillStyle = 'rgb(255,200,120)'; ge.fillRect(W / 2 - 12, H - 38, 24, 36); }
  // tape strip / glue seam down one side
  g.fillStyle = 'rgba(235,225,190,0.35)'; g.fillRect(r() < 0.5 ? 2 : W - 12, 0, 10, H);
  const map = tex(c), em = tex(ce);
  return { map, emissive: em };
}

// Painted dusk backdrop: gradient on paper, with a seam and tape.
export function backdrop() {
  const W = 2048, H = 1024;
  const [c, g] = canvas(W, H);
  const r = rng(31);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#0a1330');
  gr.addColorStop(0.45, '#15285a');
  gr.addColorStop(0.72, '#2f4f8a');
  gr.addColorStop(0.86, '#6c6f96');
  gr.addColorStop(0.95, '#c08466');
  gr.addColorStop(1, '#d99a62');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // dry-brush strokes
  for (let i = 0; i < 900; i++) {
    const y = r() * H, x = r() * W;
    g.strokeStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,20'},${0.025 * r()})`;
    g.lineWidth = 2 + r() * 6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 80 + r() * 200, y + (r() - 0.5) * 12); g.stroke();
  }
  fibres(g, W, H, r, 6000, 0.08, true);
  // painted cloud wisps near the horizon
  for (let i = 0; i < 9; i++) {
    const x = r() * W, y = H * (0.55 + r() * 0.25);
    g.fillStyle = 'rgba(160,150,190,0.10)';
    for (let k = 0; k < 7; k++) { g.beginPath(); g.ellipse(x + k * 40, y + (r() - 0.5) * 20, 70 + r() * 60, 16 + r() * 10, 0, 0, 7); g.fill(); }
  }
  // paper seam where two sheets meet, and tape
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(W * 0.62, 0, 3, H);
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(W * 0.62 + 3, 0, 2, H);
  for (const [x, y, a] of [[40, 30, -0.2], [W - 150, 40, 0.15], [W * 0.62 - 50, H * 0.72, 0.05], [W * 0.62 - 50, H * 0.9, -0.04]]) {
    g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = 'rgba(230,220,180,0.35)'; g.fillRect(0, 0, 110, 30); g.restore();
  }
  return tex(c);
}

export function radialGlow(inner = 'rgba(255,210,140,1)', outer = 'rgba(255,170,80,0)') {
  const key = 'glow' + inner + outer;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = canvas(256, 256);
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, inner); gr.addColorStop(0.35, inner.replace(/,1\)$/, ',0.45)')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = tex(c);
  cache.set(key, t);
  return t;
}

export function rope() {
  if (cache.has('rope')) return cache.get('rope');
  const r = rng(41);
  const [c, g] = canvas(64, 256);
  g.fillStyle = '#9c7c4a'; g.fillRect(0, 0, 64, 256);
  for (let y = -64; y < 256; y += 16) {
    g.fillStyle = 'rgba(60,40,15,0.45)';
    g.beginPath(); g.moveTo(0, y); g.lineTo(64, y + 40); g.lineTo(64, y + 46); g.lineTo(0, y + 6); g.fill();
    g.fillStyle = 'rgba(230,200,150,0.35)';
    g.beginPath(); g.moveTo(0, y + 8); g.lineTo(64, y + 48); g.lineTo(64, y + 51); g.lineTo(0, y + 11); g.fill();
  }
  fibres(g, 64, 256, r, 300, 0.4, true);
  const t = tex(c, { repeat: [1, 30] });
  cache.set('rope', t);
  return t;
}

// The wordmark as projected light: soft disc with the word in it (a gobo).
export function titleGobo(text, font) {
  const W = 2048, H = 768;
  const [c, g] = canvas(W, H);
  const gr = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.46);
  gr.addColorStop(0, 'rgba(236,255,200,0.42)'); gr.addColorStop(0.55, 'rgba(200,245,150,0.26)'); gr.addColorStop(0.9, 'rgba(170,235,120,0.10)'); gr.addColorStop(1, 'rgba(160,230,110,0)');
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(W / 2, H / 2, W * 0.47, H * 0.46, 0, 0, 7); g.fill();
  g.font = `600 250px ${font}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(190,255,120,0.9)'; g.shadowBlur = 40;
  g.fillStyle = 'rgba(248,255,225,1)';
  g.fillText(text, W / 2, H / 2 + 8);
  g.shadowBlur = 0;
  // projector dust / gel scratches
  const r = rng(77);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(20,40,10,${0.25 * r()})`; g.lineWidth = 1 + r();
    const x = r() * W, y = r() * H;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 60); g.stroke();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
