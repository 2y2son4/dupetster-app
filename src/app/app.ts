import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import * as Papa from 'papaparse';
import QRCode from 'qrcode';

type Difficulty = 'Original' | 'Pro' | 'Expert';
type QrPayloadMode = 'canonical-url' | 'spotify-uri' | 'raw-url';

interface MusicCard {
  id: number;
  title: string;
  artist: string;
  year: number;
  spotifyUrl: string;
  album: string;
  genre: string;
  difficulty: Difficulty;
  spotifyTrackId: string | null;
  qrPayload: string;
  qrMode: QrPayloadMode;
  qrDataUrl: string;
}

interface CardDraft {
  title: string;
  artist: string;
  year: number | null;
  spotifyUrl: string;
  album: string;
  genre: string;
  difficulty: Difficulty;
}

interface ToastMessage {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

interface SpotifyPlaylistTrack {
  id: string;
  name: string;
  artists: string[];
  album: string;
  year: number;
  spotifyUrl: string;
}

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly storageKey = 'dupetster_cards_v2';
  readonly spotifyImportKey = 'dupetster_spotify_import_v1';
  readonly pageSize = 12;
  readonly difficulties: Difficulty[] = ['Original', 'Pro', 'Expert'];
  readonly qrModes: { value: QrPayloadMode; label: string }[] = [
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
  sortMode: 'recent' | 'title' | 'year' = 'recent';
  currentPage = 1;
  revealYear = true;
  pdfLoading = false;
  qrMode: QrPayloadMode = 'canonical-url';
  spotifyClientId = '';
  spotifyClientSecret = '';
  spotifyPlaylistInput = '';
  spotifyImportDifficulty: Difficulty = 'Original';
  spotifyImportLoading = false;
  proxyImportLoading = false;

  constructor() {
    void this.restoreCards();
    this.restoreSpotifyImportSettings();
  }

  get selectedCount(): number {
    return this.selectedCardIds.size;
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

    const qrDataUrl = await this.qrToDataUrl(qrInfo.payload);
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
          qrPayload: qrInfo.payload,
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
        qrPayload: qrInfo.payload,
        qrMode: this.qrMode,
        qrDataUrl,
      };
      this.cards.push(card);
      this.pushToast('Card added.', 'success');
    }

    this.resetForm();
    await this.persistCards();
    this.applyFilters();
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

    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = 210;
      const pageHeight = 297;
      const cols = 4;
      const rows = 4;
      const cardWidth = pageWidth / cols;
      const cardHeight = pageHeight / rows;
      const qrSize = 24;
      const cardsPerPage = cols * rows;

      for (let p = 0; p < Math.ceil(selected.length / cardsPerPage); p++) {
        if (p > 0) {
          pdf.addPage();
        }

        const chunk = selected.slice(p * cardsPerPage, (p + 1) * cardsPerPage);
        chunk.forEach((card, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = col * cardWidth;
          const y = row * cardHeight;
          this.drawPdfCard(pdf, card, x, y, cardWidth, cardHeight, qrSize);
        });

        pdf.setDrawColor(0, 0, 0);
        for (let c = 1; c < cols; c++) {
          const x = c * cardWidth;
          pdf.line(x, 0, x, pageHeight);
        }
        for (let r = 1; r < rows; r++) {
          const y = r * cardHeight;
          pdf.line(0, y, pageWidth, y);
        }
      }

