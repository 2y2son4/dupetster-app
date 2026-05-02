import { expect, test } from '@playwright/test';
import { resetStorage } from './helpers/storage';
import { STORAGE_KEY } from './helpers/storage';
import { spotifyTrackUrl } from './helpers/form';

test.describe('import normalization', { tag: ['@import', '@normalization', '@file-io'] }, () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
  });

  test('imports JSON and normalizes invalid rows and difficulty', async ({ page }) => {
    await page.goto('/');

    const jsonInput = page.locator('input.import-input[accept="application/json,.json"]');
    const jsonPayload = [
      {
        title: 'Imported Json 1',
        artist: 'Json Artist 1',
        year: 2020,
        spotifyUrl: spotifyTrackUrl,
        difficulty: 'Legendary',
      },
      {
        title: 'Imported Json 2',
        artist: 'Json Artist 2',
        year: 2021,
        spotifyUrl: spotifyTrackUrl,
        difficulty: 'Pro',
      },
      {
        artist: 'Invalid Missing Title',
        year: 2022,
        spotifyUrl: spotifyTrackUrl,
      },
    ];

    await jsonInput.setInputFiles({
      name: 'mixed-import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(jsonPayload), 'utf8'),
    });

    await expect(page.getByText('Imported 2 cards from JSON.')).toBeVisible();
    await expect(page.locator('.grid .card')).toHaveCount(2);

    const storedCards = await page.evaluate((storageKey: string) => {
      return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as Array<{
        title: string;
        difficulty: string;
      }>;
    }, STORAGE_KEY);

    const firstImported = storedCards.find((c) => c.title === 'Imported Json 1');
    const secondImported = storedCards.find((c) => c.title === 'Imported Json 2');
    await expect(firstImported?.difficulty).toBe('Original');
    await expect(secondImported?.difficulty).toBe('Pro');
  });

  test('imports CSV and normalizes invalid rows and difficulty', async ({ page }) => {
    await page.goto('/');

    const csvInput = page.locator('input.import-input[accept="text/csv,.csv"]');
    const csvData = [
      'title,artist,year,spotifyUrl,difficulty',
      `Csv Song 1,Csv Artist 1,2018,${spotifyTrackUrl},Master`,
      `Csv Song 2,Csv Artist 2,2019,${spotifyTrackUrl},Expert`,
      ',Missing Title,2020,https://open.spotify.com/track/abc,Pro',
    ].join('\n');

    await csvInput.setInputFiles({
      name: 'mixed-import.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvData, 'utf8'),
    });

    await expect(page.getByText('Imported 2 cards from CSV.')).toBeVisible();
    await expect(page.locator('.grid .card')).toHaveCount(2);

    const storedCards = await page.evaluate((storageKey: string) => {
      return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as Array<{
        title: string;
        difficulty: string;
      }>;
    }, STORAGE_KEY);

    const firstImported = storedCards.find((c) => c.title === 'Csv Song 1');
    const secondImported = storedCards.find((c) => c.title === 'Csv Song 2');
    await expect(firstImported?.difficulty).toBe('Original');
    await expect(secondImported?.difficulty).toBe('Expert');
  });

  test('skips duplicate URLs when importing JSON and shows skip count', async ({ page }) => {
    await page.goto('/');

    const jsonInput = page.locator('input.import-input[accept="application/json,.json"]');
    const payload = [
      {
        title: 'First Import',
        artist: 'Artist A',
        year: 2020,
        spotifyUrl: spotifyTrackUrl,
        difficulty: 'Original',
      },
    ];

    // First import — 1 new card
    await jsonInput.setInputFiles({
      name: 'first.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(payload), 'utf8'),
    });
    await expect(page.getByText('Imported 1 cards from JSON.')).toBeVisible();
    await expect(page.locator('.grid .card')).toHaveCount(1);

    // Second import with same URL — should be skipped
    await jsonInput.setInputFiles({
      name: 'dupe.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(payload), 'utf8'),
    });
    await expect(page.getByText('No new cards imported (all duplicates).')).toBeVisible();
    await expect(page.locator('.grid .card')).toHaveCount(1);
  });

  test('skips duplicate URLs when importing CSV and shows skip count', async ({ page }) => {
    const secondUrl = 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUIOKE';
    await page.goto('/');

    const csvInput = page.locator('input.import-input[accept="text/csv,.csv"]');
    const csvAll = [
      'title,artist,year,spotifyUrl,difficulty',
      `Existing Song,Artist A,2018,${spotifyTrackUrl},Original`,
      `New Song,Artist B,2019,${secondUrl},Pro`,
    ].join('\n');

    // First import — 2 new cards
    await csvInput.setInputFiles({
      name: 'all.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvAll, 'utf8'),
    });
    await expect(page.getByText('Imported 2 cards from CSV.')).toBeVisible();
    await expect(page.locator('.grid .card')).toHaveCount(2);

    // Second import with 1 duplicate + 1 new card
    const csvMixed = [
      'title,artist,year,spotifyUrl,difficulty',
      `Existing Song,Artist A,2018,${spotifyTrackUrl},Original`,
      `Brand New,Artist C,2021,https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC,Expert`,
    ].join('\n');

    await csvInput.setInputFiles({
      name: 'mixed.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvMixed, 'utf8'),
    });
    await expect(page.getByText('Imported 1 cards from CSV. Skipped 1 duplicate.')).toBeVisible();
    await expect(page.locator('.grid .card')).toHaveCount(3);
  });
});
