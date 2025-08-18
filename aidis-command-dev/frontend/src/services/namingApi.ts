import apiClient from './api';
import { NamingEntry, NamingSearchParams, NamingStats, NamingSearchResult, NamingSuggestion, NamingRegistrationData } from '../components/naming/types';

export class NamingApi {
  /**
   * Search naming entries with filters and pagination
   */
  static async searchEntries(params: NamingSearchParams): Promise<NamingSearchResult> {
    // Convert params to query string
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          queryParams.set(key, value.join(','));
        } else {
          queryParams.set(key, String(value));
        }
      }
    });

    const response = await apiClient.get<{ success: boolean; data: NamingSearchResult }>(
      `/naming?${queryParams.toString()}`
    );

    if (!response.success) {
      throw new Error('Failed to search naming entries');
    }

    return response.data;
  }

  /**
   * Get single naming entry by ID
   */
  static async getEntry(id: number): Promise<NamingEntry> {
    const response = await apiClient.get<{ success: boolean; data: NamingEntry }>(
      `/naming/${id}`
    );

    if (!response.success) {
      throw new Error('Failed to get naming entry');
    }

    return response.data;
  }

  /**
   * Register a new name
   */
  static async registerName(data: NamingRegistrationData): Promise<NamingEntry> {
    const response = await apiClient.post<{ success: boolean; data: NamingEntry }>(
      '/naming/register',
      data
    );

    if (!response.success) {
      throw new Error('Failed to register name');
    }

    return response.data;
  }

  /**
   * Check name availability
   */
  static async checkNameAvailability(name: string): Promise<{ available: boolean; conflicts?: NamingEntry[] }> {
    const response = await apiClient.get<{ success: boolean; data: { available: boolean; conflicts?: NamingEntry[] } }>(
      `/naming/check/${encodeURIComponent(name)}`
    );

    if (!response.success) {
      throw new Error('Failed to check name availability');
    }

    return response.data;
  }

  /**
   * Get naming suggestions
   */
  static async getSuggestions(baseName: string, type?: string): Promise<NamingSuggestion[]> {
    const params = type ? `?type=${type}` : '';
    const response = await apiClient.get<{ success: boolean; data: NamingSuggestion[] }>(
      `/naming/suggest/${encodeURIComponent(baseName)}${params}`
    );

    if (!response.success) {
      throw new Error('Failed to get naming suggestions');
    }

    return response.data;
  }

  /**
   * Update naming entry
   */
  static async updateEntry(
    id: number, 
    updates: {
      status?: string;
      context?: string;
    }
  ): Promise<NamingEntry> {
    const response = await apiClient.put<{ success: boolean; data: NamingEntry }>(
      `/naming/${id}`,
      updates
    );

    if (!response.success) {
      throw new Error('Failed to update naming entry');
    }

    return response.data;
  }

  /**
   * Delete naming entry
   */
  static async deleteEntry(id: number): Promise<void> {
    const response = await apiClient.delete<{ success: boolean }>(
      `/naming/${id}`
    );

    if (!response.success) {
      throw new Error('Failed to delete naming entry');
    }
  }

  /**
   * Get naming statistics
   */
  static async getNamingStats(project_id?: string): Promise<NamingStats> {
    const params = project_id ? `?project_id=${project_id}` : '';
    const response = await apiClient.get<{ success: boolean; data: NamingStats }>(
      `/naming/stats${params}`
    );

    if (!response.success) {
      throw new Error('Failed to get naming statistics');
    }

    return response.data;
  }

  /**
   * Format date for API
   */
  static formatDate(date: Date): string {
    return date.toISOString();
  }

  /**
   * Parse date from API
   */
  static parseDate(dateString: string): Date {
    return new Date(dateString);
  }

  /**
   * Get entry type display name
   */
  static getTypeDisplayName(type: string): string {
    const typeMap: Record<string, string> = {
      variable: 'Variable',
      function: 'Function',
      component: 'Component',
      class: 'Class',
      interface: 'Interface',
      module: 'Module',
      file: 'File'
    };
    return typeMap[type] || type;
  }

  /**
   * Get entry type color
   */
  static getTypeColor(type: string): string {
    const colorMap: Record<string, string> = {
      variable: '#52c41a',
      function: '#1890ff',
      component: '#722ed1',
      class: '#fa8c16',
      interface: '#13c2c2',
      module: '#eb2f96',
      file: '#8c8c8c'
    };
    return colorMap[type] || '#8c8c8c';
  }

  /**
   * Get entry status display name
   */
  static getStatusDisplayName(status: string): string {
    const statusMap: Record<string, string> = {
      active: 'Active',
      deprecated: 'Deprecated',
      conflicted: 'Conflicted',
      pending: 'Pending'
    };
    return statusMap[status] || status;
  }

  /**
   * Get entry status color
   */
  static getStatusColor(status: string): string {
    const colorMap: Record<string, string> = {
      active: '#52c41a',
      deprecated: '#8c8c8c',
      conflicted: '#ff4d4f',
      pending: '#fa8c16'
    };
    return colorMap[status] || '#8c8c8c';
  }

  /**
   * Get compliance score color
   */
  static getComplianceColor(score: number): string {
    if (score >= 90) return '#52c41a';
    if (score >= 70) return '#fa8c16';
    return '#ff4d4f';
  }

  /**
   * Get priority level based on usage and compliance
   */
  static getEntryPriority(entry: NamingEntry): 'high' | 'medium' | 'low' {
    if (entry.status === 'conflicted') {
      return 'high';
    }
    if (entry.compliance_score < 70) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Truncate content for preview
   */
  static truncateContent(content: string, maxLength = 150): string {
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength).trim() + '...';
  }

  /**
   * Highlight search terms in text
   */
  static highlightSearchTerms(text: string, searchTerm?: string): string {
    if (!searchTerm || !searchTerm.trim()) {
      return text;
    }

    const terms = searchTerm.trim().split(/\s+/);
    let highlightedText = text;

    terms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlightedText = highlightedText.replace(
        regex,
        '<mark style="background-color: #fff3cd; padding: 2px;">$1</mark>'
      );
    });

    return highlightedText;
  }

  /**
   * Format context for display
   */
  static formatContext(context?: string): string {
    if (!context || context.trim().length === 0) {
      return 'No context provided';
    }
    return context;
  }

  /**
   * Get usage display text
   */
  static getUsageDisplay(usageCount: number): string {
    if (usageCount === 0) return 'No usage';
    if (usageCount === 1) return '1 usage';
    return `${usageCount} usages`;
  }
}

export default NamingApi;
