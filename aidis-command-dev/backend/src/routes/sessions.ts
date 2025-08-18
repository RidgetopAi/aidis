import { Router } from 'express';
import { SessionController } from '../controllers/session';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication to all session routes
router.use(authenticateToken);

// Session routes
router.get('/:id', SessionController.getSessionDetail);

export default router;
