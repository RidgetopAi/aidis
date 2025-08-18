export interface NamingEntry {
  id: number;
  name: string;
  type: 'variable' | 'function' | 'component' | 'class' | 'interface' | 'module' | 'file';
  context?: string;
  project_id: string;
  project_name?: string;
  status: 'active' | 'deprecated' | 'conflicted' | 'pending';
  compliance_score: number;
  usage_count: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;
}

export interface NamingSearchParams {
  query?: string;
  project_id?: string;
  type?: string;
  status?: string;
  created_by?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface NamingSearchResult {
  entries: NamingEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface NamingStats {
  total_names: number;
  compliance: number;
  deprecated: number;
  recent_activity: number;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
  by_project: Record<string, number>;
  total_projects: number;
}

export interface NamingSuggestion {
  suggested_name: string;
  confidence: number;
  reason: string;
  alternatives: string[];
}

export interface NamingRegistrationData {
  name: string;
  type: string;
  context?: string;
}
