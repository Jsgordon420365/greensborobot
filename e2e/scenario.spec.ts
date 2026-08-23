/**
 * "The Fern, the Cat and the Deadline", driven through a real browser against
 * the production build.
 *
 * This is the acceptance scenario an evaluator would perform by hand, in the
 * order the specification lists it.
 */

import { expect, test, type Page } from '@playwright/test';

const CARD = (name: string) => ({ role: 'article' as const, name });

/** Open the app and take the one-click route into the demo household. */
async function openDemoHousehold(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Demo Household' }).click();
  await expect(page.getByRole('heading', { name: 'The Household' })).toBeVisible();
}

async function simulate(page: Page, preset: string) {
  const panel = page.getByText('Proof-of-Concept Time Controls');
  const details = page.locator('details.time-panel');
  if (!(await details.evaluate((el: HTMLDetailsElement) => el.open))) {
    await panel.click();
  }
  await page.getByRole('button', { name: preset, exact: true }).click();
}

test.describe('The Fern, the Cat and the Deadline', () => {
  test('step 1: the household opens with all three calm', async ({ page }) => {
    await openDemoHousehold(page);

    for (const name of ['Bear', 'Juniper', 'Frondly']) {
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByLabel('Stage 0 of 4: Calm')).toHaveCount(3);
  });

  test('steps 2-6: the fern wilts and the cat intervenes', async ({ page }) => {
    await openDemoHousehold(page);

    // The fern starts six days stale against a seven-day interval.
    await simulate(page, 'Three days later');
    const fern = page.getByRole(CARD('Frondly').role, { name: CARD('Frondly').name });
    await expect(fern).toHaveAttribute('data-state', /dulling|drooping/);

    // Ten days on it is wilted and Juniper has taken it personally.
    await simulate(page, 'Reset simulation');
    await page.evaluate(() => {
      localStorage.setItem('nagimals.timeOffsetMs', String(10 * 24 * 60 * 60 * 1000));
    });
    await page.reload();

    await expect(page.getByText(/Simulated time is active/)).toBeVisible();
    await expect(fern).toHaveAttribute('data-state', 'wilted');

    const cat = page.getByRole(CARD('Juniper').role, { name: CARD('Juniper').name });
    await expect(cat).toHaveAttribute('data-state', 'intervening_for_plant');
    await expect(cat.getByText(/Acting on behalf of/)).toBeVisible();

    // Step 6: the reason must be readable and deterministic.
    await cat.getByRole('button', { name: /Why is Juniper like this/ }).click();
    await expect(
      cat.getByText(/Juniper is intervening because Frondly reached stage 3/),
    ).toBeVisible();
  });

  test('steps 7-11: Bear escalates to a bark and a notification is previewable', async ({ page }) => {
    await openDemoHousehold(page);
    const bear = page.getByRole(CARD('Bear').role, { name: CARD('Bear').name });

    await simulate(page, 'One hour before deadline');
    await expect(bear).toHaveAttribute('data-state', /nudging|whining/);

    await simulate(page, 'Fifteen minutes before deadline');
    await expect(bear).toHaveAttribute('data-state', 'barking');
    await expect(bear.getByLabel('Stage 4 of 4: Urgent')).toBeVisible();
    await expect(bear.getByText(/Sound: An urgent bark/)).toBeVisible();

    // Step 11: what would be delivered, without ever demanding permission.
    await page.getByRole('button', { name: 'Notifications' }).click();
    await expect(page.getByText('Bear needs you now')).toBeVisible();
    await expect(page.getByText(/deadline is/)).toBeVisible();
  });

  test('steps 12-13: completing settles Bear and earns a keepsake', async ({ page }) => {
    await openDemoHousehold(page);
    await simulate(page, 'Fifteen minutes before deadline');

    const bear = page.getByRole(CARD('Bear').role, { name: CARD('Bear').name });
    await expect(bear.getByLabel('Stage 4 of 4: Urgent')).toBeVisible();

    await bear.getByRole('button', { name: 'Complete' }).click();

    await expect(bear.getByLabel('Stage 0 of 4: Calm')).toBeVisible();
    await expect(bear.getByText('Gold star pin')).toBeVisible();
    // Bear is still a dog. Nothing evolved into anything.
    await expect(bear.getByText('deadline guardian', { exact: false })).toBeVisible();
  });

  test('steps 14-15: attending the fern starts its recovery', async ({ page }) => {
    await openDemoHousehold(page);
    await page.evaluate(() => {
      localStorage.setItem('nagimals.timeOffsetMs', String(10 * 24 * 60 * 60 * 1000));
    });
    await page.reload();

    const fern = page.getByRole(CARD('Frondly').role, { name: CARD('Frondly').name });
    const cat = page.getByRole(CARD('Juniper').role, { name: CARD('Juniper').name });
    await expect(cat).toHaveAttribute('data-state', 'intervening_for_plant');

    await fern.getByRole('button', { name: 'Mark attended' }).click();

    await expect(fern).toHaveAttribute('data-state', 'healthy');
    await expect(fern.getByLabel('Stage 0 of 4: Calm')).toBeVisible();
    await expect(cat).not.toHaveAttribute('data-state', 'intervening_for_plant');
  });

  test('steps 16-17: everything meaningful survives a reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Visit the Shelter' }).click();

    // Adopt a specific dog with a specific name, so persistence is provable.
    await page.getByRole('heading', { name: 'Pepper' }).click();
    const nameField = page.getByLabel('Name');
    await nameField.fill('Marmalade');
    await page.getByRole('button', { name: /Bring Marmalade home/ }).click();

    await expect(page.getByRole('heading', { name: 'Marmalade' })).toBeVisible();

    // Snooze something, which is state the reload must also preserve.
    const dog = page.getByRole(CARD('Marmalade').role, { name: CARD('Marmalade').name });
    await dog.getByRole('button', { name: 'Snooze' }).click();
    await dog.getByRole('button', { name: 'Commit to that time' }).click();
    await expect(dog.getByText(/Snoozed/)).toBeVisible();

    await simulate(page, 'One day later');

    // A full reload: new document, new JavaScript context, storage only.
    await page.reload();

    await expect(page.getByRole('heading', { name: 'Marmalade' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Juniper' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Frondly' })).toBeVisible();
    await expect(page.getByText(/Simulated time is active/)).toBeVisible();
    await expect(
      page.getByRole(CARD('Marmalade').role, { name: CARD('Marmalade').name }).getByText('1 time'),
    ).toBeVisible();
  });
});
