/**
 * AR pathway selection and the accessibility guarantee that goes with it.
 *
 * The rule under test is "never show a nonfunctional AR control": the
 * placement button must appear only where immersive AR would actually work.
 */

import { expect, test } from '@playwright/test';
import { mockImmersiveArSupport, mockNoArSupport } from './fixtures/mockWebXR';

async function enterAr(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Demo Household' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Place my Nagimals' }).click();
  await expect(page.getByRole('heading', { name: 'Place my Nagimals' })).toBeVisible();
}

/**
 * The nav tab and the placement button read almost identically, and role-name
 * matching is case-insensitive, so assertions about the *control* are scoped
 * to the main region rather than the whole page.
 */
const inMain = (page: import('@playwright/test').Page) => page.getByRole('main');

test.describe('AR pathways', () => {
  test('offers placement when immersive AR is supported', async ({ page }) => {
    await mockImmersiveArSupport(page);
    await enterAr(page);

    await expect(inMain(page).getByRole('button', { name: 'Place My Nagimals' })).toBeVisible();
    await expect(page.getByText(/Point the camera at a floor or table/)).toBeVisible();
  });

  test('hides the placement control and explains itself when AR is unavailable', async ({ page }) => {
    await mockNoArSupport(page);
    await enterAr(page);

    await expect(inMain(page).getByRole('button', { name: 'Place My Nagimals' })).toHaveCount(0);
    await expect(page.getByText(/interactive 3D view/)).toBeVisible();
    // The interactive fallback must still be a real canvas, not a dead box.
    await expect(page.locator('.viewer canvas')).toBeVisible();
  });

  test('states the camera privacy position wherever AR is offered', async ({ page }) => {
    await mockImmersiveArSupport(page);
    await enterAr(page);

    await expect(page.getByText(/Camera frames stay on this device/)).toBeVisible();
    await expect(page.getByText(/never reads, records, uploads or stores/)).toBeVisible();
    await expect(page.getByText(/does not map or remember your room/)).toBeVisible();
  });

  test('lets the viewer switch between all three household members', async ({ page }) => {
    await mockNoArSupport(page);
    await enterAr(page);

    const group = page.getByRole('group', { name: /Choose which household member/ });
    for (const name of ['Bear', 'Juniper', 'Frondly']) {
      await expect(group.getByRole('button', { name: new RegExp(name) })).toBeVisible();
    }

    await group.getByRole('button', { name: /Frondly/ }).click();
    await expect(page.getByText(/Frondly: healthy/)).toBeVisible();
  });
});

test.describe('every action is reachable without a camera', () => {
  test('the dashboard offers the full action set', async ({ page }) => {
    await mockNoArSupport(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Demo Household' }).click();

    const bear = page.getByRole('article', { name: 'Bear' });
    await expect(bear.getByRole('button', { name: 'Mark attended' })).toBeVisible();
    await expect(bear.getByRole('button', { name: 'Complete' })).toBeVisible();
    await expect(bear.getByRole('button', { name: 'Snooze' })).toBeVisible();
    await expect(bear.getByRole('button', { name: 'Edit' })).toBeVisible();
  });
});
