/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Browse Component v0.3.2 (complete rewrite)

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
console.log('%c[send-browse v0.3.2-vfs-4] loaded OK', 'color:#0a0;font-weight:bold;background:#e8ffe8;padding:2px 6px;border-radius:3px');

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
                        <button class="sb-save-btn" id="sb-save-zip">${SendIcons.DOWNLOAD_SM} Save locally</button>
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
            const fileCount = this._countFiles(child);
            html += `
                <div class="sb-tree__folder" data-path="${SendHelpers.escapeHtml(childPath)}">
                    <div class="sb-tree__folder-header">
                        <span class="sb-tree__toggle">▸</span>
                        <span class="sb-tree__folder-icon">${SendIcons.FOLDER_SM}</span>
                        <span class="sb-tree__folder-name">${SendHelpers.escapeHtml(name)}</span>
                        <span class="sb-tree__count">${fileCount}</span>
                    </div>
                    <div class="sb-tree__folder-content" style="display: none;">
                        ${this._renderFolderNode(child, childPath)}
                    </div>
                </div>
            `;
        }

        // BRW-001: Files — show basename only, sorted alphanumerically
        const sortedFiles = [...node.files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
        for (const file of sortedFiles) {
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
            header.addEventListener('click', () => {
                const folder = header.closest('.sb-tree__folder');
                const content = folder.querySelector('.sb-tree__folder-content');
                const toggle = header.querySelector('.sb-tree__toggle');
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    toggle.textContent = '▾';
                } else {
                    content.style.display = 'none';
                    toggle.textContent = '▸';
                }
            });
        });

        // File click → open in tab
        treeEl.querySelectorAll('.sb-tree__file').forEach(fileEl => {
            fileEl.addEventListener('click', () => {
                const path = fileEl.dataset.path;
                if (path) this._openFileTab(path);

                // Highlight active file
                treeEl.querySelectorAll('.sb-tree__file').forEach(f => f.classList.remove('sb-tree__file--active'));
                fileEl.classList.add('sb-tree__file--active');
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

        // ── BRW-013: HTML viewer (sandboxed iframe + vault VFS bridge) ──
        if (ext === 'html' || ext === 'htm') {
            var rawText = new TextDecoder().decode(bytes);
            content.style.display = 'flex';
            content.style.flexDirection = 'column';
            content.style.height = '100%';

            // VFS bridge: intercepts fetch(), img.src setter, and MutationObserver.
            // [sg-vfs] logs → iframe console (switch context in DevTools top-left dropdown)
            // [sg-vfs parent] logs → parent window console (visible in "top" context)
            var vfsBridgeScript =
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
                // Catches img.src = '...' before the browser fires any request,
                // even when the img element is not yet in the DOM (e.g. new Image()).
                '(function(){' +
                  'var d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"src");' +
                  'if(!d||!d.set)return;' +
                  'var _oset=d.set,_oget=d.get;' +
                  'Object.defineProperty(HTMLImageElement.prototype,"src",{' +
                    'configurable:true,' +
                    'get:_oget,' +
                    'set:function(val){' +
                      // External/absolute URLs pass straight through.
                      // __sgVfs is NOT in this check — we must NOT skip relative
                      // paths even if we already loaded this element once (slide navigation
                      // reuses the same <img> element with a new src each time).
                      'if(!val||' +
                         'val.startsWith("http")||val.startsWith("blob:")||' +
                         'val.startsWith("data:")||val.startsWith("//"))' +
                        '{_oset.call(this,val);return;}' +
                      'console.log("[sg-vfs] img.src intercepted:",val);' +
                      // Set __sgVfs to prevent the MutationObserver backup from
                      // double-processing while the async VFS fetch is in flight.
                      // It is cleared once the blob URL is applied (or on error).
                      'this.__sgVfs=true;' +
                      'var el=this;' +
                      '_vfsReq(val,function(d){' +
                        'el.__sgVfs=false;' +  // clear so future src changes are intercepted
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

                // ── MutationObserver backup (catches setAttribute calls) ───
                'function _loadImgAttr(img){' +
                  'if(img.__sgVfs)return;' +
                  'var src=img.getAttribute("src");' +
                  'if(!src||src.startsWith("http")||src.startsWith("blob:")||src.startsWith("data:"))return;' +
                  'img.src=src;' +  // triggers our overridden setter
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

                '})();' +
                '<\/script>';

            // Inject bridge as first child of <head> (or prepend if no <head>)
            var htmlForIframe = self.dataSource
                ? rawText.replace(/(<head[^>]*>)/i, '$1' + vfsBridgeScript)
                : rawText;
            if (self.dataSource && htmlForIframe === rawText) {
                htmlForIframe = vfsBridgeScript + rawText;  // no <head> tag
            }

            var blob    = new Blob([htmlForIframe], { type: 'text/html' });
            var blobUrl = URL.createObjectURL(blob);
            this._objectUrls.push(blobUrl);

            var iframeEl = document.createElement('iframe');
            iframeEl.className = 'sb-file__html-frame';
            iframeEl.sandbox   = 'allow-scripts';
            iframeEl.src       = blobUrl;
            iframeEl.style.flex = '1';
            content.appendChild(iframeEl);

            // Set up parent-side VFS request handler
            console.log('[sg-vfs parent] HTML file opened:', fileName, '| dataSource:', self.dataSource ? 'YES' : 'NO (null)');
            if (self.dataSource) {
                var htmlDir  = fileName.includes('/') ? fileName.substring(0, fileName.lastIndexOf('/') + 1) : '';
                var fileList = self.dataSource.getFileList();
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
                    if (!e.data || !e.data.__sgVfsReq) return;
                    if (e.source !== iframeEl.contentWindow) return;

                    var msgId    = e.data.__sgVfsReq;
                    var reqUrl   = e.data.url;
                    var resolved = _resolvePath(htmlDir, reqUrl);
                    var match    = _findEntry(fileList, resolved);

                    console.log('[sg-vfs parent] request:', reqUrl, '→ resolved:', resolved, '→ match:', match ? match.path : 'NOT FOUND');

                    if (!match) {
                        console.warn('[sg-vfs parent] NOT FOUND in vault:', resolved, '(full fileList paths:', fileList.map(function(e){return e.path;}).join(', '), ')');
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
                            // buf not transferable (already detached) — send without transfer
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
            }

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
            presentBtn.innerHTML = '&#x26F6; Present';
            presentBtn.title = 'Open PDF in fullscreen presentation mode';
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

        // BRW-009: Save locally — re-generate clean zip via dataSource
        var saveBtn = this.querySelector('#sb-save-zip');
        if (saveBtn) saveBtn.addEventListener('click', async function() {
            if (self.dataSource && self.dataSource.getZipBlob) {
                try {
                    var zipBlob = await self.dataSource.getZipBlob();
                    var url = URL.createObjectURL(zipBlob);
                    var a = document.createElement('a');
                    a.href = url;
                    a.download = (self.dataSource.getOrigName ? self.dataSource.getOrigName() : null) || self.zipOrigName || 'archive.zip';
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    return;
                } catch (_) { /* fall through */ }
            }
            // Fallback: raw bytes
            if (self.zipOrigBytes) {
                var blob = new Blob([self.zipOrigBytes], { type: 'application/zip' });
                var url2 = URL.createObjectURL(blob);
                var a2 = document.createElement('a');
                a2.href = url2; a2.download = self.zipOrigName || 'archive.zip';
                document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
                URL.revokeObjectURL(url2);
            }
        });

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

// ─── Find entry by resolved path (BRW-011: URL decode, fuzzy matching) ──────
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
