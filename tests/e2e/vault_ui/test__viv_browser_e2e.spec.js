/* =================================================================================
   ViV browser end-to-end (Phase 2 §7 / gap-doc B9)
   Run: npx playwright test tests/e2e/vault_ui/test__viv_browser_e2e.spec.js

   This is the ONLY test that exercises the browser-unique layer the Node suite
   cannot reach:
     • a real null-origin `sandbox="allow-scripts"` srcdoc iframe (the reason
       KERNEL_SHELL_HTML must inline everything — subresources can't load);
     • the real `SecureChannel.create(iframe)` bootstrap → `window.postMessage`
       with a transferred `MessagePort` across the origin boundary;
     • real browser `crypto.subtle` ECDSA/ECDH/AES-GCM in the handshake + envelope;
     • the real shipped `KERNEL_SHELL_HTML` bundle booting via the real
       `bootKernelOnPort` → `registerKernelVfsHandlers` gating, inside the iframe.

   Per the repo's "no mocks — real implementations, in-memory" convention, the only
   substitution is the SGVault/VaultDataSource backend (the network/server edge):
   the child srcdoc gets an in-memory SGVault + VaultDataSource override injected
   BEFORE the bootstrap runs. Everything from the MessagePort inward is the shipped
   code running in a real browser.

   The parent side drives a real KernelParent over the real channel — so relay +
   broker mediation are exercised end-to-end in the browser too. */

import { test, expect } from '@playwright/test';

// In-memory SGVault + VaultDataSource, injected into the child srcdoc. These are real
// implementations backed by a Map (not network mocks); they share one store so app.json
// (read via vault.getFileBytes) and file IO (via the data source) stay consistent.
const CHILD_OVERRIDE = `
(function () {
  'use strict';
  var enc = new TextEncoder();
  var store = new Map();
  store.set('.vault/app.json', enc.encode(JSON.stringify({ permissions: { fs: { read: true, write: ['data/'] } } })));
  store.set('notes.md', enc.encode('hello from child'));
  store.set('p.png', Uint8Array.of(0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A));
  store.set('data/seed.json', enc.encode('[]'));
  var pushCount = 0;
  var vault = {
    _vaultId: 'synth-child',
    getFileBytes: function (p) {
      var n = String(p).replace(/^\\//, '');
      if (!store.has(n)) { var e = new Error('ENOENT'); e.code = 'ENOENT'; return Promise.reject(e); }
      return Promise.resolve(store.get(n));
    },
    push: function () { pushCount++; return Promise.resolve(); },
    get pushCount() { return pushCount; },
    _store: store
  };
  globalThis.SGSend = function () {};
  globalThis.SGSend.prototype = {};
  globalThis.SGVault = { open: function () { return Promise.resolve(vault); } };
  globalThis.VaultDataSource = function () {
    this.writable = true;
    this.getFileBytes = function (p) { return vault.getFileBytes(p); };
    this.listFolder = function (folder) {
      var norm = String(folder || '').replace(/^\\//, ''); var out = [];
      store.forEach(function (b, p) {
        if (norm === '' || p === norm || p.indexOf(norm + '/') === 0) out.push({ path: p, size: b.length });
      });
      return out;
    };
    this.saveFile = function (dir, name, data) {
      var full = (String(dir).replace(/^\\//, '').replace(/\\/$/, '') + '/' + name).replace(/^\\//, '');
      store.set(full, data instanceof Uint8Array ? data : new Uint8Array(data || []));
      return Promise.resolve();
    };
    this.deleteFile = function (dir, name) {
      var full = (String(dir).replace(/^\\//, '').replace(/\\/$/, '') + '/' + name).replace(/^\\//, '');
      store.delete(full); return Promise.resolve();
    };
    this.createFolder = function () { return Promise.resolve(); };
  };
})();
`;

