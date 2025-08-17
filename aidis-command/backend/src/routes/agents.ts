import { Router } from 'express';
import { AgentController } from '../controllers/agent';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication to all agent routes
router.use(authenticateToken);

// Agent management routes
router.get('/tasks', AgentController.getAllTasks);
router.post('/tasks', AgentController.createTask);
router.patch('/tasks/:id', AgentController.updateTask);

router.get('/:id/sessions', AgentController.getAgentSessions);
router.get('/:id/messages', AgentController.getAgentMessages);
router.post('/:id/heartbeat', AgentController.updateHeartbeat);

router.get('/:id', AgentController.getAgent);
router.patch('/:id', AgentController.updateAgent);
router.delete('/:id', AgentController.deleteAgent);

router.get('/', AgentController.getAllAgents);
router.post('/', AgentController.createAgent);

export default router;
