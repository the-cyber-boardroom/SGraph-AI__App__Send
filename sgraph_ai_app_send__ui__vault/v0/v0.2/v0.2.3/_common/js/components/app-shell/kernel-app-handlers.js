/* =================================================================================
   Kernel app handlers — register vfs.* on a SecureChannel  (Phase 2)

   globalThis.registerKernelVfsHandlers(channel, ctx) — the kernel-side bodies that
   handle relayed cross-mount requests OR direct app→kernel requests over the bridge.
   Both gates of two-sided authority (§9) are enforced here:
     • AppPermissions.isFloor(verb, path)  → EPROTECTED   (non-grantable; .vault/**, app.json)
     • AppPermissions.can(perm, cap, path) → EPERM        (child's own app.json grant)
   PLUS the server-edge writability check → EREADONLY.

   The child runs THIS code. A parent's broker can grant relay access, but only the
   child's policy decides if the op happens — which is the entire point of
   "credential is necessary, not sufficient." (Architect pack §9.)

   Push errors are surfaced — silent push failures used to misreport WRITE success
   while the bytes never persisted; we treat that as EUNREACH so callers can retry
   or escalate. (Reviewer fix M1.)

   ctx = { dataSource, perm, vault?, onUpdated? }
     dataSource : VaultDataSource (provides getFileBytes / listFolder / saveFile /
                  deleteFile / writable)
     perm       : AppPermissions.parsePermissions(appJson) result
     vault      : SGVault instance (used for .push() — child's own Edge 1)
     onUpdated  : optional (path) => void — fires on successful write/delete
   ================================================================================= */

;(function () {
    'use strict';

    if (!globalThis.AppPermissions) {
        throw new Error('kernel-app-handlers requires AppPermissions (load app-permissions.js first)');
    }
    const AP = globalThis.AppPermissions;

    function codeError(code, msg) { const e = new Error(msg); e.code = code; return e; }

    // Map a verb to the AppPermissions capability used for the grant check.
    // list shares the read grant (architect pack §4 — list is a tree-walk read).
    function _capabilityFor(op) {
        switch (op) {
            case 'read':
            case 'list':   return 'fs.read';
            case 'write':  return 'fs.write';
            case 'delete': return 'fs.delete';
            case 'mkdir':  return 'fs.mkdir';
            case 'move':   return 'fs.move';
            default:       return null;
        }
    }

    // Verbs that bear the WRITE-side gate. Floor and capability are the same checks
    // shipped at the top kernel — we run them on the child side too.
    function _gate(op, path, perm) {
        if (typeof path !== 'string') throw codeError('ENOENT', 'path required');
        // The floor uses 'read' / 'write' (etc.) directly; map 'list' to 'read'.
        const floorVerb = (op === 'list') ? 'read' : op;
        if (AP.isFloor(floorVerb, path)) throw codeError('EPROTECTED', 'protected path');
        const cap = _capabilityFor(op);
        if (!cap) throw codeError('EPERM', 'unknown op');
        if (!AP.can(perm, cap, path)) throw codeError('EPERM', 'no capability');
    }

    function _splitPath(path) {
        const slash = path.lastIndexOf('/');
        return {
            dir:  slash > 0 ? '/' + path.slice(0, slash) : '/',
            name: path.slice(slash + 1)
        };
    }

    async function _safePush(vault) {
        if (!vault || typeof vault.push !== 'function') return;
        try { await vault.push(); }
        catch (err) {
            // M1: do not swallow. The write landed in the working tree but the server
            // never received it — that's the silent data-loss pattern KneeScore hit.
            throw codeError('EUNREACH', 'push failed: ' + (err && err.message || String(err)));
        }
    }

    function registerKernelVfsHandlers(channel, ctx) {
        if (!channel || typeof channel.handle !== 'function') {
            throw new Error('registerKernelVfsHandlers: channel.handle required');
        }
        if (!ctx || !ctx.dataSource) {
            throw new Error('registerKernelVfsHandlers: ctx.dataSource required');
        }
        const ds       = ctx.dataSource;
        const perm     = ctx.perm || AP.parsePermissions(null);
        const vault    = ctx.vault    || null;
        const onUpdate = ctx.onUpdated || null;

        channel.handle('vfs.read', async function (p) {
            const path = p && p.path;
            _gate('read', path, perm);
            const buf = await ds.getFileBytes(path);
            return buf instanceof Uint8Array ? buf : new Uint8Array(buf || []);
        });

        channel.handle('vfs.list', async function (p) {
            const raw   = (p && p.path) || '';
            _gate('list', raw, perm);
            const folder = raw === '' ? '/' : (raw.charAt(0) === '/' ? raw : '/' + raw);
            const entries = ds.listFolder(folder) || [];
            return entries;
        });

        channel.handle('vfs.write', async function (p) {
            const path = p && p.path;
            _gate('write', path, perm);
            if (!ds.writable) throw codeError('EREADONLY', 'Read-only vault');
            const { dir, name } = _splitPath(path);
            const data = p.data instanceof Uint8Array ? p.data : new Uint8Array(p.data || []);
            await ds.saveFile(dir, name, data);
            await _safePush(vault);
            if (onUpdate) { try { onUpdate(path); } catch (_) {} }
            return { ok: true, size: data.length, path };
        });

        channel.handle('vfs.delete', async function (p) {
            const path = p && p.path;
            _gate('delete', path, perm);
            if (!ds.writable) throw codeError('EREADONLY', 'Read-only vault');
            const { dir, name } = _splitPath(path);
            await ds.deleteFile(dir, name);
            await _safePush(vault);
            if (onUpdate) { try { onUpdate(path); } catch (_) {} }
            return { ok: true, path };
        });

        channel.handle('vfs.mkdir', async function (p) {
            const path = p && p.path;
            _gate('mkdir', path, perm);
            if (!ds.writable) throw codeError('EREADONLY', 'Read-only vault');
            const target = path.charAt(0) === '/' ? path : '/' + path;
            await ds.createFolder(target);
            await _safePush(vault);
            return { ok: true, path };
        });
    }

    globalThis.registerKernelVfsHandlers = registerKernelVfsHandlers;
})();
