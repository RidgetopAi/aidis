/**
 * TR004-6: Backend API Contract Enforcement Middleware
 * Validates incoming requests against shared Zod schemas
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../config/logger';
import { validateData, ValidationError, SchemaRegistry, SchemaName } from '../validation/schemas';

// ================================
// VALIDATION MIDDLEWARE TYPES
// ================================

interface ValidationOptions {
  schema: z.ZodSchema<any>;
  source: 'body' | 'query' | 'params';
  required: boolean;
  customErrorMessage: string | undefined;
}

interface ValidationResult {
  success: boolean;
  data?: any;
  errors?: ValidationError[];
}

// ================================
// CORE VALIDATION MIDDLEWARE
// ================================

/**
 * Generic validation middleware factory
 */
export const createValidationMiddleware = (options: ValidationOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const { schema, source, required = true, customErrorMessage } = options;

      // Get data to validate based on source
      const dataToValidate = req[source];

      // Check if data is required
      if (required && (!dataToValidate || Object.keys(dataToValidate).length === 0)) {
        logger.warn('Validation failed: Missing required data', {
          correlationId: req.correlationId,
          source,
          endpoint: req.path,
          method: req.method
        });

        return res.status(400).json({
          success: false,
          error: {
            type: 'validation',
            message: customErrorMessage || `${source} data is required`,
            details: [{ field: source, message: 'Required data is missing' }]
          },
          correlationId: req.correlationId
        });
      }

      // Skip validation if data is empty and not required
      if (!required && (!dataToValidate || Object.keys(dataToValidate).length === 0)) {
        return next();
      }

      // Validate the data
      const result = validateData(schema, dataToValidate);

      if (!result.success) {
        logger.warn('Validation failed: Invalid data format', {
          correlationId: req.correlationId,
          source,
          endpoint: req.path,
          method: req.method,
          errors: result.errors,
          data: JSON.stringify(dataToValidate, null, 2)
        });

        return res.status(400).json({
          success: false,
          error: {
            type: 'validation',
            message: customErrorMessage || 'Validation failed',
            details: result.errors
          },
          correlationId: req.correlationId
        });
      }

      // Store validated data back to request
      req[source] = result.data;

      // Log successful validation
      logger.debug('Validation successful', {
        correlationId: req.correlationId,
        source,
        endpoint: req.path,
        method: req.method,
        fieldsValidated: Object.keys(result.data || {})
      });

      next();
    } catch (error) {
      logger.error('Validation middleware error', {
        correlationId: req.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        source: options.source,
        endpoint: req.path,
        method: req.method
      });

      res.status(500).json({
        success: false,
        error: {
          type: 'internal',
          message: 'Internal validation error'
        },
        correlationId: req.correlationId
      });
    }
  };
};

// ================================
// SCHEMA-SPECIFIC MIDDLEWARE
// ================================

/**
 * Validate request body against a schema from the registry
 */
export const validateBody = (schemaName: SchemaName, options?: { required?: boolean; customErrorMessage?: string }) => {
  const schema = SchemaRegistry[schemaName];
  return createValidationMiddleware({
    schema,
    source: 'body',
    required: options?.required ?? true,
    customErrorMessage: options?.customErrorMessage
  });
};

/**
 * Validate query parameters against a schema
 */
export const validateQuery = (schema: z.ZodSchema<any>, options?: { required?: boolean; customErrorMessage?: string }) => {
  return createValidationMiddleware({
    schema,
    source: 'query',
    required: options?.required ?? true,
    customErrorMessage: options?.customErrorMessage
  });
};

/**
 * Validate route parameters against a schema
 */
export const validateParams = (schema: z.ZodSchema<any>, options?: { required?: boolean; customErrorMessage?: string }) => {
  return createValidationMiddleware({
    schema,
    source: 'params',
    required: options?.required ?? true,
    customErrorMessage: options?.customErrorMessage
  });
};

