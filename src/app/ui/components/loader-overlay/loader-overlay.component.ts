import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-loader-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loader-overlay.component.html',
  styleUrl: './loader-overlay.component.scss',
})
export class LoaderOverlayComponent {
  isBusy = input.required<boolean>();
  busyMessage = input('');
  dismiss = output<void>();
}
