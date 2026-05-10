/* =================================================================================
   Regression: HTML iframe background must be preserved when App Mode lifts the
   frame; insertBefore must not throw when iframe is not a direct child.

   Bug commit: a26df38
   Symptom 1:  NotFoundError on Edit click — content.insertBefore(_htmlEdPane, iframe)
               threw because the iframe was not a direct child of .sb-file__content
               in App-Mode (sg-app-banner's _liftContentFrame() wraps/moves it).
               Fix: insert into iframe.parentNode instead; save/restore
               _htmlOrigSplitHostStyle for the actual host rather than a hard-coded
               wrapper.

   Symptom 2:  Background regression in App Mode — _liftContentFrame() overwrote
               htmlIframe.style.cssText, wiping the background:#fff / color-scheme:light
               added by send-browse. The lift cssText now includes both declarations
               so the white background survives the lift.

   NOTE: Requires vault shell with App Mode active and edit mode triggered — beyond
   current E2E file-server capability. Seeded here to anchor the regression
   contract; enable when vault-state seeding is available.
   ================================================================================= */

import { test, expect } from '@playwright/test';

test.skip('edit click does not throw when iframe is inside app-mode lift wrapper', async ({ page }) => {
    // Requires: vault shell open, App Mode active (entry .html file rendered),
    //           user clicks Edit button.
    // Verify: no console error / JS exception; edit pane appears alongside the frame.
    await page.goto('/en-gb/vault', { waitUntil: 'domcontentloaded' });
    // TODO: seed vault with App Mode entry, activate App Mode, then click Edit
    // const errors = [];
    // page.on('pageerror', e => errors.push(e.message));
    // await page.locator('button').filter({ hasText: /edit/i }).click();
    // expect(errors.filter(m => m.includes('NotFoundError'))).toHaveLength(0);
});

test.skip('iframe background is white after app mode lift', async ({ page }) => {
    // Requires: vault shell open, App Mode active.
    // Verify: the lifted iframe has background-color equivalent to white (#fff or rgb(255,255,255)).
    await page.goto('/en-gb/vault', { waitUntil: 'domcontentloaded' });
    // TODO: seed vault with App Mode entry + activate
    // const frame = page.locator('.sb-file__html-frame');
    // const bg = await frame.evaluate(el => getComputedStyle(el).backgroundColor);
    // expect(bg).toMatch(/rgb\(255,\s*255,\s*255\)|#fff/i);
});

test.skip('cancel edit restores host element layout to pre-edit state', async ({ page }) => {
    // Requires: vault shell open, App Mode active, edit mode entered then cancelled.
    // Verify: after Cancel, the split host's cssText matches the saved pre-edit value.
    await page.goto('/en-gb/vault', { waitUntil: 'domcontentloaded' });
    // TODO: seed vault + enter edit mode + cancel + compare host cssText
});