// Drive the whole flow inside the page so the real browser primitives are used.
// Returns plain JSON (no Uint8Array crosses the evaluate boundary).
const DRIVER = `
async (override) => {
  function bytesToArr(b) { return Array.from(b instanceof Uint8Array ? b : new Uint8Array(b || [])); }
  const out = { steps: {} };

  // Build the child srcdoc: shipped bundle + the in-memory backend override appended
  // so it replaces SGVault/VaultDataSource BEFORE the bootstrap's init message fires.
  if (typeof KERNEL_SHELL_HTML !== 'string') return { error: 'KERNEL_SHELL_HTML missing on page' };
  const childHtml = KERNEL_SHELL_HTML.replace('</body>', '<scr' + 'ipt>' + override + '</scr' + 'ipt></body>');

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', 'allow-scripts');   // null origin
  iframe.style.display = 'none';
  iframe.srcdoc = childHtml;
  document.body.appendChild(iframe);
  await new Promise((r) => iframe.addEventListener('load', r, { once: true }));

  // Real bootstrap: SecureChannel.create(iframe) does the ONE window.postMessage with a
  // transferred MessagePort, then the PKI handshake over real browser crypto.
  const cid = 'ch-e2e-' + Math.random().toString(36).slice(2, 6);
  const ch = await SecureChannel.create(iframe, { sensitiveKey: true, cid });
  const readyP = new Promise((res) => ch.on('ready', res));
  await ch.send('secrets', { vaultKey: 'synth', accessToken: 't', endpoint: 'http://localhost:3999' }, { sensitive: true });
  const ready = await Promise.race([ readyP, new Promise((_, rej) => setTimeout(() => rej(new Error('ready timeout')), 8000)) ]);
  out.steps.ready = !!(ready && ready.kernelId);

  // Drive a real KernelParent over the real channel.
  const parent = new KernelParent({
    kernelId: 'k-parent-e2e',
    resolveCredentials: async () => ({ vaultKey: 'synth', accessToken: 't' }),
    spawnChannel: async () => ch
  });
  const m = await parent.mount({ prefix: 'mounts/c/', ref: 'c', label: 'Child' });
  out.steps.mountId = m.mountId;
  for (const cap of ['fs.read', 'fs.write', 'fs.delete']) parent.broker.setPolicy(m.mountId, cap, 'auto');

  // 1 — text read across the real relay
  const r1 = await parent.relay('read', { path: 'mounts/c/notes.md' });
  out.steps.readText = new TextDecoder().decode(r1 instanceof Uint8Array ? r1 : new Uint8Array(r1));

  // 2 — binary read byte-exact across browser postMessage + crypto
  const r2 = await parent.relay('read', { path: 'mounts/c/p.png' });
  out.steps.readPng = bytesToArr(r2);

  // 3 — write inside the child's grant, then read it back byte-exact
  const payload = Uint8Array.of(1, 2, 3, 4, 250, 0, 99);
  const w = await parent.relay('write', { path: 'mounts/c/data/x.bin', data: payload });
  out.steps.writeOk = !!(w && w.ok);
  const rb = await parent.relay('read', { path: 'mounts/c/data/x.bin' });
  out.steps.writeRoundTrip = bytesToArr(rb);

  // 4 — write OUTSIDE the child's grant → child policy refuses (EPERM)
  try { await parent.relay('write', { path: 'mounts/c/outside/no.bin', data: payload }); out.steps.outsideErr = 'NONE'; }
  catch (e) { out.steps.outsideErr = e.code || e.message; }

  // 5 — floor: read child's .vault/** → EPROTECTED (survives the relay)
  try { await parent.relay('read', { path: 'mounts/c/.vault/app.json' }); out.steps.floorErr = 'NONE'; }
  catch (e) { out.steps.floorErr = e.code || e.message; }

  // 6 — broker logged each relay
  out.steps.brokerEntries = parent.broker.log({ mountId: m.mountId }).length;

  try { ch.close(); iframe.remove(); } catch (_) {}
  return out;
}
`;

test.describe('ViV browser end-to-end (real null-origin srcdoc + browser crypto)', () => {
    test('handshake + relay across a real null-origin child kernel', async ({ page }) => {
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(String(e)));

        await page.goto('/en-gb/app');
        // The ViV globals are loaded by the page's <script> tags regardless of vault state.
        await page.waitForFunction(
            () => typeof window.SecureChannel === 'function'
               && typeof window.KernelParent === 'function'
               && typeof window.KERNEL_SHELL_HTML === 'string',
            null, { timeout: 10_000 }
        );

        const result = await page.evaluate(
            ([driver, override]) => {
                // eslint-disable-next-line no-new-func
                const run = (0, eval)('(' + driver + ')');
                return run(override);
            },
            [DRIVER, CHILD_OVERRIDE]
        );

        expect(result.error, 'driver error: ' + result.error).toBeFalsy();
        expect(result.steps.ready, 'child kernel booted + sent ready').toBe(true);
        expect(result.steps.mountId).toBe('m-c');

        // Real browser crypto carried these across the null-origin boundary:
        expect(result.steps.readText).toBe('hello from child');
        expect(result.steps.readPng).toEqual([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

        expect(result.steps.writeOk).toBe(true);
        expect(result.steps.writeRoundTrip).toEqual([1, 2, 3, 4, 250, 0, 99]);

        // Two-sided gate + floor enforced by the REAL child handlers inside the iframe:
        expect(result.steps.outsideErr, 'write outside child grant → EPERM').toBe('EPERM');
        expect(result.steps.floorErr, 'read child .vault/** → EPROTECTED').toBe('EPROTECTED');

        expect(result.steps.brokerEntries).toBeGreaterThanOrEqual(5);

        expect(pageErrors, 'no uncaught page errors').toEqual([]);
    });

    test('B4 — Mounts debug tab renders mounts + broker log from the provider', async ({ page }) => {
        await page.goto('/en-gb/app');
        await page.waitForFunction(
            () => !!customElements.get('app-debug-mounts') && typeof window.VivMountsView === 'object',
            null, { timeout: 10_000 }
        );

        const text = await page.evaluate(() => {
            // Install a provider exactly as app-shell._ensureKernelParent does.
            window._appDebug = window._appDebug || {};
            window._appDebug.vivProvider = () => ({
                mounts: [{ mountId: 'm-acme', ref: 'acme', prefix: 'mounts/acme/', label: 'Acme Clinic', isolation: 'isolated' }],
                entries: [
                    { ts: 1, edge: 'A▶m-acme', mountId: 'm-acme', op: 'read',  path: 'notes.md',    credentialClass: 'standing', policy: 'auto', decision: 'allow', result: 'ok' },
                    { ts: 2, edge: 'A▶m-acme', mountId: 'm-acme', op: 'write', path: 'outside/x',   credentialClass: 'none',     policy: 'auto', decision: 'allow', result: 'EPERM' }
                ]
            });
            const el = document.createElement('app-debug-mounts');
            document.body.appendChild(el);
            document.dispatchEvent(new CustomEvent('app-debug:bridge-call', { detail: {} }));
            return el.shadowRoot.textContent;
        });

        // Mount row + relayed-op rows + the child refusal are all visible to the operator.
        expect(text).toContain('m-acme');
        expect(text).toContain('mounts/acme/');
        expect(text).toContain('Acme Clinic');
        expect(text).toContain('notes.md');
        expect(text).toContain('outside/x');
        expect(text).toContain('EPERM');     // child refusal surfaced in the audit log
        expect(text).toContain('ok');
    });
});
