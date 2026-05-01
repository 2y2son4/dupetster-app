import { Injectable, NgZone } from '@angular/core';
import * as Papa from 'papaparse';
import {
  CardDraft,
  Difficulty,
  MusicCard,
  QrModeOption,
  QrPayloadMode,
  SortMode,
} from '../models/card.model';
import {
  SpotifyApiError,
  SpotifyAuthSession,
  SpotifyPkceState,
  SpotifyPlaylistTrack,
} from '../models/spotify.model';
import { ToastMessage } from '../models/ui.model';
import { PdfExportService } from './pdf-export.service';
import { QrCodeService } from './qr-code.service';
import { SpotifyApiService } from './spotify-api.service';

@Injectable({ providedIn: 'root' })
export class AppStateService {
  readonly storageKey = 'dupetster_cards_v2';
  readonly spotifyImportKey = 'dupetster_spotify_import_v1';
  readonly spotifyAuthKey = 'dupetster_spotify_auth_v1';
  readonly spotifyPkceKey = 'dupetster_spotify_pkce_v1';
  readonly spotifyRequestTimeoutMs = 20000;
  readonly busyWatchdogMs = 30000;
  readonly busyHardLimitMs = 45000;
  readonly spotifyOAuthScope = 'playlist-read-private playlist-read-collaborative';
  readonly toastDurationMs = 2800;
  readonly pageSize = 12;
  readonly difficulties: Difficulty[] = ['Original', 'Pro', 'Expert'];
  readonly qrModes: QrModeOption[] = [
    { value: 'canonical-url', label: 'Hitster/QRSong mode (recommended)' },
    { value: 'spotify-uri', label: 'Spotify URI mode (spotify:track:...)' },
    { value: 'raw-url', label: 'Raw URL mode (exact URL entered)' },
  ];

  cards: MusicCard[] = [];
  filteredCards: MusicCard[] = [];
  selectedCardIds = new Set<number>();
  toasts: ToastMessage[] = [];

  form: CardDraft = this.emptyDraft();
  editingCardId: number | null = null;
  cardPendingDelete: MusicCard | null = null;

  searchQuery = '';
  difficultyFilter = '';
  sortMode: SortMode = 'recent';
  currentPage = 1;
  revealYear = true;
  pdfLoading = false;
  qrMode: QrPayloadMode = 'canonical-url';
  spotifyClientId = '';
  spotifyClientSecret = '';
  spotifyPlaylistInput = '';
  spotifyTrackListInput = '';
  spotifyImportDifficulty: Difficulty = 'Original';
  spotifyImportLoading = false;
  spotifyTrackListImportLoading = false;
  proxyImportLoading = false;
  busyCount = 0;
  busyMessage = '';
  busyWatchdogHandle: number | null = null;
  busyStartedAt: number | null = null;
  toastTimerHandles = new Map<number, number>();
  spotifyAuthSession: SpotifyAuthSession | null = null;

  constructor(
    private readonly zone: NgZone,
    private readonly spotifyApiService: SpotifyApiService,
    private readonly qrCodeService: QrCodeService,
    private readonly pdfExportService: PdfExportService,
  ) {
    void this.restoreCards();
    this.restoreSpotifyImportSettings();
    this.restoreSpotifyAuthSession();
    void this.completeSpotifyAuthFromRedirect();

    window.setInterval(() => {
      if (!this.isBusy || this.busyStartedAt === null) {
        return;
      }

      const elapsed = Date.now() - this.busyStartedAt;
      if (elapsed > this.busyHardLimitMs) {
        this.forceResetBusy('Operation exceeded time limit and was reset.');
      }
    }, 2000);
  }

  get selectedCount(): number {
    return this.selectedCardIds.size;
  }

  get isBusy(): boolean {
    return this.busyCount > 0;
  }

  get spotifyConnected(): boolean {
    return !!this.spotifyAuthSession?.accessToken;
  }

