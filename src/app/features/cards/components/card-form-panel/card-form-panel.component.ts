import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
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
  showSpotifyClientId = false;

  form = input.required<CardDraft>();
  editingCardId = input<number | null>(null);
  spotifyClientId = input('');
  spotifyConnected = input(false);
  difficulties = input.required<Difficulty[]>();
  qrModes = input.required<QrModeOption[]>();
  qrMode = input.required<QrPayloadMode>();
  detectedTrackId = input('Not detected');
  spotifyAutofillLoading = input(false);

  formChange = output<CardDraft>();
  spotifyClientIdChange = output<string>();
  qrModeChange = output<QrPayloadMode>();
  connectSpotify = output<void>();
  disconnectSpotify = output<void>();
  save = output<void>();
  clear = output<void>();

  onFieldChange<K extends keyof CardDraft>(key: K, value: CardDraft[K]): void {
    this.formChange.emit({
      ...this.form(),
      [key]: value,
    });
  }

  toggleSpotifyClientIdVisibility(): void {
    this.showSpotifyClientId = !this.showSpotifyClientId;
  }
}
