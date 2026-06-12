/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Browse Component v0.3.2 (delta v0.3.3)
   Changes vs v0.3.2:
     BRW-018: HTML present button (fullscreen iframe, bridge intact)
     BRW-019: same-vault HTML navigation via anchor click

   IFD Scenario 2: replaces v0.3.0 send-browse.js + all v0.3.1 BRW overlays.
   Self-contained — all 16 BRW fixes merged + dataSource adapter interface.

   Data source interface (3 required methods):
     dataSource.getTree()          → hierarchical tree node
     dataSource.getFileBytes(path) → Promise<ArrayBuffer>
     dataSource.getFileList()      → flat file list [{path, name, dir, size}]

   Backward compatible: if zipTree is set but no dataSource, auto-creates
   a ZipDataSource from the legacy properties.

   Merged fixes: BRW-001 through BRW-017
   ═══════════════════════════════════════════════════════════════════════════════ */

// ── Version stamp — bump this to confirm the local dev server has the latest code ──
console.log('%c[send-browse v0.3.3-vfs-5] loaded OK', 'color:#0a0;font-weight:bold;background:#e8ffe8;padding:2px 6px;border-radius:3px');

class SendBrowse extends SendComponent {

    /** Light DOM — CSS goes to document.head. No HTML template — dynamic render. */
    static useShadow   = false;
    static useTemplate = false;

    constructor() {
        super();

        // v0.3.2: data source adapter (preferred)
        this.dataSource   = null;

        // Legacy properties (backward compat — auto-creates ZipDataSource if dataSource is null)
        this.zipTree      = null;
        this.zipInstance   = null;
        this.zipOrigBytes = null;
        this.zipOrigName  = null;

        this.fileName     = null;
        this.transferId   = null;
        this.downloadUrl  = null;

        this._sgLayout    = null;
        this._tabCounter  = 0;
        this._objectUrls  = [];
        this._openTabs    = new Map();   // path → actual tab ID from sg-layout
    }

    async connectedCallback() {
        await this.loadResources();
        this._resourcesLoaded = true;
        if (this.dataSource || this.zipTree) this._build();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._objectUrls.forEach(u => URL.revokeObjectURL(u));
        this._objectUrls = [];
        if (this._vfsBridges) {
            this._vfsBridges.forEach(b => window.removeEventListener('message', b));
            this._vfsBridges = [];
        }
        if (this._syncHandlers) {
            this._syncHandlers.forEach(h => window.removeEventListener('sg-vault-synced', h));
            this._syncHandlers = [];
        }
        if (this._boundKeyHandler) {
            document.removeEventListener('keydown', this._boundKeyHandler);
            this._boundKeyHandler = null;
        }
    }

