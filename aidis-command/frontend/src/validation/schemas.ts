/**
 * TR003-6: Shared Validation Schemas
 * Zod schemas for form validation contracts between frontend and backend
 */

import { z } from 'zod';

// ================================
// CORE VALIDATION UTILITIES
// ================================

// Common field validations
export const requiredString = (fieldName: string, minLength = 1, maxLength = 255) =>
  z.string()
    .min(minLength, `${fieldName} is required`)
    .max(maxLength, `${fieldName} must be less than ${maxLength} characters`)
    .trim();

export const optionalString = (maxLength = 255) =>
  z.string()
    .max(maxLength, `Field must be less than ${maxLength} characters`)
    .trim()
    .optional();

export const email = z.string()
  .email('Please enter a valid email address')
  .max(255, 'Email must be less than 255 characters');

export const url = z.string()
  .url('Please enter a valid URL')
  .or(z.literal(''))
  .optional();

export const positiveInteger = z.number()
  .int('Must be an integer')
  .positive('Must be a positive number');

export const tags = z.array(z.string().min(1).max(50))
  .max(10, 'Maximum 10 tags allowed')
  .optional();

// ================================
// PROJECT VALIDATION SCHEMAS
// ================================

export const CreateProjectSchema = z.object({
  name: requiredString('Project name', 2, 100),
  description: optionalString(500),
  git_repo_url: url,
  root_directory: optionalString(255),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const UpdateProjectSchema = z.object({
  name: optionalString(100),
  description: optionalString(500),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  git_repo_url: url,
  root_directory: optionalString(255),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type CreateProjectData = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectData = z.infer<typeof UpdateProjectSchema>;

// ================================
// TASK VALIDATION SCHEMAS
// ================================

export const TaskTypeSchema = z.enum([
  'general', 'feature', 'bug', 'refactor', 'test', 'docs', 'devops'
]);

export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

export const TaskStatusSchema = z.enum([
  'pending', 'in_progress', 'completed', 'blocked', 'cancelled'
]);

export const CreateTaskSchema = z.object({
  title: requiredString('Task title', 2, 500),
  description: optionalString(2000),
  type: TaskTypeSchema.default('general'),
  priority: TaskPrioritySchema,
  assigned_to: optionalString(100),
  project_id: z.string().uuid('Invalid project ID'),
  tags: tags,
});

export const UpdateTaskSchema = z.object({
  title: optionalString(500),
  description: optionalString(2000),
  type: TaskTypeSchema.optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  assigned_to: optionalString(100),
  tags: tags,
});

export type CreateTaskData = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskData = z.infer<typeof UpdateTaskSchema>;

// ================================
// CONTEXT VALIDATION SCHEMAS
// ================================

export const ContextTypeSchema = z.enum([
  'code', 'decision', 'research', 'issue', 'note', 'error', 'test'
]);

export const CreateContextSchema = z.object({
  content: requiredString('Content', 10, 10000),
  type: ContextTypeSchema,
  tags: tags,
  metadata: z.record(z.string(), z.any()).optional(),
});

export type CreateContextData = z.infer<typeof CreateContextSchema>;

// ================================
// SESSION VALIDATION SCHEMAS
// ================================

export const UpdateSessionSchema = z.object({
  title: optionalString(200),
  description: optionalString(1000),
});

export type UpdateSessionData = z.infer<typeof UpdateSessionSchema>;

// ================================
// DECISION VALIDATION SCHEMAS
// ================================

export const DecisionStatusSchema = z.enum([
  'proposed', 'accepted', 'rejected', 'superseded'
]);

export const CreateDecisionSchema = z.object({
  title: requiredString('Decision title', 5, 200),
  context: requiredString('Context', 10, 2000),
  decision: requiredString('Decision', 10, 2000),
  consequences: optionalString(2000),
  status: DecisionStatusSchema.default('proposed'),
  tags: tags,
});

export type CreateDecisionData = z.infer<typeof CreateDecisionSchema>;

// ================================
// NAMING VALIDATION SCHEMAS
// ================================

export const NamingTypeSchema = z.enum([
  'variable', 'function', 'class', 'component', 'file', 'directory', 'database', 'api'
]);

export const RegisterNamingSchema = z.object({
  name: requiredString('Name', 2, 100),
  type: NamingTypeSchema,
  description: optionalString(500),
  project_id: z.string().uuid('Invalid project ID').optional(),
});

export type RegisterNamingData = z.infer<typeof RegisterNamingSchema>;

// ================================
// AIDIS API VALIDATION SCHEMAS
// ================================

export const AidisToolCallSchema = z.object({
  toolName: requiredString('Tool name', 1, 100),
  arguments: z.record(z.string(), z.any()).default({}),
});

export const AidisContextStoreSchema = z.object({
  content: requiredString('Content', 1, 10000),
  type: z.string().min(1, 'Type is required').max(50, 'Type too long'),
  tags: z.array(z.string().min(1).max(50)).optional(),
});

export const AidisContextSearchSchema = z.object({
  query: requiredString('Search query', 1, 200),
  limit: z.number().int().min(1).max(100).default(10),
  type: optionalString(50),
});

export const AidisProjectSwitchSchema = z.object({
  project: requiredString('Project name', 1, 100),
});

export type AidisToolCallData = z.infer<typeof AidisToolCallSchema>;
export type AidisContextStoreData = z.infer<typeof AidisContextStoreSchema>;
export type AidisContextSearchData = z.infer<typeof AidisContextSearchSchema>;
export type AidisProjectSwitchData = z.infer<typeof AidisProjectSwitchSchema>;

// ================================
// VALIDATION ERROR FORMATTING
// ================================

export interface FormFieldError {
  field: string;
  message: string;
  code?: string;
}

export const formatZodError = (error: z.ZodError): FormFieldError[] => {
  return error.issues.map(issue => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
};

export const formatFieldErrors = (errors: FormFieldError[]): Record<string, string> => {
  return errors.reduce((acc, error) => {
    acc[error.field] = error.message;
    return acc;
  }, {} as Record<string, string>);
};

// ================================
// SCHEMA REGISTRY
// ================================

export const SchemaRegistry = {
  // Projects
  CreateProject: CreateProjectSchema,
  UpdateProject: UpdateProjectSchema,

  // Tasks
  CreateTask: CreateTaskSchema,
  UpdateTask: UpdateTaskSchema,

  // Contexts
  CreateContext: CreateContextSchema,

  // Sessions
  UpdateSession: UpdateSessionSchema,

  // Decisions
  CreateDecision: CreateDecisionSchema,

  // Naming
  RegisterNaming: RegisterNamingSchema,

  // AIDIS API
  AidisToolCall: AidisToolCallSchema,
  AidisContextStore: AidisContextStoreSchema,
  AidisContextSearch: AidisContextSearchSchema,
  AidisProjectSwitch: AidisProjectSwitchSchema,
} as const;

export type SchemaName = keyof typeof SchemaRegistry;

export const getSchema = (schemaName: SchemaName) => {
  return SchemaRegistry[schemaName];
};

// ================================
// VALIDATION UTILITIES
// ================================

export const validateData = <T>(schema: z.ZodSchema<T>, data: any): {
  success: boolean;
  data?: T;
  errors?: FormFieldError[];
} => {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: formatZodError(error) };
    }
    return {
      success: false,
      errors: [{ field: 'general', message: 'Validation failed' }]
    };
  }
};

export const validatePartial = <T>(schema: z.ZodSchema<T>, data: any): {
  success: boolean;
  data?: Partial<T>;
  errors?: FormFieldError[];
} => {
  try {
    // For partial validation, we'll use a more permissive approach
    // First try to validate with the full schema, but allow missing fields
    const result = validateData(schema, data);
    if (result.success) {
      return { success: true, data: result.data };
    }

    // If full validation fails, check if it's just due to missing required fields
    // In that case, we'll consider it a successful partial validation
    const missingFieldErrors = result.errors?.filter(error =>
      error.message.includes('required') || error.message.includes('is required')
    ) || [];

    const otherErrors = result.errors?.filter(error =>
      !error.message.includes('required') && !error.message.includes('is required')
    ) || [];

    // If only missing field errors, it's a successful partial validation
    if (otherErrors.length === 0) {
      return { success: true, data: data as Partial<T> };
    }

    // Otherwise, return the validation errors
    return { success: false, errors: otherErrors };
  } catch (error) {
    return {
      success: false,
      errors: [{ field: 'general', message: 'Validation failed' }]
    };
  }
};

export default SchemaRegistry;