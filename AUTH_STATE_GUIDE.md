# Authentication State Management Guide

## Overview
This feature allows you to save and reuse authentication states (cookies, localStorage) across different test recording sessions. This means you only need to log in once, and all subsequent tests can start from an authenticated state.

## Key Benefits
✅ **Record login once** - Save time by not repeating login steps  
✅ **Start tests from any point** - Begin recording from deep within your application  
✅ **Reuse across sessions** - Auth state persists between Playwright Codegen sessions  
✅ **Multiple auth states** - Save different login states for different users/roles  

## How It Works

### Method 1: Using Playwright Codegen with Auth State

1. **First Time - Save Your Login:**
   ```bash
   # Launch Playwright Codegen normally
   npx playwright codegen https://your-app.com/login
   
   # Manually perform login steps
   # Once logged in, Codegen will save the auth state
   ```

2. **Subsequent Times - Skip Login:**
   ```bash
   # Launch with saved auth state
   npx playwright codegen --load-storage auth-states/default.json https://your-app.com/dashboard
   
   # You're already logged in! Start recording from any page
   ```

### Method 2: Using the Helper Script

```bash
# Save login state (do this once)
node auth-example.js save

# Test that auth state works
node auth-example.js reuse

# Launch Codegen with saved auth
node auth-example.js codegen
```

### Method 3: Programmatic Usage

```javascript
const { chromium } = require('playwright');
const AuthManager = require('./auth-manager');

// Save auth state after login
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

// Your login steps here
await page.goto('https://example.com/login');
await page.fill('#username', 'user');
await page.fill('#password', 'pass');
await page.click('button[type="submit"]');

// Save the auth state
const authManager = new AuthManager();
await authManager.saveAuthState(context, 'my-login');

// Later, reuse the auth state
const newContext = await authManager.createAuthenticatedContext(browser, 'my-login');
const newPage = await newContext.newPage();
await newPage.goto('https://example.com/protected-page'); // Already logged in!
```

## Playwright Codegen Options

### Save and Load Auth State
```bash
npx playwright codegen \
  --load-storage auth-states/user.json \  # Load existing auth
  --save-storage auth-states/user.json \  # Save updated auth
  https://your-app.com
```

### Recording Workflow with Auth

1. **Initial Setup (One Time)**
   - Launch Codegen: `npx playwright codegen --save-storage auth.json https://app.com/login`
   - Perform login manually
   - Close Codegen (auth is now saved)

2. **Recording Tests (Every Time)**
   - Launch with auth: `npx playwright codegen --load-storage auth.json https://app.com/dashboard`
   - Click pause button to stop recording
   - Navigate to your test starting point
   - Click record to start capturing actions
   - Your test won't include login steps!

## API Endpoints

### List Auth States
```bash
GET /api/auth-states
```

### Save Current Session Auth
```bash
POST /api/auth-states/save
{
  "sessionId": "current-session-id",
  "name": "admin-user"
}
```

### Check if Auth State Exists
```bash
GET /api/auth-states/:name/exists
```

### Delete Auth State
```bash
DELETE /api/auth-states/:name
```

## File Structure
```
auth-states/
├── default.json       # Default auth state
├── admin.json        # Admin user auth
├── user.json         # Regular user auth
└── test-user.json    # Test user auth
```

## Auth State Contents
Each auth state file contains:
- **Cookies** - All browser cookies
- **Origins** - localStorage and sessionStorage data
- **Authentication tokens** - Any auth tokens stored

## Tips & Best Practices

1. **Name your auth states clearly**: Use descriptive names like `admin-user`, `basic-user`, `premium-user`

2. **Update auth states periodically**: Tokens may expire, so refresh your saved auth states when needed

3. **Use different auth states for different test scenarios**: Save multiple user types for comprehensive testing

4. **Combine with recording modes**:
   - Use "New Browser" mode for full end-to-end tests including login
   - Use "Current State" mode with auth for testing specific features

5. **Security**: Auth state files contain sensitive data (cookies, tokens). Don't commit them to version control!

## Troubleshooting

**Q: My auth state isn't working**  
A: Auth tokens may have expired. Re-save the auth state by logging in again.

**Q: Codegen opens but I'm not logged in**  
A: Make sure you're using `--load-storage` flag with the correct path to your auth state file.

**Q: Can I use auth state with different domains?**  
A: Auth states are domain-specific. You need separate auth states for different domains.

## Example Test with Auth State

```javascript
// test-with-auth.js
const { test } = require('@playwright/test');

test.use({
  storageState: 'auth-states/user.json' // Use saved auth
});

test('Add item to cart', async ({ page }) => {
  // No login needed - start directly from product page!
  await page.goto('https://shop.example.com/products/123');
  await page.click('button.add-to-cart');
  await page.click('a.view-cart');
  
  // Verify item in cart
  await expect(page.locator('.cart-item')).toBeVisible();
});
```

## Summary

Authentication state management solves the problem of repeatedly logging in during test recording and execution. By saving your authentication state once, you can:

1. Start recording from any point in your application
2. Skip login steps in your test recordings
3. Run tests faster by avoiding login overhead
4. Test different user roles easily by switching auth states

This feature works seamlessly with Playwright Codegen's record/pause functionality, giving you complete control over what gets recorded in your tests.