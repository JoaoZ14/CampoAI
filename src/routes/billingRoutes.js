import express from 'express';
import {
  handleBillingOtpSend,
  handleBillingOtpVerify,
  handleCheckoutAfterOtp,
  handleAsaasSubscribe,
  handleCreateSubscriptionRequest,
} from '../controllers/billingController.js';

const router = express.Router();

router.post('/asaas/subscribe', handleAsaasSubscribe);
router.post('/requests', handleCreateSubscriptionRequest);
router.post('/otp/send', handleBillingOtpSend);
router.post('/otp/verify', handleBillingOtpVerify);
router.post('/checkout', handleCheckoutAfterOtp);

export default router;
