/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Download Component
   v0.2.2 — Surgical overrides on v0.2.1 + v0.2.0

   Changes:
     - Viewport-locked layout (no page scroll on download page)
     - Manual transfer ID + key entry form when no ID in URL
     - Compact header: single-line status + file info merged
     - Command strip + tabs ABOVE the document view area
     - Tab system for multiple open documents (like terminal tabs)
     - Share tab auto-opens on load
     - Deduplicated Save Zip (command strip only, no header button)

   Loads AFTER v0.2.1 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ═══════════════════════════════════════════════════════════════════════════════ */

(function() {

// ─── Guard: v0.2.1 must be loaded (which implies v0.2.0) ────────────────────
if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v022] SendDownload base class not found — skipping overrides');
    return;
}

// ─── Store v0.2.1 methods we override ────────────────────────────────────────
const _v021_render              = SendDownload.prototype.render;
const _v021_renderZipLayout     = SendDownload.prototype._renderZipLayout;
const _v021_setupEventListeners = SendDownload.prototype.setupEventListeners;
const _v021_previewZipEntry     = SendDownload.prototype._previewZipEntry;
const _v021_cleanup             = SendDownload.prototype.cleanup;
const _v021_renderError         = SendDownload.prototype.renderError;

// ─── Tab state ───────────────────────────────────────────────────────────────
// Each tab: { id, label, path, type:'file'|'share'|'info', content:null }

SendDownload.prototype._v022_initTabs = function() {
    if (this._tabs) return;
    this._tabs = [];
    this._activeTabId = null;
    this._tabCounter = 0;
};

SendDownload.prototype._v022_createTab = function(label, path, type) {
    this._v022_initTabs();

    // If a tab for this path already exists, activate it
    const existing = this._tabs.find(t => t.path === path && t.type === type);
    if (existing) {
        this._v022_activateTab(existing.id);
        return existing;
    }

    const tab = {
        id:    'tab-' + (++this._tabCounter),
        label: label,
        path:  path,
        type:  type,
    };
    this._tabs.push(tab);
    this._activeTabId = tab.id;
    this._v022_renderTabs();
    return tab;
};

SendDownload.prototype._v022_closeTab = function(tabId) {
    const idx = this._tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;
    this._tabs.splice(idx, 1);

    if (this._activeTabId === tabId) {
        // Activate the previous tab, or the first, or none
        if (this._tabs.length > 0) {
            const newIdx = Math.min(idx, this._tabs.length - 1);
            this._activeTabId = this._tabs[newIdx].id;
            this._v022_showActiveTabContent();
        } else {
            this._activeTabId = null;
            // Show default preview
            const preview = this.querySelector('#preview-panel');
            if (preview) {
                const maxBtn = '<button id="maximise-btn" class="zip-maximise-btn" title="Toggle maximise">&#x26F6;</button>';
                preview.innerHTML = maxBtn + this._renderZipPreview();
            }
        }
    }
    this._v022_renderTabs();
};

SendDownload.prototype._v022_activateTab = function(tabId) {
    this._activeTabId = tabId;
    this._v022_renderTabs();
    this._v022_showActiveTabContent();
};

SendDownload.prototype._v022_showActiveTabContent = function() {
    const tab = this._tabs.find(t => t.id === this._activeTabId);
    if (!tab) return;

    if (tab.type === 'file') {
        // Re-preview this file
        this._v022_previewingViaTab = true;
        _v021_previewZipEntry.call(this, tab.path);
        this._v022_previewingViaTab = false;
    } else if (tab.type === 'share') {
        const preview = this.querySelector('#preview-panel');
        if (preview) {
            const maxBtn = '<button id="maximise-btn" class="zip-maximise-btn" title="Toggle maximise">&#x26F6;</button>';
            const shareHtml = this._renderSharePanel ? this._renderSharePanel() : '';
            preview.innerHTML = maxBtn + `<div style="padding: var(--space-6); overflow: auto; height: 100%;">${shareHtml}</div>`;
            const newMaxBtn = preview.querySelector('#maximise-btn');
            if (newMaxBtn) newMaxBtn.addEventListener('click', () => this._toggleMaximise());
            this._v022_wireShareCopyButtons();
        }
    } else if (tab.type === 'info') {
        const preview = this.querySelector('#preview-panel');
        if (preview) {
            const maxBtn = '<button id="maximise-btn" class="zip-maximise-btn" title="Toggle maximise">&#x26F6;</button>';
            preview.innerHTML = maxBtn + `<div style="padding: var(--space-6); overflow: auto; height: 100%;"><send-transparency id="transparency-panel"></send-transparency></div>`;
            const newMaxBtn = preview.querySelector('#maximise-btn');
            if (newMaxBtn) newMaxBtn.addEventListener('click', () => this._toggleMaximise());
            // Populate transparency data
            const tp = preview.querySelector('#transparency-panel');
            if (tp && tp.setTransferInfo && this.transferInfo) {
                tp.setTransferInfo(this.transferInfo);
            }
        }
    }
    this._v022_updateCommandStrip();
};

