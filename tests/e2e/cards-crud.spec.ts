import { expect, test } from '@playwright/test';
import { makeCard, resetStorage, seedCards } from './helpers/storage';

test.describe('cards crud', { tag: ['@card-management', '@CRUD', '@actions'] }, () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
  });

  test('edits an existing card', async ({ page }) => {
    await seedCards(page, [
      makeCard({ id: 1, title: 'Seed Song 1', artist: 'Seed Artist 1', year: 2001 }),
      makeCard({ id: 2, title: 'Seed Song 2', artist: 'Seed Artist 2', year: 2002 }),
    ]);

    await page.goto('/');

    const firstCard = page.locator('.grid .card').first();
    await firstCard.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Artist *').fill('Edited Artist');
    await page
      .getByLabel('Spotify URL *')
      .fill('https://open.spotify.com/track/2TpxZ7JUBn3uw46aR7qd6V');
    await page.getByRole('button', { name: 'Update Card' }).click();

    await expect(
      page.locator('.grid .card', { hasText: 'Seed Song 2' }).locator('p'),
    ).toContainText('Edited Artist', { timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Dismiss Loader' })).not.toBeVisible({
      timeout: 5000,
    });
  });

  test('duplicates a card and deletes with confirmation modal', async ({ page }) => {
    await seedCards(page, [
      makeCard({ id: 1, title: 'Seed Song 1', artist: 'Seed Artist 1', year: 2001 }),
      makeCard({ id: 2, title: 'Seed Song 2', artist: 'Seed Artist 2', year: 2002 }),
    ]);

    await page.goto('/');

    const songOneCard = page.locator('.grid .card', { hasText: 'Seed Song 1' }).first();
    await songOneCard.getByRole('button', { name: 'Duplicate' }).click();
    await expect(page.locator('.grid .card')).toHaveCount(3);

    const deleteTarget = page.locator('.grid .card', { hasText: 'Seed Song 2' }).first();
    await deleteTarget.getByRole('button', { name: 'Delete' }).click();

    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('.grid .card', { hasText: 'Seed Song 2' })).toHaveCount(1);

    await deleteTarget.getByRole('button', { name: 'Delete' }).click();
    await modal.getByRole('button', { name: 'Delete' }).click();

    await expect(page.locator('.grid .card', { hasText: 'Seed Song 2' })).toHaveCount(0);
  });

  test('deletes selected cards using global delete button', async ({ page }) => {
    await seedCards(page, [
      makeCard({ id: 1, title: 'Seed Song 1', artist: 'Seed Artist 1', year: 2001 }),
      makeCard({ id: 2, title: 'Seed Song 2', artist: 'Seed Artist 2', year: 2002 }),
    ]);

    await page.goto('/');

    await page.locator('.grid .card', { hasText: 'Seed Song 1' }).first().click();
    await page.getByRole('button', { name: 'Delete Selected' }).click();

    await expect(page.locator('.grid .card', { hasText: 'Seed Song 1' })).toHaveCount(0);
    await expect(page.locator('.grid .card', { hasText: 'Seed Song 2' })).toHaveCount(1);
  });
});
