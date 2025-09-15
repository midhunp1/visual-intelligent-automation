const { chromium } = require('playwright');
const AuthManager = require('./auth-manager');

/**
 * Example: How to save and reuse authentication state
 * 
 * WORKFLOW:
 * 1. First run: Record login steps and save auth state
 * 2. Subsequent runs: Skip login, start directly from authenticated state
 */

async function saveLoginState() {
    console.log('📝 Step 1: Saving Login State');
    console.log('================================\n');
    
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to your login page
    await page.goto('https://example.com/login');
    
    // Perform login (customize these selectors for your site)
    await page.fill('#username', 'your-username');
    await page.fill('#password', 'your-password');
    await page.click('button[type="submit"]');
    
    // Wait for login to complete (customize this check)
    await page.waitForSelector('.dashboard', { timeout: 10000 });
    
    // Save the authentication state
    const authManager = new AuthManager();
    await authManager.saveAuthState(context, 'my-login');
    
    console.log('✅ Login state saved as "my-login"');
    console.log('🔐 Cookies and localStorage have been saved\n');
    
    await browser.close();
}

async function reuseLoginState() {
    console.log('🚀 Step 2: Reusing Login State');
    console.log('================================\n');
    
    const authManager = new AuthManager();
    const browser = await chromium.launch({ headless: false });
    
    // Create context with saved auth state
    const context = await authManager.createAuthenticatedContext(browser, 'my-login');
    const page = await context.newPage();
    
    // Go directly to a protected page - no login needed!
    await page.goto('https://example.com/dashboard');
    
    console.log('✅ Accessed protected page without logging in!');
    console.log('🎯 You can now start recording from this point\n');
    
    // Your test actions here...
    await page.waitForTimeout(5000);
    
    await browser.close();
}

async function launchCodegenWithAuth() {
    console.log('🎬 Step 3: Launch Codegen with Auth State');
    console.log('==========================================\n');
    
    const { spawn } = require('child_process');
    const path = require('path');
    
    const authPath = path.join(__dirname, 'auth-states', 'my-login.json');
    
    const codegen = spawn('npx', [
        'playwright',
        'codegen',
        '--load-storage', authPath,
        '--save-storage', authPath,
        'https://example.com/dashboard'
    ], {
        stdio: 'inherit'
    });
    
    console.log('📹 Playwright Codegen launched with saved auth');
    console.log('🔐 You\'re already logged in!');
    console.log('⏺️ Use the Record button to start/stop recording\n');
}

// Example usage
async function main() {
    const action = process.argv[2];
    
    console.log('\n🔐 Authentication State Management Example');
    console.log('==========================================\n');
    
    switch(action) {
        case 'save':
            await saveLoginState();
            console.log('💡 Next: Run "node auth-example.js reuse" to test saved auth\n');
            break;
            
        case 'reuse':
            await reuseLoginState();
            console.log('💡 Next: Run "node auth-example.js codegen" to record with auth\n');
            break;
            
        case 'codegen':
            await launchCodegenWithAuth();
            break;
            
        default:
            console.log('Usage:');
            console.log('  node auth-example.js save     - Save login state');
            console.log('  node auth-example.js reuse    - Test saved auth state');
            console.log('  node auth-example.js codegen  - Launch Codegen with auth\n');
            console.log('Workflow:');
            console.log('  1. First run "save" to record and save your login');
            console.log('  2. Then run "reuse" to verify auth state works');
            console.log('  3. Finally run "codegen" to record tests with auth\n');
    }
}

main().catch(console.error);