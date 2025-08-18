import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import { AuthenticatedRequest } from '../types/auth';
import { EmbeddingService } from '../services/EmbeddingService';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// GET /api/embedding/list - Get available datasets
router.get('/list', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const datasets = await EmbeddingService.getAvailableDatasets(
      req.user.id,
      req.headers.project as string
    );
    return res.json(datasets);
  } catch (error) {
    console.error('Error getting embedding datasets:', error);
    return res.status(500).json({ 
      error: 'Failed to get embedding datasets',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/embedding/similarity?id=X&rows=100&cols=100 - Get similarity matrix
router.get('/similarity', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { id, rows = '100', cols = '100' } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Dataset ID is required' });
    }

    const similarity = await EmbeddingService.getSimilarityMatrix(
      req.user.id,
      req.headers.project as string,
      id as string,
      parseInt(rows as string),
      parseInt(cols as string)
    );
    
    return res.json(similarity);
  } catch (error) {
    console.error('Error getting similarity matrix:', error);
    return res.status(500).json({ 
      error: 'Failed to get similarity matrix',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/embedding/projection?id=X&algo=pca&n=1000 - Get 2D/3D projections
router.get('/projection', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { id, algo = 'pca', n = '1000' } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Dataset ID is required' });
    }

    const projection = await EmbeddingService.getProjection(
      req.user.id,
      req.headers.project as string,
      id as string,
      algo as string,
      parseInt(n as string)
    );
    
    return res.json(projection);
  } catch (error) {
    console.error('Error getting projection:', error);
    return res.status(500).json({ 
      error: 'Failed to get projection',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/embedding/cluster?id=X&k=8 - Get clustering results
router.get('/cluster', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { id, k = '8' } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Dataset ID is required' });
    }

    const clusters = await EmbeddingService.getClusters(
      req.user.id,
      req.headers.project as string,
      id as string,
      parseInt(k as string)
    );
    
    return res.json(clusters);
  } catch (error) {
    console.error('Error getting clusters:', error);
    return res.status(500).json({ 
      error: 'Failed to get clusters',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/embedding/metrics?id=X - Get quality metrics
router.get('/metrics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Dataset ID is required' });
    }

    const metrics = await EmbeddingService.getQualityMetrics(
      req.user.id,
      req.headers.project as string,
      id as string
    );
    
    return res.json(metrics);
  } catch (error) {
    console.error('Error getting metrics:', error);
    return res.status(500).json({ 
      error: 'Failed to get metrics',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
