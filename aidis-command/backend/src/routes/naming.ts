import { Router } from 'express';
import { NamingController } from '../controllers/naming';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication to all naming routes
router.use(authenticateToken);

// Naming routes
router.get('/', NamingController.searchEntries);
router.get('/stats', NamingController.getNamingStats);
router.get('/check/:name', NamingController.checkNameAvailability);
router.get('/suggest/:name', NamingController.getSuggestions);
router.post('/register', NamingController.registerName);
router.get('/:id', NamingController.getEntry);
router.put('/:id', NamingController.updateEntry);
router.delete('/:id', NamingController.deleteEntry);

export default router;
