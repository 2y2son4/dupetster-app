import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Difficulty } from '../../../../core/models/card.model';

@Component({
  selector: 'app-spotify-import-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './spotify-import-panel.component.html',
})
export class SpotifyImportPanelComponent {
  spotifyClientId = input('');
  spotifyClientSecret = input('');
  spotifyPlaylistInput = input('');
  spotifyTrackListInput = input('');
  spotifyImportDifficulty = input<Difficulty>('Original');
  difficulties = input<Difficulty[]>([]);
  spotifyConnected = input(false);
  spotifyImportLoading = input(false);
  proxyImportLoading = input(false);
  spotifyTrackListImportLoading = input(false);

  spotifyClientIdChange = output<string>();
  spotifyClientSecretChange = output<string>();
  spotifyPlaylistInputChange = output<string>();
  spotifyTrackListInputChange = output<string>();
  spotifyImportDifficultyChange = output<Difficulty>();
  connect = output<void>();
  disconnect = output<void>();
  importPlaylist = output<void>();
  importProxy = output<void>();
  importTrackList = output<void>();
}
