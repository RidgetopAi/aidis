/**
 * AIDIS Git Handler - TC004 Implementation
 * 
 * Session-Git correlation MCP tools for tracking commit contributions
 * and linking development activity to AIDIS sessions automatically.
 * 
 * Features:
 * - Get commits for a session (git_session_commits)
 * - Get sessions that contributed to a commit (git_commit_sessions)
 * - Manually trigger correlation for current session (git_correlate_session)
 * - Real-time git activity tracking
 * - Confidence-based correlation scoring
 */

import GitServiceModule from '../../../aidis-command/backend/dist/services/gitService.js';
import { SessionDetailService } from '../../../aidis-command/backend/dist/services/sessionDetail.js';
import { db } from '../config/database.js';
import { logEvent } from '../middleware/eventLogger.js';
import { getCurrentSession } from '../services/sessionManager.js';

// The compiled gitService module exports both `GitService` and `default` in CommonJS format.
// When imported from ESM (the MCP server), Node returns the module namespace object.
// Normalize the export here so downstream code always works with the class itself.
const GitService = (GitServiceModule as any)?.GitService
  ?? (GitServiceModule as any)?.default
  ?? GitServiceModule;

export interface GitSessionCommitsParams {
  sessionId?: string; // If not provided, uses current session
  includeDetails?: boolean; // Include full commit details
  confidenceThreshold?: number; // Minimum confidence score (0.0-1.0)
}

export interface GitCommitSessionsParams {
  commitSha: string;
  includeDetails?: boolean; // Include session details
}

export interface GitCorrelateSessionParams {
  sessionId?: string; // If not provided, uses current session
  projectId?: string; // If not provided, uses session's project
  forceRefresh?: boolean; // Recalculate existing correlations
  confidenceThreshold?: number; // Minimum confidence (default 0.3)
}

export interface CommitInfo {
  id: string;
  commit_sha: string;
  short_sha: string;
  message: string;
  author_name: string;
  author_email: string;
  author_date: string;
  branch_name?: string;
  confidence_score: number;
  link_type: string;
  time_proximity_minutes?: number;
  author_match: boolean;
  files_changed?: number;
  insertions?: number;
  deletions?: number;
}

export interface SessionInfo {
  id: string;
  session_type: string;
  started_at: string;
  ended_at?: string;
  duration_minutes: number;
  project_name?: string;
  confidence_score: number;
  link_type: string;
  contexts_created?: number;
  decisions_created?: number;
}

/**
 * Git Session Correlation Handler Class
 */
export class GitHandler {
  
