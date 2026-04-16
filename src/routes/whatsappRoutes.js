import { Router } from 'express';
import { handleWhatsAppWebhook } from '../controllers/whatsappController.js';

const router = Router();

router.post('/whatsapp', handleWhatsAppWebhook);

export default router;
