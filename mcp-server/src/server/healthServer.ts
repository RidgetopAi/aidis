/**
 * Health Check Server
 * Provides HTTP health endpoints and MCP tool HTTP bridge
 */

import * as http from 'http';
import { logger, CorrelationIdManager } from '../utils/logger.js';
import { RequestLogger } from '../middleware/requestLogger.js';
import { ErrorHandler } from '../utils/errorHandler.js';
import { portManager } from '../utils/portManager.js';
import { dbPool, poolHealthCheck } from '../services/databasePool.js';
import { AIDIS_TOOL_DEFINITIONS } from '../config/toolDefinitions.js';
import { ProjectController } from '../api/controllers/projectController.js';

/**
 * HTTP Health Check Server
 * Provides health endpoints and MCP tool HTTP bridge
 */
export class HealthServer {
  private server: http.Server | null = null;
  private port: number = 8080;
  private dbHealthy: boolean = false;
  private circuitBreakerState: string = 'closed';
  private mcpToolExecutor?: (toolName: string, args: any) => Promise<any>;
  private parameterDeserializer?: (args: any) => any;
  private projectController: ProjectController;

  constructor(
    mcpToolExecutor?: (toolName: string, args: any) => Promise<any>,
    parameterDeserializer?: (args: any) => any
  ) {
    this.mcpToolExecutor = mcpToolExecutor;
    this.parameterDeserializer = parameterDeserializer;
    this.projectController = new ProjectController();
  }

  /**
   * Set database health status
   */
  setDatabaseHealth(healthy: boolean): void {
    this.dbHealthy = healthy;
  }

  /**
   * Set circuit breaker state
   */
  setCircuitBreakerState(state: string): void {
    this.circuitBreakerState = state;
  }

