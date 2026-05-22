/* =================================================================================
   Vault UI E2E — Routing Table Tests
   Verifies the eight routing table cells from the architect doc (§4).

   Routing table:
     /                 no hash      → /en-gb/
     /#<token>         valid fmt 1  → /en-gb/app#token, LS saved
     /#<garbage>       bad format   → /en-gb/app#token, LS saved (routing doesn't validate)
     /en-gb/           any hash     → stays at /en-gb/, hash stripped
     /en-gb/vault      no LS key    → stays at /en-gb/vault (shell renders entry form)
     /en-gb/vault      LS key set   → stays at /en-gb/vault (shell auto-opens)
     /en-gb/vault/peek any hash     → stays at /en-gb/vault/peek, hash stripped
     /en-gb/vault/peek no hash      → stays at /en-gb/vault/peek, page renders
   ================================================================================= */

import { test, expect } from '@playwright/test';

// Block CDN requests so pages load fast (routing doesn't depend on them).
// NOTE: Do NOT use addInitScript to clear localStorage — it runs on every
// navigation including redirects, which would erase tokens written by the
// routing script before the vault shell loads. Each test already gets a
// fresh browser context (isolated storage) courtesy of Playwright.
test.beforeEach(async ({ page }) => {
    await page.route('https://**', route => route.fulfill({
        contentType: 'application/javascript',
        body: ''
    }));
});

// ---------------------------------------------------------------------------
// Cell 1 — / without hash → /en-gb/
// ---------------------------------------------------------------------------
test('root without hash redirects to /en-gb/', async ({ page }) => {
    await page.goto('/', { waitUntil: 'commit' });
    await page.waitForURL('**/en-gb/**', { timeout: 8000 });
    expect(page.url()).toContain('/en-gb/');
    expect(page.url()).not.toContain('/en-gb/vault');
});

// ---------------------------------------------------------------------------
// Cell 2 — /#<valid simple token> → /en-gb/app#token, token in localStorage
// ---------------------------------------------------------------------------
test('root with valid token hash redirects to /en-gb/app and saves token', async ({ page }) => {
    await page.goto('/#apple-river-1234', { waitUntil: 'commit' });
    await page.waitForURL('**/en-gb/app**', { timeout: 8000 });

    expect(page.url()).toContain('/en-gb/app');
    const key = await page.evaluate(() => localStorage.getItem('sg-vault-key'));
    expect(key).toBe('apple-river-1234');
});

// ---------------------------------------------------------------------------
// Cell 3 — /#<any non-empty hash> → /en-gb/app (routing accepts any token)
// The app-shell is responsible for rejecting invalid keys, not the router.
// ---------------------------------------------------------------------------
test('root with any non-empty hash redirects to /en-gb/app', async ({ page }) => {
    await page.goto('/#not-a-simple-token', { waitUntil: 'commit' });
    await page.waitForURL('**/en-gb/app**', { timeout: 8000 });
    expect(page.url()).toContain('/en-gb/app');
});

// ---------------------------------------------------------------------------
// Cell 4 — /en-gb/ with stray hash → hash stripped, stays on landing
// ---------------------------------------------------------------------------
test('/en-gb/ strips stray hash and renders landing', async ({ page }) => {
    await page.goto('/en-gb/#stray-hash-4567', { waitUntil: 'domcontentloaded' });
    // Allow a brief moment for the routing script to strip the hash.
    await page.waitForTimeout(300);
    expect(page.url()).not.toContain('#');
    expect(page.url()).toContain('/en-gb/');
});

// ---------------------------------------------------------------------------
// Cell 5 — /en-gb/vault without LS key → stays at vault shell (entry form)
// ---------------------------------------------------------------------------
test('/en-gb/vault without stored key renders vault shell', async ({ page }) => {
    await page.goto('/en-gb/vault', { waitUntil: 'domcontentloaded' });
    // Page should not redirect away.
    await page.waitForTimeout(500);
    expect(page.url()).toContain('/en-gb/vault');
});

// ---------------------------------------------------------------------------
// Cell 6 — /en-gb/vault with LS key set → stays at vault shell (auto-open path)
// ---------------------------------------------------------------------------
test('/en-gb/vault with stored key stays on vault shell', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('sg-vault-key', 'apple-river-1234');
    });
    await page.goto('/en-gb/vault', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    // Still on vault shell (auto-open is handled by component logic, not routing)
    expect(page.url()).toContain('/en-gb/vault');
});

// ---------------------------------------------------------------------------
// Cell 7 — /en-gb/vault/peek with hash → hash stripped, page renders
// ---------------------------------------------------------------------------
test('/en-gb/vault/peek strips hash and renders peek page', async ({ page }) => {
    await page.goto('/en-gb/vault/peek/#stray', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    expect(page.url()).not.toContain('#');
    expect(page.url()).toContain('/en-gb/vault/peek');
    // Peek page title
    await expect(page).toHaveTitle(/Peek/i);
});

// ---------------------------------------------------------------------------
// Cell 8 — /en-gb/vault/peek without hash → page renders cleanly
// ---------------------------------------------------------------------------
test('/en-gb/vault/peek without hash renders peek page title', async ({ page }) => {
    await page.goto('/en-gb/vault/peek/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Peek/i);
    expect(page.url()).toContain('/en-gb/vault/peek');
});
