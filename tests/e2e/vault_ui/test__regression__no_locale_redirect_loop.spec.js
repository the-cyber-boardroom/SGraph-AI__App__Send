/* =================================================================================
   Regression: /en-gb/ must NOT redirect to itself or cause a loop.

   Bug commit: 353ef55
   Symptom:    Visiting /en-gb/ triggered a route that matched the root routing
               rule, looping through / → /en-gb/ → / → ...

   Fix:        runLanding() only strips hashes; it never redirects. Root routing
               (runRoot) is called only from /index.html.
   ================================================================================= */

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.route('https://**', route => route.fulfill({
        contentType: 'application/javascript', body: ''
    }));
    await page.addInitScript(() => {
        try { localStorage.clear(); } catch (_) {}
        try { sessionStorage.clear(); } catch (_) {}
    });
});

test('regression 353ef55 — /en-gb/ does not redirect in a loop', async ({ page }) => {
    const navigations = [];
    page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) navigations.push(frame.url());
    });

    await page.goto('/en-gb/', { waitUntil: 'domcontentloaded', timeout: 8000 });

    // Allow brief settling time
    await page.waitForTimeout(500);

    // Must still be on /en-gb/ (not bounced back to root or looped)
    expect(page.url()).toContain('/en-gb/');
    expect(page.url()).not.toMatch(/^https?:\/\/localhost:\d+\/?$/);

    // No more than 3 navigations (initial + at most 2 redirects are OK)
    expect(navigations.length).toBeLessThanOrEqual(3);
});

test('regression 353ef55 — /en-gb/ with stray hash stays on /en-gb/ after strip', async ({ page }) => {
    await page.goto('/en-gb/#stray', { waitUntil: 'domcontentloaded', timeout: 8000 });
    await page.waitForTimeout(400);

    // Hash stripped, still on /en-gb/
    expect(page.url()).toContain('/en-gb/');
    expect(page.url()).not.toContain('#');
    // Did NOT redirect to / or /en-gb/vault
    expect(page.url()).not.toMatch(/^https?:\/\/localhost:\d+\/$/);
    expect(page.url()).not.toContain('/en-gb/vault');
});
