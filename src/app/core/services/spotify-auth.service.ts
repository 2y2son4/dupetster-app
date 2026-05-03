import { Injectable } from '@angular/core';
import { SpotifyApiError, SpotifyAuthSession, SpotifyPkceState } from '../models/spotify.model';
import { SpotifyApiService } from './spotify-api.service';

@Injectable({ providedIn: 'root' })
export class SpotifyAuthService {
  readonly authKey = 'dupetster_spotify_auth_v1';
  readonly pkceKey = 'dupetster_spotify_pkce_v1';
  readonly oauthScope = 'playlist-read-private playlist-read-collaborative';
  readonly requestTimeoutMs = 20000;

  session: SpotifyAuthSession | null = null;

  constructor(private readonly api: SpotifyApiService) {}

  get connected(): boolean {
    return !!this.session?.accessToken;
  }

  restoreSession(): void {
    const raw = localStorage.getItem(this.authKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as SpotifyAuthSession;
      if (!parsed.clientId || !parsed.accessToken || !parsed.expiresAt) {
        return;
      }
      this.session = {
        clientId: parsed.clientId,
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken ?? null,
        expiresAt: Number(parsed.expiresAt),
      };
    } catch {
      this.session = null;
    }
  }

  persistSession(): void {
    if (!this.session) {
      localStorage.removeItem(this.authKey);
      return;
    }
    localStorage.setItem(this.authKey, JSON.stringify(this.session));
  }

  disconnect(): void {
    this.session = null;
    localStorage.removeItem(this.authKey);
    sessionStorage.removeItem(this.pkceKey);
  }

  /**
   * Returns a valid access token, refreshing if needed.
   * Throws with message 'session-expired' or 'refresh-failed' so the caller
   * can show the appropriate toast.
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.session) {
      return null;
    }

    if (Date.now() < this.session.expiresAt - 30_000) {
      return this.session.accessToken;
    }

    if (!this.session.refreshToken) {
      this.disconnect();
      throw new Error('session-expired');
    }

    try {
      this.session = await this.api.refreshSpotifyAccessToken(this.session, this.requestTimeoutMs);
      this.persistSession();
      return this.session.accessToken;
    } catch {
      this.disconnect();
      throw new Error('refresh-failed');
    }
  }

  /**
   * Builds the Spotify authorize URL and stores the PKCE state.
   * Returns the URL to redirect to.
   */
  async prepareConnect(clientId: string): Promise<string> {
    const redirectUri = this.resolveRedirectUri();
    const verifier = this.api.randomUrlSafeString(64);
    const state = this.api.randomUrlSafeString(24);
    const challenge = await this.api.createCodeChallenge(verifier);

    const pkceState: SpotifyPkceState = {
      clientId,
      state,
      verifier,
      redirectUri,
      createdAt: Date.now(),
    };
    sessionStorage.setItem(this.pkceKey, JSON.stringify(pkceState));

    const url = new URL('https://accounts.spotify.com/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', this.oauthScope);
    url.searchParams.set('show_dialog', 'true');

    return url.toString();
  }

  async exchangeCode(code: string, pkceState: SpotifyPkceState): Promise<SpotifyAuthSession> {
    return this.api.exchangeSpotifyCodeForSession(code, pkceState, this.requestTimeoutMs);
  }

  resolveRedirectUri(): string {
    const { origin, hostname, port } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      const localPort = port || '4200';
      return `http://127.0.0.1:${localPort}/callback`;
    }

    const appRoot = this.#getAppRootPath().replace(/\/$/, '');
    return `${origin}${appRoot}/callback`;
  }

  clearAuthQueryFromUrl(): void {
    const shouldResetToRoot = /\/callback\/?$/.test(window.location.pathname);
    const nextPath = shouldResetToRoot ? this.#getAppRootPath() : window.location.pathname;
    window.history.replaceState({}, '', `${nextPath}${window.location.hash || ''}`);
  }

  #getAppRootPath(): string {
    const { hostname, pathname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return '/';
    }

    const firstSegment = pathname.split('/').filter(Boolean)[0];
    return firstSegment ? `/${firstSegment}/` : '/';
  }
}
