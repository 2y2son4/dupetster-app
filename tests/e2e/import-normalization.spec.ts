import { expect, test } from '@playwright/test';
import { resetStorage } from './helpers/storage';
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

    const storedCards = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('dupetster_cards_v2') ?? '[]') as Array<{
        title: string;
        difficulty: string;
      }>;
    });

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

    const storedCards = await page.evaluate(() => {
      return JSON.parse(localStorage.getItem('dupetster_cards_v2') ?? '[]') as Array<{
        title: string;
        difficulty: string;
      }>;
    });

    const firstImported = storedCards.find((c) => c.title === 'Csv Song 1');
    const secondImported = storedCards.find((c) => c.title === 'Csv Song 2');
    await expect(firstImported?.difficulty).toBe('Original');
    await expect(secondImported?.difficulty).toBe('Expert');
  });
});
