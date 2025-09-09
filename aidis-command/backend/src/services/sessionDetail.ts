import { db as pool } from '../database/connection';

export interface SessionDetail {
  id: string;
  project_id: string;
  project_name?: string;
  session_type?: string;
  started_at: string;
  ended_at?: string;
  duration_minutes: number;
  
  // Token metrics
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  
  // Activity counts
  contexts_created: number;
  decisions_created: number;
  tasks_created: number;
  tasks_completed: number;
  api_requests: number;
  
  // Detailed activity lists
  contexts: SessionContext[];
  decisions: SessionDecision[];
  tasks: SessionTask[];
  code_components: SessionCodeComponent[];
  
  // Summary
  context_summary?: string;
  productivity_score: number;
}

export interface SessionContext {
  id: string;
  context_type: string;
  content: string;
  tags?: string[];
  created_at: string;
  relevance_score?: number;
}

export interface SessionDecision {
  id: string;
  decision_type: string;
  title: string;
  description?: string;
  status: string;
  impact_level?: string;
  created_at: string;
}

export interface SessionTask {
  id: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  created_at: string;
  completed_at?: string;
}

export interface SessionCodeComponent {
  id: string;
  file_path: string;
  component_type: string;
  name: string;
  lines_of_code: number;
  complexity_score?: number;
  analyzed_at: string;
}

export interface SessionSummary {
  id: string;
  project_name?: string;
  started_at: string;
  duration_minutes: number;
  total_tokens: number;
  contexts_created: number;
  decisions_created: number;
  tasks_created: number;
  tasks_completed: number;
  productivity_score: number;
}

