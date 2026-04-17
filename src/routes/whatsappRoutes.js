import express from 'express';
import { handleWhatsAppWebhook } from '../controllers/whatsappController.js';
import { handleZApiInbound } from '../controllers/zapiInboundController.js';

const router = express.Router();

router.post('/whatsapp', handleWhatsAppWebhook);
router.post('/whatsapp/z-api', handleZApiInbound);

export default router;
