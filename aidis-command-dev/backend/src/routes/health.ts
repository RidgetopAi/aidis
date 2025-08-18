import { Router } from 'express';
import { getHealth, getDatabaseStatus, getVersion } from '../controllers/healthController';

const router = Router();

// Health check endpoints
router.get('/health', getHealth);
router.get('/db-status', getDatabaseStatus);
router.get('/version', getVersion);

export default router;
