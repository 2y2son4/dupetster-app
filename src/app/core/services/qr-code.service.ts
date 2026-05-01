import { Injectable } from '@angular/core';
import QRCode from 'qrcode';

@Injectable({ providedIn: 'root' })
export class QrCodeService {
  async toDataUrl(text: string): Promise<string | null> {
    try {
      return await QRCode.toDataURL(text, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 256,
        color: {
          dark: '#350e41',
          light: '#ffffff',
        },
      });
    } catch {
      return null;
    }
  }
}
