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
     onUpdated  : optional (path) => void — fires on successful write/delete, and
                  with '/' when a refresh/sync replaced the working tree
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
    // The child's own settings record (.vault-settings.json at its root: vault_id, name,
    // description) is not the mounting app's business — it would reveal that the path is
    // another vault. Hidden from listings and refused like the .vault/** floor.
    function _isSettingsRecord(path) {
        return String(path || '').replace(/^\/+/, '') === '.vault-settings.json';
    }

    function _gate(op, path, perm) {
        if (typeof path !== 'string') throw codeError('ENOENT', 'path required');
        // The floor uses 'read' / 'write' (etc.) directly; map 'list' to 'read'.
        const floorVerb = (op === 'list') ? 'read' : op;
        if (AP.isFloor(floorVerb, path)) throw codeError('EPROTECTED', 'protected path');
        if (op !== 'list' && _isSettingsRecord(path)) throw codeError('EPROTECTED', 'protected path');
        const cap = _capabilityFor(op);
        if (!cap) throw codeError('EPERM', 'unknown op');
        if (!AP.can(perm, cap, path)) throw codeError('EPERM', 'no capability');
    }

    // Recursive listing under `folder` ('/' = everything), child-relative paths, floor
    // entries (.vault/**) removed. The REAL VaultDataSource has no listFolder — it exposes
    // getFileList() ({path, name, dir, size}) like the top-level bridge consumes; the
    // synthetic harness sources expose listFolder. Same semantics either way: the parent
    // bridge maps {path, name, size, dir} onto the app's entry shape.
    function _listEntries(ds, folder) {
        let entries;
        if (typeof ds.listFolder === 'function') {
            entries = ds.listFolder(folder) || [];
        } else if (typeof ds.getFileList === 'function') {
            const all = ds.getFileList() || [];
            const pfx = folder === '/' ? '' : folder.replace(/^\//, '').replace(/\/+$/, '') + '/';
            entries = pfx === '' ? all : all.filter(e => e && (e.path === pfx.slice(0, -1) || String(e.path).indexOf(pfx) === 0));
        } else {
            entries = [];
        }
        return entries.filter(e => e && !AP.hasVaultSegment(String(e.path || '')) && !_isSettingsRecord(e.path));
    }

    function _splitPath(path) {
        const slash = path.lastIndexOf('/');
        return {
            dir:  slash > 0 ? '/' + path.slice(0, slash) : '/',
            name: path.slice(slash + 1)
        };
    }

    // ------------------------------------------------------------------------------
    // Sync discipline for headless child kernels (declared mounts, Phase 5)
    //
    // A child kernel has nobody watching its "behind" chip, so it must keep itself
    // honest against the server:
    //   • reconcile-before-write : re-read the named ref before every mutation; if it
    //     moved, fast-forward (or three-way merge) first so our commit descends from it.
    //   • CAS push              : publish with write-if-match; on ECAS reconcile + retry
    //     once; a second ECAS is EDIVERGED (never overwrite someone else's publish).
    //   • refresh-before-read   : throttled (REFRESH_MS) re-read on vfs.read/list when
    //     the view is clean, so a read-only child sees other writers' pushes.
    //   • vfs.status / vfs.sync : parent-side visibility (KernelParent.status/sync).
    //
    // Only REAL SGVault instances take part: `_syncable()` looks for the ref manager
    // and the named ref id. Synthetic vaults (unit harnesses, sg.vault.mount stubs)
    // keep the old plain-push path — no behaviour change for runtime mounts.
    // ------------------------------------------------------------------------------

    const REFRESH_MS_DEFAULT = 5000;
    const _syncState = new WeakMap();
    function _refreshMs() {
        const v = registerKernelVfsHandlers.REFRESH_MS;
        return (typeof v === 'number' && v >= 0) ? v : REFRESH_MS_DEFAULT;
    }

    function _syncable(vault) {
        return !!(vault && vault._refManager && vault._refFileId &&
                  typeof vault._refManager.readRef === 'function');
    }

    function _state(vault) {
        let st = _syncState.get(vault);
        if (!st) { st = { lastRefresh: 0, lastPush: null, lastMerge: null, lastError: null }; _syncState.set(vault, st); }
        return st;
    }

    function _clean(vault) {
        return vault.writable === false || !vault._namedHeadId || vault._headCommitId === vault._namedHeadId;
    }

    // Bring the working tree up to date with the server's named ref.
    // Returns { changed, serverHead, fastForward?, conflicts? }.
    async function _reconcile(vault, ds) {
        if (!_syncable(vault)) return { changed: false, syncable: false };
        const st         = _state(vault);
        const serverHead = await vault._refManager.readRef(vault._refFileId);
        if (!serverHead || serverHead === vault._namedHeadId) {
            return { changed: false, serverHead: serverHead || null };
        }
        let out;
        if (vault.writable === false) {
            // Read-only child: no clone branch, just re-load the tree at the new tip.
            await vault._loadTreeFromCommit(serverHead);
            vault._headCommitId = serverHead;
            vault._namedHeadId  = serverHead;
            st.lastMerge = { at: Date.now(), fastForward: true, conflicts: [] };
            out = { changed: true, serverHead, fastForward: true, conflicts: [] };
        } else {
            const r = await vault.merge(serverHead, { publish: false });
            st.lastMerge = { at: Date.now(), fastForward: !!r.fastForward, conflicts: r.conflicts || [] };
            out = { changed: !!r.merged, serverHead, fastForward: !!r.fastForward, conflicts: r.conflicts || [] };
        }
        // A reload leaves sub-folders LAZY (empty children until touched). The shells load
        // everything on open; keep that invariant here so a later write into a nested folder
        // never commits a tree missing the folder's other files.
        if (out.changed && ds && typeof ds.loadAllSubTrees === 'function') await ds.loadAllSubTrees();
        return out;
    }

    // Throttled refresh for reads. Never throws: a stale view beats a failed read.
    async function _maybeRefresh(vault, ds, onUpdate) {
        if (!_syncable(vault)) return false;
        const st  = _state(vault);
        const now = Date.now();
        if (now - st.lastRefresh < _refreshMs()) return false;
        st.lastRefresh = now;
        if (!_clean(vault)) return false;                       // unpushed local work: leave it to the write path
        try {
            const r = await _reconcile(vault, ds);
            if (r.changed && onUpdate) { try { onUpdate('/'); } catch (_) {} }
            return r.changed;
        } catch (err) {
            st.lastError = { at: now, code: err && err.code || null, message: err && err.message || String(err) };
            return false;
        }
    }

    async function _casPush(vault, ds) {
        try { await vault.pushIfMatch(); return; }
        catch (err) {
            if (!err || err.code !== 'ECAS') throw err;
        }
        // Somebody published between our reconcile and our push: merge and try once more.
        await _reconcile(vault, ds);
        try { await vault.pushIfMatch(); }
        catch (err) {
            if (err && err.code === 'ECAS') throw codeError('EDIVERGED', 'named ref keeps moving; local commit kept, not published');
            throw err;
        }
    }

    async function _safePush(vault, ds) {
        if (!vault || typeof vault.push !== 'function') return;
        const cas = _syncable(vault) && typeof vault.pushIfMatch === 'function';
        try {
            if (cas) {
                // pushIfMatch needs the ref's raw bytes cached; a freshly created vault has
                // only ever WRITTEN its named ref, so read it once before the first CAS.
                if (vault._refManager.lastRawRef(vault._refFileId) === undefined) await _reconcile(vault, ds);
                await _casPush(vault, ds);
            } else {
                await vault.push();
            }
            _state(vault).lastPush = { at: Date.now(), head: vault._headCommitId };
        }
        catch (err) {
            if (err && err.code === 'EDIVERGED') { _state(vault).lastError = { at: Date.now(), code: 'EDIVERGED', message: err.message }; throw err; }
            // M1: do not swallow. The write landed in the working tree but the server
            // never received it — that's the silent data-loss pattern KneeScore hit.
            _state(vault).lastError = { at: Date.now(), code: 'EUNREACH', message: err && err.message || String(err) };
            throw codeError('EUNREACH', 'push failed: ' + (err && err.message || String(err)));
        }
    }

    // One ref read + local counters. Shape is stable: the parent HUD renders it.
    async function _status(vault) {
        if (!_syncable(vault)) return { syncable: false, writable: !!(vault && vault.writable) };
        const st = _state(vault);
        let serverHead = null;
        try { serverHead = await vault._refManager.readRef(vault._refFileId); } catch (_) {}
        const head  = vault._headCommitId || null;
        const named = vault._namedHeadId  || null;
        let ahead = 0, behind = 0, diverged = false;
        if (vault.writable !== false && head && named && head !== named) {
            try { ahead = await vault.getAheadCount(); } catch (_) {}
            if (!ahead) diverged = true;                         // named not reachable from head
        }
        if (serverHead && serverHead !== named) {
            try { behind = await vault.getBehindCount(); } catch (_) { behind = 1; }
            if (!behind) behind = 1;                             // moved but unwalkable: still "behind"
        }
        let state = 'clean';
        if (diverged || (ahead && behind)) state = 'diverged';
        else if (ahead)  state = 'ahead';
        else if (behind) state = 'behind';
        return {
            syncable  : true,
            writable  : vault.writable !== false,
            head, named, serverHead,
            ahead, behind, diverged,
            lastPush  : st.lastPush,
            lastMerge : st.lastMerge,
            lastError : st.lastError,
            state
        };
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
            await _maybeRefresh(vault, ds, onUpdate);
            const buf = await ds.getFileBytes(path);
            return buf instanceof Uint8Array ? buf : new Uint8Array(buf || []);
        });

        channel.handle('vfs.list', async function (p) {
            const raw   = (p && p.path) || '';
            _gate('list', raw, perm);
            await _maybeRefresh(vault, ds, onUpdate);
            const folder = raw === '' ? '/' : (raw.charAt(0) === '/' ? raw : '/' + raw);
            return _listEntries(ds, folder);
        });

        channel.handle('vfs.write', async function (p) {
            const path = p && p.path;
            _gate('write', path, perm);
            if (!ds.writable) throw codeError('EREADONLY', 'Read-only vault');
            await _reconcile(vault, ds);
            const { dir, name } = _splitPath(path);
            const data = p.data instanceof Uint8Array ? p.data : new Uint8Array(p.data || []);
            await ds.saveFile(dir, name, data);
            await _safePush(vault, ds);
            if (onUpdate) { try { onUpdate(path); } catch (_) {} }
            return { ok: true, size: data.length, path };
        });

        channel.handle('vfs.delete', async function (p) {
            const path = p && p.path;
            _gate('delete', path, perm);
            if (!ds.writable) throw codeError('EREADONLY', 'Read-only vault');
            await _reconcile(vault, ds);
            const { dir, name } = _splitPath(path);
            await ds.deleteFile(dir, name);
            await _safePush(vault, ds);
            if (onUpdate) { try { onUpdate(path); } catch (_) {} }
            return { ok: true, path };
        });

        channel.handle('vfs.mkdir', async function (p) {
            const path = p && p.path;
            _gate('mkdir', path, perm);
            if (!ds.writable) throw codeError('EREADONLY', 'Read-only vault');
            await _reconcile(vault, ds);
            const target = path.charAt(0) === '/' ? path : '/' + path;
            await ds.createFolder(target);
            await _safePush(vault, ds);
            return { ok: true, path };
        });

        // Parent-side visibility (KernelParent.status / sync). No app-level gate: these
        // touch no file content, only the ref pointers the child already holds.
        channel.handle('vfs.status', async function () {
            return _status(vault);
        });

        channel.handle('vfs.sync', async function () {
            let changed = false;
            if (_syncable(vault)) {
                const r = await _reconcile(vault, ds);
                changed = !!r.changed;
                if (vault.writable !== false && vault._headCommitId !== vault._namedHeadId) {
                    await _safePush(vault, ds);                      // publish anything a failed push left behind
                }
            }
            if (changed && onUpdate) { try { onUpdate('/'); } catch (_) {} }
            const st = await _status(vault);
            st.changed = changed;
            return st;
        });
    }

    // Tunable for tests (ms between refresh-before-read ref checks); undefined = default.
    registerKernelVfsHandlers.REFRESH_MS = undefined;
    globalThis.registerKernelVfsHandlers = registerKernelVfsHandlers;
})();
