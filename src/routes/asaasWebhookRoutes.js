import express from 'express';
import { handleAsaasWebhook } from '../controllers/asaasWebhookController.js';
import { webhookLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/asaas', webhookLimiter, handleAsaasWebhook);

export default router;
