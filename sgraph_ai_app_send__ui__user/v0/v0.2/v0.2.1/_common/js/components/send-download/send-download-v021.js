/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Download Component
   v0.2.1 — Surgical overrides on v0.2.0

   Changes:
     - Two-column split layout for zip viewer (replaces vertical stack)
     - Sticky zip header with folder icon and info toggle
     - Left rail with folder tree + file list (replaces zip-browser grid)
     - Maximise/theatre mode for preview panel
     - Markdown iframe switched to light theme (white bg, dark text)
     - SVG file type icons replacing emoji
     - Keyboard navigation (arrows, j/k, s to save)
     - Progress indicator ("X of Y files")
     - First-load hint with localStorage dismiss
     - Breadcrumb trail for subfolder navigation
     - Fullscreen API support

   v0.2.1b — Additional overrides:
     - Prominent loading state with spinner (replaces tiny status bar)
     - Page-level actions hidden during loading, shown after complete
     - Decryption link display with copy button (URL saved before hash clear)
     - Access key display with copy button for easy sharing
     - CTA replaced with subtle "Send a file or folder" button

   Loads AFTER v0.2.0 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ═══════════════════════════════════════════════════════════════════════════════ */

(function() {

// ─── Guard: v0.2.0 base must be loaded first ────────────────────────────────
if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v021] SendDownload base class not found — skipping overrides');
    return;
}

// ─── Store original methods for super-calling if needed ────────────────────
const _v020_setupEventListeners = SendDownload.prototype.setupEventListeners;
const _v020_cleanup             = SendDownload.prototype.cleanup;
const _v020_render              = SendDownload.prototype.render;
const _v020_renderLoading       = SendDownload.prototype.renderLoading;
const _v020_renderComplete      = SendDownload.prototype.renderComplete;
const _v020_startDownload       = SendDownload.prototype.startDownload;

// ─── Eagerly capture the original URL (before any hash clearing) ────────────
const _v020_connectedCallback = SendDownload.prototype.connectedCallback;
SendDownload.prototype.connectedCallback = function() {
    this._originalDownloadUrl = window.location.href;
    _v020_connectedCallback.call(this);
};

// ─── Override: render — show/hide page-level elements based on state ────────

SendDownload.prototype.render = function() {
    _v020_render.call(this);

    // Show/hide page-level actions and disclaimer
    const actions    = document.getElementById('download-actions');
    const disclaimer = document.getElementById('download-disclaimer');
    const showExtras = (this.state === 'complete' || this.state === 'ready' || this.state === 'error');
    if (actions)    actions.style.display    = showExtras ? '' : 'none';
    if (disclaimer) disclaimer.style.display = showExtras ? '' : 'none';

    // Fix "Send a file" link to use correct locale path
    const sendBtn = document.getElementById('send-new-btn');
    if (sendBtn) sendBtn.href = `${window.location.origin}/${typeof I18n !== 'undefined' ? I18n.locale : 'en-gb'}/`;
};

// ─── Override: renderLoading — prominent spinner during cold boot ────────────

SendDownload.prototype.renderLoading = function() {
    if (this.state !== 'loading') return '';
    return `
        <div style="text-align: center; padding: var(--space-8) var(--space-4);">
            <div style="display: inline-block; width: 40px; height: 40px; border: 3px solid var(--color-border); border-top-color: var(--accent); border-radius: 50%; animation: sg-spin 0.8s linear infinite; margin-bottom: var(--space-4);"></div>
            <div style="font-size: var(--text-body); color: var(--color-text); font-weight: var(--weight-semibold); margin-bottom: var(--space-2);">
                ${this.escapeHtml(this.t('download.loading'))}
            </div>
            <div style="font-size: var(--text-sm); color: var(--color-text-secondary);">
                Preparing your encrypted file for decryption...
            </div>
            <style>@keyframes sg-spin { to { transform: rotate(360deg); } }</style>
        </div>
    `;
};

// ─── Override: startDownload — save original URL before hash gets cleared ────

SendDownload.prototype.startDownload = async function(keyOverride) {
    // Capture the full download URL before v0.2.0 clears the hash fragment
    this._originalDownloadUrl = window.location.href;
    return _v020_startDownload.call(this, keyOverride);
};

// ─── New: _renderSharePanel — decryption link + access key ──────────────────