export class SessionDetailService {
  /**
   * Get comprehensive details for a single session
   */
  static async getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
    try {
      // Get basic session info
      const sessionQuery = `
        SELECT 
          s.*,
          p.name as project_name,
          EXTRACT(EPOCH FROM (COALESCE(s.ended_at, CURRENT_TIMESTAMP) - s.started_at)) / 60 as duration_minutes
        FROM user_sessions s
        LEFT JOIN projects p ON s.project_id = p.id
        WHERE s.id = $1
      `;
      
      const sessionResult = await pool.query(sessionQuery, [sessionId]);
      
      if (sessionResult.rows.length === 0) {
        return null;
      }
      
      const session = sessionResult.rows[0];
      
      // Get contexts created during this session
      const contextsQuery = `
        SELECT 
          id,
          context_type,
          content,
          tags,
          created_at,
          relevance_score
        FROM contexts
        WHERE session_id = $1
        ORDER BY created_at DESC
      `;
      
      const contextsResult = await pool.query(contextsQuery, [sessionId]);
      
      // Get decisions made during this session
      const decisionsQuery = `
        SELECT 
          id,
          decision_type,
          title,
          description,
          status,
          impact_level,
          decision_date as created_at
        FROM technical_decisions
        WHERE session_id = $1
        ORDER BY decision_date DESC
      `;
      
      const decisionsResult = await pool.query(decisionsQuery, [sessionId]);
      
      // Get tasks created or worked on during this session
      const tasksQuery = `
        SELECT 
          t.id,
          t.title,
          t.type,
          t.status,
          t.priority,
          t.created_at,
          t.updated_at as completed_at
        FROM tasks t
        WHERE t.created_at BETWEEN $1 AND COALESCE($2, CURRENT_TIMESTAMP)
          AND t.project_id = $3
        ORDER BY t.created_at DESC
      `;
      
      const tasksResult = await pool.query(tasksQuery, [
        session.started_at,
        session.ended_at,
        session.project_id
      ]);
      
      // Get code components analyzed during this session
      const codeQuery = `
        SELECT 
          cc.id,
          cc.file_path,
          cc.component_type,
          cc.name,
          cc.lines_of_code,
          cc.complexity_score,
          cc.analyzed_at
        FROM code_components cc
        WHERE cc.project_id = $1
          AND cc.analyzed_at BETWEEN $2 AND COALESCE($3, CURRENT_TIMESTAMP)
        ORDER BY cc.analyzed_at DESC
      `;
      
      const codeResult = await pool.query(codeQuery, [
        session.project_id,
        session.started_at,
        session.ended_at
      ]);
      
      // Calculate productivity score
      const productivityScore = calculateProductivityScore(
        session.duration_minutes,
        contextsResult.rows.length,
        decisionsResult.rows.length,
        tasksResult.rows.filter(t => t.status === 'completed').length,
        session.total_tokens || 0
      );
      
      return {
        id: session.id,
        project_id: session.project_id,
        project_name: session.project_name,
        session_type: session.session_type,
        started_at: session.started_at,
        ended_at: session.ended_at,
        duration_minutes: Math.round(session.duration_minutes),
        
        total_tokens: session.total_tokens || 0,
        prompt_tokens: session.prompt_tokens || 0,
        completion_tokens: session.completion_tokens || 0,
        
        contexts_created: session.contexts_created || contextsResult.rows.length,
        decisions_created: session.decisions_created || decisionsResult.rows.length,
        tasks_created: session.tasks_created || tasksResult.rows.filter(t => t.created_at >= session.started_at).length,
        tasks_completed: tasksResult.rows.filter(t => t.status === 'completed').length,
        api_requests: session.api_requests || 0,
        
        contexts: contextsResult.rows.map(mapContext),
        decisions: decisionsResult.rows.map(mapDecision),
        tasks: tasksResult.rows.map(mapTask),
        code_components: codeResult.rows.map(mapCodeComponent),
        
        context_summary: session.context_summary,
        productivity_score: productivityScore
      };
    } catch (error) {
      console.error('Get session detail error:', error);
      throw new Error('Failed to get session detail');
    }
  }
  
  /**
   * Get session summaries with activity counts
   */
  static async getSessionSummaries(
    projectId?: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<SessionSummary[]> {
    try {
      const whereClause = projectId ? 'WHERE s.project_id = $3' : '';
      const params = projectId ? [limit, offset, projectId] : [limit, offset];
      
      const query = `
        WITH session_activity AS (
          SELECT 
            s.id,
            s.project_id,
            p.name as project_name,
            s.started_at,
            s.ended_at,
            s.total_tokens,
            s.contexts_created,
            s.decisions_created,
            s.tasks_created,
            EXTRACT(EPOCH FROM (COALESCE(s.ended_at, CURRENT_TIMESTAMP) - s.started_at)) / 60 as duration_minutes,
            (
              SELECT COUNT(*) 
              FROM tasks t 
              WHERE t.project_id = s.project_id
                AND t.status = 'completed'
                AND t.updated_at BETWEEN s.started_at AND COALESCE(s.ended_at, CURRENT_TIMESTAMP)
            ) as tasks_completed
          FROM user_sessions s
          LEFT JOIN projects p ON s.project_id = p.id
          ${whereClause}
        )
        SELECT 
          id,
          project_name,
          started_at,
          duration_minutes,
          COALESCE(total_tokens, 0) as total_tokens,
          COALESCE(contexts_created, 0) as contexts_created,
          COALESCE(decisions_created, 0) as decisions_created,
          COALESCE(tasks_created, 0) as tasks_created,
          COALESCE(tasks_completed, 0) as tasks_completed,
          -- Calculate productivity score
          (COALESCE(contexts_created, 0) * 2.0 + 
           COALESCE(decisions_created, 0) * 3.0 +
           COALESCE(tasks_completed, 0) * 4.0 +
           LEAST(duration_minutes / 60, 8) * 1.5 +
           LEAST(COALESCE(total_tokens, 0) / 1000.0, 10) * 0.5) as productivity_score
        FROM session_activity
        ORDER BY started_at DESC
        LIMIT $1 OFFSET $2
      `;
      
      const result = await pool.query(query, params);
      
      return result.rows.map(row => ({
        id: row.id,
        project_name: row.project_name,
        started_at: row.started_at,
        duration_minutes: Math.round(parseFloat(row.duration_minutes) || 0),
        total_tokens: parseInt(row.total_tokens) || 0,
        contexts_created: parseInt(row.contexts_created) || 0,
        decisions_created: parseInt(row.decisions_created) || 0,
        tasks_created: parseInt(row.tasks_created) || 0,
        tasks_completed: parseInt(row.tasks_completed) || 0,
        productivity_score: Math.round(parseFloat(row.productivity_score) * 10) / 10
      }));
    } catch (error) {
      console.error('Get session summaries error:', error);
      throw new Error('Failed to get session summaries');
    }
  }
  
  /**
   * Get aggregated session statistics by time period
   */
  static async getSessionStatsByPeriod(
    period: 'day' | 'week' | 'month' = 'day',
    projectId?: string,
    limit: number = 30
  ): Promise<any[]> {
    try {
      const periodFormat = {
        day: "DATE(started_at)",
        week: "DATE_TRUNC('week', started_at)",
        month: "DATE_TRUNC('month', started_at)"
      };
      
      const whereClause = projectId ? 'WHERE s.project_id = $2' : '';
      const params = projectId ? [limit, projectId] : [limit];
      
      const query = `
        SELECT 
          ${periodFormat[period]} as period,
          COUNT(DISTINCT s.id) as session_count,
          SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, CURRENT_TIMESTAMP) - s.started_at)) / 60) as total_duration_minutes,
          SUM(COALESCE(s.total_tokens, 0)) as total_tokens,
          SUM(COALESCE(s.contexts_created, 0)) as total_contexts,
          SUM(COALESCE(s.decisions_created, 0)) as total_decisions,
          SUM(COALESCE(s.tasks_created, 0)) as total_tasks_created,
          AVG(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, CURRENT_TIMESTAMP) - s.started_at)) / 60) as avg_duration_minutes
        FROM user_sessions s
        ${whereClause}
        GROUP BY ${periodFormat[period]}
        ORDER BY period DESC
        LIMIT $1
      `;
      
      const result = await pool.query(query, params);
      
      return result.rows.map(row => ({
        period: row.period,
        session_count: parseInt(row.session_count) || 0,
        total_duration_minutes: Math.round(parseFloat(row.total_duration_minutes) || 0),
        total_tokens: parseInt(row.total_tokens) || 0,
        total_contexts: parseInt(row.total_contexts) || 0,
        total_decisions: parseInt(row.total_decisions) || 0,
        total_tasks_created: parseInt(row.total_tasks_created) || 0,
        avg_duration_minutes: Math.round(parseFloat(row.avg_duration_minutes) || 0)
      }));
    } catch (error) {
      console.error('Get session stats by period error:', error);
      throw new Error('Failed to get session statistics by period');
    }
  }
}

