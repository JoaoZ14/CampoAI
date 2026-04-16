import { processIncomingMessage } from '../services/incomingMessageService.js';
import { AppError } from '../utils/errors.js';

/**
 * POST /webhook/whatsapp
 * Body JSON: { phone, message?, imageUrl? }
 */
export async function handleWhatsAppWebhook(req, res, next) {
  try {
    const { phone: rawPhone, message, imageUrl } = req.body ?? {};
    if (
      rawPhone === undefined ||
      rawPhone === null ||
      String(rawPhone).trim() === ''
    ) {
      throw new AppError('Informe um telefone válido no campo "phone".', 400);
    }

    const result = await processIncomingMessage({
      phone: rawPhone,
      message: typeof message === 'string' ? message : undefined,
      imageUrl: typeof imageUrl === 'string' ? imageUrl : undefined,
    });

    return res.status(200).json({
      ok: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}
