import { expect, test } from '@playwright/test';
import { makeCard, resetStorage, seedCards } from './helpers/storage';

test.describe(
  'cards filter, sort and pagination',
  { tag: ['@filtering', '@sorting', '@pagination', '@search'] },
  () => {
    test.beforeEach(async ({ page }) => {
      await resetStorage(page);
    });

    test('filters by search query across title and artist', async ({ page }) => {
      await seedCards(page, [
        makeCard({ id: 1, title: 'Alpha Song', artist: 'Artist One', year: 2010 }),
        makeCard({ id: 2, title: 'Beta Song', artist: 'Zed Artist', year: 2011 }),
        makeCard({ id: 3, title: 'Gamma Track', artist: 'Artist Three', year: 2012 }),
      ]);

      await page.goto('/');

      const searchInput = page.getByPlaceholder('Search title or artist');
      await searchInput.fill('zed');
      await expect(page.locator('.grid .card')).toHaveCount(1);
      await expect(page.locator('.grid .card h3')).toContainText('Zed Artist');
      await expect(page.locator('.grid .card p')).toContainText('Beta Song');

      await searchInput.fill('gamma');
      await expect(page.locator('.grid .card')).toHaveCount(1);
      await expect(page.locator('.grid .card p')).toContainText('Gamma Track');
    });

    test('filters by difficulty and sorts by title/year', async ({ page }) => {
      await seedCards(page, [
        makeCard({ id: 1, title: 'Zulu', artist: 'Artist A', difficulty: 'Original', year: 2015 }),
        makeCard({ id: 2, title: 'Alpha', artist: 'Artist B', difficulty: 'Pro', year: 2003 }),
        makeCard({ id: 3, title: 'Mike', artist: 'Artist C', difficulty: 'Pro', year: 2010 }),
      ]);

      await page.goto('/');

      const toolbar = page.locator('.right .toolbar-controls');
      const difficultyFilter = toolbar.locator('select').nth(0);
      const sortFilter = toolbar.locator('select').nth(1);

      await difficultyFilter.selectOption('Pro');
      await expect(page.locator('.grid .card')).toHaveCount(2);

      await sortFilter.selectOption('title');
      const titleOrdered = await page.locator('.grid .card p').allTextContents();
      await expect(titleOrdered[0]?.trim()).toBe('Alpha');
      await expect(titleOrdered[1]?.trim()).toBe('Mike');

      await sortFilter.selectOption('year');
      const yearOrdered = await page.locator('.grid .card .year').allTextContents();
      await expect(yearOrdered[0]?.trim()).toBe('2003');
      await expect(yearOrdered[1]?.trim()).toBe('2010');
    });

    test('supports pagination and page navigation', async ({ page }) => {
      const cards = Array.from({ length: 24 }, (_, idx) =>
        makeCard({ id: idx + 1, title: `Paged Song ${idx + 1}`, year: 2000 + idx }),
      );
      await seedCards(page, cards);

      await page.goto('/');

      await expect(page.getByText('Page 1 / 2')).toBeVisible();
      await expect(page.locator('.grid .card')).toHaveCount(18);

      await page.getByRole('button', { name: 'Next' }).click();
      await expect(page.getByText('Page 2 / 2')).toBeVisible();
      await expect(page.locator('.grid .card')).toHaveCount(6);

      await page.getByRole('button', { name: 'Previous' }).click();
      await expect(page.getByText('Page 1 / 2')).toBeVisible();
      await expect(page.locator('.grid .card')).toHaveCount(18);
    });

    test('selects and unselects all filtered cards', async ({ page }) => {
      await seedCards(page, [
        makeCard({ id: 1, title: 'Alpha One' }),
        makeCard({ id: 2, title: 'Alpha Two' }),
        makeCard({ id: 3, title: 'Beta One' }),
      ]);

      await page.goto('/');

      await page.getByPlaceholder('Search title or artist').fill('Alpha');
      await expect(page.locator('.grid .card')).toHaveCount(2);

      await page.getByRole('button', { name: 'Select All Filtered' }).click();
      await expect(page.locator('.grid .card.selected')).toHaveCount(2);

      await page.getByRole('button', { name: 'Unselect All Filtered' }).click();
      await expect(page.locator('.grid .card.selected')).toHaveCount(0);
    });
  },
);