SendDownload.prototype._v022_renderTabs = function() {
    const tabBar = this.querySelector('#v022-tab-bar');
    if (!tabBar) return;

    let html = '';
    for (const tab of this._tabs) {
        const active = tab.id === this._activeTabId ? ' v022-tab--active' : '';
        const label = tab.label.length > 25 ? tab.label.substring(0, 22) + '...' : tab.label;
        html += `<div class="v022-tab${active}" data-tab-id="${tab.id}">
            <span class="v022-tab__label" title="${this.escapeHtml(tab.label)}">${this.escapeHtml(label)}</span>
            <button class="v022-tab__close" data-tab-close="${tab.id}" title="Close tab">&times;</button>
        </div>`;
    }

    tabBar.innerHTML = html;

    // Wire tab click handlers
    tabBar.querySelectorAll('.v022-tab').forEach(el => {
        const tabId = el.dataset.tabId;
        el.querySelector('.v022-tab__label').addEventListener('click', () => this._v022_activateTab(tabId));
        el.querySelector('.v022-tab__close').addEventListener('click', (e) => {
            e.stopPropagation();
            this._v022_closeTab(tabId);
        });
    });
};

SendDownload.prototype._v022_wireShareCopyButtons = function() {
    const copyUrlBtn = this.querySelector('#copy-download-url');
    if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', () => {
            const input = this.querySelector('#share-download-url');
            if (input) this.copyToClipboard(input.value, copyUrlBtn);
        });
    }
    const copyTokenBtn = this.querySelector('#copy-token-name');
    if (copyTokenBtn) {
        copyTokenBtn.addEventListener('click', () => {
            const code = this.querySelector('#share-token-name');
            if (code) this.copyToClipboard(code.textContent, copyTokenBtn);
        });
    }
    const copyAccessBtn = this.querySelector('#copy-access-token');
    if (copyAccessBtn) {
        copyAccessBtn.addEventListener('click', () => {
            const code = this.querySelector('#share-access-token');
            if (code) this.copyToClipboard(code.textContent, copyAccessBtn);
        });
    }
};

SendDownload.prototype._v022_updateCommandStrip = function() {
    const saveFileBtn = this.querySelector('#v022-cmd-save-file');
    if (!saveFileBtn) return;

    const tab = this._tabs.find(t => t.id === this._activeTabId);
    if (tab && tab.type === 'file' && this._currentEntryFilename) {
        saveFileBtn.disabled = false;
        saveFileBtn.textContent = 'Save File';
        saveFileBtn.title = `Save ${this._currentEntryFilename}`;
    } else {
        saveFileBtn.disabled = true;
        saveFileBtn.textContent = 'Save File';
        saveFileBtn.title = 'Select a file to save';
    }
};

// ─── Override: renderError — manual entry form when no transfer ID ───────────

