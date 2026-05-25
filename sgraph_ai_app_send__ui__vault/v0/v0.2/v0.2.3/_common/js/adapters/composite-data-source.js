/* =================================================================================
   SGraph Vault — CompositeDataSource (sub-vaults inline splice)
   v0.1.0 — Phase 0

   Wraps the root VaultDataSource and presents the SAME 3-method contract
   (getTree / getFileList / getFileBytes) to send-browse, splicing referenced
   sub-vaults in as inline, expandable folders.

   A `*.link.json` file of type "vault" becomes a MOUNT at
     mountPath = <link path without ".link.json">
   The mount renders (via send-browse's generic lazy-on-expand hook) as a
   `_subvault` + `_lazy` folder node. On first expand, send-browse calls
   loadFolder(mountPath); the composite opens the child vault READ-ONLY and
   splices its tree in (paths prefixed with mountPath). Reads under a mounted
   path route to the child; everything else routes to the root.

   Writes, writable, and access-key always delegate to the ROOT (sub-vaults are
   read-only in v1). Key resolution: VaultLinks.getStoredChildKey(localStorage)
   then an injected keyProvider(mount) (the UI prompt / link card).

   Depends on (browser globals): SGVault, VaultDataSource, VaultLinks.
   Pure-logic methods (getTree/getFileList/getFileBytes/scan splice) are unit-
   testable in node with stub data sources + an injected vaultOpener.
   ================================================================================= */

class CompositeDataSource {

    constructor(rootDataSource, opts) {
        opts = opts || {};
        this._root        = rootDataSource;
        this._keyProvider = opts.keyProvider || null;          // async (mount) -> key|null
        this._vaultOpener = opts.vaultOpener || _defaultVaultOpener(rootDataSource);
        this._mounts      = new Map();                          // mountPath -> mount
        this.onTreeChanged = null;

        // Re-scan + bubble when the root vault tree changes (e.g. a link file added)
        this._root.onTreeChanged = () => {
            this.scan().then(() => { if (this.onTreeChanged) this.onTreeChanged(); });
        };
    }

    // ── Write gate + identity delegate to the root vault ────────────────────
    get writable()    { return this._root.writable; }
    set writable(v)   { this._root.writable = v; }
    get _accessKey()  { return this._root._accessKey; }
    set _accessKey(v) { this._root._accessKey = v; }

    // ── Scan the root for *.link.json (type vault) → register mounts ─────────
    async scan() {
        const next = new Map();
        const list = this._root.getFileList();
        for (const e of list) {
            if (e.dir || !VaultLinks.isLinkFile(e.path)) continue;
            let link = null;
            try { link = VaultLinks.parseLinkFile(await this._root.getFileBytes(e.path)); }
            catch (_) { link = null; }
            if (!link || !VaultLinks.isVaultLink(link)) continue;   // Phase 0: vault links only
            const mountPath = VaultLinks.mountPathFor(e.path);
            const prev = this._mounts.get(mountPath);
            next.set(mountPath, prev && prev.linkPath === e.path ? prev : {
                linkPath: e.path,
                mountPath: mountPath,
                nodeName: mountPath.split('/').pop(),
                link: link,
                status: 'collapsed',   // collapsed | mounted | locked | error
                access: 'ro',
                child: null, vault: null, error: null
            });
        }
        this._mounts = next;
        return this;
    }

