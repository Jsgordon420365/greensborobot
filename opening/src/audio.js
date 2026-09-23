// Foley for a world made of card, string and felt — synthesized, no files.
// Small physical sounds, sparse; one music-box voice for punctuation.
export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.amb = 0;          // ambience level target (0..1)
  }
  // must be called from a user gesture
  async enable() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 0.9;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
      this.master.connect(comp).connect(c.destination);
      // a small room: short convolution reverb from decaying noise
      this.verb = c.createConvolver();
      const len = c.sampleRate * 1.6, ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
      this.verb.buffer = ir;
      this.verbIn = c.createGain(); this.verbIn.gain.value = 0.28;
      this.verbIn.connect(this.verb).connect(this.master);
      this.noise = this.makeNoise(2);
      this.buildAmbience();
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.enabled = true;
  }
  disable() { this.enabled = false; if (this.ctx) this.ctx.suspend(); }

  makeNoise(sec) {
    const c = this.ctx, b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  out(pan = 0, wet = 0.25) {
    const c = this.ctx, g = c.createGain(), p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p); p.connect(this.master);
    if (wet > 0) { const w = c.createGain(); w.gain.value = wet; p.connect(w); w.connect(this.verbIn); }
    return g;
  }
  env(g, t, a, peak, d, curve = 'exp') {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    else g.gain.linearRampToValueAtTime(0, t + a + d);
  }
  noiseBurst({ t = 0, dur = 0.1, type = 'bandpass', freq = 2000, q = 1, gain = 0.3, pan = 0, attack = 0.002, sweep = null, wet = 0.2 }) {
    const c = this.ctx, now = c.currentTime + t;
    const src = c.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, now + dur);
    const g = this.out(pan, wet);
    src.connect(f).connect(g);
    this.env(g, now, attack, gain, dur);
    src.start(now, Math.random() * 1.5); src.stop(now + dur + attack + 0.05);
  }
  tone({ t = 0, freq = 440, to = null, dur = 0.2, type = 'sine', gain = 0.2, pan = 0, attack = 0.005, wet = 0.2 }) {
    const c = this.ctx, now = c.currentTime + t;
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    if (to) o.frequency.exponentialRampToValueAtTime(to, now + dur);
    const g = this.out(pan, wet);
    o.connect(g); this.env(g, now, attack, gain, dur);
    o.start(now); o.stop(now + dur + attack + 0.05);
  }
  // a music-box tine: fundamental + an inharmonic partial, long decay
  tine(midi, { t = 0, gain = 0.12, pan = 0 } = {}) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    this.tone({ t, freq: f, dur: 1.8, gain, pan, wet: 0.5 });
    this.tone({ t, freq: f * 2, dur: 0.6, gain: gain * 0.25, pan, wet: 0.5 });
    this.tone({ t, freq: f * 4.21, dur: 0.18, gain: gain * 0.2, pan, wet: 0.4 });
  }
  crinkle(n = 6, spread = 0.18, gain = 0.12, pan = 0, freq = 3500) {
    for (let i = 0; i < n; i++) this.noiseBurst({ t: Math.random() * spread, dur: 0.01 + Math.random() * 0.03, freq: freq * (0.6 + Math.random()), q: 2, gain: gain * (0.4 + Math.random() * 0.6), pan: pan + (Math.random() - 0.5) * 0.3 });
  }
  thump(gain = 0.35, freq = 90, pan = 0) {
    this.tone({ freq, to: freq * 0.45, dur: 0.18, gain, pan, wet: 0.15 });
    this.noiseBurst({ dur: 0.08, type: 'lowpass', freq: 600, gain: gain * 0.6, pan });
  }

  buildAmbience() {
    const c = this.ctx, sr = c.sampleRate, len = sr * 6;
    // crickets: several insects, each its own pitch/pan/rhythm
    const b = c.createBuffer(2, len, sr);
    const L = b.getChannelData(0), R = b.getChannelData(1);
    for (let k = 0; k < 5; k++) {
      const f = 3900 + k * 260 + Math.random() * 100, pan = Math.random() * 2 - 1, period = 0.7 + Math.random() * 0.6, off = Math.random() * period;
      for (let i = 0; i < len; i++) {
        const t = i / sr, ph = ((t + off) % period);
        if (ph > 0.18) continue;
        const pulse = Math.max(0, Math.sin(ph * Math.PI * 2 * 28));
        const v = Math.sin(2 * Math.PI * f * t) * pulse * 0.05 * Math.sin((ph / 0.18) * Math.PI);
        L[i] += v * (1 - pan) * 0.5; R[i] += v * (1 + pan) * 0.5;
      }
    }
    const cr = c.createBufferSource(); cr.buffer = b; cr.loop = true;
    this.cricketGain = c.createGain(); this.cricketGain.gain.value = 0;
    cr.connect(this.cricketGain).connect(this.master); cr.start();
    // distant city: soft brown-ish noise
    const cityB = c.createBuffer(1, len, sr), d = cityB.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    const ci = c.createBufferSource(); ci.buffer = cityB; ci.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    this.cityGain = c.createGain(); this.cityGain.gain.value = 0;
    ci.connect(lp).connect(this.cityGain).connect(this.master); ci.start();
    // beacon hum
    const hum = c.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 55;
    const hlp = c.createBiquadFilter(); hlp.type = 'lowpass'; hlp.frequency.value = 180;
    this.humGain = c.createGain(); this.humGain.gain.value = 0;
    hum.connect(hlp).connect(this.humGain).connect(this.master); hum.start();
  }
  // continuous layers follow the timeline
  setBeds({ crickets = 0, city = 0, hum = 0 }) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.cricketGain.gain.setTargetAtTime(crickets * 0.55, t, 0.4);
    this.cityGain.gain.setTargetAtTime(city * 0.22, t, 0.6);
    this.humGain.gain.setTargetAtTime(hum * 0.05, t, 0.2);
  }

  // one-shot events by name
  play(e) {
    if (!this.ctx || !this.enabled) return;
    const pan = e.pan || 0;
    const pent = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93];
    switch (e.type) {
      case 'glint': this.tine(96, { gain: 0.035 }); this.tone({ freq: 5200, dur: 0.5, gain: 0.015, wet: 0.7 }); break;
      case 'rattle': for (let i = 0; i < 4; i++) this.noiseBurst({ t: i * 0.055, dur: 0.03, freq: 1800, q: 4, gain: 0.12 }); this.tone({ t: 0, freq: 2400, dur: 0.12, gain: 0.02, type: 'triangle' }); break;
      case 'lift': this.noiseBurst({ dur: 0.35, freq: 900, sweep: 1400, q: 3, gain: 0.08, attack: 0.08 }); this.crinkle(3, 0.3, 0.05); break;
      case 'eyes': this.tone({ freq: 380, to: 520, dur: 0.25, gain: 0.03, wet: 0.5 }); break;
      case 'look': this.noiseBurst({ dur: 0.04, freq: 5000, q: 5, gain: 0.02, pan }); break;
      case 'blink': this.tone({ freq: 1500, to: 900, dur: 0.05, gain: 0.03, type: 'triangle' }); break;
      case 'recognise': this.tone({ freq: 700, to: 1100, dur: 0.18, gain: 0.05, type: 'sine', wet: 0.4 }); this.tine(88, { t: 0.02, gain: 0.05 }); break;
      case 'pop': this.tone({ freq: 250 * (e.pitch || 1), to: 700 * (e.pitch || 1), dur: 0.09, gain: 0.12 * (e.gain || 1), pan }); this.crinkle(3, 0.06, 0.05, pan); break;
      case 'popOut': this.tone({ freq: 160, to: 620, dur: 0.16, gain: 0.25 }); this.noiseBurst({ dur: 0.25, freq: 1200, sweep: 3000, gain: 0.12 }); break;
      case 'clatter': for (let i = 0; i < 5; i++) this.noiseBurst({ t: i * 0.09 * (1 - i * 0.12), dur: 0.05, freq: 1100 + i * 90, q: 3, gain: 0.2 * (1 - i * 0.16), pan: 0.3 }); this.thump(0.2, 140, 0.3); break;
      case 'land': this.thump(e.gain || 0.45, e.freq || 80, pan); this.crinkle(8, 0.2, 0.08, pan, 2500); break;
      case 'wave': this.noiseBurst({ dur: 0.3, freq: 1400, q: 1, gain: 0.03, attack: 0.1 }); break;
      case 'stretch': this.tone({ freq: 180, to: 520, dur: 0.8, gain: 0.05, type: 'triangle', wet: 0.3 }); this.noiseBurst({ dur: 0.8, freq: 800, sweep: 2500, gain: 0.05, attack: 0.3 }); break;
      case 'beckon': this.tone({ freq: 330, to: 440, dur: 0.1, gain: 0.03, type: 'triangle' }); break;
      case 'retract': this.tone({ freq: 600, to: 150, dur: 0.35, gain: 0.06, type: 'triangle' }); break;
      case 'hop': this.tone({ freq: 220, to: 520, dur: 0.14, gain: 0.12 }); break;
      case 'dive': this.noiseBurst({ dur: 1.6, type: 'bandpass', freq: 400, sweep: 3200, q: 0.8, gain: 0.3, attack: 0.9 }); this.tone({ freq: 90, to: 38, dur: 2.2, gain: 0.15, wet: 0.5, attack: 0.5 }); break;
      case 'star': { const n = pent[e.i % pent.length] + (e.i >= pent.length ? 12 : 0); this.tine(n - 12, { gain: 0.08, pan: (Math.random() - 0.5) * 0.8 }); this.crinkle(2, 0.04, 0.03); break; }
      case 'fold': { const s = Math.min(2, e.size || 1); this.crinkle(10, 0.35, 0.1 * s, pan, 2200); this.noiseBurst({ t: 0.3, dur: 0.12, type: 'lowpass', freq: 500, gain: 0.15 * s }); this.tone({ t: 0.32, freq: 110, to: 70, dur: 0.12, gain: 0.08 * s }); break; }
      case 'nudge': this.thump(0.25, 160); this.crinkle(5, 0.12, 0.1); break;
      case 'unroll': { const d = e.dur || 2.5; this.noiseBurst({ dur: d, type: 'lowpass', freq: 380, gain: 0.18, attack: 0.3 }); for (let i = 0; i < d * 5; i++) this.noiseBurst({ t: i * 0.2 + Math.random() * 0.05, dur: 0.04, type: 'lowpass', freq: 300, gain: 0.08, pan: -1 + (2 * i) / (d * 5) }); break; }
      case 'click': this.noiseBurst({ dur: 0.012, freq: 3000, q: 3, gain: 0.12, pan }); this.tone({ t: 0.01, freq: 60, dur: 0.4, gain: 0.015, type: 'sawtooth', pan }); break;
      case 'moonDrop': this.noiseBurst({ dur: 0.42, freq: 800, sweep: 300, q: 1, gain: 0.06 }); break;
      case 'moonCatch': this.tone({ freq: 140, to: 95, dur: 0.5, gain: 0.08, type: 'triangle', wet: 0.4 }); this.crinkle(4, 0.1, 0.06, 0.5); this.tine(79, { t: 0.05, gain: 0.05 }); break;
      case 'car': this.noiseBurst({ dur: 2.0, type: 'lowpass', freq: 260, gain: 0.05, attack: 0.9, pan: e.dir > 0 ? -0.8 : 0.8 }); break;
      case 'steps': for (let i = 0; i < 6; i++) this.noiseBurst({ t: i * 0.28, dur: 0.02, freq: 1800, q: 2, gain: 0.02, pan }); break;
      case 'bark': { const p = e.pitch || 1; for (const dt of [0, 0.22]) { this.noiseBurst({ t: dt, dur: 0.09, freq: 700 * p, sweep: 400 * p, q: 5, gain: 0.07, pan }); this.tone({ t: dt, freq: 420 * p, to: 260 * p, dur: 0.1, gain: 0.04, type: 'square', pan }); } break; }
      case 'creak': for (let i = 0; i < 3; i++) this.tone({ t: i * 0.13, freq: 190 + i * 40, to: 150 + i * 30, dur: 0.12, gain: 0.03, type: 'sawtooth', pan: 0.7, wet: 0.5 }); break;
      case 'swoosh': this.noiseBurst({ dur: 1.1, freq: 300, sweep: 2200, q: 0.7, gain: 0.55, attack: 0.28, pan: 0.6 }); this.tone({ freq: 110, to: 60, dur: 1.0, gain: 0.14, attack: 0.2, pan: 0.5 }); break;
      case 'release': this.noiseBurst({ dur: 0.08, freq: 2400, q: 2, gain: 0.08 }); this.tone({ freq: 400, to: 800, dur: 0.12, gain: 0.05, type: 'triangle' }); break;
      case 'flipWhoosh': this.noiseBurst({ dur: 0.6, freq: 700, sweep: 1600, q: 2, gain: 0.12, attack: 0.15 }); break;
      case 'snap': this.noiseBurst({ dur: 0.03, type: 'highpass', freq: 2500, gain: 0.5, wet: 0.5 }); this.tone({ freq: 1900, to: 900, dur: 0.05, gain: 0.08, type: 'triangle' }); break;
      case 'lift2': this.tone({ freq: 90, to: 180, dur: 0.8, gain: 0.08, type: 'square', wet: 0.2 }); this.crinkle(4, 0.6, 0.05); break;
      case 'lampOn': this.noiseBurst({ dur: 0.02, freq: 2600, q: 3, gain: 0.2 }); this.noiseBurst({ t: 0.1, dur: 0.02, freq: 2600, q: 3, gain: 0.1 }); this.tone({ freq: 55, dur: 0.6, gain: 0.05, type: 'sawtooth' }); break;
      case 'flip': this.tone({ freq: 300, to: 180, dur: 0.5, gain: 0.05, type: 'triangle', wet: 0.3 }); this.noiseBurst({ dur: 0.7, freq: 500, sweep: 2000, gain: 0.06, attack: 0.3 }); break;
      case 'title': {
        // the motif: gre-ens-bo-ro-bot
        [76, 79, 81, 79, 84].forEach((n, i) => this.tine(n, { t: 0.15 + i * 0.26 + (i === 4 ? 0.12 : 0), gain: 0.1, pan: (i - 2) * 0.15 }));
        // and a warm swell under it
        const c = this.ctx, now = c.currentTime;
        const g = this.out(0, 0.6); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(300, now); f.frequency.linearRampToValueAtTime(1400, now + 2.5);
        f.connect(g);
        for (const [m, det] of [[48, -6], [55, 4], [60, -3], [64, 5], [67, 0]]) {
          const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 440 * Math.pow(2, (m - 69) / 12); o.detune.value = det;
          o.connect(f); o.start(now); o.stop(now + 7);
        }
        g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(0.035, now + 1.8); g.gain.linearRampToValueAtTime(0.0001, now + 6.8);
        break;
      }
      default: break;
    }
  }
}