SendDownload.prototype.renderError = function() {
    if (this.state !== 'error' || !this.errorMessage) return '';

    // Check if this is the "no transfer ID" error — offer manual entry
    const isNoId = !this.transferId;
    if (isNoId) {
        return `
            <div class="v022-manual-entry">
                <div class="v022-manual-entry__header">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #4ECDC4)" stroke-width="1.5" stroke-linecap="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    <h2>Download & Decrypt</h2>
                </div>
                <p class="v022-manual-entry__desc">Enter the file ID and decryption key from your share link to download and decrypt a file.</p>

                <div class="v022-manual-entry__field">
                    <label for="v022-manual-link">Share link or file ID</label>
                    <input type="text" id="v022-manual-link" class="input" placeholder="d6a1c7da620d/F5w9JGdaqA1vh1fgZ77W0GMKWZu3GuUaIimuNInrbJE  or full URL" autocomplete="off" spellcheck="false">
                    <div class="v022-manual-entry__hint">Paste the full download link, or just the <code>fileId/key</code> part</div>
                </div>

                <div class="v022-manual-entry__field">
                    <label for="v022-manual-token">Access key <span class="v022-manual-entry__optional">(optional)</span></label>
                    <input type="text" id="v022-manual-token" class="input" placeholder="e.g. owasp" autocomplete="off" spellcheck="false">
                </div>

                <button class="btn btn-primary" id="v022-manual-go" style="width: 100%;">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg>
                    Download & Decrypt
                </button>

                <div id="v022-manual-error" class="v022-manual-entry__error" style="display: none;"></div>
            </div>
        `;
    }

    // For other errors, use the original
    return _v021_renderError.call(this);
};

// ─── Override: render — lock viewport on download page ──────────────────────

SendDownload.prototype.render = function() {
    _v021_render.call(this);

    // Only apply viewport lock when showing zip layout
    if (this.state === 'complete' && this._zipTree) {
        document.body.classList.add('v022-viewport-lock');
        // Hide page-level actions/disclaimer — they're replaced by command strip
        const actions    = document.getElementById('download-actions');
        const disclaimer = document.getElementById('download-disclaimer');
        if (actions)    actions.style.display    = 'none';
        if (disclaimer) disclaimer.style.display = 'none';
    } else {
        document.body.classList.remove('v022-viewport-lock');
    }
};

// ─── Override: _renderZipLayout — viewport-locked with tabs + command strip ──

