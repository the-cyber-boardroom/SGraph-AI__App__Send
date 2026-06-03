/* =================================================================================
   KernelMounts — vault mount table + longest-prefix path resolution  (Phase 2)

   globalThis.KernelMounts. One instance per kernel. Pure logic — no DOM, no port.
   Depends on globalThis.AppPermissions for normalizePath (path traversal collapse).

   A "mount" is a child vault reachable from this kernel via a SecureChannel.
   Resolving a path tells the kernel whether to act locally or relay to a child.
   ================================================================================= */

;(function () {
    'use strict';

    if (!globalThis.AppPermissions) {
        throw new Error('KernelMounts requires AppPermissions (load app-permissions.js first)');
    }
    const AP = globalThis.AppPermissions;

    class KernelMounts {
        constructor() {
            // mountId → { mountId, prefix (always ends with '/'), ref, channel, label, meta }
            this._mounts = new Map();
        }

        add(opts) {
            if (!opts || !opts.mountId)             throw new Error('KernelMounts.add: mountId required');
            if (!opts.prefix && opts.prefix !== '') throw new Error('KernelMounts.add: prefix required');
            // Normalise prefix: collapse traversal, drop leading '/', ensure trailing '/'.
            let p = AP.normalizePath(opts.prefix);
            if (p && !p.endsWith('/')) p += '/';
            this._mounts.set(opts.mountId, {
                mountId: opts.mountId,
                prefix:  p,
                ref:     opts.ref || null,
                channel: opts.channel || null,
                label:   opts.label || null,
                meta:    opts.meta  || null
            });
            return this._mounts.get(opts.mountId);
        }

        remove(mountId) {
            const m = this._mounts.get(mountId);
            this._mounts.delete(mountId);
            return m || null;
        }

        get(mountId) { return this._mounts.get(mountId) || null; }
        list()       { return Array.from(this._mounts.values()); }
        size()       { return this._mounts.size; }

        // Longest-prefix match on the normalised path. Returns { mount, rest } or null.
        // rest === '' means the path IS the mount root (e.g. 'mounts/p' against prefix 'mounts/p/').
        resolve(path) {
            const norm = AP.normalizePath(path);
            if (norm === '' || norm == null) return null;

            let best = null, bestLen = -1;
            for (const m of this._mounts.values()) {
                if (!m.prefix) continue;
                const head = m.prefix.slice(0, -1);          // 'mounts/p'  (drop trailing '/')
                if (norm === head || norm.startsWith(m.prefix)) {
                    if (m.prefix.length > bestLen) {
                        best    = m;
                        bestLen = m.prefix.length;
                    }
                }
            }
            if (!best) return null;
            const head = best.prefix.slice(0, -1);
            const rest = (norm === head) ? '' : norm.slice(best.prefix.length);
            return { mount: best, rest };
        }
    }

    globalThis.KernelMounts = KernelMounts;
})();
