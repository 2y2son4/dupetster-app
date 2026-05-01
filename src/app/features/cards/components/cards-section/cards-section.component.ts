import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Difficulty, MusicCard, QrPayloadMode, SortMode } from '../../../../core/models/card.model';

@Component({
  selector: 'app-cards-section',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cards-section.component.html',
})
export class CardsSectionComponent {
  @Input({ required: true }) filteredCards: MusicCard[] = [];
  @Input({ required: true }) pagedCards: MusicCard[] = [];
  @Input({ required: true }) selectedPages: MusicCard[][] = [];
  @Input({ required: true }) selectedCardIds = new Set<number>();
  @Input({ required: true }) difficulties: Difficulty[] = [];
  @Input({ required: true }) searchQuery = '';
  @Input({ required: true }) difficultyFilter = '';
  @Input({ required: true }) sortMode: SortMode = 'recent';
  @Input({ required: true }) selectedCount = 0;
  @Input({ required: true }) allFilteredSelected = false;
  @Input({ required: true }) cardsCount = 0;
  @Input({ required: true }) pdfLoading = false;
  @Input({ required: true }) revealYear = true;
  @Input({ required: true }) totalPages = 1;
  @Input({ required: true }) currentPage = 1;
  @Input() qrModeLabel = '';

  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() difficultyFilterChange = new EventEmitter<string>();
  @Output() sortModeChange = new EventEmitter<SortMode>();
  @Output() toggleSelectAllFiltered = new EventEmitter<void>();
  @Output() exportPdf = new EventEmitter<void>();
  @Output() printSelected = new EventEmitter<void>();
  @Output() exportJson = new EventEmitter<void>();
  @Output() exportCsv = new EventEmitter<void>();
  @Output() regenerateQr = new EventEmitter<void>();
  @Output() importJson = new EventEmitter<Event>();
  @Output() importCsv = new EventEmitter<Event>();
  @Output() toggleSelect = new EventEmitter<number>();
  @Output() editCard = new EventEmitter<MusicCard>();
  @Output() duplicateCard = new EventEmitter<MusicCard>();
  @Output() deleteCard = new EventEmitter<MusicCard>();
  @Output() previousPage = new EventEmitter<void>();
  @Output() nextPage = new EventEmitter<void>();

  isSelected(cardId: number): boolean {
    return this.selectedCardIds.has(cardId);
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
