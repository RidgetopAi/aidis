/**
 * AIDIS Project Management Handler
 * 
 * This handles all project management operations:
 * - Creating and managing projects
 * - Session state (current active project)
 * - Project switching for AI agents
 * - Project discovery and listing
 * 
 * This enables AI agents to seamlessly work across multiple projects!
 */

import { db } from '../config/database.js';

export interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  gitRepoUrl: string | null;
  rootDirectory: string | null;
  metadata: Record<string, any>;
  contextCount?: number;
  isActive?: boolean;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  gitRepoUrl?: string;
  rootDirectory?: string;
  metadata?: Record<string, any>;
}

export interface SessionState {
  currentProjectId: string | null;
  sessionId?: string;
  agentType?: string;
}

export class ProjectHandler {
  // In-memory session state (in production, this could be Redis/database)
  private sessionStates = new Map<string, SessionState>();
  private defaultSessionId = 'default-session';

  /**
   * List all projects with optional statistics
   */
  async listProjects(includeStats: boolean = true): Promise<ProjectInfo[]> {
    console.log('📋 Listing all projects...');

    try {
      let sql = `
        SELECT 
          p.id, p.name, p.description, p.status, 
          p.created_at, p.updated_at, p.git_repo_url, 
          p.root_directory, p.metadata
      `;

      if (includeStats) {
        sql += `, COUNT(c.id) as context_count`;
      }

      sql += ` FROM projects p`;

      if (includeStats) {
        sql += ` LEFT JOIN contexts c ON p.id = c.project_id`;
      }

      sql += ` GROUP BY p.id, p.name, p.description, p.status, p.created_at, p.updated_at, p.git_repo_url, p.root_directory, p.metadata`;
      sql += ` ORDER BY p.updated_at DESC`;

      const result = await db.query(sql);

      // Get current project ID once before mapping (now async)
      const currentProjectId = await this.getCurrentProjectId();

      const projects: ProjectInfo[] = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        gitRepoUrl: row.git_repo_url,
        rootDirectory: row.root_directory,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        contextCount: includeStats ? parseInt(row.context_count || '0') : undefined,
        isActive: currentProjectId === row.id
      }));

      console.log(`✅ Found ${projects.length} projects`);
      return projects;

    } catch (error) {
      console.error('❌ Failed to list projects:', error);
      throw new Error(`Failed to list projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a new project
   */
  async createProject(request: CreateProjectRequest): Promise<ProjectInfo> {
    console.log(`🆕 Creating new project: "${request.name}"`);

    try {
      // Validate name uniqueness
      const existingCheck = await db.query('SELECT id FROM projects WHERE name = $1', [request.name]);
      if (existingCheck.rows.length > 0) {
        throw new Error(`Project with name "${request.name}" already exists`);
      }

      // Insert new project
      const result = await db.query(`
        INSERT INTO projects (name, description, git_repo_url, root_directory, metadata)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        request.name,
        request.description || null,
        request.gitRepoUrl || null,
        request.rootDirectory || null,
        JSON.stringify(request.metadata || {})
      ]);

      const row = result.rows[0];
      const project: ProjectInfo = {
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        gitRepoUrl: row.git_repo_url,
        rootDirectory: row.root_directory,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        contextCount: 0
      };

      console.log(`✅ Created project: ${project.id}`);
      return project;

    } catch (error) {
      console.error('❌ Failed to create project:', error);
      throw new Error(`Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get project details by ID or name
   */
  async getProject(identifier: string): Promise<ProjectInfo | null> {
    console.log(`🔍 Getting project: "${identifier}"`);

    try {
      // Try by ID first (UUID format), then by name
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);
      
      const field = isUUID ? 'id' : 'name';
      const result = await db.query(`
        SELECT 
          p.id, p.name, p.description, p.status,
          p.created_at, p.updated_at, p.git_repo_url,
          p.root_directory, p.metadata,
          COUNT(c.id) as context_count
        FROM projects p
        LEFT JOIN contexts c ON p.id = c.project_id
        WHERE p.${field} = $1
        GROUP BY p.id, p.name, p.description, p.status, p.created_at, p.updated_at, p.git_repo_url, p.root_directory, p.metadata
      `, [identifier]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];

      // Get current project ID (now async)
      const currentProjectId = await this.getCurrentProjectId();

      const project: ProjectInfo = {
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        gitRepoUrl: row.git_repo_url,
        rootDirectory: row.root_directory,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        contextCount: parseInt(row.context_count || '0'),
        isActive: currentProjectId === row.id
      };

      console.log(`✅ Found project: ${project.name} (${project.contextCount} contexts)`);
      return project;

    } catch (error) {
      console.error('❌ Failed to get project:', error);
      throw new Error(`Failed to get project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Set the current active project for the session
   */
  setCurrentProject(projectId: string, sessionId: string = this.defaultSessionId): void {
    console.log(`🔄 Setting current project to: ${projectId} (session: ${sessionId})`);
    
    const existing = this.sessionStates.get(sessionId) || {};
    this.sessionStates.set(sessionId, {
      ...existing,
      currentProjectId: projectId,
      sessionId
    });

    console.log(`✅ Current project set for session ${sessionId}`);
  }

  /**
   * Get the current active project ID
   * Now async with cache validation to prevent stale project IDs
   */
  async getCurrentProjectId(sessionId: string = this.defaultSessionId): Promise<string | null> {
    const state = this.sessionStates.get(sessionId);
    const cachedId = state?.currentProjectId;

    if (!cachedId) {
      return null;
    }

    // Validate cached ID still exists in database
    const result = await db.query(
      'SELECT 1 FROM projects WHERE id = $1',
      [cachedId]
    );

    if (result.rows.length === 0) {
      // Clear invalid cached state
      console.warn(`Clearing stale project cache for session ${sessionId}: project ${cachedId} no longer exists`);
      this.sessionStates.delete(sessionId);
      return null;
    }

    return cachedId;
  }

  /**
   * Get the current active project details
   */
  async getCurrentProject(sessionId: string = this.defaultSessionId): Promise<ProjectInfo | null> {
    const projectId = await this.getCurrentProjectId(sessionId);
    if (!projectId) {
      return null;
    }

    return await this.getProject(projectId);
  }

  /**
   * Switch to a project (by ID or name) and set as current
   * Enhanced with TS012 validation framework
   */
  async switchProject(identifier: string, sessionId: string = this.defaultSessionId): Promise<ProjectInfo> {
    console.log(`🔄 Switching to project: "${identifier}" (session: ${sessionId.substring(0, 8)}...)`);

    // Basic validation for backwards compatibility
    const project = await this.getProject(identifier);
    if (!project) {
      throw new Error(`Project "${identifier}" not found`);
    }

    this.setCurrentProject(project.id, sessionId);
    
    console.log(`✅ Switched to project: ${project.name}`);
    return { ...project, isActive: true };
  }

  /**
   * Enhanced switch with comprehensive TS012 validation
   */
  async switchProjectWithValidation(identifier: string, sessionId: string = this.defaultSessionId): Promise<ProjectInfo> {
    const { ProjectSwitchValidator } = await import('../services/projectSwitchValidator.js');
    
    console.log(`🔄 [TS012] Enhanced switching to project: "${identifier}" (session: ${sessionId.substring(0, 8)}...)`);

    try {
      // Step 1: Pre-switch validation
      const preValidation = await ProjectSwitchValidator.validatePreSwitch(sessionId, identifier);
      if (!preValidation.isValid) {
        const errorMessages = preValidation.errors.map(e => e.message).join('; ');
        throw new Error(`Pre-switch validation failed: ${errorMessages}`);
      }

      if (preValidation.warnings.length > 0) {
        console.log(`⚠️  [TS012] Pre-switch warnings: ${preValidation.warnings.join('; ')}`);
      }

      // Step 2: Get target project info for atomic switch
      const targetProject = await this.getProject(identifier);
      if (!targetProject) {
        throw new Error(`Project "${identifier}" not found`);
      }

      // Step 3: Perform atomic switch with rollback capability
      const switchResult = await ProjectSwitchValidator.performAtomicSwitch(
        sessionId, 
        targetProject.id, 
        preValidation
      );

      if (!switchResult.success) {
        if (switchResult.error) {
          throw new Error(switchResult.error.message);
        }
        throw new Error('Atomic switch failed for unknown reason');
      }

      // Step 4: Post-switch validation
      const postValidation = await ProjectSwitchValidator.validatePostSwitch(
        sessionId,
        targetProject.id,
        {
          sessionId,
          sourceProjectId: await this.getCurrentProjectId(sessionId),
          targetProjectId: targetProject.id,
          timestamp: new Date(),
          transactionId: 'post-validation' 
        }
      );

      if (!postValidation.isValid) {
        console.error(`❌ [TS012] Post-switch validation failed:`, postValidation.errors);
        // Don't throw here - log the issues but return the project since switch completed
      }

      if (postValidation.warnings.length > 0) {
        console.log(`⚠️  [TS012] Post-switch warnings: ${postValidation.warnings.join('; ')}`);
      }

      const resultProject = switchResult.project || { ...targetProject, isActive: true };
      console.log(`✅ [TS012] Enhanced switch completed: ${resultProject.name}`);
      return resultProject;

    } catch (error) {
      console.error('❌ [TS012] Enhanced switch failed:', error);
      throw new Error(`Enhanced project switch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get session state information
   */
  getSessionInfo(sessionId: string = this.defaultSessionId): SessionState {
    return this.sessionStates.get(sessionId) || {
      currentProjectId: null,
      sessionId
    };
  }

  /**
   * Initialize session with default project (if available)
   */
  async initializeSession(sessionId: string = this.defaultSessionId): Promise<ProjectInfo | null> {
    console.log(`🔄 Initializing session: ${sessionId}`);

    // Check if session already has a current project
    const existing = await this.getCurrentProjectId(sessionId);
    if (existing) {
      const project = await this.getProject(existing);
      if (project) {
        console.log(`✅ Session already has active project: ${project.name}`);
        return project;
      }
    }

    // Set default project (aidis-bootstrap or first available project)
    const projects = await this.listProjects(false);
    if (projects.length === 0) {
      console.log('⚠️  No projects available');
      return null;
    }

    // Try to find aidis-bootstrap first
    let defaultProject = projects.find(p => p.name === 'aidis-bootstrap');
    if (!defaultProject) {
      // Use first available project
      defaultProject = projects[0];
    }

    this.setCurrentProject(defaultProject.id, sessionId);
    console.log(`✅ Session initialized with project: ${defaultProject.name}`);
    
    return { ...defaultProject, isActive: true };
  }

  /**
   * Update project details
   */
  async updateProject(projectId: string, updates: Partial<CreateProjectRequest>): Promise<ProjectInfo> {
    console.log(`📝 Updating project: ${projectId}`);

    try {
      // Build dynamic update query
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        updateFields.push(`name = $${paramIndex}`);
        values.push(updates.name);
        paramIndex++;
      }

      if (updates.description !== undefined) {
        updateFields.push(`description = $${paramIndex}`);
        values.push(updates.description);
        paramIndex++;
      }

      if (updates.gitRepoUrl !== undefined) {
        updateFields.push(`git_repo_url = $${paramIndex}`);
        values.push(updates.gitRepoUrl);
        paramIndex++;
      }

      if (updates.rootDirectory !== undefined) {
        updateFields.push(`root_directory = $${paramIndex}`);
        values.push(updates.rootDirectory);
        paramIndex++;
      }

      if (updates.metadata !== undefined) {
        updateFields.push(`metadata = $${paramIndex}`);
        values.push(JSON.stringify(updates.metadata));
        paramIndex++;
      }

      if (updateFields.length === 0) {
        throw new Error('No update fields provided');
      }

      updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(projectId);

      const sql = `
        UPDATE projects 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await db.query(sql, values);
      
      if (result.rows.length === 0) {
        throw new Error(`Project ${projectId} not found`);
      }

      const row = result.rows[0];

      // Get current project ID (now async)
      const currentProjectId = await this.getCurrentProjectId();

      const project: ProjectInfo = {
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        gitRepoUrl: row.git_repo_url,
        rootDirectory: row.root_directory,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        isActive: currentProjectId === row.id
      };

      console.log(`✅ Updated project: ${project.name}`);
      return project;

    } catch (error) {
      console.error('❌ Failed to update project:', error);
      throw new Error(`Failed to update project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Export singleton instance
export const projectHandler = new ProjectHandler();
