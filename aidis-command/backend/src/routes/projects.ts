import { Router } from 'express';
import { ProjectController } from '../controllers/project';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication to all project routes
router.use(authenticateToken);

// Project routes
router.get('/stats', ProjectController.getProjectStats);
router.get('/sessions/all', ProjectController.getAllSessions);
router.get('/:id/insights', ProjectController.getProjectInsights);
router.get('/:id/sessions', ProjectController.getProjectSessions);
router.get('/:id', ProjectController.getProject);
router.get('/', ProjectController.getAllProjects);
router.post('/', ProjectController.createProject);
router.put('/:id', ProjectController.updateProject);
router.delete('/:id', ProjectController.deleteProject);

export default router;
