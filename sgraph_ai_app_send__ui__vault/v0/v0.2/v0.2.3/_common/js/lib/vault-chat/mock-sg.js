/* =================================================================================
   Vault Chat — mock window.sg (test fixture, doc 07 §4)

   An in-memory stand-in for the app-shell bridge, so the chat app and the flush
   controller can be exercised on the standalone test page and in unit tests WITHOUT
   a real vault. It implements the surface the chat depends on, including the Phase-3
   extensions writeBatch/delete and the /.vault/** exclusion (doc 03).

   This is a fixture, not a patch of production code.
   Browser global: window.VaultChat.createMockSg
   ================================================================================= */
(function (root) {
    'use strict';

    const enc = (s) => (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(s) : Uint8Array.from(Buffer.from(s, 'utf8'));

    function isReserved(path) { return path === '/.vault' || String(path).startsWith('/.vault/'); }
    function basename(p) { return p.slice(p.lastIndexOf('/') + 1); }

    function createMockSg(opts) {
        opts = opts || {};
        const files = new Map();   // path -> Uint8Array
        const commits = [];        // {message, count, items}
        const messages = [];       // ui.message log
        const writable = opts.writable !== false;

        // seed: { '/report.md': 'text', ... }  (reserved paths are accepted in seed but hidden to reads)
        for (const [p, v] of Object.entries(opts.seed || {})) files.set(p, typeof v === 'string' ? enc(v) : v);

        function denyReserved(path) { if (isReserved(path)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } }

        let commitSeq = 0;

        const sg = {
            vfs: {
                async read(path)     { denyReserved(path); if (!files.has(path)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } return files.get(path).buffer; },
                async readText(path) { denyReserved(path); if (!files.has(path)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } return (typeof TextDecoder !== 'undefined' ? new TextDecoder() : { decode: (b) => Buffer.from(b).toString('utf8') }).decode(files.get(path)); },
                async write(path, data) { denyReserved(path); const b = typeof data === 'string' ? enc(data) : (data instanceof Uint8Array ? data : new Uint8Array(data)); files.set(path, b); commits.push({ message: 'auto', count: 1, items: [path] }); return { path, size: b.length }; },
                async list(path) {
                    const pre = (path === '/' || !path) ? '/' : path.replace(/\/?$/, '/');
                    const out = new Map();
                    for (const [k, v] of files) {
                        if (isReserved(k)) continue;             // reserved prefix invisible (doc 03 §2)
                        if (!k.startsWith(pre)) continue;
                        const rest = k.slice(pre.length); const slash = rest.indexOf('/');
                        if (slash === -1) out.set(rest, { path: k, name: rest, size: v.length, type: 'file' });
                        else { const n = rest.slice(0, slash); if (!out.has(n)) out.set(n, { path: pre + n, name: n, size: 0, type: 'folder' }); }
                    }
                    return Array.from(out.values());
                },
                // Phase-3 EXTENSION (doc 03 §3): batch write/delete => ONE commit
                async writeBatch(items, o) {
                    o = o || {};
                    let n = 0;
                    for (const it of (items || [])) {
                        denyReserved(it.path);                    // a flush must never touch the reserved prefix
                        if (it.op === 'delete') { files.delete(it.path); n++; }
                        else { const b = typeof it.data === 'string' ? enc(it.data) : (it.data instanceof Uint8Array ? it.data : new Uint8Array(it.data)); files.set(it.path, b); n++; }
                    }
                    const commitId = 'mock-commit-' + (++commitSeq);
                    commits.push({ commitId, message: o.message || '', count: n, items: (items || []).map((i) => i.path), snapshot: !!o.snapshot });
                    return { commitId, count: n };
                },
                async delete(path) { denyReserved(path); const had = files.delete(path); commits.push({ message: 'delete', count: had ? 1 : 0, items: [path] }); return { path }; },
            },
            sync: {
                async status() { return { current: 'mock', serverHasNewer: false, localHasUnsynced: commits.length > 0, writable }; },
                async check() { return true; }, async push() { return { ok: true }; }, async pull() { return { ok: true }; }, async refresh() { return true; },
            },
            auth: { hasKey: writable, async setKey() { return true; }, async check() { return true; }, clear() {} },
            ui: { message(text, type) { messages.push({ text, type: type || 'info' }); }, dismiss() {} },
            app: { selfPath: 'chat/index.html', writable, vaultName: opts.vaultName || 'mock-vault', vaultId: 'mock', fileCount: files.size, totalSize: 0 },
            loadCss() {}, loadJs() {},

            // test introspection (not part of the real bridge)
            _debug: { files, commits, messages },
        };
        return sg;
    }

    root.VaultChat = root.VaultChat || {};
    root.VaultChat.createMockSg = createMockSg;
})(typeof window !== 'undefined' ? window : globalThis);
