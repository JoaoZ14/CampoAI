import { Router } from 'express';
import {
  handleSignupComplete,
  handleSignupOtpSend,
  handleSignupOtpVerify,
} from '../controllers/signupController.js';
import { otpSendLimiter, otpVerifyLimiter } from '../middleware/rateLimiters.js';

const router = Router();

router.post('/otp/send', otpSendLimiter, handleSignupOtpSend);
router.post('/otp/verify', otpVerifyLimiter, handleSignupOtpVerify);
router.post('/complete', handleSignupComplete);

export default router;
