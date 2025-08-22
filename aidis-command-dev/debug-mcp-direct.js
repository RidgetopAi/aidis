#!/usr/bin/env node

/**
 * Debug script to test MCP server directly
 */

const http = require('http');

async function testMcpDirectly() {
    console.log('🔍 Testing MCP Server Directly\n');
    
    const tools = ['decision_search', 'decision_stats'];
    const testParams = {
        decision_search: { query: '*', limit: 20 },
        decision_stats: {}
    };
    
    for (const toolName of tools) {
        try {
            console.log(`\n📞 Testing ${toolName}...`);
            const result = await callMcpTool(toolName, testParams[toolName]);
            console.log('✅ Raw MCP Response:');
            console.log(JSON.stringify(result, null, 2));
            
            // Try to understand the response structure
            if (result && result.content && result.content[0] && result.content[0].text) {
                console.log('📝 Text content:');
                console.log(result.content[0].text);
            }
            
        } catch (error) {
            console.error(`❌ ${toolName} failed:`, error.message);
        }
    }
}

function callMcpTool(toolName, params) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ arguments: params });
        
        const options = {
            hostname: 'localhost',
            port: 8081,
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
                        resolve(parsed);
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                    }
                } catch (parseError) {
                    console.log('Raw response:', data);
                    reject(new Error(`Failed to parse response: ${parseError}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(new Error(`Request failed: ${error.message}`));
        });

        req.write(postData);
        req.end();
    });
}

testMcpDirectly().catch(console.error);