SendDownload.prototype._renderSharePanel = function() {
    const parts = [];

    // Decryption link (the URL the user arrived with)
    const downloadUrl = this._originalDownloadUrl;
    if (downloadUrl) {
        parts.push(`
            <div class="share-panel__item">
                <div class="share-panel__label">Download link</div>
                <div class="share-panel__row">
                    <input type="text" class="input share-panel__input" id="share-download-url" value="${this.escapeHtml(downloadUrl)}" readonly>
                    <button class="btn btn-sm btn-secondary" id="copy-download-url" title="Copy link">Copy</button>
                </div>
            </div>
        `);
    }

    // Access token value — from localStorage (masked by default)
    const accessToken = (() => {
        try { return localStorage.getItem('sgraph-send-access-token'); } catch(_) { return null; }
    })();
    if (accessToken) {
        const masked = '\u2022'.repeat(Math.min(accessToken.length, 20));
        parts.push(`
            <div class="share-panel__item">
                <div class="share-panel__label">Access token</div>
                <div class="share-panel__row">
                    <code class="share-panel__code" id="share-access-token" data-value="${this.escapeHtml(accessToken)}" data-masked="true">${masked}</code>
                    <button class="btn btn-sm btn-secondary" id="toggle-access-token" title="Show/hide token">Show</button>
                    <button class="btn btn-sm btn-secondary" id="copy-access-token" title="Copy access token">Copy</button>
                </div>
            </div>
        `);
    }

    if (parts.length === 0) return '';

    return `
        <div class="share-panel" id="share-panel">
            <div class="share-panel__header">Share</div>
            ${parts.join('')}
        </div>
    `;
};

// ─── Override: _renderZipLayout — two-column split ─────────────────────────

SendDownload.prototype._renderZipLayout = function(timingHtml, sendAnotherHtml) {
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

    // Save-entry button (only when a file is selected)
    const saveEntryHtml = this._currentEntryBytes
        ? `<button class="btn btn-sm btn-secondary" id="save-entry-btn" style="width: 100%; margin-top: var(--space-2);">${this.escapeHtml(this.t('download.zip.save_file'))}: ${this.escapeHtml(this._currentEntryFilename || '')}</button>`
        : '';

    // Progress indicator
    const selectedIndex = this._selectedZipPath
        ? allFiles.findIndex(f => f.path === this._selectedZipPath) + 1
        : 0;
    const progressHtml = selectedIndex > 0
        ? `<div class="zip-progress">${selectedIndex} of ${allFiles.length} files</div>`
        : '';

    // Breadcrumb trail
    const breadcrumbHtml = this._renderBreadcrumb(currentFolder);

    // First-load hint
    const hintShown = (() => { try { return localStorage.getItem('sgraph-zip-hint-shown'); } catch(_) { return null; } })();
    const hintHtml = !hintShown
        ? `<div class="zip-hint" id="zip-hint">Click any file to preview it. Use the folder tree to navigate. <button class="zip-hint__dismiss" id="zip-hint-dismiss">&times;</button></div>`
        : '';

    return `
        <div class="status status--success" style="font-size: var(--text-sm); padding: 0.5rem 0.75rem; margin-bottom: var(--space-3);">
            ${this.escapeHtml(this.t('download.result.file_success'))}
        </div>

        <div class="zip-header zip-header--sticky">
            <div class="zip-header__info">
                <span class="zip-header__folder-icon">&#128193;</span>
                <h3 class="zip-header__name">${this.escapeHtml(zipName)}</h3>
                <span class="zip-header__badge">zip</span>
                <span class="zip-header__size">${this.escapeHtml(sizeStr)}</span>
                <span class="zip-header__summary">${this.escapeHtml(summary)}</span>
            </div>
            <div class="zip-header__actions">
                <button class="btn btn-sm btn-secondary" id="zip-info-btn" title="Transfer details">&#9432;</button>
                <button class="btn btn-primary btn-sm" id="save-file-btn">${this.escapeHtml(this.t('download.zip.save_all'))}</button>
            </div>
        </div>

        ${hintHtml}

        <div id="preview-split" style="display: grid; grid-template-columns: ${savedWidth}px 4px 1fr; gap: 0; min-height: calc(100vh - 180px);">
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
                ${saveEntryHtml}
            </div>
            <div id="split-resize" style="cursor: col-resize; background: transparent; transition: background 0.15s; z-index: 10; border-radius: 2px;"></div>
            <div id="preview-panel" class="zip-preview zip-preview--split">
                <button id="maximise-btn" class="zip-maximise-btn" title="Toggle maximise">&#x26F6;</button>
                ${previewHtml}
            </div>
        </div>

        <div id="zip-info-panel" class="zip-info-panel" style="display: none;">
            <send-transparency id="transparency-panel"></send-transparency>
            ${timingHtml}
        </div>

        ${sendAnotherHtml}
    `;
};

