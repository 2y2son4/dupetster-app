import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CardDraft,
  Difficulty,
  QrModeOption,
  QrPayloadMode,
} from '../../../../core/models/card.model';

@Component({
  selector: 'app-card-form-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './card-form-panel.component.html',
})
export class CardFormPanelComponent {
  @Input({ required: true }) form!: CardDraft;
  @Input({ required: true }) editingCardId: number | null = null;
  @Input({ required: true }) difficulties: Difficulty[] = [];
  @Input({ required: true }) qrModes: QrModeOption[] = [];
  @Input({ required: true }) qrMode: QrPayloadMode = 'raw-url';
  @Input() detectedTrackId = 'Not detected';

  @Output() formChange = new EventEmitter<CardDraft>();
  @Output() qrModeChange = new EventEmitter<QrPayloadMode>();
  @Output() save = new EventEmitter<void>();
  @Output() clear = new EventEmitter<void>();

  onFieldChange<K extends keyof CardDraft>(key: K, value: CardDraft[K]): void {
    this.formChange.emit({
      ...this.form,
      [key]: value,
    });
  }
}
