import express from 'express';
import { handleWhatsAppWebhook } from '../controllers/whatsappController.js';
import { handleTwilioInbound } from '../controllers/twilioInboundController.js';
import { validateTwilioSignature } from '../middleware/twilioSignature.js';
import { webhookLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/whatsapp', webhookLimiter, handleWhatsAppWebhook);
router.post('/whatsapp/twilio', webhookLimiter, validateTwilioSignature, handleTwilioInbound);

export default router;