// Helper functions
function calculateProductivityScore(
  durationMinutes: number,
  contextsCount: number,
  decisionsCount: number,
  tasksCompleted: number,
  tokensUsed: number
): number {
  // Weighted scoring:
  // - Contexts: 2 points each
  // - Decisions: 3 points each
  // - Tasks completed: 4 points each
  // - Duration: 1.5 points per hour (max 8 hours)
  // - Tokens: 0.5 points per 1000 tokens (max 10k)
  
  const contextScore = contextsCount * 2.0;
  const decisionScore = decisionsCount * 3.0;
  const taskScore = tasksCompleted * 4.0;
  const durationScore = Math.min(durationMinutes / 60, 8) * 1.5;
  const tokenScore = Math.min(tokensUsed / 1000, 10) * 0.5;
  
  const totalScore = contextScore + decisionScore + taskScore + durationScore + tokenScore;
  
  return Math.round(totalScore * 10) / 10;
}

function mapContext(row: any): SessionContext {
  return {
    id: row.id,
    context_type: row.context_type,
    content: row.content,
    tags: row.tags,
    created_at: row.created_at,
    relevance_score: row.relevance_score
  };
}

function mapDecision(row: any): SessionDecision {
  return {
    id: row.id,
    decision_type: row.decision_type,
    title: row.title,
    description: row.description,
    status: row.status,
    impact_level: row.impact_level,
    created_at: row.created_at
  };
}

function mapTask(row: any): SessionTask {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    status: row.status,
    priority: row.priority,
    created_at: row.created_at,
    completed_at: row.completed_at
  };
}

function mapCodeComponent(row: any): SessionCodeComponent {
  return {
    id: row.id,
    file_path: row.file_path,
    component_type: row.component_type,
    name: row.name,
    lines_of_code: row.lines_of_code,
    complexity_score: row.complexity_score,
    analyzed_at: row.analyzed_at
  };
}