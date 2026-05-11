/* =================================================================================
   Playwright configuration — Vault UI E2E tests
   Run: npx playwright test tests/e2e/vault_ui/
   ================================================================================= */

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir:   'tests/e2e/vault_ui',
    timeout:   20_000,
    retries:   process.env.CI ? 2 : 0,
    workers:   1,                      // serial: localStorage state is tab-local

    use: {
        baseURL:       'http://localhost:3999',
        actionTimeout: 10_000,
    },

    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ],

    webServer: {
        command:              'node tests/e2e/vault_ui/fixtures/vault-server.js 3999',
        port:                 3999,
        reuseExistingServer:  !process.env.CI,
        timeout:              10_000,
    },
});