  /**
   * Get all commits linked to a session with correlation details
   */
  static async gitSessionCommits(params: GitSessionCommitsParams): Promise<{
    success: boolean;
    sessionId: string;
    commits: CommitInfo[];
    totalCommits: number;
    avgConfidence: number;
    timeRange?: { start: string; end: string };
    error?: string;
  }> {
    try {
      // Get session ID (current session if not provided)
      let sessionId = params.sessionId;
      if (!sessionId) {
        sessionId = await getCurrentSession() || undefined;
        if (!sessionId) {
          throw new Error('No active session found. Please start a session or provide sessionId.');
        }
      }

      console.log(`📊 Getting commits for session: ${sessionId.substring(0, 8)}...`);
      
      // Log the request
      await logEvent({
        actor: 'ai',
        session_id: sessionId,
        event_type: 'git_session_commits_request',
        status: 'open',
        metadata: {
          includeDetails: params.includeDetails,
          confidenceThreshold: params.confidenceThreshold
        },
        tags: ['git', 'correlation', 'session_commits']
      });

      const startTime = Date.now();
      const confidenceThreshold = params.confidenceThreshold || 0.0;

      // Get session details for time range
      const sessionQuery = `
        SELECT started_at, ended_at, project_id
        FROM user_sessions 
        WHERE id = $1
        UNION ALL
        SELECT started_at, ended_at, project_id
        FROM sessions 
        WHERE id = $1
      `;
      
      const sessionResult = await db.query(sessionQuery, [sessionId]);
      
      if (sessionResult.rows.length === 0) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      const session = sessionResult.rows[0];

      // Build query for commits linked to this session
      let commitsQuery = `
        SELECT 
          gc.id,
          gc.commit_sha,
          gc.short_sha,
          gc.message,
          gc.author_name,
          gc.author_email,
          gc.author_date,
          gc.branch_name,
          csl.confidence_score,
          csl.link_type,
          csl.time_proximity_minutes,
          csl.author_match
      `;

      if (params.includeDetails) {
        commitsQuery += `,
          gc.files_changed,
          gc.insertions,
          gc.deletions
        `;
      }

      commitsQuery += `
        FROM git_commits gc
        JOIN commit_session_links csl ON gc.id = csl.commit_id
        WHERE csl.session_id = $1
      `;

      const queryParams: (string | number)[] = [sessionId];

      if (confidenceThreshold > 0) {
        commitsQuery += ` AND csl.confidence_score >= $2`;
        queryParams.push(confidenceThreshold);
      }

      commitsQuery += ` ORDER BY gc.author_date DESC`;

      const commitsResult = await db.query(commitsQuery, queryParams);
      
      // Calculate statistics
      const commits = commitsResult.rows.map(row => ({
        id: row.id,
        commit_sha: row.commit_sha,
        short_sha: row.short_sha,
        message: row.message,
        author_name: row.author_name,
        author_email: row.author_email,
        author_date: row.author_date,
        branch_name: row.branch_name,
        confidence_score: parseFloat(row.confidence_score) || 0,
        link_type: row.link_type,
        time_proximity_minutes: row.time_proximity_minutes,
        author_match: row.author_match || false,
        ...(params.includeDetails && {
          files_changed: row.files_changed || 0,
          insertions: row.insertions || 0,
          deletions: row.deletions || 0
        })
      }));

      const avgConfidence = commits.length > 0 
        ? commits.reduce((sum, c) => sum + c.confidence_score, 0) / commits.length
        : 0;

      const duration = Date.now() - startTime;

      // Log success
      await logEvent({
        actor: 'ai',
        session_id: sessionId,
        event_type: 'git_session_commits_completed',
        status: 'closed',
        duration_ms: duration,
        metadata: {
          totalCommits: commits.length,
          avgConfidence: Math.round(avgConfidence * 100) / 100,
          confidenceThreshold
        },
        tags: ['git', 'correlation', 'session_commits', 'completed']
      });

      console.log(`✅ Found ${commits.length} commits for session in ${duration}ms`);
      console.log(`   Average confidence: ${Math.round(avgConfidence * 100)}%`);

      return {
        success: true,
        sessionId,
        commits,
        totalCommits: commits.length,
        avgConfidence: Math.round(avgConfidence * 100) / 100,
        ...(session.started_at && {
          timeRange: {
            start: session.started_at,
            end: session.ended_at || new Date().toISOString()
          }
        })
      };

    } catch (error) {
      console.error('❌ Failed to get session commits:', error);
      
      // Log error
      await logEvent({
        actor: 'ai',
        session_id: params.sessionId,
        event_type: 'git_session_commits_error',
        status: 'error',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        tags: ['git', 'correlation', 'session_commits', 'error']
      });

      return {
        success: false,
        sessionId: params.sessionId || 'unknown',
        commits: [],
        totalCommits: 0,
        avgConfidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get all sessions that contributed to a specific commit
   */
  static async gitCommitSessions(params: GitCommitSessionsParams): Promise<{
    success: boolean;
    commitSha: string;
    commit?: CommitInfo;
    sessions: SessionInfo[];
    totalSessions: number;
    avgConfidence: number;
    error?: string;
  }> {
    try {
      console.log(`🔍 Getting sessions for commit: ${params.commitSha.substring(0, 12)}...`);
      
      // Log the request
      await logEvent({
        actor: 'ai',
        event_type: 'git_commit_sessions_request',
        status: 'open',
        metadata: {
          commitSha: params.commitSha,
          includeDetails: params.includeDetails
        },
        tags: ['git', 'correlation', 'commit_sessions']
      });

      const startTime = Date.now();

      // Get commit details first
      const commitQuery = `
        SELECT 
          gc.id,
          gc.commit_sha,
          gc.short_sha,
          gc.message,
          gc.author_name,
          gc.author_email,
          gc.author_date,
          gc.branch_name,
          gc.files_changed,
          gc.insertions,
          gc.deletions
        FROM git_commits gc
        WHERE gc.commit_sha = $1 OR gc.commit_sha LIKE $2
      `;

      const commitResult = await db.query(commitQuery, [
        params.commitSha,
        `${params.commitSha}%`
      ]);

      if (commitResult.rows.length === 0) {
        throw new Error(`Commit ${params.commitSha} not found`);
      }

      const commit = commitResult.rows[0];

      // Get sessions linked to this commit
      let sessionsQuery = `
        SELECT 
          COALESCE(us.id, s.id) as id,
          COALESCE(us.started_at, s.started_at) as started_at,
          COALESCE(us.ended_at, s.ended_at) as ended_at,
          COALESCE('web', s.agent_type) as session_type,
          p.name as project_name,
          csl.confidence_score,
          csl.link_type,
          EXTRACT(EPOCH FROM (COALESCE(us.ended_at, s.ended_at, CURRENT_TIMESTAMP) - COALESCE(us.started_at, s.started_at))) / 60 as duration_minutes
      `;

      if (params.includeDetails) {
        sessionsQuery += `,
          COALESCE(us.contexts_created, 0) as contexts_created,
          COALESCE(us.decisions_created, 0) as decisions_created
        `;
      }

      sessionsQuery += `
        FROM commit_session_links csl
        LEFT JOIN user_sessions us ON csl.session_id = us.id
        LEFT JOIN sessions s ON csl.session_id = s.id AND us.id IS NULL
        LEFT JOIN projects p ON COALESCE(us.project_id, s.project_id) = p.id
        WHERE csl.commit_id = $1
        ORDER BY csl.confidence_score DESC, COALESCE(us.started_at, s.started_at) DESC
      `;

      const sessionsResult = await db.query(sessionsQuery, [commit.id]);

      // Map session results
      const sessions = sessionsResult.rows.map(row => ({
        id: row.id,
        session_type: row.session_type || 'unknown',
        started_at: row.started_at,
        ended_at: row.ended_at,
        duration_minutes: Math.round(parseFloat(row.duration_minutes) || 0),
        project_name: row.project_name,
        confidence_score: parseFloat(row.confidence_score) || 0,
        link_type: row.link_type,
        ...(params.includeDetails && {
          contexts_created: parseInt(row.contexts_created) || 0,
          decisions_created: parseInt(row.decisions_created) || 0
        })
      }));

      const avgConfidence = sessions.length > 0 
        ? sessions.reduce((sum, s) => sum + s.confidence_score, 0) / sessions.length
        : 0;

      const duration = Date.now() - startTime;

      // Log success
      await logEvent({
        actor: 'ai',
        event_type: 'git_commit_sessions_completed',
        status: 'closed',
        duration_ms: duration,
        metadata: {
          commitSha: params.commitSha,
          totalSessions: sessions.length,
          avgConfidence: Math.round(avgConfidence * 100) / 100
        },
        tags: ['git', 'correlation', 'commit_sessions', 'completed']
      });

      console.log(`✅ Found ${sessions.length} sessions for commit in ${duration}ms`);
      console.log(`   Average confidence: ${Math.round(avgConfidence * 100)}%`);

      return {
        success: true,
        commitSha: params.commitSha,
        commit: {
          id: commit.id,
          commit_sha: commit.commit_sha,
          short_sha: commit.short_sha,
          message: commit.message,
          author_name: commit.author_name,
          author_email: commit.author_email,
          author_date: commit.author_date,
          branch_name: commit.branch_name,
          confidence_score: 1.0, // Commit itself has full confidence
          link_type: 'commit',
          time_proximity_minutes: 0,
          author_match: true,
          files_changed: commit.files_changed,
          insertions: commit.insertions,
          deletions: commit.deletions
        },
        sessions,
        totalSessions: sessions.length,
        avgConfidence: Math.round(avgConfidence * 100) / 100
      };

    } catch (error) {
      console.error('❌ Failed to get commit sessions:', error);
      
      // Log error
      await logEvent({
        actor: 'ai',
        event_type: 'git_commit_sessions_error',
        status: 'error',
        metadata: {
          commitSha: params.commitSha,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        tags: ['git', 'correlation', 'commit_sessions', 'error']
      });

      return {
        success: false,
        commitSha: params.commitSha,
        sessions: [],
        totalSessions: 0,
        avgConfidence: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Manually trigger git correlation for current or specified session
   */
  static async gitCorrelateSession(params: GitCorrelateSessionParams): Promise<{
    success: boolean;
    sessionId: string;
    projectId?: string;
    linksCreated: number;
    linksUpdated: number;
    highConfidenceLinks: number;
    avgConfidence: number;
    processingTimeMs: number;
    correlationStats?: {
      authorMatches: number;
      timeProximityMatches: number;
      contentSimilarityMatches: number;
    };
    error?: string;
  }> {
    try {
      // Get session ID (current session if not provided)
      let sessionId = params.sessionId;
      if (!sessionId) {
        sessionId = await getCurrentSession() || undefined;
        if (!sessionId) {
          throw new Error('No active session found. Please start a session or provide sessionId.');
        }
      }

      console.log(`🔗 Triggering git correlation for session: ${sessionId.substring(0, 8)}...`);
      
      // Log the request
      await logEvent({
        actor: 'ai',
        session_id: sessionId,
        event_type: 'git_correlate_session_request',
        status: 'open',
        metadata: {
          forceRefresh: params.forceRefresh,
          confidenceThreshold: params.confidenceThreshold
        },
        tags: ['git', 'correlation', 'manual_trigger']
      });

      const startTime = Date.now();

      // Use SessionDetailService correlation method
      const correlationResult = await SessionDetailService.correlateSessionWithGit(sessionId);

      if (!correlationResult.success) {
        throw new Error(correlationResult.message);
      }

      // Get additional correlation statistics from GitService if we have projectId
      let correlationStats;
      let projectId = params.projectId;
      
      if (!projectId) {
        // Get project from session
        const sessionQuery = `
          SELECT project_id FROM user_sessions WHERE id = $1
          UNION ALL
          SELECT project_id FROM sessions WHERE id = $1
        `;
        const sessionResult = await db.query(sessionQuery, [sessionId]);
        projectId = sessionResult.rows[0]?.project_id;
      }

      if (projectId) {
        try {
          const gitCorrelationResult = await GitService.correlateCommitsWithSessions({
            project_id: projectId,
            confidence_threshold: params.confidenceThreshold || 0.3
          });

          correlationStats = {
            authorMatches: gitCorrelationResult.correlation_stats.author_matches,
            timeProximityMatches: gitCorrelationResult.correlation_stats.time_proximity_matches,
            contentSimilarityMatches: gitCorrelationResult.correlation_stats.content_similarity_matches
          };
        } catch (error) {
          console.warn('Could not get detailed correlation stats:', error);
        }
      }

      const processingTimeMs = Date.now() - startTime;

      // Log success
      await logEvent({
        actor: 'ai',
        session_id: sessionId,
        event_type: 'git_correlate_session_completed',
        status: 'closed',
        duration_ms: processingTimeMs,
        metadata: {
          linksCreated: correlationResult.linksCreated,
          linksUpdated: correlationResult.linksUpdated,
          confidence: correlationResult.confidence
        },
        tags: ['git', 'correlation', 'manual_trigger', 'completed']
      });

      console.log(`✅ Git correlation completed in ${processingTimeMs}ms`);
      console.log(`   Links: ${correlationResult.linksCreated} created, ${correlationResult.linksUpdated} updated`);
      console.log(`   Confidence: ${Math.round(correlationResult.confidence * 100)}%`);

      return {
        success: true,
        sessionId,
        projectId,
        linksCreated: correlationResult.linksCreated,
        linksUpdated: correlationResult.linksUpdated,
        highConfidenceLinks: correlationResult.confidence > 0.7 ? 1 : 0,
        avgConfidence: Math.round(correlationResult.confidence * 100) / 100,
        processingTimeMs,
        correlationStats
      };

    } catch (error) {
      console.error('❌ Failed to correlate session with git:', error);
      
      // Log error
      await logEvent({
        actor: 'ai',
        session_id: params.sessionId,
        event_type: 'git_correlate_session_error',
        status: 'error',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        tags: ['git', 'correlation', 'manual_trigger', 'error']
      });

      return {
        success: false,
        sessionId: params.sessionId || 'unknown',
        linksCreated: 0,
        linksUpdated: 0,
        highConfidenceLinks: 0,
        avgConfidence: 0,
        processingTimeMs: Date.now() - (Date.now()),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Real-time git tracking - detect recent commits during active session
   */
  static async trackRealtimeGitActivity(): Promise<{
    success: boolean;
    sessionId?: string;
    recentCommits: number;
    autoCorrelated: boolean;
    error?: string;
  }> {
    try {
      console.log('⚡ Checking for real-time git activity...');
      
      // Get current active session
      const sessionId = await getCurrentSession();
      if (!sessionId) {
        return {
          success: true,
          recentCommits: 0,
          autoCorrelated: false,
          error: 'No active session - git tracking inactive'
        };
      }

      // Get session project
      const sessionQuery = `
        SELECT project_id, started_at 
        FROM user_sessions WHERE id = $1
        UNION ALL
        SELECT project_id, started_at 
        FROM sessions WHERE id = $1
      `;
      const sessionResult = await db.query(sessionQuery, [sessionId]);
      
      if (sessionResult.rows.length === 0 || !sessionResult.rows[0].project_id) {
        return {
          success: true,
          sessionId,
          recentCommits: 0,
          autoCorrelated: false,
          error: 'Session not assigned to project'
        };
      }

      const session = sessionResult.rows[0];
      
      // Check for commits in the last 5 minutes
      const recentCommitsResult = await GitService.getRecentCommits({
        project_id: session.project_id,
        hours: 0.083, // 5 minutes
      });

      if (recentCommitsResult.commits.length > 0) {
        console.log(`🔄 Found ${recentCommitsResult.commits.length} recent commits, triggering auto-correlation`);
        
        // Auto-correlate recent commits
        await SessionDetailService.correlateSessionWithGit(sessionId);
        
        return {
          success: true,
          sessionId,
          recentCommits: recentCommitsResult.commits.length,
          autoCorrelated: true
        };
      }

      return {
        success: true,
        sessionId,
        recentCommits: 0,
        autoCorrelated: false
      };

    } catch (error) {
      console.error('❌ Real-time git tracking error:', error);
      return {
        success: false,
        recentCommits: 0,
        autoCorrelated: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

/**
 * Utility functions for external usage
 */

/**
 * Simple function to get session commits
 */
export async function getSessionCommits(sessionId?: string): Promise<CommitInfo[]> {
  try {
    const result = await GitHandler.gitSessionCommits({ sessionId });
    return result.success ? result.commits : [];
  } catch (error) {
    console.error('❌ Failed to get session commits:', error);
    return [];
  }
}

/**
 * Simple function to get commit sessions
 */
export async function getCommitSessions(commitSha: string): Promise<SessionInfo[]> {
  try {
    const result = await GitHandler.gitCommitSessions({ commitSha });
    return result.success ? result.sessions : [];
  } catch (error) {
    console.error('❌ Failed to get commit sessions:', error);
    return [];
  }
}

/**
 * Simple function to trigger session correlation
 */
export async function correlateCurrentSession(): Promise<boolean> {
  try {
    const result = await GitHandler.gitCorrelateSession({});
    return result.success;
  } catch (error) {
    console.error('❌ Failed to correlate current session:', error);
    return false;
  }
}

/**
 * TC013 Pattern Detection Integration Functions
 */

/**
 * Trigger pattern detection for recent commits
 */
export async function detectPatternsForRecentCommits(params: {
  projectId?: string;
  sessionId?: string;
  commitLimitCount?: number;
  realTime?: boolean;
}): Promise<{
  success: boolean;
  detectionResult?: any;
  error?: string;
}> {
  try {
    console.log('🔍 Triggering pattern detection for recent commits...');

    const sessionId = params.sessionId || await getCurrentSession();
    if (!sessionId) {
      throw new Error('No active session found');
    }

    // Get project ID
    let projectId = params.projectId;
    if (!projectId) {
      const sessionQuery = `
        SELECT project_id FROM user_sessions WHERE id = $1
        UNION ALL
        SELECT project_id FROM sessions WHERE id = $1
      `;
      
      const sessionResult = await db.query(sessionQuery, [sessionId]);
      if (sessionResult.rows.length === 0 || !sessionResult.rows[0].project_id) {
        throw new Error('Session not assigned to project');
      }
      projectId = sessionResult.rows[0].project_id;
    }

    // Get recent commits for the project
    const commitLimit = params.commitLimitCount || 10;
    const recentCommitsQuery = `
      SELECT commit_sha
      FROM git_commits
      WHERE project_id = $1
      ORDER BY author_date DESC
      LIMIT $2
    `;
    
    const commitsResult = await db.query(recentCommitsQuery, [projectId, commitLimit]);
    const commitShas = commitsResult.rows.map(row => row.commit_sha);

    if (commitShas.length === 0) {
      return {
        success: true,
        detectionResult: {
          message: 'No commits found for pattern detection',
          patternsFound: 0
        }
      };
    }

    // Trigger pattern detection
    let detectionResult;
    if (params.realTime) {
      // Buffer commits for real-time processing
      bufferCommitsForProcessing(commitShas);
      detectionResult = {
        message: `Buffered ${commitShas.length} commits for real-time pattern detection`,
        patternsFound: 0,
        mode: 'buffered'
      };
    } else {
      // Immediate pattern detection
      detectionResult = await detectPatterns(commitShas);
    }

    // Log the pattern detection request
    await logEvent({
      actor: 'system',
      event_type: 'pattern_detection_triggered',
      status: 'closed',
      metadata: {
        sessionId,
        projectId,
        commitsAnalyzed: commitShas.length,
        realTime: params.realTime,
        patternsFound: detectionResult.totalPatternsFound || 0,
        executionTimeMs: detectionResult.executionTimeMs || 0
      },
      tags: ['pattern_detection', 'git_integration', 'tc013']
    });

    console.log(`✅ Pattern detection triggered for ${commitShas.length} commits`);

    return {
      success: true,
      detectionResult
    };

  } catch (error) {
    console.error('❌ Pattern detection failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Enhanced trackRealtimeGitActivity with pattern detection
 */
export async function trackRealtimeGitActivityWithPatterns(): Promise<{
  success: boolean;
  recentCommits: number;
  autoCorrelated: boolean;
  patternsDetected: number;
  error?: string;
}> {
  try {
    console.log('⚡ Tracking git activity with pattern detection...');

    // First run the existing git tracking
    const gitResult = await GitHandler.trackRealtimeGitActivity();
    
    let patternsDetected = 0;

    // If new commits were found, trigger pattern detection
    if (gitResult.success && gitResult.recentCommits > 0) {
      console.log(`🔍 Found ${gitResult.recentCommits} new commits, triggering pattern detection...`);
      
      const patternResult = await detectPatternsForRecentCommits({
        commitLimitCount: gitResult.recentCommits,
        realTime: true // Use buffered real-time processing
      });

      if (patternResult.success && patternResult.detectionResult) {
        patternsDetected = patternResult.detectionResult.patternsFound || 0;
        
        console.log(`📊 Pattern detection: ${patternsDetected} patterns found`);
      }
    }

    return {
      success: gitResult.success,
      recentCommits: gitResult.recentCommits,
      autoCorrelated: gitResult.autoCorrelated,
      patternsDetected,
      error: gitResult.error
    };

  } catch (error) {
    console.error('❌ Git activity tracking with patterns failed:', error);
    return {
      success: false,
      recentCommits: 0,
      autoCorrelated: false,
      patternsDetected: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get pattern insights for a session's commits
 */
export async function getSessionPatternInsights(params: {
  sessionId?: string;
  includeHistorical?: boolean;
  confidenceThreshold?: number;
}): Promise<{
  success: boolean;
  sessionId: string;
  insights: any[];
  totalInsights: number;
  error?: string;
}> {
  try {
    const sessionId = params.sessionId || await getCurrentSession();
    if (!sessionId) {
      throw new Error('No active session found');
    }

    console.log(`💡 Getting pattern insights for session: ${sessionId.substring(0, 8)}...`);

    // Get pattern insights related to the session's commits
    const insightsQuery = `
      SELECT DISTINCT
        pi.id,
        pi.insight_type,
        pi.title,
        pi.description,
        pi.confidence_score,
        pi.risk_level,
        pi.business_impact,
        pi.recommendations,
        pi.created_at,
        pds.discovery_timestamp
      FROM pattern_insights pi
      JOIN pattern_discovery_sessions pds ON pi.discovery_session_id = pds.id
      WHERE pds.session_id = $1
      AND pi.is_active = TRUE
      AND pi.confidence_score >= $2
      ORDER BY pi.confidence_score DESC, pi.created_at DESC
    `;

    const confidenceThreshold = params.confidenceThreshold || 0.5;
    const result = await db.query(insightsQuery, [sessionId, confidenceThreshold]);

    const insights = result.rows;

    // Log insights request
    await logEvent({
      actor: 'ai',
      event_type: 'session_pattern_insights_request',
      status: 'closed',
      metadata: {
        sessionId,
        insightsFound: insights.length,
        confidenceThreshold,
        includeHistorical: params.includeHistorical
      },
      tags: ['pattern_insights', 'session', 'tc013']
    });

    console.log(`💡 Found ${insights.length} pattern insights for session`);

    return {
      success: true,
      sessionId,
      insights,
      totalInsights: insights.length
    };

  } catch (error) {
    console.error('❌ Failed to get session pattern insights:', error);
    return {
      success: false,
      sessionId: params.sessionId || '',
      insights: [],
      totalInsights: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Export the main handler
 */
export default GitHandler;