      pdf.save('dupetster-cards-sheet.pdf');
      this.pushToast('PDF generated with 4x4 card sheet layout.', 'success');
    } finally {
      this.pdfLoading = false;
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
  }

  async importFromSpotifyPlaylist(): Promise<void> {
    const clientId = this.spotifyClientId.trim();
    const clientSecret = this.spotifyClientSecret.trim();
    const playlistId = this.extractSpotifyPlaylistId(this.spotifyPlaylistInput);

    if (!clientId || !clientSecret || !playlistId) {
      this.pushToast(
        'Provide Client ID, Client Secret, and a valid Spotify playlist URL/ID.',
        'error',
      );
      return;
    }

    this.spotifyImportLoading = true;
    this.persistSpotifyImportSettings();

    try {
      const accessToken = await this.fetchSpotifyAccessToken(clientId, clientSecret);
      if (!accessToken) {
        this.pushToast('Failed to authenticate with Spotify. Check credentials.', 'error');
        return;
      }

      const playlistTracks = await this.fetchSpotifyPlaylistTracks(playlistId, accessToken);
      if (playlistTracks.length === 0) {
        this.pushToast('No track items found in this playlist.', 'warning');
        return;
      }
      await this.importSpotifyTracksIntoCards(playlistTracks);
    } catch {
      this.pushToast(
        'Playlist import failed. Verify playlist visibility and Spotify credentials.',
        'error',
      );
    } finally {
      this.spotifyImportLoading = false;
    }
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

      if (!response.ok) {
        throw new Error('proxy-request-failed');
      }

      const payload = (await response.json()) as {
        tracks?: SpotifyPlaylistTrack[];
      };

      const tracks = payload.tracks ?? [];
      if (tracks.length === 0) {
        this.pushToast('Proxy returned no tracks for this playlist.', 'warning');
        return;
      }

      await this.importSpotifyTracksIntoCards(tracks);
    } catch {
      this.pushToast(
        'Local proxy import failed. Start it with "npm run start:proxy" and set SPOTIFY_CLIENT_ID/SECRET in terminal.',
        'error',
      );
    } finally {
      this.proxyImportLoading = false;
    }
  }

  async exportJson(): Promise<void> {
    const blob = new Blob([JSON.stringify(this.cards, null, 2)], { type: 'application/json' });
    this.downloadBlob(blob, 'music-cards.json');
    this.pushToast('JSON exported.', 'success');
  }

  async exportCsv(): Promise<void> {
    const csv = Papa.unparse(
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
    );

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    this.downloadBlob(blob, 'music-cards.csv');
    this.pushToast('CSV exported.', 'success');
  }

  async onImportJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<MusicCard>[];
      const imported = await this.normalizeImportedCards(parsed);
      this.cards.push(...imported);
      await this.persistCards();
      this.applyFilters();
      this.pushToast(`Imported ${imported.length} cards from JSON.`, 'success');
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
    const existingTrackIds = new Set(
      this.cards.map((card) => card.spotifyTrackId).filter((id): id is string => !!id),
    );

    let imported = 0;
    let skipped = 0;

    for (const track of tracks) {
      if (!track.id || existingTrackIds.has(track.id)) {
        skipped += 1;
        continue;
      }

      const canonicalUrl = `https://open.spotify.com/track/${track.id}`;
      const qrInfo = this.resolveQrPayload(canonicalUrl, this.qrMode);
      if (!qrInfo.payload) {
        skipped += 1;
        continue;
      }

      const qrDataUrl = await this.qrToDataUrl(qrInfo.payload);
      if (!qrDataUrl) {
        skipped += 1;
        continue;
      }

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
        difficulty?: Difficulty;
      };

      this.spotifyClientId = settings.clientId ?? '';
      this.spotifyClientSecret = settings.clientSecret ?? '';
      this.spotifyPlaylistInput = settings.playlistInput ?? '';
      this.spotifyImportDifficulty = this.normalizeDifficulty(settings.difficulty);
    } catch {
      this.spotifyClientId = '';
      this.spotifyClientSecret = '';
      this.spotifyPlaylistInput = '';
      this.spotifyImportDifficulty = 'Original';
    }
  }

  private persistSpotifyImportSettings(): void {
    localStorage.setItem(
      this.spotifyImportKey,
      JSON.stringify({
        clientId: this.spotifyClientId,
        clientSecret: this.spotifyClientSecret,
        playlistInput: this.spotifyPlaylistInput,
        difficulty: this.spotifyImportDifficulty,
      }),
    );
  }

  private extractSpotifyPlaylistId(input: string): string | null {
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

  private async fetchSpotifyAccessToken(
    clientId: string,
    clientSecret: string,
  ): Promise<string | null> {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      return null;
    }

    const json = (await response.json()) as { access_token?: string };
    return json.access_token ?? null;
  }

  private async fetchSpotifyPlaylistTracks(
    playlistId: string,
    accessToken: string,
  ): Promise<SpotifyPlaylistTrack[]> {
    const tracks: SpotifyPlaylistTrack[] = [];
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

    while (url) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('spotify-playlist-fetch-failed');
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

  private extractSpotifyTrackId(input: string): string | null {
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
    const toast: ToastMessage = { id: Date.now() + Math.random(), text, type };
    this.toasts.push(toast);
    window.setTimeout(() => {
      this.toasts = this.toasts.filter((item) => item.id !== toast.id);
    }, 2800);
  }

  private async qrToDataUrl(text: string): Promise<string | null> {
    try {
      return await QRCode.toDataURL(text, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 256,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
    } catch {
      return null;
    }
  }

  private drawPdfCard(
    pdf: jsPDF,
    card: MusicCard,
    x: number,
    y: number,
    w: number,
    h: number,
    qrSize: number,
  ): void {
    pdf.setFillColor(237, 237, 237);
    pdf.setDrawColor(0, 0, 0);
    pdf.rect(x, y, w, h, 'FD');

    const centerX = x + w / 2;
    const tY = y + 12;

    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(card.title, centerX, tY, { align: 'center', maxWidth: w - 6 });

    pdf.setFontSize(13);
    pdf.text(this.revealYear ? String(card.year) : 'YEAR', centerX, tY + 8, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(card.artist, centerX, tY + 16, { align: 'center', maxWidth: w - 6 });

    const splitY = y + h * 0.5;
    pdf.setLineDashPattern([1, 1], 0);
    pdf.line(x + 2, splitY, x + w - 2, splitY);

    const qrX = centerX - qrSize / 2;
    const qrY = splitY + 4;
    pdf.rect(qrX, qrY, qrSize, qrSize, 'S');
    pdf.setLineDashPattern([], 0);

    if (card.qrDataUrl) {
      pdf.addImage(
        card.qrDataUrl,
        'PNG',
        qrX + 1,
        qrY + 1,
        qrSize - 2,
        qrSize - 2,
        undefined,
        'FAST',
      );
    }
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
