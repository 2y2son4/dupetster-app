import { CommonModule } from '@angular/common';
import { Component, effect, input, output, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { Difficulty, MusicCard, QrPayloadMode, SortMode } from '../../../../core/models/card.model';

@Component({
  selector: 'app-cards-section',
  standalone: true,
  imports: [CommonModule, FormField],
  templateUrl: './cards-section.component.html',
  styleUrl: './cards-section.component.scss',
})
export class CardsSectionComponent {
  filtersModel = signal<{
    searchQuery: string;
    difficultyFilter: string;
    sortMode: SortMode;
  }>({
    searchQuery: '',
    difficultyFilter: '',
    sortMode: 'recent',
  });
  filtersForm = form(this.filtersModel);

  filteredCards = input.required<MusicCard[]>();
  pagedCards = input.required<MusicCard[]>();
  selectedCardIds = input.required<Set<number>>();
  difficulties = input.required<Difficulty[]>();
  searchQuery = input.required<string>();
  difficultyFilter = input.required<string>();
  sortMode = input.required<SortMode>();
  selectedCount = input.required<number>();
  allFilteredSelected = input.required<boolean>();
  cardsCount = input.required<number>();
  pdfLoading = input.required<boolean>();
  totalPages = input.required<number>();
  currentPage = input.required<number>();
  qrModeLabel = input('');

  searchQueryChange = output<string>();
  difficultyFilterChange = output<string>();
  sortModeChange = output<SortMode>();
  toggleSelectAllFiltered = output<void>();
  deleteSelected = output<void>();
  exportPdf = output<void>();
  exportJson = output<void>();
  exportCsv = output<void>();
  regenerateQr = output<void>();
  importJson = output<Event>();
  importCsv = output<Event>();
  toggleSelect = output<number>();
  editCard = output<MusicCard>();
  deleteCard = output<MusicCard>();
  previousPage = output<void>();
  nextPage = output<void>();

  constructor() {
    effect(
      () => {
        this.filtersModel.set({
          searchQuery: this.searchQuery(),
          difficultyFilter: this.difficultyFilter(),
          sortMode: this.sortMode(),
        });
      },
      { allowSignalWrites: true },
    );
  }

  emitSearchQueryChange(): void {
    queueMicrotask(() => {
      this.searchQueryChange.emit(this.filtersModel().searchQuery);
    });
  }

  emitDifficultyFilterChange(): void {
    queueMicrotask(() => {
      this.difficultyFilterChange.emit(this.filtersModel().difficultyFilter);
    });
  }

  emitSortModeChange(): void {
    queueMicrotask(() => {
      this.sortModeChange.emit(this.filtersModel().sortMode);
    });
  }

  isSelected(cardId: number): boolean {
    return this.selectedCardIds().has(cardId);
  }

  trackById(_: number, card: MusicCard): number {
    return card.id;
  }

  onImportJson(event: Event): void {
    this.importJson.emit(event);
  }

  onImportCsv(event: Event): void {
    this.importCsv.emit(event);
  }

  resetFilters(): void {
    const currentSortMode = this.filtersForm.sortMode().value();
    this.filtersModel.set({
      searchQuery: '',
      difficultyFilter: '',
      sortMode: currentSortMode,
    });
    this.searchQueryChange.emit('');
    this.difficultyFilterChange.emit('');
    this.sortModeChange.emit(currentSortMode);
  }
}
