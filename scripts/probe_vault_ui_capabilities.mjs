#!/usr/bin/env node
/* =================================================================================
   probe_vault_ui_capabilities.mjs — "is the declared-mounts / child-kernel sync code live?"

   Fetches the deployed vault UI's shipped JS and checks two groups of capability markers —
   A: the 2026-09-07 change (declared mounts + child-kernel sync discipline), B: the
   2026-09-08 change (write receipts, fs.* through the mount, mount projection, relay
   timeout) — plus the deployed build info and the API's health.
   Zero deps, read-only, no token needed.

     node scripts/probe_vault_ui_capabilities.mjs https://dev.vault.sgraph.ai https://dev.send.sgraph.ai
     node scripts/probe_vault_ui_capabilities.mjs                       # same defaults as above

   Exit codes — THREE outcomes, never conflated:
     0  LIVE          every marker present
     1  NOT LIVE      the files were fetched, but markers are missing (older build deployed)
     2  CANNOT CHECK  the UI could not be reached at all (proxy / DNS / offline). This says
                      NOTHING about the deployment — do not report a failed deploy on a 2.

   That distinction matters: run from a sandbox whose egress proxy refuses sgraph.ai, every
   fetch 403s and a marker-only check would claim the change is not deployed when it is.

   For the full functional confirmation (a real vault written through a declared mount in
   the deployed UI) see library/guides/vault-html/DECLARED-MOUNTS-E2E.md §6.
   ================================================================================= */

const UI  = (process.argv[2] || 'https://dev.vault.sgraph.ai').replace(/\/$/, '');
const API = (process.argv[3] || 'https://dev.send.sgraph.ai').replace(/\/$/, '');
const JS  = UI + '/_common/js';

// [file, marker, what it proves] — group A: the 7 Sep change (declared mounts + sync discipline)
const MARKERS_A = [
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
// group B: the 8 Sep change (receipts, fs.* through the mount, projection, relay timeout)
const MARKERS_B = [
    ['/components/app-shell/app-shell.js',             'commit_id:d.commit_id||null,published:!!d.published', 'write receipt reaches the app (commit_id, published)'],
    ['/components/app-shell/app-shell.js',             "_pushHostEvent('vfs.published'", 'vfs.published host event after auto-push'],
    ['/components/app-shell/app-shell.js',             '_listMountsForApps',           'sg.vault.mounts() returns the projection'],
    ['/components/app-shell/app-shell.js',             "'EXDEV'",                      'cross-boundary move refused (EXDEV)'],
    ['/components/app-shell/app-shell.js',             "'EUNDERPRIVILEGED')",          'delete across a mount → tier code, not EMOUNT_RO'],
    ['/components/app-shell/app-shell.js',             'declared-mount-shadows-folder', 'shadow pre-flight event'],
    ['/components/app-shell/app-shell.js',             'parentVaultId:',               'parent id sent to the child for the trailer'],
    ['/components/app-shell/kernel-parent.js',         'listForApps()',                'KernelParent.listForApps projection'],
    ['/components/app-shell/kernel-parent.js',         '_relayTimeoutMs',              'relay timeout (no hanging relays)'],
    ['/components/app-shell/secure-channel.js',        'timed out after',              'SecureChannel.request({ timeoutMs })'],
    ['/components/app-shell/kernel-app-handlers.js',   "channel.handle('vfs.move'",    'child vfs.move handler'],
    ['/components/app-shell/kernel-app-handlers.js',   'function _receipt',            'child receipts on every mutation'],
    ['/components/app-shell/kernel-bootstrap.js',      "' parent='",                   'Via-Mount trailer carries parent='],
    ['/components/app-shell/kernel-shell-bundle.js',   "channel.handle('vfs.move'",    'bundle carries vfs.move + receipts'],
];
const GROUPS = [['A · 7 Sep — declared mounts + sync discipline', MARKERS_A], ['B · 8 Sep — receipts, fs.* through the mount, projection', MARKERS_B]];
const MARKERS = MARKERS_A.concat(MARKERS_B);

// Fetch → { text } | { error }. Never throws: the caller distinguishes an unreachable host
// from a fetched-but-stale one, so a transport failure must stay visible as itself.
async function fetchText(url) {
    try {
        const r = await fetch(url, { redirect: 'follow' });
        if (!r.ok) return { error: 'HTTP ' + r.status };
        return { text: await r.text() };
    } catch (err) {
        return { error: (err && (err.cause?.code || err.message)) || String(err) };
    }
}

const cache = new Map();
function fileText(rel) {
    if (!cache.has(rel)) cache.set(rel, fetchText(JS + rel));
    return cache.get(rel);
}

console.log('UI  ' + UI + '\nAPI ' + API + '\n');

// ── Deployed build info (written by the deploy's inject_build_version.py step) ──────
const build = await fetchText(JS + '/build-info.js');
if (build.text) {
    const app = build.text.match(/appVersion\s*:\s*'([^']*)'/);
    const ui  = build.text.match(/uiVersion\s*:\s*'([^']*)'/);
    console.log('deployed build     app ' + (app ? app[1] : '?') + ' · ui ' + (ui ? ui[1] : '?'));
} else {
    console.log('deployed build     (unavailable: ' + build.error + ')');
}
const version = await fetchText(UI + '/version');
console.log('UI version file    ' + (version.text ? version.text.trim() : '(unavailable: ' + version.error + ')'));
const health = await fetchText(API + '/api/info/health');
console.log('API health         ' + (health.text ? health.text.trim().slice(0, 120) : '✗ ' + health.error));
console.log('');

// ── Capability markers, per group ──────────────────────────────────────────────────
let missing = 0, unreachable = 0;
for (const [title, list] of GROUPS) {
    console.log(title);
    let gm = 0;
    for (const [rel, marker, proves] of list) {
        const body = await fileText(rel);
        if (body.error) {
            unreachable++;
            console.log('  ? ' + proves.padEnd(52) + rel + '  (unreachable: ' + body.error + ')');
            continue;
        }
        const ok = body.text.includes(marker);
        if (!ok) { missing++; gm++; }
        console.log((ok ? '  ✓ ' : '  ✗ ') + proves.padEnd(52) + rel);
    }
    console.log('  → ' + (gm ? gm + ' missing' : 'all present') + '\n');
}

// ── Verdict ────────────────────────────────────────────────────────────────────────
console.log('');
if (unreachable === MARKERS.length) {
    console.log('CANNOT CHECK — no file could be fetched from ' + UI + '.');
    console.log('This is a NETWORK result, not a deployment result: it says nothing about what is');
    console.log('deployed. Check egress (a sandbox proxy refusing the host shows up as HTTP 403 on');
    console.log('every request), then re-run from a network that can reach the UI.');
    process.exit(2);
}
if (unreachable) {
    console.log(unreachable + ' file(s) unreachable and ' + missing + ' marker(s) missing — result INCONCLUSIVE; re-run when ' + UI + ' is fully reachable.');
    process.exit(2);
}
if (missing) {
    console.log(missing + ' marker(s) missing — see the per-group lines above for WHICH change is not (fully) live at ' + UI + '.');
    console.log('An older build is deployed, or the deploy has not finished (CloudFront can lag a few minutes).');
    process.exit(1);
}
console.log('LIVE — both changes (7 Sep declared mounts + sync discipline; 8 Sep receipts + fs.* through the mount) are deployed at ' + UI + '.');
process.exit(0);
