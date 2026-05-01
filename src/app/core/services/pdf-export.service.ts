import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import * as Papa from 'papaparse';
import { MusicCard } from '../models/card.model';

@Injectable({ providedIn: 'root' })
export class PdfExportService {
  exportCardsSheetPdf(
    cards: MusicCard[],
    revealYear: boolean,
    filename = 'dupetster-cards-sheet.pdf',
  ): void {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const pageHeight = 297;
    const cols = 4;
    const rows = 4;
    const cardWidth = pageWidth / cols;
    const cardHeight = pageHeight / rows;
    const qrSize = 24;
    const cardsPerPage = cols * rows;

    for (let p = 0; p < Math.ceil(cards.length / cardsPerPage); p++) {
      if (p > 0) {
        pdf.addPage();
      }

      const chunk = cards.slice(p * cardsPerPage, (p + 1) * cardsPerPage);
      chunk.forEach((card, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * cardWidth;
        const y = row * cardHeight;
        this.drawPdfCard(pdf, card, x, y, cardWidth, cardHeight, qrSize, revealYear);
      });

      pdf.setDrawColor(0, 0, 0);
      for (let c = 1; c < cols; c++) {
        const x = c * cardWidth;
        pdf.line(x, 0, x, pageHeight);
      }
      for (let r = 1; r < rows; r++) {
        const y = r * cardHeight;
        pdf.line(0, y, pageWidth, y);
      }
    }

    pdf.save(filename);
  }

  downloadJson(data: unknown, filename: string): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    this.downloadBlob(blob, filename);
  }

  downloadCsv(rows: Array<Record<string, string | number>>, filename: string): void {
    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    this.downloadBlob(blob, filename);
  }

  private drawPdfCard(
    pdf: jsPDF,
    card: MusicCard,
    x: number,
    y: number,
    w: number,
    h: number,
    qrSize: number,
    revealYear: boolean,
  ): void {
    const safeInset = 2.2;

    pdf.setFillColor(242, 242, 242);
    pdf.setDrawColor(0, 0, 0);
    pdf.setLineWidth(0.3);
    pdf.rect(x, y, w, h, 'FD');
    pdf.setLineWidth(0.2);
    pdf.rect(x + safeInset, y + safeInset, w - safeInset * 2, h - safeInset * 2, 'S');

    const centerX = x + w / 2;
    const tY = y + safeInset + 9.5;

    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(card.title, centerX, tY, {
      align: 'center',
      maxWidth: w - safeInset * 2 - 4,
    });

    pdf.setFontSize(13);
    pdf.text(revealYear ? String(card.year) : 'YEAR', centerX, tY + 8, { align: 'center' });

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(card.artist, centerX, tY + 16, {
      align: 'center',
      maxWidth: w - safeInset * 2 - 4,
    });

    const splitY = y + h * 0.5 + 1;
    pdf.setLineDashPattern([1, 1], 0);
    pdf.line(x + safeInset + 1, splitY, x + w - safeInset - 1, splitY);

    const qrX = centerX - qrSize / 2;
    const qrY = splitY + 4.5;
    pdf.rect(qrX, qrY, qrSize, qrSize, 'S');
    pdf.setLineDashPattern([], 0);

    if (card.qrDataUrl) {
      pdf.addImage(
        card.qrDataUrl,
        'PNG',
        qrX + 1,
        qrY + 1,
        qrSize - 2,
        qrSize - 2,
        undefined,
        'FAST',
      );
    }
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
