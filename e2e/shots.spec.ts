import { test } from '@playwright/test';

test('capture the principal screens', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Visit the Shelter' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/shots/2-shelter.png', fullPage: true });

  await page.goto('/');
  await page.getByRole('button', { name: 'Open Demo Household' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Place my Nagimals' }).click();
  await page.waitForTimeout(3000);
  await page.locator('.viewer').screenshot({ path: '/tmp/shots/5a-viewer-calm.png' });

  await page.goto('/#/household');
  await page.evaluate(() =>
    localStorage.setItem('nagimals.timeOffsetMs', String(10 * 24 * 60 * 60 * 1000)),
  );
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Place my Nagimals' }).click();
  await page.waitForTimeout(3000);
  await page.locator('.viewer').screenshot({ path: '/tmp/shots/5b-viewer-escalated.png' });
});
