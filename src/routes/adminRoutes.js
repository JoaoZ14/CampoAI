import express from 'express';
import {
  handleAdminAnalytics,
  handleAdminChatMessages,
  handleAdminConfig,
  handleAdminDashboard,
  handleAdminNews,
  handleAdminNewsRefresh,
  handleAdminOrganizationPatch,
  handleAdminOrganizationsCreate,
  handleAdminOrganizationsList,
  handleAdminOrganizationSeatAdd,
  handleAdminOrganizationSeatRemove,
  handleAdminOrganizationSeats,
  handleAdminOverview,
  handleAdminPatchUser,
  handleAdminPlanCatalog,
  handleAdminPlanCatalogPut,
  handleAdminSettings,
  handleAdminSubscriptionRequests,
  handleAdminUserDetail,
  handleAdminUsers,
} from '../controllers/adminController.js';
import { requireAdminAuth } from '../middleware/adminAuth.js';
import { RuralRepository } from '../rural/repository.js';

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
router.get('/api/users/:userId', requireAdminAuth, handleAdminUserDetail);
router.get('/api/users/:userId/rural', requireAdminAuth, async (req,res,next) => {
  try {
    if(process.env.AGENT_TOOLS_ENABLED !== 'true') return res.status(404).json({ok:false});
    const repo=new RuralRepository();
    const farms=await repo.farms(req.params.userId);
    const actions=await repo.result(repo.db.from('assistant_actions').select('id,tool_name,status,created_at').eq('user_id',req.params.userId).order('created_at',{ascending:false}).limit(30));
    const jobs=await repo.result(repo.db.from('scheduled_jobs').select('id,status,attempts,run_at,last_error').eq('user_id',req.params.userId).order('created_at',{ascending:false}).limit(20));
    res.json({ok:true,farm_count:farms.length,farms:await Promise.all(farms.map(async f=>({id:f.id,field_count:(await repo.all('fields',f.id)).length,recent_operations:(await repo.list('farm_operations',f.id,{},5)).map(o=>({id:o.id,type:o.operation_type,date:o.operation_date}))}))),actions,jobs});
  } catch(e) { next(e); }
});
router.patch('/api/users/:userId', requireAdminAuth, handleAdminPatchUser);

router.get('/api/subscription-requests', requireAdminAuth, handleAdminSubscriptionRequests);
router.get('/api/news', requireAdminAuth, handleAdminNews);
router.post('/api/news/refresh', requireAdminAuth, handleAdminNewsRefresh);
router.get('/api/settings', requireAdminAuth, handleAdminSettings);

router.get('/api/organizations', requireAdminAuth, handleAdminOrganizationsList);
router.post('/api/organizations', requireAdminAuth, handleAdminOrganizationsCreate);
router.patch('/api/organizations/:orgId', requireAdminAuth, handleAdminOrganizationPatch);
router.get('/api/organizations/:orgId/seats', requireAdminAuth, handleAdminOrganizationSeats);
router.post('/api/organizations/:orgId/seats', requireAdminAuth, handleAdminOrganizationSeatAdd);
router.delete('/api/organizations/:orgId/seats', requireAdminAuth, handleAdminOrganizationSeatRemove);

router.get('/api/plan-catalog', requireAdminAuth, handleAdminPlanCatalog);
router.put('/api/plan-catalog', requireAdminAuth, handleAdminPlanCatalogPut);

export default router;
