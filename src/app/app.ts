import { Component, ViewEncapsulation } from '@angular/core';
import { CardFormPanelComponent } from './features/cards/components/card-form-panel/card-form-panel.component';
import { CardsSectionComponent } from './features/cards/components/cards-section/cards-section.component';
import { LivePreviewPanelComponent } from './features/cards/components/live-preview-panel/live-preview-panel.component';
import { ConfirmModalComponent } from './ui/components/confirm-modal/confirm-modal.component';
import { LoaderOverlayComponent } from './ui/components/loader-overlay/loader-overlay.component';
import { ToastLayerComponent } from './ui/components/toast-layer/toast-layer.component';
import { AppStateService } from './core/services/app-state.service';
import { SpotifyImportPanelComponent } from './features/spotify/components/spotify-import-panel/spotify-import-panel.component';

@Component({
  selector: 'app-root',
  imports: [
    ToastLayerComponent,
    LoaderOverlayComponent,
    ConfirmModalComponent,
    CardFormPanelComponent,
    LivePreviewPanelComponent,
    CardsSectionComponent,
    SpotifyImportPanelComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  encapsulation: ViewEncapsulation.None,
})
export class App {
  constructor(public readonly state: AppStateService) {}
}
