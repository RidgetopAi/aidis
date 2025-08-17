import { db as pool } from '../database/connection';

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

export class AgentService {
  /**
   * Get all agents with statistics
   */
  static async getAllAgents(): Promise<Agent[]> {
    try {
      const result = await pool.query(`
        SELECT 
          a.id, a.name, a.type, a.capabilities, a.status, a.metadata,
          a.last_seen, a.created_at, a.updated_at,
          COUNT(DISTINCT s.id) as session_count,
          COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('todo', 'in_progress', 'blocked')) as active_tasks,
          MAX(GREATEST(s.last_activity, t.updated_at)) as recent_activity
        FROM agents a
        LEFT JOIN agent_sessions s ON a.id = s.agent_id
        LEFT JOIN agent_tasks t ON a.id = t.assigned_to
        GROUP BY a.id, a.name, a.type, a.capabilities, a.status, a.metadata,
                 a.last_seen, a.created_at, a.updated_at
        ORDER BY a.last_seen DESC, a.created_at DESC
      `);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type,
        capabilities: row.capabilities || [],
        status: row.status,
        metadata: row.metadata,
        last_seen: row.last_seen,
        created_at: row.created_at,
        updated_at: row.updated_at,
        session_count: parseInt(row.session_count) || 0,
        active_tasks: parseInt(row.active_tasks) || 0,
        recent_activity: row.recent_activity
      }));
    } catch (error) {
      console.error('Get all agents error:', error);
      throw new Error('Failed to get agents');
    }
  }

  /**
   * Get single agent by ID with statistics
   */
  static async getAgentById(id: string): Promise<Agent | null> {
    try {
      const result = await pool.query(`
        SELECT 
          a.id, a.name, a.type, a.capabilities, a.status, a.metadata,
          a.last_seen, a.created_at, a.updated_at,
          COUNT(DISTINCT s.id) as session_count,
          COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('todo', 'in_progress', 'blocked')) as active_tasks,
          MAX(GREATEST(s.last_activity, t.updated_at)) as recent_activity
        FROM agents a
        LEFT JOIN agent_sessions s ON a.id = s.agent_id
        LEFT JOIN agent_tasks t ON a.id = t.assigned_to
        WHERE a.id = $1
        GROUP BY a.id, a.name, a.type, a.capabilities, a.status, a.metadata,
                 a.last_seen, a.created_at, a.updated_at
      `, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        capabilities: row.capabilities || [],
        status: row.status,
        metadata: row.metadata,
        last_seen: row.last_seen,
        created_at: row.created_at,
        updated_at: row.updated_at,
        session_count: parseInt(row.session_count) || 0,
        active_tasks: parseInt(row.active_tasks) || 0,
        recent_activity: row.recent_activity
      };
    } catch (error) {
      console.error('Get agent by ID error:', error);
      throw new Error('Failed to get agent');
    }
  }

  /**
   * Create new agent
   */
  static async createAgent(agentData: CreateAgentRequest): Promise<Agent> {
    const { name, type = 'ai_assistant', capabilities = ['coding'], metadata = {} } = agentData;

    try {
      const result = await pool.query(`
        INSERT INTO agents (name, type, capabilities, metadata)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, type, capabilities, status, metadata, last_seen, created_at, updated_at
      `, [name, type, capabilities, JSON.stringify(metadata)]);

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        capabilities: row.capabilities || [],
        status: row.status,
        metadata: row.metadata,
        last_seen: row.last_seen,
        created_at: row.created_at,
        updated_at: row.updated_at,
        session_count: 0,
        active_tasks: 0
      };
    } catch (error: any) {
      console.error('Create agent error:', error);
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('Agent name already exists');
      }
      throw new Error('Failed to create agent');
    }
  }

  /**
   * Update agent
   */
  static async updateAgent(id: string, updates: UpdateAgentRequest): Promise<Agent | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }

    if (updates.type !== undefined) {
      setClauses.push(`type = $${paramIndex++}`);
      values.push(updates.type);
    }

    if (updates.capabilities !== undefined) {
      setClauses.push(`capabilities = $${paramIndex++}`);
      values.push(updates.capabilities);
    }

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
      
      // Update last_seen when status changes
      setClauses.push(`last_seen = CURRENT_TIMESTAMP`);
    }

    if (updates.metadata !== undefined) {
      setClauses.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(updates.metadata));
    }

    if (setClauses.length === 0) {
      throw new Error('No updates provided');
    }

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    try {
      const result = await pool.query(`
        UPDATE agents 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, name, type, capabilities, status, metadata, last_seen, created_at, updated_at
      `, values);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        name: row.name,
        type: row.type,
        capabilities: row.capabilities || [],
        status: row.status,
        metadata: row.metadata,
        last_seen: row.last_seen,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } catch (error: any) {
      console.error('Update agent error:', error);
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('Agent name already exists');
      }
      throw new Error('Failed to update agent');
    }
  }

  /**
   * Delete agent
   */
  static async deleteAgent(id: string): Promise<boolean> {
    try {
      const result = await pool.query('DELETE FROM agents WHERE id = $1', [id]);
      return result.rowCount! > 0;
    } catch (error) {
      console.error('Delete agent error:', error);
      throw new Error('Failed to delete agent');
    }
  }

  /**
   * Get agent sessions
   */
  static async getAgentSessions(agentId: string): Promise<AgentSession[]> {
    try {
      const result = await pool.query(`
        SELECT 
          s.id, s.agent_id, a.name as agent_name, s.session_id, s.project_id, 
          p.name as project_name, s.status, s.started_at, s.last_activity, s.metadata
        FROM agent_sessions s
        LEFT JOIN agents a ON s.agent_id = a.id
        LEFT JOIN projects p ON s.project_id = p.id
        WHERE s.agent_id = $1
        ORDER BY s.last_activity DESC
      `, [agentId]);

      return result.rows.map(row => ({
        id: row.id,
        agent_id: row.agent_id,
        agent_name: row.agent_name,
        session_id: row.session_id,
        project_id: row.project_id,
        project_name: row.project_name,
        status: row.status,
        started_at: row.started_at,
        last_activity: row.last_activity,
        metadata: row.metadata
      }));
    } catch (error) {
      console.error('Get agent sessions error:', error);
      throw new Error('Failed to get agent sessions');
    }
  }

  /**
   * Get agent messages
   */
  static async getAgentMessages(agentId: string): Promise<AgentMessage[]> {
    try {
      const result = await pool.query(`
        SELECT 
          m.id, m.project_id, m.from_agent_id, fa.name as from_agent_name,
          m.to_agent_id, ta.name as to_agent_name, m.message_type, m.title, m.content,
          m.context_refs, m.task_refs, m.metadata, m.read_at, m.created_at
        FROM agent_messages m
        LEFT JOIN agents fa ON m.from_agent_id = fa.id
        LEFT JOIN agents ta ON m.to_agent_id = ta.id
        WHERE m.from_agent_id = $1 OR m.to_agent_id = $1 OR m.to_agent_id IS NULL
        ORDER BY m.created_at DESC
        LIMIT 100
      `, [agentId]);

      return result.rows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        from_agent_id: row.from_agent_id,
        from_agent_name: row.from_agent_name,
        to_agent_id: row.to_agent_id,
        to_agent_name: row.to_agent_name,
        message_type: row.message_type,
        title: row.title,
        content: row.content,
        context_refs: row.context_refs,
        task_refs: row.task_refs,
        metadata: row.metadata,
        read_at: row.read_at,
        created_at: row.created_at
      }));
    } catch (error) {
      console.error('Get agent messages error:', error);
      throw new Error('Failed to get agent messages');
    }
  }

  /**
   * Get all tasks
   */
  static async getAllTasks(): Promise<AgentTask[]> {
    try {
      const result = await pool.query(`
        SELECT 
          t.id, t.project_id, p.name as project_name,
          t.assigned_to, a1.name as assigned_to_name,
          t.created_by, a2.name as created_by_name,
          t.title, t.description, t.type, t.status, t.priority,
          t.dependencies, t.tags, t.metadata,
          t.started_at, t.completed_at, t.created_at, t.updated_at
        FROM agent_tasks t
        LEFT JOIN projects p ON t.project_id = p.id
        LEFT JOIN agents a1 ON t.assigned_to = a1.id
        LEFT JOIN agents a2 ON t.created_by = a2.id
        ORDER BY 
          CASE t.priority
            WHEN 'urgent' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            WHEN 'low' THEN 4
          END,
          t.created_at DESC
      `);

      return result.rows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        assigned_to: row.assigned_to,
        assigned_to_name: row.assigned_to_name,
        created_by: row.created_by,
        created_by_name: row.created_by_name,
        title: row.title,
        description: row.description,
        type: row.type,
        status: row.status,
        priority: row.priority,
        dependencies: row.dependencies,
        tags: row.tags,
        metadata: row.metadata,
        started_at: row.started_at,
        completed_at: row.completed_at,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
    } catch (error) {
      console.error('Get all tasks error:', error);
      throw new Error('Failed to get tasks');
    }
  }

  /**
   * Create new task
   */
  static async createTask(taskData: CreateTaskRequest, createdBy?: string): Promise<AgentTask> {
    const { 
      title, description, project_id, assigned_to, 
      type = 'general', priority = 'medium', dependencies = [], tags = [], metadata = {} 
    } = taskData;

    try {
      const result = await pool.query(`
        INSERT INTO agent_tasks (
          project_id, assigned_to, created_by, title, description, type, priority, 
          dependencies, tags, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        project_id, assigned_to, createdBy, title, description, 
        type, priority, dependencies, tags, JSON.stringify(metadata)
      ]);

      const row = result.rows[0];
      return {
        id: row.id,
        project_id: row.project_id,
        assigned_to: row.assigned_to,
        created_by: row.created_by,
        title: row.title,
        description: row.description,
        type: row.type,
        status: row.status,
        priority: row.priority,
        dependencies: row.dependencies,
        tags: row.tags,
        metadata: row.metadata,
        started_at: row.started_at,
        completed_at: row.completed_at,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } catch (error) {
      console.error('Create task error:', error);
      throw new Error('Failed to create task');
    }
  }

  /**
   * Update task
   */
  static async updateTask(id: string, updates: UpdateTaskRequest): Promise<AgentTask | null> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      values.push(updates.title);
    }

    if (updates.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }

    if (updates.assigned_to !== undefined) {
      setClauses.push(`assigned_to = $${paramIndex++}`);
      values.push(updates.assigned_to);
    }

    if (updates.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(updates.status);
      
      // Set timestamps based on status
      if (updates.status === 'in_progress' && !updates.title) {
        setClauses.push(`started_at = CURRENT_TIMESTAMP`);
      } else if (updates.status === 'completed') {
        setClauses.push(`completed_at = CURRENT_TIMESTAMP`);
      }
    }

    if (updates.priority !== undefined) {
      setClauses.push(`priority = $${paramIndex++}`);
      values.push(updates.priority);
    }

    if (updates.dependencies !== undefined) {
      setClauses.push(`dependencies = $${paramIndex++}`);
      values.push(updates.dependencies);
    }

    if (updates.tags !== undefined) {
      setClauses.push(`tags = $${paramIndex++}`);
      values.push(updates.tags);
    }

    if (updates.metadata !== undefined) {
      setClauses.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(updates.metadata));
    }

    if (setClauses.length === 0) {
      throw new Error('No updates provided');
    }

    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    try {
      const result = await pool.query(`
        UPDATE agent_tasks 
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, values);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        project_id: row.project_id,
        assigned_to: row.assigned_to,
        created_by: row.created_by,
        title: row.title,
        description: row.description,
        type: row.type,
        status: row.status,
        priority: row.priority,
        dependencies: row.dependencies,
        tags: row.tags,
        metadata: row.metadata,
        started_at: row.started_at,
        completed_at: row.completed_at,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    } catch (error) {
      console.error('Update task error:', error);
      throw new Error('Failed to update task');
    }
  }

  /**
   * Update agent heartbeat
   */
  static async updateHeartbeat(agentId: string): Promise<boolean> {
    try {
      const result = await pool.query(`
        UPDATE agents 
        SET last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [agentId]);

      return result.rowCount! > 0;
    } catch (error) {
      console.error('Update heartbeat error:', error);
      return false;
    }
  }
}
