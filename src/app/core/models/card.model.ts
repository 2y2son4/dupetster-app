export type Difficulty = 'Original' | 'Pro' | 'Expert';
export type QrPayloadMode = 'canonical-url' | 'spotify-uri' | 'raw-url';
export type SortMode = 'recent' | 'title' | 'year';

export interface QrModeOption {
  value: QrPayloadMode;
  label: string;
}

export interface MusicCard {
  id: number;
  title: string;
  artist: string;
  year: number;
  spotifyUrl: string;
  album: string;
  difficulty: Difficulty;
  spotifyTrackId: string | null;
  qrPayload: string;
  qrMode: QrPayloadMode;
  qrDataUrl: string;
}

export interface CardDraft {
  title: string;
  artist: string;
  year: number | null;
  spotifyUrl: string;
  album: string;
  difficulty: Difficulty;
}
