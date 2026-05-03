import { expect, test, type Page } from '@playwright/test';
import { resetStorage } from './helpers/storage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Seeds a valid Spotify auth session directly into localStorage so the app
 *  boots in the "connected" state without going through OAuth. */
async function seedSpotifySession(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const session = {
      clientId: 'test-client-id',
      accessToken: 'fake-access-token',
      refreshToken: null,
      // expiresAt one hour from now
      expiresAt: Date.now() + 60 * 60 * 1000,
    };
    localStorage.setItem('dupetster_spotify_auth_v1', JSON.stringify(session));
  });
}

/** Intercepts the Spotify track-details endpoint and returns a fake track. */
async function mockTrackDetails(page: Page): Promise<void> {
  await page.route('https://api.spotify.com/v1/tracks/*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '2TpxZ7JUBn3uw46aR7qd6V',
        name: 'Autofill Song',
        artists: [{ name: 'Autofill Artist' }],
        album: { release_date: '2019-06-01' },
        external_urls: { spotify: 'https://open.spotify.com/track/2TpxZ7JUBn3uw46aR7qd6V' },
      }),
    });
  });
}

// ---------------------------------------------------------------------------
// Test suite: Spotify connect / disconnect
// ---------------------------------------------------------------------------

test.describe('Spotify connect', { tag: ['@spotify', '@regression'] }, () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
  });

  test('shows Connect Spotify button when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Connect Spotify', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Disconnect Spotify', exact: true }),
    ).not.toBeVisible();
  });

  test('reveals Client ID input when Connect Spotify is clicked', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Connect Spotify', exact: true }).click();

    await expect(page.getByLabel('Spotify Client ID (for autofill)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  });

  test('keeps Send button disabled when Client ID field is empty', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Connect Spotify', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  test('enables Send button once a Client ID is entered', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Connect Spotify', exact: true }).click();

    await page.getByLabel('Spotify Client ID (for autofill)').fill('my-client-id');

    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled();
  });

  test('toggles Client ID field visibility', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Connect Spotify', exact: true }).click();

    const clientIdInput = page.getByLabel('Spotify Client ID (for autofill)');
    await expect(clientIdInput).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Show Spotify Client ID' }).click();
    await expect(clientIdInput).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: 'Hide Spotify Client ID' }).click();
    await expect(clientIdInput).toHaveAttribute('type', 'password');
  });

  test('redirects to Spotify authorize URL when Send is clicked', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Connect Spotify', exact: true }).click();
    await page.getByLabel('Spotify Client ID (for autofill)').fill('my-client-id');

    // Intercept the navigation so we don't actually leave the test environment
    const navigationPromise = page.waitForRequest(
      (req) => req.url().startsWith('https://accounts.spotify.com/authorize'),
      { timeout: 5000 },
    );

    await page.getByRole('button', { name: 'Send' }).click();

    // The app issues window.location.href = authorize URL — capture it
    const req = await navigationPromise.catch(() => null);
    if (req) {
      expect(req.url()).toContain('client_id=my-client-id');
      expect(req.url()).toContain('response_type=code');
    } else {
      // Some browsers block cross-origin navigation in tests; verify URL changed instead
      await expect(page).toHaveURL(/accounts\.spotify\.com\/authorize/, { timeout: 5000 });
    }
  });

  test('shows Disconnect Spotify button when session is active', async ({ page }) => {
    await seedSpotifySession(page);
    await page.goto('/');

    await expect(
      page.getByRole('button', { name: 'Disconnect Spotify', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Connect Spotify', exact: true }),
    ).not.toBeVisible();
  });

  test('returns to Connect Spotify after disconnecting', async ({ page }) => {
    await seedSpotifySession(page);
    await page.goto('/');

    await page.getByRole('button', { name: 'Disconnect Spotify', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Connect Spotify', exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Disconnect Spotify', exact: true }),
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Test suite: Spotify autofill
// ---------------------------------------------------------------------------

test.describe('Spotify autofill', { tag: ['@spotify', '@regression'] }, () => {
  test.beforeEach(async ({ page }) => {
    await resetStorage(page);
  });

  test('shows loading indicator while fetching track metadata', async ({ page }) => {
    await seedSpotifySession(page);

    // Delay the API response so the loading indicator is visible
    await page.route('https://api.spotify.com/v1/tracks/*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '2TpxZ7JUBn3uw46aR7qd6V',
          name: 'Delayed Song',
          artists: [{ name: 'Delayed Artist' }],
          album: { release_date: '2021-01-01' },
          external_urls: { spotify: 'https://open.spotify.com/track/2TpxZ7JUBn3uw46aR7qd6V' },
        }),
      });
    });

    await page.goto('/');
    await page
      .getByLabel('Spotify URL *')
      .fill('https://open.spotify.com/track/2TpxZ7JUBn3uw46aR7qd6V');

    await expect(page.getByText('Fetching track metadata from Spotify...')).toBeVisible();
  });

  test('auto-populates Artist and Song title after successful autofill', async ({ page }) => {
    await seedSpotifySession(page);
    await mockTrackDetails(page);

    await page.goto('/');
    await page
      .getByLabel('Spotify URL *')
      .fill('https://open.spotify.com/track/2TpxZ7JUBn3uw46aR7qd6V');

    await expect(page.getByLabel('Artist *')).toHaveValue('Autofill Artist', { timeout: 5000 });
    await expect(page.getByLabel('Song title *')).toHaveValue('Autofill Song');
    await expect(page.getByLabel('Release year *')).toHaveValue('2019');
  });

  test('shows warning toast when autofill fails with a network error', async ({ page }) => {
    await seedSpotifySession(page);

    await page.route('https://api.spotify.com/v1/tracks/*', (route) =>
      route.fulfill({ status: 500 }),
    );

    await page.goto('/');
    await page
      .getByLabel('Spotify URL *')
      .fill('https://open.spotify.com/track/2TpxZ7JUBn3uw46aR7qd6V');

    await expect(
      page.locator('.toast', { hasText: 'Could not autofill metadata from that Spotify URL.' }),
    ).toBeVisible({ timeout: 5000 });
  });

  test('shows info toast prompting login when no session is active', async ({ page }) => {
    await page.goto('/');
    await page
      .getByLabel('Spotify URL *')
      .fill('https://open.spotify.com/track/2TpxZ7JUBn3uw46aR7qd6V');

    await expect(
      page.locator('.toast', {
        hasText: 'Spotify autofill needs a Spotify login or Client ID + Client Secret',
      }),
    ).toBeVisible({ timeout: 5000 });
  });
});
