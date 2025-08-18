import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode: number;
  isOperational: boolean;
}

/**
 * Global error handler middleware
 */
export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const { statusCode = 500, message, stack } = error;
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Log detailed error information server-side (always include stack for debugging)
  console.error('Error occurred:', {
    method: req.method,
    path: req.path,
    statusCode,
    message,
    stack, // Always log stack server-side for debugging
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // Create safe error response (hide sensitive information in production)
  const errorResponse: any = {
    success: false,
    error: {
      message: isDevelopment ? message : getGenericErrorMessage(statusCode),
      statusCode,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method
    }
  };

  // Only include stack trace in development
  if (isDevelopment) {
    errorResponse.error.stack = stack;
    errorResponse.error.originalMessage = message; // Keep original for dev
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * Get generic error message for production to avoid information disclosure
 */
const getGenericErrorMessage = (statusCode: number): string => {
  switch (statusCode) {
    case 400:
      return 'Bad request';
    case 401:
      return 'Authentication required';
    case 403:
      return 'Access forbidden';
    case 404:
      return 'Resource not found';
    case 429:
      return 'Too many requests';
    case 500:
    default:
      return 'Internal server error';
  }
};

/**
 * Create operational error
 */
export const createError = (message: string, statusCode: number = 500): AppError => {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};

/**
 * Async error wrapper for route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 handler - should be last middleware before error handler
 */
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const error = createError(`Route ${req.originalUrl} not found`, 404);
  next(error);
};
