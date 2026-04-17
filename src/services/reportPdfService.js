import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PDFDocument = require('pdfkit');

/**
 * Gera buffer PDF (A4) a partir de texto puro (português).
 * @param {{ title?: string, body: string }} opts
 * @returns {Promise<Buffer>}
 */
export function buildConversationReportPdf({ title, body }) {
  const safeTitle =
    typeof title === 'string' && title.trim()
      ? title.trim().slice(0, 200)
      : 'Relatório — AG Assist';

  const text = String(body ?? '').trim() || '(Sem conteúdo.)';
  const clipped = text.slice(0, 120000);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 56, bottom: 56, left: 50, right: 50 },
      info: {
        Title: safeTitle,
        Author: 'AG Assist',
      },
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).font('Helvetica-Bold').text(safeTitle, { align: 'center' });
    doc.moveDown(1.2);
    doc.fontSize(10).font('Helvetica').fillColor('#444444');
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`, {
      align: 'center',
    });
    doc.moveDown(1.5);
    doc.fillColor('#000000').fontSize(11).font('Helvetica');
    doc.text(clipped, {
      align: 'left',
      width: 495,
    });
    doc.end();
  });
}
