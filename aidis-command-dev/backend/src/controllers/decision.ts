import { Response } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { McpService } from '../services/mcp';

export class DecisionController {
  /**
   * POST /api/decisions - Record new technical decision
   */
  static async recordDecision(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { title, problem, decision, rationale, alternatives } = req.body;

      // Validate required fields
      if (!title || !problem || !decision) {
        res.status(400).json({
          success: false,
          message: 'Title, problem, and decision are required fields'
        });
        return;
      }

      // Call AIDIS MCP decision_record
      const result = await McpService.callTool('decision_record', {
        title,
        problem,
        decision,
        ...(rationale && { rationale }),
        ...(alternatives && { alternatives })
      });
      
      if (!result.success) {
        console.error('AIDIS decision_record failed:', result.error);
        res.status(500).json({
          success: false,
          message: 'Failed to record decision',
          error: result.error
        });
        return;
      }

      res.status(201).json({
        success: true,
        data: result.data,
        message: 'Decision recorded successfully'
      });

    } catch (error) {
      console.error('Record decision error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to record decision',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/decisions - Search technical decisions
   */
  static async searchDecisions(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const {
      query = '',
      project_id,
      status,
      created_by,
      date_from,
      date_to,
      limit = 20,
      offset = 0
      } = req.query;

      // Build search parameters for AIDIS MCP  
      const searchParams: any = {
        query: query || "*", // Default to wildcard search if no query provided
        limit: parseInt(limit as string) || 20
      };

      if (status) searchParams.status = status;
    if (project_id) searchParams.project_id = project_id;
    if (created_by) searchParams.created_by = created_by;
    if (date_from) searchParams.date_from = date_from;
    if (date_to) searchParams.date_to = date_to;

      // Call AIDIS MCP decision_search
      const result = await McpService.callTool('decision_search', searchParams);
      
      if (!result.success) {
        console.error('AIDIS decision_search failed:', result.error);
        res.status(500).json({
          success: false,
          message: 'Failed to search decisions',
          error: result.error
        });
        return;
      }

      const searchResult = result.data;
      
      // Transform the response to match frontend expectations
      const transformedResult = {
        decisions: searchResult.results || [],
        total: searchResult.total || 0,
        page: Math.floor(parseInt(offset as string) / parseInt(limit as string)) + 1,
        limit: parseInt(limit as string)
      };

      res.json({
        success: true,
        data: transformedResult,
        message: `Found ${transformedResult.total} decisions`
      });

    } catch (error) {
      console.error('Decision search error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search decisions',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/decisions/stats - Get decision statistics
   */
  static async getDecisionStats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { project_id } = req.query;

      // Call AIDIS MCP decision_stats
      const result = await McpService.callTool('decision_stats', {
        project_id: project_id || undefined
      });
      
      if (!result.success) {
        console.error('AIDIS decision_stats failed:', result.error);
        res.status(500).json({
          success: false,
          message: 'Failed to get decision statistics',
          error: result.error
        });
        return;
      }

      res.json({
        success: true,
        data: result.data,
        message: 'Decision statistics retrieved'
      });

    } catch (error) {
      console.error('Decision stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get decision statistics',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * GET /api/decisions/:id - Get single decision
   */
  static async getDecision(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // Call AIDIS MCP decision_search with specific ID filter
      const result = await McpService.callTool('decision_search', {
        query: `id:${id}`,
        limit: 1
      });
      
      if (!result.success) {
        console.error('AIDIS decision lookup failed:', result.error);
        res.status(500).json({
          success: false,
          message: 'Failed to get decision',
          error: result.error
        });
        return;
      }

      const searchResult = result.data;
      const decision = searchResult.results?.[0];

      if (!decision) {
        res.status(404).json({
          success: false,
          message: 'Decision not found'
        });
        return;
      }

      res.json({
        success: true,
        data: decision,
        message: 'Decision retrieved'
      });

    } catch (error) {
      console.error('Get decision error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get decision',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * PUT /api/decisions/:id - Update decision
   */
  static async updateDecision(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { outcome, lessons, status } = req.body;

      // Validate input
      if (!outcome && !lessons && !status) {
        res.status(400).json({
          success: false,
          message: 'At least one field (outcome, lessons, status) is required'
        });
        return;
      }

      // Call AIDIS MCP decision_update
      const result = await McpService.callTool('decision_update', {
        decision_id: parseInt(id),
        ...(outcome && { outcome }),
        ...(lessons && { lessons }),
        ...(status && { status })
      });
      
      if (!result.success) {
        console.error('AIDIS decision_update failed:', result.error);
        res.status(500).json({
          success: false,
          message: 'Failed to update decision',
          error: result.error
        });
        return;
      }

      res.json({
        success: true,
        data: result.data,
        message: 'Decision updated successfully'
      });

    } catch (error) {
      console.error('Update decision error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update decision',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * DELETE /api/decisions/:id - Delete decision
   */
  static async deleteDecision(_req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Note: AIDIS doesn't currently have a delete_decision MCP tool
      // For now, return not implemented
      res.status(501).json({
        success: false,
        message: 'Decision deletion not yet implemented',
        error: 'This feature requires AIDIS MCP delete_decision tool'
      });

    } catch (error) {
      console.error('Delete decision error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete decision',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
