#!/usr/bin/env node

/**
 * Debug script to test the complete decision flow:
 * 1. Test backend API endpoint directly
 * 2. Test MCP service connection
 * 3. Test project context filtering
 * 4. Test data transformation
 */

const axios = require('axios');
const fs = require('fs');

// Configuration
const BACKEND_URL = 'http://localhost:5001';
const MCP_SERVER_URL = 'http://localhost:8081';

async function debugDecisionsFlow() {
    console.log('🔍 AIDIS-COMMAND Decisions Debug Flow\n');
    
    try {
        // Step 1: Get JWT token for API authentication
        console.log('1️⃣  Getting JWT token...');
        const loginResponse = await axios.post(`${BACKEND_URL}/api/auth/login`, {
            username: 'admin',
            password: 'admin123!'
        });
        
        console.log('   Login response status:', loginResponse.status);
        console.log('   Login response data keys:', Object.keys(loginResponse.data));
        
        // Check if we have a token in the response
        if (!loginResponse.data.token) {
            throw new Error(`Login failed: No token in response`);
        }
        
        const token = loginResponse.data.token;
        console.log('✅ Token obtained:', token.substring(0, 20) + '...\n');

        // Step 2: Test direct backend decision search
        console.log('2️⃣  Testing backend decision search API...');
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        
        // Test with no project filter first
        console.log('   Testing without project filter...');
        const noProjectResponse = await axios.get(
            `${BACKEND_URL}/api/decisions?query=*&limit=20`,
            { headers }
        );
        
        console.log('   Response status:', noProjectResponse.status);
        console.log('   Response success:', noProjectResponse.data.success);
        console.log('   Total decisions found:', noProjectResponse.data.data?.total || 0);
        console.log('   Decisions returned:', noProjectResponse.data.data?.decisions?.length || 0);
        
        if (noProjectResponse.data.data?.decisions?.length > 0) {
            const decision = noProjectResponse.data.data.decisions[0];
            console.log('   Sample decision:', {
                id: decision.id,
                title: decision.title,
                project_name: decision.project_name,
                status: decision.status
            });
        }
        console.log('');

        // Step 3: Get project list to test project filtering
        console.log('3️⃣  Getting project list...');
        const projectsResponse = await axios.get(
            `${BACKEND_URL}/api/projects`,
            { headers }
        );
        
        console.log('   Projects found:', projectsResponse.data.data?.projects?.length || 0);
        const aidisBootstrapProject = projectsResponse.data.data?.projects?.find(
            p => p.name === 'aidis-bootstrap'
        );
        
        if (aidisBootstrapProject) {
            console.log('   Found aidis-bootstrap project:', {
                id: aidisBootstrapProject.id,
                name: aidisBootstrapProject.name,
                status: aidisBootstrapProject.status
            });
            
            // Step 4: Test with project filter
            console.log('\n4️⃣  Testing with aidis-bootstrap project filter...');
            const projectFilterResponse = await axios.get(
                `${BACKEND_URL}/api/decisions?query=*&limit=20&project_id=${aidisBootstrapProject.id}`,
                { headers }
            );
            
            console.log('   Response status:', projectFilterResponse.status);
            console.log('   Response success:', projectFilterResponse.data.success);
            console.log('   Total decisions found:', projectFilterResponse.data.data?.total || 0);
            console.log('   Decisions returned:', projectFilterResponse.data.data?.decisions?.length || 0);
            
            if (projectFilterResponse.data.data?.decisions?.length > 0) {
                const decision = projectFilterResponse.data.data.decisions[0];
                console.log('   Sample decision:', {
                    id: decision.id,
                    title: decision.title,
                    project_name: decision.project_name,
                    status: decision.status,
                    created_at: decision.created_at
                });
            }
        } else {
            console.log('   ⚠️  aidis-bootstrap project not found in project list');
        }
        console.log('');

        // Step 5: Test decision stats
        console.log('5️⃣  Testing decision statistics...');
        const statsResponse = await axios.get(
            `${BACKEND_URL}/api/decisions/stats`,
            { headers }
        );
        
        console.log('   Stats response status:', statsResponse.status);
        console.log('   Stats response success:', statsResponse.data.success);
        if (statsResponse.data.success) {
            console.log('   Stats data:', JSON.stringify(statsResponse.data.data, null, 2));
        } else {
            console.log('   Stats error:', statsResponse.data.error);
        }
        console.log('');

        // Step 6: Test MCP server connection
        console.log('6️⃣  Testing MCP server connection...');
        try {
            // Note: This would require the MCP server to have HTTP endpoints
            // For now, we'll check if the backend can reach it
            console.log('   MCP server testing requires backend integration check');
            console.log('   Backend should be connecting to MCP server on port 8081');
        } catch (mcpError) {
            console.log('   ⚠️  MCP server connection test failed:', mcpError.message);
        }

        // Step 7: Summary and recommendations
        console.log('7️⃣  Summary and Recommendations:');
        console.log('   ✅ JWT authentication working');
        console.log('   ✅ Backend API endpoints accessible');
        
        if (noProjectResponse.data.data?.total > 0) {
            console.log('   ✅ Decisions found in database');
        } else {
            console.log('   ❌ NO DECISIONS FOUND - Check MCP server and database');
        }
        
        if (aidisBootstrapProject) {
            console.log('   ✅ Project context available');
        } else {
            console.log('   ❌ aidis-bootstrap project missing - Check project setup');
        }
        
        console.log('\n📋 Next Steps:');
        if (noProjectResponse.data.data?.total === 0) {
            console.log('   1. Check MCP server is running on port 8081');
            console.log('   2. Verify backend MCP service connection');
            console.log('   3. Check aidis_ui_dev database has decision data');
        } else {
            console.log('   1. Check frontend API integration');
            console.log('   2. Debug frontend state management');
            console.log('   3. Verify project context passing to API calls');
        }
        
    } catch (error) {
        console.error('❌ Debug failed:', error.message);
        if (error.response) {
            console.error('   Response status:', error.response.status);
            console.error('   Response data:', JSON.stringify(error.response.data, null, 2));
        }
    }
}

// Run the debug
debugDecisionsFlow().catch(console.error);
