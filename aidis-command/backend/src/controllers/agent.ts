import { Request, Response } from 'express';
import { AgentService } from '../services/agent';

export class AgentController {
  /**
   * GET /agents - Get all agents
   */
  static async getAllAgents(_req: Request, res: Response): Promise<void> {
    try {
      const agents = await AgentService.getAllAgents();
      
      res.json({
        success: true,
        data: {
          agents,
          total: agents.length
        }
      });
    } catch (error) {
      console.error('Get all agents error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get agents'
      });
    }
  }

  /**
   * GET /agents/:id - Get single agent by ID
   */
  static async getAgent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const agent = await AgentService.getAgentById(id);

      if (!agent) {
        res.status(404).json({
          success: false,
          error: 'Agent not found'
        });
        return;
      }

      res.json({
        success: true,
        data: { agent }
      });
    } catch (error) {
      console.error('Get agent error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get agent'
      });
    }
  }

  /**
   * POST /agents - Create new agent
   */
  static async createAgent(req: Request, res: Response): Promise<void> {
    try {
      const agentData = req.body;

      // Basic validation
      if (!agentData.name || agentData.name.trim() === '') {
        res.status(400).json({
          success: false,
          error: 'Agent name is required'
        });
        return;
      }

      const agent = await AgentService.createAgent(agentData);

      res.status(201).json({
        success: true,
        data: { agent }
      });
    } catch (error) {
      console.error('Create agent error:', error);
      
      if (error instanceof Error && error.message === 'Agent name already exists') {
        res.status(409).json({
          success: false,
          error: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create agent'
      });
    }
  }

  /**
   * PATCH /agents/:id - Update agent
   */
  static async updateAgent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      const agent = await AgentService.updateAgent(id, updates);

      if (!agent) {
        res.status(404).json({
          success: false,
          error: 'Agent not found'
        });
        return;
      }

      res.json({
        success: true,
        data: { agent }
      });
    } catch (error) {
      console.error('Update agent error:', error);
      
      if (error instanceof Error && error.message === 'Agent name already exists') {
        res.status(409).json({
          success: false,
          error: error.message
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update agent'
      });
    }
  }

  /**
   * DELETE /agents/:id - Delete agent
   */
  static async deleteAgent(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const deleted = await AgentService.deleteAgent(id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Agent not found'
        });
        return;
      }

      res.json({
        success: true,
        data: { message: 'Agent deleted successfully' }
      });
    } catch (error) {
      console.error('Delete agent error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete agent'
      });
    }
  }

  /**
   * GET /agents/:id/sessions - Get agent sessions
   */
  static async getAgentSessions(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const sessions = await AgentService.getAgentSessions(id);

      res.json({
        success: true,
        data: {
          sessions,
          total: sessions.length
        }
      });
    } catch (error) {
      console.error('Get agent sessions error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get agent sessions'
      });
    }
  }

  /**
   * GET /agents/:id/messages - Get agent messages
   */
  static async getAgentMessages(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const messages = await AgentService.getAgentMessages(id);

      res.json({
        success: true,
        data: {
          messages,
          total: messages.length
        }
      });
    } catch (error) {
      console.error('Get agent messages error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get agent messages'
      });
    }
  }

  /**
   * GET /agents/tasks - Get all tasks
   */
  static async getAllTasks(_req: Request, res: Response): Promise<void> {
    try {
      const tasks = await AgentService.getAllTasks();

      res.json({
        success: true,
        data: {
          tasks,
          total: tasks.length
        }
      });
    } catch (error) {
      console.error('Get all tasks error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tasks'
      });
    }
  }

  /**
   * POST /agents/tasks - Create new task
   */
  static async createTask(req: Request, res: Response): Promise<void> {
    try {
      const taskData = req.body;

      // Basic validation
      if (!taskData.title || taskData.title.trim() === '') {
        res.status(400).json({
          success: false,
          error: 'Task title is required'
        });
        return;
      }

      if (!taskData.project_id) {
        res.status(400).json({
          success: false,
          error: 'Project ID is required'
        });
        return;
      }

      const task = await AgentService.createTask(taskData);

      res.status(201).json({
        success: true,
        data: { task }
      });
    } catch (error) {
      console.error('Create task error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create task'
      });
    }
  }

  /**
   * PATCH /agents/tasks/:id - Update task
   */
  static async updateTask(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      const task = await AgentService.updateTask(id, updates);

      if (!task) {
        res.status(404).json({
          success: false,
          error: 'Task not found'
        });
        return;
      }

      res.json({
        success: true,
        data: { task }
      });
    } catch (error) {
      console.error('Update task error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update task'
      });
    }
  }

  /**
   * POST /agents/:id/heartbeat - Update agent heartbeat
   */
  static async updateHeartbeat(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updated = await AgentService.updateHeartbeat(id);

      if (!updated) {
        res.status(404).json({
          success: false,
          error: 'Agent not found'
        });
        return;
      }

      res.json({
        success: true,
        data: { message: 'Heartbeat updated' }
      });
    } catch (error) {
      console.error('Update heartbeat error:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update heartbeat'
      });
    }
  }
}
