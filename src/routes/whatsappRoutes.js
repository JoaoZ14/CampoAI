import express from 'express';
import { handleWhatsAppWebhook } from '../controllers/whatsappController.js';
import { handleTwilioInbound } from '../controllers/twilioInboundController.js';
import { validateTwilioSignature } from '../middleware/twilioSignature.js';
import { webhookLimiter } from '../middleware/rateLimiters.js';
import { requireAdminAuth } from '../middleware/adminAuth.js';

const router = express.Router();

router.post('/whatsapp', webhookLimiter, (req,res,next) => {
  if (process.env.AGENT_TOOLS_ENABLED === 'true' || process.env.NODE_ENV === 'production') return requireAdminAuth(req,res,next);
  next();
}, handleWhatsAppWebhook);
router.post('/whatsapp/twilio', webhookLimiter, validateTwilioSignature, handleTwilioInbound);

export default router;
