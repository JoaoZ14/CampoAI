import { Router } from 'express';
import {
  handleSignupComplete,
  handleSignupOtpSend,
  handleSignupOtpVerify,
} from '../controllers/signupController.js';
import { otpSendLimiter, otpVerifyLimiter } from '../middleware/rateLimiters.js';
import { requireCustomerAuth } from '../middleware/customerAuth.js';

const router = Router();

router.post('/otp/send', otpSendLimiter, handleSignupOtpSend);
router.post('/otp/verify', otpVerifyLimiter, handleSignupOtpVerify);
router.post('/complete', requireCustomerAuth, handleSignupComplete);

export default router;