  get allFilteredSelected(): boolean {
    if (this.filteredCards.length === 0) {
      return false;
    }

    return this.filteredCards.every((card) => this.selectedCardIds.has(card.id));
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredCards.length / this.pageSize));
  }

  get pagedCards(): MusicCard[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredCards.slice(start, start + this.pageSize);
  }

  get selectedCards(): MusicCard[] {
    return this.cards.filter((card) => this.selectedCardIds.has(card.id));
  }

  get selectedPages(): MusicCard[][] {
    const source = [...this.selectedCards];
    const pages: MusicCard[][] = [];
    const slotsPerPage = 16;

    for (let i = 0; i < source.length; i += slotsPerPage) {
      const page = source.slice(i, i + slotsPerPage);
      pages.push(page);
    }

    return pages;
  }

  async saveOrUpdateCard(): Promise<void> {
    if (!this.validateForm()) {
      return;
    }

    const qrInfo = this.resolveQrPayload(this.form.spotifyUrl, this.qrMode);
    if (!qrInfo.payload) {
      this.pushToast(
        'Could not parse a Spotify track ID. Use a track URL or spotify:track URI.',
        'error',
      );
      return;
    }

    if (qrInfo.warning) {
      this.pushToast(qrInfo.warning, 'warning');
    }

    const qrPayload = qrInfo.payload;

    await this.withBusy('Generating card...', async () => {
      const qrDataUrl = await this.qrToDataUrl(qrPayload);
      if (!qrDataUrl) {
        this.pushToast('Unable to generate QR from Spotify URL.', 'error');
        return;
      }

      if (this.editingCardId) {
        const idx = this.cards.findIndex((item) => item.id === this.editingCardId);
        if (idx !== -1) {
          this.cards[idx] = {
            ...this.cards[idx],
            ...this.formToCardPayload(),
            spotifyTrackId: qrInfo.trackId,
            qrPayload,
            qrMode: this.qrMode,
            qrDataUrl,
          };
        }
        this.pushToast('Card updated.', 'success');
      } else {
        const card: MusicCard = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          ...this.formToCardPayload(),
          spotifyTrackId: qrInfo.trackId,
          qrPayload,
          qrMode: this.qrMode,
          qrDataUrl,
        };
        this.cards.push(card);
        this.pushToast('Card added.', 'success');
      }

      this.resetForm();
      await this.persistCards();
      this.applyFilters();
    });
  }

  editCard(card: MusicCard): void {
    this.editingCardId = card.id;
    this.form = {
      title: card.title,
      artist: card.artist,
      year: card.year,
      spotifyUrl: card.spotifyUrl,
      album: card.album,
      genre: card.genre,
      difficulty: card.difficulty,
    };
    this.qrMode = card.qrMode ?? 'canonical-url';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  duplicateCard(card: MusicCard): void {
    const copy: MusicCard = {
      ...card,
      id: Date.now() + Math.floor(Math.random() * 1000),
    };
    this.cards.push(copy);
    void this.persistCards();
    this.applyFilters();
    this.pushToast('Card duplicated.', 'success');
  }

  askDelete(card: MusicCard): void {
    this.cardPendingDelete = card;
  }

  cancelDelete(): void {
    this.cardPendingDelete = null;
  }

  confirmDelete(): void {
    if (!this.cardPendingDelete) {
      return;
    }

    const id = this.cardPendingDelete.id;
    this.cards = this.cards.filter((card) => card.id !== id);
    this.selectedCardIds.delete(id);
    this.cardPendingDelete = null;
    void this.persistCards();
    this.applyFilters();
    this.pushToast('Card deleted.', 'success');
  }

  resetForm(): void {
    this.form = this.emptyDraft();
    this.editingCardId = null;
  }

  toggleSelect(cardId: number): void {
    if (this.selectedCardIds.has(cardId)) {
      this.selectedCardIds.delete(cardId);
    } else {
      this.selectedCardIds.add(cardId);
    }
  }

  isSelected(cardId: number): boolean {
    return this.selectedCardIds.has(cardId);
  }

  toggleSelectAllFiltered(): void {
    if (this.filteredCards.length === 0) {
      return;
    }

    if (this.allFilteredSelected) {
      for (const card of this.filteredCards) {
        this.selectedCardIds.delete(card.id);
      }
      return;
    }

    for (const card of this.filteredCards) {
      this.selectedCardIds.add(card.id);
    }
  }

  applyFilters(): void {
    const query = this.searchQuery.trim().toLowerCase();
    let next = [...this.cards];

    if (query) {
      next = next.filter((card) => {
        return (
          card.title.toLowerCase().includes(query) || card.artist.toLowerCase().includes(query)
        );
      });
    }

    if (this.difficultyFilter) {
      next = next.filter((card) => card.difficulty === this.difficultyFilter);
    }

    if (this.sortMode === 'title') {
      next.sort((a, b) => a.title.localeCompare(b.title));
    } else if (this.sortMode === 'year') {
      next.sort((a, b) => a.year - b.year);
    } else {
      next.sort((a, b) => b.id - a.id);
    }

    this.filteredCards = next;
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
  }

  onFormChange(next: CardDraft): void {
    this.form = next;
  }

  onSearchQueryChange(value: string): void {
    this.searchQuery = value;
    this.applyFilters();
  }

  onDifficultyFilterChange(value: string): void {
    this.difficultyFilter = value;
    this.applyFilters();
  }

  onSortModeChange(value: SortMode): void {
    this.sortMode = value;
    this.applyFilters();
  }

  onRevealYearChange(value: boolean): void {
    this.revealYear = value;
  }

  previousPage(): void {
    this.currentPage = Math.max(1, this.currentPage - 1);
  }

  nextPage(): void {
    this.currentPage = Math.min(this.totalPages, this.currentPage + 1);
  }

  async exportPdf(): Promise<void> {
    const selected = this.selectedCards;
    if (selected.length === 0) {
      this.pushToast('Select at least one card for PDF export.', 'error');
      return;
    }

    this.pdfLoading = true;
    this.beginBusy('Exporting PDF...');

    try {
      this.pdfExportService.exportCardsSheetPdf(selected, this.revealYear);
      this.pushToast('PDF generated with 4x4 card sheet layout.', 'success');
    } finally {
      this.pdfLoading = false;
      this.endBusy();
    }
  }

  printSelected(): void {
    if (this.selectedCards.length === 0) {
      this.pushToast('Select at least one card to print.', 'error');
      return;
    }

    window.print();
  }

  async regenerateQrForAllCards(): Promise<void> {
    if (this.cards.length === 0) {
      this.pushToast('No cards available to regenerate.', 'warning');
      return;
    }

    await this.withBusy('Rebuilding QR cards...', async () => {
      let updated = 0;
      for (const card of this.cards) {
        const qrInfo = this.resolveQrPayload(card.spotifyUrl, this.qrMode);
        if (!qrInfo.payload) {
          continue;
        }
        const qrDataUrl = await this.qrToDataUrl(qrInfo.payload);
        if (!qrDataUrl) {
          continue;
        }
        card.spotifyTrackId = qrInfo.trackId;
        card.qrPayload = qrInfo.payload;
        card.qrMode = this.qrMode;
        card.qrDataUrl = qrDataUrl;
        updated += 1;
      }

      await this.persistCards();
      this.applyFilters();
      this.pushToast(
        `Regenerated ${updated} cards using ${this.getQrModeLabel(this.qrMode)}.`,
        'success',
      );
    });
  }

  async connectSpotifyAccount(): Promise<void> {
    const clientId = this.spotifyClientId.trim();
    if (!clientId) {
      this.pushToast('Provide Spotify Client ID before connecting your account.', 'error');
      return;
    }

    const redirectUri = this.resolveSpotifyRedirectUri();
    const verifier = this.randomUrlSafeString(64);
    const state = this.randomUrlSafeString(24);
    const challenge = await this.createCodeChallenge(verifier);

    const pkceState: SpotifyPkceState = {
      clientId,
      state,
      verifier,
      redirectUri,
      createdAt: Date.now(),
    };
    sessionStorage.setItem(this.spotifyPkceKey, JSON.stringify(pkceState));

    const authorizeUrl = new URL('https://accounts.spotify.com/authorize');
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', clientId);
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('code_challenge', challenge);
    authorizeUrl.searchParams.set('state', state);
    authorizeUrl.searchParams.set('scope', this.spotifyOAuthScope);
    authorizeUrl.searchParams.set('show_dialog', 'true');

    this.persistSpotifyImportSettings();
    window.location.href = authorizeUrl.toString();
  }

  disconnectSpotifyAccount(showToast = true): void {
    this.spotifyAuthSession = null;
    localStorage.removeItem(this.spotifyAuthKey);
    sessionStorage.removeItem(this.spotifyPkceKey);
    if (showToast) {
      this.pushToast('Spotify account disconnected.', 'info');
    }
  }

  async importFromSpotifyPlaylist(): Promise<void> {
    const playlistId = this.extractSpotifyPlaylistId(this.spotifyPlaylistInput);

    if (!playlistId) {
      this.pushToast('Provide a valid Spotify playlist URL/ID.', 'error');
      return;
    }

    this.setSpotifyImportLoading(true);
    this.persistSpotifyImportSettings();

    try {
      if (this.spotifyConnected) {
        const playlistTracks = await this.fetchSpotifyPlaylistTracksWithUserSession(playlistId);
        if (playlistTracks.length === 0) {
          this.pushToast('No track items found in this playlist.', 'warning');
          return;
        }
        await this.importSpotifyTracksIntoCards(playlistTracks);
        return;
      }

      const clientId = this.spotifyClientId.trim();
      const clientSecret = this.spotifyClientSecret.trim();
      if (!clientId || !clientSecret) {
        this.pushToast(
          'Connect Spotify account first, or provide Client ID + Client Secret for legacy import.',
          'error',
        );
        return;
      }

      const accessToken = await this.fetchSpotifyClientCredentialsToken(clientId, clientSecret);
      const playlistTracks = await this.fetchSpotifyPlaylistTracks(playlistId, accessToken);
      if (playlistTracks.length === 0) {
        this.pushToast('No track items found in this playlist.', 'warning');
        return;
      }
      await this.importSpotifyTracksIntoCards(playlistTracks);
    } catch (error) {
      if (error instanceof SpotifyApiError) {
        if (error.status === 401) {
          this.pushToast('Spotify auth failed (401). Reconnect Spotify and retry import.', 'error');
          return;
        }

        if (error.status === 403) {
          if (this.spotifyConnected) {
            const reason = this.extractSpotifyErrorReason(error.details);
            const guidance = this.buildSpotifyForbiddenGuidance(reason);
            this.disconnectSpotifyAccount(false);
            this.showToast(
              `Spotify denied access for the connected session (403${reason ? `: ${reason}` : ''}). ${guidance}`,
              'error',
            );
            return;
          }

          this.showToast(
            'Spotify denied playlist access (403) for this app/token type. This often happens with Client Credentials; use OAuth user login flow for playlist import.',
            'error',
          );
          return;
        }

        this.showToast(
          `Spotify request failed (${error.status}). ${error.details ?? 'Check credentials and playlist visibility.'}`,
          'error',
        );
        return;
      }

      this.showToast(
        'Playlist import failed. Verify playlist visibility and Spotify credentials.',
        'error',
      );
    } finally {
      this.setSpotifyImportLoading(false);
    }
  }

  async importFromSpotifyTrackList(): Promise<void> {
    const parsed = this.parseSpotifyTrackListInput(this.spotifyTrackListInput);

    if (parsed.trackIds.length === 0) {
      this.showToast('Paste at least one Spotify track URL, URI, or ID.', 'error');
      return;
    }

    this.setSpotifyTrackListImportLoading(true);
    this.persistSpotifyImportSettings();

    try {
      const accessToken = await this.getSpotifyTrackLookupAccessToken();
      const tracks = await this.fetchSpotifyTracksByIds(parsed.trackIds, accessToken);

      if (tracks.length === 0) {
        this.showToast('No valid Spotify tracks were resolved from the pasted list.', 'warning');
        return;
      }

      await this.importSpotifyTracksIntoCards(tracks);

      if (parsed.invalidEntries > 0) {
        this.showToast(`Skipped ${parsed.invalidEntries} invalid pasted entries.`, 'warning');
      }

      const missingCount = parsed.trackIds.length - tracks.length;
      if (missingCount > 0) {
        this.showToast(`Skipped ${missingCount} tracks that Spotify did not return.`, 'warning');
      }
    } catch (error) {
      if (error instanceof SpotifyApiError) {
        if (error.status === 401) {
          this.showToast(
            'Track lookup needs a valid Spotify session or Client ID + Client Secret.',
            'error',
          );
          return;
        }

        this.showToast(
          `Spotify track lookup failed (${error.status}). ${error.details ?? 'Check your credentials and pasted URLs.'}`,
          'error',
        );
        return;
      }

      this.showToast('Track list import failed. Check the pasted URLs and retry.', 'error');
    } finally {
      this.setSpotifyTrackListImportLoading(false);
    }
  }

  private async fetchSpotifyPlaylistTracksWithUserSession(
    playlistId: string,
  ): Promise<SpotifyPlaylistTrack[]> {
    const userToken = await this.getSpotifyUserAccessToken();
    if (!userToken) {
      throw new SpotifyApiError('spotify-user-session-missing', 401);
    }

    try {
      return await this.fetchSpotifyPlaylistTracks(playlistId, userToken);
    } catch (error) {
      if (
        error instanceof SpotifyApiError &&
        error.status === 401 &&
        this.spotifyAuthSession?.refreshToken
      ) {
        this.spotifyAuthSession = await this.refreshSpotifyAccessToken(this.spotifyAuthSession);
        this.persistSpotifyAuthSession();
        return this.fetchSpotifyPlaylistTracks(playlistId, this.spotifyAuthSession.accessToken);
      }

      throw error;
    }
  }

  private extractSpotifyErrorReason(details?: string): string {
    if (!details) {
      return '';
    }

    try {
      const parsed = JSON.parse(details) as {
        error?: {
          message?: string;
        };
      };
      return parsed.error?.message?.trim() ?? '';
    } catch {
      return details.trim();
    }
  }

  private buildSpotifyForbiddenGuidance(reason: string): string {
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

  private parseSpotifyTrackListInput(input: string): {
    trackIds: string[];
    invalidEntries: number;
  } {
    const entries = input
      .split(/\r?\n|,|;/)
      .map((item) => item.trim())
      .filter(Boolean);

    const trackIds: string[] = [];
    const seen = new Set<string>();
    let invalidEntries = 0;

    for (const entry of entries) {
      const directIdMatch = entry.match(/^[a-zA-Z0-9]{22}$/)?.[0] ?? null;
      const trackId = directIdMatch ?? this.extractSpotifyTrackId(entry);

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

  private async getSpotifyTrackLookupAccessToken(): Promise<string> {
    const clientId = this.spotifyClientId.trim();
    const clientSecret = this.spotifyClientSecret.trim();

    if (clientId && clientSecret) {
      return this.fetchSpotifyClientCredentialsToken(clientId, clientSecret);
    }

    const userToken = await this.getSpotifyUserAccessToken();
    if (userToken) {
      return userToken;
    }

    throw new SpotifyApiError('spotify-track-lookup-auth-missing', 401);
  }

  async importFromPlaylistViaProxy(): Promise<void> {
    const playlistId = this.extractSpotifyPlaylistId(this.spotifyPlaylistInput);
    if (!playlistId) {
      this.pushToast('Provide a valid Spotify playlist URL or ID.', 'error');
      return;
    }

    this.proxyImportLoading = true;
    this.persistSpotifyImportSettings();

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
        this.pushToast('Proxy returned no tracks for this playlist.', 'warning');
        return;
      }

      await this.importSpotifyTracksIntoCards(tracks);
    } catch (error) {
      if (error instanceof Error && error.message === 'proxy-spotify-forbidden') {
        this.pushToast(
          'Spotify denied playlist access (403) for Client Credentials. Proxy is working, but playlist import needs OAuth user login flow.',
          'error',
        );
        return;
      }

      this.pushToast(
        'Local proxy import failed. Start it with "npm run start:proxy" and set SPOTIFY_CLIENT_ID/SECRET in .env.proxy (or terminal env vars).',
        'error',
      );
    } finally {
      this.proxyImportLoading = false;
    }
  }

  async exportJson(): Promise<void> {
    await this.withBusy('Exporting JSON...', async () => {
      await this.yieldToUi();
      this.pdfExportService.downloadJson(this.cards, 'music-cards.json');
      this.pushToast('JSON exported.', 'success');
    });
  }

  async exportCsv(): Promise<void> {
    await this.withBusy('Exporting CSV...', async () => {
      await this.yieldToUi();
      this.pdfExportService.downloadCsv(
        this.cards.map((card) => ({
          title: card.title,
          artist: card.artist,
          year: card.year,
          spotifyUrl: card.spotifyUrl,
          spotifyTrackId: card.spotifyTrackId ?? '',
          qrPayload: card.qrPayload,
          qrMode: card.qrMode,
          album: card.album,
          genre: card.genre,
          difficulty: card.difficulty,
        })),
        'music-cards.csv',
      );
      this.pushToast('CSV exported.', 'success');
    });
  }

  async onImportJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      await this.withBusy('Importing JSON...', async () => {
        const text = await file.text();
        const parsed = JSON.parse(text) as Partial<MusicCard>[];
        const imported = await this.normalizeImportedCards(parsed);
        this.cards.push(...imported);
        await this.persistCards();
        this.applyFilters();
        this.pushToast(`Imported ${imported.length} cards from JSON.`, 'success');
      });
    } catch {
      this.pushToast('Unable to import JSON file.', 'error');
    } finally {
      input.value = '';
    }
  }

  async onImportCsv(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      await this.withBusy('Importing CSV...', async () => {
        const text = await file.text();
        const parsed = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
        });

        const normalizedSource: Partial<MusicCard>[] = (parsed.data ?? []).map(
          (row: Record<string, string>) => ({
            title: row['title'] ?? '',
            artist: row['artist'] ?? '',
            year: Number(row['year']),
            spotifyUrl: row['spotifyUrl'] ?? row['Spotify URL'] ?? '',
            spotifyTrackId: row['spotifyTrackId'] ?? null,
            qrPayload: row['qrPayload'] ?? '',
            qrMode: (row['qrMode'] as QrPayloadMode) ?? 'canonical-url',
            album: row['album'] ?? '',
            genre: row['genre'] ?? '',
            difficulty: (row['difficulty'] as Difficulty) ?? 'Original',
          }),
        );

        const imported = await this.normalizeImportedCards(normalizedSource);
        this.cards.push(...imported);
        await this.persistCards();
        this.applyFilters();
        this.pushToast(`Imported ${imported.length} cards from CSV.`, 'success');
      });
    } catch {
      this.pushToast('Unable to import CSV file.', 'error');
    } finally {
      input.value = '';
    }
  }

  trackById(_: number, card: MusicCard): number {
    return card.id;
  }

  previewQr(): string {
    if (!this.form.spotifyUrl) {
      return '';
    }
    const fromExisting = this.cards.find(
      (card) => card.spotifyUrl === this.form.spotifyUrl,
    )?.qrDataUrl;
    return fromExisting ?? '';
  }

  getQrModeLabel(mode: QrPayloadMode): string {
    return this.qrModes.find((item) => item.value === mode)?.label ?? mode;
  }

  getDetectedTrackId(spotifyUrl: string): string {
    return this.extractSpotifyTrackId(spotifyUrl) ?? 'Not detected';
  }

  private emptyDraft(): CardDraft {
    return {
      title: '',
      artist: '',
      year: null,
      spotifyUrl: '',
      album: '',
      genre: '',
      difficulty: 'Original',
    };
  }

  private formToCardPayload(): {
    title: string;
    artist: string;
    year: number;
    spotifyUrl: string;
    album: string;
    genre: string;
    difficulty: Difficulty;
  } {
    return {
      title: this.form.title.trim(),
      artist: this.form.artist.trim(),
      year: Number(this.form.year),
      spotifyUrl: this.form.spotifyUrl.trim(),
      album: this.form.album.trim(),
      genre: this.form.genre.trim(),
      difficulty: this.form.difficulty,
    };
  }

  private validateForm(): boolean {
    if (
      !this.form.title.trim() ||
      !this.form.artist.trim() ||
      !this.form.spotifyUrl.trim() ||
      !this.form.year
    ) {
      this.pushToast('Please fill all required fields.', 'error');
      return false;
    }

    if (Number(this.form.year) < 1900 || Number(this.form.year) > 2100) {
      this.pushToast('Release year must be between 1900 and 2100.', 'error');
      return false;
    }

    return true;
  }

  private async normalizeImportedCards(source: Partial<MusicCard>[]): Promise<MusicCard[]> {
    const result: MusicCard[] = [];

    for (const row of source) {
      if (!row.title || !row.artist || !row.spotifyUrl || !row.year) {
        continue;
      }

      const importedMode = this.normalizeQrMode(row.qrMode);
      const qrInfo = row.qrPayload
        ? {
            payload: String(row.qrPayload),
            trackId:
              row.spotifyTrackId && String(row.spotifyTrackId).trim()
                ? String(row.spotifyTrackId)
                : this.extractSpotifyTrackId(String(row.spotifyUrl)),
          }
        : this.resolveQrPayload(String(row.spotifyUrl), importedMode);

      if (!qrInfo.payload) {
        continue;
      }

      const qrDataUrl = await this.qrToDataUrl(qrInfo.payload);
      if (!qrDataUrl) {
        continue;
      }
      result.push({
        id: Date.now() + Math.floor(Math.random() * 100000),
        title: String(row.title),
        artist: String(row.artist),
        year: Number(row.year),
        spotifyUrl: String(row.spotifyUrl),
        spotifyTrackId: qrInfo.trackId,
        qrPayload: qrInfo.payload,
        qrMode: importedMode,
        album: String(row.album ?? ''),
        genre: String(row.genre ?? ''),
        difficulty: this.normalizeDifficulty(row.difficulty),
        qrDataUrl,
      });
    }

    return result;
  }

  private normalizeDifficulty(value: unknown): Difficulty {
    if (value === 'Pro' || value === 'Expert') {
      return value;
    }
    return 'Original';
  }

  private async importSpotifyTracksIntoCards(tracks: SpotifyPlaylistTrack[]): Promise<void> {
    await this.withBusy('Generating cards from playlist...', async () => {
      const existingTrackIds = new Set(
        this.cards.map((card) => card.spotifyTrackId).filter((id): id is string => !!id),
      );

      const total = tracks.length;
      let imported = 0;
      let skipped = 0;
      let processed = 0;

      const updateProgress = async (forceYield = false): Promise<void> => {
        const percent = Math.round((processed / total) * 100);
        this.busyMessage = `Imported ${processed}/${total} (${percent}%)...`;
        if (forceYield || processed % 10 === 0) {
          await this.yieldToUi();
        }
      };

      await updateProgress(true);

      for (const track of tracks) {
        if (!track.id || existingTrackIds.has(track.id)) {
          skipped += 1;
        } else {
          const canonicalUrl = `https://open.spotify.com/track/${track.id}`;
          const qrInfo = this.resolveQrPayload(canonicalUrl, this.qrMode);
          if (!qrInfo.payload) {
            skipped += 1;
          } else {
            const qrDataUrl = await this.qrToDataUrl(qrInfo.payload);
            if (!qrDataUrl) {
              skipped += 1;
            } else {
              this.cards.push({
                id: Date.now() + Math.floor(Math.random() * 100000) + imported,
                title: track.name,
                artist: track.artists.join(', '),
                year: track.year,
                spotifyUrl: canonicalUrl,
                album: track.album,
                genre: '',
                difficulty: this.spotifyImportDifficulty,
                spotifyTrackId: track.id,
                qrPayload: qrInfo.payload,
                qrMode: this.qrMode,
                qrDataUrl,
              });
              existingTrackIds.add(track.id);
              imported += 1;
            }
          }
        }

        processed += 1;
        await updateProgress();
      }

      await updateProgress(true);

      await this.persistCards();
      this.applyFilters();

      if (imported > 0) {
        this.pushToast(
          `Imported ${imported} tracks from playlist.${skipped > 0 ? ` Skipped ${skipped}.` : ''}`,
          'success',
        );
      } else {
        this.pushToast('No new tracks imported (likely duplicates or invalid tracks).', 'warning');
      }
    });
  }

  private beginBusy(message: string): void {
    if (this.busyCount === 0) {
      this.busyStartedAt = Date.now();
    }
    this.busyCount += 1;
    this.busyMessage = message;
    this.refreshBusyWatchdog();
  }

  private endBusy(): void {
    this.busyCount = Math.max(0, this.busyCount - 1);
    if (this.busyCount === 0) {
      this.busyMessage = '';
      this.busyStartedAt = null;
      this.clearBusyWatchdog();
      return;
    }

    this.refreshBusyWatchdog();
  }

  private async withBusy<T>(message: string, task: () => Promise<T>): Promise<T> {
    this.beginBusy(message);
    await this.yieldToUi();
    try {
      return await task();
    } finally {
      this.endBusy();
    }
  }

  private async yieldToUi(): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  private refreshBusyWatchdog(): void {
    this.clearBusyWatchdog();
    this.busyWatchdogHandle = window.setTimeout(() => {
      this.forceResetBusy('Operation timeout. Loader was reset automatically.');
    }, this.busyWatchdogMs);
  }

  private clearBusyWatchdog(): void {
    if (this.busyWatchdogHandle !== null) {
      window.clearTimeout(this.busyWatchdogHandle);
      this.busyWatchdogHandle = null;
    }
  }

  private forceResetBusy(message: string): void {
    this.busyCount = 0;
    this.busyMessage = '';
    this.busyStartedAt = null;
    this.clearBusyWatchdog();
    this.pushToast(message, 'warning');
  }

  dismissLoader(): void {
    this.forceResetBusy('Loader dismissed manually.');
  }

  dismissToast(toastId: number): void {
    this.runUiUpdate(() => {
      const timer = this.toastTimerHandles.get(toastId);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        this.toastTimerHandles.delete(toastId);
      }

      this.toasts = this.toasts.filter((item) => item.id !== toastId);
    });
  }

  private setSpotifyImportLoading(value: boolean): void {
    this.runUiUpdate(() => {
      this.spotifyImportLoading = value;
    });
  }

  private setSpotifyTrackListImportLoading(value: boolean): void {
    this.runUiUpdate(() => {
      this.spotifyTrackListImportLoading = value;
    });
  }

  private showToast(text: string, type: ToastMessage['type']): void {
    this.runUiUpdate(() => {
      this.pushToast(text, type);
    });
  }

  private runUiUpdate(task: () => void): void {
    this.zone.run(() => {
      task();
    });
  }

  private normalizeQrMode(value: unknown): QrPayloadMode {
    if (value === 'spotify-uri' || value === 'raw-url') {
      return value;
    }
    return 'canonical-url';
  }

  private restoreSpotifyImportSettings(): void {
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
      this.spotifyImportDifficulty = this.normalizeDifficulty(settings.difficulty);
    } catch {
      this.spotifyClientId = '';
      this.spotifyClientSecret = '';
      this.spotifyPlaylistInput = '';
      this.spotifyTrackListInput = '';
      this.spotifyImportDifficulty = 'Original';
    }
  }

  private restoreSpotifyAuthSession(): void {
    const raw = localStorage.getItem(this.spotifyAuthKey);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as SpotifyAuthSession;
      if (!parsed.clientId || !parsed.accessToken || !parsed.expiresAt) {
        return;
      }
      this.spotifyAuthSession = {
        clientId: parsed.clientId,
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken ?? null,
        expiresAt: Number(parsed.expiresAt),
      };

      if (!this.spotifyClientId) {
        this.spotifyClientId = parsed.clientId;
      }
    } catch {
      this.spotifyAuthSession = null;
    }
  }

  private persistSpotifyAuthSession(): void {
    if (!this.spotifyAuthSession) {
      localStorage.removeItem(this.spotifyAuthKey);
      return;
    }

    localStorage.setItem(this.spotifyAuthKey, JSON.stringify(this.spotifyAuthSession));
  }

  private async completeSpotifyAuthFromRedirect(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const authError = params.get('error');

    if (!code && !authError) {
      return;
    }

    if (authError) {
      this.pushToast(`Spotify login failed: ${authError}`, 'error');
      this.clearSpotifyAuthQueryFromUrl();
      return;
    }

    const pkceRaw = sessionStorage.getItem(this.spotifyPkceKey);
    if (!pkceRaw || !state) {
      this.pushToast('Spotify login session expired. Please connect again.', 'error');
      this.clearSpotifyAuthQueryFromUrl();
      return;
    }

    const authCode = code;
    if (!authCode) {
      this.pushToast('Spotify login response is missing authorization code.', 'error');
      this.clearSpotifyAuthQueryFromUrl();
      return;
    }

    let pkceState: SpotifyPkceState;
    try {
      pkceState = JSON.parse(pkceRaw) as SpotifyPkceState;
    } catch {
      this.pushToast('Invalid Spotify login session. Please connect again.', 'error');
      this.clearSpotifyAuthQueryFromUrl();
      return;
    }

    if (pkceState.state !== state) {
      this.pushToast('Spotify login validation failed (state mismatch).', 'error');
      sessionStorage.removeItem(this.spotifyPkceKey);
      this.clearSpotifyAuthQueryFromUrl();
      return;
    }

    try {
      await this.withBusy('Connecting Spotify account...', async () => {
        const session = await this.exchangeSpotifyCodeForSession(authCode, pkceState);
        this.spotifyAuthSession = session;
        this.spotifyClientId = session.clientId;
        this.persistSpotifyAuthSession();
        this.persistSpotifyImportSettings();
      });
      this.pushToast('Spotify account connected.', 'success');
    } catch (error) {
      if (error instanceof SpotifyApiError && error.status === 408) {
        this.pushToast(
          'Spotify login timed out. Please retry and disable browser extensions for this tab if needed.',
          'error',
        );
      } else {
        this.pushToast(
          'Could not complete Spotify login. Verify redirect URI in dashboard.',
          'error',
        );
      }
    } finally {
      sessionStorage.removeItem(this.spotifyPkceKey);
      this.clearSpotifyAuthQueryFromUrl();
    }
  }

  private persistSpotifyImportSettings(): void {
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

  private async getSpotifyUserAccessToken(): Promise<string | null> {
    if (!this.spotifyAuthSession) {
      return null;
    }

    if (Date.now() < this.spotifyAuthSession.expiresAt - 30_000) {
      return this.spotifyAuthSession.accessToken;
    }

    if (!this.spotifyAuthSession.refreshToken) {
      this.disconnectSpotifyAccount();
      this.pushToast('Spotify session expired. Connect your account again.', 'warning');
      return null;
    }

    try {
      this.spotifyAuthSession = await this.refreshSpotifyAccessToken(this.spotifyAuthSession);
      this.persistSpotifyAuthSession();
      return this.spotifyAuthSession.accessToken;
    } catch {
      this.disconnectSpotifyAccount();
      this.pushToast('Spotify session refresh failed. Connect your account again.', 'error');
      return null;
    }
  }

  private async exchangeSpotifyCodeForSession(
    code: string,
    pkceState: SpotifyPkceState,
  ): Promise<SpotifyAuthSession> {
    return this.spotifyApiService.exchangeSpotifyCodeForSession(
      code,
      pkceState,
      this.spotifyRequestTimeoutMs,
    );
  }

  private async refreshSpotifyAccessToken(
    session: SpotifyAuthSession,
  ): Promise<SpotifyAuthSession> {
    return this.spotifyApiService.refreshSpotifyAccessToken(session, this.spotifyRequestTimeoutMs);
  }

  private resolveSpotifyRedirectUri(): string {
    const { origin, hostname, port } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      const localPort = port || '4200';
      return `http://127.0.0.1:${localPort}/callback`;
    }

    const appRoot = this.getAppRootPath().replace(/\/$/, '');
    return `${origin}${appRoot}/callback`;
  }

  private getAppRootPath(): string {
    const { hostname, pathname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return '/';
    }

    const firstSegment = pathname.split('/').filter(Boolean)[0];
    return firstSegment ? `/${firstSegment}/` : '/';
  }

  private clearSpotifyAuthQueryFromUrl(): void {
    const shouldResetToRoot = /\/callback\/?$/.test(window.location.pathname);
    const nextPath = shouldResetToRoot ? this.getAppRootPath() : window.location.pathname;
    window.history.replaceState({}, '', `${nextPath}${window.location.hash || ''}`);
  }

  private randomUrlSafeString(length: number): string {
    return this.spotifyApiService.randomUrlSafeString(length);
  }

  private async createCodeChallenge(verifier: string): Promise<string> {
    return this.spotifyApiService.createCodeChallenge(verifier);
  }

  private extractSpotifyPlaylistId(input: string): string | null {
    return this.spotifyApiService.extractSpotifyPlaylistId(input);
  }

  private async fetchSpotifyClientCredentialsToken(
    clientId: string,
    clientSecret: string,
  ): Promise<string> {
    return this.spotifyApiService.fetchSpotifyClientCredentialsToken(
      clientId,
      clientSecret,
      this.spotifyRequestTimeoutMs,
    );
  }

  private async fetchSpotifyPlaylistTracks(
    playlistId: string,
    accessToken: string,
  ): Promise<SpotifyPlaylistTrack[]> {
    return this.spotifyApiService.fetchSpotifyPlaylistTracks(
      playlistId,
      accessToken,
      this.spotifyRequestTimeoutMs,
    );
  }

  private async fetchSpotifyTracksByIds(
    trackIds: string[],
    accessToken: string,
  ): Promise<SpotifyPlaylistTrack[]> {
    return this.spotifyApiService.fetchSpotifyTracksByIds(
      trackIds,
      accessToken,
      this.spotifyRequestTimeoutMs,
    );
  }

  private extractSpotifyTrackId(input: string): string | null {
    return this.spotifyApiService.extractSpotifyTrackId(input);
  }

  private resolveQrPayload(
    spotifyUrl: string,
    mode: QrPayloadMode,
  ): { payload: string | null; trackId: string | null; warning?: string } {
    const input = spotifyUrl.trim();
    if (!input) {
      return { payload: null, trackId: null };
    }

    const trackId = this.extractSpotifyTrackId(input);
    if (mode === 'raw-url') {
      return {
        payload: input,
        trackId,
      };
    }

    if (!trackId) {
      return {
        payload: null,
        trackId: null,
      };
    }

    if (mode === 'spotify-uri') {
      return {
        payload: `spotify:track:${trackId}`,
        trackId,
      };
    }

    return {
      payload: `https://open.spotify.com/track/${trackId}`,
      trackId,
      warning: input.includes('/playlist/')
        ? 'Playlist URL detected. QR was converted to track format using detected track ID.'
        : undefined,
    };
  }

  private async restoreCards(): Promise<void> {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      this.applyFilters();
      return;
    }

    try {
      const parsed = JSON.parse(raw) as MusicCard[];
      this.cards = Array.isArray(parsed) ? parsed : [];

      for (const card of this.cards) {
        const normalizedMode = this.normalizeQrMode(card.qrMode);
        const existingPayload = card.qrPayload?.trim();
        const resolved = existingPayload
          ? {
              payload: existingPayload,
              trackId: card.spotifyTrackId ?? this.extractSpotifyTrackId(card.spotifyUrl),
            }
          : this.resolveQrPayload(card.spotifyUrl, normalizedMode);

        card.qrMode = normalizedMode;
        card.spotifyTrackId = resolved.trackId;
        card.qrPayload = resolved.payload ?? card.spotifyUrl;

        if (!card.qrDataUrl && card.qrPayload) {
          card.qrDataUrl = (await this.qrToDataUrl(card.qrPayload)) ?? '';
        }
      }

      this.applyFilters();
    } catch {
      this.cards = [];
      this.applyFilters();
    }
  }

  private async persistCards(): Promise<void> {
    localStorage.setItem(this.storageKey, JSON.stringify(this.cards));
  }

  private pushToast(text: string, type: ToastMessage['type']): void {
    const existing = this.toasts.find((item) => item.text === text && item.type === type);
    if (existing) {
      this.dismissToast(existing.id);
    }

    const toast: ToastMessage = { id: Date.now() + Math.random(), text, type };
    this.toasts = [...this.toasts, toast];

    const timer = window.setTimeout(() => {
      this.dismissToast(toast.id);
    }, this.toastDurationMs);

    this.toastTimerHandles.set(toast.id, timer);
  }

  private async qrToDataUrl(text: string): Promise<string | null> {
    return this.qrCodeService.toDataUrl(text);
  }
}
