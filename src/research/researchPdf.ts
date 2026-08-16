export interface ResearchPdfSection {
  heading: string;
  lines: string[];
}

export interface ResearchPdfDocument {
  title: string;
  subtitle?: string;
  imageDataUrl?: string | null;
  sections: ResearchPdfSection[];
  filename: string;
}

function printableText(value: string): string {
  return value
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot/g, ' · ')
    .replace(/\\times/g, ' × ')
    .replace(/\\pi/g, 'π')
    .replace(/\\theta/g, 'θ')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\operatorname\{([^{}]+)\}/g, '$1')
    .replace(/\\mathrm\{([^{}]+)\}/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\\/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function downloadResearchPdf(document: ResearchPdfDocument): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  pdf.setProperties({ title: document.title, subject: 'Math Notebook research export', creator: 'Math Notebook' });
  pdf.setTextColor(62, 52, 46);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text(document.title, margin, 15);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(105, 98, 89);
  pdf.text(document.subtitle ?? `Exported ${new Date().toLocaleString()}`, margin, 21);

  let cursorY = 28;
  if (document.imageDataUrl) {
    const imageWidth = pageWidth - margin * 2;
    const imageHeight = Math.min(120, pageHeight - 74);
    pdf.setDrawColor(212, 206, 196);
    pdf.setFillColor(255, 254, 250);
    pdf.roundedRect(margin, cursorY, imageWidth, imageHeight, 2, 2, 'FD');
    try {
      pdf.addImage(document.imageDataUrl, 'PNG', margin + 1, cursorY + 1, imageWidth - 2, imageHeight - 2, undefined, 'FAST');
    } catch {
      pdf.setTextColor(145, 63, 47);
      pdf.text('The visual preview could not be embedded; complete research details follow.', margin + 5, cursorY + 9);
    }
    cursorY += imageHeight + 7;
  }

  const ensureRoom = (height: number) => {
    if (cursorY + height <= pageHeight - margin) return;
    pdf.addPage('a4', 'landscape');
    cursorY = margin;
  };
  for (const section of document.sections) {
    if (!section.lines.length) continue;
    ensureRoom(18);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(74, 57, 48);
    pdf.text(section.heading, margin, cursorY);
    cursorY += 5;
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(48, 46, 42);
    for (const rawLine of section.lines) {
      const lines = pdf.splitTextToSize(printableText(rawLine), pageWidth - margin * 2) as string[];
      ensureRoom(Math.max(5, lines.length * 4.2));
      pdf.text(lines, margin + 2, cursorY);
      cursorY += Math.max(4.8, lines.length * 4.2);
    }
    cursorY += 3;
  }

  const pages = pdf.getNumberOfPages();
  for (let index = 1; index <= pages; index += 1) {
    pdf.setPage(index);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(130, 123, 114);
    pdf.text(`Math Notebook · ${index}/${pages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
  }
  pdf.save(document.filename.endsWith('.pdf') ? document.filename : `${document.filename}.pdf`);
}
