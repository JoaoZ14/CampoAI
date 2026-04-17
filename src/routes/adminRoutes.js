import express from 'express';
import {
  handleAdminConfig,
  handleAdminOverview,
  handleAdminUsers,
} from '../controllers/adminController.js';
import { requireAdminAuth } from '../middleware/adminAuth.js';

const router = express.Router();

router.get('/api/config', handleAdminConfig);
router.get('/api/overview', requireAdminAuth, handleAdminOverview);
router.get('/api/users', requireAdminAuth, handleAdminUsers);

export default router;
