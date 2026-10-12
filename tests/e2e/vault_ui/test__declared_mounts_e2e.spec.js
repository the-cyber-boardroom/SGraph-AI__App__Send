/* =================================================================================
   Declared mounts — full browser end-to-end  (07 Sep analysis, Phases 1–5)
   Run: npx playwright test tests/e2e/vault_ui/test__declared_mounts_e2e.spec.js

   Real everything: the real SGraph Send API (in-process FastAPI + Memory-FS, spawned
   for the run), real vaults created with the real crypto libraries, the shipped App UI
   served from tests/e2e/vault_ui/fixtures/vault-server.js, a real null-origin app
   iframe, a real null-origin child kernel iframe, and a second "writer" (a plain
   SGVault on its own clone branch — what `sgit push` or another tab is to the server).

   The story (see library/guides/vault-html/DECLARED-MOUNTS-E2E.md):
     1. the OWNER opens the parent app; the app lists and writes /data/… — the folder is
        a declared mount (data.link.json + owner secret) onto a CHILD vault; the bytes
        land in the child, never in the parent, with a Via-Mount commit trailer;
     2. another writer publishes to the child; the app's next write reconciles first
        (fast-forward), so nothing is lost and the app can read the other file;
     3. the HUD "Mounts" tab shows the declared mount, its access tier and sync state;
     4. a READ-ONLY parent session (read credential) resolves the mount read-only:
        reads work, writes are refused, the child is untouched.

   Screenshots go to $DECLARED_MOUNTS_SHOTS_DIR (default test-results/declared-mounts-e2e).
   ================================================================================= */

import { test, expect }   from '@playwright/test';
import fs                  from 'node:fs';
import path                from 'node:path';
import { fileURLToPath }   from 'node:url';
import { startApiServer }  from './fixtures/api-server.js';
import { seedDeclaredMounts, openAll, readFile, putFile, enc, dec, sgSend, loadVaultLibs }
    from './fixtures/sg-vault-node.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS     = process.env.DECLARED_MOUNTS_SHOTS_DIR || path.resolve(__dirname, '../../../test-results/declared-mounts-e2e');
const APP_HTML  = fs.readFileSync(path.join(__dirname, 'fixtures/clinic-app.html'), 'utf8');

// The app page pulls two scripts from CDNs (sg-layout window manager, sg-print). Offline /
// sandboxed runs cannot reach them, so they are served locally: a minimal layout stand-in
// (fixtures/sg-layout-offline.js — NOT part of the system under test) and an empty sg-print.
const LAYOUT_JS = fs.readFileSync(path.join(__dirname, 'fixtures/sg-layout-offline.js'), 'utf8');
const CHROMIUM  = process.env.PW_CHROMIUM_EXECUTABLE || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
test.use({
    viewport: { width: 1240, height: 780 },
    ignoreHTTPSErrors: true,
    launchOptions: CHROMIUM ? { executablePath: CHROMIUM } : {}
});
// Deployed target: SG_UI_BASE=https://dev.vault.sgraph.ai (with SG_API_URL + a token) drives
// the DEPLOYED App UI against the deployed API — the "is this live?" check. The CDN scripts
// are real there, so the offline stand-ins are only installed for the local file server.
const UI_BASE = (process.env.SG_UI_BASE || '').replace(/\/$/, '');
test.beforeEach(async ({ page }) => {
    if (UI_BASE) return;
    await page.route('https://dev.tools.sgraph.ai/**/sg-layout.js', (route) => route.fulfill({ contentType: 'application/javascript', body: LAYOUT_JS }));
    await page.route('https://**/sg-print.js',                       (route) => route.fulfill({ contentType: 'application/javascript', body: '' }));
});
test.describe.configure({ mode: 'serial' });
test.setTimeout(90_000);

let api, seed;

test.beforeAll(async () => {
    fs.mkdirSync(SHOTS, { recursive: true });
    // The real API server needs the repo's Python dependencies. In a Node-only job (the plain
    // `test:vault-e2e` run) that is not available: skip, visibly. SG_REQUIRE_API=1 (the
    // dedicated CI job, or an agent confirming a deployment) turns that into a failure.
    try { api = await startApiServer(); }
    catch (err) {
        if (process.env.SG_REQUIRE_API) throw err;
        test.skip(true, 'SGraph Send API server unavailable (' + String(err.message).split('\n')[0] + ') — set SG_REQUIRE_API=1 to fail instead');
        return;
    }
    seed = await seedDeclaredMounts(api, { appHtml: APP_HTML, childName: 'Clinic Data', parentName: 'Clinic App' });
});
test.afterAll(async () => { if (api) await api.stop(); });

