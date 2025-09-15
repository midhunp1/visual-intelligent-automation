const fs = require('fs').promises;
const path = require('path');
const { chromium } = require('playwright');

class AuthManager {
    constructor() {
        this.authDir = path.join(__dirname, 'auth-states');
        this.ensureAuthDir();
    }

    async ensureAuthDir() {
        try {
            await fs.mkdir(this.authDir, { recursive: true });
        } catch (error) {
            console.error('Error creating auth directory:', error);
        }
    }

    // Save authentication state from a browser context
    async saveAuthState(context, name = 'default') {
        try {
            const authPath = path.join(this.authDir, `${name}.json`);
            await context.storageState({ path: authPath });
            console.log(`✅ Auth state saved: ${name}`);
            return { success: true, path: authPath };
        } catch (error) {
            console.error('Error saving auth state:', error);
            return { success: false, error: error.message };
        }
    }

    // Load authentication state into a new context
    async loadAuthState(name = 'default') {
        try {
            const authPath = path.join(this.authDir, `${name}.json`);
            const exists = await this.authStateExists(name);
            
            if (!exists) {
                return { success: false, error: 'Auth state not found' };
            }

            return { success: true, path: authPath };
        } catch (error) {
            console.error('Error loading auth state:', error);
            return { success: false, error: error.message };
        }
    }

    // Check if an auth state exists
    async authStateExists(name = 'default') {
        try {
            const authPath = path.join(this.authDir, `${name}.json`);
            await fs.access(authPath);
            return true;
        } catch {
            return false;
        }
    }

    // List all saved auth states
    async listAuthStates() {
        try {
            const files = await fs.readdir(this.authDir);
            const authStates = [];
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const name = file.replace('.json', '');
                    const filePath = path.join(this.authDir, file);
                    const stats = await fs.stat(filePath);
                    const content = await fs.readFile(filePath, 'utf8');
                    const authData = JSON.parse(content);
                    
                    authStates.push({
                        name: name,
                        created: stats.mtime,
                        cookies: authData.cookies?.length || 0,
                        origins: authData.origins?.length || 0
                    });
                }
            }
            
            return { success: true, authStates };
        } catch (error) {
            console.error('Error listing auth states:', error);
            return { success: false, error: error.message };
        }
    }

    // Delete an auth state
    async deleteAuthState(name) {
        try {
            const authPath = path.join(this.authDir, `${name}.json`);
            await fs.unlink(authPath);
            console.log(`🗑️ Auth state deleted: ${name}`);
            return { success: true };
        } catch (error) {
            console.error('Error deleting auth state:', error);
            return { success: false, error: error.message };
        }
    }

    // Create a browser context with saved auth state
    async createAuthenticatedContext(browser, authStateName = 'default') {
        try {
            const authState = await this.loadAuthState(authStateName);
            
            if (!authState.success) {
                // No saved auth, create normal context
                return await browser.newContext();
            }

            // Create context with saved auth state
            const context = await browser.newContext({
                storageState: authState.path
            });

            console.log(`🔐 Context created with auth state: ${authStateName}`);
            return context;
        } catch (error) {
            console.error('Error creating authenticated context:', error);
            // Fallback to normal context
            return await browser.newContext();
        }
    }
}

module.exports = AuthManager;