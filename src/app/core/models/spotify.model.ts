export interface SpotifyPlaylistTrack {
  id: string;
  name: string;
  artists: string[];
  album: string;
  year: number;
  spotifyUrl: string;
}

export interface SpotifyAuthSession {
  clientId: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

export interface SpotifyPkceState {
  clientId: string;
  state: string;
  verifier: string;
  redirectUri: string;
  createdAt: number;
}

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: string,
  ) {
    super(message);
  }
}
