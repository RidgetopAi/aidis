import { Request, Response } from 'express';
import { ContextService, ContextSearchParams } from '../services/context';

export class ContextController {
  /**
   * GET /api/contexts - List contexts with filtering and pagination
   */
  static async searchContexts(req: Request, res: Response): Promise<void> {
    try {
      const params: ContextSearchParams = {
        ...(req.query.query && { query: req.query.query as string }),
        ...(req.query.project_id && { project_id: req.query.project_id as string }),
        ...(req.query.type && { type: req.query.type as string }),
        ...(req.query.tags && { tags: (req.query.tags as string).split(',') }),
        ...(req.query.min_similarity && { min_similarity: parseFloat(req.query.min_similarity as string) }),
        ...(req.query.date_from && { date_from: req.query.date_from as string }),
        ...(req.query.date_to && { date_to: req.query.date_to as string }),
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
        sort_by: (req.query.sort_by as 'created_at' | 'relevance' | 'updated_at') || 'created_at',
        sort_order: (req.query.sort_order as 'asc' | 'desc') || 'desc'
      };

      const result = await ContextService.searchContexts(params);
      
      res.json({
        success: true,
        data: result,
        message: `Found ${result.total} contexts`
      });
    } catch (error) {
      console.error('Search contexts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search contexts',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/contexts/:id - Get single context
   */
  static async getContext(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const context = await ContextService.getContextById(id);

      if (!context) {
        res.status(404).json({
          success: false,
          message: 'Context not found'
        });
        return;
      }

      res.json({
        success: true,
        data: context
      });
    } catch (error) {
      console.error('Get context error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get context',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * PUT /api/contexts/:id - Update context
   */
  static async updateContext(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Validate updates
      const allowedFields = ['content', 'tags', 'metadata', 'relevance_score'];
      const filteredUpdates = Object.keys(updates)
        .filter(key => allowedFields.includes(key))
        .reduce((obj, key) => {
          obj[key] = updates[key];
          return obj;
        }, {} as any);

      if (Object.keys(filteredUpdates).length === 0) {
        res.status(400).json({
          success: false,
          message: 'No valid updates provided'
        });
        return;
      }

      const context = await ContextService.updateContext(id, filteredUpdates);

      if (!context) {
        res.status(404).json({
          success: false,
          message: 'Context not found'
        });
        return;
      }

      res.json({
        success: true,
        data: context,
        message: 'Context updated successfully'
      });
    } catch (error) {
      console.error('Update context error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update context',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/contexts/:id - Delete single context
   */
  static async deleteContext(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deleted = await ContextService.deleteContext(id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          message: 'Context not found'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Context deleted successfully'
      });
    } catch (error) {
      console.error('Delete context error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete context',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/contexts/bulk - Bulk delete contexts
   */
  static async bulkDeleteContexts(req: Request, res: Response): Promise<void> {
    try {
      const { ids } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid or empty context IDs array'
        });
        return;
      }

      const result = await ContextService.bulkDeleteContexts(ids);

      res.json({
        success: true,
        data: result,
        message: `${result.deleted} contexts deleted successfully`
      });
    } catch (error) {
      console.error('Bulk delete contexts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to bulk delete contexts',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/contexts/stats - Get context statistics
   */
  static async getContextStats(req: Request, res: Response): Promise<void> {
    try {
      const project_id = req.query.project_id as string;
      const stats = await ContextService.getContextStats(project_id);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get context stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get context statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/contexts/export - Export contexts
   */
  static async exportContexts(req: Request, res: Response): Promise<void> {
    try {
      const params: ContextSearchParams = {
        ...(req.query.query && { query: req.query.query as string }),
        ...(req.query.project_id && { project_id: req.query.project_id as string }),
        ...(req.query.type && { type: req.query.type as string }),
        ...(req.query.tags && { tags: (req.query.tags as string).split(',') }),
        ...(req.query.date_from && { date_from: req.query.date_from as string }),
        ...(req.query.date_to && { date_to: req.query.date_to as string }),
        sort_by: (req.query.sort_by as 'created_at' | 'relevance' | 'updated_at') || 'created_at',
        sort_order: (req.query.sort_order as 'asc' | 'desc') || 'desc'
      };

      const format = req.query.format as 'json' | 'csv' || 'json';
      const exportData = await ContextService.exportContexts(params, format);

      res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
      res.setHeader('Content-Type', exportData.contentType);
      res.send(exportData.data);
    } catch (error) {
      console.error('Export contexts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export contexts',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/contexts/:id/related - Get related contexts
   */
  static async getRelatedContexts(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      
      const relatedContexts = await ContextService.getRelatedContexts(id, limit);

      res.json({
        success: true,
        data: relatedContexts,
        message: `Found ${relatedContexts.length} related contexts`
      });
    } catch (error) {
      console.error('Get related contexts error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get related contexts',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * POST /api/contexts/search - Advanced semantic search
   */
  static async semanticSearch(req: Request, res: Response): Promise<void> {
    try {
      const params: ContextSearchParams = {
        ...req.body,
        limit: req.body.limit || 20,
        offset: req.body.offset || 0
      };

      const result = await ContextService.searchContexts(params);

      res.json({
        success: true,
        data: result,
        message: `Found ${result.total} contexts matching your search`
      });
    } catch (error) {
      console.error('Semantic search error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to perform semantic search',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
