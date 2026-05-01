import { expect, test } from '@playwright/test';
import { makeCard, resetStorage, seedCards } from './helpers/storage';

test.beforeEach(async ({ page }) => {
  await resetStorage(page);
});

test('shows an error toast when exporting PDF without selection', async ({ page }) => {
  await seedCards(page, [makeCard({ id: 1, title: 'Seed Song 1' })]);
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Export PDF' })).toBeDisabled();
});

test('exports JSON and CSV files', async ({ page }) => {
  await seedCards(page, [makeCard({ id: 1, title: 'Seed Song 1' })]);
  await page.goto('/');

  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  await expect((await jsonDownload).suggestedFilename()).toBe('music-cards.json');

  const dismissLoader = page.getByRole('button', { name: 'Dismiss Loader' });
  if (await dismissLoader.isVisible().catch(() => false)) {
    await dismissLoader.click();
  }

  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await expect((await csvDownload).suggestedFilename()).toBe('music-cards.csv');
});

test('starts JSON and CSV import flows from fixture files', async ({ page }) => {
  await page.goto('/');
  const dismissLoader = page.getByRole('button', { name: 'Dismiss Loader' });

  await page
    .locator('label.file-btn:has-text("Import JSON") input[type="file"]')
    .setInputFiles('tests/e2e/fixtures/import-cards.json');
  await expect(dismissLoader).toBeVisible();
  await dismissLoader.click();

  await page
    .locator('label.file-btn:has-text("Import CSV") input[type="file"]')
    .setInputFiles('tests/e2e/fixtures/import-cards.csv');
  await expect(dismissLoader).toBeVisible();
  await dismissLoader.click();

  await expect(page.getByRole('heading', { name: 'Dupetster' })).toBeVisible();
});
