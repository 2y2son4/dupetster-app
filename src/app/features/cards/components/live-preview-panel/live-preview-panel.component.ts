import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { CardDraft } from '../../../../core/models/card.model';

@Component({
  selector: 'app-live-preview-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './live-preview-panel.component.html',
  styleUrl: './live-preview-panel.component.scss',
})
export class LivePreviewPanelComponent {
  form = input.required<CardDraft>();
  previewQr = input('');
}
