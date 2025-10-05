/**
 * Session Analytics Controller
 * Business logic extracted from MCP handlers for REST API
 * Part of MCP → REST migration (Phase 2D/2E, Phase 3)
 */

import { Request, Response } from 'express';
import { SessionManagementHandler } from '../../handlers/sessionAnalytics.js';
import { SessionTracker } from '../../services/sessionTracker.js';
import { db } from '../../config/database.js';
import { formatSessionsList, formatSessionStats, formatSessionComparison } from '../../utils/sessionFormatters.js';
import { logger } from '../../utils/logger.js';

/**
 * Session Analytics Controller
 * Provides REST API endpoints for session tracking and analytics
 */
export class SessionAnalyticsController {
  /**
   * Record a session activity
   * POST /api/v2/sessions/:sessionId/activities
   */
  async recordActivity(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { activityType, activityData } = req.body;

      if (!sessionId || !activityType) {
        res.status(400).json({
          success: false,
          error: 'sessionId and activityType are required'
        });
        return;
      }

      const result = await SessionManagementHandler.recordSessionActivity(
        sessionId,
        activityType,
        activityData || {}
      );

      // Extract text from MCP response format
      const textContent = result.content[0].text;

      res.json({
        success: true,
        data: {
          sessionId,
          activityType,
          activityData,
          message: textContent
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to record activity', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error'
      });
    }
  }