SendDownload.prototype._renderZipLayout = function(timingHtml, sendAnotherHtml) {
    this._v022_initTabs();

    const zipName    = this._zipOrigName || 'archive.zip';
    const sizeStr    = this.transferInfo ? this.formatBytes(this.transferInfo.file_size_bytes) : '';
    const allFiles   = this._zipTree.filter(e => !e.dir);
    const allFolders = this._zipTree.filter(e => e.dir);
    const summary    = this.t('download.zip.summary', { files: allFiles.length, folders: allFolders.length });

    const folderStructure = this._buildFolderStructure();
    const currentFolder   = this._selectedZipFolder || '';
    const folderTreeHtml  = this._renderFolderTree(folderStructure, currentFolder);
    const fileListHtml    = this._renderFileList(currentFolder);
    const previewHtml     = this._renderZipPreview();
    const savedWidth      = this._loadSplitWidth();

    // Breadcrumb trail
    const breadcrumbHtml = this._renderBreadcrumb(currentFolder);

    // Progress indicator
    const selectedIndex = this._selectedZipPath
        ? allFiles.findIndex(f => f.path === this._selectedZipPath) + 1
        : 0;
    const progressHtml = selectedIndex > 0
        ? `<div class="zip-progress">${selectedIndex} of ${allFiles.length} files</div>`
        : '';

    return `
        <div class="v022-layout">
            <div class="v022-compact-header">
                <div class="v022-compact-header__left">
                    <span class="v022-compact-header__icon">&#128193;</span>
                    <span class="v022-compact-header__name">${this.escapeHtml(zipName)}</span>
                    <span class="zip-header__badge">zip</span>
                    <span class="v022-compact-header__meta">${this.escapeHtml(sizeStr)} &middot; ${this.escapeHtml(summary)}</span>
                    <span class="v022-compact-header__status">&check; Decrypted</span>
                </div>
                <div class="v022-compact-header__right">
                    <button class="btn btn-sm btn-secondary" id="zip-info-btn" title="Transfer details">&#9432;</button>
                </div>
            </div>

            <div class="v022-command-strip">
                <div class="v022-command-strip__left">
                    <button class="btn btn-sm btn-primary" id="v022-cmd-save-zip" title="Download the full zip file">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg>
                        Save Zip
                    </button>
                    <button class="btn btn-sm btn-secondary" id="v022-cmd-save-file" disabled title="Select a file to save">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 1h6l4 4v10H4V1z"/><path d="M10 1v4h4"/></svg>
                        Save File
                    </button>
                    <span class="v022-command-strip__divider"></span>
                    <button class="btn btn-sm btn-secondary v022-cmd--disabled" disabled title="Coming soon">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 13l9-9M12 4l-1.5-1.5"/></svg>
                        Edit
                    </button>
                    <button class="btn btn-sm btn-secondary v022-cmd--disabled" disabled title="Coming soon">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4h8M4 8h5M4 12h8"/></svg>
                        Rename
                    </button>
                    <button class="btn btn-sm btn-secondary v022-cmd--disabled" disabled title="Coming soon">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5h10M5 5V3h6v2M6 8v4M10 8v4"/></svg>
                        Delete
                    </button>
                </div>
                <div class="v022-command-strip__right">
                    <button class="btn btn-sm btn-secondary" id="v022-cmd-share" title="Show share link">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="4" r="2"/><circle cx="4" cy="8" r="2"/><circle cx="12" cy="12" r="2"/><path d="M6 9l4 2M6 7l4-2"/></svg>
                        Share
                    </button>
                </div>
            </div>

            <div class="v022-tab-bar" id="v022-tab-bar"></div>

            <div class="v022-main-content">
                <div id="preview-split" style="display: grid; grid-template-columns: ${savedWidth}px 4px 1fr; gap: 0; height: 100%;">
                    <div id="details-panel" class="zip-left-rail">
                        <div class="zip-left-rail__folders" id="zip-folder-tree">
                            ${folderTreeHtml}
                        </div>
                        <div class="zip-left-rail__divider"></div>
                        <div class="zip-left-rail__files" id="zip-file-list">
                            ${breadcrumbHtml}
                            ${fileListHtml}
                        </div>
                        ${progressHtml}
                    </div>
                    <div id="split-resize" style="cursor: col-resize; background: transparent; transition: background 0.15s; z-index: 10; border-radius: 2px;"></div>
                    <div id="preview-panel" class="zip-preview zip-preview--split" style="min-height: 0;">
                        <button id="maximise-btn" class="zip-maximise-btn" title="Toggle maximise">&#x26F6;</button>
                        ${previewHtml}
                    </div>
                </div>
            </div>
        </div>

        <div id="zip-info-panel" class="zip-info-panel" style="display: none;">
            <send-transparency id="transparency-panel"></send-transparency>
            ${timingHtml}
        </div>

        <div id="save-file-btn" style="display:none;"></div>
    `;
};

// ─── Override: _previewZipEntry — open file in a tab ─────────────────────────

SendDownload.prototype._previewZipEntry = async function(path) {
    this._v022_initTabs();

    // Create/activate a tab for this file (unless we're being called from tab switch)
    if (!this._v022_previewingViaTab) {
        const entry = this._zipTree.find(e => e.path === path && !e.dir);
        if (entry) {
            this._v022_createTab(entry.name, path, 'file');
        }
    }

    // Call v0.2.1's preview logic
    await _v021_previewZipEntry.call(this, path);

    // Update command strip state
    this._v022_updateCommandStrip();
};

// ─── Override: setupEventListeners — wire command strip + tabs + manual entry ─

