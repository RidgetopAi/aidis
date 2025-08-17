import { apiClient } from './api';

export interface Agent {
  id: string;
  name: string;
  type: string;
  capabilities: string[];
  status: 'active' | 'busy' | 'offline' | 'error';
  metadata?: Record<string, any>;
  last_seen: string;
  created_at: string;
  updated_at: string;
  session_count?: number;
  active_tasks?: number;
  recent_activity?: string;
}

export interface AgentSession {
  id: string;
  agent_id: string;
  agent_name?: string;
  session_id: string;
  project_id: string;
  project_name?: string;
  status: string;
  started_at: string;
  last_activity: string;
  metadata?: Record<string, any>;
}

export interface AgentMessage {
  id: string;
  project_id: string;
  from_agent_id: string;
  from_agent_name?: string;
  to_agent_id?: string;
  to_agent_name?: string;
  message_type: string;
  title?: string;
  content: string;
  context_refs?: string[];
  task_refs?: string[];
  metadata?: Record<string, any>;
  read_at?: string;
  created_at: string;
}

export interface AgentTask {
  id: string;
  project_id: string;
  project_name?: string;
  assigned_to?: string;
  assigned_to_name?: string;
  created_by?: string;
  created_by_name?: string;
  title: string;
  description?: string;
  type: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dependencies?: string[];
  tags?: string[];
  metadata?: Record<string, any>;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentRequest {
  name: string;
  type?: string;
  capabilities?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateAgentRequest {
  name?: string;
  type?: string;
  capabilities?: string[];
  status?: 'active' | 'busy' | 'offline' | 'error';
  metadata?: Record<string, any>;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  project_id: string;
  assigned_to?: string;
  type?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dependencies?: string[];
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  assigned_to?: string;
  status?: 'todo' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dependencies?: string[];
  tags?: string[];
  metadata?: Record<string, any>;
}

class AgentApi {
  // Agent management
  static async getAllAgents(): Promise<{ agents: Agent[], total: number }> {
    const response = await apiClient.get<{
      success: boolean;
      data: { agents: Agent[]; total: number };
    }>('/agents');
    
    if (!response.success) {
      throw new Error('Failed to fetch agents');
    }
    
    return response.data;
  }

  static async getAgent(id: string): Promise<{ agent: Agent }> {
    const response = await apiClient.get<{
      success: boolean;
      data: { agent: Agent };
    }>(`/agents/${id}`);
    
    if (!response.success) {
      throw new Error('Failed to fetch agent');
    }
    
    return response.data;
  }

  static async createAgent(data: CreateAgentRequest): Promise<{ agent: Agent }> {
    const response = await apiClient.post<{
      success: boolean;
      data: { agent: Agent };
    }>('/agents', data);
    
    if (!response.success) {
      throw new Error('Failed to create agent');
    }
    
    return response.data;
  }

  static async updateAgent(id: string, data: UpdateAgentRequest): Promise<{ agent: Agent }> {
    const response = await apiClient.patch<{
      success: boolean;
      data: { agent: Agent };
    }>(`/agents/${id}`, data);
    
    if (!response.success) {
      throw new Error('Failed to update agent');
    }
    
    return response.data;
  }

  static async deleteAgent(id: string): Promise<{ message: string }> {
    const response = await apiClient.delete<{
      success: boolean;
      data: { message: string };
    }>(`/agents/${id}`);
    
    if (!response.success) {
      throw new Error('Failed to delete agent');
    }
    
    return response.data;
  }

  // Agent sessions
  static async getAgentSessions(id: string): Promise<{ sessions: AgentSession[], total: number }> {
    const response = await apiClient.get<{
      success: boolean;
      data: { sessions: AgentSession[]; total: number };
    }>(`/agents/${id}/sessions`);
    
    if (!response.success) {
      throw new Error('Failed to fetch agent sessions');
    }
    
    return response.data;
  }

  // Agent messages
  static async getAgentMessages(id: string): Promise<{ messages: AgentMessage[], total: number }> {
    const response = await apiClient.get<{
      success: boolean;
      data: { messages: AgentMessage[]; total: number };
    }>(`/agents/${id}/messages`);
    
    if (!response.success) {
      throw new Error('Failed to fetch agent messages');
    }
    
    return response.data;
  }

  // Task management
  static async getAllTasks(): Promise<{ tasks: AgentTask[], total: number }> {
    const response = await apiClient.get<{
      success: boolean;
      data: { tasks: AgentTask[]; total: number };
    }>('/agents/tasks');
    
    if (!response.success) {
      throw new Error('Failed to fetch tasks');
    }
    
    return response.data;
  }

  static async createTask(data: CreateTaskRequest): Promise<{ task: AgentTask }> {
    const response = await apiClient.post<{
      success: boolean;
      data: { task: AgentTask };
    }>('/agents/tasks', data);
    
    if (!response.success) {
      throw new Error('Failed to create task');
    }
    
    return response.data;
  }

  static async updateTask(id: string, data: UpdateTaskRequest): Promise<{ task: AgentTask }> {
    const response = await apiClient.patch<{
      success: boolean;
      data: { task: AgentTask };
    }>(`/agents/tasks/${id}`, data);
    
    if (!response.success) {
      throw new Error('Failed to update task');
    }
    
    return response.data;
  }

  // Agent heartbeat
  static async updateHeartbeat(id: string): Promise<{ message: string }> {
    const response = await apiClient.post<{
      success: boolean;
      data: { message: string };
    }>(`/agents/${id}/heartbeat`);
    
    if (!response.success) {
      throw new Error('Failed to update heartbeat');
    }
    
    return response.data;
  }
}

export default AgentApi;
