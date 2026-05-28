#!/usr/bin/env python3
"""
build-kernel-shell-bundle.py — concatenate the kernel shell + dependencies into a
single self-contained HTML string and emit it as a JS module that sets
globalThis.KERNEL_SHELL_HTML.

Why: a `null`-origin (sandboxed srcdoc) iframe cannot load `<script src=...>`
subresources from the same origin (Origin: null CORS wall). So when a parent
kernel spawns a child kernel, it must inject EVERYTHING the child needs as one
self-contained HTML document. This script builds that document.

Run from repo root:
    python3 scripts/build-kernel-shell-bundle.py
Or as part of any build/CI step.

Output: sgraph_ai_app_send__ui__vault/.../js/components/app-shell/kernel-shell-bundle.js
"""
import json
import os
import sys

ROOT = 'sgraph_ai_app_send__ui__vault/v0/v0.2/v0.2.3/_common'

# Dependency order — same order the /app page loads, with kernel-* added.
SCRIPTS = [
    'js/components/app-shell/app-permissions.js',
    'js/components/app-shell/secure-channel-envelope.js',
    'js/components/app-shell/secure-channel.js',
    'js/lib/sg-vault/sg-vault-crypto.js',
    'js/lib/sg-vault/sg-vault-object-store.js',
    'js/lib/sg-vault/sg-vault-ref-manager.js',
    'js/lib/sg-vault/sg-vault-commit.js',
    'js/lib/sg-vault/sg-vault.js',
    'js/lib/sg-vault/sg-vault--file-ops.js',
    'js/lib/sg-vault/sg-vault--folder-ops.js',
    'js/lib/sg-vault/sg-vault--sync.js',
    'js/lib/sg-vault/sg-vault--history.js',
    'js/lib/sg-vault/sg-vault--branches.js',
    'js/lib/sg-send/sg-send-crypto.js',
    'js/lib/sg-send/sg-send.js',
    'js/adapters/vault-data-source.js',
    'js/adapters/composite-data-source.js',
    'js/lib/links/vault-links.js',
    'js/components/app-shell/kernel-mounts.js',
    'js/components/app-shell/kernel-broker.js',
]

# Inline child-side kernel boot listener. The ONE window.message listener — grabs
# the transferred port and never listens on window again. Then SecureChannel.accept
# completes the handshake; on 'secrets' the child kernel boots its vault.
KERNEL_BOOTSTRAP_JS = r"""
(function () {
    'use strict';
    // The ONE window.message listener — self-removes after grabbing port2.
    function boot(e) {
        if (!e.data || e.data.type !== 'init') return;
        window.removeEventListener('message', boot);
        var port = e.ports && e.ports[0];
        if (!port) { console.error('[kernel] no port on init'); return; }
        SecureChannel.accept(port, { expectSensitive: true, cid: e.data.cid }).then(function (ch) {
            // Channel ready. Wait for 'secrets' delivered from the parent.
            ch.handle('secrets', async function (payload) {
                var vaultKey = payload && payload.vaultKey;
                var token    = payload && payload.accessToken;
                if (!vaultKey) throw Object.assign(new Error('missing vaultKey'), { code: 'EPROTO' });
                // Open the vault using the shipped lib.
                var endpoint = 'https://dev.send.sgraph.ai';
                var sgSend   = new SGSend({ endpoint: endpoint });
                if (token) sgSend.token = token;
                var vault       = await SGVault.open(sgSend, vaultKey);
                var dataSource  = new VaultDataSource(vault, token || null);
                // Register vfs.* handlers — relayed cross-vault ops land here.
                ch.handle('vfs.read', async function (p) {
                    return dataSource.getFileBytes(p.path);
                });
                ch.handle('vfs.list', async function (p) {
                    return dataSource.listFolder('/' + (p.path || ''));
                });
                ch.handle('vfs.write', async function (p) {
                    if (!dataSource.writable) throw Object.assign(new Error('Read-only'), { code: 'EPERM' });
                    var path = p.path || '';
                    var slash = path.lastIndexOf('/');
                    var dir  = slash > 0 ? '/' + path.slice(0, slash) : '/';
                    var name = path.slice(slash + 1);
                    await dataSource.saveFile(dir, name, p.data instanceof Uint8Array ? p.data : new Uint8Array(p.data || []));
                    // Push on the child's own server edge so the parent vault is untouched.
                    if (vault.push) { try { await vault.push(); } catch (_) {} }
                    return { ok: true };
                });
                // Signal ready to the parent (responder.send works both ways — review B1).
                await ch.send('ready', { kernelId: 'k-' + (vault._vaultId || Date.now()) });
            });
        }).catch(function (err) { console.error('[kernel] handshake failed', err); });
    }
    window.addEventListener('message', boot);
})();
""".strip()


def read_script(rel_path: str) -> str:
    path = os.path.join(ROOT, rel_path)
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def main() -> int:
    missing = [s for s in SCRIPTS if not os.path.exists(os.path.join(ROOT, s))]
    if missing:
        for m in missing:
            print(f'  MISSING: {m}', file=sys.stderr)
        print('Cannot build kernel-shell bundle.', file=sys.stderr)
        return 1

    scripts_html = []
    for rel in SCRIPTS:
        scripts_html.append(f'<script>\n{read_script(rel)}\n</script>')
    scripts_html.append(f'<script>\n{KERNEL_BOOTSTRAP_JS}\n</script>')

    html = (
        '<!DOCTYPE html><html><head><meta charset="utf-8">\n'
        + '\n'.join(scripts_html)
        + '\n</head><body></body></html>'
    )

    bundle = '/* AUTO-GENERATED by scripts/build-kernel-shell-bundle.py — do not edit by hand */\n'
    bundle += '(function () { "use strict"; globalThis.KERNEL_SHELL_HTML = '
    bundle += json.dumps(html)
    bundle += '; })();\n'

    out_path = os.path.join(ROOT, 'js/components/app-shell/kernel-shell-bundle.js')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(bundle)

    print(f'  wrote {len(bundle):,} bytes → {out_path}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
