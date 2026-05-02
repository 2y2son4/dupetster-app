import { expect, test } from '@playwright/test';
import { makeCard, resetStorage, seedCards } from './helpers/storage';

test.beforeEach(async ({ page }) => {
  await resetStorage(page);
});

test('shows empty state on first load', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Dupetster' })).toBeVisible();
  await expect(page.getByText('No cards yet')).toBeVisible();
});

test('creates a card and shows success toast', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Song title *').fill('Playwright Song');
  await page.getByLabel('Artist *').fill('Playwright Artist');
  await page.getByLabel('Release year *').fill('2020');
  await page
    .getByLabel('Spotify URL *')
    .fill('https://open.spotify.com/track/2TpxZ7JUBn3uw46aR7qd6V');
  await page.getByRole('button', { name: 'Add Card' }).click();

  await expect(page.locator('.grid .card')).toHaveCount(1, { timeout: 30000 });
  await expect(page.locator('.grid .card h3')).toContainText('Playwright Song');
  await expect(page.getByRole('button', { name: 'Dismiss Loader' })).not.toBeVisible({
    timeout: 5000,
  });
});

test('restores cards from localStorage after reload', async ({ page }) => {
  const cards = [
    makeCard({ id: 1, title: 'Persisted Song', artist: 'Persisted Artist', year: 1999 }),
  ];
  await seedCards(page, cards);

  await page.goto('/');
  await expect(page.locator('.grid .card h3')).toContainText('Persisted Song');

  await page.reload();
  await expect(page.locator('.grid .card h3')).toContainText('Persisted Song');
});
