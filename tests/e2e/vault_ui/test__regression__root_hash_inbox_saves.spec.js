/* =================================================================================
   Regression: /#<token> must save the token to localStorage BEFORE redirecting.

   Bug commit: 7876c8e
   Symptom:    The root routing script redirected to /en-gb/vault before writing
               the token to localStorage, so the vault shell auto-open found no key
               and showed the entry form instead of opening the share-link vault.

   Fix:        VaultLoaderRouting.runRoot() writes key via VaultLoaderStorage
               (localStorage 'sg-vault-key') before calling location.replace().
               app-shell reads the key from the hash directly (/en-gb/app#token),
               with localStorage as a fallback for reload recovery.
   ================================================================================= */

import { test, expect } from '@playwright/test';

// Each test gets a fresh browser context (isolated storage). Do NOT use
// addInitScript to clear storage — it fires on every redirect and would
// erase the token written by the routing script before the vault shell loads.
test.beforeEach(async ({ page }) => {
    await page.route('https://**', route => route.fulfill({
        contentType: 'application/javascript', body: ''
    }));
});

test('regression 7876c8e — token is in localStorage when app shell loads', async ({ page }) => {
    // Capture localStorage state immediately after navigation commits (before page JS runs further).
    let keyAfterCommit = null;
    page.on('framenavigated', async frame => {
        if (frame === page.mainFrame() && frame.url().includes('/en-gb/app')) {
            // Evaluate in the newly-navigated context
            keyAfterCommit = await frame.evaluate(() => localStorage.getItem('sg-vault-key'))
                .catch(() => null);
        }
    });

    await page.goto('/#apple-river-1234', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForURL('**/en-gb/app**', { timeout: 8000 });

    // Key must be present at app shell load time.
    const finalKey = await page.evaluate(() => localStorage.getItem('sg-vault-key'));
    expect(finalKey).toBe('apple-river-1234');
});

test('regression 7876c8e — token is preserved in lowercase', async ({ page }) => {
    await page.goto('/#APPLE-RIVER-1234', { waitUntil: 'commit', timeout: 10000 });
    await page.waitForURL('**/en-gb/app**', { timeout: 8000 });
    const key = await page.evaluate(() => localStorage.getItem('sg-vault-key'));
    // runRoot() lowercases via _extractToken()
    expect(key).toBe('apple-river-1234');
});

test('regression 7876c8e — empty hash goes to /en-gb/ not /en-gb/vault', async ({ page }) => {
    await page.goto('/#', { waitUntil: 'commit', timeout: 10000 });
    await page.waitForURL('**/en-gb/**', { timeout: 8000 });
    // An empty/bare hash is treated as "no hash" → landing page.
    expect(page.url()).toMatch(/\/en-gb\/($|index\.html)/);
    expect(page.url()).not.toContain('/en-gb/vault');
});
