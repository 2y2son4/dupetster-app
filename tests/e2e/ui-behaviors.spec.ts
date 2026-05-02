import { expect, test } from '@playwright/test';
import { makeCard, resetStorage, seedCards } from './helpers/storage';
import { fillRequiredCardForm } from './helpers/form';

test.describe('UI behaviors', { tag: ['@ui-behaviors', '@preview', '@regression'] }, () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
  });

  test('toggles reveal year for preview and cards list', async ({ page }) => {
    await seedCards(page, [makeCard({ id: 1, title: 'Reveal Song', year: 1998 })]);
    await page.goto('/');

    await fillRequiredCardForm(page, {
      title: 'Preview Song',
      artist: 'Preview Artist',
      year: '2005',
    });

    await expect(page.locator('.preview-year')).toContainText('2005');
    await expect(page.locator('.grid .card .year').first()).toContainText('1998');

    await page.getByLabel('Reveal year').uncheck();

    await expect(page.locator('.preview-year')).toContainText('YEAR');
    await expect(page.locator('.grid .card .year').first()).toContainText('YEAR');
  });

  test('dismisses toast notifications from close button', async ({ page }) => {
    await page.goto('/');

    await fillRequiredCardForm(page, { title: 'Toast Song' });
    await page.getByRole('button', { name: 'Add Card' }).click();

    const addedToast = page.locator('.toast', { hasText: 'Card added.' });
    await expect(addedToast).toBeVisible();

    await addedToast.getByRole('button', { name: 'Dismiss notification' }).click();
    await expect(addedToast).toHaveCount(0);
  });

  test('keeps unsupported QR mode options disabled in the form', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#qrMode option[value="canonical-url"]')).toBeDisabled();
    await expect(page.locator('#qrMode option[value="spotify-uri"]')).toBeDisabled();
    await expect(page.locator('#qrMode option[value="raw-url"]')).toBeEnabled();
  });

  test('resets edit mode if edited card is deleted via delete selected', async ({ page }) => {
    await seedCards(page, [
      makeCard({ id: 1, title: 'Edit Me', artist: 'Artist 1', year: 2001 }),
      makeCard({ id: 2, title: 'Keep Me', artist: 'Artist 2', year: 2002 }),
    ]);
    await page.goto('/');

    const targetCard = page.locator('.grid .card', { hasText: 'Edit Me' }).first();
    await targetCard.getByRole('button', { name: 'Edit' }).click();

    await expect(page.getByRole('heading', { name: 'Edit Card' })).toBeVisible();
    await expect(page.getByLabel('Song title *')).toHaveValue('Edit Me');

    await targetCard.click();
    await page.getByRole('button', { name: 'Delete Selected' }).click();
    await expect(page.locator('.modal')).toBeVisible();
    await page.locator('.modal').getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByRole('heading', { name: 'Create Card' })).toBeVisible();
    await expect(page.getByLabel('Song title *')).toHaveValue('');
    await expect(page.locator('.grid .card', { hasText: 'Edit Me' })).toHaveCount(0);
  });
});
