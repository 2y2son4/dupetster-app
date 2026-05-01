import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardDraft } from '../../../../core/models/card.model';

@Component({
  selector: 'app-live-preview-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './live-preview-panel.component.html',
})
export class LivePreviewPanelComponent {
  @Input({ required: true }) form!: CardDraft;
  @Input({ required: true }) revealYear = true;
  @Input() previewQr = '';
  @Output() revealYearChange = new EventEmitter<boolean>();
}
