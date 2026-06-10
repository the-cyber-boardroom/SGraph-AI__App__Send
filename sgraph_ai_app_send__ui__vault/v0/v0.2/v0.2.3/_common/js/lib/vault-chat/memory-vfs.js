/* =================================================================================
   Vault Chat — MemoryVfs (Phase 0 working set)

   The LLM's working set: an in-context, commit-free file system. Phase 0 ships a
   small native memory provider that implements the sg-vfs conceptual interface
   (async read/write/list/delete/stat/exists + a change feed for dirty tracking).

   Phase 1 swaps this for the real `sg-vfs` memory provider from tools.sgraph.ai
   (TOOLS/core/sg-vfs); the interface below is the seam. Application code (tools,
   flush controller, inspector) depends only on this interface, never on the
   backend — the Memory-FS principle applied client-side.

   Paths are absolute POSIX ("/work/summary.md"). Content is stored as bytes.
   Browser global: window.VaultChat.MemoryVfs
   ================================================================================= */
(function (root) {
    'use strict';

    const enc = (s) => (typeof TextEncoder !== 'undefined')
        ? new TextEncoder().encode(s)
        : Uint8Array.from(Buffer.from(s, 'utf8'));
    const dec = (b) => (typeof TextDecoder !== 'undefined')
        ? new TextDecoder().decode(b)
        : Buffer.from(b).toString('utf8');

    function norm(path) {
        if (!path || path === '/') return '/';
        let p = String(path).trim();
        if (p[0] !== '/') p = '/' + p;
        // collapse duplicate slashes, drop trailing slash (except root)
        p = p.replace(/\/+/g, '/');
        if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
        return p;
    }
    function basename(p) { const n = norm(p); return n === '/' ? '' : n.slice(n.lastIndexOf('/') + 1); }
    function dirname(p)  { const n = norm(p); const i = n.lastIndexOf('/'); return i <= 0 ? '/' : n.slice(0, i); }

    class MemoryVfs {
        constructor() {
            this._files = new Map();   // path -> Uint8Array
            this._subs  = new Set();   // change listeners (path, op) => void
        }

        onChange(cb) { this._subs.add(cb); return () => this._subs.delete(cb); }
        _emit(op, path) { for (const cb of this._subs) { try { cb({ op, path }); } catch (_) {} } }

        async exists(path) { return this._files.has(norm(path)); }

        async stat(path) {
            const p = norm(path);
            if (this._files.has(p)) return { path: p, name: basename(p), size: this._files.get(p).length, type: 'file' };
            // folder if any file is under it
            const pre = p === '/' ? '/' : p + '/';
            for (const k of this._files.keys()) if (k.startsWith(pre)) return { path: p, name: basename(p), size: 0, type: 'folder' };
            const err = new Error('ENOENT'); err.code = 'ENOENT'; throw err;
        }

        async readFile(path) {
            const p = norm(path);
            if (!this._files.has(p)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
            return this._files.get(p);
        }
        async readText(path) { return dec(await this.readFile(path)); }

        async writeFile(path, data) {
            const p = norm(path);
            const bytes = (typeof data === 'string') ? enc(data)
                : (data instanceof Uint8Array) ? data : new Uint8Array(data);
            this._files.set(p, bytes);
            this._emit('write', p);
            return { path: p, size: bytes.length };
        }

        async deleteFile(path) {
            const p = norm(path);
            const had = this._files.delete(p);
            if (had) this._emit('delete', p);
            return { path: p, deleted: had };
        }

        async listFolder(path) {
            const p = norm(path);
            const pre = p === '/' ? '/' : p + '/';
            const entries = new Map();   // name -> {path,name,size,type}
            for (const [k, v] of this._files) {
                if (!k.startsWith(pre)) continue;
                const rest = k.slice(pre.length);
                const slash = rest.indexOf('/');
                if (slash === -1) {
                    entries.set(rest, { path: k, name: rest, size: v.length, type: 'file' });
                } else {
                    const name = rest.slice(0, slash);
                    if (!entries.has(name)) entries.set(name, { path: pre + name, name, size: 0, type: 'folder' });
                }
            }
            return Array.from(entries.values()).sort((a, b) =>
                (a.type === b.type) ? a.name.localeCompare(b.name) : (a.type === 'folder' ? -1 : 1));
        }

        // flat list of every file (for snapshot / manifest)
        async listAll() {
            return Array.from(this._files.entries()).map(([path, v]) => ({ path, name: basename(path), size: v.length, type: 'file' }));
        }

        // helpers used by the flush controller (sync, no events)
        _peek(path) { return this._files.get(norm(path)) || null; }
    }

    MemoryVfs.norm = norm; MemoryVfs.basename = basename; MemoryVfs.dirname = dirname;

    root.VaultChat = root.VaultChat || {};
    root.VaultChat.MemoryVfs = MemoryVfs;
})(typeof window !== 'undefined' ? window : globalThis);
