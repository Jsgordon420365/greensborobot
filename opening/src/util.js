// Pure helpers. Everything on stage is a pure function of timeline time,
// so any moment can be scrubbed to (?t=…) and replayed identically.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const prog = (t, a, b) => clamp((t - a) / (b - a));           // 0..1 across [a,b]
export const smooth = (x) => x * x * (3 - 2 * x);
export const easeOut = (x) => 1 - Math.pow(1 - x, 3);
export const easeIn = (x) => x * x * x;
export const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const backOut = (x, s = 1.7) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
export const elasticOut = (x) =>
  x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
// damped spring settle: value goes 0 -> 1 with overshoot, t in seconds since start
export const spring = (t, freq = 3, damp = 4) =>
  t <= 0 ? 0 : 1 - Math.exp(-damp * t) * Math.cos(freq * 2 * Math.PI * t);
// damped wobble around 0 (for "the world reacts")
export const wobble = (t, freq = 5, damp = 5) =>
  t <= 0 ? 0 : Math.exp(-damp * t) * Math.sin(freq * 2 * Math.PI * t);

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
export const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
// tiny 1D value noise for hand-held imperfection
export const noise1 = (x) => {
  const i = Math.floor(x), f = x - i;
  return lerp(hash(i), hash(i + 1), smooth(f)) * 2 - 1;
};
