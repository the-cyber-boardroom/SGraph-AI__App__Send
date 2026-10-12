/* =================================================================================
   Vault Chat — kernel PoC smoke test (Phase 3 MVP)

   Drives the null-origin iframe over a real SecureChannel and asserts that:
     - the SecureChannel handshake completes
     - the iframe's sg-app-stub registered window.sg
     - the parent's kernel handlers serve vfs.read / list / write
     - AppPermissions.isFloor refuses /.vault/** (EPROTECTED) from the app
     - the chat (vault-chat-pane) functions over the new transport with the mock LLM

   Run: node tests/e2e/vault_ui/vault-chat/kernel-poc.smoke.mjs
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
const base = `http://127.0.0.1:${server.address().port}/en-gb/vault/chat/kernel-poc/`;
console.log('[kernel-poc] @', base);

const browser = await chromium.launch();
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

try {
    await page.goto(base, { waitUntil: 'load', timeout: 20000 });

    // 1. SecureChannel handshake completes
    await page.waitForFunction(() => /\bup\b/.test(document.getElementById('channel').textContent), null, { timeout: 8000 });
    const ch = await page.textContent('#channel');
    /ECDH P-256.*AES-GCM/.test(ch) ? ok('SecureChannel up — ' + ch.replace(/\s+/g, ' ').trim()) : fail('channel text: ' + ch);

    // 2. Parent-driven probes complete (5 of them); read the side panel
    await page.waitForFunction(() => document.getElementById('probes').children.length >= 5, null, { timeout: 8000 });
    const probes = await page.evaluate(() => Array.from(document.getElementById('probes').children).map((c) => c.textContent));
    const has = (re) => probes.find((t) => re.test(t));
    has(/✓ sg\.vfs\.list\("\/"\)/)     ? ok('sg.vfs.list("/") served by the parent over the channel') : fail('list("/") probe missing');
    has(/✓ sg\.vfs\.readText\("\/notes\.md"\)/) ? ok('sg.vfs.readText("/notes.md") served via channel') : fail('readText probe missing');
    has(/✗ sg\.vfs\.list\("\/\.vault"\).*EPROTECTED/) ? ok('sg.vfs.list("/.vault") refused with EPROTECTED (kernel floor)') : fail('floor probe (list /.vault) wrong: ' + (has(/list\("\/\.vault"\)/) || 'absent'));
    has(/✗ sg\.vfs\.readText\("\/\.vault\/secrets\/openrouter\.key"\).*EPROTECTED/) ? ok('sg.vfs.readText("/.vault/secrets/…") refused with EPROTECTED') : fail('floor probe (readText key) wrong: ' + (has(/openrouter\.key/) || 'absent'));
    has(/✓ sg\.vfs\.write/) ? ok('sg.vfs.write executed over the channel') : fail('write probe missing');

    // 3. The chat pane inside the iframe: drive a CONFIRM-approved write through
    //    the mock LLM. window.sg here belongs to the iframe, supplied by sg-app-stub.
    const frame = page.frameLocator('#app');
    // wait for the chat-pane to upgrade (it does so when the lib scripts load)
    await frame.locator('vault-chat-pane').waitFor({ timeout: 8000 });
    // confirm sg-app:ready fired (the iframe sets a ui.message; we just verify
    // the pane bridge is now wired by issuing a real chat command)
    await frame.locator('.input').fill('write /work/kernel-poc.md hello');
    await frame.locator('.send').click();
    await frame.locator('.confirm').waitFor({ timeout: 5000 });
    ok('chat pane raised CONFIRM under the new transport');
    await frame.getByText('approve', { exact: true }).click();
    // Null-origin sandbox blocks parent-side .contentDocument access (which is the
    // whole point). Read the pane's log via the frameLocator instead.
    await frame.locator('vault-chat-pane').waitFor();
    for (let i = 0; i < 25; i++) {
        const logText = await frame.locator('vault-chat-pane').evaluate((el) => el.shadowRoot.querySelector('.log').textContent);
        if (/write_file/.test(logText)) { ok('approved write executed under the new transport (mock LLM keyless)'); break; }
        if (i === 24) fail('write_file did not appear in pane log');
        await page.waitForTimeout(200);
    }

    // 4. Console / page errors. CDN cert + module-CORS in a null-origin sandbox
    //    may produce warnings we accept. Treat only HARD errors as failures.
    const hard = errors.filter((e) => !/sgraph\.ai|ERR_CERT|CORS|cross-origin/i.test(e));
    hard.length === 0 ? ok('no console/page errors (CDN cert/CORS warnings accepted as environmental)') : fail('hard errors: ' + hard.join(' | '));
} catch (e) {
    fail('exception: ' + e.message);
} finally {
    await browser.close();
    server.close();
}
console.log(process.exitCode ? '\n[kernel-poc] FAILED' : '\n[kernel-poc] PASSED');
