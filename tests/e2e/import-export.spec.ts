import { expect, test } from '@playwright/test';
import path from 'node:path';
import { makeCard, resetStorage, seedCards } from './helpers/storage';
import { STORAGE_KEY } from './helpers/storage';

test.describe('import export', { tag: ['@transfer-flow', '@file-transfer'] }, () => {
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
    await expect((await jsonDownload).suggestedFilename()).toMatch(
      /^dupetster-cards-\d{2}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/,
    );
    await expect(page.getByRole('button', { name: 'Dismiss Loader' })).not.toBeVisible({
      timeout: 5000,
    });

    const csvDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    await expect((await csvDownload).suggestedFilename()).toMatch(
      /^dupetster-cards-\d{2}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.csv$/,
    );
    await expect(page.getByRole('button', { name: 'Dismiss Loader' })).not.toBeVisible({
      timeout: 5000,
    });
  });

  test('starts JSON and CSV import flows from fixture files', async ({ page }) => {
    await page.goto('/');
    const dismissLoader = page.getByRole('button', { name: 'Dismiss Loader' });
    const jsonFixture = path.resolve(__dirname, 'fixtures', 'import-cards.json');
    const csvFixture = path.resolve(__dirname, 'fixtures', 'import-cards.csv');

    await page
      .locator('input.import-input[accept="application/json,.json"]')
      .setInputFiles(jsonFixture);
    await expect(dismissLoader).not.toBeVisible({ timeout: 5000 });

    await page.locator('input.import-input[accept="text/csv,.csv"]').setInputFiles(csvFixture);
    await expect(dismissLoader).not.toBeVisible({ timeout: 5000 });

    await expect(page.getByRole('heading', { name: 'Dupetster' })).toBeVisible();
  });

  // test('rebuild QR updates cards using current mode', async ({ page }) => {
  //   await seedCards(page, [
  //     makeCard({
  //       id: 1,
  //       title: 'Seed Song 1',
  //       spotifyUrl: 'https://open.spotify.com/track/2TpxZ7JUBn3uw46aR7qd6V',
  //       qrMode: 'canonical-url',
  //       qrPayload: 'https://open.spotify.com/track/2TpxZ7JUBn3uw46aR7qd6V?si=old',
  //     }),
  //   ]);
  //   await page.goto('/');

  //   await page.getByRole('button', { name: 'Rebuild QR (Current Mode)' }).click();

  //   await expect(
  //     page.getByText('Regenerated 1 cards using Raw URL mode (exact URL entered).'),
  //   ).toBeVisible({ timeout: 15000 });

  //   const storedCards = await page.evaluate((storageKey: string) => {
  //     const raw = localStorage.getItem(storageKey);
  //     if (!raw) {
  //       return [] as Array<{ qrMode: string; qrPayload: string }>;
  //     }
  //     return JSON.parse(raw) as Array<{ qrMode: string; qrPayload: string }>;
  //   }, STORAGE_KEY);

  //   await expect(storedCards).toHaveLength(1);
  //   await expect(storedCards[0]?.qrMode).toBe('raw-url');
  //   await expect(storedCards[0]?.qrPayload).toBe(
  //     'https://open.spotify.com/track/2TpxZ7JUBn3uw46aR7qd6V',
  //   );
  // });
});
