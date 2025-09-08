import { Router } from 'express';
import healthRoutes from './health';
import authRoutes from './auth';
import contextRoutes from './contexts';
import projectRoutes from './projects';
import sessionRoutes from './sessions';
import agentRoutes from './agents';
import taskRoutes from './tasks';
import decisionRoutes from './decisions';
import namingRoutes from './naming';
import dashboardRoutes from './dashboard';
// import monitoringRoutes from './monitoring'; // Debugging

const router = Router();

// Mount route modules
router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/contexts', contextRoutes);
router.use('/projects', projectRoutes);
router.use('/sessions', sessionRoutes);
router.use('/agents', agentRoutes);
router.use('/tasks', taskRoutes);
router.use('/decisions', decisionRoutes);
router.use('/naming', namingRoutes);
router.use('/dashboard', dashboardRoutes);
// router.use('/monitoring', monitoringRoutes); // Debugging

export default router;
