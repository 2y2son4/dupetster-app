import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-modal.component.html',
})
export class ConfirmModalComponent {
  visible = input.required<boolean>();
  title = input('Confirm');
  message = input('Are you sure?');
  confirmLabel = input('Confirm');
  cancel = output<void>();
  confirm = output<void>();
}
