import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Difficulty, MusicCard, QrPayloadMode, SortMode } from '../../../../core/models/card.model';

@Component({
  selector: 'app-cards-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cards-section.component.html',
})
export class CardsSectionComponent {
  filteredCards = input.required<MusicCard[]>();
  pagedCards = input.required<MusicCard[]>();
  selectedPages = input.required<MusicCard[][]>();
  selectedCardIds = input.required<Set<number>>();
  difficulties = input.required<Difficulty[]>();
  searchQuery = input.required<string>();
  difficultyFilter = input.required<string>();
  sortMode = input.required<SortMode>();
  selectedCount = input.required<number>();
  allFilteredSelected = input.required<boolean>();
  cardsCount = input.required<number>();
  pdfLoading = input.required<boolean>();
  revealYear = input.required<boolean>();
  totalPages = input.required<number>();
  currentPage = input.required<number>();
  qrModeLabel = input('');

  searchQueryChange = output<string>();
  difficultyFilterChange = output<string>();
  sortModeChange = output<SortMode>();
  toggleSelectAllFiltered = output<void>();
  exportPdf = output<void>();
  printSelected = output<void>();
  exportJson = output<void>();
  exportCsv = output<void>();
  regenerateQr = output<void>();
  importJson = output<Event>();
  importCsv = output<Event>();
  toggleSelect = output<number>();
  editCard = output<MusicCard>();
  duplicateCard = output<MusicCard>();
  deleteCard = output<MusicCard>();
  previousPage = output<void>();
  nextPage = output<void>();

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
}
