/* =================================================================================
   SGraph Vault — VaultAccess (single access facade: root local + mounts via relay)
   v0.1.0

   The one interface all vault UI should consume (tree, browse-edit, REPL, settings),
   so callers never branch on "is this the root vault or a sub-vault mount." It presents
   the SAME contract as VaultDataSource / CompositeDataSource:

     getTree / getFileList / getFileBytes / loadFolder / loadAllSubTrees /
     saveFile / renameFile / deleteFile / createFolder / deleteFolder /
     renameFolder / moveFile / moveFolder / writable / writableAt / scan

   Routing (the whole point):
     • ROOT paths           → the local VaultDataSource (fast, in-process).
     • MOUNT paths (under a registered sub-vault prefix):
         - reads  → relay.relay('read'/'list', { path }) when a relay is present,
                    else fall through to the composite read-through (back-compat).
         - writes → relay.relay('write'/…, { path, data }) ONLY when the mount is rw;
                    ro mounts throw EREADONLY; unknown/absent relay throws EUNREACH.

   This is the M1 seam of the unify-on-one-kernel-path plan (05/31 scoping). It does NOT
   delete CompositeDataSource — it wraps a data source for reads and an optional relay for
   mount-scoped writes, so it can be introduced incrementally (root-only first, then mounts).

   Pure logic; no DOM. Unit-testable with a stub data source + stub relay. Exposed as
   window.VaultAccess (browser) and module.exports (node).

   Relay contract (KernelParent.relay): async relay(op, { path, data, credential }) where
   op ∈ {'read','list','write','delete','mkdir',…}; path is the FULL composite path (the
   relay strips the mount prefix itself via its mount table).
   ================================================================================= */

class VaultAccess {

    // root: a VaultDataSource (or CompositeDataSource) used for reads + root writes.
    // opts.relay:  optional { relay(op,args), … } (a KernelParent) for mount-scoped writes.
    // opts.mounts: optional () => Array<{ mountPath, access }>  — the live mount table.
    //              `access` is 'ro' | 'rw'. If omitted, VaultAccess asks `root` via
    //              root._mountForPath(path) when available (CompositeDataSource exposes it).
    constructor(root, opts) {
        opts = opts || {};
        this._root        = root;
        this._relay       = opts.relay  || null;
        this._mountsFn    = opts.mounts || null;
        this.onTreeChanged = null;
        if (root) {
            const prev = root.onTreeChanged;
            root.onTreeChanged = () => {
                if (typeof prev === 'function') { try { prev(); } catch (_) {} }
                if (this.onTreeChanged) this.onTreeChanged();
            };
        }
    }

    // ── identity / write-gate (root-level) ──────────────────────────────────
    get writable()    { return !!(this._root && this._root.writable); }
    set writable(v)   { if (this._root) this._root.writable = v; }
    get _accessKey()  { return this._root && this._root._accessKey; }
    set _accessKey(v) { if (this._root) this._root._accessKey = v; }
    get _vault()      { return this._root && this._root._vault; }

