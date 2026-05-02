import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import * as Papa from 'papaparse';
import { MusicCard } from '../models/card.model';

@Injectable({ providedIn: 'root' })
export class PdfExportService {
  exportCardsSheetPdf(
    cards: MusicCard[],
    revealYear: boolean,
    filename = 'dupetster-cards-A4.pdf',
  ): void {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = 210;
    const pageHeight = 297;
    const cols = 3;
    const rows = 3;
    const cardWidth = pageWidth / cols;
    const cardHeight = pageHeight / rows;
    const qrSize = 28;
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

      // Draw a single dashed grid once per page to avoid doubled borders
      // where adjacent cards share the same edge.
      pdf.setDrawColor(0, 0, 0);
      pdf.setLineWidth(0.3);
      pdf.setLineDashPattern([1, 1], 0);
      for (let c = 0; c <= cols; c++) {
        const x = c * cardWidth;
        pdf.line(x, 0, x, pageHeight);
      }
      for (let r = 0; r <= rows; r++) {
        const y = r * cardHeight;
        pdf.line(0, y, pageWidth, y);
      }
      pdf.setLineDashPattern([], 0);
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
    pdf.rect(x, y, w, h, 'F');
    pdf.setLineWidth(0.2);
    pdf.rect(x + safeInset, y + safeInset, w - safeInset * 2, h - safeInset * 2, 'S');

    const centerX = x + w / 2;
    const maxTextW = w - safeInset * 2 - 4;

    // Increase base sizes, but adapt down for long names so content still fits.
    const artistBlock = this.fitTextBlock(
      pdf,
      card.artist,
      maxTextW,
      13,
      9,
      2,
      'helvetica',
      'bold',
    );
    const titleBlock = this.fitTextBlock(
      pdf,
      card.title,
      maxTextW,
      15,
      10,
      2,
      'helvetica',
      'normal',
    );
    const yearFontSize = 22;
    const difficultyFontSize = 11;
    // approximate mm per line at each font size (pt → mm with 1.25 leading)
    const artistLineH = artistBlock.lineHeight;
    const titleLineH = titleBlock.lineHeight;
    const yearLineH = yearFontSize * 0.3528 * 1.25;
    const difficultyLineH = difficultyFontSize * 0.3528 * 1.25;

    const artistBlockH = artistBlock.lines.length * artistLineH;
    const titleBlockH = titleBlock.lines.length * titleLineH;
    const gapBetween = 2; // mm between BAND → SONG
    const gapBeforeYear = 6; // mm between SONG → YEAR

    const totalBlockH = artistBlockH + gapBetween + titleBlockH + gapBeforeYear + yearLineH;

    // vertically centre the block in the upper half (above the divider)
    const splitY = y + h * 0.5 + 1;
    const upperAreaTop = y + safeInset + 1;
    const upperAreaH = splitY - upperAreaTop;
    let curY = upperAreaTop + (upperAreaH - totalBlockH) / 2 + artistLineH;

    // 1 — BAND (bold)
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(artistBlock.fontSize);
    pdf.text(artistBlock.lines, centerX, curY, { align: 'center' });
    curY += artistBlockH + gapBetween;

    // 2 — SONG NAME (normal)
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(titleBlock.fontSize);
    pdf.text(titleBlock.lines, centerX, curY, { align: 'center' });
    curY += titleBlockH + gapBeforeYear;

    // 3 — YEAR (big)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(yearFontSize);
    pdf.text(revealYear ? String(card.year) : 'YEAR', centerX, curY, { align: 'center' });

    pdf.setLineDashPattern([1, 1], 0);
    pdf.line(x + safeInset + 1, splitY, x + w - safeInset - 1, splitY);

    const lowerAreaTop = splitY + 3;
    const lowerAreaBottom = y + h - safeInset - 3;
    const lowerAreaH = lowerAreaBottom - lowerAreaTop;
    const gapAfterDifficulty = 3;
    const lowerContentH = difficultyLineH + gapAfterDifficulty + qrSize;
    const lowerStartY = lowerAreaTop + Math.max(0, (lowerAreaH - lowerContentH) / 2);

    // 4 — DIFFICULTY (above QR)
    const difficultyLabel = String(card.difficulty || 'Original').toUpperCase();
    pdf.setLineDashPattern([], 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(difficultyFontSize);
    pdf.text(difficultyLabel, centerX, lowerStartY + difficultyLineH, { align: 'center' });

    const qrX = centerX - qrSize / 2;
    const qrY = lowerStartY + difficultyLineH + gapAfterDifficulty;
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

  private fitTextBlock(
    pdf: jsPDF,
    text: string,
    maxWidth: number,
    startSize: number,
    minSize: number,
    maxLines: number,
    family: string,
    style: string,
  ): { fontSize: number; lines: string[]; lineHeight: number } {
    let fontSize = startSize;
    let lines: string[] = [];

    while (fontSize >= minSize) {
      pdf.setFont(family, style);
      pdf.setFontSize(fontSize);
      lines = pdf.splitTextToSize(text, maxWidth) as string[];
      if (lines.length <= maxLines) {
        break;
      }
      fontSize -= 0.5;
    }

    return {
      fontSize,
      lines,
      lineHeight: fontSize * 0.3528 * 1.25,
    };
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