  /**
   * Get session activities
   * GET /api/v2/sessions/:sessionId/activities?type=&limit=
   */
  async getActivities(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const activityType = req.query.type as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 100;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'sessionId is required'
        });
        return;
      }

      const result = await SessionManagementHandler.getSessionActivitiesHandler(
        sessionId,
        activityType,
        limit
      );

      // Extract text from MCP response format
      const textContent = result.content[0].text;

      res.json({
        success: true,
        data: {
          sessionId,
          activities: textContent
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get activities', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error'
      });
    }
  }

  /**
   * Record file edit
   * POST /api/v2/sessions/:sessionId/files
   */
  async recordFileEdit(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { filePath, linesAdded, linesDeleted, source } = req.body;

      if (!sessionId || !filePath || isNaN(Number(linesAdded)) || isNaN(Number(linesDeleted))) {
        res.status(400).json({
          success: false,
          error: 'sessionId, filePath, linesAdded, and linesDeleted are required'
        });
        return;
      }

      const result = await SessionManagementHandler.recordFileEdit(
        sessionId,
        filePath,
        Number(linesAdded),
        Number(linesDeleted),
        (source || 'tool') as 'tool' | 'git' | 'manual'
      );

      // Extract text from MCP response format
      const textContent = result.content[0].text;

      res.json({
        success: true,
        data: {
          sessionId,
          filePath,
          linesAdded: Number(linesAdded),
          linesDeleted: Number(linesDeleted),
          netChange: Number(linesAdded) - Number(linesDeleted),
          source: source || 'tool',
          message: textContent
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to record file edit', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error'
      });
    }
  }

  /**
   * Get session files
   * GET /api/v2/sessions/:sessionId/files
   */
  async getFiles(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'sessionId is required'
        });
        return;
      }

      const result = await SessionManagementHandler.getSessionFilesHandler(sessionId);

      // Extract text from MCP response format
      const textContent = result.content[0].text;

      res.json({
        success: true,
        data: {
          sessionId,
          files: textContent
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get files', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error'
      });
    }
  }

  /**
   * Calculate productivity score
   * POST /api/v2/sessions/:sessionId/productivity
   */
  async calculateProductivity(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;
      const { configName } = req.body;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'sessionId is required'
        });
        return;
      }

      const result = await SessionManagementHandler.calculateSessionProductivity(
        sessionId,
        configName || 'default'
      );

      // Extract text from MCP response format
      const textContent = result.content[0].text;

      res.json({
        success: true,
        data: {
          sessionId,
          configName: configName || 'default',
          message: textContent
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to calculate productivity', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error'
      });
    }
  }

  /**
   * List sessions with filters
   * GET /api/v2/sessions?projectId=&dateFrom=&dateTo=...
   */
  async listSessions(req: Request, res: Response): Promise<void> {
    try {
      const {
        projectId,
        dateFrom,
        dateTo,
        tags,
        status,
        agentType,
        hasGoal,
        minProductivity,
        sortBy = 'started_at',
        sortOrder = 'desc',
        limit = 25,
        offset = 0
      } = req.query;

      // Parse tags if provided as comma-separated string
      let parsedTags: string[] | undefined;
      if (tags) {
        parsedTags = typeof tags === 'string' ? tags.split(',') : (tags as string[]);
      }

      // Build WHERE clauses dynamically
      const whereConditions: string[] = [];
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (projectId) {
        whereConditions.push(`s.project_id = $${paramIndex++}`);
        queryParams.push(projectId);
      }

      if (dateFrom) {
        whereConditions.push(`s.started_at >= $${paramIndex++}`);
        queryParams.push(dateFrom);
      }

      if (dateTo) {
        whereConditions.push(`s.started_at <= $${paramIndex++}`);
        queryParams.push(dateTo);
      }

      if (parsedTags && parsedTags.length > 0) {
        whereConditions.push(`s.tags && $${paramIndex++}::text[]`);
        queryParams.push(parsedTags);
      }

      if (status && status !== 'all') {
        whereConditions.push(`s.status = $${paramIndex++}`);
        queryParams.push(status);
      }

      if (agentType) {
        whereConditions.push(`s.agent_type = $${paramIndex++}`);
        queryParams.push(agentType);
      }

      const hasGoalString = String(hasGoal);
      if (hasGoalString === 'true' || hasGoalString === 'TRUE') {
        whereConditions.push(`s.session_goal IS NOT NULL`);
      } else if (hasGoalString === 'false' || hasGoalString === 'FALSE') {
        whereConditions.push(`s.session_goal IS NULL`);
      }

      if (minProductivity !== undefined) {
        whereConditions.push(`s.productivity_score >= $${paramIndex++}`);
        queryParams.push(Number(minProductivity));
      }

      const whereClause = whereConditions.length > 0
        ? 'WHERE ' + whereConditions.join(' AND ')
        : '';

      // Validate sortBy
      const validSortFields = ['started_at', 'duration', 'productivity', 'loc'];
      const safeSortBy = validSortFields.includes(sortBy as string) ? sortBy : 'started_at';
      const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

      // Build ORDER BY clause
      let orderByClause = '';
      if (safeSortBy === 'started_at') {
        orderByClause = `ORDER BY s.started_at ${safeSortOrder}`;
      } else if (safeSortBy === 'duration') {
        orderByClause = `ORDER BY s.duration_minutes ${safeSortOrder}`;
      } else if (safeSortBy === 'productivity') {
        orderByClause = `ORDER BY s.productivity_score ${safeSortOrder} NULLS LAST`;
      } else if (safeSortBy === 'loc') {
        orderByClause = `ORDER BY s.lines_net ${safeSortOrder} NULLS LAST`;
      }

      // Main query
      const query = `
        SELECT * FROM v_session_summaries s
        ${whereClause}
        ${orderByClause}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      queryParams.push(Number(limit), Number(offset));

      const result = await db.query(query, queryParams);

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as count FROM v_session_summaries s
        ${whereClause}
      `;

      const countResult = await db.query(countQuery, queryParams.slice(0, -2));
      const totalCount = parseInt(countResult.rows[0].count);

      // Format output
      const formattedOutput = formatSessionsList(
        result.rows,
        totalCount,
        {
          projectId,
          dateFrom,
          dateTo,
          tags: parsedTags,
          status,
          agentType,
          hasGoal,
          minProductivity,
          sortBy,
          sortOrder
        },
        Number(limit),
        Number(offset)
      );

      res.json({
        success: true,
        data: {
          sessions: result.rows,
          totalCount,
          limit: Number(limit),
          offset: Number(offset),
          formatted: formattedOutput
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to list sessions', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error'
      });
    }
  }

  /**
   * Get session statistics
   * GET /api/v2/sessions/stats?projectId=&period=&groupBy=&phase2Only=
   */
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const {
        projectId,
        period = 'all',
        groupBy = 'none',
        phase2Only = false
      } = req.query;

      // Get enhanced stats
      const stats = await SessionTracker.getSessionStatsEnhanced({
        projectId: projectId as string | undefined,
        period: (period as string) as 'day' | 'week' | 'month' | 'all' | undefined,
        groupBy: (groupBy as string) as 'project' | 'agent' | 'tag' | 'none' | undefined,
        phase2Only: String(phase2Only) === 'true' || String(phase2Only) === 'TRUE'
      });

      // Format output
      const formattedOutput = formatSessionStats(stats, {
        projectId,
        period,
        groupBy,
        phase2Only
      });

      res.json({
        success: true,
        data: {
          stats,
          formatted: formattedOutput
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get session stats', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error'
      });
    }
  }

  /**
   * Compare two sessions
   * GET /api/v2/sessions/compare?sessionId1=&sessionId2=
   */
  async compareSessions(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId1, sessionId2 } = req.query;

      if (!sessionId1 || !sessionId2) {
        res.status(400).json({
          success: false,
          error: 'Both sessionId1 and sessionId2 are required'
        });
        return;
      }

      // Fetch both sessions
      const result = await db.query(`
        SELECT * FROM v_session_summaries
        WHERE id IN ($1, $2)
      `, [sessionId1, sessionId2]);

      if (result.rows.length !== 2) {
        res.status(404).json({
          success: false,
          error: `One or both sessions not found. Session 1: ${sessionId1}, Session 2: ${sessionId2}`
        });
        return;
      }

      // Find which is which
      const session1 = result.rows.find((r: any) => r.id === sessionId1);
      const session2 = result.rows.find((r: any) => r.id === sessionId2);

      if (!session1 || !session2) {
        res.status(404).json({
          success: false,
          error: 'Sessions not found'
        });
        return;
      }

      // Format output
      const formattedOutput = formatSessionComparison(session1, session2);

      res.json({
        success: true,
        data: {
          session1,
          session2,
          formatted: formattedOutput
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to compare sessions', err);
      res.status(500).json({
        success: false,
        error: err.message || 'Unknown error'
      });
    }
  }
}
