import { expect, test } from '@playwright/test';
import { makeCard, resetStorage, seedCards } from './helpers/storage';

test.describe('PDF export', { tag: ['@pdf-export', '@file-io'] }, () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
  });

  test('exports PDF when cards are selected', async ({ page }) => {
    await seedCards(page, [makeCard({ id: 1, title: 'Pdf Song' })]);
    await page.goto('/');

    const firstCard = page.locator('.grid .card').first();
    await firstCard.click();
    await expect(firstCard).toHaveClass(/selected/);

    const exportPdfButton = page.getByRole('button', { name: 'Export PDF' });
    await expect(exportPdfButton).toBeEnabled();

    await exportPdfButton.click();

    await expect(page.getByText('Select at least one card for PDF export.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Dismiss Loader' })).not.toBeVisible({
      timeout: 5000,
    });
    await expect(exportPdfButton).toBeEnabled();
    await expect(page.locator('.grid .card')).toHaveCount(1);
  });
});