// ── helpers ──────────────────────────────────────────────────────────────────────
async function openApp(page, vaultKey) {
    await page.addInitScript(({ endpoint, key }) => {
        window.SG_ENDPOINT = endpoint;
        try { localStorage.setItem('sg-vault-key', key); } catch (_) {}
        try { sessionStorage.setItem('sg-vault-endpoint', endpoint); } catch (_) {}
    }, { endpoint: api.url, key: vaultKey });
    await page.goto(UI_BASE + '/en-gb/app');
    return appFrame(page);
}

// The app runs in a null-origin srcdoc iframe inside <app-shell>; so do child kernels.
// Pick the frame whose document is the Clinic App and whose bridge is up.
async function appFrame(page, timeoutMs = 30_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        for (const f of page.frames()) {
            if (f === page.mainFrame()) continue;
            const isApp = await f.evaluate(() => document.title === 'Clinic App' && !!(window.__app && window.__app.ready)).catch(() => false);
            if (isApp) return f;
        }
        await page.waitForTimeout(150);
    }
    throw new Error('Clinic App frame did not become ready');
}

function shot(page, name) { return page.screenshot({ path: path.join(SHOTS, name), fullPage: false }); }

async function childState() {
    const c = await openAll(api, seed.child.key);
    const files = c.ds.getFileList().filter(e => !e.dir).map(e => e.path).sort();
    const head  = await c.vault._commitManager.loadCommit(c.vault._headCommitId);
    return { vault: c.vault, files, head };
}

// ── 1. owner writes through the declared mount ──────────────────────────────────
test('1 · owner: the app lists and writes /data — bytes land in the CHILD vault', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    const frame = await openApp(page, seed.parent.key);
    const listed = await frame.locator('#list li').allInnerTexts();
    expect(listed.join('\n')).toContain('records/seed.json');            // the child's seed, via data/
    await shot(page, '01-owner-app-lists-data.png');

    await frame.fill('#report', '{ "title": "Q3 report", "status": "final", "author": "owner" }');
    await frame.click('#save');
    await expect(frame.locator('#status')).toHaveText(/saved \d+ bytes/, { timeout: 30_000 });
    await expect(frame.locator('#list')).toContainText('report.json');
    await shot(page, '02-owner-app-saved-report.png');

    // S1 — the receipt: the app is TOLD the outcome of its own write (AppSec decision 09/08)
    const receipt = await frame.evaluate(() => sg.vfs.write('data/receipt.json', new TextEncoder().encode('{"r":1}')));
    expect(receipt.path).toBe('data/receipt.json');
    expect(receipt.commit_id).toMatch(/^obj-cas-imm-[0-9a-f]+$/);
    expect(receipt.published).toBe(true);
    // S2 / S3 — mkdir and same-mount move through the mount; N4 — cross-boundary move → EXDEV;
    // D1 — delete across a mount → the tier's own code, not EMOUNT_RO
    const fsRes = await frame.evaluate(async () => {
        const out = {};
        out.mkdir = await sg.fs.mkdir('data/poc');
        await sg.vfs.write('data/poc/one.txt', new TextEncoder().encode('one'));
        out.move  = await sg.fs.move('data/poc/one.txt', 'data/records/one-moved.txt');   // records/ exists in the child seed
        out.after = (await sg.vfs.list('data')).map(e => e.path).sort();
        try { await sg.fs.move('data/records/one-moved.txt', 'escaped.txt'); out.xdev = 'NONE'; } catch (e) { out.xdev = e.code || e.message; }
        try { await sg.fs.delete('data/records/one-moved.txt'); out.del = 'NONE'; } catch (e) { out.del = e.code || e.message; }
        out.mounts = await sg.vault.mounts();
        return out;
    });
    expect(fsRes.mkdir.created).toBe(true);
    expect(fsRes.mkdir.published).toBe(true);
    expect(fsRes.move.moved).toBe(true);
    expect(fsRes.after).toContain('records/one-moved.txt');
    expect(fsRes.after).not.toContain('poc/one.txt');
    expect(fsRes.xdev).toBe('EXDEV');
    expect(fsRes.del).toBe('EUNDERPRIVILEGED');
    // S4 — apps get the projection, never the raw kernel row
    expect(fsRes.mounts.length).toBe(1);
    expect(Object.keys(fsRes.mounts[0]).sort()).toEqual(['access', 'at', 'declared', 'prefix', 'state']);
    expect(fsRes.mounts[0]).toMatchObject({ prefix: 'data/', access: 'rw', declared: true });

    // Verify from OUTSIDE the browser, with a fresh open of each vault:
    const child = await childState();
    expect(child.files).toContain('report.json');
    expect(dec(await readFile(child.vault, '/report.json'))).toContain('"author": "owner"');
    expect(child.head.message).toMatch(/Via-Mount: Clinic Data \(declared\)/);   // provenance trailer
    const parent = await openAll(api, seed.parent.key);
    const parentFiles = parent.ds.getFileList().map(e => e.path);
    expect(parentFiles).toContain('data.link.json');
    expect(parentFiles.some(p => /report\.json$/.test(p))).toBe(false);         // nothing written to the parent
    expect(errors, 'no uncaught page errors').toEqual([]);
});

