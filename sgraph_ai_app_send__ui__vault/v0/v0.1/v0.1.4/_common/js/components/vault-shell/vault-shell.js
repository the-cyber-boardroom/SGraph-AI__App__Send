/* =============================================================================
   SGraph Vault — Shell Component
   v0.1.4 — sg-layout integration for fractal window management

   Replaces the v0.1.3 hardcoded CSS grid (nav | sidebar | main | resize | debug)
   with <sg-layout> for the entire content area. The layout manages:
     - vault-tree-view (left, locked panel)
     - main content div (center — properties, preview, upload, share)
     - debug panels (right, added on demand via sg-layout API)

   The header, nav, and status bar remain as outer chrome.

   Design guidelines:
     - Avoid modal windows unless truly necessary (e.g. destructive confirm).
       Prefer inline panels, top-level views, or expanding sections.
     - Show visual loading indicators for all API requests to give feedback
       during cold starts or slow network conditions.

   Manages vault lifecycle: entry → browser → lock.
   ============================================================================= */

(function() {
    'use strict';

    class VaultShell extends HTMLElement {

        constructor() {
            super();
            this._vault         = null;
            this._vaultKey      = '';
            this._accessKey     = '';
            this._selectedFile  = null;
            this._currentPath   = '/';
            this._pendingUploadAction = null;
            this._activeView    = 'files';       // 'files' | 'settings'
            this._loadingCount  = 0;             // track concurrent API requests
            this._appVersion    = '';            // fetched from /api/health
            this._sgLayout      = null;          // reference to sg-layout element
            this._debugPanelId  = null;          // sg-layout panel id for debug
            this._loadPreferences();
        }

        connectedCallback() {
            this.render();
            this._setupListeners();
            this._setupMessageBadge();
            this._fetchAppVersion();
            this._setupLoadingHook();

            window.sgraphVault.shell = this;
            window.sgraphVault.events.emit('shell-ready', {});
        }

        disconnectedCallback() {
            if (this._badgeUnsub) this._badgeUnsub();
        }

        // --- Preferences --------------------------------------------------------

        _loadPreferences() {
            try {
                const raw = localStorage.getItem('sgraph-vault-prefs-v2');
                if (raw) {
                    const prefs = JSON.parse(raw);
                    if (prefs.layoutState) this._savedLayoutState = prefs.layoutState;
                }
            } catch (_) { /* ignore */ }
        }

        _savePreferences() {
            try {
                const prefs = {};
                if (this._sgLayout) {
                    prefs.layoutState = this._sgLayout.getLayout();
                }
                localStorage.setItem('sgraph-vault-prefs-v2', JSON.stringify(prefs));
            } catch (_) { /* ignore */ }
        }

        // --- Public API ---------------------------------------------------------

        openSidebar(tabId) {
            // With sg-layout, debug panels are regular panels.
            // Toggle the debug panel on, then switch to the requested tab.
            this._toggleDebugPanel();
            if (tabId) {
                window.sgraphVault.events.emit('debug-panel-requested', { tab: tabId });
            }
        }

        // --- App Version --------------------------------------------------------

        async _fetchAppVersion() {
            try {
                const origin = window.location.origin;
                const resp = await fetch(`${origin}/api/health`, { method: 'GET' });
                if (resp.ok) {
                    const data = await resp.json();
                    this._appVersion = data.version || '';
                    this._updateVersionDisplay();
                }
            } catch (_) {
                // Silently fail — version display will just show vault UI version
            }
        }

        _updateVersionDisplay() {
            const el = this.querySelector('.vs-header-version');
            if (!el) return;
            const build = window.SGRAPH_BUILD;
            if (build) {
                el.textContent = `${build.appVersion}  ·  UI ${build.uiVersion} (IFD)`;
            } else {
                const uiVersion = 'v0.1.4 (IFD)';
                el.textContent = this._appVersion
                    ? `${uiVersion} / ${this._appVersion}`
                    : uiVersion;
            }
        }

        // --- View Switching (nav) -----------------------------------------------

        _switchView(viewId) {
            this._activeView = viewId;

            const filesView    = this.querySelector('.vs-view-files');
            const settingsView = this.querySelector('.vs-view-settings');
            const sgitView     = this.querySelector('.vs-view-sgit');
            const layoutEl     = this.querySelector('.vs-layout-container');

            if (filesView)    filesView.style.display    = viewId === 'files' ? '' : 'none';
            if (settingsView) settingsView.style.display = viewId === 'settings' ? 'block' : 'none';
            if (sgitView)     sgitView.style.display     = viewId === 'sgit' ? 'block' : 'none';
            if (layoutEl)     layoutEl.style.display      = viewId === 'files' ? '' : 'none';

            // Update nav active state
            this.querySelectorAll('.vs-nav-item').forEach(item => {
                item.classList.toggle('vs-nav-item--active', item.dataset.view === viewId);
            });

            if (viewId === 'settings') this._populateSettings();
            if (viewId === 'sgit') this._populateSgitView();
        }

        _populateSettings() {
            if (!this._vault) return;

            const nameInput = this.querySelector('.vs-settings-name-input');
            if (nameInput) nameInput.value = this._vault.name || '';

            const keyInput = this.querySelector('.vs-settings-key-input');
            if (keyInput) keyInput.value = this._vaultKey;

            const accessInput = this.querySelector('.vs-settings-access-input');
            if (accessInput) accessInput.value = this._accessKey || '';

            const stats = this._vault.getStats();
            const statsEl = this.querySelector('.vs-settings-stats');
            if (statsEl) {
                statsEl.innerHTML = `
                    <div class="vs-stats-grid">
                        <span class="vs-stats-label">Files</span><span class="vs-stats-value">${stats.files}</span>
                        <span class="vs-stats-label">Folders</span><span class="vs-stats-value">${stats.folders}</span>
                        <span class="vs-stats-label">Total size</span><span class="vs-stats-value">${VaultHelpers.formatBytes(stats.totalSize)}</span>
                        <span class="vs-stats-label">Created</span><span class="vs-stats-value">${this._vault.created ? VaultHelpers.formatTimestamp(this._vault.created) : '--'}</span>
                    </div>
                `;
            }
        }

        // --- Loading Indicator --------------------------------------------------

        _setupLoadingHook() {
            const shell = this;
            const originalFetch = window.fetch.__vaultOriginal || window.fetch;

            const wrappedFetch = async function() {
                shell._showLoading();
                try {
                    return await originalFetch.apply(window, arguments);
                } finally {
                    shell._hideLoading();
                }
            };
            wrappedFetch.__vaultOriginal = originalFetch;
            window.fetch = wrappedFetch;
        }

        _showLoading() {
            this._loadingCount++;
            const bar = this.querySelector('.vs-loading-bar');
            if (bar) bar.style.display = '';
        }

        _hideLoading() {
            this._loadingCount = Math.max(0, this._loadingCount - 1);
            if (this._loadingCount === 0) {
                const bar = this.querySelector('.vs-loading-bar');
                if (bar) bar.style.display = 'none';
            }
        }

        // --- sg-layout setup ----------------------------------------------------

        _initLayout() {
            const layoutEl = this.querySelector('#vault-layout');
            if (!layoutEl) return;
            this._sgLayout = layoutEl;

            // Wait for sg-layout custom element to be defined (ES module loads async)
            customElements.whenDefined('sg-layout').then(() => {
                // Use setLayout() to define the full layout tree — files panel at 20% width
                // No default Preview tab — file tabs are added on demand when files are clicked
                layoutEl.setLayout({
                    type: 'row', id: 'root', sizes: [0.20, 0.80],
                    children: [
                        { type: 'stack', id: 's-files', activeTab: 0, tabs: [
                            { type: 'tab', id: 't-files', title: 'Files', tag: 'vault-tree-view', state: {}, locked: true }
                        ]},
                        { type: 'stack', id: 's-preview', activeTab: 0, tabs: [] }
                    ]
                });

                // Wait a frame for panels to render, then populate
                requestAnimationFrame(() => {
                    this._populateLayoutPanels();

                    // Listen for layout changes to save preferences
                    if (layoutEl.events) {
                        layoutEl.events.on('layout:changed', () => {
                            this._savePreferences();
                        });
                    }
                });
            });
        }

        _populateLayoutPanels() {
            if (!this._sgLayout) return;
            // Layout panels are populated on demand when files are clicked
        }

        // --- Tree View Finder (handles sg-layout panel hosting) ----------------

        _findTreeView() {
            // First try direct child (fallback)
            let tree = this.querySelector('vault-tree-view');
            if (tree) return tree;
            // Try sg-layout panel element
            if (this._sgLayout) {
                const el = this._sgLayout.getPanelElement('t-files');
                if (el && el.tagName === 'VAULT-TREE-VIEW') return el;
            }
            return null;
        }

        // --- Vault Lifecycle ----------------------------------------------------

        _onVaultOpened(vault, vaultKey, accessKey) {
            this._vault     = vault;
            this._vaultKey  = vaultKey;
            this._accessKey = accessKey || '';
            this._currentPath = '/';
            this._selectedFile = null;

            // Switch views
            this.querySelector('.vs-view-entry').style.display = 'none';
            this.querySelector('.vs-shell').style.display      = 'grid';

            // Update header
            this.querySelector('.vs-header-vault-name').textContent = vault.name || '';
            this.querySelector('.vs-lock-btn').style.display = '';

            // Wire tree (may be inside sg-layout shadow DOM or light DOM)
            const tree = this._findTreeView();
            if (tree) {
                tree.vault = vault;
                tree.refresh();
            }

            // Wire upload
            const uploader = this.querySelector('vault-upload');
            if (uploader) uploader.vault = vault;

            // Update status bar
            this._updateStatusBar();

            // Show read-only indicator if no access key
            const readOnlyBadge = this.querySelector('.vs-readonly-badge');
            if (readOnlyBadge) readOnlyBadge.style.display = this._accessKey ? 'none' : '';

            // Ensure we're on the files view
            this._switchView('files');

            window.sgraphVault.events.emit('vault-opened', { vaultName: vault.name });
            const mode = this._accessKey ? '' : ' (read-only)';
            window.sgraphVault.messages.success(`Vault "${vault.name}" opened${mode}`);
        }

        _onLock() {
            this._vault     = null;
            this._vaultKey  = '';
            this._accessKey = '';
            this._selectedFile = null;
            this._currentPath = '/';

            this.querySelector('.vs-shell').style.display       = 'none';
            this.querySelector('.vs-view-entry').style.display  = '';
            this.querySelector('.vs-header-vault-name').textContent = '';
            this.querySelector('.vs-lock-btn').style.display = 'none';

            // Hide upload panel
            const uploadPanel = this.querySelector('.vs-upload-panel');
            if (uploadPanel) uploadPanel.style.display = 'none';

            window.history.replaceState(null, '', window.location.pathname);
            try { localStorage.removeItem('sg-vault-key') } catch (_) { /* ignore */ }
            window.sgraphVault.events.emit('vault-locked', {});
        }

        // --- Refresh Vault from Server ------------------------------------------

        async _onRefreshVault() {
            if (!this._vaultKey) return;
            this._showLoading();
            try {
                const entry   = this.querySelector('vault-entry');
                const sgSend  = entry._getSGSend();
                const vault   = await SGVault.open(sgSend, this._vaultKey);
                this._vault   = vault;

                const tree = this._findTreeView();
                if (tree) { tree.vault = vault; tree.refresh(); }

                const uploader = this.querySelector('vault-upload');
                if (uploader) uploader.vault = vault;

                this._updateStatusBar();
                this._updateSettingsView();
                window.sgraphVault.messages.success('Vault refreshed');
            } catch (err) {
                window.sgraphVault.messages.error(`Refresh failed: ${err.message}`);
            } finally {
                this._hideLoading();
            }
        }

        // --- File Selection -----------------------------------------------------

        _onFileSelected(folderPath, fileName, fileEntry) {
            // Guard: if this is actually a folder, handle as folder selection instead
            // Detect folders by type OR by absence of blob_id (v2 compat)
            const isFolder = fileEntry && (fileEntry.type === 'folder' || (!fileEntry.blob_id && fileEntry.children));
            if (isFolder) {
                const path = folderPath === '/' ? '/' + fileName : folderPath + '/' + fileName;
                this._onFolderSelected(path);
                return;
            }

            this._selectedFile = { folderPath, fileName, ...fileEntry };
            this._currentPath  = folderPath;

            // Open file as a tab with inline actions (Rename/Download/Delete)
            this._openFileTab(folderPath, fileName, fileEntry);

            window.sgraphVault.events.emit('file-selected', { folderPath, fileName });
        }

        _openFileTab(folderPath, fileName, fileEntry) {
            if (!this._sgLayout) return;
            const tabId = `t-file-${folderPath.replace(/\//g, '-')}-${fileName}`.replace(/[^a-zA-Z0-9_-]/g, '_');

            // Check if tab already exists — just focus it
            const existing = this._sgLayout.getPanelElement(tabId);
            if (existing) {
                try { this._sgLayout.focusPanel(tabId); } catch (_) {}
                return;
            }

            // Add a new tab to the preview stack
            const newId = this._sgLayout.addTabToStack('s-preview', {
                tag: 'div', title: fileName, state: { folderPath, fileName }
            }, true);
            if (!newId) return;

            // Populate the tab with preview content after a frame
            requestAnimationFrame(async () => {
                const el = this._sgLayout.getPanelElement(newId);
                if (!el) return;
                el.className = 'vs-file-tab-content';
                el.innerHTML = '<div class="vs-file-tab-loading">Loading...</div>';

                try {
                    const data = await this._vault.getFile(folderPath, fileName);
                    const type = typeof FileTypeDetect !== 'undefined' ? FileTypeDetect.detect(fileName) : null;
                    this._renderFileInTab(el, data, fileName, type, folderPath, fileEntry);
                } catch (err) {
                    el.innerHTML = `<div class="vs-file-tab-error">Failed to load: ${this._escapeHtml(err.message)}</div>`;
                }
            });
        }

        _renderFileInTab(container, data, fileName, type, folderPath, fileEntry) {
            container.innerHTML = '';
            container.style.cssText = 'display:flex; flex-direction:column; height:100%; box-sizing:border-box; overflow:hidden;';

            const isEditable = type === 'text' || type === 'code' || type === 'markdown';
            let isEditing = false;

            // Action bar at top of tab
            const actionBar = document.createElement('div');
            actionBar.style.cssText = 'display:flex; align-items:center; gap:0.5rem; padding:0.5rem 1rem; border-bottom:1px solid var(--color-border); flex-shrink:0; background:var(--bg-surface);';

            const nameEl = document.createElement('span');
            nameEl.style.cssText = 'font-weight:600; font-size:var(--text-sm); color:var(--color-text); flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
            nameEl.textContent = fileName;
            if (fileEntry && fileEntry.size !== undefined) {
                nameEl.textContent += `  (${VaultHelpers.formatBytes(fileEntry.size || 0)})`;
            }
            actionBar.appendChild(nameEl);

            const makeBtn = (label, cls) => {
                const btn = document.createElement('button');
                btn.textContent = label;
                btn.className = cls || '';
                btn.style.cssText = 'font-size:var(--text-small); padding:0.2rem 0.5rem; border-radius:var(--radius-sm); border:1px solid var(--color-border); background:transparent; color:var(--color-text-secondary); cursor:pointer; font-family:var(--font-family);';
                return btn;
            };

            const rawBtn = makeBtn('raw');
            rawBtn.style.fontSize = '0.625rem';
            rawBtn.style.opacity = '0.6';
            rawBtn.addEventListener('click', () => {
                const path = (folderPath || '/') + (folderPath === '/' ? '' : '/') + fileName;
                this._showRawView({ path, type: 'file', name: fileName, entry: fileEntry, folderPath: folderPath || '/' });
            });
            actionBar.appendChild(rawBtn);

            // Edit / Save / Cancel buttons (only for text-editable files)
            let editBtn, saveBtn, cancelBtn;
            if (isEditable) {
                editBtn = makeBtn('Edit');
                editBtn.addEventListener('click', () => enterEditMode());
                actionBar.appendChild(editBtn);

                saveBtn = makeBtn('Save');
                saveBtn.style.cssText += 'display:none; color:var(--color-primary); border-color:var(--color-primary); font-weight:600;';
                saveBtn.addEventListener('click', () => saveEdit());
                actionBar.appendChild(saveBtn);

                cancelBtn = makeBtn('Cancel');
                cancelBtn.style.display = 'none';
                cancelBtn.addEventListener('click', () => exitEditMode());
                actionBar.appendChild(cancelBtn);
            }

            const renameBtn = makeBtn('Rename');
            renameBtn.addEventListener('click', () => {
                const newName = prompt('Rename to:', fileName);
                if (newName && newName !== fileName) {
                    this.dispatchEvent(new CustomEvent('file-rename-request', {
                        detail: { oldName: fileName, newName, folderPath: folderPath || this._currentPath },
                        bubbles: true, composed: true
                    }));
                }
            });
            actionBar.appendChild(renameBtn);

            const downloadBtn = makeBtn('Download');
            downloadBtn.style.color = 'var(--color-primary)';
            downloadBtn.style.borderColor = 'var(--color-primary)';
            downloadBtn.addEventListener('click', () => {
                const blob = new Blob([data]);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = fileName; a.click();
                URL.revokeObjectURL(url);
            });
            actionBar.appendChild(downloadBtn);

            const deleteBtn = makeBtn('Delete');
            deleteBtn.addEventListener('mouseenter', () => { deleteBtn.style.color = 'var(--color-error)'; deleteBtn.style.borderColor = 'var(--color-error)'; });
            deleteBtn.addEventListener('mouseleave', () => { deleteBtn.style.color = 'var(--color-text-secondary)'; deleteBtn.style.borderColor = 'var(--color-border)'; });
            deleteBtn.addEventListener('click', () => {
                if (confirm(`Delete "${fileName}"?`)) {
                    this.dispatchEvent(new CustomEvent('file-delete-request', {
                        detail: { fileName, folderPath: folderPath || this._currentPath },
                        bubbles: true, composed: true
                    }));
                }
            });
            actionBar.appendChild(deleteBtn);

            container.appendChild(actionBar);

            // Content area
            const content = document.createElement('div');
            content.style.cssText = 'flex:1; overflow:auto; padding:1rem;';

            // References for edit mode toggling
            let preEl = null;
            let textareaEl = null;
            let currentText = '';

            const enterEditMode = () => {
                if (isEditing) return;
                isEditing = true;
                currentText = preEl ? preEl.textContent : new TextDecoder().decode(data);

                // Create textarea
                textareaEl = document.createElement('textarea');
                textareaEl.value = currentText;
                textareaEl.style.cssText = 'width:100%; height:100%; margin:0; padding:0; resize:none; font-family:var(--font-mono); font-size:var(--text-small); color:var(--color-text); line-height:1.5; background:var(--bg-primary); border:1px solid var(--color-primary); border-radius:var(--radius-sm); outline:none; box-sizing:border-box; tab-size:4;';
                textareaEl.addEventListener('keydown', (e) => {
                    // Ctrl/Cmd+S to save
                    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                        e.preventDefault();
                        saveEdit();
                    }
                    // Escape to cancel
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        exitEditMode();
                    }
                    // Tab inserts spaces
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        const start = textareaEl.selectionStart;
                        const end   = textareaEl.selectionEnd;
                        textareaEl.value = textareaEl.value.substring(0, start) + '    ' + textareaEl.value.substring(end);
                        textareaEl.selectionStart = textareaEl.selectionEnd = start + 4;
                    }
                });

                // Swap pre → textarea
                content.style.padding = '0';
                if (preEl) preEl.style.display = 'none';
                content.appendChild(textareaEl);
                textareaEl.focus();

                // Toggle buttons
                if (editBtn) editBtn.style.display = 'none';
                if (saveBtn) saveBtn.style.display = '';
                if (cancelBtn) cancelBtn.style.display = '';
            };

            const exitEditMode = () => {
                if (!isEditing) return;
                isEditing = false;

                // Swap textarea → pre
                if (textareaEl) { textareaEl.remove(); textareaEl = null; }
                content.style.padding = '1rem';
                if (preEl) preEl.style.display = '';

                // Toggle buttons
                if (editBtn) editBtn.style.display = '';
                if (saveBtn) saveBtn.style.display = 'none';
                if (cancelBtn) cancelBtn.style.display = 'none';
            };

            const saveEdit = async () => {
                if (!textareaEl || !this._vault) return;
                const newText = textareaEl.value;
                const newData = new TextEncoder().encode(newText);

                // Disable save button while saving
                if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

                try {
                    const path = folderPath || this._currentPath;
                    await this._vault.updateFile(path, fileName, newData);

                    // Update the pre element with new content
                    if (preEl) preEl.textContent = newText;

                    // Update displayed size
                    nameEl.textContent = fileName + `  (${VaultHelpers.formatBytes(newData.byteLength)})`;

                    exitEditMode();

                    // Refresh tree and status
                    const tree = this._findTreeView();
                    if (tree) tree.refresh();
                    this._updateVaultKey();
                    this._updateStatusBar();

                    window.sgraphVault.messages.success(`"${fileName}" saved`);
                } catch (err) {
                    window.sgraphVault.messages.error(`Save failed: ${err.message}`);
                } finally {
                    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
                }
            };

            switch (type) {
                case 'text':
                case 'code':
                case 'markdown': {
                    const text = new TextDecoder().decode(data);
                    preEl = document.createElement('pre');
                    preEl.style.cssText = 'margin:0; white-space:pre-wrap; font-family:var(--font-mono); font-size:var(--text-small); color:var(--color-text); line-height:1.5;';
                    preEl.textContent = text;
                    content.appendChild(preEl);
                    break;
                }
                case 'image': {
                    const mime = typeof FileTypeDetect !== 'undefined' ? FileTypeDetect.getImageMime(fileName) : 'image/png';
                    const blob = new Blob([data], { type: mime });
                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(blob);
                    img.style.cssText = 'max-width:100%; max-height:100%;';
                    content.appendChild(img);
                    break;
                }
                default: {
                    try {
                        const text = new TextDecoder().decode(data);
                        preEl = document.createElement('pre');
                        preEl.style.cssText = 'margin:0; white-space:pre-wrap; font-family:var(--font-mono); font-size:var(--text-small); color:var(--color-text); line-height:1.5;';
                        preEl.textContent = text;
                        content.appendChild(preEl);
                    } catch (_) {
                        content.innerHTML = `<div style="text-align:center; color:var(--color-text-secondary); padding:2rem;">Binary file — ${VaultHelpers.formatBytes(data.byteLength)}</div>`;
                    }
                }
            }

            container.appendChild(content);
        }

        _escapeHtml(str) {
            const d = document.createElement('div');
            d.textContent = String(str);
            return d.innerHTML;
        }

        // --- Raw View (opens raw JSON in new sg-layout tab) ----------------------

        _showRawView(detail) {
            if (!this._sgLayout || !this._vault) return;
            const { path, type, name, entry, folderPath } = detail;

            let rawData;
            let title;

            if (type === 'vault') {
                rawData = {
                    tree: this._vault._tree,
                    settings: this._vault._settings,
                    headCommitId: this._vault._headCommitId,
                    vaultId: this._vault._vaultId,
                    refFileId: this._vault._refFileId
                };
                title = 'raw: vault';
            } else if (type === 'folder') {
                const node = this._vault._findNode(path);
                rawData = { path, type: 'folder', children: node ? node.children : {}, vaultId: this._vault._vaultId, vaultName: this._vault.name };
                title = `raw: ${name}/`;
            } else {
                rawData = { path, type: 'file', name, folderPath, vaultId: this._vault._vaultId, vaultName: this._vault.name, entry };
                title = `raw: ${name}`;
            }

            // Add as tab in preview stack
            const tabId = this._sgLayout.addTabToStack('s-preview', {
                tag: 'div', title, state: { rawView: true }
            }, true);
            if (!tabId) return;

            requestAnimationFrame(() => {
                const el = this._sgLayout.getPanelElement(tabId);
                if (!el) return;
                el.style.cssText = 'padding: 1rem; overflow: auto; height: 100%; box-sizing: border-box;';

                // Header showing name and vault location
                const header = document.createElement('div');
                header.style.cssText = 'margin-bottom:0.75rem; padding-bottom:0.75rem; border-bottom:1px solid var(--color-border); font-size:var(--text-sm); color:var(--color-text-secondary);';
                const rawName = rawData.name || rawData.path || title;
                const vaultName = rawData.vaultName || '';
                const vaultId = rawData.vaultId || '';
                header.innerHTML = `<div style="font-weight:600; color:var(--color-text); font-size:var(--text-body); margin-bottom:0.25rem;">${this._escapeHtml(rawName)}</div>` +
                    (rawData.folderPath ? `<div>Location: <span style="font-family:var(--font-mono); color:var(--color-primary);">${this._escapeHtml(rawData.folderPath)}</span></div>` : '') +
                    (vaultName ? `<div>Vault: <span style="font-family:var(--font-mono);">${this._escapeHtml(vaultName)}</span>${vaultId ? ` (${this._escapeHtml(vaultId)})` : ''}</div>` : '');
                el.appendChild(header);

                const pre = document.createElement('pre');
                pre.style.cssText = 'margin:0; white-space:pre-wrap; font-family:var(--font-mono); font-size:var(--text-small); color:var(--color-text); line-height:1.5;';
                pre.textContent = JSON.stringify(rawData, null, 2);
                el.appendChild(pre);
            });
        }

        _onFolderSelected(path) {
            this._currentPath  = path;
            this._selectedFile = null;

            const props = this.querySelector('vault-file-properties');
            if (props) props.clearFile();

            const preview = this.querySelector('vault-file-preview');
            if (preview) {
                // Show folder contents summary instead of clearing
                const node = this._vault ? this._vault._findNode(path) : null;
                if (node && node.type === 'folder') {
                    const children = Object.entries(node.children || {});
                    const folders = children.filter(([,e]) => e.type === 'folder');
                    const files = children.filter(([,e]) => e.type !== 'folder');
                    preview.showFolderInfo(path, folders.length, files.length);
                } else {
                    preview.clearPreview();
                }
            }

            const dropzone = this.querySelector('vault-upload-dropzone');
            if (dropzone) dropzone.targetPath = path;

            window.sgraphVault.events.emit('folder-selected', { path });
        }

        // --- Upload Flow --------------------------------------------------------

        _requireAccessKey(onSuccess) {
            if (this._accessKey) {
                onSuccess();
                return;
            }
            this._pendingUploadAction = onSuccess;
            const modal = this.querySelector('.vs-auth-modal');
            if (modal) {
                modal.style.display = '';
                const input = modal.querySelector('.vs-auth-input');
                if (input) { input.value = ''; input.focus(); }
            }
        }

        _onAuthSubmit() {
            const modal = this.querySelector('.vs-auth-modal');
            const input = modal?.querySelector('.vs-auth-input');
            const key   = input?.value?.trim();
            if (!key) return;

            this._accessKey = key;
            sessionStorage.setItem('sg-vault-access-key', key);

            if (this._vault?._sgSend) {
                this._vault._sgSend.token = key;
            }

            if (modal) modal.style.display = 'none';
            const badge = this.querySelector('.vs-readonly-badge');
            if (badge) badge.style.display = 'none';

            window.sgraphVault.messages.success('Access key set — uploads enabled');

            if (this._pendingUploadAction) {
                this._pendingUploadAction();
                this._pendingUploadAction = null;
            }
        }

        _onAuthCancel() {
            const modal = this.querySelector('.vs-auth-modal');
            if (modal) modal.style.display = 'none';
            this._pendingUploadAction = null;
        }

        _onUploadRequest() {
            this._requireAccessKey(() => {
                const uploadPanel = this.querySelector('.vs-upload-panel');
                if (uploadPanel) uploadPanel.style.display = '';
                const uploader = this.querySelector('vault-upload');
                if (uploader) uploader.targetPath = this._currentPath;
            });
        }

        _onFileAdded() {
            const tree = this._findTreeView();
            if (tree) tree.refresh();
            this._updateVaultKey();
            this._updateStatusBar();
        }

        // --- Download ---------------------------------------------------------------

        async _onDownload(fileName) {
            if (!this._vault || !fileName) return;
            this._showLoading();
            try {
                const data = await this._vault.getFile(this._currentPath, fileName);
                const blob = new Blob([data]);
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = fileName;
                a.click();
                URL.revokeObjectURL(url);
            } catch (err) {
                window.sgraphVault.messages.error(`Download failed: ${err.message}`);
            } finally {
                this._hideLoading();
            }
        }

        // --- Delete & Rename ----------------------------------------------------

        async _onDeleteFile(fileName, folderPath) {
            if (!this._vault || !fileName) return;
            this._showLoading();
            try {
                await this._vault.removeFile(folderPath || this._currentPath, fileName);
                window.sgraphVault.messages.success(`"${fileName}" deleted`);
                this._selectedFile = null;
                const props = this.querySelector('vault-file-properties');
                if (props) props.clearFile();
                const preview = this.querySelector('vault-file-preview');
                if (preview) preview.clearPreview();
                const tree = this._findTreeView();
                if (tree) tree.refresh();
                this._updateVaultKey();
                this._updateStatusBar();
            } catch (err) {
                window.sgraphVault.messages.error(`Delete failed: ${err.message}`);
            } finally {
                this._hideLoading();
            }
        }

        async _onRenameFile(oldName, newName, folderPath) {
            if (!this._vault || !oldName || !newName) return;
            const path = folderPath || this._currentPath;
            this._showLoading();
            try {
                await this._vault.renameFile(path, oldName, newName);
                window.sgraphVault.messages.success(`Renamed "${oldName}" to "${newName}"`);
                const folder = this._vault._findNode(path);
                if (folder && folder.children[newName]) {
                    const entry = folder.children[newName];
                    this._selectedFile = { folderPath: path, fileName: newName, ...entry };
                    const props = this.querySelector('vault-file-properties');
                    if (props) props.setFile(newName, entry, path);
                }
                const tree = this._findTreeView();
                if (tree) tree.refresh();
                this._updateVaultKey();
            } catch (err) {
                window.sgraphVault.messages.error(`Rename failed: ${err.message}`);
            } finally {
                this._hideLoading();
            }
        }

        async _onRenameFolder(oldPath, newName) {
            if (!this._vault || !oldPath || !newName) return;
            this._showLoading();
            try {
                await this._vault.renameFolder(oldPath, newName);
                window.sgraphVault.messages.success(`Folder renamed to "${newName}"`);
                const tree = this._findTreeView();
                if (tree) tree.refresh();
                this._updateVaultKey();
            } catch (err) {
                window.sgraphVault.messages.error(`Rename failed: ${err.message}`);
            } finally {
                this._hideLoading();
            }
        }

        async _onDeleteFolder(folderPath) {
            if (!this._vault || !folderPath || folderPath === '/') return;
            const folderName = folderPath.split('/').filter(Boolean).pop();
            if (!confirm(`Delete folder "${folderName}" and all its contents?`)) return;
            this._showLoading();
            try {
                await this._vault.removeFolder(folderPath);
                window.sgraphVault.messages.success(`Folder "${folderName}" deleted`);
                this._selectedFile = null;
                if (this._currentPath === folderPath || this._currentPath.startsWith(folderPath + '/')) {
                    const parts = folderPath.split('/').filter(Boolean);
                    parts.pop();
                    this._currentPath = '/' + parts.join('/') || '/';
                }
                const tree = this._findTreeView();
                if (tree) tree.refresh();
                const browser = this.querySelector('vault-browser');
                if (browser) browser.navigateTo(this._currentPath);
                this._updateVaultKey();
                this._updateStatusBar();
            } catch (err) {
                window.sgraphVault.messages.error(`Delete failed: ${err.message}`);
            } finally {
                this._hideLoading();
            }
        }

        async _onMoveFile(fileName, srcFolderPath, destFolderPath) {
            if (!this._vault || !fileName) return;
            this._showLoading();
            try {
                await this._vault.moveFile(srcFolderPath, fileName, destFolderPath);
                window.sgraphVault.messages.success(`Moved "${fileName}" to ${destFolderPath === '/' ? 'root' : destFolderPath}`);
                this._selectedFile = null;
                const props = this.querySelector('vault-file-properties');
                if (props) props.clearFile();
                const preview = this.querySelector('vault-file-preview');
                if (preview) preview.clearPreview();
                const tree = this._findTreeView();
                if (tree) tree.refresh();
                const browser = this.querySelector('vault-browser');
                if (browser) browser.refresh();
                this._updateVaultKey();
                this._updateStatusBar();
            } catch (err) {
                window.sgraphVault.messages.error(`Move failed: ${err.message}`);
            } finally {
                this._hideLoading();
            }
        }

        async _onMoveFolder(srcPath, destParentPath) {
            if (!this._vault || !srcPath) return;
            this._showLoading();
            try {
                await this._vault.moveFolder(srcPath, destParentPath);
                const folderName = srcPath.split('/').filter(Boolean).pop();
                window.sgraphVault.messages.success(`Moved "${folderName}" to ${destParentPath === '/' ? 'root' : destParentPath}`);
                const tree = this._findTreeView();
                if (tree) tree.refresh();
                const browser = this.querySelector('vault-browser');
                if (browser) browser.refresh();
                this._updateVaultKey();
                this._updateStatusBar();
            } catch (err) {
                window.sgraphVault.messages.error(`Move failed: ${err.message}`);
            } finally {
                this._hideLoading();
            }
        }

        // --- Key Management -----------------------------------------------------

        _updateVaultKey() {
            if (!this._vault) return;
            this._vaultKey = this._vault.getVaultKey();
        }

        // --- Settings Panel (now inline view, not modal) -------------------------

        _toggleSettings() {
            if (this._activeView === 'settings') {
                this._switchView('files');
            } else {
                this._switchView('settings');
            }
        }

        _updateSettingsView() {
            if (this._activeView === 'settings') {
                this._populateSettings();
            }
        }

        _populateSgitView() {
            const sgitView = this.querySelector('vault-sgit-view');
            if (sgitView && this._vault) {
                sgitView.vault = this._vault;
                sgitView.refresh();
            }
        }

        // --- Status Bar ---------------------------------------------------------

        _updateStatusBar() {
            if (!this._vault) return;
            const stats    = this._vault.getStats();
            const statusEl = this.querySelector('.vs-status-stats');
            if (statusEl) {
                statusEl.textContent = VaultI18n.t('vault.stats.summary', {
                    folders: stats.folders,
                    files:   stats.files,
                    size:    VaultHelpers.formatBytes(stats.totalSize)
                });
            }
        }

        // --- Listeners ----------------------------------------------------------

        _setupListeners() {
            // Entry component events (bubbled from Shadow DOM)
            this.addEventListener('vault-opened', (e) => {
                this._onVaultOpened(e.detail.vault, e.detail.vaultKey, e.detail.accessKey);
            });
            this.addEventListener('vault-created', (e) => {
                this._onVaultOpened(e.detail.vault, e.detail.vaultKey, e.detail.accessKey);
            });

            // Tree events
            this.addEventListener('tree-file-selected', (e) => {
                this._onFileSelected(e.detail.folderPath, e.detail.fileName, e.detail.fileEntry);
            });
            this.addEventListener('tree-folder-selected', (e) => {
                this._onFolderSelected(e.detail.path);
            });
            this.addEventListener('tree-refresh-requested', () => {
                this._onRefreshVault();
            });
            this.addEventListener('tree-raw-requested', (e) => {
                this._showRawView(e.detail);
            });

            // Upload events
            this.addEventListener('vault-file-added', () => this._onFileAdded());
            this.addEventListener('vault-upload-request', () => this._onUploadRequest());
            this.addEventListener('vault-upload-file', (e) => {
                const file = e.detail.file;
                const path = e.detail.path || this._currentPath;
                this._requireAccessKey(() => {
                    const uploadPanel = this.querySelector('.vs-upload-panel');
                    if (uploadPanel) uploadPanel.style.display = '';
                    const uploader = this.querySelector('vault-upload');
                    if (uploader) uploader.uploadFile(file, path);
                });
            });
            this.addEventListener('vault-key-changed', () => this._updateVaultKey());
            this.addEventListener('vault-error', (e) => {
                window.sgraphVault.messages.error(e.detail.message);
            });
            this.addEventListener('file-download-request', (e) => {
                this._onDownload(e.detail.fileName);
            });
            this.addEventListener('file-delete-request', (e) => {
                this._onDeleteFile(e.detail.fileName, e.detail.folderPath);
            });
            this.addEventListener('folder-delete-request', (e) => {
                this._onDeleteFolder(e.detail.folderPath);
            });
            this.addEventListener('file-rename-request', (e) => {
                this._onRenameFile(e.detail.oldName, e.detail.newName, e.detail.folderPath);
            });
            this.addEventListener('folder-rename-request', (e) => {
                this._onRenameFolder(e.detail.oldPath, e.detail.newName);
            });
            this.addEventListener('file-move-request', (e) => {
                this._onMoveFile(e.detail.fileName, e.detail.srcFolderPath, e.detail.destFolderPath);
            });
            this.addEventListener('folder-move-request', (e) => {
                this._onMoveFolder(e.detail.srcPath, e.detail.destParentPath);
            });

            // Click delegation
            this.addEventListener('click', (e) => {
                const navItem = e.target.closest('.vs-nav-item[data-view]');
                if (navItem) {
                    e.preventDefault();
                    this._switchView(navItem.dataset.view);
                    return;
                }
                if (e.target.closest('.vs-lock-btn')) {
                    this._onLock();
                    return;
                }
                if (e.target.closest('.vs-upload-btn')) {
                    this._onUploadRequest();
                    return;
                }
                if (e.target.closest('.vs-debug-toggle')) {
                    this._toggleDebugPanel();
                    return;
                }
                if (e.target.closest('.vs-raw-vault-link')) {
                    e.preventDefault();
                    this._showRawView({ path: '/', type: 'vault', name: 'vault' });
                    return;
                }
                if (e.target.closest('.vs-auth-submit')) {
                    this._onAuthSubmit();
                    return;
                }
                if (e.target.closest('.vs-auth-cancel')) {
                    this._onAuthCancel();
                    return;
                }
                if (e.target.closest('.vs-auth-overlay')) {
                    if (e.target.classList.contains('vs-auth-overlay')) {
                        this._onAuthCancel();
                    }
                    return;
                }
            });

            // Drop zone over main content area
            const mainContent = this.querySelector('.vs-main-content');
            if (mainContent) {
                mainContent.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    const dropzone = this.querySelector('vault-upload-dropzone');
                    if (dropzone && this._vault) dropzone.show();
                });
            }

            // Settings panel handlers
            this.addEventListener('click', (e) => {
                if (e.target.closest('.vs-settings-copy-key')) {
                    const keyInput = this.querySelector('.vs-settings-key-input');
                    if (keyInput) {
                        navigator.clipboard.writeText(keyInput.value).then(() => {
                            window.sgraphVault.messages.success('Vault key copied');
                        });
                    }
                    return;
                }
                if (e.target.closest('.vs-settings-save-access')) {
                    const accessInput = this.querySelector('.vs-settings-access-input');
                    const key = accessInput?.value?.trim();
                    if (key) {
                        this._accessKey = key;
                        sessionStorage.setItem('sg-vault-access-key', key);
                        if (this._vault?._sgSend) this._vault._sgSend.token = key;
                        const badge = this.querySelector('.vs-readonly-badge');
                        if (badge) badge.style.display = 'none';
                        window.sgraphVault.messages.success('Access key updated');
                    }
                    return;
                }
                if (e.target.closest('.vs-settings-json-toggle')) {
                    const jsonEl = this.querySelector('.vs-settings-json');
                    if (jsonEl) {
                        const hidden = jsonEl.style.display === 'none';
                        jsonEl.style.display = hidden ? '' : 'none';
                        e.target.closest('.vs-settings-json-toggle').textContent = hidden ? '(hide)' : '(show)';
                        if (hidden && this._vault) {
                            const settingsEl = this.querySelector('.vs-settings-json-settings');
                            const treeEl     = this.querySelector('.vs-settings-json-tree');
                            if (settingsEl) settingsEl.textContent = JSON.stringify(this._vault._settings, null, 2);
                            if (treeEl)     treeEl.textContent = JSON.stringify(this._vault._tree, null, 2);
                        }
                    }
                    return;
                }
            });

            // Auth modal enter key
            this.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target.classList?.contains('vs-auth-input')) {
                    this._onAuthSubmit();
                }
            });
        }

        // --- Debug Panel Toggle (adds/removes debug panel via sg-layout API) ----

        _toggleDebugPanel() {
            if (!this._sgLayout) return;

            // Check if debug panel already exists — remove it
            if (this._debugPanelId) {
                try {
                    this._sgLayout.removePanel(this._debugPanelId);
                } catch (_) { /* panel may already be gone */ }
                this._debugPanelId = null;
                return;
            }

            // Add debug panel via sg-layout API
            const panelId = this._sgLayout.addPanel({ tag: 'div', title: 'Debug' });
            this._debugPanelId = panelId;

            // Populate the debug panel after a frame
            requestAnimationFrame(() => {
                const debugEl = this._sgLayout.getPanelElement(panelId);
                if (!debugEl) return;

                debugEl.className = 'vs-debug-container';
                debugEl.innerHTML = `
                    <div class="vs-debug-tabs">
                        <button class="vs-debug-tab vs-debug-tab--active" data-tab="messages">Msgs</button>
                        <button class="vs-debug-tab" data-tab="events">Events</button>
                        <button class="vs-debug-tab" data-tab="api">API</button>
                        <button class="vs-debug-tab" data-tab="storage">Storage</button>
                    </div>
                    <div class="vs-debug-content">
                        <div class="vs-debug-panel" data-panel="messages">
                            <vault-messages-panel></vault-messages-panel>
                        </div>
                        <div class="vs-debug-panel" data-panel="events" style="display:none">
                            <vault-events-viewer></vault-events-viewer>
                        </div>
                        <div class="vs-debug-panel" data-panel="api" style="display:none">
                            <vault-api-logger></vault-api-logger>
                        </div>
                        <div class="vs-debug-panel" data-panel="storage" style="display:none">
                            <vault-storage-viewer></vault-storage-viewer>
                        </div>
                    </div>
                `;

                // Tab switching
                debugEl.addEventListener('click', (e) => {
                    const tab = e.target.closest('.vs-debug-tab');
                    if (!tab) return;
                    const tabId = tab.dataset.tab;
                    debugEl.querySelectorAll('.vs-debug-tab').forEach(t => {
                        t.classList.toggle('vs-debug-tab--active', t.dataset.tab === tabId);
                    });
                    debugEl.querySelectorAll('.vs-debug-panel').forEach(p => {
                        p.style.display = p.dataset.panel === tabId ? '' : 'none';
                    });
                });
            });
        }

        _setupMessageBadge() {
            const badge = this.querySelector('.vs-msg-badge');
            if (!badge) return;

            const update = () => {
                const svc = window.sgraphVault.messages;
                if (!svc) return;
                const msgs = svc.getMessages();
                const errorCount = msgs.filter(m => m.type === 'error').length;
                const total = msgs.length;
                badge.textContent = total || '';
                badge.style.display = total > 0 ? 'inline-flex' : 'none';
                badge.classList.toggle('vs-msg-badge--error', errorCount > 0);
            };

            badge.addEventListener('click', () => {
                this._toggleDebugPanel();
            });

            const onMsg = () => update();
            window.sgraphVault.events.on('message-added', onMsg);
            window.sgraphVault.events.on('messages-cleared', onMsg);
            this._badgeUnsub = () => {
                window.sgraphVault.events.off('message-added', onMsg);
                window.sgraphVault.events.off('messages-cleared', onMsg);
            };
            update();
        }

        // --- Render -------------------------------------------------------------

        render() {
            this.innerHTML = `
                <style>${VaultShell.styles}</style>

                <!-- Entry View (shown before vault is opened) -->
                <div class="vs-view-entry">
                    <vault-entry id="entry"></vault-entry>
                </div>

                <!-- Shell (shown after vault is opened) -->
                <div class="vs-shell" style="display:none">
                    <header class="vs-header">
                        <div class="vs-header-title">
                            <span class="vs-header-brand">SG<span class="vs-header-slash">/</span>Vault</span>
                            <span class="vs-header-vault-name"></span>
                        </div>
                        <div class="vs-header-right">
                            <span class="vs-readonly-badge" style="display:none">Read-only</span>
                            <button class="vs-upload-btn">Upload</button>
                            <button class="vs-debug-toggle">Debug</button>
                            <a class="vs-raw-vault-link" title="View raw vault data" href="#">raw</a>
                            <button class="vs-lock-btn" style="display:none">Lock</button>
                            <span class="vs-header-version">v0.1.4</span>
                        </div>
                        <!-- Loading bar (shown during API requests) -->
                        <div class="vs-loading-bar" style="display:none"><div class="vs-loading-bar-inner"></div></div>
                    </header>

                    <!-- Left navigation -->
                    <nav class="vs-nav">
                        <a class="vs-nav-item vs-nav-item--active" data-view="files" href="#">
                            <span class="vs-nav-icon">&#128194;</span>
                            <span class="vs-nav-label">Files</span>
                        </a>
                        <a class="vs-nav-item" data-view="sgit" href="#">
                            <span class="vs-nav-icon">&#128268;</span>
                            <span class="vs-nav-label">SGit</span>
                        </a>
                        <a class="vs-nav-item" data-view="settings" href="#">
                            <span class="vs-nav-icon">&#9881;</span>
                            <span class="vs-nav-label">Settings</span>
                        </a>
                    </nav>

                    <!-- Content area: sg-layout manages tree + preview + debug -->
                    <div class="vs-content-area">
                        <!-- Files view (default) — sg-layout fills this -->
                        <div class="vs-view-files">
                            <div class="vs-layout-container">
                                <sg-layout id="vault-layout"></sg-layout>
                            </div>
                        </div>

                        <!-- Settings view (shown when nav selects Settings) -->
                        <div class="vs-view-settings" style="display:none">
                            <div class="vs-settings-panel">
                                <h2 class="vs-settings-panel-title">Vault Settings</h2>

                                <div class="vs-settings-section">
                                    <label class="vs-settings-label">Vault Name</label>
                                    <input class="vs-settings-name-input" type="text" placeholder="Vault name">
                                </div>
                                <div class="vs-settings-section">
                                    <label class="vs-settings-label">Vault Key</label>
                                    <div class="vs-settings-key-row">
                                        <input class="vs-settings-key-input" type="text" readonly>
                                        <button class="vs-settings-copy-key">Copy</button>
                                    </div>
                                    <p class="vs-settings-hint vs-settings-key-warning">Anyone with this key can access all files in this vault.</p>
                                </div>
                                <div class="vs-settings-section">
                                    <label class="vs-settings-label">Access Key</label>
                                    <div class="vs-settings-key-row">
                                        <input class="vs-settings-access-input" type="password" placeholder="Enter access key for uploads">
                                        <button class="vs-settings-save-access">Set</button>
                                    </div>
                                    <p class="vs-settings-hint">Only needed for uploading files.</p>
                                </div>
                                <div class="vs-settings-section">
                                    <label class="vs-settings-label">Statistics</label>
                                    <div class="vs-settings-stats"></div>
                                </div>
                                <div class="vs-settings-section">
                                    <label class="vs-settings-label">Raw JSON <button class="vs-settings-json-toggle">(show)</button></label>
                                    <div class="vs-settings-json" style="display:none">
                                        <h4>vault-settings.json</h4>
                                        <pre class="vs-settings-json-settings"></pre>
                                        <h4>vault-tree.json</h4>
                                        <pre class="vs-settings-json-tree"></pre>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- SGit view (branches, commits, raw objects) -->
                        <div class="vs-view-sgit" style="display:none">
                            <vault-sgit-view></vault-sgit-view>
                        </div>
                    </div>

                    <footer class="vs-statusbar">
                        <span class="vs-status-stats"></span>
                        <span class="vs-status-spacer"></span>
                        <button class="vs-msg-badge" title="Messages" style="display:none">0</button>
                    </footer>
                </div>

                <!-- Auth Token Prompt Modal (kept as modal — destructive action gate) -->
                <div class="vs-auth-overlay vs-auth-modal" style="display:none">
                    <div class="vs-auth-dialog">
                        <h3 class="vs-auth-title">Access Key Required</h3>
                        <p class="vs-auth-desc">An access key is needed to upload files. Enter it below.</p>
                        <input class="vs-auth-input" type="password" placeholder="Paste your access key" autocomplete="off">
                        <div class="vs-auth-actions">
                            <button class="vs-auth-cancel">Cancel</button>
                            <button class="vs-auth-submit">Continue</button>
                        </div>
                    </div>
                </div>
            `;

            // Initialize sg-layout after DOM is ready
            this._initLayout();
        }

        // --- Styles -------------------------------------------------------------

        static get styles() {
            return `
                /* --- Entry View --- */
                .vs-view-entry {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    padding: var(--space-4);
                }

                /* --- Shell Grid ---
                   Simplified from v0.1.3's 5-column grid to 2-column:
                   nav | content (sg-layout manages everything inside content)
                */
                .vs-shell {
                    --nav-width: 56px;
                    display: grid;
                    grid-template-areas:
                        "header  header"
                        "nav     content"
                        "status  status";
                    grid-template-columns: var(--nav-width) 1fr;
                    grid-template-rows: 48px 1fr auto;
                    height: 100vh;
                    overflow: hidden;
                }

                /* --- Header --- */
                .vs-header {
                    grid-area: header;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 var(--space-4);
                    background: var(--bg-surface);
                    border-bottom: 1px solid var(--color-border);
                    z-index: 20;
                    position: relative;
                }

                .vs-header-title {
                    display: flex;
                    align-items: center;
                    gap: var(--space-3);
                }

                .vs-header-brand {
                    font-weight: 700;
                    font-size: var(--text-h3);
                    color: var(--color-text);
                }

                .vs-header-slash { color: var(--color-primary); }

                .vs-header-vault-name {
                    font-size: var(--text-sm);
                    color: var(--color-text-secondary);
                    font-family: var(--font-mono);
                }

                .vs-header-right {
                    display: flex;
                    align-items: center;
                    gap: var(--space-2);
                }

                .vs-header-version {
                    font-size: var(--text-small);
                    color: var(--color-text-secondary);
                    font-family: var(--font-mono);
                }

                .vs-upload-btn, .vs-lock-btn, .vs-debug-toggle {
                    font-size: var(--text-small);
                    padding: 0.25rem 0.625rem;
                    border-radius: var(--radius-sm);
                    border: 1px solid var(--color-border);
                    background: transparent;
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    font-family: var(--font-family);
                }

                .vs-upload-btn:hover, .vs-lock-btn:hover, .vs-debug-toggle:hover {
                    background: var(--bg-secondary);
                    color: var(--color-text);
                }

                .vs-raw-vault-link {
                    font-size: 0.625rem;
                    color: var(--color-text-secondary);
                    text-decoration: none;
                    opacity: 0.6;
                    padding: 0.25rem 0.375rem;
                }

                .vs-raw-vault-link:hover {
                    color: var(--color-primary);
                    opacity: 1;
                }

                .vs-upload-btn {
                    background: var(--color-primary);
                    color: var(--bg-primary);
                    border-color: var(--color-primary);
                    font-weight: 600;
                }

                .vs-upload-btn:hover {
                    background: var(--color-primary-hover);
                    color: var(--bg-primary);
                }

                /* --- Loading Bar --- */
                .vs-loading-bar {
                    position: absolute;
                    bottom: -2px;
                    left: 0;
                    right: 0;
                    height: 2px;
                    overflow: hidden;
                    z-index: 30;
                }

                .vs-loading-bar-inner {
                    width: 30%;
                    height: 100%;
                    background: var(--color-primary);
                    animation: vs-loading-slide 1.2s ease-in-out infinite;
                }

                @keyframes vs-loading-slide {
                    0%   { transform: translateX(-100%); }
                    50%  { transform: translateX(230%); }
                    100% { transform: translateX(-100%); }
                }

                /* --- Left Navigation --- */
                .vs-nav {
                    grid-area: nav;
                    background: var(--bg-surface);
                    border-right: 1px solid var(--color-border);
                    display: flex;
                    flex-direction: column;
                    padding: var(--space-2) 0;
                    gap: var(--space-1);
                    overflow: hidden;
                }

                .vs-nav-item {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.125rem;
                    padding: 0.5rem 0.25rem;
                    font-size: 0.625rem;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    color: var(--color-text-secondary);
                    text-decoration: none;
                    cursor: pointer;
                    border-left: 3px solid transparent;
                    transition: background var(--transition), color var(--transition);
                }

                .vs-nav-item:hover {
                    background: var(--bg-secondary);
                    color: var(--color-text);
                }

                .vs-nav-item--active {
                    color: var(--color-primary);
                    background: rgba(79, 143, 247, 0.08);
                    border-left-color: var(--color-primary);
                }

                .vs-nav-icon {
                    font-size: 1.125rem;
                    line-height: 1;
                }

                .vs-nav-label {
                    line-height: 1;
                }

                /* --- Content Area (sg-layout fills this) --- */
                .vs-content-area {
                    grid-area: content;
                    overflow: hidden;
                    position: relative;
                }

                .vs-view-files {
                    height: 100%;
                }

                .vs-layout-container {
                    height: 100%;
                }

                #vault-layout {
                    width: 100%;
                    height: 100%;
                }

                /* --- Main Content Panel (inside sg-layout) --- */
                .vs-main-content {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    overflow-y: auto;
                    padding: var(--space-4);
                    background: var(--bg-primary);
                    box-sizing: border-box;
                }

                .vs-upload-panel {
                    margin-top: var(--space-4);
                }

                .vs-share-panel {
                    margin-top: var(--space-4);
                }

                /* --- Debug Container (inside sg-layout panel) --- */
                .vs-debug-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    overflow: hidden;
                    background: var(--bg-surface);
                }

                .vs-debug-tabs {
                    display: flex;
                    border-bottom: 1px solid var(--color-border);
                    flex-shrink: 0;
                }

                .vs-debug-tab {
                    flex: 1;
                    padding: 0.5rem;
                    font-size: var(--text-small);
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                    background: transparent;
                    border: none;
                    border-bottom: 2px solid transparent;
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    transition: background var(--transition), color var(--transition);
                }

                .vs-debug-tab:hover {
                    background: var(--bg-secondary);
                    color: var(--color-text);
                }

                .vs-debug-tab--active {
                    color: var(--color-primary);
                    border-bottom-color: var(--color-primary);
                }

                .vs-debug-content { flex: 1; overflow-y: auto; }
                .vs-debug-panel { height: 100%; }

                /* --- Status Bar --- */
                .vs-statusbar {
                    grid-area: status;
                    display: flex;
                    align-items: center;
                    gap: var(--space-4);
                    padding: 0.25rem var(--space-4);
                    font-size: var(--text-small);
                    color: var(--color-text-secondary);
                    background: var(--bg-surface);
                    border-top: 1px solid var(--color-border);
                    font-family: var(--font-mono);
                }

                .vs-status-spacer { flex: 1; }

                .vs-msg-badge {
                    display: none;
                    align-items: center;
                    justify-content: center;
                    min-width: 1.25rem;
                    height: 1.25rem;
                    padding: 0 0.375rem;
                    border-radius: 9999px;
                    font-size: 0.6875rem;
                    font-weight: 600;
                    font-family: var(--font-mono);
                    background: var(--color-border);
                    color: var(--color-text-secondary);
                    border: none;
                    cursor: pointer;
                }

                .vs-msg-badge--error {
                    background: var(--color-error);
                    color: #fff;
                }

                /* --- Read-only Badge --- */
                .vs-readonly-badge {
                    font-size: var(--text-small);
                    padding: 0.125rem 0.5rem;
                    border-radius: 9999px;
                    background: rgba(233, 196, 69, 0.15);
                    color: #E9C445;
                    font-weight: 600;
                    letter-spacing: 0.02em;
                }

                /* --- Auth Modal --- */
                .vs-auth-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 100;
                    backdrop-filter: blur(4px);
                }

                .vs-auth-dialog {
                    background: var(--bg-surface);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius);
                    padding: var(--space-6);
                    max-width: 420px;
                    width: 90%;
                }

                .vs-auth-title {
                    font-size: var(--text-h3);
                    font-weight: 700;
                    color: var(--color-text);
                    margin: 0 0 var(--space-2);
                }

                .vs-auth-desc {
                    font-size: var(--text-sm);
                    color: var(--color-text-secondary);
                    margin: 0 0 var(--space-4);
                }

                .vs-auth-input {
                    width: 100%;
                    padding: 0.625rem 0.75rem;
                    font-size: var(--text-body);
                    font-family: var(--font-mono);
                    background: var(--bg-primary);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    color: var(--color-text);
                    outline: none;
                    box-sizing: border-box;
                }

                .vs-auth-input:focus {
                    border-color: var(--color-primary);
                }

                .vs-auth-actions {
                    display: flex;
                    gap: var(--space-2);
                    justify-content: flex-end;
                    margin-top: var(--space-4);
                }

                .vs-auth-cancel, .vs-auth-submit {
                    padding: 0.375rem 1rem;
                    border-radius: var(--radius-sm);
                    font-size: var(--text-sm);
                    cursor: pointer;
                    border: 1px solid var(--color-border);
                    font-family: var(--font-family);
                }

                .vs-auth-cancel {
                    background: transparent;
                    color: var(--color-text-secondary);
                }

                .vs-auth-submit {
                    background: var(--color-primary);
                    color: var(--bg-primary);
                    border-color: var(--color-primary);
                    font-weight: 600;
                }

                /* --- SGit View --- */
                .vs-view-sgit {
                    padding: var(--space-4);
                    overflow-y: auto;
                    height: 100%;
                    box-sizing: border-box;
                }

                /* --- Settings Panel (inline view) --- */
                .vs-view-settings {
                    padding: var(--space-4);
                    overflow-y: auto;
                    height: 100%;
                    box-sizing: border-box;
                }

                .vs-settings-panel {
                    max-width: 640px;
                }

                .vs-settings-panel-title {
                    font-size: var(--text-h3);
                    font-weight: 700;
                    color: var(--color-text);
                    margin: 0 0 var(--space-5);
                }

                .vs-settings-section {
                    margin-bottom: var(--space-5);
                }

                .vs-settings-section:last-child { margin-bottom: 0; }

                .vs-settings-label {
                    display: block;
                    font-size: var(--text-sm);
                    font-weight: 600;
                    color: var(--color-text-secondary);
                    margin-bottom: var(--space-2);
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                .vs-settings-name-input,
                .vs-settings-key-input,
                .vs-settings-access-input {
                    width: 100%;
                    padding: 0.5rem 0.75rem;
                    font-size: var(--text-sm);
                    font-family: var(--font-mono);
                    background: var(--bg-primary);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    color: var(--color-text);
                    outline: none;
                    box-sizing: border-box;
                }

                .vs-settings-key-row {
                    display: flex;
                    gap: var(--space-2);
                }

                .vs-settings-key-row input { flex: 1; }

                .vs-settings-copy-key, .vs-settings-save-access {
                    padding: 0.5rem 0.75rem;
                    font-size: var(--text-sm);
                    border-radius: var(--radius-sm);
                    border: 1px solid var(--color-border);
                    background: transparent;
                    color: var(--color-text-secondary);
                    cursor: pointer;
                    font-family: var(--font-family);
                }

                .vs-settings-copy-key:hover, .vs-settings-save-access:hover {
                    background: var(--bg-secondary);
                    color: var(--color-text);
                }

                .vs-settings-hint {
                    font-size: var(--text-small);
                    color: var(--color-text-secondary);
                    margin: var(--space-1) 0 0;
                }

                .vs-settings-key-warning {
                    color: var(--color-primary);
                }

                .vs-stats-grid {
                    display: grid;
                    grid-template-columns: auto 1fr;
                    gap: var(--space-1) var(--space-3);
                    font-size: var(--text-sm);
                }

                .vs-stats-label {
                    color: var(--color-text-secondary);
                    font-weight: 600;
                }

                .vs-stats-value {
                    color: var(--color-text);
                    font-family: var(--font-mono);
                }

                .vs-settings-json pre {
                    background: var(--bg-primary);
                    padding: var(--space-3);
                    border-radius: var(--radius-sm);
                    font-size: var(--text-small);
                    overflow-x: auto;
                    color: var(--color-text-secondary);
                    font-family: var(--font-mono);
                    border: 1px solid var(--color-border);
                    max-height: 300px;
                    overflow-y: auto;
                }

                .vs-settings-json h4 {
                    font-size: var(--text-sm);
                    font-weight: 600;
                    color: var(--color-text-secondary);
                    margin: var(--space-3) 0 var(--space-1);
                }

                .vs-settings-json-toggle {
                    font-size: var(--text-small);
                    color: var(--color-primary);
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-family: var(--font-family);
                }
            `;
        }
    }

    customElements.define('vault-shell', VaultShell);
})();
