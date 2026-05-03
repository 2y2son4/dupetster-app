import { Injectable, signal } from '@angular/core';
import { Difficulty } from '../models/card.model';
import { SpotifyApiError, SpotifyPlaylistTrack } from '../models/spotify.model';
import { SpotifyApiService } from './spotify-api.service';
import { SpotifyAuthService } from './spotify-auth.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class SpotifyImportService {
  readonly spotifyImportKey = 'dupetster_spotify_import_v1';
  readonly requestTimeoutMs = 20000;

  spotifyClientId = '';
  spotifyClientSecret = '';
  spotifyPlaylistInput = '';
  spotifyTrackListInput = '';
  spotifyImportDifficulty: Difficulty = 'Original';

  $spotifyImportLoading = signal(false);
  $spotifyTrackListImportLoading = signal(false);
  $proxyImportLoading = signal(false);

  constructor(
    private readonly spotifyApiService: SpotifyApiService,
    private readonly spotifyAuth: SpotifyAuthService,
    private readonly toast: ToastService,
  ) {}

  restoreSettings(): void {
    const raw = localStorage.getItem(this.spotifyImportKey);
    if (!raw) {
      return;
    }

    try {
      const settings = JSON.parse(raw) as {
        clientId?: string;
        clientSecret?: string;
        playlistInput?: string;
        trackListInput?: string;
        difficulty?: Difficulty;
      };
      this.spotifyClientId = settings.clientId ?? '';
      this.spotifyClientSecret = settings.clientSecret ?? '';
      this.spotifyPlaylistInput = settings.playlistInput ?? '';
      this.spotifyTrackListInput = settings.trackListInput ?? '';
      this.spotifyImportDifficulty = this.#normalizeDifficulty(settings.difficulty);
    } catch {
      this.spotifyClientId = '';
      this.spotifyClientSecret = '';
      this.spotifyPlaylistInput = '';
      this.spotifyTrackListInput = '';
      this.spotifyImportDifficulty = 'Original';
    }
  }

  persistSettings(): void {
    localStorage.setItem(
      this.spotifyImportKey,
      JSON.stringify({
        clientId: this.spotifyClientId,
        clientSecret: this.spotifyClientSecret,
        playlistInput: this.spotifyPlaylistInput,
        trackListInput: this.spotifyTrackListInput,
        difficulty: this.spotifyImportDifficulty,
      }),
    );
  }

  async resolvePlaylistTracks(): Promise<SpotifyPlaylistTrack[] | null> {
    const playlistId = this.spotifyApiService.extractSpotifyPlaylistId(this.spotifyPlaylistInput);
    if (!playlistId) {
      this.toast.push('Provide a valid Spotify playlist URL/ID.', 'error');
      return null;
    }

    this.$spotifyImportLoading.set(true);
    this.persistSettings();

    try {
      if (this.spotifyAuth.connected) {
        const userToken = await this.#getUserAccessToken();
        if (!userToken) {
          return null;
        }
        const tracks = await this.spotifyApiService.fetchSpotifyPlaylistTracks(
          playlistId,
          userToken,
          this.requestTimeoutMs,
        );
        if (tracks.length === 0) {
          this.toast.push('No track items found in this playlist.', 'warning');
          return null;
        }
        return tracks;
      }

      const clientId = this.spotifyClientId.trim();
      const clientSecret = this.spotifyClientSecret.trim();
      if (!clientId || !clientSecret) {
        this.toast.push(
          'Connect Spotify account first, or provide Client ID + Client Secret for legacy import.',
          'error',
        );
        return null;
      }

      const accessToken = await this.spotifyApiService.fetchSpotifyClientCredentialsToken(
        clientId,
        clientSecret,
        this.requestTimeoutMs,
      );
      const tracks = await this.spotifyApiService.fetchSpotifyPlaylistTracks(
        playlistId,
        accessToken,
        this.requestTimeoutMs,
      );
      if (tracks.length === 0) {
        this.toast.push('No track items found in this playlist.', 'warning');
        return null;
      }
      return tracks;
    } catch (error) {
      this.#handlePlaylistError(error);
      return null;
    } finally {
      this.$spotifyImportLoading.set(false);
    }
  }

  async resolveTrackListTracks(): Promise<{
    tracks: SpotifyPlaylistTrack[];
    invalidEntries: number;
    missingCount: number;
  } | null> {
    const parsed = this.#parseTrackListInput(this.spotifyTrackListInput);
    if (parsed.trackIds.length === 0) {
      this.toast.push('Paste at least one Spotify track URL, URI, or ID.', 'error');
      return null;
    }

    this.$spotifyTrackListImportLoading.set(true);
    this.persistSettings();

    try {
      const token = await this.getTrackLookupToken();
      const tracks = await this.spotifyApiService.fetchSpotifyTracksByIds(
        parsed.trackIds,
        token,
        this.requestTimeoutMs,
      );
      if (tracks.length === 0) {
        this.toast.push('No valid Spotify tracks were resolved from the pasted list.', 'warning');
        return null;
      }
      return {
        tracks,
        invalidEntries: parsed.invalidEntries,
        missingCount: parsed.trackIds.length - tracks.length,
      };
    } catch (error) {
      if (error instanceof SpotifyApiError) {
        if (error.status === 401) {
          this.toast.push(
            'Track lookup needs a valid Spotify session or Client ID + Client Secret.',
            'error',
          );
          return null;
        }
        this.toast.push(
          `Spotify track lookup failed (${error.status}). ${error.details ?? 'Check your credentials and pasted URLs.'}`,
          'error',
        );
        return null;
      }
      this.toast.push('Track list import failed. Check the pasted URLs and retry.', 'error');
      return null;
    } finally {
      this.$spotifyTrackListImportLoading.set(false);
    }
  }

  async resolveProxyTracks(): Promise<SpotifyPlaylistTrack[] | null> {
    const playlistId = this.spotifyApiService.extractSpotifyPlaylistId(this.spotifyPlaylistInput);
    if (!playlistId) {
      this.toast.push('Provide a valid Spotify playlist URL or ID.', 'error');
      return null;
    }

    this.$proxyImportLoading.set(true);
    this.persistSettings();

    try {
      const response = await fetch(
        `http://127.0.0.1:8787/api/playlist-tracks?playlist=${encodeURIComponent(this.spotifyPlaylistInput)}`,
      );
      const payload = (await response.json()) as {
        tracks?: SpotifyPlaylistTrack[];
        error?: string;
      };
      if (!response.ok) {
        const details = (payload.error ?? '').toLowerCase();
        if (response.status === 500 && details.includes('request failed (403)')) {
          throw new Error('proxy-spotify-forbidden');
        }
        throw new Error(payload.error ?? `proxy-request-failed-${response.status}`);
      }
      const tracks = payload.tracks ?? [];
      if (tracks.length === 0) {
        this.toast.push('Proxy returned no tracks for this playlist.', 'warning');
        return null;
      }
      return tracks;
    } catch (error) {
      if (error instanceof Error && error.message === 'proxy-spotify-forbidden') {
        this.toast.push(
          'Spotify denied playlist access (403) for Client Credentials. Proxy is working, but playlist import needs OAuth user login flow.',
          'error',
        );
        return null;
      }
      this.toast.push(
        'Local proxy import failed. Start it with "npm run start:proxy" and set SPOTIFY_CLIENT_ID/SECRET in .env.proxy (or terminal env vars).',
        'error',
      );
      return null;
    } finally {
      this.$proxyImportLoading.set(false);
    }
  }

  async getTrackLookupToken(): Promise<string> {
    const clientId = this.spotifyClientId.trim();
    const clientSecret = this.spotifyClientSecret.trim();
    if (clientId && clientSecret) {
      return this.spotifyApiService.fetchSpotifyClientCredentialsToken(
        clientId,
        clientSecret,
        this.requestTimeoutMs,
      );
    }
    try {
      const token = await this.spotifyAuth.getAccessToken();
      if (token) {
        return token;
      }
      throw new SpotifyApiError('spotify-track-lookup-auth-missing', 401);
    } catch {
      throw new SpotifyApiError('spotify-track-lookup-auth-missing', 401);
    }
  }

  #normalizeDifficulty(value: unknown): Difficulty {
    if (value === 'Pro' || value === 'Expert') {
      return value;
    }
    return 'Original';
  }

  async #getUserAccessToken(): Promise<string | null> {
    try {
      return await this.spotifyAuth.getAccessToken();
    } catch (error) {
      const isExpired = error instanceof Error && error.message === 'session-expired';
      this.toast.push(
        isExpired
          ? 'Spotify session expired. Connect your account again.'
          : 'Spotify session refresh failed. Connect your account again.',
        isExpired ? 'warning' : 'error',
      );
      return null;
    }
  }

  #handlePlaylistError(error: unknown): void {
    if (!(error instanceof SpotifyApiError)) {
      this.toast.push(
        'Playlist import failed. Verify playlist visibility and Spotify credentials.',
        'error',
      );
      return;
    }

    if (error.status === 401) {
      this.toast.push('Spotify auth failed (401). Reconnect Spotify and retry import.', 'error');
      return;
    }

    if (error.status === 403) {
      if (this.spotifyAuth.connected) {
        const reason = this.#extractErrorReason(error.details);
        const guidance = this.#buildForbiddenGuidance(reason);
        this.spotifyAuth.disconnect();
        this.toast.push(
          `Spotify denied access for the connected session (403${reason ? `: ${reason}` : ''}). ${guidance}`,
          'error',
        );
        return;
      }
      this.toast.push(
        'Spotify denied playlist access (403) for this app/token type. This often happens with Client Credentials; use OAuth user login flow for playlist import.',
        'error',
      );
      return;
    }

    this.toast.push(
      `Spotify request failed (${error.status}). ${error.details ?? 'Check credentials and playlist visibility.'}`,
      'error',
    );
  }

  #extractErrorReason(details?: string): string {
    if (!details) {
      return '';
    }
    try {
      const parsed = JSON.parse(details) as { error?: { message?: string } };
      return parsed.error?.message?.trim() ?? '';
    } catch {
      return details.trim();
    }
  }

  #buildForbiddenGuidance(reason: string): string {
    const normalized = reason.toLowerCase();
    if (normalized.includes('insufficient client scope')) {
      return 'Reconnect Spotify and approve the refreshed permission dialog, then retry import.';
    }
    if (
      normalized.includes('user not registered') ||
      normalized.includes('developer dashboard') ||
      normalized.includes('not allowed to access')
    ) {
      return 'Add this Spotify account to the app users list in the Spotify Developer Dashboard, then reconnect and retry.';
    }
    if (normalized.includes('private') || normalized.includes('collaborative')) {
      return 'Make sure this Spotify account can access that private or collaborative playlist, then reconnect and retry.';
    }
    return 'Reconnect Spotify again and retry import.';
  }

  #parseTrackListInput(input: string): { trackIds: string[]; invalidEntries: number } {
    const entries = input
      .split(/\r?\n|,|;/)
      .map((item) => item.trim())
      .filter(Boolean);

    const trackIds: string[] = [];
    const seen = new Set<string>();
    let invalidEntries = 0;

    for (const entry of entries) {
      const directIdMatch = entry.match(/^[a-zA-Z0-9]{22}$/)?.[0] ?? null;
      const trackId = directIdMatch ?? this.spotifyApiService.extractSpotifyTrackId(entry);
      if (!trackId) {
        invalidEntries += 1;
        continue;
      }
      if (!seen.has(trackId)) {
        seen.add(trackId);
        trackIds.push(trackId);
      }
    }

    return { trackIds, invalidEntries };
  }
}
