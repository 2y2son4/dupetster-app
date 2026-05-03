import { Injectable, NgZone } from '@angular/core';
import { ToastMessage } from '../models/ui.model';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly durationMs = 2800;

  toasts: ToastMessage[] = [];
  readonly #timerHandles = new Map<number, number>();

  constructor(private readonly zone: NgZone) {}

  push(text: string, type: ToastMessage['type']): void {
    this.zone.run(() => {
      const existing = this.toasts.find((t) => t.text === text && t.type === type);
      if (existing) this.dismiss(existing.id);

      const toast: ToastMessage = { id: Date.now() + Math.random(), text, type };
      this.toasts = [...this.toasts, toast];

      const timer = window.setTimeout(() => this.dismiss(toast.id), this.durationMs);
      this.#timerHandles.set(toast.id, timer);
    });
  }

  dismiss(toastId: number): void {
    this.zone.run(() => {
      const timer = this.#timerHandles.get(toastId);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        this.#timerHandles.delete(toastId);
      }
      this.toasts = this.toasts.filter((t) => t.id !== toastId);
    });
  }
}
