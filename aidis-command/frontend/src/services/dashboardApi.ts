import { apiClient } from './api';

export interface DashboardStats {
  contexts: number;
  agents: number;
  projects: number;
  activeTasks: number;
  recentActivity?: {
    contextsThisWeek: number;
    sessionsThisWeek: number;
  };
}

export interface ProjectStats {
  total_projects: number;
  active_projects: number;
  total_contexts: number;
  total_sessions: number;
  contexts_by_type: Record<string, number>;
  recent_activity: {
    contexts_last_week: number;
    sessions_last_week: number;
  };
}

export interface ContextStats {
  total_contexts: number;
  recent_contexts: number;
  total_projects: number;
  by_type: Record<string, number>;
  by_project: Record<string, number>;
}

class DashboardApi {
  /**
   * Get comprehensive dashboard statistics
   */
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      // Fetch project stats and context stats in parallel
      const [projectStatsResponse, contextStatsResponse] = await Promise.all([
        apiClient.get<{ success: boolean; data: { stats: ProjectStats } }>('/projects/stats'),
        apiClient.get<{ success: boolean; data: ContextStats }>('/contexts/stats')
      ]);

      const projectStats = projectStatsResponse.data.stats;
      const contextStats = contextStatsResponse.data;
      
      console.log('📊 Dashboard API Debug:');
      console.log('- Project stats response:', projectStatsResponse);
      console.log('- Context stats response:', contextStatsResponse);
      console.log('- Extracted project stats:', projectStats);
      console.log('- Extracted context stats:', contextStats);

      // Combine data into dashboard format
      const dashboardStats = {
        contexts: contextStats.total_contexts,
        agents: 0, // TODO: Add agents endpoint when available
        projects: projectStats.total_projects,
        activeTasks: 0, // TODO: Add tasks endpoint when available  
        recentActivity: {
          contextsThisWeek: projectStats.recent_activity.contexts_last_week,
          sessionsThisWeek: projectStats.recent_activity.sessions_last_week
        }
      };
      
      console.log('✅ Final dashboard stats:', dashboardStats);
      return dashboardStats;
    } catch (error) {
      console.error('Dashboard stats fetch error:', error);
      throw error;
    }
  }

  /**
   * Get project statistics
   */
  async getProjectStats(): Promise<ProjectStats> {
    try {
      const response = await apiClient.get<{ success: boolean; data: { stats: ProjectStats } }>('/projects/stats');
      return response.data.stats;
    } catch (error) {
      console.error('Project stats fetch error:', error);
      throw error;
    }
  }

  /**
   * Get context statistics
   */
  async getContextStats(projectId?: string): Promise<ContextStats> {
    try {
      const url = projectId ? `/contexts/stats?project_id=${projectId}` : '/contexts/stats';
      const response = await apiClient.get<{ success: boolean; data: ContextStats }>(url);
      return response.data;
    } catch (error) {
      console.error('Context stats fetch error:', error);
      throw error;
    }
  }
}

const dashboardApiInstance = new DashboardApi();
export default dashboardApiInstance;