// ── 2. another writer publishes; the app's next write reconciles first ──────────
test('2 · another writer publishes to the child; the app write fast-forwards, nothing is lost', async ({ page }) => {
    loadVaultLibs();
    // "sgit push" from elsewhere: a plain SGVault on its own clone branch, blind push().
    const other = await SGVault.open(sgSend(api), seed.child.key, { cloneBranch: 'sgit-cli' });
    await putFile(other, '/notes/from-sgit.md', enc('# pushed by another writer\n'));
    await other.push();
    const otherHead = other._headCommitId;

    const frame = await openApp(page, seed.parent.key);
    await frame.fill('#report', '{ "title": "Q3 report", "status": "final", "author": "owner", "rev": 2 }');
    await frame.click('#save');
    await expect(frame.locator('#status')).toHaveText(/saved \d+ bytes/, { timeout: 30_000 });
    await expect(frame.locator('#list')).toContainText('notes/from-sgit.md');   // the app sees the other file after its write
    const txt = await frame.evaluate(() => window.__app.readText('data/notes/from-sgit.md'));
    expect(txt).toContain('pushed by another writer');
    await shot(page, '03-app-after-other-writer.png');

    const child = await childState();
    expect(child.files).toEqual(expect.arrayContaining(['report.json', 'notes/from-sgit.md', 'records/seed.json']));
    expect(dec(await readFile(child.vault, '/report.json'))).toContain('"rev": 2');
    expect(child.head.parents[0]).toBe(otherHead);                              // our commit descends from theirs (FF, not overwrite)
});

// ── 3. HUD Mounts tab ───────────────────────────────────────────────────────────
test('3 · the HUD Mounts tab shows the declared mount, its tier and sync state', async ({ page }) => {
    const frame = await openApp(page, seed.parent.key);
    await frame.fill('#report', '{ "title": "Q3 report", "status": "final", "author": "owner", "rev": 3 }');
    await frame.click('#save');                                                    // touch the mount so the child kernel is up
    await expect(frame.locator('#status')).toHaveText(/saved \d+ bytes/, { timeout: 30_000 });

    // What the tab-focus behind-check does: ask every child kernel for its sync state.
    const sync = await page.evaluate(async () => {
        const shell = document.querySelector('app-shell');
        return shell && shell._kernelParent ? shell._kernelParent.syncAll() : null;
    });
    expect(sync).toBeTruthy();
    const first = Object.values(sync)[0];
    expect(first.syncable).toBe(true);
    expect(first.state).toBe('clean');

    // Open the debug pane the way the HUD's "Debug panel" button does (same event), wide
    // enough to show the whole mount row.
    await page.evaluate(() => document.getElementById('app-hud').dispatchEvent(
        new CustomEvent('app-debug:toggle', { bubbles: true, composed: true, detail: { open: true, split: 0.55 } })));
    await page.locator('app-debug-pane button[data-tab="mounts"]').click();
    const mounts = page.locator('app-debug-mounts');
    await expect(mounts).toContainText('data/');
    await expect(mounts).toContainText('declared');
    await expect(mounts).toContainText('rw');
    await expect(mounts).toContainText('clean');
    await shot(page, '04-hud-mounts-tab.png');
});

// ── 4. read-only parent ─────────────────────────────────────────────────────────
test('4 · a read-only parent session mounts the child read-only: reads work, writes are refused', async ({ page }) => {
    const before = await childState();
    const frame  = await openApp(page, seed.parent.readCredential);            // format 6: <read_key hex>:<vault_id>
    const listed = await frame.locator('#list li').allInnerTexts();
    expect(listed.join('\n')).toContain('report.json');
    const txt = await frame.evaluate(() => window.__app.readText('data/report.json'));
    expect(txt).toContain('"rev": 3');                                             // what test 3 published

    await frame.fill('#report', '{ "tampered": true }');
    await frame.click('#save');
    await expect(frame.locator('#status')).toHaveText(/write failed/, { timeout: 30_000 });
    await shot(page, '05-readonly-parent-write-refused.png');

    const after = await childState();
    expect(after.head.tree_id || after.head).toEqual(before.head.tree_id || before.head);
    expect(dec(await readFile(after.vault, '/report.json'))).not.toContain('tampered');
});