// ================================
// COMMON PARAMETER SCHEMAS
// ================================

export const UUIDParamSchema = z.object({
  id: z.string().uuid('Invalid UUID format')
});

export const ProjectParamSchema = z.object({
  projectId: z.string().uuid('Invalid project ID format')
});

export const TaskParamSchema = z.object({
  taskId: z.string().uuid('Invalid task ID format')
});

export const SessionParamSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID format')
});

export const PaginationQuerySchema = z.object({
  page: z.string().regex(/^\d+$/, 'Page must be a number').transform(Number).optional(),
  limit: z.string().regex(/^\d+$/, 'Limit must be a number').transform(Number).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional()
}).passthrough();

// ================================
// CONVENIENT VALIDATION HELPERS
// ================================

/**
 * Validate UUID parameter
 */
export const validateUUIDParam = () => validateParams(UUIDParamSchema);

/**
 * Validate project ID parameter
 */
export const validateProjectParam = () => validateParams(ProjectParamSchema);

/**
 * Validate task ID parameter
 */
export const validateTaskParam = () => validateParams(TaskParamSchema);

/**
 * Validate session ID parameter
 */
export const validateSessionParam = () => validateParams(SessionParamSchema);

/**
 * Validate pagination query parameters
 */
export const validatePagination = () => validateQuery(PaginationQuerySchema, { required: false });

// ================================
// CONTRACT ENFORCEMENT MIDDLEWARE
// ================================

/**
 * TR004-6: Contract enforcement middleware
 * Ensures all API endpoints have proper validation
 */
export const contractEnforcementMiddleware = (req: Request, _res: Response, next: NextFunction) => {
  const endpoint = req.path;
  const method = req.method;

  // Log contract validation attempt
  logger.debug('Contract enforcement check', {
    correlationId: req.correlationId,
    endpoint,
    method,
    hasBody: Object.keys(req.body || {}).length > 0,
    hasQuery: Object.keys(req.query || {}).length > 0,
    hasParams: Object.keys(req.params || {}).length > 0
  });

  // Contract enforcement is handled by individual route validators
  // This middleware provides centralized logging and monitoring
  next();
};

// ================================
// VALIDATION ERROR FORMATTER
// ================================

export const formatValidationResponse = (
  success: boolean,
  data?: any,
  errors?: ValidationError[],
  correlationId?: string
) => {
  if (success) {
    return {
      success: true,
      data,
      correlationId
    };
  }

  return {
    success: false,
    error: {
      type: 'validation',
      message: 'Validation failed',
      details: errors
    },
    correlationId
  };
};

// ================================
// VALIDATION STATISTICS
// ================================

interface ValidationStats {
  totalValidations: number;
  successfulValidations: number;
  failedValidations: number;
  errorsByField: Record<string, number>;
  errorsByEndpoint: Record<string, number>;
}

class ValidationStatsCollector {
  private stats: ValidationStats = {
    totalValidations: 0,
    successfulValidations: 0,
    failedValidations: 0,
    errorsByField: {},
    errorsByEndpoint: {}
  };

  recordValidation(success: boolean, endpoint: string, errors?: ValidationError[]) {
    this.stats.totalValidations++;

    if (success) {
      this.stats.successfulValidations++;
    } else {
      this.stats.failedValidations++;
      this.stats.errorsByEndpoint[endpoint] = (this.stats.errorsByEndpoint[endpoint] || 0) + 1;

      errors?.forEach(error => {
        this.stats.errorsByField[error.field] = (this.stats.errorsByField[error.field] || 0) + 1;
      });
    }
  }

  getStats(): ValidationStats {
    return { ...this.stats };
  }

  reset() {
    this.stats = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      errorsByField: {},
      errorsByEndpoint: {}
    };
  }
}

export const validationStats = new ValidationStatsCollector();

// ================================
// EXPORTS
// ================================

export {
  ValidationOptions,
  ValidationResult,
  ValidationError,
  ValidationStats
};