  /**
   * Start the health server
   */
  async start(): Promise<number> {
    // Get port from port manager
    this.port = await portManager.assignPort('aidis-mcp');

    this.server = http.createServer(async (req, res) => {
      // CORS headers for cross-origin requests from frontend
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Content-Type', 'application/json');

      // Handle preflight OPTIONS requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (req.url === '/healthz' || req.url === '/health') {
        await this.handleHealthCheck(req, res);
      } else if (req.url === '/readyz') {
        await this.handleReadinessCheck(req, res);
      } else if (req.url === '/livez') {
        await this.handleLivenessCheck(req, res);
      } else if (req.url === '/health/mcp') {
        await this.handleMcpHealthCheck(req, res);
      } else if (req.url === '/health/database') {
        await this.handleDatabaseHealthCheck(req, res);
      } else if (req.url === '/health/embeddings') {
        await this.handleEmbeddingsHealthCheck(req, res);
      } else if (req.url === '/mcp/tools/schemas' && req.method === 'GET') {
        await this.handleToolSchemasRequest(req, res);
      } else if (req.url === '/mcp/tools' && req.method === 'GET') {
        await this.handleToolListRequest(req, res);
      } else if (req.url?.startsWith('/mcp/tools/') && req.method === 'POST') {
        await this.handleMcpToolRequest(req, res);
      } else if (req.url?.startsWith('/v2/mcp/')) {
        await this.handleV2McpRequest(req, res);
      } else if (req.url?.startsWith('/api/v2/projects/')) {
        await this.handleProjectApiRequest(req, res);
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    return new Promise<number>((resolve, reject) => {
      this.server!.listen(this.port, async () => {
        try {
          const actualPort = (this.server!.address() as any)?.port || this.port;

          // Register the service with its actual port
          await portManager.registerService('aidis-mcp', actualPort, '/healthz');
          await portManager.logPortConfiguration('aidis-mcp', actualPort);

          logger.info(`✅ Health endpoints available:`);
          logger.info(`   🏥 Liveness:  http://localhost:${actualPort}/healthz`);
          logger.info(`   🎯 Readiness: http://localhost:${actualPort}/readyz`);

          resolve(actualPort);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Stop the health server
   */
  async stop(): Promise<void> {
    if (this.server) {
      logger.info('🏥 Closing health check server...');
      await new Promise<void>((resolve) => {
        this.server!.close(async () => {
          // Unregister the service from port registry
          await portManager.unregisterService('aidis-mcp');
          logger.info('✅ Health check server closed and unregistered');
          resolve();
        });
      });
      this.server = null;
    }
  }

  /**
   * Handle basic health check endpoint
   */
  private async handleHealthCheck(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const startTime = Date.now();
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pid: process.pid,
      version: '0.1.0-hardened'
    };

    res.writeHead(200);
    res.end(JSON.stringify(healthData));

    RequestLogger.logHealthCheck('/healthz', 'healthy', Date.now() - startTime);
  }

  /**
   * Handle readiness check endpoint
   */
  private async handleReadinessCheck(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const startTime = Date.now();

    // Check connection pool health
    const poolHealth = await poolHealthCheck();
    const poolStats = dbPool.getStats();

    const isReady = this.dbHealthy &&
                   this.circuitBreakerState !== 'open' &&
                   poolHealth.healthy;

    const readinessData = {
      status: isReady ? 'ready' : 'not_ready',
      database: this.dbHealthy ? 'connected' : 'disconnected',
      circuit_breaker: this.circuitBreakerState,
      pool: {
        healthy: poolHealth.healthy,
        total_connections: poolStats.totalCount,
        active_connections: poolStats.activeQueries,
        pool_utilization: `${poolStats.poolUtilization.toFixed(1)}%`,
        health_status: poolStats.healthStatus
      },
      timestamp: new Date().toISOString()
    };

    res.writeHead(isReady ? 200 : 503);
    res.end(JSON.stringify(readinessData));

    RequestLogger.logHealthCheck('/readyz', isReady ? 'healthy' : 'unhealthy', Date.now() - startTime);
  }

  /**
   * Handle liveness check endpoint
   */
  private async handleLivenessCheck(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const startTime = Date.now();
    const livenessData = {
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      pid: process.pid
    };

    res.writeHead(200);
    res.end(JSON.stringify(livenessData));

    RequestLogger.logHealthCheck('/livez', 'healthy', Date.now() - startTime);
  }

  /**
   * Handle MCP service health check
   */
  private async handleMcpHealthCheck(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const startTime = Date.now();
    const mcpHealth = {
      status: 'healthy',
      transport: 'stdio',
      tools_available: AIDIS_TOOL_DEFINITIONS.length,
      timestamp: new Date().toISOString(),
      response_time_ms: Date.now() - startTime
    };

    res.writeHead(200);
    res.end(JSON.stringify(mcpHealth));
    RequestLogger.logHealthCheck('/health/mcp', mcpHealth.status as 'healthy' | 'unhealthy', Date.now() - startTime);
  }

  /**
   * Handle database health check
   */
  private async handleDatabaseHealthCheck(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const startTime = Date.now();
    const poolStats = dbPool.getStats();
    const dbHealth = {
      status: this.dbHealthy ? 'healthy' : 'unhealthy',
      connected: this.dbHealthy,
      pool: {
        total: poolStats.totalCount,
        active: poolStats.activeQueries,
        idle: poolStats.idleCount,
        utilization: `${poolStats.poolUtilization.toFixed(1)}%`
      },
      timestamp: new Date().toISOString(),
      response_time_ms: Date.now() - startTime
    };

    res.writeHead(this.dbHealthy ? 200 : 503);
    res.end(JSON.stringify(dbHealth));
    RequestLogger.logHealthCheck('/health/database', dbHealth.status as 'healthy' | 'unhealthy', Date.now() - startTime);
  }

  /**
   * Handle embeddings health check
   */
  private async handleEmbeddingsHealthCheck(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const startTime = Date.now();
    const embeddingsHealth = {
      status: 'healthy',
      service: 'local-transformers-js',
      model: 'Xenova/all-MiniLM-L6-v2',
      dimensions: 384,
      timestamp: new Date().toISOString(),
      response_time_ms: Date.now() - startTime
    };

    res.writeHead(200);
    res.end(JSON.stringify(embeddingsHealth));
    RequestLogger.logHealthCheck('/health/embeddings', embeddingsHealth.status as 'healthy' | 'unhealthy', Date.now() - startTime);
  }

  /**
   * Handle tool schemas request
   */
  private async handleToolSchemasRequest(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        tools: AIDIS_TOOL_DEFINITIONS,
        count: AIDIS_TOOL_DEFINITIONS.length,
        timestamp: new Date().toISOString(),
        note: 'Complete MCP tool definitions with inputSchema for all AIDIS tools'
      }));
    } catch (error) {
      const err = error as Error;
      res.writeHead(500);
      res.end(JSON.stringify({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString()
      }));
    }
  }

  /**
   * Handle tool list request
   */
  private async handleToolListRequest(_req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        tools: AIDIS_TOOL_DEFINITIONS.map(tool => ({
          ...tool,
          endpoint: `/mcp/tools/${tool.name}`
        })),
        count: AIDIS_TOOL_DEFINITIONS.length,
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      const err = error as Error;
      res.writeHead(500);
      res.end(JSON.stringify({
        success: false,
        error: err.message,
        timestamp: new Date().toISOString()
      }));
    }
  }

  /**
   * Handle MCP Tool Requests via HTTP (for proxy forwarding)
   */
  private async handleMcpToolRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.mcpToolExecutor) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'MCP tool executor not configured' }));
      return;
    }

    let toolName: string | undefined;
    let requestData: any = {};

    try {
      // Extract tool name from URL: /mcp/tools/{toolName}
      toolName = req.url?.split('/mcp/tools/')[1];
      if (!toolName) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Tool name required' }));
        return;
      }

      // Parse request body
      let body = '';
      req.on('data', chunk => body += chunk);

      await new Promise<void>((resolve) => {
        req.on('end', resolve);
      });

      requestData = body ? JSON.parse(body) : {};
      const rawArgs = requestData.arguments || requestData.args || {};

      // Fix array parameter deserialization for Claude Code compatibility
      const args = this.parameterDeserializer ? this.parameterDeserializer(rawArgs) : rawArgs;

      // Execute the tool using the same logic as MCP handler
      const result = await this.mcpToolExecutor(toolName, args);

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        result
      }));

    } catch (error: any) {
      // Enhanced error handling with logging
      let responseError = error instanceof Error ? error : new Error(String(error));
      try {
        ErrorHandler.handleMcpError(responseError, toolName || 'unknown', requestData.arguments, {
          component: 'HTTP_ADAPTER',
          operation: 'mcp_tool_request',
          correlationId: CorrelationIdManager.get(),
          additionalContext: {
            httpRequest: true,
            url: req.url,
            method: req.method
          }
        });
      } catch (loggedError) {
        responseError = loggedError as Error;
      }

      res.writeHead(500);
      res.end(JSON.stringify({
        success: false,
        error: responseError.message,
        type: responseError.constructor.name,
        correlationId: CorrelationIdManager.get()
      }));
    }
  }

  /**
   * Handle V2 MCP API Requests (Phase 5 Integration - Simulation)
   */
  private async handleV2McpRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const path = req.url?.replace('/v2/mcp', '') || '/';

      if (path === '/') {
        // API info endpoint
        res.writeHead(200);
        res.end(JSON.stringify({
          version: '2.0.0',
          compatibleVersions: ['2.0.0', '2.1.0'],
          endpoints: {
            tools: '/v2/mcp/tools/:toolName',
            list: '/v2/mcp/tools',
            health: '/v2/mcp/health'
          }
        }));
      } else if (path === '/health') {
        // Health endpoint
        res.writeHead(200);
        res.end(JSON.stringify({
          status: 'healthy',
          version: '2.0.0',
          timestamp: new Date().toISOString(),
          toolsAvailable: AIDIS_TOOL_DEFINITIONS.length
        }));
      } else if (path === '/tools' && req.method === 'GET') {
        // List tools endpoint
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          version: '2.0.0',
          data: {
            tools: AIDIS_TOOL_DEFINITIONS.map(tool => ({
              name: tool.name,
              endpoint: `/v2/mcp/tools/${tool.name}`
            })),
            totalCount: AIDIS_TOOL_DEFINITIONS.length
          }
        }));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({
          success: false,
          error: 'V2 API endpoint not found',
          version: '2.0.0'
        }));
      }
    } catch (error: any) {
      logger.error('V2 MCP API error', {
        error: error.message,
        url: req.url,
        method: req.method
      } as any);

      res.setHeader('Content-Type', 'application/json');
      res.writeHead(500);
      res.end(JSON.stringify({
        success: false,
        error: 'Internal server error',
        version: '2.0.0'
      }));
    }
  }

  /**
   * Handle Project REST API Requests
   */
  private async handleProjectApiRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      // Extract route from URL: /api/v2/projects/{id}/set-primary
      const urlPattern = /^\/api\/v2\/projects\/([^\/]+)\/set-primary$/;
      const match = req.url?.match(urlPattern);

      if (!match) {
        res.writeHead(404);
        res.end(JSON.stringify({
          success: false,
          error: 'Project API endpoint not found'
        }));
        return;
      }

      const projectId = match[1];

      if (req.method === 'POST') {
        // Create mock Express Request and Response objects
        const mockReq = {
          params: { id: projectId },
          body: {}
        } as any;

        let responseData: any = null;
        let statusCode = 200;

        const mockRes = {
          status: (code: number) => {
            statusCode = code;
            return mockRes;
          },
          json: (data: any) => {
            responseData = data;
          }
        } as any;

        // Call the controller
        await this.projectController.setPrimary(mockReq, mockRes);

        // Send the response
        res.writeHead(statusCode);
        res.end(JSON.stringify(responseData));
      } else {
        res.writeHead(405);
        res.end(JSON.stringify({
          success: false,
          error: 'Method not allowed. Use POST.'
        }));
      }
    } catch (error: any) {
      logger.error('Project API error', {
        error: error.message,
        url: req.url,
        method: req.method
      } as any);

      res.writeHead(500);
      res.end(JSON.stringify({
        success: false,
        error: error.message || 'Internal server error'
      }));
    }
  }
}
