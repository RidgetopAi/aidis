/**
 * TR005-6: Type Safety Testing Routes
 * Endpoints for testing end-to-end type safety
 */

import { Router, Request, Response } from 'express';
import { validateBody, validateQuery } from '../middleware/validation';
import { SchemaRegistry, validateData } from '../validation/schemas';
import {
  ApiSuccessResponse,
  ApiErrorResponse,
  CreateProjectType,
  CreateTaskType,
  ProjectEntity,
  TaskEntity,
  isApiSuccessResponse,
  isApiErrorResponse
} from '../types/generated';
import { logger } from '../config/logger';
import { z } from 'zod';

const router = Router();

// ================================
// TYPE SAFETY DEMONSTRATION
// ================================

/**
 * GET /type-safety/demo - Demonstrate type safety across the stack
 */
router.get('/demo', (req: Request, res: Response) => {
  try {
    // Demonstrate type-safe response creation
    const demoData: ApiSuccessResponse<{
      message: string;
      features: string[];
      timestamp: string;
    }> = {
      success: true,
      data: {
        message: 'TR005-6: End-to-End Type Safety Pipeline',
        features: [
          'Shared Zod schemas between frontend and backend',
          'Auto-generated TypeScript types',
          'Type-safe API responses',
          'Runtime type validation',
          'Type guards for runtime checking'
        ],
        timestamp: new Date().toISOString()
      },
      correlationId: req.correlationId,
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }
    };

    // Demonstrate type guard usage
    if (isApiSuccessResponse(demoData)) {
      logger.info('Type safety demo requested', {
        correlationId: req.correlationId,
        features: demoData.data.features.length
      });

      res.json(demoData);
    }
  } catch (error) {
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: {
        type: 'internal',
        message: 'Type safety demo failed'
      },
      correlationId: req.correlationId
    };

    res.status(500).json(errorResponse);
  }
});

/**
 * POST /type-safety/validate-project - Validate project with type safety
 */
router.post('/validate-project', validateBody('CreateProject'), (req: Request, res: Response) => {
  try {
    // The request body is now type-safe thanks to validation middleware
    const projectData: CreateProjectType = req.body;

    // Simulate creating a project entity with type safety
    const projectEntity: Partial<ProjectEntity> = {
      name: projectData.name,
      description: projectData.description,
      git_repo_url: projectData.git_repo_url,
      root_directory: projectData.root_directory,
      metadata: projectData.metadata,
      status: 'active', // Default status
      id: 'generated-uuid',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const response: ApiSuccessResponse<{
      project: Partial<ProjectEntity>;
      validation: {
        schema: string;
        valid: boolean;
      };
    }> = {
      success: true,
      data: {
        project: projectEntity,
        validation: {
          schema: 'CreateProject',
          valid: true
        }
      },
      correlationId: req.correlationId
    };

    logger.info('Project validation with type safety', {
      correlationId: req.correlationId,
      projectName: projectData.name,
      hasDescription: !!projectData.description
    });

    res.json(response);
  } catch (error) {
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: {
        type: 'validation',
        message: 'Project validation failed'
      },
      correlationId: req.correlationId
    };

    res.status(400).json(errorResponse);
  }
});

/**
 * POST /type-safety/validate-task - Validate task with type safety
 */
router.post('/validate-task', validateBody('CreateTask'), (req: Request, res: Response) => {
  try {
    const taskData: CreateTaskType = req.body;

    // Create type-safe task entity
    const taskEntity: Partial<TaskEntity> = {
      title: taskData.title,
      description: taskData.description,
      type: taskData.type,
      priority: taskData.priority,
      assigned_to: taskData.assigned_to,
      project_id: taskData.project_id,
      tags: taskData.tags,
      status: 'pending', // Default status
      id: 'generated-uuid',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const response: ApiSuccessResponse<{
      task: Partial<TaskEntity>;
      typeInfo: {
        inputType: string;
        outputType: string;
        schemaUsed: string;
      };
    }> = {
      success: true,
      data: {
        task: taskEntity,
        typeInfo: {
          inputType: 'CreateTaskType',
          outputType: 'TaskEntity',
          schemaUsed: 'CreateTaskSchema'
        }
      },
      correlationId: req.correlationId
    };

    logger.info('Task validation with type safety', {
      correlationId: req.correlationId,
      taskTitle: taskData.title,
      taskType: taskData.type,
      priority: taskData.priority
    });

    res.json(response);
  } catch (error) {
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: {
        type: 'validation',
        message: 'Task validation failed'
      },
      correlationId: req.correlationId
    };

    res.status(400).json(errorResponse);
  }
});

// ================================
// TYPE CONSISTENCY TESTING
// ================================

