/**
 * AR capability detection.
 *
 * The rule is simple: never show a nonfunctional AR control. We resolve the
 * best available pathway once, up front, and the viewer renders accordingly.
 */

import { describeError, logger } from '../lib/logger';

export type ArPathway =
  | 'webxr'        // immersive-ar with hit testing
  | 'model-viewer' // iOS Quick Look / Scene Viewer through <model-viewer>
  | 'orbit'        // interactive 3D with orbit controls
  | 'card';        // no WebGL at all: a polished 2D state card

export interface ArCapability {
  pathway: ArPathway;
  webxrSupported: boolean;
  hitTestSupported: boolean;
  webglSupported: boolean;
  isIos: boolean;
  secureContext: boolean;
  /** Plain-language explanation shown next to the placement control. */
  explanation: string;
}

interface XrSystemLike {
  isSessionSupported?: (mode: string) => Promise<boolean>;
}

function detectWebgl(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      canvas.getContext('webgl2') ??
        canvas.getContext('webgl') ??
        canvas.getContext('experimental-webgl'),
    );
  } catch {
    return false;
  }
}

export function detectIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOsUa = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as a Mac; the touch point count gives it away.
  const iPadOs = /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  return iOsUa || iPadOs;
}

export async function detectArCapability(): Promise<ArCapability> {
  const webglSupported = detectWebgl();
  const isIos = detectIos();
  const secureContext =
    typeof window !== 'undefined' ? window.isSecureContext !== false : false;

  let webxrSupported = false;
  let hitTestSupported = false;

  const xr = (navigator as Navigator & { xr?: XrSystemLike }).xr;
  if (xr?.isSessionSupported) {
    try {
      webxrSupported = await xr.isSessionSupported('immersive-ar');
      // Every browser that ships immersive-ar also ships the hit-test module;
      // there is no separate feature query, so we confirm at session request.
      hitTestSupported = webxrSupported;
    } catch (error) {
      logger.warn('ar.capability', 'immersive-ar support query failed', describeError(error));
    }
  }

  let pathway: ArPathway;
  let explanation: string;

  if (!webglSupported) {
    pathway = 'card';
    explanation =
      'This browser has no WebGL, so the household is shown as a state card. Every action is still available.';
  } else if (webxrSupported && secureContext) {
    pathway = 'webxr';
    explanation =
      'This device supports immersive AR. Point the camera at a floor or table and tap to place a household member.';
  } else if (isIos) {
    pathway = 'model-viewer';
    explanation =
      'iOS does not support WebXR in the browser. You get an interactive 3D view here, and Quick Look AR when a .usdz model is present.';
  } else {
    pathway = 'orbit';
    explanation = secureContext
      ? 'This browser does not support immersive AR, so the household is shown in an interactive 3D view you can rotate and zoom.'
      : 'AR needs a secure (HTTPS) origin. On this connection the household is shown in an interactive 3D view instead.';
  }

  const capability: ArCapability = {
    pathway,
    webxrSupported,
    hitTestSupported,
    webglSupported,
    isIos,
    secureContext,
    explanation,
  };

  logger.info('ar.capability', `Resolved the AR pathway to "${pathway}"`, {
    pathway,
    webxrSupported,
    webglSupported,
    isIos,
    secureContext,
  });

  return capability;
}
