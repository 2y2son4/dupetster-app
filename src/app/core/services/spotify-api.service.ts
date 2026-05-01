import { Injectable } from '@angular/core';
import {
  SpotifyApiError,
  SpotifyAuthSession,
  SpotifyPkceState,
  SpotifyPlaylistTrack,
} from '../models/spotify.model';

@Injectable({ providedIn: 'root' })
export class SpotifyApiService {
  randomUrlSafeString(length: number): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);

    let result = '';
    for (const value of values) {
      result += charset[value % charset.length];
    }
    return result;
  }

  async createCodeChallenge(verifier: string): Promise<string> {
    const encoded = new TextEncoder().encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return this.base64UrlEncode(digest);
  }

  extractSpotifyPlaylistId(input: string): string | null {
    const value = input.trim();
    if (!value) {
      return null;
    }

    const directMatch = value.match(/^[a-zA-Z0-9]{22}$/);
    if (directMatch) {
      return directMatch[0];
    }

    try {
      const url = new URL(value);
      const pathMatch = url.pathname.match(/\/playlist\/([a-zA-Z0-9]{22})/);
      if (pathMatch?.[1]) {
        return pathMatch[1];
      }
    } catch {
      return null;
    }

    return null;
  }

  extractSpotifyTrackId(input: string): string | null {
    const value = input.trim();
    if (!value) {
      return null;
    }

    const uriMatch = value.match(/spotify:track:([a-zA-Z0-9]{22})/);
    if (uriMatch?.[1]) {
      return uriMatch[1];
    }

    try {
      const url = new URL(value);
      const trackMatch = url.pathname.match(/\/track\/([a-zA-Z0-9]{22})/);
      if (trackMatch?.[1]) {
        return trackMatch[1];
      }

      const uriParam = url.searchParams.get('uri');
      if (uriParam) {
        const nestedUriMatch = uriParam.match(/spotify:track:([a-zA-Z0-9]{22})/);
        if (nestedUriMatch?.[1]) {
          return nestedUriMatch[1];
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  async fetchSpotifyClientCredentialsToken(
    clientId: string,
    clientSecret: string,
    timeoutMs: number,
  ): Promise<string> {
    const response = await this.fetchWithTimeout(
      'https://accounts.spotify.com/api/token',
      timeoutMs,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      },
    );

    if (!response.ok) {
      let details = '';
      try {
        details = await response.text();
      } catch {
        details = '';
      }
      throw new SpotifyApiError('spotify-token-fetch-failed', response.status, details);
    }

    const json = (await response.json()) as { access_token?: string };
    if (!json.access_token) {
      throw new SpotifyApiError('spotify-token-response-missing-access-token', 500);
    }
    return json.access_token;
  }

  async fetchSpotifyPlaylistTracks(
    playlistId: string,
    accessToken: string,
    timeoutMs: number,
  ): Promise<SpotifyPlaylistTrack[]> {
    const tracks: SpotifyPlaylistTrack[] = [];
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

    while (url) {
      const response = await this.fetchWithTimeout(url, timeoutMs, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        let details = '';
        try {
          details = await response.text();
        } catch {
          details = '';
        }
        throw new SpotifyApiError('spotify-playlist-fetch-failed', response.status, details);
      }

      const json = (await response.json()) as {
        items?: Array<{
          track?: {
            id?: string;
            name?: string;
            artists?: Array<{ name?: string }>;
            album?: { name?: string; release_date?: string };
            external_urls?: { spotify?: string };
          };
        }>;
        next?: string | null;
      };

      for (const item of json.items ?? []) {
        const track = item.track;
        if (!track?.id || !track.name) {
          continue;
        }

        const releaseDate = track.album?.release_date ?? '';
        const releaseYear = Number.parseInt(releaseDate.slice(0, 4), 10);

        tracks.push({
          id: track.id,
          name: track.name,
          artists: (track.artists ?? []).map((artist) => artist.name ?? '').filter(Boolean),
          album: track.album?.name ?? '',
          year: Number.isFinite(releaseYear) ? releaseYear : 2000,
          spotifyUrl: track.external_urls?.spotify ?? `https://open.spotify.com/track/${track.id}`,
        });
      }

      url = json.next ?? '';
    }

    return tracks;
  }

  async fetchSpotifyTracksByIds(
    trackIds: string[],
    accessToken: string,
    timeoutMs: number,
  ): Promise<SpotifyPlaylistTrack[]> {
    const tracks: SpotifyPlaylistTrack[] = [];

    for (let index = 0; index < trackIds.length; index += 50) {
      const chunk = trackIds.slice(index, index + 50);
      const response = await this.fetchWithTimeout(
        `https://api.spotify.com/v1/tracks?ids=${encodeURIComponent(chunk.join(','))}`,
        timeoutMs,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        let details = '';
        try {
          details = await response.text();
        } catch {
          details = '';
        }
        throw new SpotifyApiError('spotify-track-fetch-failed', response.status, details);
      }

      const json = (await response.json()) as {
        tracks?: Array<{
          id?: string;
          name?: string;
          artists?: Array<{ name?: string }>;
          album?: { name?: string; release_date?: string };
          external_urls?: { spotify?: string };
        } | null>;
      };

      for (const track of json.tracks ?? []) {
        if (!track?.id || !track.name) {
          continue;
        }

        const releaseDate = track.album?.release_date ?? '';
        const releaseYear = Number.parseInt(releaseDate.slice(0, 4), 10);

        tracks.push({
          id: track.id,
          name: track.name,
          artists: (track.artists ?? []).map((artist) => artist.name ?? '').filter(Boolean),
          album: track.album?.name ?? '',
          year: Number.isFinite(releaseYear) ? releaseYear : 2000,
          spotifyUrl: track.external_urls?.spotify ?? `https://open.spotify.com/track/${track.id}`,
        });
      }
    }

    return tracks;
  }

  async exchangeSpotifyCodeForSession(
    code: string,
    pkceState: SpotifyPkceState,
    timeoutMs: number,
  ): Promise<SpotifyAuthSession> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: pkceState.redirectUri,
      client_id: pkceState.clientId,
      code_verifier: pkceState.verifier,
    }).toString();

    const response = await this.fetchWithTimeout(
      'https://accounts.spotify.com/api/token',
      timeoutMs,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );

    if (!response.ok) {
      throw new SpotifyApiError('spotify-oauth-code-exchange-failed', response.status);
    }

    const json = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!json.access_token || !json.expires_in) {
      throw new SpotifyApiError('spotify-oauth-invalid-token-response', 500);
    }

    return {
      clientId: pkceState.clientId,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
  }

  async refreshSpotifyAccessToken(
    session: SpotifyAuthSession,
    timeoutMs: number,
  ): Promise<SpotifyAuthSession> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: session.refreshToken ?? '',
      client_id: session.clientId,
    }).toString();

    const response = await this.fetchWithTimeout(
      'https://accounts.spotify.com/api/token',
      timeoutMs,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );

    if (!response.ok) {
      throw new SpotifyApiError('spotify-oauth-refresh-failed', response.status);
    }

    const json = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!json.access_token || !json.expires_in) {
      throw new SpotifyApiError('spotify-oauth-invalid-refresh-response', 500);
    }

    return {
      clientId: session.clientId,
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? session.refreshToken ?? null,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
  }

  async fetchWithTimeout(
    input: RequestInfo | URL,
    timeoutMs: number,
    init?: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, {
        ...(init ?? {}),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new SpotifyApiError(
          'spotify-request-timeout',
          408,
          `Request timed out after ${Math.round(timeoutMs / 1000)}s`,
        );
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  private base64UrlEncode(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
