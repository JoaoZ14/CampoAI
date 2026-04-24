import express from 'express';
import {
  handleCustomerDashboard,
  handleCustomerLogin,
  handleCustomerSeatAdd,
  handleCustomerSeatRemove,
} from '../controllers/customerPortalController.js';
import { requireCustomerAuth } from '../middleware/customerAuth.js';

const router = express.Router();

router.post('/auth/login', handleCustomerLogin);
router.get('/me', requireCustomerAuth, handleCustomerDashboard);
router.post('/seats', requireCustomerAuth, handleCustomerSeatAdd);
router.delete('/seats', requireCustomerAuth, handleCustomerSeatRemove);

export default router;