    _buildSwitchUrl(targetMode) {
        const path = window.location.pathname.replace(/\/(gallery|browse|download|view)(\/|$)/, `/${targetMode}$2`);
        return path + window.location.search + window.location.hash;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Build
    // ═══════════════════════════════════════════════════════════════════════════

    _build() {
        // v0.3.2: auto-create ZipDataSource from legacy properties if no dataSource set
        if (!this.dataSource && this.zipTree && typeof ZipDataSource !== 'undefined') {
            this.dataSource = new ZipDataSource(this.zipInstance, this.zipTree, this.zipOrigBytes, this.zipOrigName);
        }
        if (!this.dataSource) return;

        this.innerHTML = `
            <div class="sb-container">
                <div class="sb-header">
                    <div class="sb-header__left">
                        <span class="sb-header__icon">${SendIcons.FOLDER}</span>
                        <span class="sb-header__name">${SendHelpers.escapeHtml(this.fileName || 'Archive')}</span>
                        <span class="sb-header__meta">${SendHelpers.formatBytes(this.dataSource.getOrigSize ? this.dataSource.getOrigSize() : (this.zipOrigBytes ? this.zipOrigBytes.byteLength : 0))}</span>
                        <span class="sb-header__status">&#10003; Decrypted</span>
                    </div>
                    <div class="sb-header__right">
                        <button class="sb-action-btn" id="sb-copy-link">${SendIcons.LINK_SM} Copy Link</button>
                        <button class="sb-action-btn" id="sb-email">${SendIcons.MAIL || '✉'}</button>
                        <a href="${this._buildSwitchUrl('gallery')}" class="sb-action-btn">Gallery view</a>
                    </div>
                </div>
                <sg-layout id="sb-layout"></sg-layout>
            </div>
        `;

        this._sgLayout = this.querySelector('#sb-layout');
        this._setupHeaderListeners();
        this._initLayout();
    }

    // ─── sg-layout Initialisation ───────────────────────────────────────────

    _initLayout() {
        const layoutEl = this._sgLayout;
        if (!layoutEl) return;

        customElements.whenDefined('sg-layout').then(() => {
            layoutEl.setLayout({
                type: 'row', id: 'root', sizes: [0.22, 0.78],
                children: [
                    {
                        type: 'stack', id: 's-tree', activeTab: 0,
                        tabs: [
                            { type: 'tab', id: 't-tree', title: 'Files', tag: 'div', state: {}, locked: true }
                        ]
                    },
                    {
                        type: 'stack', id: 's-preview', activeTab: 0,
                        tabs: [
                            { type: 'tab', id: 't-share', title: 'Share', tag: 'div', state: {}, locked: true },
                            { type: 'tab', id: 't-info',  title: 'Info',  tag: 'div', state: {}, locked: true }
                        ]
                    }
                ]
            });

            requestAnimationFrame(() => {
                this._populateTree();
                this._populateShareTab();
                this._populateInfoTab();
                this._autoOpenFirstFile();
            });
        });
    }

    // ─── Folder Tree ────────────────────────────────────────────────────────

    _populateTree() {
        if (!this._sgLayout) return;
        const treeEl = this._sgLayout.getPanelElement('t-tree');
        if (!treeEl) return;

        // Preserve which folders are open across the rebuild. A lazy sub-vault expand
        // re-renders the whole tree from scratch (all folders default collapsed); without
        // this, expanding a child collapses its ancestors and the child appears to vanish.
        const cssEsc   = p => (window.CSS && CSS.escape) ? CSS.escape(p) : p;
        const expanded = [];
        treeEl.querySelectorAll('.sb-tree__folder').forEach(f => {
            const c = f.querySelector('.sb-tree__folder-content');
            if (f.dataset.path && c && c.style.display !== 'none') expanded.push(f.dataset.path);
        });

        treeEl.style.cssText = 'overflow-y: auto; height: 100%; padding: 0.5rem;';
        treeEl.innerHTML = '';

        // Build folder structure
        const tree = this._buildFolderTree();
        const treeHtml = this._renderFolderNode(tree, '');
        treeEl.innerHTML = `
            <div class="sb-tree__controls">
                <button class="sb-tree__ctrl-btn" id="sb-expand-all" title="Expand all">+</button>
                <button class="sb-tree__ctrl-btn" id="sb-collapse-all" title="Collapse all">−</button>
            </div>
            ${treeHtml}
        `;

        this._setupTreeListeners(treeEl);

        // Restore the open folders captured above.
        expanded.forEach(p => {
            const f = treeEl.querySelector('.sb-tree__folder[data-path="' + cssEsc(p) + '"]');
            if (!f) return;
            const c = f.querySelector('.sb-tree__folder-content');
            const t = f.querySelector('.sb-tree__toggle');
            if (c) c.style.display = 'block';
            if (t) t.textContent = '▾';
        });
    }

    _buildFolderTree() {
        // v0.3.2: delegate to dataSource (which handles gallery filtering)
        return this.dataSource.getTree();
    }

    _renderFolderNode(node, prefix) {
        let html = '';

        // Folders
        const folders = Object.keys(node.children).sort();
        for (const name of folders) {
            const child = node.children[name];
            const childPath = prefix ? `${prefix}/${name}` : name;
            // v0.2.x sub-vaults: a "lazy" node (e.g. a sub-vault mount) defers loading its
            // children until the user first expands it (dataSource.loadFolder + re-render).
            // Backward-compatible: ordinary data sources never set _lazy/_subvault.
            const isLazy     = !!(child && child._lazy === true && child._folderPath);
            const isSubvault = !!(child && child._subvault === true);
            const lazyAttrs  = isLazy ? ` data-lazy="1" data-loaded="0" data-folder-path="${SendHelpers.escapeHtml(child._folderPath)}"` : '';
            const linkAttr   = (child && child._linkPath) ? ` data-link-path="${SendHelpers.escapeHtml(child._linkPath)}"` : '';
            const folderCls  = isSubvault ? 'sb-tree__folder sb-tree__folder--subvault' : 'sb-tree__folder';
            const folderIcon = isSubvault ? '🗄' : SendIcons.FOLDER_SM;
            // Sub-vault status chip (ViV pack §3.3). Status-aware when VaultSubvaultsView is
            // loaded (in /vault); falls back to the plain `·ro` access chip otherwise.
            let chip = '';
            if (isSubvault) {
                if (window.VaultSubvaultsView && typeof VaultSubvaultsView.chip === 'function') {
                    const c = VaultSubvaultsView.chip(child._status, child._access);
                    const txt = [c.symbol, c.access, c.state ? '· ' + c.state : ''].filter(Boolean).join(' ');
                    const col = { ok: '#4ade80', pending: '#8892a4', err: '#ff6b6b' }[c.cls] || '#8892a4';
                    chip = `<span class="sb-tree__subvault-chip sb-tree__subvault-chip--${SendHelpers.escapeHtml(c.cls)}" title="${SendHelpers.escapeHtml(c.title)}" style="color:${col};font-size:0.78em;margin-left:0.3em;white-space:nowrap;">${SendHelpers.escapeHtml(txt)}</span>`;
                } else {
                    chip = `<span class="sb-tree__subvault-chip">·${SendHelpers.escapeHtml(child._access || 'ro')}</span>`;
                }
            }
            const editBtn    = (child && child._linkPath) ? `<span class="sb-link-edit" data-link-path="${SendHelpers.escapeHtml(child._linkPath)}" title="Edit link file">&#9998;</span>` : '';
            const countHtml  = isLazy ? '' : `<span class="sb-tree__count">${this._countFiles(child)}</span>`;
            const innerHtml  = isLazy ? '' : this._renderFolderNode(child, childPath);
            html += `
                <div class="${folderCls}" data-path="${SendHelpers.escapeHtml(childPath)}"${lazyAttrs}${linkAttr}>
                    <div class="sb-tree__folder-header">
                        <span class="sb-tree__toggle">▸</span>
                        <span class="sb-tree__folder-icon">${folderIcon}</span>
                        <span class="sb-tree__folder-name">${SendHelpers.escapeHtml(name)}</span>
                        ${chip}
                        ${editBtn}
                        ${countHtml}
                    </div>
                    <div class="sb-tree__folder-content" style="display: none;">
                        ${innerHtml}
                    </div>
                </div>
            `;
        }

        // BRW-001: Files — show basename only, sorted alphanumerically
        const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        for (const file of sortedFiles) {
            // v0.2.x external resource (sub-vaults): a controlled embed, not a vault file
            if (file._resource) {
                const rIcon = file._resourceType === 'image' ? '🖼' : file._resourceType === 'video' ? '▶' : file._resourceType === 'app' ? '🧩' : '🌐';
                html += `
                    <div class="sb-tree__file sb-tree__resource" data-resource="1"
                         data-path="${SendHelpers.escapeHtml(file.path)}"
                         data-link-path="${SendHelpers.escapeHtml(file.path)}"
                         data-res-url="${SendHelpers.escapeHtml(file._url || '')}"
                         data-res-type="${SendHelpers.escapeHtml(file._resourceType || 'link')}"
                         data-res-provider="${SendHelpers.escapeHtml(file._provider || '')}"
                         data-res-label="${SendHelpers.escapeHtml(file._label || file.name)}">
                        <span class="sb-tree__file-icon">${rIcon}</span>
                        <span class="sb-tree__file-name">${SendHelpers.escapeHtml(file._label || file.name)}</span>
                        <span class="sb-link-edit" data-link-path="${SendHelpers.escapeHtml(file.path)}" title="Edit link file">&#9998;</span>
                        <span class="sb-tree__file-name" style="opacity:.5">↗</span>
                    </div>
                `;
                continue;
            }
            var basename = file.name.includes('/') ? file.name.split('/').pop() : file.name;
            const type = typeof FileTypeDetect !== 'undefined' ? FileTypeDetect.detect(basename, null) : null;
            const icon = SendBrowse.FILE_ICONS[type] || SendBrowse.FILE_ICONS.other;
            html += `
                <div class="sb-tree__file" data-path="${SendHelpers.escapeHtml(file.path)}">
                    <span class="sb-tree__file-icon">${icon}</span>
                    <span class="sb-tree__file-name">${SendHelpers.escapeHtml(basename)}</span>
                </div>
            `;
        }

        return html;
    }

    _countFiles(node) {
        let count = node.files.length;
        for (const child of Object.values(node.children)) {
            count += this._countFiles(child);
        }
        return count;
    }

    _setupTreeListeners(treeEl) {
        // Folder expand/collapse
        treeEl.querySelectorAll('.sb-tree__folder-header').forEach(header => {
            header.addEventListener('click', async () => {
                const folder = header.closest('.sb-tree__folder');
                const content = folder.querySelector('.sb-tree__folder-content');
                const toggle = header.querySelector('.sb-tree__toggle');
                const opening = content.style.display === 'none';
                // v0.2.x sub-vaults: load a lazy node's children on first expand, then re-render.
                // Backward-compatible: only triggers when the node is data-lazy AND the data
                // source exposes loadFolder() (ordinary trees fall through to plain toggle).
                if (opening && folder.dataset.lazy === '1' && folder.dataset.loaded !== '1'
                    && this.dataSource && typeof this.dataSource.loadFolder === 'function') {
                    const fp = folder.dataset.folderPath;
                    const dp = folder.dataset.path;   // to re-expand after the re-render
                    toggle.textContent = '⋯';
                    try {
                        await this.dataSource.loadFolder(fp);
                        folder.dataset.loaded = '1';
                        this._populateTree();   // re-render from the now-updated data source + re-bind
                        // Auto-expand the just-loaded node so it opens on the FIRST click
                        try {
                            const nf = treeEl.querySelector('.sb-tree__folder[data-path="' + (window.CSS && CSS.escape ? CSS.escape(dp) : dp) + '"]');
                            if (nf) {
                                const nc = nf.querySelector('.sb-tree__folder-content');
                                const nt = nf.querySelector('.sb-tree__toggle');
                                if (nc) nc.style.display = 'block';
                                if (nt) nt.textContent = '▾';
                            }
                        } catch (_) {}
                    } catch (err) {
                        toggle.textContent = '⚠';
                        console.warn('[send-browse] lazy expand failed for', fp, err && err.message);
                        // Re-render so the node reflects its new mount status (locked / error)
                        // in the §3.3 status chip, instead of staying on a stale "not opened".
                        try { this._populateTree(); } catch (_) {}
                    }
                    return;
                }
                if (opening) {
                    content.style.display = 'block';
                    toggle.textContent = '▾';
                } else {
                    content.style.display = 'none';
                    toggle.textContent = '▸';
                }
            });
        });

        // File click → open in tab (or open a controlled embed for external resources)
        treeEl.querySelectorAll('.sb-tree__file').forEach(fileEl => {
            fileEl.addEventListener('click', () => {
                if (fileEl.dataset.resource === '1') {
                    this._openResourceTab({
                        url:      fileEl.dataset.resUrl,
                        type:     fileEl.dataset.resType || 'link',
                        provider: fileEl.dataset.resProvider || null,
                        label:    fileEl.dataset.resLabel || ''
                    });
                } else {
                    const path = fileEl.dataset.path;
                    if (path) this._openFileTab(path);
                }
                // Highlight active file
                treeEl.querySelectorAll('.sb-tree__file').forEach(f => f.classList.remove('sb-tree__file--active'));
                fileEl.classList.add('sb-tree__file--active');
            });
        });

        // v0.2.x: edit the raw *.link.json behind a sub-vault / resource node (✎)
        treeEl.querySelectorAll('.sb-link-edit').forEach(ed => {
            ed.style.cursor = 'pointer';
            ed.addEventListener('click', e => {
                e.stopPropagation();
                const lp = ed.dataset.linkPath;
                if (lp) this._openFileTab(lp);   // composite serves the raw link bytes from the root vault
            });
        });

        // Expand/collapse all
        const expandAll = treeEl.querySelector('#sb-expand-all');
        if (expandAll) expandAll.addEventListener('click', () => {
            treeEl.querySelectorAll('.sb-tree__folder-content').forEach(c => c.style.display = 'block');
            treeEl.querySelectorAll('.sb-tree__toggle').forEach(t => t.textContent = '▾');
        });

        const collapseAll = treeEl.querySelector('#sb-collapse-all');
        if (collapseAll) collapseAll.addEventListener('click', () => {
            treeEl.querySelectorAll('.sb-tree__folder-content').forEach(c => c.style.display = 'none');
            treeEl.querySelectorAll('.sb-tree__toggle').forEach(t => t.textContent = '▸');
        });
    }

    // ─── Share Tab (v0.2.2 parity) ─────────────────────────────────────────

    _populateShareTab() {
        if (!this._sgLayout) return;
        const el = this._sgLayout.getPanelElement('t-share');
        if (!el) return;

        el.style.cssText = 'overflow-y: auto; height: 100%; padding: 1.5rem;';

        var files = this.dataSource.getFileList().filter(function(e) { return !e.dir; });
        var url = this.downloadUrl || window.location.href;

        el.innerHTML = `
            <div class="sb-share">
                <h3 class="sb-share__title">Share this transfer</h3>
                <div class="sb-share__url-row">
                    <input type="text" class="sb-share__url" value="${SendHelpers.escapeHtml(url)}" readonly data-qa-mask="transfer-url" id="sb-share-url">
                    <button class="sb-action-btn" id="sb-share-copy">${SendIcons.LINK_SM} Copy</button>
                </div>
                <div class="sb-share__actions">
                    <button class="sb-action-btn" id="sb-share-email">${SendIcons.MAIL || '✉'} Email link</button>
                </div>
                <div class="sb-share__details">
                    <div class="sb-share__row"><span class="sb-share__label">Transfer ID</span><span class="sb-share__value">${SendHelpers.escapeHtml(this.transferId || '—')}</span></div>
                    <div class="sb-share__row"><span class="sb-share__label">Archive</span><span class="sb-share__value">${SendHelpers.escapeHtml(this.fileName || 'Unknown')}</span></div>
                    <div class="sb-share__row"><span class="sb-share__label">Size</span><span class="sb-share__value">${SendHelpers.formatBytes(this.dataSource.getOrigSize ? this.dataSource.getOrigSize() : 0)}</span></div>
                    <div class="sb-share__row"><span class="sb-share__label">Files</span><span class="sb-share__value">${files.length}</span></div>
                </div>
            </div>
        `;

        const copyBtn = el.querySelector('#sb-share-copy');
        if (copyBtn) copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(url);
                copyBtn.textContent = 'Copied!';
                setTimeout(() => { copyBtn.innerHTML = `${SendIcons.LINK_SM} Copy`; }, 2000);
            } catch (_) {}
        });

        const emailBtn = el.querySelector('#sb-share-email');
        if (emailBtn) emailBtn.addEventListener('click', () => {
            window.location.href = `mailto:?subject=Shared files via SG/Send&body=${encodeURIComponent(url)}`;
        });
    }

    // ─── Info Tab (v0.2.12 parity) ───────────────────────────────────────────

    _populateInfoTab() {
        if (!this._sgLayout) return;
        const el = this._sgLayout.getPanelElement('t-info');
        if (!el) return;

        el.style.cssText = 'overflow-y: auto; height: 100%; padding: 1.5rem;';

        var files = this.dataSource.getFileList().filter(function(e) { return !e.dir; });
        var folders = this.dataSource.getFileList().filter(function(e) { return e.dir; });

        // Count by type
        const typeCounts = {};
        let totalSize = 0;
        for (const f of files) {
            const type = typeof FileTypeDetect !== 'undefined' ? FileTypeDetect.detect(f.name, null) : 'other';
            typeCounts[type] = (typeCounts[type] || 0) + 1;
        }

        const typeRows = Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => `<div class="sb-share__row"><span class="sb-share__label">${SendHelpers.escapeHtml(type)}</span><span class="sb-share__value">${count}</span></div>`)
            .join('');

        el.innerHTML = `
            <div class="sb-share">
                <h3 class="sb-share__title">Archive info</h3>
                <div class="sb-share__details">
                    <div class="sb-share__row"><span class="sb-share__label">Total files</span><span class="sb-share__value">${files.length}</span></div>
                    <div class="sb-share__row"><span class="sb-share__label">Folders</span><span class="sb-share__value">${folders.length}</span></div>
                    <div class="sb-share__row"><span class="sb-share__label">Archive size</span><span class="sb-share__value">${SendHelpers.formatBytes(this.dataSource.getOrigSize ? this.dataSource.getOrigSize() : 0)}</span></div>
                </div>
                <h3 class="sb-share__title" style="margin-top: 1.5rem;">Files by type</h3>
                <div class="sb-share__details">
                    ${typeRows}
                </div>
                <h3 class="sb-share__title" style="margin-top: 1.5rem;">Encryption</h3>
                <div class="sb-share__details">
                    <div class="sb-share__row"><span class="sb-share__label">Algorithm</span><span class="sb-share__value">AES-256-GCM</span></div>
                    <div class="sb-share__row"><span class="sb-share__label">Decryption</span><span class="sb-share__value">Client-side only</span></div>
                    <div class="sb-share__row"><span class="sb-share__label">Server sees</span><span class="sb-share__value">Encrypted ciphertext only</span></div>
                </div>
            </div>
        `;
    }

    // ─── Auto-open first file ───────────────────────────────────────────────

    // BRW-003: sorted auto-open + v0.3.2 dataSource
    _autoOpenFirstFile() {
        var files = this.dataSource.getFileList().filter(function(e) { return !e.dir; });

        // Sort alphanumerically by path (natural number ordering)
        files.sort(function(a, b) {
            return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
        });

        // Prefer first root-level non-metadata file
        var root = files.find(function(f) {
            return !f.path.includes('/') && !f.name.startsWith('_') && !f.name.startsWith('.');
        });
        var first = root || files[0];
        if (first) this._openFileTab(first.path);
    }

    // ─── Open File in Tab ───────────────────────────────────────────────────

    // v0.3.2: uses dataSource.getFileBytes() + BRW-015 tab scroll
    async _openFileTab(path) {
        if (!this._sgLayout) return;

        // BRW-015: inject scrollable tab bar CSS (once)
        _injectTabBarScrollCSS(this._sgLayout);

        // If tab already open for this path, focus it via tab-bar click
        var existingId = this._openTabs.get(path);
        if (existingId) {
            var tabEl = this._sgLayout.shadowRoot ? this._sgLayout.shadowRoot.querySelector('.sgl-tab[data-tab-id="' + existingId + '"]') : null;
            if (tabEl) {
                tabEl.click();
                return;
            }
            this._openTabs.delete(path);
        }

        this._ensurePreviewStack();

        // Tab title: use basename
        var tabTitle = path.includes('/') ? path.split('/').pop() : path;

        var newId = this._sgLayout.addTabToStack('s-preview', {
            tag: 'div', title: tabTitle, state: { path: path }
        }, true);

        if (!newId) return;
        this._openTabs.set(path, newId);

        var self = this;
        requestAnimationFrame(async function() {
            var el = self._sgLayout.getPanelElement(newId);
            if (!el) return;
            el.style.cssText = 'display: flex; flex-direction: column; height: 100%; overflow: hidden;';
            el.innerHTML = '<div style="padding: 1rem; color: var(--color-text-secondary);">Loading...</div>';

            try {
                // v0.3.2: use dataSource instead of entry.async()
                var bytes = await self.dataSource.getFileBytes(path);
                var type = typeof FileTypeDetect !== 'undefined' ? FileTypeDetect.detect(path, null) : null;
                self._renderFileContent(el, bytes, path, type);
            } catch (err) {
                el.innerHTML = '<div style="padding: 1rem; color: var(--color-error, #e74c3c);">Failed to load: ' + SendHelpers.escapeHtml(err.message) + '</div>';
            }

            // BRW-015: scroll new tab into view
            if (self._sgLayout && self._sgLayout.shadowRoot) {
                var newTabEl = self._sgLayout.shadowRoot.querySelector('.sgl-tab[data-tab-id="' + newId + '"]');
                if (newTabEl) newTabEl.scrollIntoView({ inline: 'end', block: 'nearest', behavior: 'smooth' });
            }
        });
    }

    // Open an external resource (sub-vaults) in a controlled embed tab.
    // Uses <sg-embed-frame> when available (default-deny iframe / media element, click-to-load).
    _openResourceTab(res) {
        if (!this._sgLayout || !res || !res.url) return;
        _injectTabBarScrollCSS(this._sgLayout);
        const title = res.label || res.url;
        this._ensurePreviewStack();
        const newId = this._sgLayout.addTabToStack('s-preview', { tag: 'div', title: title }, true);
        if (!newId) return;
        const self = this;
        requestAnimationFrame(function () {
            const el = self._sgLayout.getPanelElement(newId);
            if (!el) return;
            el.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;';
            if (window.customElements && customElements.get('sg-embed-frame')) {
                el.innerHTML = '';
                const frame = document.createElement('sg-embed-frame');
                el.appendChild(frame);
                frame.setResource(res);
            } else {
                // Fallback: a plain external link (no embed component loaded)
                el.innerHTML = '<div style="padding:1rem;font-size:0.85rem;">External resource: '
                    + '<a href="' + SendHelpers.escapeHtml(res.url) + '" target="_blank" rel="noopener noreferrer">'
                    + SendHelpers.escapeHtml(res.label || res.url) + ' ↗</a></div>';
            }
        });
    }

    _ensurePreviewStack() {
        if (!this._sgLayout) return;
        // Test if preview stack exists
        try {
            const testId = this._sgLayout.addTabToStack('s-preview', { tag: 'div', title: '__test__' }, false);
            if (testId) this._sgLayout.removePanel(testId);
        } catch (_) {
            // Stack was destroyed — rebuild layout
            this._initLayout();
        }
    }

    // ─── File Rendering ─────────────────────────────────────────────────────

    // v0.3.2: merged BRW-002 (PDF Present), BRW-004/005/006/014 (markdown links/images/source/folders),
    //         BRW-012 (CSV), BRW-013 (HTML iframe), BRW-016 (print per-tab), BRW-017 (reveal in tree)
    _renderFileContent(container, bytes, fileName, type) {
        container.innerHTML = '';
        this._currentFileName = fileName;
        var ext = (fileName || '').split('.').pop().toLowerCase();
        var self = this;

        // ── Action bar (common to all types) ────────────────────────────
        var bar = document.createElement('div');
        bar.className = 'sb-file__actions';
        bar.innerHTML =
            '<span class="sb-file__name">' + SendHelpers.escapeHtml(fileName) + '</span>' +
            '<span class="sb-file__size">' + SendHelpers.formatBytes(bytes.byteLength) + '</span>' +
            '<button class="sb-action-btn sb-file__save">' + SendIcons.DOWNLOAD_SM + ' Save</button>';
        container.appendChild(bar);

        bar.querySelector('.sb-file__save').addEventListener('click', function() {
            var blob = new Blob([bytes]);
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = fileName.includes('/') ? fileName.split('/').pop() : fileName;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        // BRW-017: Reveal in tree button
        var revealBtn = document.createElement('button');
        revealBtn.className = 'sb-action-btn';
        revealBtn.innerHTML = '&#8982; Locate';
        revealBtn.title = 'Reveal this file in the folder tree';
        revealBtn.addEventListener('click', function() { _revealInTree(self, fileName); });
        bar.appendChild(revealBtn);

        // ── Copy contents (text-based files only) ───────────────────────
        // For source / structured-text / markdown / plain-text we offer a one-click
        // copy of the decoded contents. Suppressed for binary (images, video, pdf,
        // archives) where copying bytes makes no sense. Heuristic: known textual
        // FileTypeDetect categories. Falls back to a tab+textarea+document.execCommand
        // copy when navigator.clipboard isn't available (e.g. insecure context).
        var _isTextual = (function () {
            if (type === 'code' || type === 'text' || type === 'markdown' || type === 'csv') return true;
            if (type === 'html') return true;
            return false;
        })();
        if (_isTextual) {
            var copyBtn = document.createElement('button');
            copyBtn.className = 'sb-action-btn sb-file__copy';
            copyBtn.innerHTML = '&#10697; Copy';
            copyBtn.title = 'Copy this file’s contents to the clipboard';
            copyBtn.addEventListener('click', function () {
                var text;
                try { text = new TextDecoder().decode(bytes); }
                catch (_) { copyBtn.innerHTML = '✕ Cannot decode'; return; }
                var orig = copyBtn.innerHTML;
                var flash = function (label) {
                    copyBtn.innerHTML = label;
                    setTimeout(function () { copyBtn.innerHTML = orig; }, 1600);
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(text)
                        .then(function () { flash('&#10003; Copied'); })
                        .catch(function () {
                            // Insecure context or permission denied — fall back to a hidden textarea.
                            try {
                                var ta = document.createElement('textarea');
                                ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
                                document.body.appendChild(ta); ta.select();
                                var ok = document.execCommand('copy');
                                document.body.removeChild(ta);
                                flash(ok ? '&#10003; Copied' : '✕ Copy blocked');
                            } catch (_) { flash('✕ Copy blocked'); }
                        });
                } else {
                    // Old browsers / no clipboard API.
                    try {
                        var ta2 = document.createElement('textarea');
                        ta2.value = text; ta2.style.position = 'fixed'; ta2.style.opacity = '0';
                        document.body.appendChild(ta2); ta2.select();
                        var ok2 = document.execCommand('copy');
                        document.body.removeChild(ta2);
                        flash(ok2 ? '&#10003; Copied' : '✕ Copy blocked');
                    } catch (_) { flash('✕ Copy blocked'); }
                }
            });
            bar.appendChild(copyBtn);
        }

        // Content area
        var content = document.createElement('div');
        content.className = 'sb-file__content';
        container.appendChild(content);

        // ── BRW-012: CSV viewer ─────────────────────────────────────────
        if (ext === 'csv') {
            var rawText = new TextDecoder().decode(bytes);
            var tableHtml = _csvToTable(rawText);
            var tableEl = document.createElement('div');
            tableEl.className = 'sb-file__csv';
            tableEl.innerHTML = tableHtml;
            content.appendChild(tableEl);

            var sourceEl = document.createElement('pre');
            sourceEl.className = 'sb-file__code';
            sourceEl.textContent = rawText;
            sourceEl.style.display = 'none';
            content.appendChild(sourceEl);

            var isSource = false;
            var sourceBtn = document.createElement('button');
            sourceBtn.className = 'sb-action-btn sb-file__view-source';
            sourceBtn.innerHTML = '&lt;/&gt; Source';
            sourceBtn.addEventListener('click', function() {
                isSource = !isSource;
                tableEl.style.display  = isSource ? 'none' : '';
                sourceEl.style.display = isSource ? ''     : 'none';
                sourceBtn.innerHTML    = isSource ? '&#9998; Table' : '&lt;/&gt; Source';
            });
            bar.appendChild(sourceBtn);
            return;
        }

        // ── BRW-013 + BRW-018 + BRW-019 + BRW-020: HTML viewer ─────────
        // BRW-013: sandboxed iframe + vault VFS bridge (fetch, img.src, MutationObserver)
        // BRW-018: Present button (fullscreen iframe, bridge stays intact)
        // BRW-019: same-vault anchor navigation via postMessage
        // BRW-020: inline vault CSS/JS before blob creation (browser resource loader
        //          can't resolve relative paths against blob: URLs)
        if (ext === 'html' || ext === 'htm') {
            var rawText = new TextDecoder().decode(bytes);
            content.style.display = 'flex';
            content.style.flexDirection = 'column';
            content.style.height = '100%';

            // VFS bridge: intercepts fetch(), img.src setter, MutationObserver, and
            // anchor clicks for same-vault navigation.
            // [sg-vfs] logs → iframe console   [sg-vfs parent] logs → top context
            //
            // Built as a function so sg.app.selfPath reflects the CURRENT document
            // (not the entry document) after in-iframe navigation.
            var _buildVfsBridgeScript = function(currentPath) { return '' +
                '<script id="__sg-vfs">' +
                '(function(){' +
                'console.log("[sg-vfs] installing...");' +

                // ── Shared VFS request helper ──────────────────────────────
                'function _vfsReq(url,cb){' +
                  'var id=(Math.random()*1e9|0).toString(36)+Date.now().toString(36);' +
                  'function h(e){if(!e.data||e.data.__sgVfsReply!==id)return;' +
                    'window.removeEventListener("message",h);' +
                    'console.log("[sg-vfs] ←",url,e.data.err?"ERR":"OK",e.data.buf&&e.data.buf.byteLength,"b");' +
                    'cb(e.data);}' +
                  'window.addEventListener("message",h);' +
                  'console.log("[sg-vfs] →",url);' +
                  'window.parent.postMessage({__sgVfsReq:id,url:url},"*");' +
                '}' +

                // ── fetch() override ───────────────────────────────────────
                'var _of=window.fetch;' +
                'window.fetch=function(u,o){' +
                  'var us=typeof u==="string"?u:(u&&u.url?u.url:String(u));' +
                  'if(!us||us.startsWith("http")||us.startsWith("blob:")||us.startsWith("data:")||us.startsWith("#"))' +
                    'return _of.apply(this,arguments);' +
                  'console.log("[sg-vfs] fetch intercepted:",us);' +
                  'return new Promise(function(res,rej){' +
                    '_vfsReq(us,function(d){' +
                      'if(d.err)return _of.apply(window,[u,o]).then(res).catch(rej);' +
                      'res(new Response(d.buf,{status:200,headers:{"Content-Type":d.mime||"application/octet-stream"}}));' +
                    '});' +
                  '});' +
                '};' +

                // ── HTMLImageElement.prototype.src setter override ─────────
                '(function(){' +
                  'var d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"src");' +
                  'if(!d||!d.set)return;' +
                  'var _oset=d.set,_oget=d.get;' +
                  'Object.defineProperty(HTMLImageElement.prototype,"src",{' +
                    'configurable:true,' +
                    'get:_oget,' +
                    'set:function(val){' +
                      'if(!val||' +
                         'val.startsWith("http")||val.startsWith("blob:")||' +
                         'val.startsWith("data:")||val.startsWith("//"))' +
                        '{_oset.call(this,val);return;}' +
                      'console.log("[sg-vfs] img.src intercepted:",val);' +
                      'this.__sgVfs=true;' +
                      'var el=this;' +
                      '_vfsReq(val,function(d){' +
                        'el.__sgVfs=false;' +
                        'if(d.err){console.warn("[sg-vfs] img not in vault:",val);_oset.call(el,val);return;}' +
                        'var b=new Blob([d.buf],{type:d.mime||"image/png"});' +
                        'var burl=URL.createObjectURL(b);' +
                        'console.log("[sg-vfs] img.src → blob:",val,"→",burl);' +
                        '_oset.call(el,burl);' +
                      '});' +
                    '}' +
                  '});' +
                  'console.log("[sg-vfs] HTMLImageElement.src setter overridden");' +
                '})();' +

                // ── MutationObserver backup ────────────────────────────────
                'function _loadImgAttr(img){' +
                  'if(img.__sgVfs)return;' +
                  'var src=img.getAttribute("src");' +
                  'if(!src||src.startsWith("http")||src.startsWith("blob:")||src.startsWith("data:"))return;' +
                  'img.src=src;' +
                '}' +
                'var _obs=new MutationObserver(function(muts){' +
                  'muts.forEach(function(m){' +
                    'm.addedNodes.forEach(function(n){' +
                      'if(n.nodeType!==1)return;' +
                      'if(n.tagName==="IMG")_loadImgAttr(n);' +
                      'n.querySelectorAll&&n.querySelectorAll("img").forEach(_loadImgAttr);' +
                    '});' +
                    'if(m.type==="attributes"&&m.target.tagName==="IMG")_loadImgAttr(m.target);' +
                  '});' +
                '});' +
                '_obs.observe(document.documentElement||document,{childList:true,subtree:true,attributes:true,attributeFilter:["src"]});' +
                '(document.querySelectorAll("img")||[]).forEach(_loadImgAttr);' +
                'console.log("[sg-vfs] installed OK");' +

                // ── BRW-019: anchor click interceptor (same-vault navigation) ──────
                'document.addEventListener("click",function(e){' +
                  'var a=e.target.closest("a");' +
                  'if(!a)return;' +
                  'var href=a.getAttribute("href");' +
                  'if(!href||href.startsWith("http")||href.startsWith("//")||' +
                     'href.startsWith("mailto:")||href.startsWith("#")||href.startsWith("javascript:"))return;' +
                  'e.preventDefault();' +
                  'console.log("[sg-vfs] nav request:",href);' +
                  'window.parent.postMessage({__sgVfsNavReq:href},"*");' +
                '},true);' +

                // ── Change 5: window.sg.vfs.* + window.sgVault.* ──────────────
                // Canonical surface matches future SG/App spec (sg.vfs.write/read/list).
                // window.sgVault.* kept as convenience alias for backward compat.
                // _vfsMsg: generic postMessage → Promise helper (write + list envelopes).
                '(function(){' +
                  'function _vfsMsg(type,payload){' +
                    'return new Promise(function(res,rej){' +
                      'var id=(Math.random()*1e9|0).toString(36)+Date.now().toString(36);' +
                      'payload[type]=id;' +
                      'var replyKey=type==="__sgVfsWriteReq"?"__sgVfsWriteReply":"__sgVfsListReply";' +
                      'function h(e){' +
                        'if(!e.data||e.data[replyKey]!==id)return;' +
                        'window.removeEventListener("message",h);' +
                        'if(e.data.ok)res(e.data);else rej(new Error(e.data.err||"VFS error"));' +
                      '}' +
                      'window.addEventListener("message",h);' +
                      'window.parent.postMessage(payload,"*");' +
                    '});' +
                  '}' +
                  // sg.vfs.write — canonical write (string | Uint8Array | ArrayBuffer)
                  'function _write(path,content){' +
                    'var bytes;' +
                    'if(typeof content==="string"){bytes=new TextEncoder().encode(content);}' +
                    'else{bytes=content instanceof Uint8Array?content:new Uint8Array(content);}' +
                    // chunked btoa avoids call-stack overflow on large files
                    'var b64="",chunk=8192;' +
                    'for(var i=0;i<bytes.length;i+=chunk){' +
                      'b64+=btoa(String.fromCharCode.apply(null,bytes.subarray(i,i+chunk)));' +
                    '}' +
                    'return _vfsMsg("__sgVfsWriteReq",{path:path,data:b64,encoding:"base64"})' +
                      '.then(function(d){return{path:path,size:d.size};});' +
                  '}' +
                  // sg.vfs.read — strict postMessage path (errors on missing path, no fuzzy match)
                  'function _read(path){' +
                    'return new Promise(function(res,rej){' +
                      'var id=(Math.random()*1e9|0).toString(36)+Date.now().toString(36);' +
                      'function h(e){' +
                        'if(!e.data||e.data.__sgVfsReadReply!==id)return;' +
                        'window.removeEventListener("message",h);' +
                        'if(e.data.ok)res(e.data.buf);' +
                        'else rej(new Error(e.data.err==="ENOENT"?"No such file: "+e.data.path:(e.data.err||"Read failed")));' +
                      '}' +
                      'window.addEventListener("message",h);' +
                      'window.parent.postMessage({__sgVfsReadReq:id,path:path},"*");' +
                    '});' +
                  '}' +
                  // sg.vfs.readText — returns string (convenience wrapper over _read)
                  'function _readText(path){return _read(path).then(function(buf){return new TextDecoder().decode(buf);});}' +
                  // sg.vfs.list — proper postMessage envelope, not a magic URL
                  'function _list(path){' +
                    'return _vfsMsg("__sgVfsListReq",{path:path||""})' +
                      '.then(function(d){return d.entries||[];})' +
                      '.catch(function(err){' +
                        'if(err.message==="ENOENT")throw new Error("No such path: "+(path||""));' +
                        'throw err;' +
                      '});' +
                  '}' +
                  // sg.loadCss / sg.loadJs — async asset loaders (the contract for vault HTML).
                  // Vault iframes run from a blob: URL, so the browser's native HTML parser
                  // can't resolve relative <link rel="stylesheet"> or <script src="..."> against
                  // the vault. Authors load CSS/JS at runtime instead — fetch() goes through
                  // the VFS bridge, then we inject a fresh <style>/<script> with the body
                  // textContent, which runs in the iframe origin without any network round-trip.
                  // See library/guides/vault-html/AUTHORING.md for the full convention.
                  'function _loadCss(path){' +
                    'return _readText(path).then(function(css){' +
                      'var s=document.createElement("style");' +
                      's.setAttribute("data-sg-loaded",path);' +
                      's.textContent=css;' +
                      'document.head.appendChild(s);' +
                      'return s;' +
                    '});' +
                  '}' +
                  'function _loadJs(path){' +
                    'return _readText(path).then(function(js){' +
                      'return new Promise(function(res,rej){' +
                        'var s=document.createElement("script");' +
                        's.setAttribute("data-sg-loaded",path);' +
                        // textContent runs synchronously on append — wrap in a microtask so
                        // any throw surfaces as a rejection rather than crashing the loader.
                        'try{s.textContent=js;document.head.appendChild(s);res(s);}' +
                        'catch(e){rej(e);}' +
                      '});' +
                    '});' +
                  '}' +
                  // ── Generic command helper (git / auth round-trips) ────────
                  'function _sgCmd(cmdType,payload){' +
                    'return new Promise(function(res,rej){' +
                      'var id=(Math.random()*1e9|0).toString(36)+Date.now().toString(36);' +
                      'payload.__sgCmdId=id;payload.__sgCmdType=cmdType;' +
                      'function h(e){' +
                        'if(!e.data||e.data.__sgCmdReply!==id)return;' +
                        'window.removeEventListener("message",h);' +
                        'if(e.data.ok)res(e.data.result);' +
                        'else rej(new Error(e.data.err||"Command failed"));' +
                      '}' +
                      'window.addEventListener("message",h);' +
                      'window.parent.postMessage(payload,"*");' +
                    '});' +
                  '}' +
                  // Expose canonical surface (matches SG/App spec)
                  'window.sg={' +
                    'vfs:{write:_write,read:_read,readText:_readText,list:_list},' +
                    'loadCss:_loadCss,' +
                    'loadJs:_loadJs,' +
                    'app:{' +
                      // context: 'preview' = SG/Vault editor inline preview path; pair with
                      // 'app' (set by /en-gb/app/ app-shell). Apps feature-detect on this
                      // value rather than on the presence of individual namespaces. See
                      // team/comms/briefs/06/08/v0.33.5__brief__vault-preview-app-parity.md
                      // for the full unification roadmap. NOTE: sg.vault.* is currently
                      // available only in 'app' context — the editor preview deliberately
                      // surfaces a reduced API until the shared builder is extracted.
                      'context:"preview",' +
                      'selfPath:'   + JSON.stringify(currentPath) + ',' +
                      'writable:'   + (self.dataSource && self.dataSource.writable ? 'true' : 'false') + ',' +
                      'vaultName:'  + JSON.stringify((self.dataSource && self.dataSource._vault && self.dataSource._vault.name) || '') + ',' +
                      'vaultId:'    + JSON.stringify((self.dataSource && self.dataSource._vault && self.dataSource._vault.vaultId) || '') + ',' +
                      'fileCount:'  + ((self.dataSource ? self.dataSource.getFileList().filter(function(f){return !f.dir;}).length : 0)) + ',' +
                      'totalSize:'  + ((self.dataSource ? self.dataSource.getOrigSize() : 0)) +
                    '},' +
                    // sg.git.* — deprecated, retained for back-compat. Emits a one-shot
                    // console.warn the first time any method is called. Authors should
                    // migrate to sg.sync.* (preferred namespace).
                    'git:(function(){' +
                      'var _warned=false;' +
                      'function _w(){if(!_warned){_warned=true;console.warn("[sg-vfs] sg.git.* is deprecated and will be removed in a future release. Please use sg.sync.* instead.");}}' +
                      'return{' +
                        'status:function(){_w();return _sgCmd("git",{action:"status"});},' +
                        'check:function(){_w();return _sgCmd("git",{action:"check"});},' +
                        'push:function(){_w();return _sgCmd("git",{action:"push"});},' +
                        'pull:function(){_w();return _sgCmd("git",{action:"pull"});},' +
                        'refresh:function(){_w();return _sgCmd("git",{action:"refresh"});}' +
                      '};' +
                    '})(),' +
                    // sg.sync — author-facing sync namespace (preferred over sg.git)
                    'sync:{' +
                      'status:function(){' +
                        'return _sgCmd("git",{action:"status"}).then(function(s){' +
                          'return{' +
                            'current:!s.ahead&&!s.behind&&!s.diverged,' +
                            'serverHasNewer:s.behind>0||!!s.diverged,' +
                            'localHasUnsynced:s.ahead>0,' +
                            'serverVersion:s.namedHeadId,' +
                            'writable:!!s.writable,' +
                            'lastSyncedAt:s.lastCheckedAt||null' +
                          '};' +
                        '});' +
                      '},' +
                      'check:function(){return _sgCmd("git",{action:"check"});},' +
                      'push:function(){return _sgCmd("git",{action:"push"});},' +
                      'pull:function(){return _sgCmd("git",{action:"pull"});},' +
                      // Non-destructive in-place refresh — does not destroy the iframe
                      'refresh:function(){return _sgCmd("git",{action:"syncRefresh"});}' +
                    '},' +
                    'auth:{' +
                      'hasKey:' + (self.dataSource && self.dataSource.writable ? 'true' : 'false') + ',' +
                      'setKey:function(key){return _sgCmd("auth",{action:"setKey",key:key});},' +
                      'check:function(key){return _sgCmd("auth",{action:"check",key:key});},' +
                      'clear:function(){return _sgCmd("auth",{action:"clear"});}' +
                    '},' +
                    'ui:{' +
                      'message:function(text,type,opts){' +
                        'opts=opts||{};' +
                        'var handle=(Math.random()*1e9|0).toString(36)+Date.now().toString(36);' +
                        'var ttl=opts.ttl===null?null:(typeof opts.ttl==="number"?opts.ttl:3000);' +
                        'window.parent.postMessage({__sgUiMsg:{handle:handle,text:String(text||""),msgType:type||"info",ttl:ttl}},"*");' +
                        'return handle;' +
                      '},' +
                      'dismiss:function(handle){' +
                        'window.parent.postMessage({__sgUiMsg:{handle:handle,dismiss:true}},"*");' +
                      '}' +
                    '}' +
                  '};' +
                  // Convenience alias (backward compat with design doc examples)
                  'window.sgVault={' +
                    'writeFile:_write,readFile:_readText,' +
                    'listFiles:function(){return _list("");},' +
                    'writable:window.sg.app.writable,selfPath:window.sg.app.selfPath' +
                  '};' +
                  'console.log("[sg-vfs] window.sg ready | writable="+window.sg.app.writable+' +
                    '" | vaultName="+window.sg.app.vaultName+" | loaders: sg.loadCss, sg.loadJs | sg.sync, sg.git (deprecated), sg.auth, sg.ui");' +
                '})();' +

                '})();' +
                '<\/script>'; };
            var vfsBridgeScript = _buildVfsBridgeScript(fileName);

            // Declare htmlDir and fileList here so both the async inline task
            // and the VFS bridge closure share the same mutable reference.
            var htmlDir   = fileName.includes('/') ? fileName.substring(0, fileName.lastIndexOf('/') + 1) : '';
            var fileList  = self.dataSource ? self.dataSource.getFileList() : [];
            var _uiHandles = {}; // handle → timeout id, for sg.ui.dismiss

            // Wrapper div is the fullscreen target (not the iframe directly).
            // This lets us add a branded banner INSIDE the fullscreen context —
            // parent-side elements can't overlay a fullscreen iframe, but they can
            // overlay a fullscreen wrapper div that contains both banner + iframe.
            var wrapper = document.createElement('div');
            wrapper.style.cssText = 'flex:1;display:flex;flex-direction:column;position:relative;overflow:hidden;min-height:0;';
            content.appendChild(wrapper);

            // Present-mode banner (hidden until fullscreen starts)
            var presentBanner = document.createElement('div');
            var bannerTitle = fileName.includes('/') ? fileName.split('/').pop() : fileName;
            presentBanner.className = 'sb-html-present-banner';
            presentBanner.style.cssText =
                'display:none;align-items:center;padding:0 1rem;height:36px;flex-shrink:0;' +
                'background:#0d1117;border-bottom:1px solid rgba(255,255,255,0.08);gap:0.5rem;';
            presentBanner.innerHTML =
                '<span style="color:#4ecdc4;font-weight:700;font-size:13px;font-family:sans-serif;">SG/Vault</span>' +
                '<span style="color:#6e7a8a;font-size:13px;">·</span>' +
                '<span style="color:#e0e6f0;font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:sans-serif;"></span>' +
                '<button style="color:#e0e6f0;background:none;border:1px solid rgba(255,255,255,0.2);' +
                    'border-radius:4px;padding:3px 12px;cursor:pointer;font-size:12px;font-family:sans-serif;">✕ Exit</button>';
            // Set title text safely (avoid XSS from fileName)
            presentBanner.querySelectorAll('span')[2].textContent = bannerTitle;
            presentBanner.querySelector('button').addEventListener('click', function() {
                if (document.exitFullscreen) document.exitFullscreen();
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            });
            wrapper.appendChild(presentBanner);

            // Show/hide banner when fullscreen state changes
            var _onFsChange = function() {
                var isFs = document.fullscreenElement === wrapper ||
                           document.webkitFullscreenElement === wrapper;
                presentBanner.style.display = isFs ? 'flex' : 'none';
            };
            document.addEventListener('fullscreenchange',       _onFsChange);
            document.addEventListener('webkitfullscreenchange', _onFsChange);
            if (!self._fsListeners) self._fsListeners = [];
            self._fsListeners.push(function() {
                document.removeEventListener('fullscreenchange',       _onFsChange);
                document.removeEventListener('webkitfullscreenchange', _onFsChange);
            });

            // Create iframe; src set asynchronously after CSS/JS inlining.
            var iframeEl = document.createElement('iframe');
            iframeEl.className = 'sb-file__html-frame';
            iframeEl.sandbox   = 'allow-scripts';   // 'allow-fullscreen' is NOT a valid sandbox keyword
            iframeEl.setAttribute('allowfullscreen', '');  // enables iframe-initiated fullscreen if needed
            // background+color-scheme: iframe document body is transparent when the inlined
            // HTML has no background-color, which lets the parent (dark vault chrome) bleed
            // through. Force a white base so unstyled / light-mode pages render correctly
            // regardless of parent theme.
            iframeEl.style.cssText = 'flex:1;border:none;width:100%;height:0;min-height:0;background:#fff;color-scheme:light;';
            wrapper.appendChild(iframeEl);

            // Set up parent-side VFS message handler synchronously — it will be ready
            // before the iframe src is set, so no messages are missed.
            console.log('[sg-vfs parent] HTML file opened:', fileName, '| dataSource:', self.dataSource ? 'YES' : 'NO (null)');
            if (self.dataSource) {
                console.log('[sg-vfs parent] htmlDir="' + htmlDir + '" fileList=' + fileList.length + ' entries');
                console.log('[sg-vfs parent] sample paths:', fileList.slice(0, 8).map(function(e){return e.path;}));
                var _vfsMime = {
                    json:'application/json', js:'application/javascript',
                    mjs:'application/javascript', css:'text/css',
                    html:'text/html', htm:'text/html',
                    png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
                    gif:'image/gif', svg:'image/svg+xml', webp:'image/webp',
                    pdf:'application/pdf', txt:'text/plain', md:'text/markdown',
                    woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', otf:'font/otf'
                };

                var vfsBridge = function(e) {
                    if (!e.data) return;
                    if (e.source !== iframeEl.contentWindow) return;

                    // ── BRW-019: same-vault navigation ──────────────────────
                    if (e.data.__sgVfsNavReq) {
                        var navHref = e.data.__sgVfsNavReq;
                        var navErr  = _validateVfsPath(navHref, htmlDir);
                        if (navErr) { console.warn('[sg-vfs parent] nav blocked:', navErr); return; }
                        var navResolved = _resolvePath(htmlDir, navHref);
                        var navMatch    = _findEntry(fileList, navResolved);
                        console.log('[sg-vfs parent] nav:', navHref, '→', navResolved, '→', navMatch ? navMatch.path : 'NOT FOUND');
                        if (!navMatch) {
                            console.warn('[sg-vfs parent] nav target not found:', navResolved);
                            return;
                        }
                        self.dataSource.getFileBytes(navMatch.path).then(function(buf) {
                            var newText = new TextDecoder().decode(buf);
                            var newDir = navMatch.path.includes('/')
                                ? navMatch.path.substring(0, navMatch.path.lastIndexOf('/') + 1)
                                : '';
                            // No asset inlining — vault HTML authors load CSS/JS via
                            // sg.loadCss / sg.loadJs (the bridge contract). We only inject
                            // the bridge script and create the blob.
                            htmlDir = newDir;
                            // Rebuild the bridge script so sg.app.selfPath reflects the
                            // newly-navigated-to document (not the original entry).
                            var navBridge = _buildVfsBridgeScript(navMatch.path);
                            var newHtml = self.dataSource
                                ? newText.replace(/(<head[^>]*>)/i, '$1' + navBridge)
                                : newText;
                            if (self.dataSource && newHtml === newText) newHtml = navBridge + newText;
                            var newBlob = new Blob([newHtml], { type: 'text/html' });
                            var newUrl  = URL.createObjectURL(newBlob);
                            self._objectUrls.push(newUrl);
                            iframeEl.src = newUrl;
                            console.log('[sg-vfs parent] navigated to:', navMatch.path, '| htmlDir now:', htmlDir);
                        }).catch(function(err) {
                            console.error('[sg-vfs parent] nav getFileBytes failed:', navMatch.path, err);
                        });
                        return;
                    }

                    // ── Change 5: write request ─────────────────────────────
                    if (e.data.__sgVfsWriteReq) {
                        var writeId  = e.data.__sgVfsWriteReq;
                        var writeSrc = e.source;
                        function _writeReply(ok, payload) {
                            try { writeSrc.postMessage(Object.assign({ __sgVfsWriteReply: writeId, ok: ok }, payload), '*'); } catch (_) {}
                        }
                        // Guard: writable vault only
                        if (!self.dataSource || !self.dataSource.writable ||
                            self.dataSource._iframeWriteDisabled) {
                            _writeReply(false, { err: 'Read-only vault' }); return;
                        }
                        // Validate path (same rules as read/nav)
                        var wPathErr = _validateVfsPath(e.data.path, htmlDir);
                        if (wPathErr) { _writeReply(false, { err: wPathErr }); return; }
                        // Decode base64 → bytes
                        var wBytes;
                        try {
                            var bin = atob(e.data.data || '');
                            wBytes = new Uint8Array(bin.length);
                            for (var i = 0; i < bin.length; i++) wBytes[i] = bin.charCodeAt(i);
                        } catch (_) { _writeReply(false, { err: 'Bad encoding' }); return; }
                        // Resolve path → folder + filename
                        var wResolved = e.data.path.startsWith('/')
                            ? e.data.path.slice(1) : _resolvePath(htmlDir, e.data.path);
                        var wSlash   = wResolved.lastIndexOf('/');
                        var wDir     = wSlash > 0 ? '/' + wResolved.slice(0, wSlash) : '/';
                        var wFile    = wResolved.slice(wSlash + 1);
                        var _wSize = wBytes.byteLength;
                        _ensureVaultFolder(self.dataSource, wDir)
                            .then(function() {
                                return self.dataSource.saveFile(wDir, wFile, wBytes.buffer);
                            })
                            .then(function() {
                                fileList = self.dataSource.getFileList(); // refresh after write
                                console.log('[sg-vfs parent] wrote', wResolved, _wSize, 'bytes');
                                var ds = self.dataSource;
                                if (ds && ds.writable && ds._vault && typeof ds._vault.push === 'function') {
                                    return ds._vault.push().then(function() {
                                        var sh = window.sgraphVault && window.sgraphVault.shell;
                                        if (sh && typeof sh._refreshSyncState === 'function') sh._refreshSyncState();
                                        return { size: _wSize };
                                    });
                                }
                                return { size: _wSize };
                            })
                            .then(function(payload) {
                                _writeReply(true, payload);
                            })
                            .catch(function(err) {
                                console.error('[sg-vfs parent] write/push failed:', wResolved, err);
                                _writeReply(false, { err: err.message || 'Write failed' });
                            });
                        return;
                    }

                    // ── Change 5: list request ──────────────────────────────
                    if (e.data.__sgVfsListReq) {
                        var listId  = e.data.__sgVfsListReq;
                        var entries = self.dataSource ? self.dataSource.getFileList() : [];
                        var prefix  = (e.data.path || '').replace(/^\//, '');
                        if (prefix) {
                            // Strict: prefix must match an entry exactly or as a directory
                            var normPrefix = prefix.endsWith('/') ? prefix : prefix + '/';
                            var filtered = entries.filter(function(f) {
                                return f.path === prefix || f.path.startsWith(normPrefix);
                            });
                            if (filtered.length === 0) {
                                try { e.source.postMessage({ __sgVfsListReply: listId, ok: false, err: 'ENOENT', path: prefix }, '*'); } catch (_) {}
                                return;
                            }
                            entries = filtered;
                        }
                        var listed = entries.map(function(f) {
                            return { path: f.path, name: f.name || f.path, size: f.size || 0, type: f.dir ? 'folder' : 'file' };
                        });
                        try { e.source.postMessage({ __sgVfsListReply: listId, ok: true, entries: listed }, '*'); } catch (_) {}
                        return;
                    }

                    // ── sg.git.* / sg.auth.* commands ──────────────────────
                    if (e.data.__sgCmdType) {
                        var cmdId  = e.data.__sgCmdId;
                        var cmdSrc = e.source;
                        function _cmdReply(ok, result, errMsg) {
                            try { cmdSrc.postMessage({ __sgCmdReply: cmdId, ok: ok, result: result || null, err: errMsg || null }, '*'); } catch (_) {}
                        }
                        var vault = self.dataSource && self.dataSource._vault;
                        var shell = window.sgraphVault && window.sgraphVault.shell;

                        if (e.data.__sgCmdType === 'git') {
                            var gitAction = e.data.action;
                            if (gitAction === 'status') {
                                var ss = (shell && shell._syncState) || { ahead: 0, behind: 0, diverged: false };
                                var lastChecked = shell && shell._lastSyncedAt ? new Date(shell._lastSyncedAt).toISOString() : null;
                                _cmdReply(true, {
                                    ahead: ss.ahead || 0, behind: ss.behind || 0, diverged: !!ss.diverged,
                                    headCommitId: vault ? vault._headCommitId : null,
                                    namedHeadId:  vault ? vault._namedHeadId  : null,
                                    writable: !!(self.dataSource && self.dataSource.writable),
                                    lastCheckedAt: lastChecked
                                });
                                return;
                            }
                            if (gitAction === 'check') {
                                if (shell && typeof shell._checkBehindOnly === 'function') {
                                    shell._checkBehindOnly(false).then(function() {
                                        var s = (shell._syncState) || {};
                                        _cmdReply(true, { ahead: s.ahead||0, behind: s.behind||0, diverged: !!s.diverged });
                                    }).catch(function(err) { _cmdReply(false, null, err.message); });
                                } else { _cmdReply(false, null, 'Shell not available'); }
                                return;
                            }
                            if (gitAction === 'push') {
                                if (!vault || !(self.dataSource && self.dataSource.writable)) { _cmdReply(false, null, 'Read-only vault'); return; }
                                vault.push().then(function() {
                                    if (shell) shell._refreshSyncState();
                                    _cmdReply(true, { pushed: true });
                                }).catch(function(err) { _cmdReply(false, null, err.message); });
                                return;
                            }
                            if (gitAction === 'pull') {
                                if (!vault || !(self.dataSource && self.dataSource.writable)) { _cmdReply(false, null, 'Read-only vault'); return; }
                                vault.pull().then(function(changed) {
                                    if (changed && shell) { shell._mountBrowse(); shell._refreshSyncState(); }
                                    _cmdReply(true, { pulled: !!changed });
                                }).catch(function(err) { _cmdReply(false, null, err.message); });
                                return;
                            }
                            if (gitAction === 'refresh') {
                                if (shell && typeof shell._onRefresh === 'function') {
                                    shell._onRefresh().then(function() { _cmdReply(true, {}); })
                                        .catch(function(err) { _cmdReply(false, null, err.message); });
                                } else { _cmdReply(false, null, 'Shell not available'); }
                                return;
                            }
                            // Non-destructive in-place refresh (sg.sync.refresh)
                            if (gitAction === 'syncRefresh') {
                                if (!shell || typeof shell._refreshInPlace !== 'function') {
                                    _cmdReply(false, null, 'Shell does not support in-place refresh');
                                    return;
                                }
                                var preRefreshCount = fileList.filter(function(f) { return !f.dir; }).length;
                                shell._refreshInPlace().then(function(res) {
                                    fileList = self.dataSource ? self.dataSource.getFileList() : fileList;
                                    var postCount = fileList.filter(function(f) { return !f.dir; }).length;
                                    _cmdReply(true, {
                                        from:         res.from,
                                        to:           res.to,
                                        changed:      res.changed,
                                        filesChanged: Math.abs(postCount - preRefreshCount)
                                    });
                                }).catch(function(err) { _cmdReply(false, null, err.message); });
                                return;
                            }
                            _cmdReply(false, null, 'Unknown git action: ' + e.data.action);
                            return;
                        }

                        if (e.data.__sgCmdType === 'auth') {
                            var authAction = e.data.action;
                            var _endpoint  = (vault && vault._sgSend) ? vault._sgSend.endpoint : window.location.origin;
                            if (authAction === 'setKey') {
                                var newKey = String(e.data.key || '').trim();
                                // Propagate to vault-shell (updates token, dataSource.writable, header, sessionStorage)
                                self.dispatchEvent(new CustomEvent('vault-settings-access-key', {
                                    bubbles: true, composed: true, detail: { key: newKey }
                                }));
                                if (!newKey) { _cmdReply(true, { ok: true, valid: false, remaining: 0 }); return; }
                                fetch(_endpoint + '/api/transfers/check_token/' + encodeURIComponent(newKey))
                                    .then(function(r) { return r.json(); })
                                    .then(function(d) { _cmdReply(true, { ok: true, valid: !!d.valid, remaining: d.remaining, status: d.status }); })
                                    .catch(function() { _cmdReply(true, { ok: true, valid: null }); });
                                return;
                            }
                            if (authAction === 'check') {
                                var checkKey = String(e.data.key || '').trim();
                                if (!checkKey) { _cmdReply(true, { valid: false, remaining: 0 }); return; }
                                fetch(_endpoint + '/api/transfers/check_token/' + encodeURIComponent(checkKey))
                                    .then(function(r) { return r.json(); })
                                    .then(function(d) { _cmdReply(true, { valid: !!d.valid, remaining: d.remaining, status: d.status }); })
                                    .catch(function(err) { _cmdReply(false, null, err.message); });
                                return;
                            }
                            if (authAction === 'clear') {
                                self.dispatchEvent(new CustomEvent('vault-settings-access-key', {
                                    bubbles: true, composed: true, detail: { key: '' }
                                }));
                                _cmdReply(true, { cleared: true });
                                return;
                            }
                            _cmdReply(false, null, 'Unknown auth action: ' + e.data.action);
                            return;
                        }

                        _cmdReply(false, null, 'Unknown command type');
                        return;
                    }

                    // ── sg.ui.message / sg.ui.dismiss ──────────────────────
                    if (e.data.__sgUiMsg) {
                        var uiMsg    = e.data.__sgUiMsg;
                        var uiHandle = uiMsg.handle || '';
                        var uiBanner = document.querySelector('sg-app-banner');
                        var _icons   = { info: '•', success: '✓', warn: '⚠', error: '✗' };

                        function _uiDismiss() {
                            if (uiBanner && typeof uiBanner.isActive === 'function' && uiBanner.isActive()) {
                                // Clear with a 1ms TTL — shortest the banner accepts
                                if (typeof uiBanner.clearStatus === 'function') uiBanner.clearStatus();
                                else uiBanner.showStatus('', '', 1);
                            }
                        }

                        // Dismiss path
                        if (uiMsg.dismiss) {
                            if (_uiHandles[uiHandle]) { clearTimeout(_uiHandles[uiHandle]); delete _uiHandles[uiHandle]; }
                            _uiDismiss();
                            return;
                        }

                        var uiText = String(uiMsg.text || '');
                        var uiType = uiMsg.msgType || 'info';
                        // ttl: null → persistent, number → auto-dismiss after that ms, missing → default 3000ms
                        var uiTtl  = uiMsg.ttl === null ? null : (typeof uiMsg.ttl === 'number' ? uiMsg.ttl : 3000);

                        if (uiBanner && typeof uiBanner.isActive === 'function' && uiBanner.isActive()) {
                            if (uiType === 'error') {
                                uiBanner.showStatusError(uiText, '');
                            } else {
                                // Pass no built-in TTL — we manage the timer ourselves for dismiss support
                                uiBanner.showStatus(_icons[uiType] || '•', uiText);
                            }
                        } else if (window.sgraphVault && window.sgraphVault.messages) {
                            var _msgFn = window.sgraphVault.messages[uiType] || window.sgraphVault.messages.info;
                            _msgFn.call(window.sgraphVault.messages, uiText);
                        }

                        if (uiHandle) {
                            if (_uiHandles[uiHandle]) clearTimeout(_uiHandles[uiHandle]);
                            if (uiTtl !== null) {
                                _uiHandles[uiHandle] = setTimeout(function() {
                                    delete _uiHandles[uiHandle];
                                    _uiDismiss();
                                }, uiTtl);
                            }
                        }
                        return;
                    }

                    // ── sg.vfs.read / sg.vfs.readText (strict author API) ───
                    if (e.data.__sgVfsReadReq) {
                        var readId   = e.data.__sgVfsReadReq;
                        var readSrc  = e.source;
                        function _readReply(ok, payload) {
                            try { readSrc.postMessage(Object.assign({ __sgVfsReadReply: readId, ok: ok }, payload), '*'); } catch (_) {}
                        }
                        if (!self.dataSource) { _readReply(false, { err: 'No data source' }); return; }
                        var rPath    = e.data.path || '';
                        var rPathErr = _validateVfsPath(rPath, htmlDir);
                        if (rPathErr) { _readReply(false, { err: rPathErr }); return; }
                        var rResolved = rPath.startsWith('/') ? rPath.slice(1) : _resolvePath(htmlDir, rPath);
                        var rMatch    = _findEntryStrict(fileList, rResolved);
                        if (!rMatch) {
                            console.warn('[sg-vfs parent] ENOENT (strict):', rResolved);
                            _readReply(false, { err: 'ENOENT', path: rResolved });
                            return;
                        }
                        self.dataSource.getFileBytes(rMatch.path).then(function(buf) {
                            var ext3 = rMatch.path.split('.').pop().toLowerCase();
                            var mime2 = _vfsMime[ext3] || 'application/octet-stream';
                            _readReply(true, { buf: buf, mime: mime2, path: rMatch.path });
                        }).catch(function(err) {
                            _readReply(false, { err: err.message || 'Read failed' });
                        });
                        return;
                    }

                    if (!e.data.__sgVfsReq) return;

                    var msgId  = e.data.__sgVfsReq;
                    var reqUrl = e.data.url;
                    // Validate read path (same rules as write/nav — defence in depth)
                    var readErr = _validateVfsPath(reqUrl, htmlDir);
                    if (readErr) {
                        console.warn('[sg-vfs parent] read blocked:', readErr);
                        e.source.postMessage({ __sgVfsReply: msgId, err: true }, '*');
                        return;
                    }
                    var resolved = _resolvePath(htmlDir, reqUrl);
                    var match    = _findEntry(fileList, resolved);

                    console.log('[sg-vfs parent] request:', reqUrl, '→ resolved:', resolved, '→ match:', match ? match.path : 'NOT FOUND');

                    if (!match) {
                        console.warn('[sg-vfs parent] NOT FOUND in vault:', resolved);
                        e.source.postMessage({ __sgVfsReply: msgId, err: true }, '*');
                        return;
                    }

                    self.dataSource.getFileBytes(match.path).then(function(buf) {
                        var ext2 = match.path.split('.').pop().toLowerCase();
                        var mime = _vfsMime[ext2] || 'application/octet-stream';
                        console.log('[sg-vfs parent] sending', match.path, buf.byteLength, 'bytes mime=' + mime);
                        try {
                            e.source.postMessage({ __sgVfsReply: msgId, buf: buf, mime: mime }, '*', [buf]);
                        } catch (_) {
                            e.source.postMessage({ __sgVfsReply: msgId, buf: buf, mime: mime }, '*');
                        }
                    }).catch(function(err) {
                        console.error('[sg-vfs parent] getFileBytes failed for', match.path, err);
                        e.source.postMessage({ __sgVfsReply: msgId, err: true }, '*');
                    });
                };

                window.addEventListener('message', vfsBridge);
                if (!self._vfsBridges) self._vfsBridges = [];
                self._vfsBridges.push(vfsBridge);

                // Refresh fileList and notify iframe when vault shell syncs new content
                var _vaultSyncedHandler = function(evt) {
                    fileList = self.dataSource ? self.dataSource.getFileList() : [];
                    try {
                        iframeEl.contentWindow.postMessage({
                            __sgVfsCacheInvalidate: true,
                            version: evt.detail && evt.detail.newHead || null
                        }, '*');
                    } catch (_) {}
                };
                window.addEventListener('sg-vault-synced', _vaultSyncedHandler);
                if (!self._syncHandlers) self._syncHandlers = [];
                self._syncHandlers.push(_vaultSyncedHandler);
            }

            // Inject bridge → create blob → set iframe src.
            //
            // Vault HTML authors must NOT use declarative <link rel="stylesheet"> or
            // <script src="..."> for vault-relative assets — the browser's HTML parser
            // fetches those before our bridge runs, against the blob: URL's opaque origin,
            // and they 404. Instead, authors call sg.loadCss(path) / sg.loadJs(path) at
            // runtime; both go through fetch() (intercepted by the bridge) and inject the
            // bytes as inline <style>/<script> elements. See:
            //   library/guides/vault-html/AUTHORING.md
            //
            // _renderHtmlBlob() is reused for the initial render and for live-preview
            // reloads triggered by the vault edit-mode textarea. It captures closure state
            // (vfsBridgeScript, htmlDir, self) so re-renders do NOT need to re-register
            // the parent-side VFS bridge — the iframe element keeps the same reference,
            // and the existing bridge keeps matching e.source === iframeEl.contentWindow
            // after the blob navigation.
            var _lastBlobUrl = null;
            function _renderHtmlBlob(htmlText) {
                var htmlForIframe = self.dataSource
                    ? htmlText.replace(/(<head[^>]*>)/i, '$1' + vfsBridgeScript)
                    : htmlText;
                if (self.dataSource && htmlForIframe === htmlText) htmlForIframe = vfsBridgeScript + htmlText;
                var blob    = new Blob([htmlForIframe], { type: 'text/html' });
                var blobUrl = URL.createObjectURL(blob);
                self._objectUrls.push(blobUrl);
                // Revoke the previous live-preview URL (if any) — the original
                // initial-render URL stays in self._objectUrls and is cleaned up on
                // file close. We only revoke URLs we created on a re-render.
                if (_lastBlobUrl) {
                    try { URL.revokeObjectURL(_lastBlobUrl); } catch (_) {}
                }
                _lastBlobUrl = blobUrl;
                iframeEl.src = blobUrl;
                return Promise.resolve();
            }

            // Expose a re-render hook on the iframe element so vault-browse-edit can
            // call it without re-implementing the bridge-inject + blob pipeline. The
            // top-level _loadHtmlIntoIframe shim delegates here when this is present.
            iframeEl.__sgReloadHtml = _renderHtmlBlob;

            _renderHtmlBlob(rawText);

            var sourceEl = document.createElement('pre');
            sourceEl.className = 'sb-file__code';
            sourceEl.textContent = rawText;
            sourceEl.style.display = 'none';
            sourceEl.style.flex = '1';
            content.appendChild(sourceEl);

            var isSource = false;
            var sourceBtn = document.createElement('button');
            sourceBtn.className = 'sb-action-btn sb-file__view-source';
            sourceBtn.innerHTML = '&lt;/&gt; Source';
            sourceBtn.addEventListener('click', function() {
                isSource = !isSource;
                iframeEl.style.display = isSource ? 'none' : '';
                sourceEl.style.display = isSource ? ''     : 'none';
                sourceBtn.innerHTML    = isSource ? '&#127912; Rendered' : '&lt;/&gt; Source';
            });
            bar.appendChild(sourceBtn);

            // BRW-018: Present button — fullscreen the existing iframe.
            // Keeps VFS bridge intact (same element, same contentWindow).
            var presentBtn = document.createElement('button');
            presentBtn.className = 'sb-action-btn sb-file__present';
            presentBtn.innerHTML = '&#x26F6; Full Screen';
            presentBtn.title = 'Open HTML in full screen (Esc to exit)';
            presentBtn.addEventListener('click', function() {
                if (isSource) return;
                if (wrapper.requestFullscreen) {
                    wrapper.requestFullscreen().catch(function() { _iframeFullscreenFallback(wrapper, presentBanner); });
                } else if (wrapper.webkitRequestFullscreen) {
                    wrapper.webkitRequestFullscreen();
                } else {
                    _iframeFullscreenFallback(wrapper, presentBanner);
                }
            });
            bar.appendChild(presentBtn);
            return;
        }

        // ── Image ───────────────────────────────────────────────────────
        if (type === 'image') {
            var mime = FileTypeDetect.getImageMime(fileName) || 'image/jpeg';
            var blob = new Blob([bytes], { type: mime });
            var url = URL.createObjectURL(blob);
            this._objectUrls.push(url);
            content.innerHTML = '<img src="' + url + '" class="sb-file__image" alt="' + SendHelpers.escapeHtml(fileName) + '">';

        // ── Markdown ────────────────────────────────────────────────────
        } else if (type === 'markdown') {
            var rawText = new TextDecoder().decode(bytes);
            var html = typeof MarkdownParser !== 'undefined' ? MarkdownParser.parse(rawText) : SendHelpers.escapeHtml(rawText);
            content.innerHTML = '<div class="sb-file__markdown">' + html + '</div>';

            // BRW-006: Source toggle
            var mdContainer = content.querySelector('.sb-file__markdown');
            var isSource = false;
            var sourceEl = document.createElement('pre');
            sourceEl.className = 'sb-file__code sb-file__md-source';
            sourceEl.textContent = rawText;
            sourceEl.style.display = 'none';
            mdContainer.parentNode.insertBefore(sourceEl, mdContainer.nextSibling);

            var sourceBtn = document.createElement('button');
            sourceBtn.className = 'sb-action-btn sb-file__view-source';
            sourceBtn.innerHTML = '&lt;/&gt; Source';
            sourceBtn.addEventListener('click', function() {
                isSource = !isSource;
                mdContainer.style.display = isSource ? 'none' : '';
                sourceEl.style.display    = isSource ? ''     : 'none';
                sourceBtn.innerHTML       = isSource ? '&#9998; Rendered' : '&lt;/&gt; Source';
            });
            bar.appendChild(sourceBtn);

            // BRW-016: Print button (per-tab, not global header)
            if (typeof SgPrint !== 'undefined') {
                var printBtn = document.createElement('button');
                printBtn.className = 'sb-action-btn';
                printBtn.innerHTML = (SendIcons.PRINT || '🖨️') + ' Print';
                printBtn.addEventListener('click', function() {
                    var displayName = fileName.includes('/') ? fileName.split('/').pop() : fileName;
                    SgPrint.printHtml(mdContainer.innerHTML, displayName);
                });
                bar.appendChild(printBtn);
            }

            // BRW-004/005/014: markdown link interception + image resolution + folder nav
            if (mdContainer && this.dataSource) {
                var currentDir = '';
                if (fileName.includes('/')) {
                    currentDir = fileName.substring(0, fileName.lastIndexOf('/') + 1);
                }
                var fileList = this.dataSource.getFileList();

                // Links
                mdContainer.querySelectorAll('a[href]').forEach(function(a) {
                    var href = a.getAttribute('href');
                    if (!href || href.startsWith('http://') || href.startsWith('https://') ||
                        href.startsWith('mailto:') || href.startsWith('#')) return;

                    a.addEventListener('click', function(e) {
                        e.preventDefault();
                        var resolved = _resolvePath(currentDir, href);
                        var match = _findEntry(fileList, resolved);
                        if (match) {
                            self._openFileTab(match.path);
                            return;
                        }
                        // BRW-014: folder navigation
                        var folderPath = resolved.replace(/\/$/, '');
                        _navigateToFolder(self, fileList, folderPath);
                    });
                    a.style.cursor = 'pointer';
                });

                // BRW-005: Images from zip/vault.
                // Also handles data-md-src from markdown-parser-v031 BRW-020:
                // that overlay outputs <img data-md-src="..."> (no src) to prevent
                // HTTP 404s while this code asynchronously loads the blob URL.
                mdContainer.querySelectorAll('img[src], img[data-md-src]').forEach(function(img) {
                    var src = img.getAttribute('src') || img.getAttribute('data-md-src');
                    if (!src || src.startsWith('http://') || src.startsWith('https://') ||
                        src.startsWith('data:') || src.startsWith('blob:')) return;

                    var resolved = _resolvePath(currentDir, src);
                    var match = _findEntry(fileList, resolved);
                    if (match) {
                        self.dataSource.getFileBytes(match.path).then(function(imgBytes) {
                            var mime = typeof FileTypeDetect !== 'undefined'
                                ? FileTypeDetect.getImageMime(match.name) || 'image/png' : 'image/png';
                            var blob = new Blob([imgBytes], { type: mime });
                            var url  = URL.createObjectURL(blob);
                            img.src  = url;
                            img.removeAttribute('data-md-src');
                            if (self._objectUrls) self._objectUrls.push(url);
                        });
                    }
                });
            }

        // ── BRW-002: PDF + Present button ───────────────────────────────
        } else if (type === 'pdf') {
            var blob = new Blob([bytes], { type: 'application/pdf' });
            var url = URL.createObjectURL(blob);
            this._objectUrls.push(url);
            content.innerHTML = '<iframe src="' + url + '" class="sb-file__pdf"></iframe>';

            var presentBtn = document.createElement('button');
            presentBtn.className = 'sb-action-btn sb-file__present';
            presentBtn.innerHTML = '&#x26F6; Full Screen';
            presentBtn.title = 'Open PDF in full screen';
            presentBtn.addEventListener('click', function() {
                var win = window.open(url + '#toolbar=1&navpanes=0&view=Fit', '_blank');
                if (!win) {
                    var iframe = content.querySelector('.sb-file__pdf');
                    if (iframe && iframe.requestFullscreen) iframe.requestFullscreen();
                }
            });
            bar.appendChild(presentBtn);

        // ── Code / Text ─────────────────────────────────────────────────
        } else if (type === 'code' || type === 'text') {
            var text = new TextDecoder().decode(bytes);
            content.innerHTML = '<pre class="sb-file__code">' + SendHelpers.escapeHtml(text) + '</pre>';

        // ── Audio ───────────────────────────────────────────────────────
        } else if (type === 'audio') {
            var mime = typeof FileTypeDetect !== 'undefined' ? FileTypeDetect.getAudioMime(fileName) : 'audio/mpeg';
            var blob = new Blob([bytes], { type: mime });
            var url = URL.createObjectURL(blob);
            this._objectUrls.push(url);
            content.innerHTML = '<audio controls src="' + url + '" style="width: 100%; margin: 2rem 0;"></audio>';

        // ── Video ───────────────────────────────────────────────────────
        } else if (type === 'video') {
            var mime = typeof FileTypeDetect !== 'undefined' ? FileTypeDetect.getVideoMime(fileName) : 'video/mp4';
            var blob = new Blob([bytes], { type: mime });
            var url = URL.createObjectURL(blob);
            this._objectUrls.push(url);
            content.innerHTML = '<video controls src="' + url + '" style="max-width: 100%; max-height: 80vh;"></video>';

        // ── Email (.eml) ────────────────────────────────────────────────
        } else if (type === 'email') {
            var rawText = new TextDecoder().decode(bytes);
            var parsed  = _parseEml(rawText);

            var emailWrap = document.createElement('div');
            emailWrap.style.cssText = 'height:100%;display:flex;flex-direction:column;overflow:hidden;background:var(--color-bg,#0d1117);border-top:2px solid #4ecdc4;';

            // ── 1. Type badge strip ──────────────────────────────────────
            var badgeStrip = document.createElement('div');
            badgeStrip.style.cssText = 'display:flex;align-items:center;gap:0.6rem;padding:0.45rem 1rem;background:rgba(78,205,196,0.06);border-bottom:1px solid rgba(78,205,196,0.15);flex-shrink:0;';
            badgeStrip.innerHTML =
                '<span style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;padding:2px 7px;border-radius:3px;background:#4ecdc4;color:#0a2e2c;flex-shrink:0;">EMAIL</span>' +
                '<span style="font-size:0.75rem;color:#5ab8b4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
                    SendHelpers.escapeHtml(fileName) +
                '</span>';
            emailWrap.appendChild(badgeStrip);

            // ── 2. Subject section ───────────────────────────────────────
            var subjectEl = document.createElement('div');
            subjectEl.style.cssText = 'padding:0.9rem 1.25rem 0.85rem;background:#111823;border-bottom:1px solid rgba(78,205,196,0.12);flex-shrink:0;';
            var subjectText = parsed.headers['subject'] || '(no subject)';
            subjectEl.innerHTML =
                '<div style="font-size:1.05rem;font-weight:600;color:#a8f0ec;line-height:1.35;overflow-wrap:break-word;">' +
                    SendHelpers.escapeHtml(subjectText) +
                '</div>';
            emailWrap.appendChild(subjectEl);

            // ── 3. Metadata section (avatar + From / To / CC / Date) ─────
            var metaEl = document.createElement('div');
            metaEl.style.cssText = 'display:flex;gap:0.85rem;padding:0.75rem 1.25rem;background:#0d1117;border-bottom:2px solid rgba(0,0,0,0.35);flex-shrink:0;';

            // Avatar: initials from From field
            var fromRaw = parsed.headers['from'] || '';
            var fromName = fromRaw.replace(/<[^>]*>/, '').trim().replace(/^["']|["']$/g, '').trim() || fromRaw.split('@')[0] || '?';
            var initials = fromName.split(/\s+/).slice(0,2).map(function(w){ return w[0] || ''; }).join('').toUpperCase() || '?';
            var avatarEl = document.createElement('div');
            avatarEl.style.cssText = 'width:38px;height:38px;border-radius:50%;background:rgba(78,205,196,0.12);border:1.5px solid rgba(78,205,196,0.3);display:flex;align-items:center;justify-content:center;font-size:0.82rem;font-weight:700;color:#4ecdc4;flex-shrink:0;letter-spacing:0.02em;';
            avatarEl.textContent = initials;

            var metaFields = document.createElement('div');
            metaFields.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:0.22rem;justify-content:center;';
            var emlMetaRows = [
                { label: 'From', value: fromRaw },
                { label: 'To',   value: parsed.headers['to']   },
                { label: 'CC',   value: parsed.headers['cc']   },
                { label: 'Date', value: parsed.headers['date'] },
            ];
            metaFields.innerHTML = emlMetaRows.filter(function(r){ return r.value; }).map(function(r) {
                return '<div style="display:flex;gap:0.45rem;font-size:0.78rem;line-height:1.45;overflow:hidden;">' +
                    '<span style="color:#4ecdc4;font-weight:600;min-width:2.8rem;flex-shrink:0;">' + SendHelpers.escapeHtml(r.label) + '</span>' +
                    '<span style="color:#c9d1d9;overflow-wrap:anywhere;">' + SendHelpers.escapeHtml(r.value) + '</span>' +
                    '</div>';
            }).join('');

            metaEl.appendChild(avatarEl);
            metaEl.appendChild(metaFields);
            emailWrap.appendChild(metaEl);

            // ── 4. Body ──────────────────────────────────────────────────
            var bodyEl = document.createElement('div');
            bodyEl.style.cssText = 'flex:1;overflow-y:auto;background:#111823;';

            if (parsed.html) {
                var htmlBlob = new Blob([parsed.html], { type: 'text/html' });
                var htmlUrl  = URL.createObjectURL(htmlBlob);
                self._objectUrls.push(htmlUrl);
                var htmlFrame = document.createElement('iframe');
                htmlFrame.src = htmlUrl;
                htmlFrame.sandbox = 'allow-same-origin';
                htmlFrame.style.cssText = 'width:100%;height:100%;border:none;background:white;display:block;';
                bodyEl.style.cssText += 'display:flex;flex-direction:column;';
                htmlFrame.style.flex = '1';
                bodyEl.appendChild(htmlFrame);
            } else {
                var bodyPre = document.createElement('pre');
                bodyPre.style.cssText = 'white-space:pre-wrap;word-break:break-word;font-family:inherit;font-size:0.875rem;color:#c9d1d9;margin:0;line-height:1.7;padding:1.25rem;';
                bodyPre.textContent = parsed.text || rawText;
                bodyEl.appendChild(bodyPre);
            }
            emailWrap.appendChild(bodyEl);

            // ── 5. Raw source (hidden by default) ────────────────────────
            var rawPre = document.createElement('pre');
            rawPre.style.cssText = 'white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono,monospace);font-size:0.78rem;color:#8b949e;padding:1rem;flex:1;overflow-y:auto;margin:0;display:none;background:#0a0e14;';
            rawPre.textContent = rawText;
            emailWrap.appendChild(rawPre);

            content.appendChild(emailWrap);

            // Source toggle
            var isSource = false;
            var sourceBtn = document.createElement('button');
            sourceBtn.className = 'sb-action-btn sb-file__view-source';
            sourceBtn.innerHTML = '&lt;/&gt; Source';
            sourceBtn.addEventListener('click', function() {
                isSource = !isSource;
                badgeStrip.style.display = isSource ? 'none' : '';
                subjectEl.style.display  = isSource ? 'none' : '';
                metaEl.style.display     = isSource ? 'none' : '';
                bodyEl.style.display     = isSource ? 'none' : '';
                rawPre.style.display     = isSource ? ''     : 'none';
                sourceBtn.innerHTML      = isSource ? '&#9998; Rendered' : '&lt;/&gt; Source';
            });
            bar.appendChild(sourceBtn);

        // ── Unknown ─────────────────────────────────────────────────────
        } else {
            content.innerHTML =
                '<div style="padding: 2rem; text-align: center; color: var(--color-text-secondary);">' +
                    '<div style="font-size: 3rem; margin-bottom: 1rem;">📄</div>' +
                    '<p>No preview available for this file type.</p>' +
                    '<p style="font-size: 0.8rem;">' + SendHelpers.escapeHtml(fileName) + ' · ' + SendHelpers.formatBytes(bytes.byteLength) + '</p>' +
                '</div>';
        }
    }

    // ─── Header Listeners ───────────────────────────────────────────────────

    // v0.3.2: BRW-009 save via dataSource + BRW-016 print moved to per-tab action bar
    _setupHeaderListeners() {
        var self = this;

        var copyBtn = this.querySelector('#sb-copy-link');
        if (copyBtn) copyBtn.addEventListener('click', async function() {
            try {
                await navigator.clipboard.writeText(self.downloadUrl || window.location.href);
                copyBtn.textContent = 'Copied!';
                setTimeout(function() { copyBtn.innerHTML = SendIcons.LINK_SM + ' Copy Link'; }, 2000);
            } catch (_) {}
        });

        // BRW-016: print button REMOVED from header (moved to per-file action bar for markdown)

        var emailBtn = this.querySelector('#sb-email');
        if (emailBtn) emailBtn.addEventListener('click', function() {
            var url = self.downloadUrl || window.location.href;
            window.location.href = 'mailto:?subject=Shared files via SG/Send&body=' + encodeURIComponent(url);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Static Assets
    // ═══════════════════════════════════════════════════════════════════════════

    // Shared icons (FOLDER, LINK, DOWNLOAD) are in SendIcons (send-icons.js)

    static FILE_ICONS = {
        image:    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#4ECDC4" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><circle cx="6" cy="6" r="1.5"/><path d="M2 12l4-4 3 3 2-2 3 3"/></svg>',
        pdf:      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#e74c3c" stroke-width="1.5"><rect x="3" y="1" width="10" height="14" rx="1.5"/><path d="M6 6h4M6 9h4"/></svg>',
        markdown: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#3498db" stroke-width="1.5"><rect x="1" y="3" width="14" height="10" rx="1.5"/><path d="M4 10V6l2 2.5L8 6v4M11 8l1.5 1.5L14 8"/></svg>',
        code:     '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#9b59b6" stroke-width="1.5"><path d="M5 4L2 8l3 4M11 4l3 4-3 4M7 12l2-8"/></svg>',
        text:     '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#95a5a6" stroke-width="1.5"><rect x="3" y="1" width="10" height="14" rx="1.5"/><path d="M6 5h4M6 8h4M6 11h2"/></svg>',
        audio:    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#e67e22" stroke-width="1.5"><path d="M7 4v8l-3-3H2v-2h2l3-3z"/><path d="M10 5.5a3.5 3.5 0 010 5"/></svg>',
        video:    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#d35400" stroke-width="1.5"><rect x="1" y="3" width="10" height="10" rx="1.5"/><path d="M11 6l4-2v8l-4-2z"/></svg>',
        other:    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#7f8c8d" stroke-width="1.5"><rect x="3" y="1" width="10" height="14" rx="1.5"/><path d="M10 1v4h3"/></svg>',
    };

}

// Guard: only define if not already registered (supports standalone and overlay use)
if (!customElements.get('send-browse')) {
    customElements.define('send-browse', SendBrowse);
}
window.SendBrowse = SendBrowse;


// ═══════════════════════════════════════════════════════════════════════════════
// Helper functions (outside the class)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Resolve relative path against a base directory ──────────────────────────
function _resolvePath(base, relative) {
    if (relative.startsWith('/')) return relative.substring(1);
    var combined = base + relative;
    var parts    = combined.split('/');
    var resolved = [];
    for (var i = 0; i < parts.length; i++) {
        if (parts[i] === '..') { resolved.pop(); }
        else if (parts[i] !== '.' && parts[i] !== '') { resolved.push(parts[i]); }
    }
    return resolved.join('/');
}

// ─── Find entry — strict exact match only (author API: sg.vfs.read/readText) ─
function _findEntryStrict(fileList, resolved) {
    try { resolved = decodeURIComponent(resolved); } catch (_) {}
    return fileList.find(function(e) { return !e.dir && e.path === resolved; }) || null;
}

// ─── Find entry by resolved path (BRW-011: URL decode, fuzzy matching) ──────
// Used for legacy HTML asset resolution (img.src, anchor nav) — NOT author API.
function _findEntry(fileList, resolved) {
    try { resolved = decodeURIComponent(resolved); } catch (_) {}

    var match = fileList.find(function(e) { return !e.dir && e.path === resolved; });
    if (match) return match;

    match = fileList.find(function(e) { return !e.dir && e.path.endsWith('/' + resolved); });
    if (match) return match;

    if (resolved.indexOf('.') === -1) {
        var exts = ['.md', '.pdf', '.txt', '.html', '.jpg', '.jpeg', '.png', '.webp'];
        for (var i = 0; i < exts.length; i++) {
            match = fileList.find(function(e) { return !e.dir && e.path === resolved + exts[i]; });
            if (match) return match;
            match = fileList.find(function(e) { return !e.dir && e.path.endsWith('/' + resolved + exts[i]); });
            if (match) return match;
        }
    }

    var filename = resolved.split('/').pop();
    if (filename) {
        match = fileList.find(function(e) {
            if (e.dir) return false;
            return e.path.split('/').pop() === filename;
        });
    }
    return match || null;
}

// ─── BRW-014: Navigate to folder ─────────────────────────────────────────────
function _navigateToFolder(browseInstance, fileList, folderPath) {
    try { folderPath = decodeURIComponent(folderPath); } catch (_) {}

    var folderFiles = fileList.filter(function(e) {
        return !e.dir && e.path.startsWith(folderPath + '/');
    });
    if (folderFiles.length === 0) {
        folderFiles = fileList.filter(function(e) {
            return !e.dir && e.path.includes('/' + folderPath + '/');
        });
    }
    if (folderFiles.length === 0) return;

    // Expand parent folders in the tree
    var treeRoot = browseInstance.querySelector('.sb-tree__controls');
    if (treeRoot) treeRoot = treeRoot.parentElement;
    if (treeRoot) {
        var parts = folderPath.split('/');
        var pathSoFar = '';
        for (var i = 0; i < parts.length; i++) {
            pathSoFar = pathSoFar ? pathSoFar + '/' + parts[i] : parts[i];
            var folderEl = treeRoot.querySelector('.sb-tree__folder[data-path="' + pathSoFar + '"]');
            if (!folderEl) {
                var allFolders = treeRoot.querySelectorAll('.sb-tree__folder');
                for (var f = 0; f < allFolders.length; f++) {
                    var dp = allFolders[f].getAttribute('data-path') || '';
                    if (dp === pathSoFar || dp.endsWith('/' + pathSoFar)) { folderEl = allFolders[f]; break; }
                }
            }
            if (folderEl) {
                var content = folderEl.querySelector('.sb-tree__folder-content');
                var toggle  = folderEl.querySelector('.sb-tree__toggle');
                if (content && content.style.display === 'none') {
                    content.style.display = '';
                    if (toggle) toggle.textContent = '\u25BE';
                }
            }
        }
        // Scroll deepest folder into view
        var deepest = treeRoot.querySelector('.sb-tree__folder[data-path="' + folderPath + '"]');
        if (deepest) deepest.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    folderFiles.sort(function(a, b) {
        return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' });
    });
    browseInstance._openFileTab(folderFiles[0].path);
}

// ─── BRW-017: Reveal file in tree ────────────────────────────────────────────
function _revealInTree(browseInstance, filePath) {
    var treeRoot = browseInstance.querySelector('.sb-tree__controls');
    if (treeRoot) treeRoot = treeRoot.parentElement;
    if (!treeRoot) return;

    // Expand parent folders
    var parts = filePath.split('/');
    var pathSoFar = '';
    for (var i = 0; i < parts.length - 1; i++) {
        pathSoFar = pathSoFar ? pathSoFar + '/' + parts[i] : parts[i];
        var folderEl = treeRoot.querySelector('.sb-tree__folder[data-path="' + pathSoFar + '"]');
        if (folderEl) {
            var content = folderEl.querySelector('.sb-tree__folder-content');
            var toggle  = folderEl.querySelector('.sb-tree__toggle');
            if (content && content.style.display === 'none') {
                content.style.display = '';
                if (toggle) toggle.textContent = '\u25BE';
            }
        }
    }

    // Find and highlight the file
    var fileEl = treeRoot.querySelector('.sb-tree__file[data-path="' + filePath + '"]');
    if (fileEl) {
        treeRoot.querySelectorAll('.sb-tree__file').forEach(function(f) { f.classList.remove('sb-tree__file--active'); });
        fileEl.classList.add('sb-tree__file--active');
        fileEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

// ─── CSV Parser ──────────────────────────────────────────────────────────────
function _csvToTable(text) {
    var rows = _parseCsv(text);
    if (rows.length === 0) return '<p>Empty CSV</p>';
    var html = '<table><thead><tr>';
    var headers = rows[0];
    for (var h = 0; h < headers.length; h++) html += '<th>' + _escHtml(headers[h]) + '</th>';
    html += '</tr></thead><tbody>';
    for (var r = 1; r < rows.length; r++) {
        html += '<tr>';
        for (var c = 0; c < headers.length; c++) {
            html += '<td>' + _escHtml((c < rows[r].length) ? rows[r][c] : '') + '</td>';
        }
        html += '</tr>';
    }
    return html + '</tbody></table>';
}

function _parseCsv(text) {
    var rows = [], row = [], field = '', inQuotes = false, i = 0;
    while (i < text.length) {
        var ch = text[i];
        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; }
            else if (ch === '"') { inQuotes = false; i++; }
            else { field += ch; i++; }
        } else {
            if (ch === '"') { inQuotes = true; i++; }
            else if (ch === ',') { row.push(field.trim()); field = ''; i++; }
            else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
                row.push(field.trim());
                if (row.length > 1 || row[0] !== '') rows.push(row);
                row = []; field = ''; i += (ch === '\r') ? 2 : 1;
            } else { field += ch; i++; }
        }
    }
    row.push(field.trim());
    if (row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
}

function _escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── EML parser ──────────────────────────────────────────────────────────────

function _parseEml(raw) {
    var lines     = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    var headers   = {};
    var headerEnd = lines.length;
    var lastKey   = null;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line === '') { headerEnd = i + 1; break; }
        if (/^\s/.test(line) && lastKey) {
            headers[lastKey] = (headers[lastKey] || '') + ' ' + line.trim();
        } else {
            var colon = line.indexOf(':');
            if (colon > 0) {
                lastKey = line.slice(0, colon).toLowerCase().trim();
                headers[lastKey] = line.slice(colon + 1).trim();
            }
        }
    }

    var body = lines.slice(headerEnd).join('\n');
    var ct   = (headers['content-type'] || '').toLowerCase();
    var text = '', html = '';

    if (ct.startsWith('text/plain')) {
        text = _emlDecode(body, headers['content-transfer-encoding']);
    } else if (ct.startsWith('text/html')) {
        html = _emlDecode(body, headers['content-transfer-encoding']);
    } else if (ct.startsWith('multipart/')) {
        var bm = ct.match(/boundary\s*=\s*"?([^";\s\r\n]+)"?/);
        if (bm) {
            var parts = _emlSplitMultipart(body, bm[1]);
            for (var p = 0; p < parts.length; p++) {
                var sub = _parseEml(parts[p]);
                if (!html && sub.html) html = sub.html;
                if (!text && sub.text) text = sub.text;
            }
        } else {
            text = body;
        }
    } else {
        text = body;
    }

    return { headers: headers, text: text, html: html };
}

function _emlDecode(body, encoding) {
    var enc = (encoding || '').toLowerCase().trim();
    if (enc === 'quoted-printable') {
        return body.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, function(_, h) {
            return String.fromCharCode(parseInt(h, 16));
        });
    }
    if (enc === 'base64') {
        try { return atob(body.replace(/[\s]/g, '')); } catch (_) { return body; }
    }
    return body;
}

function _emlSplitMultipart(body, boundary) {
    var parts = [];
    var sep   = '--' + boundary;
    var lines = body.split('\n');
    var cur   = null;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].replace(/\r$/, '');
        if (line === sep || line === sep + '--') {
            if (cur !== null) parts.push(cur.join('\n'));
            cur = (line === sep + '--') ? null : [];
        } else if (cur !== null) {
            cur.push(line);
        }
    }
    return parts;
}

// ─── Change 5: VFS path validation ───────────────────────────────────────────────
// Applied symmetrically to read, navigation, AND write paths — defence in depth.
// Returns a non-empty error string if invalid, null if OK.
function _validateVfsPath(rawPath, htmlDir) {
    if (!rawPath || typeof rawPath !== 'string') return 'Empty path';
    if (rawPath.length > 1024)                   return 'Path too long';
    if (rawPath.indexOf('\0') !== -1)             return 'Null byte in path';
    // URL-decode to catch %2e%2e/ traversal before the string checks
    var decoded;
    try { decoded = decodeURIComponent(rawPath); } catch (_) { decoded = rawPath; }
    if (decoded.indexOf('\0') !== -1)             return 'Null byte in path';
    // Resolve: leading slash = vault-rooted (strip it); relative = resolve against htmlDir
    var resolved = decoded.startsWith('/')
        ? decoded.slice(1)
        : _resolvePath(htmlDir, decoded);
    if (!resolved)                                return 'Cannot resolve path';
    // Traversal guard (post-resolution)
    if (resolved.startsWith('../') || resolved.indexOf('/../') !== -1 || resolved === '..')
                                                  return 'Path traversal';
    // Protect vault internals
    if (resolved === '.vault-settings.json' ||
        resolved === '.vault-settings'       ||
        resolved.startsWith('.vault-')       ||
        resolved.startsWith('.vault/'))           return 'Protected path';
    return null; // valid
}

// ─── Change 5: ensure all folder segments of a vault path exist ──────────────────
// Creates any missing parent folders one by one (each is a vault commit).
// Suppresses errors for already-existing folders.
async function _ensureVaultFolder(dataSource, folderPath) {
    if (!folderPath || folderPath === '/') return;
    var parts = folderPath.replace(/^\//, '').split('/').filter(Boolean);
    var current = '/';
    for (var i = 0; i < parts.length; i++) {
        var next = current === '/' ? '/' + parts[i] : current + '/' + parts[i];
        try {
            if (!dataSource._vault || !dataSource._vault._findNode(next)) {
                await dataSource.createFolder(next);
            }
        } catch (_) {} // already exists — fine
        current = next;
    }
}

// ─── Top-level live-preview entry point used by vault-browse-edit ───────────────
// vault-browse-edit checks `typeof _loadHtmlIntoIframe === 'function'` to decide
// whether to use the rich VFS-aware re-render or fall back to a bare blob. We
// delegate to the per-iframe `__sgReloadHtml` closure stashed during the initial
// render — that closure carries all the closure state (vfsBridgeScript, htmlDir,
// fileList, dataSource) needed to inline assets and re-inject the bridge without
// disturbing the parent-side message listener.
function _loadHtmlIntoIframe(iframe, htmlText, fileName, dataSource, objectUrls, vfsBridges) {
    if (iframe && typeof iframe.__sgReloadHtml === 'function') {
        return iframe.__sgReloadHtml(htmlText);
    }
    // Fallback if the iframe wasn't initialised by the HTML pipeline (defensive —
    // shouldn't fire in practice). No asset inlining, no VFS bridge.
    var blob = new Blob([htmlText], { type: 'text/html' });
    var url  = URL.createObjectURL(blob);
    if (objectUrls) objectUrls.push(url);
    if (iframe) iframe.src = url;
}

// ─── BRW-018: Wrapper fullscreen fallback (when requestFullscreen is unavailable) ─
// Expands the wrapper div to fill the viewport with a fixed overlay.
// Shows the presentBanner (if supplied) so the Exit button is still accessible.
function _iframeFullscreenFallback(wrapper, presentBanner) {
    var origCss = wrapper.style.cssText;
    wrapper.style.cssText =
        'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483646;' +
        'display:flex;flex-direction:column;overflow:hidden;';
    if (presentBanner) {
        presentBanner.style.display = 'flex';
        var exitHandler = function() {
            wrapper.style.cssText = origCss;
            presentBanner.style.display = 'none';
        };
        // Wire up the Exit button inside the banner
        var exitBtn = presentBanner.querySelector('button');
        if (exitBtn) exitBtn.addEventListener('click', exitHandler);
    }
}

// ─── BRW-015: Inject scrollable tab bar CSS into sg-layout Shadow DOM ────────
var _tabBarCSSInjected = false;
function _injectTabBarScrollCSS(sgLayout) {
    if (_tabBarCSSInjected || !sgLayout || !sgLayout.shadowRoot) return;
    var style = document.createElement('style');
    style.textContent =
        '.sgl-tab-bar { overflow-x: auto !important; overflow-y: hidden !important; flex-wrap: nowrap !important; scrollbar-width: thin; scrollbar-color: rgba(78,205,196,0.3) transparent; }\n' +
        '.sgl-tab-bar::-webkit-scrollbar { height: 2px; }\n' +
        '.sgl-tab-bar::-webkit-scrollbar-track { background: transparent; }\n' +
        '.sgl-tab-bar::-webkit-scrollbar-thumb { background: rgba(78,205,196,0.3); border-radius: 2px; }\n' +
        '.sgl-tab { flex-shrink: 0 !important; }';
    sgLayout.shadowRoot.appendChild(style);
    _tabBarCSSInjected = true;
}
