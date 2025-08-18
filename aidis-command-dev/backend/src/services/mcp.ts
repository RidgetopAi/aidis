/**
 * MCP Service - Interface to AIDIS MCP Server
 * 
 * This service handles communication with the AIDIS MCP server
 * via HTTP endpoints at localhost:8080/mcp/tools/{toolName}
 */

import http from 'http';

export interface McpResult {
  success: boolean;
  data?: any;
  error?: string;
}

export class McpService {
  private static readonly REQUEST_TIMEOUT = 10000; // 10 seconds

  /**
   * Call an AIDIS MCP tool via HTTP endpoint
   */
  static async callTool(toolName: string, params: any): Promise<McpResult> {
    console.log(`[MCP] Calling ${toolName} with params:`, params);
    
    try {
      const result = await this.makeRequest(toolName, params);
      console.log(`[MCP] ${toolName} result:`, result);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error(`[MCP] ${toolName} failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Make HTTP request to AIDIS MCP server
   */
  private static async makeRequest(toolName: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({ arguments: params });
      
      const options = {
        hostname: 'localhost',
        port: process.env.AIDIS_MCP_PORT || 8081,
        path: `/mcp/tools/${toolName}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const parsed = JSON.parse(data);
              
              // Handle AIDIS response format
              if (parsed.isError) {
                reject(new Error(parsed.message || 'AIDIS MCP tool error'));
              } else {
                // Extract the actual result from AIDIS response
                let result = parsed.result !== undefined ? parsed.result : parsed;
                
                // Handle AIDIS text-based responses
                if (result && result.content && result.content[0] && result.content[0].text) {
                  const textResult = result.content[0].text;
                  
                  // Try to parse structured data from AIDIS text responses
                  if (toolName === 'naming_stats') {
                    result = this.parseNamingStats(textResult);
                  } else if (toolName === 'naming_check') {
                    result = this.parseNamingCheck(textResult);
                  } else if (toolName === 'naming_suggest') {
                    result = this.parseNamingSuggest(textResult);
                  } else {
                    // For other tools, return the text as-is for now
                    result = textResult;
                  }
                }
                
                resolve(result);
              }
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${parseError}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.setTimeout(this.REQUEST_TIMEOUT);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Parse naming statistics from AIDIS text response
   */
  private static parseNamingStats(text: string): any {
    const stats: any = {
      total_names: 0,
      compliance: 0,
      deprecated: 0,
      recent_activity: 0,
      by_type: {},
      by_project: {}
    };

    // Extract total names
    const totalMatch = text.match(/Total Names:\s*(\d+)/);
    if (totalMatch) stats.total_names = parseInt(totalMatch[1]);

    // Extract compliance
    const complianceMatch = text.match(/Convention Compliance:\s*(\d+)%/);
    if (complianceMatch) stats.compliance = parseInt(complianceMatch[1]);

    // Extract deprecated
    const deprecatedMatch = text.match(/Deprecated:\s*(\d+)/);
    if (deprecatedMatch) stats.deprecated = parseInt(deprecatedMatch[1]);

    // Extract recent activity
    const activityMatch = text.match(/Recent Activity:\s*(\d+)/);
    if (activityMatch) stats.recent_activity = parseInt(activityMatch[1]);

    // Extract by type
    const typeSection = text.match(/By Type:([\s\S]*?)(?:\n\n|$)/);
    if (typeSection) {
      const typeLines = typeSection[1].split('\n').filter(line => line.trim());
      for (const line of typeLines) {
        const typeMatch = line.match(/^\s*([^:]+):\s*(\d+)/);
        if (typeMatch) {
          stats.by_type[typeMatch[1].trim()] = parseInt(typeMatch[2]);
        }
      }
    }

    return stats;
  }

  /**
   * Parse naming check from AIDIS text response
   */
  private static parseNamingCheck(text: string): any {
    const available = text.toLowerCase().includes('available') || text.toLowerCase().includes('not registered');
    return {
      available,
      message: text
    };
  }

  /**
   * Parse naming suggestions from AIDIS text response
   */
  private static parseNamingSuggest(text: string): any {
    // For now, return the text and let the controller handle parsing
    // TODO: Implement proper parsing when AIDIS returns structured suggestions
    return {
      suggestions: [],
      message: text
    };
  }

  /**
   * Test AIDIS server connectivity
   */
  static async testConnection(): Promise<boolean> {
    try {
      await this.callTool('aidis_ping', { message: 'Connection test' });
      return true;
    } catch (error) {
      console.error('[MCP] Connection test failed:', error);
      return false;
    }
  }
}
