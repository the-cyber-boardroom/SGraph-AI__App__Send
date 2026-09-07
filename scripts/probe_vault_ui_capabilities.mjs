#!/usr/bin/env node
/* =================================================================================
   probe_vault_ui_capabilities.mjs — "is the declared-mounts / child-kernel sync code live?"

   Fetches the deployed vault UI's shipped JS and checks for the capability markers that
   only exist in the 2026-09-07 change (plus the server's health + versions). Zero deps,
   read-only, no token needed. Exit 0 = every marker present.

     node scripts/probe_vault_ui_capabilities.mjs https://dev.vault.sgraph.ai https://dev.send.sgraph.ai
     node scripts/probe_vault_ui_capabilities.mjs                       # same defaults as above

   For the full functional confirmation (a real vault written through a declared mount in
   the deployed UI) see library/guides/vault-html/DECLARED-MOUNTS-E2E.md §7.
   ================================================================================= */

const UI  = (process.argv[2] || 'https://dev.vault.sgraph.ai').replace(/\/$/, '');
const API = (process.argv[3] || 'https://dev.send.sgraph.ai').replace(/\/$/, '');
const JS  = UI + '/_common/js';

// [file, marker, what it proves]
const MARKERS = [
    ['/components/app-shell/kernel-app-handlers.js', "channel.handle('vfs.status'",  'vfs.status verb (child kernel)'],
    ['/components/app-shell/kernel-app-handlers.js', "channel.handle('vfs.sync'",    'vfs.sync verb (child kernel)'],
    ['/components/app-shell/kernel-app-handlers.js', 'async function _reconcile',    'reconcile-before-write'],
    ['/components/app-shell/kernel-app-handlers.js', "'EDIVERGED'",                  'CAS push: merge + retry → EDIVERGED'],
    ['/components/app-shell/kernel-app-handlers.js', '_isSettingsRecord',            'child .vault-settings.json hidden through a mount'],
    ['/lib/sg-vault/sg-vault-ref-manager.js',         'async writeRefIfMatch',        'compare-and-swap ref write (write-if-match)'],
    ['/lib/sg-vault/sg-vault--sync.js',                'async pushIfMatch',            'SGVault.pushIfMatch'],
    ['/components/app-shell/kernel-parent.js',         'async syncAll',                'KernelParent.status/sync/syncAll'],
    ['/components/app-shell/kernel-bootstrap.js',      "ch.send('boot-error'",         'child reports boot failures (boot-error)'],
    ['/components/app-shell/kernel-bootstrap.js',      'appJsonReader(vault, dataSource)', 'child policy read via the data source (fix)'],
    ['/components/app-shell/secure-channel.js',        'handshake timeout after',      'SecureChannel.create timeout (fix)'],
    ['/components/app-shell/app-shell.js',             'async _mountDeclaredVaults',   'declared mounts (owner *.link.json → mount)'],
    ['/components/app-shell/app-shell.js',             "channel.on('boot-error'",      'parent fails fast on a child boot error (fix)'],
    ['/components/app-shell/app-shell.js',             "kp.broker.setPolicy(res.mountId, cap, 'auto')", 'declared mounts: broker policy auto'],
    ['/components/app-shell/kernel-shell-bundle.js',   '_bootWithSecrets',             'kernel shell bundle rebuilt with the fixes'],
    ['/components/app-shell/kernel-shell-bundle.js',   'async writeRefIfMatch',        'bundle carries the CAS ref manager'],
    ['/components/app-shell/viv-mounts-view.js',       'function syncTag',             'HUD Mounts tab sync column'],
];

async function text(url) {
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
}

let failures = 0;
const cache = new Map();
async function fileText(rel) {
    if (!cache.has(rel)) cache.set(rel, text(JS + rel).catch((e) => ({ error: e.message })));
    return cache.get(rel);
}

console.log('UI  ' + UI + '\nAPI ' + API + '\n');
try { console.log('UI version file   ' + (await text(UI + '/version')).trim()); } catch (e) { console.log('UI version file   (unavailable: ' + e.message + ')'); }
try { console.log('API health        ' + (await text(API + '/api/info/health')).trim().slice(0, 120)); } catch (e) { failures++; console.log('API health        ✗ ' + e.message); }
try {
    const v = JSON.parse(await text(API + '/api/info/versions'));
    console.log('API versions      sgraph_ai_app_send=' + (v.sgraph_ai_app_send || '?'));
} catch (e) { console.log('API versions      (unavailable: ' + e.message + ')'); }
console.log('');

for (const [rel, marker, proves] of MARKERS) {
    const body = await fileText(rel);
    let ok = false, note = '';
    if (body && body.error) note = body.error; else ok = body.includes(marker);
    if (!ok) failures++;
    console.log((ok ? '  ✓ ' : '  ✗ ') + proves.padEnd(52) + rel + (note ? '  (' + note + ')' : ''));
}

console.log('\n' + (failures ? failures + ' marker(s) missing — the 2026-09-07 change is NOT (fully) live at ' + UI
                            : 'all markers present — declared mounts + child-kernel sync discipline are live at ' + UI));
process.exit(failures ? 1 : 0);