    // ── mount resolution ────────────────────────────────────────────────────
    _norm(p) { return String(p == null ? '' : p).replace(/^\//, ''); }

    // → { mountPath, access } | null
    _mountForPath(path) {
        const norm = this._norm(path);
        if (this._mountsFn) {
            let list = [];
            try { list = this._mountsFn() || []; } catch (_) { list = []; }
            for (const m of list) {
                const mp = this._norm(m.mountPath);
                if (norm === mp || norm.startsWith(mp + '/')) return { mountPath: mp, access: m.access || 'ro' };
            }
            return null;
        }
        if (this._root && typeof this._root._mountForPath === 'function') {
            const m = this._root._mountForPath(norm);
            return m ? { mountPath: this._norm(m.mountPath), access: m.access || 'ro' } : null;
        }
        return null;
    }

    // is a write to this path allowed, and by which route?
    // → { route: 'root' }            (root write, gated by root.writable)
    //   { route: 'relay', mount }    (rw mount → relay)
    //   throws codeError for ro mount (EREADONLY) or rw mount with no relay (EUNREACH)
    _writeRouteFor(path) {
        const m = this._mountForPath(path);
        if (!m) return { route: 'root' };
        if (m.access !== 'rw') throw _codeError('EREADONLY', 'Sub-vault is read-only: ' + m.mountPath);
        if (!this._relay)      throw _codeError('EUNREACH', 'No relay wired for rw sub-vault: ' + m.mountPath);
        return { route: 'relay', mount: m };
    }

    // public: does a path resolve to a writable target? (UI enables edit controls on this)
    writableAt(path) {
        const m = this._mountForPath(path);
        if (!m)               return this.writable;           // root path → root gate
        if (m.access !== 'rw') return false;                  // ro mount
        return !!this._relay;                                 // rw mount needs a relay
    }

    // ── reads (delegate to root; root composite already splices mounts) ──────
    getTree()                 { return this._root.getTree(); }
    getFileList()             { return this._root.getFileList(); }
    async loadAllSubTrees()   { return this._root.loadAllSubTrees(); }
    getOrigName()             { return this._root.getOrigName ? this._root.getOrigName() : ''; }
    getOrigSize()             { return this._root.getOrigSize ? this._root.getOrigSize() : 0; }
    async scan()              { return (this._root && typeof this._root.scan === 'function') ? this._root.scan() : this; }

    async getFileBytes(path) {
        const m = this._mountForPath(path);
        // rw mount + relay → read through the relay (consistency with the writable child kernel);
        // otherwise let the root (composite read-through) handle it (fast path / ro).
        if (m && m.access === 'rw' && this._relay) {
            return _toBytes(await this._relay.relay('read', { path: this._norm(path) }));
        }
        return this._root.getFileBytes(path);
    }

    async loadFolder(folderPath) {
        const m = this._mountForPath(folderPath);
        if (m && m.access === 'rw' && this._relay) {
            // relay-backed listing; the child kernel resolves the prefix
            return this._relay.relay('list', { path: this._norm(folderPath) });
        }
        return this._root.loadFolder ? this._root.loadFolder(folderPath) : undefined;
    }

    // ── writes (route root vs relay by mount) ────────────────────────────────
    async saveFile(folder, name, bytes) {
        const full = _join(folder, name);
        const r = this._writeRouteFor(full);
        if (r.route === 'relay') return this._relay.relay('write', { path: this._norm(full), data: bytes });
        return this._root.saveFile(folder, name, bytes);
    }

    async deleteFile(folder, name) {
        const full = _join(folder, name);
        const r = this._writeRouteFor(full);
        if (r.route === 'relay') return this._relay.relay('delete', { path: this._norm(full) });
        return this._root.deleteFile(folder, name);
    }

    async createFolder(path) {
        const r = this._writeRouteFor(path);
        if (r.route === 'relay') return this._relay.relay('mkdir', { path: this._norm(path) });
        return this._root.createFolder(path);
    }

    async deleteFolder(path) {
        const r = this._writeRouteFor(path);
        if (r.route === 'relay') return this._relay.relay('rmdir', { path: this._norm(path) });
        return this._root.deleteFolder(path);
    }

    // rename/move: cross-boundary (root↔mount, or mount↔different-mount) is rejected for
    // now (M3 follow-up). Same-domain operations route to that domain.
    async renameFile(folder, oldName, newName) {
        const from = _join(folder, oldName), to = _join(folder, newName);
        const r = this._sameDomainRoute(from, to, 'rename');
        if (r.route === 'relay') return this._relay.relay('rename', { path: this._norm(from), to: this._norm(to) });
        return this._root.renameFile(folder, oldName, newName);
    }

    async renameFolder(oldPath, newPath) {
        const r = this._sameDomainRoute(oldPath, newPath, 'rename');
        if (r.route === 'relay') return this._relay.relay('rename', { path: this._norm(oldPath), to: this._norm(newPath) });
        return this._root.renameFolder(oldPath, newPath);
    }

    async moveFile(fromPath, toPath) {
        const r = this._sameDomainRoute(fromPath, toPath, 'move');
        if (r.route === 'relay') return this._relay.relay('move', { path: this._norm(fromPath), to: this._norm(toPath) });
        return this._root.moveFile(fromPath, toPath);
    }

    async moveFolder(fromPath, toPath) {
        const r = this._sameDomainRoute(fromPath, toPath, 'move');
        if (r.route === 'relay') return this._relay.relay('move', { path: this._norm(fromPath), to: this._norm(toPath) });
        return this._root.moveFolder(fromPath, toPath);
    }

    // a two-path op must stay within one domain (both root, or both the SAME rw mount)
    _sameDomainRoute(fromPath, toPath, verb) {
        const a = this._mountForPath(fromPath);
        const b = this._mountForPath(toPath);
        const aMount = a ? a.mountPath : null;
        const bMount = b ? b.mountPath : null;
        if (aMount !== bMount) {
            throw _codeError('ECROSSMOUNT', verb + ' across the sub-vault boundary is not supported yet');
        }
        // both root
        if (!a) { if (!this.writable) throw _codeError('EREADONLY', 'Read-only: no access key'); return { route: 'root' }; }
        // both same mount
        if (a.access !== 'rw') throw _codeError('EREADONLY', 'Sub-vault is read-only: ' + a.mountPath);
        if (!this._relay)      throw _codeError('EUNREACH', 'No relay wired for rw sub-vault: ' + a.mountPath);
        return { route: 'relay', mount: a };
    }
}

// path helpers
function _join(folder, name) {
    const f = String(folder == null ? '' : folder).replace(/^\//, '').replace(/\/$/, '');
    const n = String(name == null ? '' : name).replace(/^\//, '');
    return f ? f + '/' + n : n;
}
function _toBytes(x) {
    if (x == null) return x;
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (x.data) return _toBytes(x.data);   // relay may wrap as { data }
    return x;
}
function _codeError(code, message) {
    const e = new Error(message || code); e.code = code; return e;
}

if (typeof window !== 'undefined') window.VaultAccess = VaultAccess;
if (typeof module !== 'undefined' && module.exports) module.exports = { VaultAccess };
