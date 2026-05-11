/* =================================================================================
   Regression: App Mode button must appear exactly once in the vault UI.

   Bug commit: 2ccfe55
   Symptom:    A second "App Mode" button was hard-coded inside the writable-vault-
               only render block, so users with write access saw two identical
               "App Mode" buttons side by side. The universal button (rendered near
               the top of _renderFileContent for all vaults) already covered all
               cases.

   Fix:        The duplicate button was removed from the writable-only block
               (vault-browse-edit.js v0.2.2). The remaining button is rendered once
               via the universal path.

   NOTE: These tests require a vault shell with an open, writable vault — beyond
   current E2E file-server capability. Seeded here to anchor the regression
   contract; enable when vault-state seeding is available.
   ================================================================================= */

import { test, expect } from '@playwright/test';

test.skip('app mode button appears exactly once for a writable vault', async ({ page }) => {
    // Requires: vault shell open, vault is writable (has write access).
    // Verify: exactly 1 element with text matching /app mode/i is visible.
    await page.goto('/en-gb/vault', { waitUntil: 'domcontentloaded' });
    // TODO: seed writable vault state
    // const btns = page.locator('button').filter({ hasText: /app mode/i });
    // await expect(btns).toHaveCount(1);
});

test.skip('app mode button appears exactly once for a read-only vault', async ({ page }) => {
    // Requires: vault shell open, vault is read-only (no write access).
    // Verify: 0 or 1 button with text /app mode/i — the writable-only path
    //         must not add a second one before the guard was applied.
    await page.goto('/en-gb/vault', { waitUntil: 'domcontentloaded' });
    // TODO: seed read-only vault state
    // const btns = page.locator('button').filter({ hasText: /app mode/i });
    // const count = await btns.count();
    // expect(count).toBeLessThanOrEqual(1);
});