// ─── Override: _renderMarkdownContent — light theme ────────────────────────

SendDownload.prototype._renderMarkdownContent = function() {
    if (this._showRaw) return this._renderRawContent();
    const rawText  = new TextDecoder().decode(this.decryptedBytes);
    const safeHtml = (typeof MarkdownParser !== 'undefined') ? MarkdownParser.parse(rawText) : this.escapeHtml(rawText);
    const iframeDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*,*::before,*::after{box-sizing:border-box}body{font-family:'DM Sans',system-ui,sans-serif;font-size:1rem;line-height:1.7;color:#1a1a1a;background:#FAFAFA;margin:0;padding:1.25rem;word-wrap:break-word}h1,h2,h3,h4,h5,h6{color:#111;margin:1.5em 0 .5em;line-height:1.3}h1{font-size:1.6rem;border-bottom:1px solid rgba(0,0,0,.1);padding-bottom:.3em}h2{font-size:1.35rem}h3{font-size:1.15rem}p{margin:.8em 0}a{color:#0066cc;text-decoration:none}a:hover{text-decoration:underline}code{font-family:'JetBrains Mono',monospace;font-size:.88em;background:rgba(0,0,0,.05);padding:.15em .4em;border-radius:4px;color:#d63384}pre{background:#f5f5f5;border:1px solid rgba(0,0,0,.1);border-radius:8px;padding:1em;overflow-x:auto;margin:1em 0}pre code{background:none;padding:0;color:#333;font-size:.85em}blockquote{border-left:3px solid #6c757d;margin:1em 0;padding:.5em 1em;background:rgba(0,0,0,.03);color:#555}ul,ol{padding-left:1.5em;margin:.8em 0}li{margin:.3em 0}hr{border:none;border-top:1px solid rgba(0,0,0,.1);margin:1.5em 0}table{border-collapse:collapse;width:100%;margin:1em 0}th,td{border:1px solid rgba(0,0,0,.1);padding:.5em .75em;text-align:left}th{background:rgba(0,0,0,.04);font-weight:600;color:#111}del{color:#999}strong{color:#111}</style></head><body>${safeHtml}</body></html>`;
    const blob = new Blob([iframeDoc], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    return `<iframe id="md-iframe" sandbox="allow-same-origin" style="width:100%;height:100%;border:none;background:#FAFAFA;display:block;" src="${blobUrl}" title="Rendered markdown"></iframe>`;
};

// ─── Override: _fileTypeIcon — SVG icons ───────────────────────────────────

SendDownload.prototype._fileTypeIcon = function(type) {
    const icons = {
        audio:    '<svg class="zip-icon zip-icon--audio" viewBox="0 0 16 16"><path d="M8 1v10.07A3 3 0 1 0 10 14V5h3V1H8z"/></svg>',
        video:    '<svg class="zip-icon zip-icon--video" viewBox="0 0 16 16"><path d="M1 3h10v10H1V3zm11 2l3-2v10l-3-2V5z"/></svg>',
        image:    '<svg class="zip-icon zip-icon--image" viewBox="0 0 16 16"><rect x="1" y="2" width="14" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="6" r="1.5"/><path d="M1 12l4-4 2 2 3-3 5 5H1z"/></svg>',
        pdf:      '<svg class="zip-icon zip-icon--pdf" viewBox="0 0 16 16"><path d="M4 1h6l4 4v10H4V1z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 1v4h4"/><text x="8" y="12" font-size="5" font-weight="bold" fill="currentColor" text-anchor="middle">P</text></svg>',
        markdown: '<svg class="zip-icon zip-icon--markdown" viewBox="0 0 16 16"><rect x="1" y="3" width="14" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 11V5l2.5 3L8 5v6m3-6v4l2-2m0 0l-2-2" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
        code:     '<svg class="zip-icon zip-icon--code" viewBox="0 0 16 16"><path d="M5 4L1 8l4 4M11 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    };
    return icons[type] || '<svg class="zip-icon" viewBox="0 0 16 16"><path d="M4 1h6l4 4v10H4V1z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 1v4h4"/></svg>';
};

// ─── New: _renderBreadcrumb ────────────────────────────────────────────────

SendDownload.prototype._renderBreadcrumb = function(folderPath) {
    if (!folderPath) return '';
    const parts = folderPath.replace(/\/$/, '').split('/');
    let html = '<div class="zip-breadcrumb">';
    html += `<span class="zip-breadcrumb__item" data-folder="">/</span>`;
    let accumulated = '';
    for (const part of parts) {
        accumulated += part + '/';
        html += ` <span class="zip-breadcrumb__sep">&rsaquo;</span> `;
        html += `<span class="zip-breadcrumb__item" data-folder="${this.escapeHtml(accumulated)}">${this.escapeHtml(part)}</span>`;
    }
    html += '</div>';
    return html;
};

// ─── New: _toggleMaximise ──────────────────────────────────────────────────

SendDownload.prototype._toggleMaximise = function() {
    const split    = this.querySelector('#preview-split');
    const leftRail = this.querySelector('#details-panel');
    const divider  = this.querySelector('#split-resize');

    if (!split) return;

    this._isMaximised = !this._isMaximised;

    if (this._isMaximised) {
        this._savedGridColumns = split.style.gridTemplateColumns;
        split.style.gridTemplateColumns = '0px 0px 1fr';
        if (leftRail) leftRail.style.display = 'none';
        if (divider)  divider.style.display  = 'none';
    } else {
        split.style.gridTemplateColumns = this._savedGridColumns || `${this._loadSplitWidth()}px 4px 1fr`;
        if (leftRail) leftRail.style.display = '';
        if (divider)  divider.style.display  = '';
    }

    const btn = this.querySelector('#maximise-btn');
    if (btn) btn.textContent = this._isMaximised ? '\u2716' : '\u26F6';
};

// ─── New: _enterFullscreen ─────────────────────────────────────────────────

SendDownload.prototype._enterFullscreen = function() {
    const panel = this.querySelector('#preview-panel');
    if (panel && panel.requestFullscreen) {
        panel.requestFullscreen();
    }
};

// ─── Override: _selectZipFolder — include breadcrumbs ──────────────────────

SendDownload.prototype._selectZipFolder = function(folderPath) {
    this._selectedZipFolder = folderPath;
    this.querySelectorAll('.zip-folder-item').forEach(el => {
        el.classList.toggle('zip-folder-item--selected', el.dataset.folder === folderPath);
    });
    const fileList = this.querySelector('#zip-file-list');
    if (fileList) {
        fileList.innerHTML = this._renderBreadcrumb(folderPath) + this._renderFileList(folderPath);
        fileList.querySelectorAll('.zip-file-item').forEach(el => {
            el.addEventListener('click', () => {
                const p = el.dataset.path;
                if (p) this._previewZipEntry(p);
            });
        });
        fileList.querySelectorAll('.zip-breadcrumb__item').forEach(el => {
            el.addEventListener('click', () => {
                const folder = el.dataset.folder;
                if (folder !== undefined) this._selectZipFolder(folder);
            });
        });
    }
};

// ─── Override: _previewZipEntry — add progress + left-rail save button ─────

SendDownload.prototype._previewZipEntry = async function(path) {
    const entry = this._zipTree.find(e => e.path === path && !e.dir);
    if (!entry) return;

    this._selectedZipPath      = path;
    const bytes = await entry.entry.async('arraybuffer');
    this._currentEntryBytes    = bytes;
    this._currentEntryFilename = entry.name;

    // Also select the folder this file is in
    const parts = path.split('/');
    this._selectedZipFolder = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '';

    // Update preview panel
    const previewPanel = this.querySelector('#preview-panel');
    if (previewPanel) {
        const savedBytes = this.decryptedBytes;
        const savedName  = this.fileName;
        this.decryptedBytes = bytes;
        this.fileName       = entry.name;

        const entryType = (typeof FileTypeDetect !== 'undefined') ? FileTypeDetect.detect(entry.name, null) : null;
        let html;
        if (entryType === 'pdf')           html = this._renderPdfContent();
        else if (entryType === 'image')    html = this._renderImageContent();
        else if (entryType === 'markdown') html = this._renderMarkdownContent();
        else if (entryType === 'code')     html = this._renderCodeContent();
        else if (entryType === 'audio')    html = this._renderAudioContent();
        else if (entryType === 'video')    html = this._renderVideoContent();
        else {
            try {
                const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
                html = `<pre style="height:100%;overflow:auto;margin:0;padding:var(--space-6);white-space:pre-wrap;word-wrap:break-word;font-family:var(--font-mono);font-size:0.85rem;line-height:1.6;color:var(--color-text);">${this.escapeHtml(text)}</pre>`;
            } catch (e) {
                html = `<div class="zip-preview__empty">${this.escapeHtml(this.t('download.zip.no_preview'))}</div>`;
            }
        }
        this.decryptedBytes = savedBytes;
        this.fileName       = savedName;

        // Preserve the maximise button
        const maxBtn = '<button id="maximise-btn" class="zip-maximise-btn" title="Toggle maximise">&#x26F6;</button>';
        previewPanel.innerHTML = maxBtn + html;

        // Re-attach maximise listener
        const newMaxBtn = previewPanel.querySelector('#maximise-btn');
        if (newMaxBtn) newMaxBtn.addEventListener('click', () => this._toggleMaximise());
    }

    // Update file list highlighting
    this.querySelectorAll('.zip-file-item').forEach(el => {
        el.classList.toggle('zip-file-item--selected', el.dataset.path === path);
    });

    // Update save-entry button
    const existing = this.querySelector('#save-entry-btn');
    if (existing) {
        existing.textContent = `${this.t('download.zip.save_file')}: ${entry.name}`;
    } else {
        const leftRail = this.querySelector('#details-panel.zip-left-rail');
        if (leftRail) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-sm btn-secondary';
            btn.id = 'save-entry-btn';
            btn.style.cssText = 'width: 100%; margin-top: var(--space-2);';
            btn.textContent = `${this.t('download.zip.save_file')}: ${entry.name}`;
            btn.addEventListener('click', () => this._saveCurrentEntry());
            leftRail.appendChild(btn);
        } else {
            const saveAll = this.querySelector('#save-file-btn');
            if (saveAll) {
                const btn = document.createElement('button');
                btn.className = 'btn btn-sm btn-secondary';
                btn.id = 'save-entry-btn';
                btn.textContent = `${this.t('download.zip.save_file')}: ${entry.name}`;
                btn.addEventListener('click', () => this._saveCurrentEntry());
                saveAll.insertAdjacentElement('afterend', btn);
            }
        }
    }

    // Update progress indicator
    const allFiles = this._zipTree.filter(f => !f.dir);
    const selectedIndex = allFiles.findIndex(f => f.path === path) + 1;
    const progressEl = this.querySelector('.zip-progress');
    if (progressEl) {
        progressEl.textContent = `${selectedIndex} of ${allFiles.length} files`;
    } else if (selectedIndex > 0) {
        const leftRail = this.querySelector('#details-panel.zip-left-rail');
        if (leftRail) {
            const div = document.createElement('div');
            div.className = 'zip-progress';
            div.textContent = `${selectedIndex} of ${allFiles.length} files`;
            const saveBtn = leftRail.querySelector('#save-entry-btn');
            if (saveBtn) leftRail.insertBefore(div, saveBtn);
            else leftRail.appendChild(div);
        }
    }
};

// ─── Override: setupEventListeners — add v0.2.1 listeners ──────────────────

SendDownload.prototype.setupEventListeners = function() {
    // Call v0.2.0's original listeners first
    _v020_setupEventListeners.call(this);

    // Inject share panel after complete render (into the card, before send-another)
    if (this.state === 'complete' && this._originalDownloadUrl) {
        const sharePanelHtml = this._renderSharePanel();
        if (sharePanelHtml) {
            // For zip layout: inject before the info panel
            const zipInfoPanel = this.querySelector('#zip-info-panel');
            if (zipInfoPanel) {
                zipInfoPanel.insertAdjacentHTML('beforebegin', sharePanelHtml);
            } else {
                // For two-column and text layouts: inject before the transparency panel or send-another link
                const transparency = this.querySelector('#transparency-panel');
                const card = this.querySelector('.card');
                if (transparency) {
                    transparency.insertAdjacentHTML('beforebegin', sharePanelHtml);
                } else if (card) {
                    card.insertAdjacentHTML('beforeend', sharePanelHtml);
                }
            }
        }
    }

    // Share panel copy buttons
    const copyUrlBtn = this.querySelector('#copy-download-url');
    if (copyUrlBtn) {
        copyUrlBtn.addEventListener('click', () => {
            const input = this.querySelector('#share-download-url');
            if (input) this.copyToClipboard(input.value, copyUrlBtn);
        });
    }
    const toggleTokenBtn = this.querySelector('#toggle-access-token');
    if (toggleTokenBtn) {
        toggleTokenBtn.addEventListener('click', () => {
            const code = this.querySelector('#share-access-token');
            if (!code) return;
            const isMasked = code.getAttribute('data-masked') === 'true';
            if (isMasked) {
                code.textContent = code.getAttribute('data-value');
                code.setAttribute('data-masked', 'false');
                toggleTokenBtn.textContent = 'Hide';
            } else {
                const val = code.getAttribute('data-value') || '';
                code.textContent = '\u2022'.repeat(Math.min(val.length, 20));
                code.setAttribute('data-masked', 'true');
                toggleTokenBtn.textContent = 'Show';
            }
        });
    }
    const copyAccessBtn = this.querySelector('#copy-access-token');
    if (copyAccessBtn) {
        copyAccessBtn.addEventListener('click', () => {
            const code = this.querySelector('#share-access-token');
            if (code) this.copyToClipboard(code.getAttribute('data-value') || code.textContent, copyAccessBtn);
        });
    }

    // Info panel toggle (transparency + timing)
    const infoBtn   = this.querySelector('#zip-info-btn');
    const infoPanel = this.querySelector('#zip-info-panel');
    if (infoBtn && infoPanel) {
        infoBtn.addEventListener('click', () => {
            const visible = infoPanel.style.display !== 'none';
            infoPanel.style.display = visible ? 'none' : 'block';
            infoBtn.classList.toggle('btn--active', !visible);
        });
    }

    // Maximise toggle
    const maxBtn = this.querySelector('#maximise-btn');
    if (maxBtn) maxBtn.addEventListener('click', () => this._toggleMaximise());

    // Escape exits maximised mode
    if (this._zipTree && !this._escapeHandler) {
        this._escapeHandler = (e) => {
            if (e.key === 'Escape' && this._isMaximised) {
                this._toggleMaximise();
            }
        };
        document.addEventListener('keydown', this._escapeHandler);
    }

    // Keyboard navigation for zip file list
    if (this._zipTree && !this._keyNavHandler) {
        this._keyNavHandler = (e) => {
            if (!this._zipTree) return;
            const files = this._zipTree.filter(f => !f.dir);
            if (files.length === 0) return;

            const currentIdx = this._selectedZipPath
                ? files.findIndex(f => f.path === this._selectedZipPath)
                : -1;

            if (e.key === 'ArrowDown' || e.key === 'j') {
                e.preventDefault();
                const next = Math.min(currentIdx + 1, files.length - 1);
                this._previewZipEntry(files[next].path);
            } else if (e.key === 'ArrowUp' || e.key === 'k') {
                e.preventDefault();
                const prev = Math.max(currentIdx - 1, 0);
                this._previewZipEntry(files[prev].path);
            } else if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
                if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    this._saveCurrentEntry();
                }
            }
        };
        document.addEventListener('keydown', this._keyNavHandler);
    }

    // Hint dismiss
    const hintDismiss = this.querySelector('#zip-hint-dismiss');
    if (hintDismiss) {
        hintDismiss.addEventListener('click', () => {
            try { localStorage.setItem('sgraph-zip-hint-shown', '1'); } catch(_) {}
            const hint = this.querySelector('#zip-hint');
            if (hint) hint.remove();
        });
    }

    // Breadcrumb navigation
    this.querySelectorAll('.zip-breadcrumb__item').forEach(el => {
        el.addEventListener('click', () => {
            const folder = el.dataset.folder;
            if (folder !== undefined) this._selectZipFolder(folder);
        });
    });
};

// ─── Override: cleanup — clean up v0.2.1 handlers ──────────────────────────

SendDownload.prototype.cleanup = function() {
    if (this._escapeHandler) { document.removeEventListener('keydown', this._escapeHandler); this._escapeHandler = null; }
    if (this._keyNavHandler) { document.removeEventListener('keydown', this._keyNavHandler); this._keyNavHandler = null; }
    // Call v0.2.0's original cleanup
    _v020_cleanup.call(this);
};

})();
