import express from 'express';
import {
  handleCustomerConfig,
  handleCustomerLinkPhone,
  handleCustomerMe,
  handleCustomerWorkspace,
  handleCustomerProfilePatch,
  handleCustomerSeatAdd,
  handleCustomerSeatRemove,
} from '../controllers/customerPortalController.js';
import { requireCustomerAuth, requireLinkedCustomer } from '../middleware/customerAuth.js';

const router = express.Router();

router.get('/config', handleCustomerConfig);
router.get('/me', requireCustomerAuth, handleCustomerMe);
router.get('/workspace', requireCustomerAuth, handleCustomerWorkspace);
router.post('/link-phone', requireCustomerAuth, handleCustomerLinkPhone);
router.patch('/profile', requireLinkedCustomer, handleCustomerProfilePatch);
router.post('/seats', requireLinkedCustomer, handleCustomerSeatAdd);
router.delete('/seats', requireLinkedCustomer, handleCustomerSeatRemove);

export default router;
