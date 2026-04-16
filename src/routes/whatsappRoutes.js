import express from 'express';
import { handleWhatsAppWebhook } from '../controllers/whatsappController.js';
import { handleTwilioInbound } from '../controllers/twilioInboundController.js';

const router = express.Router();

router.post('/whatsapp', handleWhatsAppWebhook);
router.post('/whatsapp/twilio', handleTwilioInbound);

export default router;
