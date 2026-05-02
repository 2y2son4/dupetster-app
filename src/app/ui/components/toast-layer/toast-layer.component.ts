import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { ToastMessage } from '../../../core/models/ui.model';

@Component({
  selector: 'app-toast-layer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast-layer.component.html',
})
export class ToastLayerComponent {
  toasts = input.required<ToastMessage[]>();
  dismiss = output<number>();
}
