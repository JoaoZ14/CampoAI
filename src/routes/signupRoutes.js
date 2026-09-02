import { Router } from 'express';
import {
  handleSignupComplete,
  handleSignupOtpSend,
  handleSignupOtpVerify,
} from '../controllers/signupController.js';

const router = Router();

router.post('/otp/send', handleSignupOtpSend);
router.post('/otp/verify', handleSignupOtpVerify);
router.post('/complete', handleSignupComplete);

export default router;
