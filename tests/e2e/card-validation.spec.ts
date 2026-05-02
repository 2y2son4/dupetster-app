import { expect, test } from '@playwright/test';
import { resetStorage } from './helpers/storage';
import { fillRequiredCardForm, spotifyTrackUrl } from './helpers/form';

test.describe('card validation', { tag: ['@validation', '@form-errors', '@regression'] }, () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
  });

  test('shows validation error when required fields are missing', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Add Card' }).click();

    await expect(page.getByText('Please fill all required fields.')).toBeVisible();
    await expect(page.locator('.grid .card')).toHaveCount(0);
  });

  test('shows validation error when year is out of range', async ({ page }) => {
    await page.goto('/');

    await fillRequiredCardForm(page, { year: '1800' });
    await page.getByRole('button', { name: 'Add Card' }).click();

    await expect(page.getByText('Release year must be between 1900 and 2100.')).toBeVisible();
    await expect(page.locator('.grid .card')).toHaveCount(0);
  });

  test('allows non-Spotify URL in raw URL mode', async ({ page }) => {
    await page.goto('/');

    await fillRequiredCardForm(page, { spotifyUrl: 'https://example.com/not-a-track' });
    await page.getByRole('button', { name: 'Add Card' }).click();

    await expect(page.getByText('Card added.')).toBeVisible();
    await expect(page.locator('.grid .card')).toHaveCount(1);
    await expect(page.getByText('Detected track ID: Not detected')).toBeVisible();
  });
});
