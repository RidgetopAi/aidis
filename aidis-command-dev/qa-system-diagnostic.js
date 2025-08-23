#!/usr/bin/env node

/**
 * QaAgent - Emergency System Diagnostic
 * Post-Fix System Status Assessment
 * 
 * Mission: Diagnose current system state after emergency fix
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

class SystemDiagnostic {
    constructor() {
        this.results = {
            timestamp: new Date().toISOString(),
            processStatus: {},
            portStatus: {},
            fileStatus: {},
            serviceHealth: {},
            recommendations: []
        };
    }

    async execCommand(command) {
        return new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                resolve({
                    success: !error,
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    error: error ? error.message : null
                });
            });
        });
    }

    async checkHttpEndpoint(url) {
        return new Promise((resolve) => {
            const urlObj = new URL(url);
            const req = http.request({
                hostname: urlObj.hostname,
                port: urlObj.port,
                path: urlObj.pathname,
                timeout: 5000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    resolve({
                        status: res.statusCode,
                        headers: res.headers,
                        data: data.substring(0, 500)
                    });
                });
            });
            
            req.on('error', (error) => {
                resolve({
                    status: 'ERROR',
                    error: error.message
                });
            });
            
            req.on('timeout', () => {
                req.destroy();
                resolve({
                    status: 'TIMEOUT',
                    error: 'Request timeout'
                });
            });
            
            req.end();
        });
    }

    async checkProcesses() {
        console.log('🔍 Checking Running Processes...');
        
        // Check for Node.js processes
        const nodeProcesses = await this.execCommand('ps aux | grep -E "(node|npm)" | grep -v grep');
        console.log('📋 Node.js processes:');
        console.log(nodeProcesses.stdout || 'None found');
        
        this.results.processStatus.nodeProcesses = nodeProcesses.stdout.split('\n').filter(line => line.trim());
        
        // Check for specific AIDIS processes
        const aidisProcesses = await this.execCommand('ps aux | grep -i aidis | grep -v grep');
        console.log('\n🎯 AIDIS processes:');
        console.log(aidisProcesses.stdout || 'None found');
        
        this.results.processStatus.aidisProcesses = aidisProcesses.stdout.split('\n').filter(line => line.trim());
    }

    async checkPorts() {
        console.log('\n🌐 Checking Port Status...');
        
        const commonPorts = [3000, 3001, 5000, 8000, 8080];
        
        for (const port of commonPorts) {
            const portCheck = await this.execCommand(`lsof -i :${port}`);
            
            if (portCheck.success && portCheck.stdout) {
                console.log(`✅ Port ${port}: OCCUPIED`);
                console.log(`   ${portCheck.stdout.split('\n')[1] || 'No details'}`);
                this.results.portStatus[port] = {
                    status: 'OCCUPIED',
                    details: portCheck.stdout
                };
            } else {
                console.log(`❌ Port ${port}: FREE`);
                this.results.portStatus[port] = {
                    status: 'FREE'
                };
            }
        }
    }

    async checkFileStructure() {
        console.log('\n📁 Checking File Structure...');
        
        const criticalPaths = [
            './backend/src/server.ts',
            './backend/package.json',
            './frontend/package.json',
            './package.json',
            './.env',
            './backend/.env'
        ];
        
        for (const filePath of criticalPaths) {
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                console.log(`✅ ${filePath}: EXISTS (${stats.size} bytes, modified: ${stats.mtime.toISOString()})`);
                this.results.fileStatus[filePath] = {
                    exists: true,
                    size: stats.size,
                    modified: stats.mtime.toISOString()
                };
            } else {
                console.log(`❌ ${filePath}: MISSING`);
                this.results.fileStatus[filePath] = {
                    exists: false
                };
            }
        }
    }

    async checkServiceHealth() {
        console.log('\n🏥 Checking Service Health...');
        
        const endpoints = [
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:3001/health',
            'http://localhost:3001/api',
            'http://localhost:5000'
        ];
        
        for (const endpoint of endpoints) {
            console.log(`🔍 Testing ${endpoint}...`);
            const result = await this.checkHttpEndpoint(endpoint);
            
            if (result.status === 'ERROR' || result.status === 'TIMEOUT') {
                console.log(`  ❌ ${result.error}`);
            } else {
                console.log(`  ✅ Status: ${result.status}`);
                if (result.data) {
                    console.log(`  📄 Response preview: ${result.data.substring(0, 100)}...`);
                }
            }
            
            this.results.serviceHealth[endpoint] = result;
        }
    }

    async checkLogs() {
        console.log('\n📋 Checking Recent Logs...');
        
        const logFiles = [
            './backend.log',
            './frontend.log',
            './backend_manual.log',
            './frontend_debug.log'
        ];
        
        for (const logFile of logFiles) {
            if (fs.existsSync(logFile)) {
                const logContent = await this.execCommand(`tail -10 ${logFile}`);
                console.log(`\n📄 Last 10 lines of ${logFile}:`);
                console.log(logContent.stdout || 'Empty log');
                console.log('---');
            }
        }
    }

    generateRecommendations() {
        console.log('\n💡 Generating Diagnostic Recommendations...');
        
        // Check if any services are running
        const hasRunningServices = Object.values(this.results.portStatus).some(port => port.status === 'OCCUPIED');
        
        if (!hasRunningServices) {
            this.results.recommendations.push('🚨 CRITICAL: No services detected running on expected ports');
            this.results.recommendations.push('💡 ACTION: Start the development servers with npm run dev');
        }
        
        // Check for backend specifically
        if (!this.results.portStatus[3001] || this.results.portStatus[3001].status !== 'OCCUPIED') {
            this.results.recommendations.push('🔧 Backend not running on port 3001');
            this.results.recommendations.push('💡 ACTION: cd backend && npm run dev');
        }
        
        // Check for frontend
        if (!this.results.portStatus[3000] || this.results.portStatus[3000].status !== 'OCCUPIED') {
            this.results.recommendations.push('🔧 Frontend not running on port 3000');
            this.results.recommendations.push('💡 ACTION: Start frontend development server');
        }
        
        // Check for proxy issues
        const hasProxyErrors = Object.values(this.results.serviceHealth).some(health => 
            health.data && health.data.includes('Proxy error'));
        
        if (hasProxyErrors) {
            this.results.recommendations.push('🔧 Proxy configuration issues detected');
            this.results.recommendations.push('💡 ACTION: Check frontend proxy configuration for backend connection');
        }
        
        // File system recommendations
        if (!this.results.fileStatus['./.env'] || !this.results.fileStatus['./.env'].exists) {
            this.results.recommendations.push('⚠️  Environment file (.env) not found in root');
            this.results.recommendations.push('💡 ACTION: Create .env file with necessary configuration');
        }
        
        // Process recommendations
        if (this.results.processStatus.aidisProcesses.length === 0) {
            this.results.recommendations.push('🔧 No AIDIS-specific processes detected');
            this.results.recommendations.push('💡 ACTION: Verify AIDIS services are started properly');
        }
    }

    async generateReport() {
        this.generateRecommendations();
        
        const reportPath = path.join(__dirname, 'QA_SYSTEM_DIAGNOSTIC_REPORT.json');
        fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
        
        console.log('\n' + '='.repeat(60));
        console.log('🎯 SYSTEM DIAGNOSTIC COMPLETE');
        console.log('='.repeat(60));
        console.log(`📊 Timestamp: ${this.results.timestamp}`);
        console.log(`📋 Running Processes: ${this.results.processStatus.nodeProcesses.length}`);
        console.log(`🌐 Active Ports: ${Object.values(this.results.portStatus).filter(p => p.status === 'OCCUPIED').length}/5`);
        console.log(`📁 Critical Files: ${Object.values(this.results.fileStatus).filter(f => f.exists).length}/${Object.keys(this.results.fileStatus).length}`);
        
        console.log('\n🎯 CRITICAL RECOMMENDATIONS:');
        this.results.recommendations.forEach((rec, i) => {
            console.log(`  ${i + 1}. ${rec}`);
        });
        
        console.log(`\n📄 Full Report: ${reportPath}`);
        console.log('='.repeat(60));
        
        return this.results;
    }

    async run() {
        console.log('🚀 QaAgent - Starting Emergency System Diagnostic');
        console.log('📍 Working Directory: ' + process.cwd());
        
        try {
            await this.checkProcesses();
            await this.checkPorts();
            await this.checkFileStructure();
            await this.checkServiceHealth();
            await this.checkLogs();
            
            return await this.generateReport();
            
        } catch (error) {
            console.error('❌ Diagnostic failed:', error.message);
            this.results.error = error.message;
            return await this.generateReport();
        }
    }
}

// Run the diagnostic
if (require.main === module) {
    const diagnostic = new SystemDiagnostic();
    diagnostic.run().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = SystemDiagnostic;
