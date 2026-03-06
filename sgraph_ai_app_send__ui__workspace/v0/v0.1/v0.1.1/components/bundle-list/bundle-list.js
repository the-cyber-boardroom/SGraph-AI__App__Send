/* =============================================================================
   SGraph Workspace — Bundle List
   v0.1.1 — Simple list UI for saved execution bundles

   Shows saved bundles in reverse chronological order. Each entry displays
   timestamp, model, and prompt preview. Click to load (time travel).
   Lives in the debug sidebar as a "Bundles" tab.
   ============================================================================= */

(function() {
    'use strict';

    function esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    class BundleList extends HTMLElement {

        constructor() {
            super();
            this._bundles = {};   // tree.json contents
            this._activeId = null;
            this._unsubs   = [];
        }

        connectedCallback() {
            this._renderEmpty();

            const onChanged = () => this._refresh();
            const onSaved   = (data) => {
                if (data && data.bundle) this._activeId = data.bundle.id;
                this._refresh();
            };
            const onLoaded  = (data) => {
                if (data && data.bundle) this._activeId = data.bundle.id;
                this._render();
            };
            const onVaultOpened = () => this._refresh();
            const onFolderChanged = () => this._refresh();

            window.sgraphWorkspace.events.on('bundle-list-changed', onChanged);
            window.sgraphWorkspace.events.on('bundle-saved', onSaved);
            window.sgraphWorkspace.events.on('bundle-loaded', onLoaded);
            window.sgraphWorkspace.events.on('vault-opened', onVaultOpened);
            window.sgraphWorkspace.events.on('folder-navigated', onFolderChanged);

            this._unsubs.push(
                () => window.sgraphWorkspace.events.off('bundle-list-changed', onChanged),
                () => window.sgraphWorkspace.events.off('bundle-saved', onSaved),
                () => window.sgraphWorkspace.events.off('bundle-loaded', onLoaded),
                () => window.sgraphWorkspace.events.off('vault-opened', onVaultOpened),
                () => window.sgraphWorkspace.events.off('folder-navigated', onFolderChanged),
            );
        }

        disconnectedCallback() {
            for (const unsub of this._unsubs) unsub();
        }

        // --- Refresh from vault ------------------------------------------------

        async _refresh() {
            const mgr = document.querySelector('bundle-manager');
            if (!mgr) return;

            const tree = await mgr.listBundles();
            this._bundles = (tree && tree.bundles) ? tree.bundles : {};
            this._render();
        }

        // --- Render ------------------------------------------------------------

        _renderEmpty() {
            this.innerHTML = `<style>${BundleList.styles}</style>
                <div class="bl-panel">
                    <div class="bl-empty">No bundles saved yet. Use "Save State" to capture workspace state.</div>
                </div>`;
        }

        _render() {
            const entries = Object.entries(this._bundles);
            if (entries.length === 0) {
                this._renderEmpty();
                return;
            }

            // Sort by timestamp descending (newest first)
            entries.sort((a, b) => (b[1].timestamp || '').localeCompare(a[1].timestamp || ''));

            const items = entries.map(([id, info]) => {
                const isActive = id === this._activeId;
                const ts = this._formatTimestamp(info.timestamp);
                const model = info.model ? this._shortModel(info.model) : 'no model';
                const preview = info.prompt_preview || '(no prompt)';
                const displayName = info.display_name || '';
                const sizeLabel = info.size_bytes ? this._formatSize(info.size_bytes) : '';
                const parentLabel = info.parent_id
                    ? `<span class="bl-fork" title="Forked from ${esc(info.parent_id)}">fork</span>`
                    : '';

                return `<div class="bl-item ${isActive ? 'bl-item--active' : ''}" data-bundle-id="${esc(id)}">
                    ${displayName ? `<div class="bl-name">${esc(displayName)}</div>` : ''}
                    <div class="bl-item-top">
                        <span class="bl-time">${esc(ts)}</span>
                        <span class="bl-model">${esc(model)}</span>
                        ${sizeLabel ? `<span class="bl-size">${esc(sizeLabel)}</span>` : ''}
                        ${parentLabel}
                        <button class="bl-rename" data-rename-id="${esc(id)}" data-current-name="${esc(displayName)}" title="Rename bundle">&#9998;</button>
                        <button class="bl-delete" data-delete-id="${esc(id)}" title="Delete bundle">&times;</button>
                    </div>
                    <div class="bl-preview">${esc(preview)}</div>
                </div>`;
            }).join('');

            this.innerHTML = `<style>${BundleList.styles}</style>
                <div class="bl-panel">
                    <div class="bl-header">
                        <span class="bl-title">${entries.length} bundle${entries.length !== 1 ? 's' : ''}</span>
                        <button class="bl-refresh" title="Refresh list">Refresh</button>
                    </div>
                    <div class="bl-list">${items}</div>
                </div>`;

            this._bind();
        }

        _bind() {
            // Delete buttons (must bind before item click to stop propagation)
            this.querySelectorAll('.bl-delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const deleteId = btn.dataset.deleteId;
                    if (deleteId) {
                        window.sgraphWorkspace.events.emit('bundle-delete-requested', { bundleId: deleteId });
                    }
                });
            });

            // Rename buttons — show inline input
            this.querySelectorAll('.bl-rename').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const bundleId = btn.dataset.renameId;
                    const currentName = btn.dataset.currentName || '';
                    this._showRenameInput(bundleId, currentName, btn.closest('.bl-item'));
                });
            });

            // Click to load bundle
            this.querySelectorAll('.bl-item').forEach(el => {
                el.addEventListener('click', () => {
                    const bundleId = el.dataset.bundleId;
                    if (bundleId) {
                        window.sgraphWorkspace.events.emit('bundle-load-requested', { bundleId });
                    }
                });
            });

            // Refresh button
            const refreshBtn = this.querySelector('.bl-refresh');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => this._refresh());
            }
        }

        _showRenameInput(bundleId, currentName, itemEl) {
            // Replace the item content with an inline input
            const existing = itemEl.querySelector('.bl-rename-input');
            if (existing) return; // already showing

            const wrapper = document.createElement('div');
            wrapper.className = 'bl-rename-row';
            wrapper.innerHTML = `<input class="bl-rename-input" type="text" value="${esc(currentName)}" placeholder="Enter bundle name..." />`;
            itemEl.insertBefore(wrapper, itemEl.firstChild);

            const input = wrapper.querySelector('.bl-rename-input');
            input.focus();
            input.select();

            const commit = () => {
                const name = input.value.trim();
                wrapper.remove();
                window.sgraphWorkspace.events.emit('bundle-rename-requested', { bundleId, name });
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(); }
                if (e.key === 'Escape') { e.preventDefault(); wrapper.remove(); }
            });
            input.addEventListener('blur', () => commit());
            input.addEventListener('click', (e) => e.stopPropagation());
        }

        // --- Helpers -----------------------------------------------------------

        _formatTimestamp(isoStr) {
            if (!isoStr) return '??';
            try {
                const d = new Date(isoStr);
                const pad = (n) => String(n).padStart(2, '0');
                return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            } catch (_) {
                return isoStr.slice(11, 19);
            }
        }

        _shortModel(model) {
            // "anthropic/claude-3.7-sonnet" -> "claude-3.7-sonnet"
            const slash = model.lastIndexOf('/');
            return slash >= 0 ? model.slice(slash + 1) : model;
        }

        _formatSize(bytes) {
            if (!bytes || bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        }

        // --- Styles ------------------------------------------------------------

        static get styles() {
            return `
                .bl-panel {
                    display: flex; flex-direction: column;
                    height: 100%; min-height: 0;
                    font-family: var(--ws-font, sans-serif);
                }
                .bl-header {
                    display: flex; align-items: center; justify-content: space-between;
                    padding: 0.375rem 0.5rem;
                    border-bottom: 1px solid var(--ws-border-subtle, #222d4d);
                    flex-shrink: 0;
                }
                .bl-title {
                    font-size: 0.625rem; font-weight: 600;
                    text-transform: uppercase; letter-spacing: 0.04em;
                    color: var(--ws-text-muted, #5a6478);
                }
                .bl-refresh {
                    padding: 0.125rem 0.375rem; font-size: 0.5625rem; font-weight: 600;
                    background: transparent; color: var(--ws-text-muted, #5a6478);
                    border: 1px solid var(--ws-border-subtle, #222d4d);
                    border-radius: 3px; cursor: pointer; font-family: inherit;
                }
                .bl-refresh:hover { color: var(--ws-text-secondary, #8892A0); }
                .bl-list {
                    flex: 1; overflow-y: auto; padding: 0.25rem 0;
                }
                .bl-empty {
                    padding: 1rem 0.75rem;
                    color: var(--ws-text-muted, #5a6478);
                    font-size: 0.6875rem; font-style: italic;
                    text-align: center;
                }
                .bl-item {
                    padding: 0.375rem 0.5rem;
                    border-bottom: 1px solid rgba(255,255,255,0.03);
                    cursor: pointer;
                    transition: background 100ms;
                }
                .bl-item:hover {
                    background: var(--ws-surface-hover, #253254);
                }
                .bl-item--active {
                    background: var(--ws-primary-bg, rgba(78,205,196,0.1));
                    border-left: 2px solid var(--ws-primary, #4ECDC4);
                }
                .bl-item-top {
                    display: flex; align-items: center; gap: 0.375rem;
                    margin-bottom: 0.125rem;
                }
                .bl-time {
                    font-size: 0.625rem; font-weight: 600;
                    color: var(--ws-text-secondary, #8892A0);
                    font-family: var(--ws-font-mono, monospace);
                }
                .bl-model {
                    font-size: 0.5625rem;
                    color: var(--ws-text-muted, #5a6478);
                    max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                }
                .bl-size {
                    font-size: 0.5rem;
                    color: var(--ws-text-muted, #5a6478);
                    font-family: var(--ws-font-mono, monospace);
                }
                .bl-fork {
                    font-size: 0.5rem; font-weight: 700;
                    padding: 0 0.25rem; border-radius: 2px;
                    background: rgba(78,205,196,0.15);
                    color: var(--ws-primary, #4ECDC4);
                    text-transform: uppercase; letter-spacing: 0.04em;
                }
                .bl-delete {
                    margin-left: 0;
                    width: 16px; height: 16px;
                    font-size: 0.75rem; line-height: 1;
                    background: transparent; color: var(--ws-text-muted, #5a6478);
                    border: none; border-radius: 2px;
                    cursor: pointer; padding: 0;
                    display: flex; align-items: center; justify-content: center;
                    opacity: 0; transition: opacity 100ms;
                }
                .bl-item:hover .bl-delete { opacity: 1; }
                .bl-delete:hover {
                    color: var(--ws-error, #E94560);
                    background: var(--ws-error-bg, rgba(233,69,96,0.08));
                }
                .bl-rename {
                    width: 16px; height: 16px;
                    font-size: 0.625rem; line-height: 1;
                    background: transparent; color: var(--ws-text-muted, #5a6478);
                    border: none; border-radius: 2px;
                    cursor: pointer; padding: 0;
                    display: flex; align-items: center; justify-content: center;
                    opacity: 0; transition: opacity 100ms;
                    margin-left: auto;
                }
                .bl-item:hover .bl-rename { opacity: 1; }
                .bl-rename:hover { color: var(--ws-primary, #4ECDC4); }
                .bl-name {
                    font-size: 0.6875rem; font-weight: 600;
                    color: var(--ws-text, #F0F0F5);
                    margin-bottom: 0.125rem;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                }
                .bl-rename-row {
                    margin-bottom: 0.25rem;
                }
                .bl-rename-input {
                    width: 100%; box-sizing: border-box;
                    padding: 0.1875rem 0.375rem;
                    font-size: 0.6875rem; font-family: var(--ws-font, sans-serif);
                    background: var(--ws-bg, #1A1A2E);
                    color: var(--ws-text, #F0F0F5);
                    border: 1px solid var(--ws-primary, #4ECDC4);
                    border-radius: 3px; outline: none;
                }
                .bl-preview {
                    font-size: 0.625rem;
                    color: var(--ws-text-muted, #5a6478);
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                    max-width: 100%;
                }
            `;
        }
    }

    customElements.define('bundle-list', BundleList);
})();
