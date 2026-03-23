/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Browse Component v0.3.0 (extends SendComponent)
   Folder tree + tabbed file preview using sg-layout

   Uses sg-layout for:
     - Left panel:  folder tree (locked, ~20% width)
     - Right panel: tabbed file previews (tabs added on click)

   Zero dependency on v0.1.x / v0.2.x overlay chain.
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendBrowse extends SendComponent {

    /** Light DOM — CSS goes to document.head. No HTML template — dynamic render. */
    static useShadow   = false;
    static useTemplate = false;

    constructor() {
        super();
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
        if (this.zipTree) this._build();
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this._objectUrls.forEach(u => URL.revokeObjectURL(u));
        this._objectUrls = [];
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
        this.innerHTML = `
            <div class="sb-container">
                <div class="sb-header">
                    <div class="sb-header__left">
                        <span class="sb-header__icon">${SendIcons.FOLDER}</span>
                        <span class="sb-header__name">${SendHelpers.escapeHtml(this.fileName || 'Archive')}</span>
                        <span class="sb-header__meta">${SendHelpers.formatBytes(this.zipOrigBytes ? this.zipOrigBytes.byteLength : 0)}</span>
                        <span class="sb-header__status">&#10003; Decrypted</span>
                    </div>
                    <div class="sb-header__right">
                        <button class="sb-action-btn" id="sb-copy-link">${SendIcons.LINK_SM} Copy Link</button>
                        <button class="sb-action-btn" id="sb-email">${SendIcons.MAIL || '✉'}</button>
                        <button class="sb-action-btn" id="sb-print">${SendIcons.PRINT || '🖨️'}</button>
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
                            { type: 'tab', id: 't-share', title: 'Share', tag: 'div', state: {} },
                            { type: 'tab', id: 't-info',  title: 'Info',  tag: 'div', state: {} }
                        ]
                    }
                ]
            });

            requestAnimationFrame(() => {
                this._populateTree();
                this._populateShareTab();
                this._populateInfoTab();
                this._autoOpenFirstFile();
                this._setupKeyboard();
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
        const root = { name: '', children: {}, files: [] };
        const files = this.zipTree.filter(e => !e.dir);

        for (const file of files) {
            const parts = file.path.split('/');
            let node = root;
            for (let i = 0; i < parts.length - 1; i++) {
                if (!node.children[parts[i]]) {
                    node.children[parts[i]] = { name: parts[i], children: {}, files: [] };
                }
                node = node.children[parts[i]];
            }
            node.files.push(file);
        }
        return root;
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

        // Files
        for (const file of node.files) {
            const type = typeof FileTypeDetect !== 'undefined' ? FileTypeDetect.detect(file.name, null) : null;
            const icon = SendBrowse.FILE_ICONS[type] || SendBrowse.FILE_ICONS.other;
            html += `
                <div class="sb-tree__file" data-path="${SendHelpers.escapeHtml(file.path)}">
                    <span class="sb-tree__file-icon">${icon}</span>
                    <span class="sb-tree__file-name">${SendHelpers.escapeHtml(file.name)}</span>
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

        const files = this.zipTree.filter(e => !e.dir && !e.path.startsWith('_gallery.'));
        const url = this.downloadUrl || window.location.href;

        el.innerHTML = `
            <div class="sb-share">
                <h3 class="sb-share__title">Share this transfer</h3>
                <div class="sb-share__url-row">
                    <input type="text" class="sb-share__url" value="${SendHelpers.escapeHtml(url)}" readonly id="sb-share-url">
                    <button class="sb-action-btn" id="sb-share-copy">${SendIcons.LINK_SM} Copy</button>
                </div>
                <div class="sb-share__actions">
                    <button class="sb-action-btn" id="sb-share-email">${SendIcons.MAIL || '✉'} Email link</button>
                </div>
                <div class="sb-share__details">
                    <div class="sb-share__row"><span class="sb-share__label">Transfer ID</span><span class="sb-share__value">${SendHelpers.escapeHtml(this.transferId || '—')}</span></div>
                    <div class="sb-share__row"><span class="sb-share__label">Archive</span><span class="sb-share__value">${SendHelpers.escapeHtml(this.fileName || 'Unknown')}</span></div>
                    <div class="sb-share__row"><span class="sb-share__label">Size</span><span class="sb-share__value">${SendHelpers.formatBytes(this.zipOrigBytes ? this.zipOrigBytes.byteLength : 0)}</span></div>
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

        const files = this.zipTree.filter(e => !e.dir && !e.path.startsWith('_gallery.'));
        const folders = this.zipTree.filter(e => e.dir && !e.path.startsWith('_gallery.'));

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
                    <div class="sb-share__row"><span class="sb-share__label">Archive size</span><span class="sb-share__value">${SendHelpers.formatBytes(this.zipOrigBytes ? this.zipOrigBytes.byteLength : 0)}</span></div>
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

    _autoOpenFirstFile() {
        const files = this.zipTree.filter(e => !e.dir);
        // Prefer first root-level non-metadata file
        const root = files.find(f => !f.path.includes('/') && !f.name.startsWith('_') && !f.name.startsWith('.'));
        const first = root || files[0];
        if (first) this._openFileTab(first.path);
    }

    // ─── Keyboard Navigation (v0.2.1 parity) ────────────────────────────────

    _setupKeyboard() {
        this._boundKeyHandler = (e) => this._onKeydown(e);
        document.addEventListener('keydown', this._boundKeyHandler);
    }

    _onKeydown(e) {
        // Skip if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        var treeEl = this._sgLayout ? this._sgLayout.getPanelElement('t-tree') : null;
        if (!treeEl) return;

        var files = Array.from(treeEl.querySelectorAll('.sb-tree__file'));
        if (files.length === 0) return;

        var active = treeEl.querySelector('.sb-tree__file--active');
        var idx = active ? files.indexOf(active) : -1;

        if (e.key === 'j' || e.key === 'ArrowDown') {
            e.preventDefault();
            var next = Math.min(idx + 1, files.length - 1);
            files[next].click();
            files[next].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'k' || e.key === 'ArrowUp') {
            e.preventDefault();
            var prev = Math.max(idx - 1, 0);
            files[prev].click();
            files[prev].scrollIntoView({ block: 'nearest' });
        } else if (e.key === 's') {
            // Save current file
            var saveBtn = this.querySelector('.sb-file__save');
            if (saveBtn) saveBtn.click();
        }
    }

    // ─── Open File in Tab ───────────────────────────────────────────────────

    async _openFileTab(path) {
        if (!this._sgLayout) return;

        const entry = this.zipTree.find(e => e.path === path && !e.dir);
        if (!entry) return;

        // If tab already open for this path, focus it
        const existingId = this._openTabs.get(path);
        if (existingId) {
            const existingEl = this._sgLayout.getPanelElement(existingId);
            if (existingEl) {
                try { this._sgLayout.focusPanel(existingId); } catch (_) {}
                return;
            }
            // Tab was removed externally — clean up stale entry
            this._openTabs.delete(path);
        }

        // Ensure preview stack exists
        this._ensurePreviewStack();

        // Add tab
        const newId = this._sgLayout.addTabToStack('s-preview', {
            tag: 'div', title: entry.name, state: { path }
        }, true);

        if (!newId) return;
        this._openTabs.set(path, newId);

        requestAnimationFrame(async () => {
            const el = this._sgLayout.getPanelElement(newId);
            if (!el) return;
            el.style.cssText = 'display: flex; flex-direction: column; height: 100%; overflow: hidden;';
            el.innerHTML = '<div style="padding: 1rem; color: var(--color-text-secondary);">Loading...</div>';

            try {
                const bytes = await entry.entry.async('arraybuffer');
                const type = typeof FileTypeDetect !== 'undefined' ? FileTypeDetect.detect(entry.name, null) : null;
                this._renderFileContent(el, bytes, entry.name, type);
            } catch (err) {
                el.innerHTML = `<div style="padding: 1rem; color: var(--color-error, #e74c3c);">Failed to load: ${SendHelpers.escapeHtml(err.message)}</div>`;
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

    _renderFileContent(container, bytes, fileName, type) {
        container.innerHTML = '';

        // Action bar
        const bar = document.createElement('div');
        bar.className = 'sb-file__actions';
        bar.innerHTML = `
            <span class="sb-file__name">${SendHelpers.escapeHtml(fileName)}</span>
            <span class="sb-file__size">${SendHelpers.formatBytes(bytes.byteLength)}</span>
            <button class="sb-action-btn sb-file__save">${SendIcons.DOWNLOAD_SM} Save</button>
        `;
        container.appendChild(bar);

        bar.querySelector('.sb-file__save').addEventListener('click', () => {
            const blob = new Blob([bytes]);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = fileName;
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        // Content area
        const content = document.createElement('div');
        content.className = 'sb-file__content';
        container.appendChild(content);

        if (type === 'image') {
            const mime = FileTypeDetect.getImageMime(fileName) || 'image/jpeg';
            const blob = new Blob([bytes], { type: mime });
            const url = URL.createObjectURL(blob);
            this._objectUrls.push(url);
            content.innerHTML = `<img src="${url}" class="sb-file__image" alt="${SendHelpers.escapeHtml(fileName)}">`;

        } else if (type === 'markdown') {
            const text = new TextDecoder().decode(bytes);
            const html = typeof MarkdownParser !== 'undefined' ? MarkdownParser.parse(text) : SendHelpers.escapeHtml(text);
            content.innerHTML = `<div class="sb-file__markdown">${html}</div>`;

        } else if (type === 'pdf') {
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            this._objectUrls.push(url);
            content.innerHTML = `<iframe src="${url}" class="sb-file__pdf"></iframe>`;

        } else if (type === 'code' || type === 'text') {
            const text = new TextDecoder().decode(bytes);
            content.innerHTML = `<pre class="sb-file__code">${SendHelpers.escapeHtml(text)}</pre>`;

        } else if (type === 'audio') {
            const mime = typeof FileTypeDetect !== 'undefined' ? FileTypeDetect.getAudioMime(fileName) : 'audio/mpeg';
            const blob = new Blob([bytes], { type: mime });
            const url = URL.createObjectURL(blob);
            this._objectUrls.push(url);
            content.innerHTML = `<audio controls src="${url}" style="width: 100%; margin: 2rem 0;"></audio>`;

        } else if (type === 'video') {
            const mime = typeof FileTypeDetect !== 'undefined' ? FileTypeDetect.getVideoMime(fileName) : 'video/mp4';
            const blob = new Blob([bytes], { type: mime });
            const url = URL.createObjectURL(blob);
            this._objectUrls.push(url);
            content.innerHTML = `<video controls src="${url}" style="max-width: 100%; max-height: 80vh;"></video>`;

        } else {
            content.innerHTML = `
                <div style="padding: 2rem; text-align: center; color: var(--color-text-secondary);">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📄</div>
                    <p>No preview available for this file type.</p>
                    <p style="font-size: 0.8rem;">${SendHelpers.escapeHtml(fileName)} · ${SendHelpers.formatBytes(bytes.byteLength)}</p>
                </div>`;
        }
    }

    // ─── Header Listeners ───────────────────────────────────────────────────

    _setupHeaderListeners() {
        const saveBtn = this.querySelector('#sb-save-zip');
        if (saveBtn) saveBtn.addEventListener('click', () => {
            if (this.zipOrigBytes) {
                const blob = new Blob([this.zipOrigBytes]);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = this.zipOrigName || 'archive.zip';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        });

        const copyBtn = this.querySelector('#sb-copy-link');
        if (copyBtn) copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(this.downloadUrl || window.location.href);
                copyBtn.textContent = 'Copied!';
                setTimeout(() => { copyBtn.innerHTML = `${SendIcons.LINK_SM} Copy Link`; }, 2000);
            } catch (_) {}
        });

        const printBtn = this.querySelector('#sb-print');
        if (printBtn) printBtn.addEventListener('click', () => {
            // Print the current preview content
            var preview = this.querySelector('.sb-preview') || this.querySelector('#sb-layout');
            if (typeof SgPrint !== 'undefined' && SgPrint.print) {
                SgPrint.print(preview ? preview.innerHTML : '', this.fileName || 'File');
            } else {
                window.print();
            }
        });

        const emailBtn = this.querySelector('#sb-email');
        if (emailBtn) emailBtn.addEventListener('click', () => {
            var url = this.downloadUrl || window.location.href;
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

customElements.define('send-browse', SendBrowse);
