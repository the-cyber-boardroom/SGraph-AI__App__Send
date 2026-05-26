/* =================================================================================
   Regression: HTML edit-mode live preview must be visible and match the static
   render (layout + VFS asset pipeline).

   Bug commit: 8b94f52
   Symptom 1:  Layout collapse — vault-browse-edit switches the wrapper to
               flex-direction:row but the iframe was created with height:0 /
               min-height:0. In a row container the cross-axis is vertical; the
               explicit height:0 overrode the default align-items:stretch and
               collapsed the preview iframe to 0 px tall (blank preview).

   Symptom 2:  Bare-blob fallback on every keystroke — _updatePv() checked for
               a global _loadHtmlIntoIframe but v0.3.3 send-browse exposes
               _inlineVaultAssets instead. Every keystroke fell through to a bare
               Blob URL, losing CSS/JS/VFS access and producing a mismatched
               preview.

   Fix:        Edit-mode entry now saves and overrides height/minHeight on the
               iframe; restores on exit. _updatePv() now calls _inlineVaultAssets.

   NOTE: Requires vault shell with an open HTML file and edit mode triggered —
   beyond current E2E file-server capability. Seeded here to anchor the
   regression contract; enable when vault-state seeding is available.
   ================================================================================= */

import { test, expect } from '@playwright/test';

test.skip('edit-mode preview iframe has non-zero height', async ({ page }) => {
    // Requires: vault shell open, a .html file selected, Edit button clicked.
    // Verify: the preview iframe (.sb-file__html-frame) has an offsetHeight > 0.
    await page.goto('/en-gb/vault', { waitUntil: 'domcontentloaded' });
    // TODO: seed vault + trigger edit mode
    // await page.locator('[data-file-ext="html"]').first().click();
    // await page.locator('button').filter({ hasText: /edit/i }).click();
    // const frame = page.locator('.sb-file__html-frame');
    // const height = await frame.evaluate(el => el.offsetHeight);
    // expect(height).toBeGreaterThan(0);
});

test.skip('edit-mode live preview re-renders on keystroke using VFS pipeline', async ({ page }) => {
    // Requires: vault shell open, HTML file in edit mode.
    // Verify: typing in the textarea triggers a preview update that includes
    //         vault-hosted CSS (not a bare blob).
    await page.goto('/en-gb/vault', { waitUntil: 'domcontentloaded' });
    // TODO: seed vault + trigger edit mode + type in textarea
    // const textarea = page.locator('.sb-edit__textarea, textarea');
    // await textarea.fill('<h1>Hello</h1>');
    // await page.waitForTimeout(600); // debounce
    // const frame = page.locator('.sb-file__html-frame');
    // await expect(frame.contentLocator('h1')).toHaveText('Hello');
});
