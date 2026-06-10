/* =================================================================================
   Vault Chat — standalone harness browser smoke test (Phase 0).
   Serves the vault UI dir, drives the harness in real chromium, asserts the tool
   loop renders. Run: node tests/e2e/vault_ui/vault-chat/smoke.mjs
   ================================================================================= */
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = fileURLToPath(new URL('../../../../sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = http.createServer((req, res) => {
    try {
        let p = decodeURIComponent(req.url.split('?')[0]);
        let fp = ROOT + p.replace(/^\/+/, '');
        if (existsSync(fp) && statSync(fp).isDirectory()) fp += '/index.html';
        if (!existsSync(fp)) { res.writeHead(404); res.end('not found'); return; }
        const ext = fp.slice(fp.lastIndexOf('.'));
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(readFileSync(fp));
    } catch (e) { res.writeHead(500); res.end(String(e)); }
});

const fail = (m) => { console.log('  ✗ ' + m); process.exitCode = 1; };
const ok = (m) => console.log('  ✓ ' + m);

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/en-gb/vault/chat/test/index.html`;
console.log('[smoke] Vault Chat harness @', base);

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

try {
    await page.goto(base, { waitUntil: 'networkidle' });

    // modules loaded onto window.VaultChat
    const hasModules = await page.evaluate(() => !!(window.VaultChat && window.VaultChat.ChatLoop && window.VaultChat.ExecutionCenter));
    hasModules ? ok('modules loaded (window.VaultChat present)') : fail('modules not loaded');

    // seed + read (AUTO) loop
    await page.click('#seed');
    await page.fill('#input', 'read /notes.md');
    await page.click('#send');
    await page.waitForFunction(() => /read_file/.test(document.getElementById('transcript').textContent), null, { timeout: 5000 });
    ok('read_file tool ran and rendered in the transcript');

    // list (AUTO)
    await page.fill('#input', 'list /');
    await page.click('#send');
    await page.waitForFunction(() => /list_folder/.test(document.getElementById('transcript').textContent), null, { timeout: 5000 });
    ok('list_folder tool ran');

    // CONFIRM path: write requires approval
    await page.fill('#input', 'write /work/y.md hi there');
    await page.click('#send');
    await page.waitForSelector('.confirm', { timeout: 5000 });
    ok('write_file raised an inline CONFIRM card');
    await page.click('.confirm button >> text=approve');
    await page.waitForFunction(() => /write_file/.test(document.getElementById('transcript').textContent), null, { timeout: 5000 });
    const wrote = await page.evaluate(async () => {
        // harness keeps the vfs internal; verify via the execution log instead
        return /write_file/.test(document.getElementById('log').textContent);
    });
    wrote ? ok('approved write executed (log row present)') : fail('write not logged after approve');

    // ledger reflects LLM spend
    const ledger = await page.textContent('#ledger');
    /spent \$0\.0/.test(ledger) ? ok('ledger shows accrued spend: ' + ledger.replace(/\s+/g, ' ').trim()) : fail('ledger not updated: ' + ledger);

    errors.length === 0 ? ok('no console/page errors') : fail('console errors: ' + errors.join(' | '));
} catch (e) {
    fail('exception: ' + e.message);
} finally {
    await browser.close();
    server.close();
}

console.log(process.exitCode ? '\n[smoke] FAILED' : '\n[smoke] PASSED');
