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
    const maxTextW = w - safeInset * 2 - 4;

    // --- measure each block so they never overlap ---
    const artistFontSize = 8;
    const titleFontSize = 10;
    const yearFontSize = 22;
    // approximate mm per line at each font size (pt → mm with 1.2 leading)
    const artistLineH = artistFontSize * 0.3528 * 1.25;
    const titleLineH = titleFontSize * 0.3528 * 1.25;
    const yearLineH = yearFontSize * 0.3528 * 1.25;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(artistFontSize);
    const artistLines = pdf.splitTextToSize(card.artist, maxTextW) as string[];

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(titleFontSize);
    const titleLines = pdf.splitTextToSize(card.title, maxTextW) as string[];

    const artistBlockH = artistLines.length * artistLineH;
    const titleBlockH = titleLines.length * titleLineH;
    const gapBetween = 2.5; // mm between BAND → SONG
    const gapBeforeYear = 8; // mm between SONG → YEAR

    const totalBlockH = artistBlockH + gapBetween + titleBlockH + gapBeforeYear + yearLineH;

    // vertically centre the block in the upper half (above the divider)
    const splitY = y + h * 0.5 + 1;
    const upperAreaTop = y + safeInset + 1;
    const upperAreaH = splitY - upperAreaTop;
    let curY = upperAreaTop + (upperAreaH - totalBlockH) / 2 + artistLineH;

    // 1 — BAND (bold)
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(artistFontSize);
    pdf.text(artistLines, centerX, curY, { align: 'center' });
    curY += artistBlockH + gapBetween;

    // 2 — SONG NAME (normal)
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(titleFontSize);
    pdf.text(titleLines, centerX, curY, { align: 'center' });
    curY += titleBlockH + gapBeforeYear;

    // 3 — YEAR (big)
    pdf.setFontSize(yearFontSize);
    pdf.text(revealYear ? String(card.year) : 'YEAR', centerX, curY, { align: 'center' });

    pdf.setLineDashPattern([1, 1], 0);
    pdf.line(x + safeInset + 1, splitY, x + w - safeInset - 1, splitY);

    const qrX = centerX - qrSize / 2;
    const qrY = splitY + 4.5;
    pdf.setLineDashPattern([], 0);
    pdf.rect(qrX, qrY, qrSize, qrSize, 'S');

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
