import { CommonModule } from '@angular/common';
import { Component, effect, input, output, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import {
  CardDraft,
  Difficulty,
  QrModeOption,
  QrPayloadMode,
} from '../../../../core/models/card.model';

@Component({
  selector: 'app-card-form-panel',
  standalone: true,
  imports: [CommonModule, FormField],
  templateUrl: './card-form-panel.component.html',
})
export class CardFormPanelComponent {
  showSpotifyClientId = false;
  showSpotifyConnectPrompt = false;

  readonly #emptyDraft: CardDraft = {
    title: '',
    artist: '',
    year: null,
    spotifyUrl: '',
    difficulty: 'Original',
  };

  draftModel = signal<CardDraft>(this.#emptyDraft);
  draftForm = form(this.draftModel);
  spotifyAuthModel = signal({ clientId: '' });
  spotifyAuthForm = form(this.spotifyAuthModel);
  qrModeModel = signal<{ mode: QrPayloadMode }>({ mode: 'raw-url' });
  qrModeForm = form(this.qrModeModel);

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

  constructor() {
    effect(
      () => {
        this.draftModel.set(this.form());
        this.spotifyAuthModel.set({ clientId: this.spotifyClientId() });
        this.qrModeModel.set({ mode: this.qrMode() });

        if (this.spotifyConnected()) {
          this.showSpotifyConnectPrompt = false;
        }
      },
      { allowSignalWrites: true },
    );
  }

  openSpotifyConnectPrompt(): void {
    this.showSpotifyConnectPrompt = true;
  }

  submitSpotifyConnect(): void {
    const clientId = this.spotifyAuthModel().clientId.trim();
    if (!clientId) {
      return;
    }

    this.spotifyClientIdChange.emit(clientId);
    this.connectSpotify.emit();
  }

  emitFormChange(): void {
    queueMicrotask(() => {
      this.formChange.emit(this.draftModel());
    });
  }

  emitQrModeChange(): void {
    queueMicrotask(() => {
      this.qrModeChange.emit(this.qrModeModel().mode);
    });
  }

  toggleSpotifyClientIdVisibility(): void {
    this.showSpotifyClientId = !this.showSpotifyClientId;
  }
}
