import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Difficulty } from '../../../../core/models/card.model';

@Component({
  selector: 'app-spotify-import-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './spotify-import-panel.component.html',
})
export class SpotifyImportPanelComponent {
  @Input() spotifyClientId = '';
  @Input() spotifyClientSecret = '';
  @Input() spotifyPlaylistInput = '';
  @Input() spotifyTrackListInput = '';
  @Input() spotifyImportDifficulty: Difficulty = 'Original';
  @Input() difficulties: Difficulty[] = [];
  @Input() spotifyConnected = false;
  @Input() spotifyImportLoading = false;
  @Input() proxyImportLoading = false;
  @Input() spotifyTrackListImportLoading = false;

  @Output() spotifyClientIdChange = new EventEmitter<string>();
  @Output() spotifyClientSecretChange = new EventEmitter<string>();
  @Output() spotifyPlaylistInputChange = new EventEmitter<string>();
  @Output() spotifyTrackListInputChange = new EventEmitter<string>();
  @Output() spotifyImportDifficultyChange = new EventEmitter<Difficulty>();
  @Output() connect = new EventEmitter<void>();
  @Output() disconnect = new EventEmitter<void>();
  @Output() importPlaylist = new EventEmitter<void>();
  @Output() importProxy = new EventEmitter<void>();
  @Output() importTrackList = new EventEmitter<void>();
}
