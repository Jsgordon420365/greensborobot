/**
 * AR pathway selection.
 *
 * The product rule is "never show a nonfunctional AR control", so these tests
 * pin the exact conditions under which each of the four pathways is chosen.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectArCapability, detectIos } from '../services/arCapability';
import { pickClipName } from '../components/ar/models/GlbModel';

const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Mobile Safari/537.36';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const DESKTOP =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36';

interface Scenario {
  userAgent?: string;
  webgl?: boolean;
  xr?: boolean | 'throws';
  secure?: boolean;
  maxTouchPoints?: number;
}

function setUp(scenario: Scenario) {
  const {
    userAgent = DESKTOP,
    webgl = true,
    xr = false,
    secure = true,
    maxTouchPoints = 0,
  } = scenario;

  // jsdom does not define every one of these, so define rather than spy.
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: userAgent });
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: maxTouchPoints });
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: secure });

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => (webgl ? ({} as RenderingContext) : null),
  );

  if (xr === false) {
    Reflect.deleteProperty(navigator, 'xr');
  } else {
    Object.defineProperty(navigator, 'xr', {
      configurable: true,
      value: {
        isSessionSupported: vi.fn(async (mode: string) => {
          if (xr === 'throws') throw new Error('nope');
          return mode === 'immersive-ar';
        }),
      },
    });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of ['xr', 'userAgent', 'maxTouchPoints'] as const) {
    Reflect.deleteProperty(navigator, key);
  }
  Reflect.deleteProperty(window, 'isSecureContext');
});

describe('AR pathway selection', () => {
  it('chooses WebXR on a supported Android device over HTTPS', async () => {
    setUp({ userAgent: ANDROID, xr: true });
    const capability = await detectArCapability();
    expect(capability.pathway).toBe('webxr');
    expect(capability.webxrSupported).toBe(true);
    expect(capability.explanation).toMatch(/tap to place/i);
  });

  it('falls back to model-viewer on iOS, which has no WebXR', async () => {
    setUp({ userAgent: IPHONE, xr: false });
    const capability = await detectArCapability();
    expect(capability.pathway).toBe('model-viewer');
    expect(capability.isIos).toBe(true);
    expect(capability.explanation).toMatch(/Quick Look/);
  });

  it('recognises an iPad reporting a desktop user agent', async () => {
    setUp({ userAgent: IPAD_DESKTOP_UA, maxTouchPoints: 5 });
    expect(detectIos()).toBe(true);
    const capability = await detectArCapability();
    expect(capability.pathway).toBe('model-viewer');
  });

  it('falls back to an orbit viewer on a desktop browser', async () => {
    setUp({ userAgent: DESKTOP, xr: false });
    const capability = await detectArCapability();
    expect(capability.pathway).toBe('orbit');
    expect(capability.explanation).toMatch(/rotate and zoom/);
  });

  it('falls back to a state card when WebGL is unavailable', async () => {
    setUp({ webgl: false, xr: true });
    const capability = await detectArCapability();
    expect(capability.pathway).toBe('card');
    expect(capability.explanation).toMatch(/Every action is still available/);
  });

  it('does not offer AR on an insecure origin, and says why', async () => {
    setUp({ userAgent: ANDROID, xr: true, secure: false });
    const capability = await detectArCapability();
    expect(capability.pathway).not.toBe('webxr');
    expect(capability.explanation).toMatch(/secure \(HTTPS\) origin/);
  });

  it('degrades rather than throwing when the support query fails', async () => {
    setUp({ userAgent: ANDROID, xr: 'throws' });
    const capability = await detectArCapability();
    expect(capability.pathway).toBe('orbit');
    expect(capability.webxrSupported).toBe(false);
  });
});

describe('GLB animation lookup', () => {
  it('prefers an exact clip name', () => {
    expect(pickClipName(['idle', 'dog_bark', 'walk'], 'dog_bark')).toBe('dog_bark');
  });

  it('falls back to a fuzzy match on any meaningful word', () => {
    expect(pickClipName(['Armature|Bark', 'Armature|Idle'], 'dog_bark')).toBe('Armature|Bark');
  });

  it('falls back to the first clip rather than playing nothing', () => {
    expect(pickClipName(['Armature|Something'], 'dog_bark')).toBe('Armature|Something');
  });

  it('returns null for a model with no clips at all, instead of throwing', () => {
    expect(pickClipName([], 'dog_bark')).toBeNull();
  });

  it('ignores short words so "a" or "of" cannot match everything', () => {
    // 'dog' is meaningful, 'a' is not; only the former may drive a match.
    expect(pickClipName(['Cat_Loaf'], 'a_dog')).toBe('Cat_Loaf');
  });
});
