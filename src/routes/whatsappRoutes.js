import express from 'express';
import { handleWhatsAppWebhook } from '../controllers/whatsappController.js';
import { handleTwilioInbound } from '../controllers/twilioInboundController.js';

const router = express.Router();

const twilioForm = express.urlencoded({ extended: true, limit: '1mb' });

router.post('/whatsapp', handleWhatsAppWebhook);
router.post('/whatsapp/twilio', twilioForm, handleTwilioInbound);

export default router;
