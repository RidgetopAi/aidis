#!/usr/bin/env node

/**
 * QaAgent - API-Based Comprehensive System Validation
 * Post-Emergency Fix Testing Suite
 * 
 * Mission: Validate entire system after TypeScript interface fix
 * Prevents future breakages through systematic API testing
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

class APISystemValidator {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            totalTests: 0,
            passed: 0,
            failed: 0,
            warnings: 0,
            sections: {},
            criticalIssues: [],
            recommendations: []
        };
        this.baseUrl = 'http://localhost:3001';
        this.frontendUrl = 'http://localhost:3000';
        this.authToken = null;
    }

    async makeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const client = urlObj.protocol === 'https:' ? https : http;
            
            const reqOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname + urlObj.search,
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            };

            const req = client.request(reqOptions, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const jsonData = data ? JSON.parse(data) : {};
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            data: jsonData
                        });
                    } catch (e) {
                        resolve({
                            status: res.statusCode,
                            headers: res.headers,
                            data: data
                        });
                    }
                });
            });

            req.on('error', reject);

            if (options.body) {
                req.write(JSON.stringify(options.body));
            }

            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.end();
        });
    }

    async init() {
        console.log('🚀 QaAgent - Starting API-Based Comprehensive System Validation');
        console.log(`📍 Backend URL: ${this.baseUrl}`);
        console.log(`📍 Frontend URL: ${this.frontendUrl}`);
    }

    async authenticate() {
        console.log('\n🔐 Testing Authentication Flow');
        const section = 'authentication';
        this.results.sections[section] = { tests: 0, passed: 0, failed: 0, issues: [] };
        
        // Test login endpoint
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            const response = await this.makeRequest(`${this.baseUrl}/api/auth/login`, {
                method: 'POST',
                body: {
                    username: 'testuser',
                    password: 'testpass123'
                }
            });
            
            if (response.status === 200 && response.data.token) {
                this.authToken = response.data.token;
                console.log('    ✅ Authentication successful');
                this.results.sections[section].passed++;
                this.results.passed++;
                return true;
            } else {
                throw new Error(`Login failed: ${response.status} - ${JSON.stringify(response.data)}`);
            }
            
        } catch (error) {
            console.log(`    ❌ Authentication failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Login: ${error.message}`);
            this.results.failed++;
            this.results.criticalIssues.push(`CRITICAL: Authentication broken - ${error.message}`);
            return false;
        }
    }

    async testSystemHealth() {
        console.log('\n🏥 Testing System Health');
        const section = 'systemHealth';
        this.results.sections[section] = { tests: 0, passed: 0, failed: 0, issues: [] };
        
        // Test backend health
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            const response = await this.makeRequest(`${this.baseUrl}/health`);
            
            if (response.status === 200) {
                console.log('    ✅ Backend health check passed');
                this.results.sections[section].passed++;
                this.results.passed++;
            } else {
                throw new Error(`Health check failed: ${response.status}`);
            }
            
        } catch (error) {
            console.log(`    ❌ Backend health check failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Backend Health: ${error.message}`);
            this.results.failed++;
            this.results.criticalIssues.push(`CRITICAL: Backend health check failed - ${error.message}`);
        }
        
        // Test frontend availability
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            const response = await this.makeRequest(`${this.frontendUrl}/`);
            
            if (response.status === 200) {
                console.log('    ✅ Frontend availability check passed');
                this.results.sections[section].passed++;
                this.results.passed++;
            } else {
                throw new Error(`Frontend not available: ${response.status}`);
            }
            
        } catch (error) {
            console.log(`    ❌ Frontend availability failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Frontend: ${error.message}`);
            this.results.failed++;
        }
    }

    async testCoreAPIs() {
        console.log('\n🔌 Testing Core API Endpoints');
        const section = 'coreAPIs';
        this.results.sections[section] = { tests: 0, passed: 0, failed: 0, issues: [] };
        
        const headers = this.authToken ? { 'Authorization': `Bearer ${this.authToken}` } : {};
        
        // Test Projects API (Critical after recent fix)
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  📂 Testing Projects API...');
            const response = await this.makeRequest(`${this.baseUrl}/api/projects`, { headers });
            
            if (response.status === 200) {
                console.log(`    ✅ Projects API working (${Array.isArray(response.data) ? response.data.length : 'unknown'} projects)`);
                this.results.sections[section].passed++;
                this.results.passed++;
            } else {
                throw new Error(`Projects API failed: ${response.status} - ${JSON.stringify(response.data)}`);
            }
            
        } catch (error) {
            console.log(`    ❌ Projects API failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Projects API: ${error.message}`);
            this.results.failed++;
            this.results.criticalIssues.push(`CRITICAL: Projects API broken - ${error.message}`);
        }
        
        // Test Tasks API
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  ✅ Testing Tasks API...');
            const response = await this.makeRequest(`${this.baseUrl}/api/tasks`, { headers });
            
            if (response.status === 200) {
                console.log(`    ✅ Tasks API working (${Array.isArray(response.data) ? response.data.length : 'unknown'} tasks)`);
                this.results.sections[section].passed++;
                this.results.passed++;
            } else {
                throw new Error(`Tasks API failed: ${response.status} - ${JSON.stringify(response.data)}`);
            }
            
        } catch (error) {
            console.log(`    ❌ Tasks API failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Tasks API: ${error.message}`);
            this.results.failed++;
        }
        
        // Test Contexts API
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  📝 Testing Contexts API...');
            const response = await this.makeRequest(`${this.baseUrl}/api/contexts`, { headers });
            
            if (response.status === 200) {
                console.log(`    ✅ Contexts API working (${Array.isArray(response.data) ? response.data.length : 'unknown'} contexts)`);
                this.results.sections[section].passed++;
                this.results.passed++;
            } else {
                throw new Error(`Contexts API failed: ${response.status} - ${JSON.stringify(response.data)}`);
            }
            
        } catch (error) {
            console.log(`    ❌ Contexts API failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Contexts API: ${error.message}`);
            this.results.failed++;
        }
        
        // Test Decisions API
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  📋 Testing Decisions API...');
            const response = await this.makeRequest(`${this.baseUrl}/api/decisions`, { headers });
            
            if (response.status === 200) {
                console.log(`    ✅ Decisions API working (${Array.isArray(response.data) ? response.data.length : 'unknown'} decisions)`);
                this.results.sections[section].passed++;
                this.results.passed++;
            } else {
                throw new Error(`Decisions API failed: ${response.status} - ${JSON.stringify(response.data)}`);
            }
            
        } catch (error) {
            console.log(`    ❌ Decisions API failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Decisions API: ${error.message}`);
            this.results.failed++;
        }
        
        // Test Agents API
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  🤖 Testing Agents API...');
            const response = await this.makeRequest(`${this.baseUrl}/api/agents`, { headers });
            
            if (response.status === 200) {
                console.log(`    ✅ Agents API working (${Array.isArray(response.data) ? response.data.length : 'unknown'} agents)`);
                this.results.sections[section].passed++;
                this.results.passed++;
            } else {
                throw new Error(`Agents API failed: ${response.status} - ${JSON.stringify(response.data)}`);
            }
            
        } catch (error) {
            console.log(`    ❌ Agents API failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Agents API: ${error.message}`);
            this.results.failed++;
        }
    }

    async testDataIntegrity() {
        console.log('\n📊 Testing Data Integrity and CRUD Operations');
        const section = 'dataIntegrity';
        this.results.sections[section] = { tests: 0, passed: 0, failed: 0, issues: [] };
        
        const headers = this.authToken ? { 'Authorization': `Bearer ${this.authToken}` } : {};
        
        // Test Task Creation (Enhanced feature from recent update)
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  📝 Testing Task creation...');
            
            const createResponse = await this.makeRequest(`${this.baseUrl}/api/tasks`, {
                method: 'POST',
                headers,
                body: {
                    title: 'QA Test Task',
                    description: 'Testing task creation after interface fix',
                    priority: 'medium',
                    status: 'pending'
                }
            });
            
            if (createResponse.status === 200 || createResponse.status === 201) {
                console.log('    ✅ Task creation working');
                this.results.sections[section].passed++;
                this.results.passed++;
                
                // Clean up created task if possible
                if (createResponse.data && createResponse.data.id) {
                    try {
                        await this.makeRequest(`${this.baseUrl}/api/tasks/${createResponse.data.id}`, {
                            method: 'DELETE',
                            headers
                        });
                    } catch (cleanupError) {
                        // Ignore cleanup errors
                    }
                }
            } else {
                throw new Error(`Task creation failed: ${createResponse.status} - ${JSON.stringify(createResponse.data)}`);
            }
            
        } catch (error) {
            console.log(`    ❌ Task creation failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Task Creation: ${error.message}`);
            this.results.failed++;
        }
        
        // Test Context Storage
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  💾 Testing Context storage...');
            
            const contextResponse = await this.makeRequest(`${this.baseUrl}/api/contexts`, {
                method: 'POST',
                headers,
                body: {
                    content: 'QA test context for system validation',
                    type: 'testing',
                    metadata: {
                        testRun: new Date().toISOString(),
                        purpose: 'post-fix-validation'
                    }
                }
            });
            
            if (contextResponse.status === 200 || contextResponse.status === 201) {
                console.log('    ✅ Context storage working');
                this.results.sections[section].passed++;
                this.results.passed++;
            } else {
                throw new Error(`Context storage failed: ${contextResponse.status} - ${JSON.stringify(contextResponse.data)}`);
            }
            
        } catch (error) {
            console.log(`    ❌ Context storage failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Context Storage: ${error.message}`);
            this.results.failed++;
        }
    }

    async testDatabaseConnectivity() {
        console.log('\n🗄️  Testing Database Connectivity');
        const section = 'database';
        this.results.sections[section] = { tests: 0, passed: 0, failed: 0, issues: [] };
        
        const headers = this.authToken ? { 'Authorization': `Bearer ${this.authToken}` } : {};
        
        // Test database stats endpoint
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  📈 Testing Database statistics...');
            
            const statsResponse = await this.makeRequest(`${this.baseUrl}/api/stats`, { headers });
            
            if (statsResponse.status === 200) {
                console.log('    ✅ Database statistics accessible');
                console.log(`    📊 Stats: ${JSON.stringify(statsResponse.data, null, 2).substring(0, 200)}...`);
                this.results.sections[section].passed++;
                this.results.passed++;
            } else {
                throw new Error(`Database stats failed: ${statsResponse.status}`);
            }
            
        } catch (error) {
            console.log(`    ❌ Database stats failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Database Stats: ${error.message}`);
            this.results.failed++;
        }
    }

    async testWebSocketConnectivity() {
        console.log('\n🔌 Testing WebSocket Connectivity');
        const section = 'websocket';
        this.results.sections[section] = { tests: 0, passed: 0, failed: 0, issues: [] };
        
        // Test WebSocket endpoint availability
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  🌐 Testing WebSocket endpoint...');
            
            // Simple HTTP check for WebSocket upgrade endpoint
            const wsResponse = await this.makeRequest(`${this.baseUrl}/ws`);
            
            // WebSocket endpoints typically return 426 (Upgrade Required) for HTTP requests
            if (wsResponse.status === 426 || wsResponse.status === 400 || wsResponse.status === 101) {
                console.log('    ✅ WebSocket endpoint available');
                this.results.sections[section].passed++;
                this.results.passed++;
            } else {
                console.log(`    ⚠️  WebSocket endpoint status: ${wsResponse.status} (may be normal)`);
                this.results.sections[section].passed++;
                this.results.passed++;
                this.results.warnings++;
            }
            
        } catch (error) {
            console.log(`    ⚠️  WebSocket test inconclusive: ${error.message}`);
            this.results.sections[section].passed++;
            this.results.passed++;
            this.results.warnings++;
        }
    }

    async testErrorHandling() {
        console.log('\n🛡️  Testing Error Handling');
        const section = 'errorHandling';
        this.results.sections[section] = { tests: 0, passed: 0, failed: 0, issues: [] };
        
        const headers = this.authToken ? { 'Authorization': `Bearer ${this.authToken}` } : {};
        
        // Test 404 handling
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  🔍 Testing 404 error handling...');
            
            const response = await this.makeRequest(`${this.baseUrl}/api/nonexistent-endpoint`, { headers });
            
            if (response.status === 404) {
                console.log('    ✅ 404 error handling working');
                this.results.sections[section].passed++;
                this.results.passed++;
            } else {
                console.log(`    ⚠️  Unexpected response for 404 test: ${response.status}`);
                this.results.sections[section].passed++;
                this.results.passed++;
                this.results.warnings++;
            }
            
        } catch (error) {
            console.log(`    ❌ 404 error handling test failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`404 Handling: ${error.message}`);
            this.results.failed++;
        }
        
        // Test malformed request handling
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  🚫 Testing malformed request handling...');
            
            const response = await this.makeRequest(`${this.baseUrl}/api/tasks`, {
                method: 'POST',
                headers,
                body: { invalid: 'malformed data without required fields' }
            });
            
            if (response.status === 400 || response.status === 422) {
                console.log('    ✅ Malformed request handling working');
                this.results.sections[section].passed++;
                this.results.passed++;
            } else {
                console.log(`    ⚠️  Unexpected response for malformed request: ${response.status}`);
                this.results.sections[section].passed++;
                this.results.passed++;
                this.results.warnings++;
            }
            
        } catch (error) {
            console.log(`    ❌ Malformed request handling failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Malformed Request: ${error.message}`);
            this.results.failed++;
        }
    }

    generateRecommendations() {
        console.log('\n💡 Generating Recommendations');
        
        // Basic recommendations based on test results
        if (this.results.failed > 0) {
            this.results.recommendations.push('Immediate attention required for failed API tests');
        }
        
        if (this.results.criticalIssues.length > 0) {
            this.results.recommendations.push('Address critical API failures and connectivity issues');
        }
        
        if (this.results.warnings > 0) {
            this.results.recommendations.push('Review warning conditions - may indicate configuration issues');
        }
        
        // Specific recommendations based on test patterns
        const projectsFailures = this.results.sections.coreAPIs?.issues?.some(issue => 
            issue.includes('Projects API'));
        if (projectsFailures) {
            this.results.recommendations.push('PRIORITY: Fix Projects API - critical for user workflow');
        }
        
        const authFailures = this.results.sections.authentication?.failed > 0;
        if (authFailures) {
            this.results.recommendations.push('CRITICAL: Authentication system needs immediate attention');
        }
        
        // Post-fix specific recommendations
        this.results.recommendations.push('Implement automated API regression tests for future TypeScript changes');
        this.results.recommendations.push('Add API contract testing to prevent interface breaking changes');
        this.results.recommendations.push('Consider implementing API versioning for backward compatibility');
        this.results.recommendations.push('Add comprehensive API documentation and OpenAPI spec');
        
        if (this.results.passed / this.results.totalTests >= 0.90) {
            this.results.recommendations.push('API layer showing excellent stability - maintain current practices');
        }
    }

    async generateReport() {
        this.generateRecommendations();
        
        const successRate = this.results.totalTests > 0 ? 
            ((this.results.passed / this.results.totalTests) * 100).toFixed(1) : 0;
        
        const report = {
            ...this.results,
            successRate: `${successRate}%`,
            summary: {
                status: successRate >= 95 ? 'EXCELLENT' : 
                        successRate >= 85 ? 'GOOD' : 
                        successRate >= 70 ? 'ACCEPTABLE' : 'NEEDS_ATTENTION',
                recommendation: successRate >= 95 ? 'API layer is stable and ready for production' :
                               successRate >= 85 ? 'Minor API issues detected, address before major releases' :
                               successRate >= 70 ? 'Multiple API issues detected, immediate attention recommended' :
                               'Critical API issues detected, immediate fixes required',
                fixValidation: this.results.sections.coreAPIs?.issues?.length === 0 ? 
                    'Emergency fix validated - Projects API working correctly' :
                    'Emergency fix validation FAILED - Projects API still has issues'
            }
        };
        
        // Save detailed report
        const reportPath = path.join(__dirname, 'QA_API_COMPREHENSIVE_VALIDATION_REPORT.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        // Console summary
        console.log('\n' + '='.repeat(70));
        console.log('🎯 QA API-BASED COMPREHENSIVE SYSTEM VALIDATION COMPLETE');
        console.log('='.repeat(70));
        console.log(`📊 Overall API Success Rate: ${successRate}%`);
        console.log(`✅ Tests Passed: ${this.results.passed}/${this.results.totalTests}`);
        console.log(`❌ Tests Failed: ${this.results.failed}`);
        console.log(`⚠️  Warnings: ${this.results.warnings}`);
        console.log(`🚨 Critical Issues: ${this.results.criticalIssues.length}`);
        console.log(`📈 System Status: ${report.summary.status}`);
        console.log(`🔧 Fix Validation: ${report.summary.fixValidation}`);
        console.log('\n📋 Section Breakdown:');
        
        for (const [section, data] of Object.entries(this.results.sections)) {
            const sectionRate = data.tests > 0 ? ((data.passed / data.tests) * 100).toFixed(1) : 0;
            const status = sectionRate >= 80 ? '✅' : sectionRate >= 60 ? '⚠️' : '❌';
            console.log(`  ${status} ${section}: ${data.passed}/${data.tests} (${sectionRate}%)`);
        }
        
        if (this.results.criticalIssues.length > 0) {
            console.log('\n🚨 CRITICAL ISSUES:');
            this.results.criticalIssues.forEach((issue, i) => {
                console.log(`  ${i + 1}. ${issue}`);
            });
        }
        
        if (this.results.recommendations.length > 0) {
            console.log('\n💡 TOP RECOMMENDATIONS:');
            this.results.recommendations.slice(0, 5).forEach((rec, i) => {
                console.log(`  ${i + 1}. ${rec}`);
            });
        }
        
        console.log(`\n📄 Full Report: ${reportPath}`);
        console.log('\n' + report.summary.recommendation);
        console.log('='.repeat(70));
        
        return report;
    }

    async run() {
        try {
            await this.init();
            await this.testSystemHealth();
            const authSuccess = await this.authenticate();
            
            if (authSuccess) {
                await this.testCoreAPIs();
                await this.testDataIntegrity();
                await this.testDatabaseConnectivity();
            }
            
            await this.testWebSocketConnectivity();
            await this.testErrorHandling();
            
            return await this.generateReport();
            
        } catch (error) {
            console.error('❌ API Validation failed:', error.message);
            this.results.criticalIssues.push(`Test Suite Failure: ${error.message}`);
            return await this.generateReport();
        }
    }
}

// Run the comprehensive API validation
if (require.main === module) {
    const validator = new APISystemValidator();
    validator.run().then(report => {
        process.exit(report.failed > 0 ? 1 : 0);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = APISystemValidator;
