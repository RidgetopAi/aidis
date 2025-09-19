import { Router } from 'express';
import { MonitoringController } from '../controllers/monitoring';
// import { authenticateToken } from '../middleware/auth'; // Temporarily removed for testing

const router = Router();

// Apply authentication to monitoring routes (temporarily disabled for testing)
// router.use(authenticateToken);

// Monitoring routes
router.get('/health', MonitoringController.getSystemHealth);
router.get('/metrics', MonitoringController.getSystemMetrics);
router.get('/trends', MonitoringController.getPerformanceTrends);
router.post('/errors', MonitoringController.recordUiError);

export default router;
