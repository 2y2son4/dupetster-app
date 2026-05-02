import { type Page } from '@playwright/test';

export const spotifyTrackUrl = 'https://open.spotify.com/track/2TpxZ7JUBn3uw46aR7qd6V';

export async function fillRequiredCardForm(
  page: Page,
  values?: { title?: string; artist?: string; year?: string; spotifyUrl?: string },
): Promise<void> {
  await page.getByLabel('Song title *').fill(values?.title ?? 'Form Song');
  await page.getByLabel('Artist *').fill(values?.artist ?? 'Form Artist');
  await page.getByLabel('Release year *').fill(values?.year ?? '2020');
  await page.getByLabel('Spotify URL *').fill(values?.spotifyUrl ?? spotifyTrackUrl);
}
