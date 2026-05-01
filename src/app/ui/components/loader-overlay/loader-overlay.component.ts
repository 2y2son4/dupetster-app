import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-loader-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loader-overlay.component.html',
})
export class LoaderOverlayComponent {
  @Input({ required: true }) isBusy = false;
  @Input() busyMessage = '';
  @Output() dismiss = new EventEmitter<void>();
}
