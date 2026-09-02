import express from 'express';
import {
  handleBillingOtpSend,
  handleBillingOtpVerify,
  handleCheckoutAfterOtp,
  handleAsaasSubscribe,
  handleCreateSubscriptionRequest,
} from '../controllers/billingController.js';
import { otpSendLimiter, otpVerifyLimiter } from '../middleware/rateLimiters.js';

const router = express.Router();

router.post('/asaas/subscribe', handleAsaasSubscribe);
router.post('/requests', handleCreateSubscriptionRequest);
router.post('/otp/send', otpSendLimiter, handleBillingOtpSend);
router.post('/otp/verify', otpVerifyLimiter, handleBillingOtpVerify);
router.post('/checkout', handleCheckoutAfterOtp);

export default router;
