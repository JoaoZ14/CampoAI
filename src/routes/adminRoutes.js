import express from 'express';
import {
  handleAdminAnalytics,
  handleAdminChatMessages,
  handleAdminConfig,
  handleAdminDashboard,
  handleAdminOrganizationsCreate,
  handleAdminOrganizationsList,
  handleAdminOrganizationSeatAdd,
  handleAdminOrganizationSeatRemove,
  handleAdminOrganizationSeats,
  handleAdminOverview,
  handleAdminPatchUser,
  handleAdminPlanCatalog,
  handleAdminPlanCatalogPut,
  handleAdminUsers,
} from '../controllers/adminController.js';
import { requireAdminAuth } from '../middleware/adminAuth.js';

const router = express.Router();

/** Evita 304 / cache do navegador em APIs JSON do painel (dados sempre frescos). */
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

router.get('/api/config', handleAdminConfig);
router.get('/api/overview', requireAdminAuth, handleAdminOverview);
router.get('/api/dashboard', requireAdminAuth, handleAdminDashboard);
router.get('/api/analytics', requireAdminAuth, handleAdminAnalytics);
router.get('/api/chat-messages', requireAdminAuth, handleAdminChatMessages);
router.get('/api/users', requireAdminAuth, handleAdminUsers);
router.patch('/api/users/:userId', requireAdminAuth, handleAdminPatchUser);

router.get('/api/organizations', requireAdminAuth, handleAdminOrganizationsList);
router.post('/api/organizations', requireAdminAuth, handleAdminOrganizationsCreate);
router.get('/api/organizations/:orgId/seats', requireAdminAuth, handleAdminOrganizationSeats);
router.post('/api/organizations/:orgId/seats', requireAdminAuth, handleAdminOrganizationSeatAdd);
router.delete('/api/organizations/:orgId/seats', requireAdminAuth, handleAdminOrganizationSeatRemove);

router.get('/api/plan-catalog', requireAdminAuth, handleAdminPlanCatalog);
router.put('/api/plan-catalog', requireAdminAuth, handleAdminPlanCatalogPut);

export default router;
