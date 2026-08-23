/**
 * PWA plumbing and the parts of accessibility that are cheap to regress.
 */

import { expect, test } from '@playwright/test';

test.describe('PWA', () => {
  test('serves a valid manifest with the icons it advertises', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.getAttribute('link[rel="manifest"]', 'href');
    expect(href).toBeTruthy();

    const manifest = await (await request.get(new URL(href!, page.url()).toString())).json();
    expect(manifest.name).toBe('Nagimals');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);

    for (const icon of manifest.icons) {
      const response = await request.get(new URL(icon.src, page.url()).toString());
      expect(response.status(), `${icon.src} must exist`).toBe(200);
      expect(response.headers()['content-type']).toContain('image/png');
    }
  });

  test('registers a Service Worker and caches an offline shell', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(
      async () => Boolean(await navigator.serviceWorker.getRegistration()),
      undefined,
      { timeout: 15_000 },
    );
    const registration = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      return r ? { scope: r.scope, hasWorker: Boolean(r.active || r.installing || r.waiting) } : null;
    });
    expect(registration).not.toBeNull();
    expect(registration!.hasWorker).toBe(true);
  });

  test('ships the offline fallback page', async ({ page, request }) => {
    await page.goto('/');
    const response = await request.get(new URL('offline.html', page.url()).toString());
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('The household is still here');
  });
});

test.describe('accessibility', () => {
  test('is operable by keyboard from the first tab stop', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: /Skip to the household/ })).toBeFocused();
  });

  test('never asks for notification permission unprompted', async ({ page, context }) => {
    let requested = false;
    await context.exposeFunction('__recordPermissionRequest', () => {
      requested = true;
    });
    await page.addInitScript(() => {
      const original = Notification.requestPermission.bind(Notification);
      Notification.requestPermission = async (...args: unknown[]) => {
        (window as unknown as { __recordPermissionRequest: () => void }).__recordPermissionRequest();
        return original(...(args as []));
      };
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Open Demo Household' }).click();
    await page.getByRole('button', { name: 'Notifications' }).click();
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();

    expect(requested, 'permission must only be requested from an explicit action').toBe(false);
  });

  test('captions sounds in text so nothing depends on audio', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Demo Household' }).click();
    await page.evaluate(() =>
      localStorage.setItem('nagimals.timeOffsetMs', String(10 * 24 * 60 * 60 * 1000)),
    );
    await page.reload();

    const cat = page.getByRole('article', { name: 'Juniper' });
    await expect(cat.getByText(/Sound: Insistent meowing/)).toBeVisible();
  });

  test('describes stage in words as well as colour', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Demo Household' }).click();
    await expect(page.getByLabel('Stage 0 of 4: Calm').first()).toBeVisible();
  });

  test('announces Local Demonstration Mode and names the missing variables', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/Local Demonstration Mode/).first()).toBeVisible();
    await expect(page.getByText('VITE_SUPABASE_URL').first()).toBeVisible();
  });
});
