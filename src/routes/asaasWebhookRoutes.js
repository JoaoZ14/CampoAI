import express from 'express';
import { handleAsaasWebhook } from '../controllers/asaasWebhookController.js';

const router = express.Router();

router.post('/asaas', handleAsaasWebhook);

export default router;
