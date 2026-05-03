import { computed, Injectable, NgZone, signal } from '@angular/core';
import * as Papa from 'papaparse';
import {
  CardDraft,
  Difficulty,
  MusicCard,
  QrModeOption,
  QrPayloadMode,
  SortMode,
} from '../models/card.model';
import { SpotifyApiError, SpotifyPkceState, SpotifyPlaylistTrack } from '../models/spotify.model';
import { ToastMessage } from '../models/ui.model';
import { PdfExportService } from './pdf-export.service';
import { QrCodeService } from './qr-code.service';
import { SpotifyApiService } from './spotify-api.service';
import { SpotifyAuthService } from './spotify-auth.service';
import { SpotifyImportService } from './spotify-import.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class AppStateService {
  readonly storageKey = 'dupetster_cards';
  readonly busyWatchdogMs = 30000;
  readonly busyHardLimitMs = 45000;
  readonly pageSize = 18;
  readonly difficulties: Difficulty[] = ['Original', 'Pro', 'Expert'];
  readonly qrModes: QrModeOption[] = [
    { value: 'raw-url', label: 'Raw URL mode (exact URL entered)' },
    { value: 'canonical-url', label: 'Hitster/QRSong mode' },
    { value: 'spotify-uri', label: 'Spotify URI mode (spotify:track:...)' },
  ];

  cards: MusicCard[] = [];
  filteredCards: MusicCard[] = [];
  selectedCardIds = new Set<number>();

  form: CardDraft = this.#emptyDraft();
  editingCardId: number | null = null;
  cardPendingDelete: MusicCard | null = null;
  selectedDeletePendingCount = 0;

  searchQuery = '';
  difficultyFilter = '';
  sortMode: SortMode = 'recent';
  currentPage = 1;
  $pdfLoading = signal(false);
  qrMode: QrPayloadMode = 'raw-url';
  $spotifyAutofillLoading = signal(false);

  get toasts(): ToastMessage[] {
    return this.toast.toasts;
  }

  get spotifyClientId(): string {
    return this.spotifyImport.spotifyClientId;
  }

  set spotifyClientId(value: string) {
    this.spotifyImport.spotifyClientId = value;
  }
  #$busyCount = signal(0);
  $busyMessage = signal('');
  $isBusy = computed(() => this.#$busyCount() > 0);
  busyWatchdogHandle: number | null = null;
  busyStartedAt: number | null = null;
  #spotifyAutofillTimer: number | null = null;
  #spotifyAutofillRequestId = 0;
  #spotifyAutofilledTrackId: string | null = null;
  #spotifyAutofillAuthHintShown = false;

  constructor(
    private readonly zone: NgZone,
    private readonly spotifyApiService: SpotifyApiService,
    private readonly qrCodeService: QrCodeService,
    private readonly pdfExportService: PdfExportService,
    readonly spotifyAuth: SpotifyAuthService,
    readonly spotifyImport: SpotifyImportService,
    readonly toast: ToastService,
  ) {
    void this.#restoreCards();
    this.spotifyImport.restoreSettings();
    this.spotifyAuth.restoreSession();
    if (!this.spotifyImport.spotifyClientId && this.spotifyAuth.session) {
      this.spotifyImport.spotifyClientId = this.spotifyAuth.session.clientId;
    }
    void this.#completeSpotifyAuthFromRedirect();

    window.setInterval(() => {
      if (!this.$isBusy() || this.busyStartedAt === null) {
        return;
      }

      const elapsed = Date.now() - this.busyStartedAt;
      if (elapsed > this.busyHardLimitMs) {
        this.#forceResetBusy('Operation exceeded time limit and was reset.');
      }
    }, 2000);
  }

  get selectedCount(): number {
    return this.selectedCardIds.size;
  }

  get spotifyConnected(): boolean {
    return this.spotifyAuth.connected;
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

  currentYear = new Date().getFullYear();

  async saveOrUpdateCard(): Promise<void> {
    if (!this.#validateForm()) {
      return;
    }

    const normalizedUrl = this.form.spotifyUrl.trim();
    if (!this.editingCardId) {
      const isDuplicate = this.cards.some((card) => card.spotifyUrl === normalizedUrl);
      if (isDuplicate) {
        this.toast.push('A card with this Spotify URL already exists.', 'warning');
        return;
      }
    }

    const qrInfo = this.#resolveQrPayload(normalizedUrl, this.qrMode);
    if (!qrInfo.payload) {
      this.toast.push(
        'Could not parse a Spotify track ID. Use a track URL or spotify:track URI.',
        'error',
      );
      return;
    }

    if (qrInfo.warning) {
      this.toast.push(qrInfo.warning, 'warning');
    }

    const qrPayload = qrInfo.payload;

    await this.#withBusy('Generating card...', async () => {
      const qrDataUrl = await this.#qrToDataUrl(qrPayload);
      if (!qrDataUrl) {
        this.toast.push('Unable to generate QR from Spotify URL.', 'error');
        return;
      }

      if (this.editingCardId) {
        const idx = this.cards.findIndex((item) => item.id === this.editingCardId);
        if (idx !== -1) {
          this.cards[idx] = {
            ...this.cards[idx],
            ...this.#formToCardPayload(),
            spotifyTrackId: qrInfo.trackId,
            qrPayload,
            qrMode: this.qrMode,
            qrDataUrl,
          };
        }
        this.toast.push('Card updated.', 'success');
      } else {
        const card: MusicCard = {
          id: Date.now() + Math.floor(Math.random() * 1000),
          ...this.#formToCardPayload(),
          spotifyTrackId: qrInfo.trackId,
          qrPayload,
          qrMode: this.qrMode,
          qrDataUrl,
        };
        this.cards.push(card);
        this.toast.push('Card added.', 'success');
      }

      this.resetForm();
      await this.#persistCards();
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
      difficulty: card.difficulty,
    };
    this.qrMode = 'raw-url';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  askDelete(card: MusicCard): void {
    this.cardPendingDelete = card;
  }

  askDeleteSelected(): void {
    if (this.selectedCardIds.size === 0) {
      this.toast.push('No selected cards to delete.', 'warning');
      return;
    }

    this.selectedDeletePendingCount = this.selectedCardIds.size;
  }

  get isDeleteModalVisible(): boolean {
    return !!this.cardPendingDelete || this.selectedDeletePendingCount > 0;
  }

  get deleteModalTitle(): string {
    return this.cardPendingDelete ? 'Delete card' : 'Delete selected cards';
  }

  get deleteModalMessage(): string {
    if (this.cardPendingDelete) {
      return 'Are you sure you want to remove this card?';
    }

    const count = this.selectedDeletePendingCount;
    return `Are you sure you want to remove ${count} selected card${count === 1 ? '' : 's'}?`;
  }

  cancelDelete(): void {
    this.cardPendingDelete = null;
    this.selectedDeletePendingCount = 0;
  }

  confirmDelete(): void {
    if (this.cardPendingDelete) {
      const id = this.cardPendingDelete.id;
      this.cards = this.cards.filter((card) => card.id !== id);
      this.selectedCardIds.delete(id);
      this.cardPendingDelete = null;
      this.selectedDeletePendingCount = 0;
      void this.#persistCards();
      this.applyFilters();
      this.toast.push('Card deleted.', 'success');
      return;
    }

    if (this.selectedDeletePendingCount > 0) {
      this.selectedDeletePendingCount = 0;
      this.deleteSelectedCards();
    }
  }

  deleteSelectedCards(): void {
    if (this.selectedCardIds.size === 0) {
      this.toast.push('No selected cards to delete.', 'warning');
      return;
    }

    const selectedIds = new Set(this.selectedCardIds);
    const beforeCount = this.cards.length;
    this.cards = this.cards.filter((card) => !selectedIds.has(card.id));
    const deletedCount = beforeCount - this.cards.length;

    this.selectedCardIds.clear();

    if (this.cardPendingDelete && selectedIds.has(this.cardPendingDelete.id)) {
      this.cardPendingDelete = null;
    }

    if (this.editingCardId !== null && selectedIds.has(this.editingCardId)) {
      this.resetForm();
    }

    void this.#persistCards();
    this.applyFilters();
    this.toast.push(
      `Deleted ${deletedCount} selected card${deletedCount === 1 ? '' : 's'}.`,
      'success',
    );
  }

  resetForm(): void {
    this.form = this.#emptyDraft();
    this.editingCardId = null;
    this.#spotifyAutofilledTrackId = null;
    this.$spotifyAutofillLoading.set(false);
    this.#clearSpotifyAutofillTimer();
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
    const previousSpotifyUrl = this.form.spotifyUrl;
    this.form = next;

    if (next.spotifyUrl !== previousSpotifyUrl) {
      this.#queueSpotifyAutofill(next.spotifyUrl);
    }
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

  previousPage(): void {
    this.currentPage = Math.max(1, this.currentPage - 1);
  }

  nextPage(): void {
    this.currentPage = Math.min(this.totalPages, this.currentPage + 1);
  }

  async exportPdf(): Promise<void> {
    const selected = this.selectedCards;
    if (selected.length === 0) {
      this.toast.push('Select at least one card for PDF export.', 'error');
      return;
    }

    await this.#withLoadingFlag(
      (value) => this.$pdfLoading.set(value),
      async () => {
        await this.#withBusy('Exporting PDF...', async () => {
          this.pdfExportService.exportCardsSheetPdf(
            selected,
            this.#buildExportFilename('dupetster-cards-A4', 'pdf'),
          );
          this.toast.push('PDF generated with 3x3 card sheet layout.', 'success');
        });
      },
    );
  }

  async regenerateQrForAllCards(): Promise<void> {
    if (this.cards.length === 0) {
      this.toast.push('No cards available to regenerate.', 'warning');
      return;
    }

    await this.#withBusy('Rebuilding QR cards...', async () => {
      let updated = 0;
      for (const card of this.cards) {
        const qrInfo = this.#resolveQrPayload(card.spotifyUrl, this.qrMode);
        if (!qrInfo.payload) {
          continue;
        }
        const qrDataUrl = await this.#qrToDataUrl(qrInfo.payload);
        if (!qrDataUrl) {
          continue;
        }
        card.spotifyTrackId = qrInfo.trackId;
        card.qrPayload = qrInfo.payload;
        card.qrMode = this.qrMode;
        card.qrDataUrl = qrDataUrl;
        updated += 1;
      }

      await this.#persistCards();
      this.applyFilters();
      this.toast.push(
        `Regenerated ${updated} cards using ${this.getQrModeLabel(this.qrMode)}.`,
        'success',
      );
    });
  }

  async connectSpotifyAccount(): Promise<void> {
    const clientId = this.spotifyClientId.trim();
    if (!clientId) {
      this.toast.push('Provide Spotify Client ID before connecting your account.', 'error');
      return;
    }

    const url = await this.spotifyAuth.prepareConnect(clientId);
    this.spotifyImport.persistSettings();
    window.location.href = url;
  }

  disconnectSpotifyAccount(showToast = true): void {
    this.spotifyAuth.disconnect();
    if (showToast) {
      this.toast.push('Spotify account disconnected.', 'info');
    }
  }

  dismissToast(toastId: number): void {
    this.toast.dismiss(toastId);
  }

  async importFromSpotifyPlaylist(): Promise<void> {
    const tracks = await this.spotifyImport.resolvePlaylistTracks();
    if (tracks) {
      await this.#importSpotifyTracksIntoCards(tracks);
    }
  }

  async importFromSpotifyTrackList(): Promise<void> {
    const result = await this.spotifyImport.resolveTrackListTracks();
    if (!result) {
      return;
    }
    await this.#importSpotifyTracksIntoCards(result.tracks);
    if (result.invalidEntries > 0) {
      this.toast.push(`Skipped ${result.invalidEntries} invalid pasted entries.`, 'warning');
    }
    if (result.missingCount > 0) {
      this.toast.push(
        `Skipped ${result.missingCount} tracks that Spotify did not return.`,
        'warning',
      );
    }
  }

  async importFromPlaylistViaProxy(): Promise<void> {
    const tracks = await this.spotifyImport.resolveProxyTracks();
    if (tracks) {
      await this.#importSpotifyTracksIntoCards(tracks);
    }
  }

  async exportJson(): Promise<void> {
    await this.#withBusy('Exporting JSON...', async () => {
      await this.#yieldToUi();
      this.pdfExportService.downloadJson(
        this.cards,
        this.#buildExportFilename('dupetster-cards', 'json'),
      );
      this.toast.push('JSON exported.', 'success');
    });
  }

  async exportCsv(): Promise<void> {
    await this.#withBusy('Exporting CSV...', async () => {
      await this.#yieldToUi();
      this.pdfExportService.downloadCsv(
        this.cards.map((card) => ({
          title: card.title,
          artist: card.artist,
          year: card.year,
          spotifyUrl: card.spotifyUrl,
          spotifyTrackId: card.spotifyTrackId ?? '',
          qrPayload: card.qrPayload,
          qrMode: card.qrMode,
          difficulty: card.difficulty,
        })),
        this.#buildExportFilename('dupetster-cards', 'csv'),
      );
      this.toast.push('CSV exported.', 'success');
    });
  }

  #buildExportFilename(baseName: string, extension: 'pdf' | 'json' | 'csv'): string {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear()).slice(-2);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const uniqueId = `${day}-${month}-${year}_${hours}-${minutes}-${seconds}`;
    return `${baseName}-${uniqueId}.${extension}`;
  }

  async onImportJson(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      await this.#withBusy('Importing JSON...', async () => {
        const text = await file.text();
        const parsed = JSON.parse(text) as Partial<MusicCard>[];
        const imported = await this.#normalizeImportedCards(parsed);
        await this.#mergeImportedCards(imported, 'JSON');
      });
    } catch {
      this.toast.push('Unable to import JSON file.', 'error');
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
      await this.#withBusy('Importing CSV...', async () => {
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
            difficulty: (row['difficulty'] as Difficulty) ?? 'Original',
          }),
        );

        const imported = await this.#normalizeImportedCards(normalizedSource);
        await this.#mergeImportedCards(imported, 'CSV');
      });
    } catch {
      this.toast.push('Unable to import CSV file.', 'error');
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
    return this.#extractSpotifyTrackId(spotifyUrl) ?? 'Not detected';
  }

  #emptyDraft(): CardDraft {
    return {
      title: '',
      artist: '',
      year: null,
      spotifyUrl: '',
      difficulty: 'Original',
    };
  }

  #formToCardPayload(): {
    title: string;
    artist: string;
    year: number;
    spotifyUrl: string;
    difficulty: Difficulty;
  } {
    return {
      title: this.form.title.trim(),
      artist: this.form.artist.trim(),
      year: Number(this.form.year),
      spotifyUrl: this.form.spotifyUrl.trim(),
      difficulty: this.form.difficulty,
    };
  }

  #validateForm(): boolean {
    if (
      !this.form.title.trim() ||
      !this.form.artist.trim() ||
      !this.form.spotifyUrl.trim() ||
      !this.form.year
    ) {
      this.toast.push('Please fill all required fields.', 'error');
      return false;
    }

    if (Number(this.form.year) < 1400 || Number(this.form.year) > this.currentYear) {
      this.toast.push(`Release year must be between 1400 and ${this.currentYear}.`, 'error');
      return false;
    }

    return true;
  }

  async #normalizeImportedCards(source: Partial<MusicCard>[]): Promise<MusicCard[]> {
    const result: MusicCard[] = [];

    for (const row of source) {
      if (!row.title || !row.artist || !row.spotifyUrl || !row.year) {
        continue;
      }

      const importedMode = this.#normalizeQrMode(row.qrMode);
      const qrInfo = row.qrPayload
        ? {
            payload: String(row.qrPayload),
            trackId:
              row.spotifyTrackId && String(row.spotifyTrackId).trim()
                ? String(row.spotifyTrackId)
                : this.#extractSpotifyTrackId(String(row.spotifyUrl)),
          }
        : this.#resolveQrPayload(String(row.spotifyUrl), importedMode);

      if (!qrInfo.payload) {
        continue;
      }

      const qrDataUrl = await this.#qrToDataUrl(qrInfo.payload);
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
        difficulty: this.#normalizeDifficulty(row.difficulty),
        qrDataUrl,
      });
    }

    return result;
  }

  async #mergeImportedCards(imported: MusicCard[], format: 'JSON' | 'CSV'): Promise<void> {
    const existingUrls = new Set(this.cards.map((c) => c.spotifyUrl));
    const newCards = imported.filter((c) => !existingUrls.has(c.spotifyUrl));
    const skipped = imported.length - newCards.length;
    this.cards.push(...newCards);
    await this.#persistCards();
    this.applyFilters();
    if (newCards.length > 0) {
      const skipNote =
        skipped > 0 ? ` Skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}.` : '';
      this.toast.push(`Imported ${newCards.length} cards from ${format}.${skipNote}`, 'success');
    } else {
      this.toast.push('No new cards imported (all duplicates).', 'warning');
    }
  }

  #normalizeDifficulty(value: unknown): Difficulty {
    if (value === 'Pro' || value === 'Expert') {
      return value;
    }
    return 'Original';
  }

  async #importSpotifyTracksIntoCards(tracks: SpotifyPlaylistTrack[]): Promise<void> {
    await this.#withBusy('Generating cards from playlist...', async () => {
      const existingTrackIds = new Set(
        this.cards.map((card) => card.spotifyTrackId).filter((id): id is string => !!id),
      );

      const total = tracks.length;
      let imported = 0;
      let skipped = 0;
      let processed = 0;

      const updateProgress = async (forceYield = false): Promise<void> => {
        const percent = Math.round((processed / total) * 100);
        this.$busyMessage.set(`Imported ${processed}/${total} (${percent}%)...`);
        if (forceYield || processed % 10 === 0) {
          await this.#yieldToUi();
        }
      };

      await updateProgress(true);

      for (const track of tracks) {
        if (!track.id || existingTrackIds.has(track.id)) {
          skipped += 1;
        } else {
          const canonicalUrl = `https://open.spotify.com/track/${track.id}`;
          const qrInfo = this.#resolveQrPayload(canonicalUrl, this.qrMode);
          if (!qrInfo.payload) {
            skipped += 1;
          } else {
            const qrDataUrl = await this.#qrToDataUrl(qrInfo.payload);
            if (!qrDataUrl) {
              skipped += 1;
            } else {
              this.cards.push({
                id: Date.now() + Math.floor(Math.random() * 100000) + imported,
                title: track.name,
                artist: track.artists.join(', '),
                year: track.year,
                spotifyUrl: canonicalUrl,
                difficulty: this.spotifyImport.spotifyImportDifficulty,
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

      await this.#persistCards();
      this.applyFilters();

      if (imported > 0) {
        this.toast.push(
          `Imported ${imported} tracks from playlist.${skipped > 0 ? ` Skipped ${skipped}.` : ''}`,
          'success',
        );
      } else {
        this.toast.push('No new tracks imported (likely duplicates or invalid tracks).', 'warning');
      }
    });
  }

  #beginBusy(message: string): void {
    if (this.#$busyCount() === 0) {
      this.busyStartedAt = Date.now();
    }
    this.#$busyCount.update((value) => value + 1);
    this.$busyMessage.set(message);
    this.#refreshBusyWatchdog();
  }

  #endBusy(): void {
    this.#$busyCount.update((value) => Math.max(0, value - 1));
    if (this.#$busyCount() === 0) {
      this.$busyMessage.set('');
      this.busyStartedAt = null;
      this.#clearBusyWatchdog();
      return;
    }

    this.#refreshBusyWatchdog();
  }

  async #withBusy<T>(message: string, task: () => Promise<T>): Promise<T> {
    this.#beginBusy(message);
    await this.#yieldToUi();
    try {
      return await task();
    } finally {
      this.#endBusy();
    }
  }

  async #withLoadingFlag<T>(setter: (value: boolean) => void, task: () => Promise<T>): Promise<T> {
    setter(true);
    try {
      return await task();
    } finally {
      setter(false);
    }
  }

  async #yieldToUi(): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }

  #refreshBusyWatchdog(): void {
    this.#clearBusyWatchdog();
    this.busyWatchdogHandle = window.setTimeout(() => {
      this.#forceResetBusy('Operation timeout. Loader was reset automatically.');
    }, this.busyWatchdogMs);
  }

  #clearBusyWatchdog(): void {
    if (this.busyWatchdogHandle !== null) {
      window.clearTimeout(this.busyWatchdogHandle);
      this.busyWatchdogHandle = null;
    }
  }

  #forceResetBusy(message: string): void {
    this.#$busyCount.set(0);
    this.$busyMessage.set('');
    this.busyStartedAt = null;
    this.#clearBusyWatchdog();
    this.toast.push(message, 'warning');
  }

  dismissLoader(): void {
    this.#forceResetBusy('Loader dismissed manually.');
  }

  #normalizeQrMode(value: unknown): QrPayloadMode {
    if (value === 'spotify-uri' || value === 'raw-url') {
      return value;
    }
    return 'canonical-url';
  }

  async #completeSpotifyAuthFromRedirect(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const authError = params.get('error');

    if (!code && !authError) {
      return;
    }

    if (authError) {
      this.toast.push(`Spotify login failed: ${authError}`, 'error');
      this.spotifyAuth.clearAuthQueryFromUrl();
      return;
    }

    const pkceRaw = sessionStorage.getItem(this.spotifyAuth.pkceKey);
    if (!pkceRaw || !state) {
      this.toast.push('Spotify login session expired. Please connect again.', 'error');
      this.spotifyAuth.clearAuthQueryFromUrl();
      return;
    }

    if (!code) {
      this.toast.push('Spotify login response is missing authorization code.', 'error');
      this.spotifyAuth.clearAuthQueryFromUrl();
      return;
    }

    let pkceState: SpotifyPkceState;
    try {
      pkceState = JSON.parse(pkceRaw) as SpotifyPkceState;
    } catch {
      this.toast.push('Invalid Spotify login session. Please connect again.', 'error');
      this.spotifyAuth.clearAuthQueryFromUrl();
      return;
    }

    if (pkceState.state !== state) {
      this.toast.push('Spotify login validation failed (state mismatch).', 'error');
      sessionStorage.removeItem(this.spotifyAuth.pkceKey);
      this.spotifyAuth.clearAuthQueryFromUrl();
      return;
    }

    try {
      await this.#withBusy('Connecting Spotify account...', async () => {
        const session = await this.spotifyAuth.exchangeCode(code, pkceState);
        this.spotifyAuth.session = session;
        this.spotifyClientId = session.clientId;
        this.spotifyAuth.persistSession();
        this.spotifyImport.persistSettings();
      });
      this.toast.push('Spotify account connected.', 'success');
    } catch (error) {
      if (error instanceof SpotifyApiError && error.status === 408) {
        this.toast.push(
          'Spotify login timed out. Please retry and disable browser extensions for this tab if needed.',
          'error',
        );
      } else {
        this.toast.push(
          'Could not complete Spotify login. Verify redirect URI in dashboard.',
          'error',
        );
      }
    } finally {
      sessionStorage.removeItem(this.spotifyAuth.pkceKey);
      this.spotifyAuth.clearAuthQueryFromUrl();
    }
  }

  #extractSpotifyTrackId(input: string): string | null {
    return this.spotifyApiService.extractSpotifyTrackId(input);
  }

  #resolveQrPayload(
    spotifyUrl: string,
    mode: QrPayloadMode,
  ): { payload: string | null; trackId: string | null; warning?: string } {
    const input = spotifyUrl.trim();
    if (!input) {
      return { payload: null, trackId: null };
    }

    const trackId = this.#extractSpotifyTrackId(input);
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

  async #restoreCards(): Promise<void> {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      this.applyFilters();
      return;
    }

    try {
      const parsed = JSON.parse(raw) as MusicCard[];
      this.cards = Array.isArray(parsed) ? parsed : [];

      for (const card of this.cards) {
        const normalizedMode = this.#normalizeQrMode(card.qrMode);
        const existingPayload = card.qrPayload?.trim();
        const resolved = existingPayload
          ? {
              payload: existingPayload,
              trackId: card.spotifyTrackId ?? this.#extractSpotifyTrackId(card.spotifyUrl),
            }
          : this.#resolveQrPayload(card.spotifyUrl, normalizedMode);

        card.qrMode = normalizedMode;
        card.spotifyTrackId = resolved.trackId;
        card.qrPayload = resolved.payload ?? card.spotifyUrl;

        if (!card.qrDataUrl && card.qrPayload) {
          card.qrDataUrl = (await this.#qrToDataUrl(card.qrPayload)) ?? '';
        }
      }

      this.applyFilters();
    } catch {
      this.cards = [];
      this.applyFilters();
    }
  }

  async #persistCards(): Promise<void> {
    localStorage.setItem(this.storageKey, JSON.stringify(this.cards));
  }

  async #qrToDataUrl(text: string): Promise<string | null> {
    return this.qrCodeService.toDataUrl(text);
  }

  #queueSpotifyAutofill(spotifyUrl: string): void {
    this.#clearSpotifyAutofillTimer();

    const trackId = this.#extractSpotifyTrackId(spotifyUrl);
    if (!trackId) {
      this.$spotifyAutofillLoading.set(false);
      return;
    }

    if (trackId === this.#spotifyAutofilledTrackId) {
      this.$spotifyAutofillLoading.set(false);
      return;
    }

    const requestId = ++this.#spotifyAutofillRequestId;
    this.$spotifyAutofillLoading.set(true);

    this.#spotifyAutofillTimer = window.setTimeout(() => {
      void this.#autofillFormFromSpotifyTrack(trackId, requestId);
    }, 550);
  }

  #clearSpotifyAutofillTimer(): void {
    if (this.#spotifyAutofillTimer !== null) {
      window.clearTimeout(this.#spotifyAutofillTimer);
      this.#spotifyAutofillTimer = null;
    }
  }

  async #autofillFormFromSpotifyTrack(trackId: string, requestId: number): Promise<void> {
    try {
      const accessToken = await this.spotifyImport.getTrackLookupToken();
      const details = await this.spotifyApiService.fetchSpotifyTrackDetails(
        trackId,
        accessToken,
        this.spotifyImport.requestTimeoutMs,
      );
      if (!details || requestId !== this.#spotifyAutofillRequestId) {
        return;
      }

      this.zone.run(() => {
        const currentTrackId = this.#extractSpotifyTrackId(this.form.spotifyUrl);
        if (currentTrackId !== trackId) {
          return;
        }

        this.form = {
          ...this.form,
          title: details.name || this.form.title,
          artist: details.artists.join(', ') || this.form.artist,
          year: details.year || this.form.year,
          spotifyUrl: details.spotifyUrl || this.form.spotifyUrl,
        };
      });

      this.#spotifyAutofilledTrackId = trackId;
      this.#spotifyAutofillAuthHintShown = false;
    } catch (error) {
      if (requestId !== this.#spotifyAutofillRequestId) {
        return;
      }

      if (error instanceof SpotifyApiError && error.status === 401) {
        if (!this.#spotifyAutofillAuthHintShown) {
          this.toast.push(
            'Spotify autofill needs a Spotify login or Client ID + Client Secret in the Spotify section.',
            'info',
          );
          this.#spotifyAutofillAuthHintShown = true;
        }
        return;
      }

      this.toast.push('Could not autofill metadata from that Spotify URL.', 'warning');
    } finally {
      if (requestId === this.#spotifyAutofillRequestId) {
        this.$spotifyAutofillLoading.set(false);
      }
    }
  }
}
