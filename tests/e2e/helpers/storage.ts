import { Page } from '@playwright/test';

const STORAGE_KEY = 'dupetster_cards';

type SeedCard = {
  id: number;
  title: string;
  artist: string;
  year: number;
  spotifyUrl: string;
  album: string;
  difficulty: 'Original' | 'Pro' | 'Expert';
  spotifyTrackId: string | null;
  qrPayload: string;
  qrMode: 'canonical-url' | 'spotify-uri' | 'raw-url';
  qrDataUrl: string;
};

const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6qvxoAAAAASUVORK5CYII=';

export function makeCard(partial: Partial<SeedCard> & Pick<SeedCard, 'id' | 'title'>): SeedCard {
  const fallbackTrackId = '2TpxZ7JUBn3uw46aR7qd6V';
  const trackId = partial.spotifyTrackId ?? fallbackTrackId;
  const spotifyUrl = partial.spotifyUrl ?? `https://open.spotify.com/track/${trackId}`;
  return {
    id: partial.id,
    title: partial.title,
    artist: partial.artist ?? 'Seed Artist',
    year: partial.year ?? 2000,
    spotifyUrl,
    album: partial.album ?? '',
    difficulty: partial.difficulty ?? 'Original',
    spotifyTrackId: trackId,
    qrPayload: partial.qrPayload ?? spotifyUrl,
    qrMode: partial.qrMode ?? 'canonical-url',
    qrDataUrl: partial.qrDataUrl ?? tinyPng,
  };
}

export async function resetStorage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

export async function seedCards(page: Page, cards: SeedCard[]): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    { key: STORAGE_KEY, value: cards },
  );
}
