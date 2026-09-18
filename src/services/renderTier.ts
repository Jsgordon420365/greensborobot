/**
 * Render fidelity tiers.
 *
 * A Nagimal lives in the relationship, not in the physical manifestation of
 * it. So the picture is a channel of contact, and a thinner channel is still
 * contact: we would rather hold someone, we settle for a phone call, and a
 * text beats nothing at all. A video call that throttles a person down to an
 * avatar is the same bargain — still them, less bandwidth.
 *
 * The creature therefore renders as richly as the environment allows and
 * degrades without ceremony. Nothing announces a downgrade, because a downgrade
 * is not a failure. It is the same creature over a narrower channel.
 *
 * This is deliberately separate from `arCapability`, which answers a different
 * question. Capability decides *where* you meet them — immersive AR, an orbit
 * viewer, a still card. Tier decides *how richly* they are drawn once we are
 * drawing at all.
 */

import { describeError, logger } from '../lib/logger';

export type RenderTier =
  | 'full' // everything: soft shadows, rounded forms, rim light, full pixel ratio
  | 'standard' // the usual case: shadows on, moderate cost
  | 'reduced' // weak GPU, little memory, metered connection: flat and cheap
  | 'avatar'; // no WebGL at all: a still portrait, the creature at its narrowest

export interface RenderProfile {
  tier: RenderTier;
  /** Clamp for the renderer's device pixel ratio. */
  dpr: [number, number];
  shadows: boolean;
  /** Soft (percentage-closer) shadows cost more and look considerably better. */
  softShadows: boolean;
  antialias: boolean;
  /** Radial segments for curved forms; also gates rounded box corners. */
  segments: number;
  /** Rounded silhouettes read as drawn rather than assembled from blocks. */
  roundedForms: boolean;
  /** A back light that separates the creature from the ground behind it. */
  rimLight: boolean;
  /** Plain-language reason, for logs and for explaining a thin channel. */
  reason: string;
}

const PROFILES: Record<RenderTier, Omit<RenderProfile, 'reason'>> = {
  full: {
    tier: 'full',
    dpr: [1, 2],
    shadows: true,
    softShadows: true,
    antialias: true,
    segments: 32,
    roundedForms: true,
    rimLight: true,
  },
  standard: {
    tier: 'standard',
    dpr: [1, 1.75],
    shadows: true,
    softShadows: false,
    antialias: true,
    segments: 20,
    roundedForms: true,
    rimLight: true,
  },
  reduced: {
    tier: 'reduced',
    dpr: [1, 1.25],
    shadows: false,
    softShadows: false,
    antialias: false,
    segments: 10,
    roundedForms: false,
    rimLight: false,
  },
  avatar: {
    tier: 'avatar',
    dpr: [1, 1],
    shadows: false,
    softShadows: false,
    antialias: false,
    segments: 8,
    roundedForms: false,
    rimLight: false,
  },
};

export function profileFor(tier: RenderTier, reason: string): RenderProfile {
  return { ...PROFILES[tier], reason };
}

interface Probe {
  webgl: 'none' | 'webgl1' | 'webgl2';
  /** A software rasteriser: correct, and far too slow for the full tier. */
  software: boolean;
  cores: number | null;
  memoryGb: number | null;
  saveData: boolean;
  slowNetwork: boolean;
}

/** Everything we can learn about the environment in one synchronous pass. */
export function probeEnvironment(): Probe {
  const probe: Probe = {
    webgl: 'none',
    software: false,
    cores: null,
    memoryGb: null,
    saveData: false,
    slowNetwork: false,
  };

  if (typeof navigator !== 'undefined') {
    const cores = navigator.hardwareConcurrency;
    if (typeof cores === 'number' && cores > 0) probe.cores = cores;

    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof memory === 'number' && memory > 0) probe.memoryGb = memory;

    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (connection) {
      probe.saveData = connection.saveData === true;
      probe.slowNetwork =
        connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
    }
  }

  if (typeof document === 'undefined') return probe;

  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    const gl = gl2 ?? canvas.getContext('webgl');
    if (!gl) return probe;
    probe.webgl = gl2 ? 'webgl2' : 'webgl1';

    // The unmasked renderer string is often withheld for fingerprinting
    // reasons. When it is offered, it is the only reliable way to notice a
    // software rasteriser, which reports healthy limits and then runs at a
    // handful of frames per second.
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? '')
      : String(gl.getParameter(gl.RENDERER) ?? '');
    probe.software = /swiftshader|llvmpipe|software|microsoft basic/i.test(renderer);
  } catch (error) {
    logger.warn('render.tier', 'WebGL probe failed', describeError(error));
  }

  return probe;
}

/**
 * Choose a tier from a probe.
 *
 * Split out from the probe so the decision is pure and testable: the same
 * inputs always give the same tier, with no browser involved.
 */
export function tierFromProbe(probe: Probe): RenderProfile {
  if (probe.webgl === 'none') {
    return profileFor('avatar', 'This browser has no WebGL, so the household is drawn as stills.');
  }

  if (probe.software) {
    return profileFor(
      'reduced',
      'This device is drawing without a graphics processor, so the household is drawn simply to stay responsive.',
    );
  }

  if (probe.saveData || probe.slowNetwork) {
    return profileFor('reduced', 'Data saving is on, so the household is drawn simply.');
  }

  // Either signal alone is weak; together they are a reliable floor. Missing
  // values are not treated as low, because most browsers withhold deviceMemory.
  const fewCores = probe.cores !== null && probe.cores <= 4;
  const littleMemory = probe.memoryGb !== null && probe.memoryGb <= 4;

  if (littleMemory && fewCores) {
    return profileFor('reduced', 'This device has limited memory, so the household is drawn simply.');
  }

  if (probe.webgl === 'webgl1' || fewCores || littleMemory) {
    return profileFor('standard', 'The household is drawn with the usual detail for this device.');
  }

  return profileFor('full', 'This device can draw the household at full detail.');
}

const TIERS: RenderTier[] = ['full', 'standard', 'reduced', 'avatar'];

/**
 * An explicit tier, from `?render=full` or a stored preference.
 *
 * Detection has to be conservative, which means a capable device sometimes
 * gets less than it could have. This is the way to see the other rungs — to
 * check the full tier really is worth the cost, and to check a thin one is
 * still worth meeting.
 */
function requestedTier(): RenderTier | null {
  if (typeof window === 'undefined') return null;

  const fromQuery = new URLSearchParams(window.location.search).get('render');
  if (fromQuery && (TIERS as string[]).includes(fromQuery)) return fromQuery as RenderTier;

  try {
    const stored = window.localStorage.getItem('nagimals.renderTier');
    if (stored && (TIERS as string[]).includes(stored)) return stored as RenderTier;
  } catch {
    // Private browsing and blocked site data both throw here. Detection is a
    // perfectly good answer; an override is only ever a convenience.
  }
  return null;
}

let cached: RenderProfile | null = null;

export function detectRenderProfile(): RenderProfile {
  if (cached) return cached;

  const forced = requestedTier();
  const profile = forced
    ? profileFor(forced, `Render tier pinned to "${forced}".`)
    : tierFromProbe(probeEnvironment());
  cached = profile;
  logger.info('render.tier', `Rendering at the "${profile.tier}" tier`, {
    tier: profile.tier,
    reason: profile.reason,
  });
  return profile;
}

/** Test seam: forget the memoized profile so a new environment can be read. */
export function resetRenderProfileCache(): void {
  cached = null;
}