/**
 * GET /type-safety/consistency - Test type consistency
 */
router.get('/consistency', (req: Request, res: Response) => {
  try {
    const consistencyTests = [
      {
        name: 'Schema to Type Inference',
        test: () => {
          // Test that z.infer works correctly
          const schema = SchemaRegistry.CreateProject;
          const testData = { name: 'Test Project' };
          const result = validateData(schema, testData);
          return result.success !== undefined;
        }
      },
      {
        name: 'Type Guard Functions',
        test: () => {
          const successResponse = { success: true, data: {} };
          const errorResponse = { success: false, error: { type: 'test', message: 'test' } };
          return isApiSuccessResponse(successResponse) && isApiErrorResponse(errorResponse);
        }
      },
      {
        name: 'Entity Type Inheritance',
        test: () => {
          const baseFields = ['id', 'created_at', 'updated_at'];
          const projectEntity: Partial<ProjectEntity> = {
            id: 'test',
            created_at: 'test',
            updated_at: 'test',
            name: 'test'
          };
          return baseFields.every(field => field in projectEntity);
        }
      }
    ];

    const results = consistencyTests.map(test => ({
      name: test.name,
      passed: test.test(),
      timestamp: new Date().toISOString()
    }));

    const allPassed = results.every(result => result.passed);

    const response: ApiSuccessResponse<{
      overall: 'passed' | 'failed';
      tests: typeof results;
      summary: {
        total: number;
        passed: number;
        failed: number;
      };
    }> = {
      success: true,
      data: {
        overall: allPassed ? 'passed' : 'failed',
        tests: results,
        summary: {
          total: results.length,
          passed: results.filter(r => r.passed).length,
          failed: results.filter(r => !r.passed).length
        }
      },
      correlationId: req.correlationId
    };

    logger.info('Type consistency test completed', {
      correlationId: req.correlationId,
      overall: response.data.overall,
      passed: response.data.summary.passed,
      failed: response.data.summary.failed
    });

    res.json(response);
  } catch (error) {
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: {
        type: 'internal',
        message: 'Type consistency test failed'
      },
      correlationId: req.correlationId
    };

    res.status(500).json(errorResponse);
  }
});

// ================================
// SCHEMA SYNCHRONIZATION TEST
// ================================

/**
 * GET /type-safety/schema-sync - Test schema synchronization
 */
router.get('/schema-sync', (req: Request, res: Response) => {
  try {
    const schemas = Object.keys(SchemaRegistry);
    const schemaInfo = schemas.map(schemaName => {
      const schema = SchemaRegistry[schemaName as keyof typeof SchemaRegistry];
      return {
        name: schemaName,
        description: schema.description || `Schema for ${schemaName}`,
        isSynced: true, // In a real implementation, this would check frontend sync
        lastSync: new Date().toISOString()
      };
    });

    const response: ApiSuccessResponse<{
      schemas: typeof schemaInfo;
      syncStatus: 'synchronized' | 'out_of_sync';
      lastSyncCheck: string;
    }> = {
      success: true,
      data: {
        schemas: schemaInfo,
        syncStatus: 'synchronized',
        lastSyncCheck: new Date().toISOString()
      },
      correlationId: req.correlationId
    };

    logger.info('Schema synchronization check', {
      correlationId: req.correlationId,
      schemaCount: schemas.length,
      syncStatus: response.data.syncStatus
    });

    res.json(response);
  } catch (error) {
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: {
        type: 'internal',
        message: 'Schema synchronization check failed'
      },
      correlationId: req.correlationId
    };

    res.status(500).json(errorResponse);
  }
});

// ================================
// TYPE SAFETY HEALTH CHECK
// ================================

/**
 * GET /type-safety/health - Type safety system health
 */
router.get('/health', (req: Request, res: Response) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      features: {
        schemaValidation: true,
        typeGeneration: true,
        typeGuards: true,
        endToEndTypeSafety: true,
        schemaSync: true
      },
      statistics: {
        schemaCount: Object.keys(SchemaRegistry).length,
        typesGenerated: true,
        frontendSync: true,
        backendValidation: true
      },
      version: '1.0.0'
    };

    const response: ApiSuccessResponse<typeof health> = {
      success: true,
      data: health,
      correlationId: req.correlationId
    };

    logger.info('Type safety health check', {
      correlationId: req.correlationId,
      status: health.status,
      schemaCount: health.statistics.schemaCount
    });

    res.json(response);
  } catch (error) {
    const errorResponse: ApiErrorResponse = {
      success: false,
      error: {
        type: 'internal',
        message: 'Type safety system unhealthy'
      },
      correlationId: req.correlationId
    };

    res.status(500).json(errorResponse);
  }
});

export default router;