SendDownload.prototype.setupEventListeners = function() {
    _v021_setupEventListeners.call(this);

    // ─── Manual entry form (error state with no transfer ID) ────────────
    const manualGoBtn = this.querySelector('#v022-manual-go');
    if (manualGoBtn) {
        const handleManualGo = () => {
            const linkInput  = this.querySelector('#v022-manual-link');
            const tokenInput = this.querySelector('#v022-manual-token');
            const errorDiv   = this.querySelector('#v022-manual-error');
            if (!linkInput) return;

            let raw = linkInput.value.trim();
            if (!raw) {
                if (errorDiv) { errorDiv.textContent = 'Please enter a file ID or share link.'; errorDiv.style.display = ''; }
                return;
            }

            // Parse: could be a full URL or just "fileId/key"
            let fileId = null, key = null;
            try {
                // Try parsing as URL first
                if (raw.startsWith('http')) {
                    const url = new URL(raw);
                    const hash = url.hash.substring(1);
                    if (hash) {
                        const slashIdx = hash.indexOf('/');
                        if (slashIdx > 0) { fileId = hash.substring(0, slashIdx); key = hash.substring(slashIdx + 1); }
                        else { fileId = hash; }
                    }
                }
            } catch(_) {}

            // If not a URL, try "fileId/key" format
            if (!fileId) {
                // Strip any leading # or /
                raw = raw.replace(/^[#/]+/, '');
                const slashIdx = raw.indexOf('/');
                if (slashIdx > 0) {
                    fileId = raw.substring(0, slashIdx);
                    key    = raw.substring(slashIdx + 1);
                } else {
                    fileId = raw;
                }
            }

            if (!fileId) {
                if (errorDiv) { errorDiv.textContent = 'Could not parse a file ID. Check the format.'; errorDiv.style.display = ''; }
                return;
            }

            // Build the download URL and navigate
            const token = tokenInput ? tokenInput.value.trim() : '';
            let newUrl = `${window.location.origin}${window.location.pathname}`;
            if (token) newUrl += `?token=${encodeURIComponent(token)}`;
            newUrl += `#${fileId}`;
            if (key) newUrl += `/${key}`;
            window.location.href = newUrl;
        };

        manualGoBtn.addEventListener('click', handleManualGo);

        // Also handle Enter key in inputs
        const linkInput = this.querySelector('#v022-manual-link');
        const tokenInput = this.querySelector('#v022-manual-token');
        if (linkInput)  linkInput.addEventListener('keydown',  (e) => { if (e.key === 'Enter') handleManualGo(); });
        if (tokenInput) tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleManualGo(); });

        // Focus the link input
        if (linkInput) linkInput.focus();
        return; // Don't wire zip-specific listeners
    }

    if (this.state !== 'complete' || !this._zipTree) return;

    // ─── Command strip: Save Zip ───────────────────────────────────────
    const saveZipBtn = this.querySelector('#v022-cmd-save-zip');
    if (saveZipBtn) {
        saveZipBtn.addEventListener('click', () => {
            // Trigger the hidden save-file-btn's logic directly
            if (this._zipOrigBytes) {
                const blob = new Blob([this._zipOrigBytes], { type: 'application/zip' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = this._zipOrigName || 'archive.zip';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        });
    }

    // ─── Command strip: Save File ──────────────────────────────────────
    const saveFileBtn = this.querySelector('#v022-cmd-save-file');
    if (saveFileBtn) {
        saveFileBtn.addEventListener('click', () => {
            if (this._currentEntryBytes) this._saveCurrentEntry();
        });
    }

    // ─── Command strip: Share ──────────────────────────────────────────
    const shareBtn = this.querySelector('#v022-cmd-share');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            this._v022_createTab('Share', '__share__', 'share');
        });
    }

    // ─── Remove injected share panel from below the viewer ─────────────
    // (v0.2.1 injects it — we move it into a tab instead)
    const injectedShare = this.querySelector('.share-panel');
    if (injectedShare) injectedShare.remove();

    // ─── Remove v0.2.1's save-entry button (we have command strip) ─────
    const saveEntryBtn = this.querySelector('#save-entry-btn');
    if (saveEntryBtn) saveEntryBtn.remove();

    // ─── Auto-open Share tab + first file tab on load ───────────────────
    if (this._tabs.length === 0) {
        // Open first file in a tab
        if (this._selectedZipPath) {
            const entry = this._zipTree.find(e => e.path === this._selectedZipPath && !e.dir);
            if (entry) {
                this._v022_createTab(entry.name, this._selectedZipPath, 'file');
            }
        }
        // Auto-open Share tab
        this._v022_createTab('Share', '__share__', 'share');
    }
};

// ─── Override: cleanup — no extra state to clean ────────────────────────────

SendDownload.prototype.cleanup = function() {
    document.body.classList.remove('v022-viewport-lock');
    _v021_cleanup.call(this);
};

})();
