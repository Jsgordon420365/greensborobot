/**
 * A minimal WebXR stub.
 *
 * Real AR needs a headset or an ARCore phone, neither of which exists in CI.
 * This provides just enough of the API surface for the app to believe
 * immersive-ar is available, so the browser tests can assert that the *right
 * control appears* — the part of AR support that regresses silently. It does
 * not pretend to test real surface detection.
 */

import type { Page } from '@playwright/test';

export async function mockImmersiveArSupport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const listeners = new Map<string, Set<() => void>>();

    const fakeSession = {
      addEventListener: (type: string, fn: () => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
      requestReferenceSpace: async () => ({}),
      requestHitTestSource: async () => ({ cancel: () => undefined }),
      updateRenderState: () => undefined,
      end: async () => {
        for (const fn of listeners.get('end') ?? []) fn();
      },
    };

    Object.defineProperty(navigator, 'xr', {
      configurable: true,
      value: {
        isSessionSupported: async (mode: string) => mode === 'immersive-ar',
        requestSession: async () => fakeSession,
      },
    });

    (window as unknown as { __xrMocked: boolean }).__xrMocked = true;
  });
}

/** Force the "no immersive AR" path, for the fallback tests. */
export async function mockNoArSupport(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Reflect.deleteProperty(navigator, 'xr');
  });
}
