import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardDraft } from '../../../../core/models/card.model';

@Component({
  selector: 'app-live-preview-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './live-preview-panel.component.html',
  styleUrl: './live-preview-panel.component.scss',
})
export class LivePreviewPanelComponent {
  form = input.required<CardDraft>();
  revealYear = input.required<boolean>();
  previewQr = input('');
  revealYearChange = output<boolean>();
}
