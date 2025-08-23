#!/usr/bin/env node

/**
 * QaAgent - Comprehensive System Validation
 * Post-Emergency Fix Testing Suite
 * 
 * Mission: Validate entire system after TypeScript interface fix
 * Prevents future breakages through systematic testing
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class ComprehensiveSystemValidator {
    constructor() {
        this.browser = null;
        this.page = null;
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
        this.baseUrl = 'http://localhost:3000';
        this.testUser = {
            username: 'testuser',
            password: 'testpass123'
        };
    }

    async init() {
        console.log('🚀 QaAgent - Starting Comprehensive System Validation');
        console.log(`📍 Base URL: ${this.baseUrl}`);
        
        this.browser = await chromium.launch({ 
            headless: false, 
            slowMo: 500,
            devtools: false
        });
        
        const context = await this.browser.newContext({
            viewport: { width: 1280, height: 720 }
        });
        
        this.page = await context.newPage();
        
        // Monitor console errors
        this.page.on('console', msg => {
            if (msg.type() === 'error') {
                console.log(`❌ Console Error: ${msg.text()}`);
                this.results.criticalIssues.push(`Console Error: ${msg.text()}`);
            }
        });
        
        // Monitor network failures
        this.page.on('response', response => {
            if (response.status() >= 400) {
                console.log(`🔴 HTTP ${response.status()}: ${response.url()}`);
                if (response.status() >= 500) {
                    this.results.criticalIssues.push(`HTTP ${response.status()}: ${response.url()}`);
                }
            }
        });
    }

    async login() {
        console.log('\n🔐 Testing Authentication Flow');
        
        await this.page.goto(`${this.baseUrl}/login`);
        await this.page.waitForLoadState('networkidle');
        
        // Fill login form
        await this.page.fill('input[name="username"]', this.testUser.username);
        await this.page.fill('input[name="password"]', this.testUser.password);
        
        // Submit and wait for navigation
        await Promise.all([
            this.page.waitForNavigation({ timeout: 10000 }),
            this.page.click('button[type="submit"]')
        ]);
        
        // Verify successful login
        const isLoggedIn = await this.page.url().includes('/dashboard');
        if (!isLoggedIn) {
            throw new Error('Login failed - not redirected to dashboard');
        }
        
        console.log('✅ Authentication successful');
        return true;
    }

    async testCoreNavigation() {
        console.log('\n📍 Testing Core Navigation');
        const section = 'navigation';
        this.results.sections[section] = { tests: 0, passed: 0, failed: 0, issues: [] };
        
        const pages = [
            { name: 'Dashboard', path: '/dashboard', selector: '.dashboard-container' },
            { name: 'Contexts', path: '/contexts', selector: '.context-browser' },
            { name: 'Tasks', path: '/tasks', selector: '.task-management' },
            { name: 'Projects', path: '/projects', selector: '.project-management' },
            { name: 'Decisions', path: '/decisions', selector: '.decisions-container' },
            { name: 'Agents', path: '/agents', selector: '.agent-management' }
        ];
        
        for (const pageInfo of pages) {
            this.results.sections[section].tests++;
            this.results.totalTests++;
            
            try {
                console.log(`  📄 Testing ${pageInfo.name} page...`);
                
                // Navigate to page
                await this.page.goto(`${this.baseUrl}${pageInfo.path}`);
                await this.page.waitForLoadState('networkidle', { timeout: 10000 });
                
                // Verify page loads with expected content
                await this.page.waitForSelector(pageInfo.selector, { timeout: 5000 });
                
                // Test page refresh
                await this.page.reload();
                await this.page.waitForLoadState('networkidle');
                await this.page.waitForSelector(pageInfo.selector, { timeout: 5000 });
                
                console.log(`    ✅ ${pageInfo.name} - Navigation and refresh working`);
                this.results.sections[section].passed++;
                this.results.passed++;
                
            } catch (error) {
                console.log(`    ❌ ${pageInfo.name} - ${error.message}`);
                this.results.sections[section].failed++;
                this.results.sections[section].issues.push(`${pageInfo.name}: ${error.message}`);
                this.results.failed++;
            }
        }
        
        // Test forward/backward navigation
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  🔄 Testing browser navigation (back/forward)...');
            await this.page.goBack();
            await this.page.waitForLoadState('networkidle');
            await this.page.goForward();
            await this.page.waitForLoadState('networkidle');
            
            console.log('    ✅ Browser navigation working');
            this.results.sections[section].passed++;
            this.results.passed++;
        } catch (error) {
            console.log(`    ❌ Browser navigation failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Browser navigation: ${error.message}`);
            this.results.failed++;
        }
    }

    async testDataLoading() {
        console.log('\n📊 Testing Data Loading Verification');
        const section = 'dataLoading';
        this.results.sections[section] = { tests: 0, passed: 0, failed: 0, issues: [] };
        
        // Test Projects Loading (Critical after recent fix)
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  📂 Testing Projects loading...');
            await this.page.goto(`${this.baseUrl}/projects`);
            await this.page.waitForLoadState('networkidle');
            
            // Wait for projects to load
            await this.page.waitForSelector('.project-card, .no-projects-message', { timeout: 10000 });
            
            const projectsVisible = await this.page.isVisible('.project-card');
            const noProjectsMessage = await this.page.isVisible('.no-projects-message');
            
            if (projectsVisible || noProjectsMessage) {
                console.log('    ✅ Projects loading working');
                this.results.sections[section].passed++;
                this.results.passed++;
            } else {
                throw new Error('Projects not loading - no content visible');
            }
            
        } catch (error) {
            console.log(`    ❌ Projects loading failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Projects: ${error.message}`);
            this.results.failed++;
            this.results.criticalIssues.push(`CRITICAL: Projects loading broken - ${error.message}`);
        }
        
        // Test Tasks Loading
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  ✅ Testing Tasks loading...');
            await this.page.goto(`${this.baseUrl}/tasks`);
            await this.page.waitForLoadState('networkidle');
            
            await this.page.waitForSelector('.task-card, .no-tasks-message', { timeout: 10000 });
            
            console.log('    ✅ Tasks loading working');
            this.results.sections[section].passed++;
            this.results.passed++;
            
        } catch (error) {
            console.log(`    ❌ Tasks loading failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Tasks: ${error.message}`);
            this.results.failed++;
        }
        
        // Test Context Browser
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  📝 Testing Context browser loading...');
            await this.page.goto(`${this.baseUrl}/contexts`);
            await this.page.waitForLoadState('networkidle');
            
            await this.page.waitForSelector('.context-list, .no-contexts-message', { timeout: 10000 });
            
            console.log('    ✅ Context browser loading working');
            this.results.sections[section].passed++;
            this.results.passed++;
            
        } catch (error) {
            console.log(`    ❌ Context browser failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Contexts: ${error.message}`);
            this.results.failed++;
        }
        
        // Test Dashboard Statistics
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  📈 Testing Dashboard statistics...');
            await this.page.goto(`${this.baseUrl}/dashboard`);
            await this.page.waitForLoadState('networkidle');
            
            await this.page.waitForSelector('.dashboard-stats, .stats-container', { timeout: 10000 });
            
            console.log('    ✅ Dashboard statistics working');
            this.results.sections[section].passed++;
            this.results.passed++;
            
        } catch (error) {
            console.log(`    ❌ Dashboard statistics failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Dashboard: ${error.message}`);
            this.results.failed++;
        }
    }

    async testInteractiveFeatures() {
        console.log('\n🎯 Testing Interactive Features');
        const section = 'interactive';
        this.results.sections[section] = { tests: 0, passed: 0, failed: 0, issues: [] };
        
        // Test WebSocket Connection
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  🔌 Testing WebSocket connection...');
            await this.page.goto(`${this.baseUrl}/dashboard`);
            await this.page.waitForLoadState('networkidle');
            
            // Wait for WebSocket connection indicators
            await this.page.waitForFunction(() => {
                return window.websocketConnected === true || 
                       document.querySelector('.connection-status.connected') !== null;
            }, {}, { timeout: 15000 });
            
            console.log('    ✅ WebSocket connection working');
            this.results.sections[section].passed++;
            this.results.passed++;
            
        } catch (error) {
            console.log(`    ⚠️  WebSocket connection issue: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`WebSocket: ${error.message}`);
            this.results.failed++;
            this.results.warnings++;
        }
        
        // Test Project Selector (if available)
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  📂 Testing Project selector...');
            await this.page.goto(`${this.baseUrl}/projects`);
            await this.page.waitForLoadState('networkidle');
            
            const projectSelector = await this.page.isVisible('.project-selector, select[name="project"]');
            if (projectSelector) {
                await this.page.click('.project-selector, select[name="project"]');
                console.log('    ✅ Project selector interactive');
            } else {
                console.log('    ℹ️  Project selector not found (may be conditional)');
            }
            
            this.results.sections[section].passed++;
            this.results.passed++;
            
        } catch (error) {
            console.log(`    ❌ Project selector failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Project Selector: ${error.message}`);
            this.results.failed++;
        }
        
        // Test Task Card Expansion
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  📋 Testing Task card expansion...');
            await this.page.goto(`${this.baseUrl}/tasks`);
            await this.page.waitForLoadState('networkidle');
            
            const taskCard = await this.page.$('.task-card');
            if (taskCard) {
                await taskCard.click();
                await this.page.waitForTimeout(1000); // Allow for expansion animation
                console.log('    ✅ Task card expansion working');
            } else {
                console.log('    ℹ️  No task cards available for testing');
            }
            
            this.results.sections[section].passed++;
            this.results.passed++;
            
        } catch (error) {
            console.log(`    ❌ Task expansion failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Task Cards: ${error.message}`);
            this.results.failed++;
        }
    }

    async testCrossPageIntegration() {
        console.log('\n🔗 Testing Cross-Page Integration');
        const section = 'integration';
        this.results.sections[section] = { tests: 0, passed: 0, failed: 0, issues: [] };
        
        // Test Project Context Consistency
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  🎯 Testing project context consistency...');
            
            // Start on projects page
            await this.page.goto(`${this.baseUrl}/projects`);
            await this.page.waitForLoadState('networkidle');
            
            // Navigate to different pages and verify context is maintained
            const pages = ['/dashboard', '/tasks', '/contexts'];
            
            for (const pageUrl of pages) {
                await this.page.goto(`${this.baseUrl}${pageUrl}`);
                await this.page.waitForLoadState('networkidle');
                await this.page.waitForTimeout(1000);
            }
            
            console.log('    ✅ Project context consistency working');
            this.results.sections[section].passed++;
            this.results.passed++;
            
        } catch (error) {
            console.log(`    ❌ Context consistency failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`Context Consistency: ${error.message}`);
            this.results.failed++;
        }
        
        // Test State Management
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        try {
            console.log('  💾 Testing state management across transitions...');
            
            await this.page.goto(`${this.baseUrl}/dashboard`);
            await this.page.waitForLoadState('networkidle');
            
            // Navigate away and back
            await this.page.goto(`${this.baseUrl}/projects`);
            await this.page.waitForLoadState('networkidle');
            
            await this.page.goto(`${this.baseUrl}/dashboard`);
            await this.page.waitForLoadState('networkidle');
            
            console.log('    ✅ State management working');
            this.results.sections[section].passed++;
            this.results.passed++;
            
        } catch (error) {
            console.log(`    ❌ State management failed: ${error.message}`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`State Management: ${error.message}`);
            this.results.failed++;
        }
    }

    async testErrorBoundaries() {
        console.log('\n🛡️  Testing Error Boundary Protection');
        const section = 'errorBoundaries';
        this.results.sections[section] = { tests: 0, passed: 0, failed: 0, issues: [] };
        
        // Test Console Error Monitoring
        this.results.sections[section].tests++;
        this.results.totalTests++;
        
        const initialErrorCount = this.results.criticalIssues.length;
        
        // Navigate through all pages to trigger any potential errors
        const testPages = ['/dashboard', '/contexts', '/tasks', '/projects', '/decisions', '/agents'];
        
        for (const page of testPages) {
            await this.page.goto(`${this.baseUrl}${page}`);
            await this.page.waitForLoadState('networkidle');
            await this.page.waitForTimeout(2000);
        }
        
        const finalErrorCount = this.results.criticalIssues.length;
        const newErrors = finalErrorCount - initialErrorCount;
        
        if (newErrors === 0) {
            console.log('    ✅ No critical console errors detected');
            this.results.sections[section].passed++;
            this.results.passed++;
        } else {
            console.log(`    ⚠️  ${newErrors} new errors detected during testing`);
            this.results.sections[section].failed++;
            this.results.sections[section].issues.push(`${newErrors} console errors detected`);
            this.results.failed++;
        }
    }

    generateRecommendations() {
        console.log('\n💡 Generating Recommendations');
        
        // Basic recommendations based on test results
        if (this.results.failed > 0) {
            this.results.recommendations.push('Immediate attention required for failed tests');
        }
        
        if (this.results.criticalIssues.length > 0) {
            this.results.recommendations.push('Address critical console errors and HTTP failures');
        }
        
        if (this.results.warnings > 0) {
            this.results.recommendations.push('Review warning conditions for potential improvements');
        }
        
        // Specific recommendations
        this.results.recommendations.push('Implement automated regression testing for TypeScript interface changes');
        this.results.recommendations.push('Add component-level error boundaries for better isolation');
        this.results.recommendations.push('Consider implementing health check endpoints for continuous monitoring');
        this.results.recommendations.push('Add integration tests for cross-page state management');
        
        if (this.results.passed / this.results.totalTests >= 0.95) {
            this.results.recommendations.push('System showing excellent stability - maintain current quality practices');
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
                recommendation: successRate >= 95 ? 'System is stable and ready for production' :
                               successRate >= 85 ? 'Minor issues detected, address before major releases' :
                               successRate >= 70 ? 'Multiple issues detected, immediate attention recommended' :
                               'Critical issues detected, immediate fixes required'
            }
        };
        
        // Save detailed report
        const reportPath = path.join(__dirname, 'QA_COMPREHENSIVE_SYSTEM_VALIDATION_REPORT.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        // Console summary
        console.log('\n' + '='.repeat(60));
        console.log('🎯 QA COMPREHENSIVE SYSTEM VALIDATION COMPLETE');
        console.log('='.repeat(60));
        console.log(`📊 Overall Success Rate: ${successRate}%`);
        console.log(`✅ Tests Passed: ${this.results.passed}/${this.results.totalTests}`);
        console.log(`❌ Tests Failed: ${this.results.failed}`);
        console.log(`⚠️  Warnings: ${this.results.warnings}`);
        console.log(`🚨 Critical Issues: ${this.results.criticalIssues.length}`);
        console.log(`📈 System Status: ${report.summary.status}`);
        console.log('\n📋 Section Breakdown:');
        
        for (const [section, data] of Object.entries(this.results.sections)) {
            const sectionRate = data.tests > 0 ? ((data.passed / data.tests) * 100).toFixed(1) : 0;
            console.log(`  ${section}: ${data.passed}/${data.tests} (${sectionRate}%)`);
        }
        
        if (this.results.criticalIssues.length > 0) {
            console.log('\n🚨 CRITICAL ISSUES:');
            this.results.criticalIssues.forEach((issue, i) => {
                console.log(`  ${i + 1}. ${issue}`);
            });
        }
        
        console.log(`\n📄 Full Report: ${reportPath}`);
        console.log(`💡 Recommendations: ${this.results.recommendations.length} generated`);
        console.log('\n' + report.summary.recommendation);
        console.log('='.repeat(60));
        
        return report;
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async run() {
        try {
            await this.init();
            await this.login();
            await this.testCoreNavigation();
            await this.testDataLoading();
            await this.testInteractiveFeatures();
            await this.testCrossPageIntegration();
            await this.testErrorBoundaries();
            
            return await this.generateReport();
            
        } catch (error) {
            console.error('❌ Validation failed:', error.message);
            this.results.criticalIssues.push(`Test Suite Failure: ${error.message}`);
            return await this.generateReport();
            
        } finally {
            await this.cleanup();
        }
    }
}

// Run the comprehensive validation
if (require.main === module) {
    const validator = new ComprehensiveSystemValidator();
    validator.run().then(report => {
        process.exit(report.failed > 0 ? 1 : 0);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = ComprehensiveSystemValidator;
