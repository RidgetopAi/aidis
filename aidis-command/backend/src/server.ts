import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import config from './config/environment';
import { logger, morganLogStream } from './config/logger';
import { initializeDatabase } from './database/connection';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { correlationMiddleware } from './middleware/correlationId';
import { requestLoggingMiddleware } from './middleware/requestLogger';
import { projectContextMiddleware } from './middleware/project';
import { requestMonitoringMiddleware } from './middleware/requestMonitoring';
import { webSocketService } from './services/websocket';
import apiRoutes from './routes';

/**
 * AIDIS Command Backend Server
 * REST API server for AIDIS database administration
 */

const app = express();

// Security middleware
app.use(helmet());

// CORS middleware
app.use(cors(config.cors));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Correlation ID middleware (must be first)
app.use(correlationMiddleware);

// Morgan HTTP logging (integrated with Winston)
app.use(morgan(config.nodeEnv === 'development' ? 'dev' : 'combined', {
  stream: morganLogStream
}));

// Request/response logging middleware
app.use(requestLoggingMiddleware);

// Request monitoring middleware (applied to all API routes)
app.use('/api', requestMonitoringMiddleware);

// Oracle Phase 1: Project context middleware (applied to all API routes)
app.use('/api', projectContextMiddleware);

// API routes
app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      message: 'AIDIS Command Backend API',
      version: config.app.version,
      timestamp: new Date().toISOString(),
      docs: '/api/health'
    }
  });
});

// 404 handler (must be before error handler)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

/**
 * Start server
 */
async function startServer(): Promise<void> {
  try {
    // Initialize logging
    logger.info('Starting AIDIS Command Backend...', {
      version: config.app.version,
      environment: config.nodeEnv,
      logLevel: config.logging.level,
      dbLogLevel: config.logging.dbLogLevel
    });

    // Initialize database connection
    await initializeDatabase();
    logger.info('Database initialized successfully');

    // Start HTTP server
    const server = app.listen(config.port, () => {
      logger.info('AIDIS Command Backend started successfully', {
        port: config.port,
        environment: config.nodeEnv,
        database: `${config.database.database}@${config.database.host}:${config.database.port}`,
        endpoints: [
          'GET /api/health - Server health',
          'GET /api/db-status - Database status', 
          'GET /api/version - Version info'
        ]
      });

      console.log('🚀 AIDIS Command Backend started');
      console.log(`📍 Server running on http://localhost:${config.port}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`📊 Logging: ${config.logging.level} (DB: ${config.logging.dbLogLevel})`);
    });

    // Initialize WebSocket server
    webSocketService.initialize(server);
    logger.info('WebSocket server initialized', { endpoint: '/ws' });

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`, { 
        signal,
        timestamp: new Date().toISOString()
      });

      server.close(() => {
        logger.info('HTTP server closed successfully');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
if (require.main === module) {
  startServer();
}

export default app;
