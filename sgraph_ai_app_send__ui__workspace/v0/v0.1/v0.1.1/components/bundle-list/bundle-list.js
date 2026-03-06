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

            window.sgraphWorkspace.events.on('bundle-list-changed', onChanged);
            window.sgraphWorkspace.events.on('bundle-saved', onSaved);
            window.sgraphWorkspace.events.on('bundle-loaded', onLoaded);
            window.sgraphWorkspace.events.on('vault-opened', onVaultOpened);

            this._unsubs.push(
                () => window.sgraphWorkspace.events.off('bundle-list-changed', onChanged),
                () => window.sgraphWorkspace.events.off('bundle-saved', onSaved),
                () => window.sgraphWorkspace.events.off('bundle-loaded', onLoaded),
                () => window.sgraphWorkspace.events.off('vault-opened', onVaultOpened),
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
                const sizeLabel = info.size_bytes ? this._formatSize(info.size_bytes) : '';
                const parentLabel = info.parent_id
                    ? `<span class="bl-fork" title="Forked from ${esc(info.parent_id)}">fork</span>`
                    : '';

                return `<div class="bl-item ${isActive ? 'bl-item--active' : ''}" data-bundle-id="${esc(id)}">
                    <div class="bl-item-top">
                        <span class="bl-time">${esc(ts)}</span>
                        <span class="bl-model">${esc(model)}</span>
                        ${sizeLabel ? `<span class="bl-size">${esc(sizeLabel)}</span>` : ''}
                        ${parentLabel}
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
                    margin-left: auto;
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
