import { randomUUID } from 'node:crypto';
import { createSupabaseClient } from '../models/supabaseClient.js';
import { AppError } from '../utils/errors.js';

function bucketName() {
  return process.env.SUPABASE_REPORTS_BUCKET?.trim() || 'reports';
}

function signedSeconds() {
  const n = Number(process.env.REPORT_PDF_SIGNED_URL_SECONDS);
  if (Number.isFinite(n) && n >= 60 && n <= 86400) return Math.floor(n);
  return 3600;
}

/**
 * Faz upload do PDF e devolve URL assinada (Twilio baixa e envia ao WhatsApp).
 * @param {string} userId
 * @param {Buffer} pdfBuffer
 * @returns {Promise<string>}
 */
export async function uploadReportPdfAndGetSignedUrl(userId, pdfBuffer) {
  const supabase = createSupabaseClient();
  const bucket = bucketName();
  const id = randomUUID();
  const path = `${userId}/${id}.pdf`;

  const { error: upErr } = await supabase.storage.from(bucket).upload(path, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: false,
  });

  if (upErr) {
    console.error('[reports] upload:', upErr.message);
    throw new AppError(
      `Não foi possível salvar o relatório no Supabase (bucket "${bucket}"). Crie o bucket e políticas — ver README.`,
      502
    );
  }

  const { data, error: signErr } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, signedSeconds());

  if (signErr || !data?.signedUrl) {
    console.error('[reports] signed URL:', signErr?.message);
    throw new AppError('Não foi possível gerar link do relatório.', 502);
  }

  return data.signedUrl;
}
