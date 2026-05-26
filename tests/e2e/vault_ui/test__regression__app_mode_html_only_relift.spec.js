/* =================================================================================
   Regression: App Mode must only re-lift HTML/HTM files — not arbitrary vault
   files such as app.json or image assets.

   Bug commit: b50d822
   Symptom:    _liftContentFrame() re-lifted into App Mode whenever ANY file was
               rendered, including app.json itself. Opening app.json for editing
               would trigger App Mode, making the file inaccessible in the normal
               editor. Additionally, if no entry file was present in the vault,
               App Mode activated anyway, leaving users with a blank iframe and no
               path back to the file tree.

   Fix:        Guard in vault-browse-edit.js re-lift path: only call
               _liftContentFrame() when the rendered file has a .html or .htm
               extension. index.html (_applyAppJson) checks entry file exists in
               vault before activating App Mode at all.

   NOTE: These tests require a vault shell with a real (or stubbed) vault open
   and files loaded — beyond current E2E file-server capability. They are seeded
   here to anchor the regression contract; enable them when vault-state seeding
   is available in the E2E fixture layer.
   ================================================================================= */

import { test, expect } from '@playwright/test';

test.skip('app mode does not activate when app.json references a missing entry file', async ({ page }) => {
    // Requires: vault shell open, app.json present with entry: "missing.html"
    // Verify: no App Mode banner appears; file tree is accessible.
    await page.goto('/en-gb/vault', { waitUntil: 'domcontentloaded' });
    // TODO: seed vault state with app.json pointing to non-existent entry file
    // const banner = page.locator('sg-app-banner, .sg-app-banner');
    // await expect(banner).not.toBeVisible();
});

test.skip('opening app.json in editor does not trigger app mode re-lift', async ({ page }) => {
    // Requires: vault shell open, app.json present, a valid .html entry file
    // Steps:
    //   1. App Mode activates for the HTML entry
    //   2. User navigates back to file tree
    //   3. User opens app.json
    // Verify: after opening app.json, App Mode is NOT re-activated;
    //         the raw JSON content is shown in the text editor, not an iframe.
    await page.goto('/en-gb/vault', { waitUntil: 'domcontentloaded' });
    // TODO: seed vault state + exercise file-tree click sequence
    // const frame = page.locator('.sb-file__html-frame');
    // await expect(frame).not.toBeVisible();
});

test.skip('opening a .html file does trigger app mode re-lift', async ({ page }) => {
    // Positive case: clicking a .html file from the tree SHOULD activate App Mode.
    // Requires: vault shell open with at least one .html file in the tree.
    await page.goto('/en-gb/vault', { waitUntil: 'domcontentloaded' });
    // TODO: seed vault state with index.html present
    // const banner = page.locator('sg-app-banner, .sg-app-banner');
    // await expect(banner).toBeVisible();
});
