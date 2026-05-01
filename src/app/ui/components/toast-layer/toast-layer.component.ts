import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ToastMessage } from '../../../core/models/ui.model';

@Component({
  selector: 'app-toast-layer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast-layer.component.html',
})
export class ToastLayerComponent {
  @Input({ required: true }) toasts: ToastMessage[] = [];
  @Output() dismiss = new EventEmitter<number>();
}