    _mountByLinkPath(path) {
        const norm = String(path).replace(/^\//, '');
        for (const m of this._mounts.values()) if (m.linkPath === norm) return m;
        return null;
    }
    _mountForPath(path) {
        const norm = String(path).replace(/^\//, '');
        for (const m of this._mounts.values()) {
            if (norm === m.mountPath || norm.startsWith(m.mountPath + '/')) return m;
        }
        return null;
    }

    // ── Required: hierarchical tree (sync; uses the scanned mount cache) ─────
    getTree() { return this._spliceNode(this._root.getTree()); }

    _spliceNode(node) {
        const out = { name: node.name, children: {}, files: [] };
        for (const f of (node.files || [])) {
            const m = this._mountByLinkPath(f.path);
            if (m) out.children[m.nodeName] = this._mountTreeNode(m);
            else   out.files.push(f);
        }
        for (const [name, child] of Object.entries(node.children || {})) {
            out.children[name] = this._spliceNode(child);
        }
        return out;
    }

    _mountTreeNode(m) {
        if (m.status === 'mounted' && m.child) {
            const pfx = this._prefixTree(m.child.getTree(), m.mountPath);
            return { name: m.nodeName, _subvault: true, _access: m.access,
                     children: pfx.children, files: pfx.files };
        }
        // collapsed / locked / error → lazy, empty node (send-browse loads on expand)
        return { name: m.nodeName, _subvault: true, _lazy: true,
                 _folderPath: '/' + m.mountPath, _access: m.access,
                 children: {}, files: [] };
    }

    // deep-copy a child tree, prefixing every file path with the mount path
    _prefixTree(node, prefix) {
        const children = {};
        for (const [k, v] of Object.entries(node.children || {})) children[k] = this._prefixTree(v, prefix);
        const files = (node.files || []).map(f => Object.assign({}, f, { path: prefix + '/' + f.path }));
        return { name: node.name, children: children, files: files };
    }

    // ── Required: flat file list ────────────────────────────────────────────
    getFileList() {
        const out = [];
        for (const e of this._root.getFileList()) {
            if (this._mountByLinkPath(e.path)) continue;   // hide the raw link file
            out.push(e);
        }
        for (const m of this._mounts.values()) {
            out.push({ path: m.mountPath + '/', name: m.mountPath + '/', dir: true, size: 0 });
            if (m.status === 'mounted' && m.child) {
                for (const ce of m.child.getFileList()) {
                    out.push({ path: m.mountPath + '/' + ce.path, name: m.mountPath + '/' + ce.path,
                               dir: ce.dir, size: ce.size });
                }
            }
        }
        return out;
    }

    // ── Required: file bytes (route mounted paths to the child) ──────────────
    async getFileBytes(path) {
        const norm = String(path).replace(/^\//, '');
        const m = this._mountForPath(norm);
        if (m && m.status === 'mounted' && m.child) {
            const rel = norm === m.mountPath ? '' : norm.slice(m.mountPath.length + 1);
            return m.child.getFileBytes(rel);
        }
        return this._root.getFileBytes(path);
    }

    // ── Lazy expand: open the child vault (read-only) on first access ────────
    async loadFolder(folderPath) {
        const norm = String(folderPath).replace(/^\//, '');
        const m = this._mounts.get(norm) || this._mountForPath(norm);
        if (!m) return this._root.loadFolder(folderPath);   // ordinary lazy sub-tree
        if (m.status === 'mounted') return;
        await this._openMount(m);
    }

    async _openMount(m) {
        let key = null;
        try { key = VaultLinks.getStoredChildKey(m.link.vault_id); } catch (_) {}
        if (!key && this._keyProvider) key = await this._keyProvider(m);
        if (!key) { m.status = 'locked'; throw new Error('Sub-vault is locked (no key provided)'); }
        try {
            const childVault = await this._vaultOpener(key);          // Phase 0: full key / simple token
            const child      = new VaultDataSource(childVault, null); // accessKey=null ⇒ read-only
            await child.loadAllSubTrees();
            m.child = child; m.vault = childVault; m.status = 'mounted'; m.access = 'ro'; m.error = null;
        } catch (err) {
            m.status = 'error'; m.error = (err && err.message) || 'open failed';
            throw err;
        }
    }

    // ── Pass-throughs to the root ────────────────────────────────────────────
    async loadAllSubTrees()   { return this._root.loadAllSubTrees(); }
    getOrigName()             { return this._root.getOrigName(); }
    getOrigSize()             { return this._root.getOrigSize(); }
    async saveFile()          { return this._root.saveFile.apply(this._root, arguments); }
    async renameFile()        { return this._root.renameFile.apply(this._root, arguments); }
    async deleteFile()        { return this._root.deleteFile.apply(this._root, arguments); }
    async createFolder()      { return this._root.createFolder.apply(this._root, arguments); }
    async deleteFolder()      { return this._root.deleteFolder.apply(this._root, arguments); }
    async renameFolder()      { return this._root.renameFolder.apply(this._root, arguments); }
    async moveFile()          { return this._root.moveFile.apply(this._root, arguments); }
    async moveFolder()        { return this._root.moveFolder.apply(this._root, arguments); }
}

// Default opener: open another vault read-only using the root vault's transport.
function _defaultVaultOpener(rootDataSource) {
    return async function (key) {
        const sgSend = rootDataSource && rootDataSource._vault && rootDataSource._vault._sgSend;
        if (!sgSend) throw new Error('No transport available to open sub-vault');
        return SGVault.open(sgSend, key);   // wrapped read-only by VaultDataSource(accessKey=null)
    };
}

if (typeof window !== 'undefined') window.CompositeDataSource = CompositeDataSource;
if (typeof module !== 'undefined' && module.exports) module.exports = { CompositeDataSource };
