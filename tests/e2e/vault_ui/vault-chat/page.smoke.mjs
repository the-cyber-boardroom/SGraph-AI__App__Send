/* =================================================================================
   Vault Chat — in-vault PAGE smoke test (Phase 1).
   Serves the vault UI dir, loads en-gb/vault/chat/index.html (which pulls the REAL
   sg-llm-request v0.1.6 from the CDN), drives the pane with the keyless mock LLM
   through a CONFIRM-approved write, and checks the real-LLM toggle.
   Run: node tests/e2e/vault_ui/vault-chat/page.smoke.mjs
   ================================================================================= */
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = fileURLToPath(new URL('../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
    try {
        let fp = ROOT + decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
        if (existsSync(fp) && statSync(fp).isDirectory()) fp += '/index.html';
        if (!existsSync(fp)) { res.writeHead(404); res.end('nf'); return; }
        res.writeHead(200, { 'Content-Type': MIME[fp.slice(fp.lastIndexOf('.'))] || 'application/octet-stream' });
        res.end(readFileSync(fp));
    } catch (e) { res.writeHead(500); res.end(String(e)); }
});
const ok = (m) => console.log('  ✓ ' + m);
const fail = (m) => { console.log('  ✗ ' + m); process.exitCode = 1; };

await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}/en-gb/vault/chat/index.html`;
console.log('[page-smoke] Vault Chat page @', base);

const browser = await chromium.launch();
// dev.tools.sgraph.ai uses a dev cert this sandbox's CA doesn't trust; the shipped
// vault UI loads the same CDN in production. Ignore HTTPS errors for the test only.
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

try {
    await page.goto(base, { waitUntil: 'networkidle', timeout: 20000 });

    const defs = await page.evaluate(() => ({
        pane: !!customElements.get('vault-chat-pane'),
        req:  !!customElements.get('sg-llm-request'),
        vc:   !!(window.VaultChat && window.VaultChat.LlmBus && window.VaultChat.ChatLoop),
    }));
    defs.pane ? ok('vault-chat-pane defined') : fail('pane not defined');
    defs.req  ? ok('real sg-llm-request (CDN v0.1.6) defined') : fail('sg-llm-request not defined');
    defs.vc   ? ok('window.VaultChat + LlmBus present') : fail('VaultChat lib missing');

    // keyless mock loop: write (CONFIRM) -> approve -> executes
    await page.locator('.input').fill('write /work/a.md hello phase one');
    await page.locator('.send').click();
    await page.locator('.confirm').waitFor({ timeout: 5000 });
    ok('write_file raised an inline CONFIRM card');
    await page.getByText('approve', { exact: true }).click();
    await page.waitForFunction(() => /write_file/.test(document.querySelector('vault-chat-pane').shadowRoot.querySelector('.log').textContent), null, { timeout: 5000 });
    ok('approved write executed (log row present)');

    // read it back (AUTO)
    await page.locator('.input').fill('read /work/a.md');
    await page.locator('.send').click();
    await page.waitForFunction(() => /read_file/.test(document.querySelector('vault-chat-pane').shadowRoot.querySelector('.log').textContent), null, { timeout: 5000 });
    ok('read_file ran (AUTO, no confirm)');

    const ledger = await page.evaluate(() => document.querySelector('vault-chat-pane').shadowRoot.querySelector('.ledger').textContent);
    /spent \$0\.0/.test(ledger) ? ok('ledger accrued spend: ' + ledger.replace(/\s+/g, ' ').trim()) : fail('ledger not updated: ' + ledger);

    // real-LLM toggle reveals the key field
    await page.locator('.real').check();
    const keyVisible = await page.locator('.key').isVisible();
    keyVisible ? ok('real-LLM toggle reveals the OpenRouter key field') : fail('key field not revealed');

    errors.length === 0 ? ok('no console/page errors') : fail('console errors: ' + errors.join(' | '));
} catch (e) {
    fail('exception: ' + e.message);
} finally {
    await browser.close();
    server.close();
}
console.log(process.exitCode ? '\n[page-smoke] FAILED' : '\n[page-smoke] PASSED');
