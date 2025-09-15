#!/usr/bin/env node

/**
 * Helper script to launch Playwright Codegen with saved authentication state
 * Usage: node playwright-with-auth.js [auth-state-name] [url]
 */

const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

async function launchCodegenWithAuth(authStateName = 'default', targetUrl = '') {
    const authPath = path.join(__dirname, 'auth-states', `${authStateName}.json`);
    
    try {
        // Check if auth state exists
        await fs.access(authPath);
        console.log(`✅ Found auth state: ${authStateName}`);
        
        // Launch Playwright Codegen with auth state
        const args = [
            'playwright',
            'codegen',
            '--load-storage', authPath,  // Load saved auth state
            '--save-storage', authPath,  // Save updated auth state when done
            '--target', 'javascript'
        ];
        
        if (targetUrl) {
            args.push(targetUrl);
        }
        
        console.log(`🚀 Launching Playwright Codegen with auth state...`);
        console.log(`📝 Auth state: ${authStateName}`);
        if (targetUrl) {
            console.log(`🌐 URL: ${targetUrl}`);
        }
        
        const codegen = spawn('npx', args, {
            stdio: 'inherit',
            env: { ...process.env }
        });
        
        codegen.on('close', (code) => {
            console.log(`\n✅ Codegen closed with code ${code}`);
            console.log(`💾 Auth state updated: ${authStateName}`);
        });
        
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`❌ Auth state not found: ${authStateName}`);
            console.log(`\n💡 To save an auth state, use the "Save Auth" button after logging in.`);
        } else {
            console.error('Error:', error);
        }
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const authStateName = args[0] || 'default';
const targetUrl = args[1] || '';

launchCodegenWithAuth(authStateName, targetUrl);