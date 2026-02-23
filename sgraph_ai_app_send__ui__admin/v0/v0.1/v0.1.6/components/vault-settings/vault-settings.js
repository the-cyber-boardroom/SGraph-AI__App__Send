/* =============================================================================
   SGraph Send Admin Console — Vault Settings Bar
   v0.1.6 — Metadata + actions bar for selected vault item

   Standalone web component that shows metadata and action buttons for a
   selected file or folder. Used by vault-manager in row 2 of the layout.

   Usage:
     const settings = document.querySelector('vault-settings');
     settings.show({ guid, name, type, size, mime, uploadedAt });
     settings.clear();

   Events emitted:
     vault-settings-download       { guid }
     vault-settings-share          { guid }     — share via Send link
     vault-settings-share-contact  { guid }     — share with PKI contact
     vault-settings-edit           { guid }
     vault-settings-rename         { guid, newName }
     vault-settings-delete         { guid }
     vault-settings-open           { guid }
   ============================================================================= */

(function() {
    'use strict';

    const { escapeHtml, PKI_SHARED_STYLES } = window.sgraphAdmin.pki;

    function formatSize(bytes) {
        if (bytes == null) return '\u2014';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
        return (bytes / 1073741824).toFixed(1) + ' GB';
    }

    const SVG_DOWNLOAD = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';
    const SVG_DELETE   = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>';
    const SVG_RENAME   = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>';
    const SVG_SHARE    = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"/></svg>';
    const SVG_CONTACT  = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>';
    const SVG_FOLDER   = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg>';

    const SETTINGS_STYLES = `
        ${PKI_SHARED_STYLES}

        :host, vault-settings { display: block; }

        .vs-container { display: flex; align-items: center; gap: 0.75rem; padding: 0.25rem 0.5rem; min-height: 28px; font-size: 0.75rem; }

        /* Empty state */
        .vs-empty { color: var(--admin-text-muted, #5e6280); font-style: italic; font-size: 0.75rem; padding: 0.25rem 0.5rem; min-height: 28px; display: flex; align-items: center; }

        /* Metadata */
        .vs-meta { display: flex; align-items: center; gap: 0.25rem; flex: 1; flex-wrap: wrap; min-width: 0; overflow: hidden; }
        .vs-label { font-weight: 600; color: var(--admin-text-muted, #5e6280); text-transform: uppercase; letter-spacing: 0.03em; font-size: 0.625rem; white-space: nowrap; }
        .vs-value { color: var(--admin-text, #e4e6ef); font-size: 0.6875rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px; }
        .vs-value-mono { font-family: var(--admin-font-mono, monospace); }
        .vs-value-guid { font-size: 0.5625rem; color: var(--admin-text-muted, #5e6280); font-family: var(--admin-font-mono, monospace); }
        .vs-sep { color: var(--admin-border, #2e3347); margin: 0 0.125rem; }

        /* Actions */
        .vs-actions { display: flex; gap: 0.25rem; flex-shrink: 0; align-items: center; }
        .vs-actions svg { width: 14px; height: 14px; vertical-align: -2px; }

        /* Inline rename */
        .vs-rename-input { background: var(--admin-bg, #1a1d2e); border: 1px solid var(--admin-primary, #4f8ff7); border-radius: 3px; color: var(--admin-text, #e4e6ef); font-size: 0.6875rem; font-weight: 500; padding: 0.125rem 0.375rem; outline: none; width: 160px; max-width: 200px; }

        /* Delete confirm */
        .vs-inline-confirm { display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.6875rem; }
        .vs-inline-confirm span { color: var(--admin-error, #ef4444); }
        .vs-inline-confirm .vs-confirm-yes { color: var(--admin-error, #ef4444); border-color: var(--admin-error, #ef4444); }

        /* Muted primary buttons */
        .vs-container .pk-btn--primary { background: rgba(79, 143, 247, 0.12); color: var(--admin-primary, #4f8ff7); border: 1px solid rgba(79, 143, 247, 0.2); }
        .vs-container .pk-btn--primary:hover:not(:disabled) { background: rgba(79, 143, 247, 0.22); }
    `;

    class VaultSettings extends HTMLElement {
        constructor() {
            super();
            this._item = null;           // { guid, name, type, size, mime, uploadedAt }
            this._pendingDelete = false;
            this._renaming = false;
        }

        connectedCallback() {
            this.innerHTML = `<style>${SETTINGS_STYLES}</style><div class="vs-empty">Select a file or folder for details</div>`;
        }

        show(item) {
            this._item = item;
            this._pendingDelete = false;
            this._renaming = false;
            this._render();
        }

        clear() {
            this._item = null;
            this._pendingDelete = false;
            this._renaming = false;
            this.innerHTML = `<style>${SETTINGS_STYLES}</style><div class="vs-empty">Select a file or folder for details</div>`;
        }

        _render() {
            if (!this._item) { this.clear(); return; }

            const { guid, name, type, size, mime, uploadedAt } = this._item;
            const isFile = type !== 'folder';
            const displayName = name || guid;

            // Metadata
            let metaHtml = '';

            if (this._renaming) {
                metaHtml += `<span class="vs-label">Name</span>`;
                metaHtml += `<input type="text" class="vs-rename-input" id="vs-rename-input" value="${escapeHtml(displayName)}">`;
            } else {
                metaHtml += `<span class="vs-label">Name</span><span class="vs-value">${escapeHtml(displayName)}</span>`;
            }

            if (isFile && size != null) {
                metaHtml += `<span class="vs-sep">\u00b7</span><span class="vs-label">Size</span><span class="vs-value">${escapeHtml(formatSize(size))}</span>`;
            }
            if (isFile && mime && mime !== '\u2014') {
                metaHtml += `<span class="vs-sep">\u00b7</span><span class="vs-label">MIME</span><span class="vs-value vs-value-mono">${escapeHtml(mime)}</span>`;
            }
            metaHtml += `<span class="vs-sep">\u00b7</span><span class="vs-value-guid">${escapeHtml(guid)}</span>`;

            // Actions
            let actionsHtml = '';
            if (isFile) {
                actionsHtml += `<button class="pk-btn pk-btn--xs pk-btn--primary" id="vs-download">${SVG_DOWNLOAD} Download</button>`;
                actionsHtml += `<button class="pk-btn pk-btn--xs pk-btn--primary" id="vs-share">${SVG_SHARE} Share</button>`;
                actionsHtml += `<button class="pk-btn pk-btn--xs pk-btn--ghost" id="vs-share-contact">${SVG_CONTACT} Contact</button>`;
                if (this._isEditable(mime)) {
                    actionsHtml += `<button class="pk-btn pk-btn--xs pk-btn--ghost" id="vs-edit">${SVG_RENAME} Edit</button>`;
                }
            } else {
                actionsHtml += `<button class="pk-btn pk-btn--xs pk-btn--primary" id="vs-open">${SVG_FOLDER} Open</button>`;
            }
            actionsHtml += `<button class="pk-btn pk-btn--xs pk-btn--ghost" id="vs-rename">${SVG_RENAME}</button>`;

            if (this._pendingDelete) {
                actionsHtml += `<span class="vs-inline-confirm">`;
                actionsHtml += `<span>Delete?</span>`;
                actionsHtml += `<button class="pk-btn pk-btn--xs pk-btn--ghost vs-confirm-yes" id="vs-confirm-del">Yes</button>`;
                actionsHtml += `<button class="pk-btn pk-btn--xs pk-btn--ghost" id="vs-cancel-del">No</button>`;
                actionsHtml += `</span>`;
            } else {
                actionsHtml += `<button class="pk-btn pk-btn--xs pk-btn--danger" id="vs-delete">${SVG_DELETE}</button>`;
            }

            this.innerHTML = `<style>${SETTINGS_STYLES}</style>
                <div class="vs-container">
                    <div class="vs-meta">${metaHtml}</div>
                    <div class="vs-actions">${actionsHtml}</div>
                </div>`;

            this._bindEvents();
        }

        _bindEvents() {
            const guid = this._item.guid;

            const dl = this.querySelector('#vs-download');
            if (dl) dl.addEventListener('click', () => this._emit('vault-settings-download', { guid }));

            const share = this.querySelector('#vs-share');
            if (share) share.addEventListener('click', () => this._emit('vault-settings-share', { guid }));

            const shareContact = this.querySelector('#vs-share-contact');
            if (shareContact) shareContact.addEventListener('click', () => this._emit('vault-settings-share-contact', { guid }));

            const edit = this.querySelector('#vs-edit');
            if (edit) edit.addEventListener('click', () => this._emit('vault-settings-edit', { guid }));

            const open = this.querySelector('#vs-open');
            if (open) open.addEventListener('click', () => this._emit('vault-settings-open', { guid }));

            const rename = this.querySelector('#vs-rename');
            if (rename) rename.addEventListener('click', () => {
                this._renaming = true;
                this._render();
                const input = this.querySelector('#vs-rename-input');
                if (input) { input.focus(); input.select(); }
            });

            const del = this.querySelector('#vs-delete');
            if (del) del.addEventListener('click', () => {
                this._pendingDelete = true;
                this._render();
            });

            const confirmDel = this.querySelector('#vs-confirm-del');
            if (confirmDel) confirmDel.addEventListener('click', () => this._emit('vault-settings-delete', { guid }));

            const cancelDel = this.querySelector('#vs-cancel-del');
            if (cancelDel) cancelDel.addEventListener('click', () => {
                this._pendingDelete = false;
                this._render();
            });

            // Rename input
            const renameInput = this.querySelector('#vs-rename-input');
            if (renameInput) {
                renameInput.addEventListener('keydown', (e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') {
                        const newName = renameInput.value.trim();
                        if (newName) {
                            this._emit('vault-settings-rename', { guid, newName });
                        }
                        this._renaming = false;
                        this._render();
                    } else if (e.key === 'Escape') {
                        this._renaming = false;
                        this._render();
                    }
                });
                renameInput.addEventListener('blur', () => {
                    if (!this._renaming) return;
                    const newName = renameInput.value.trim();
                    if (newName && newName !== (this._item.name || this._item.guid)) {
                        this._emit('vault-settings-rename', { guid, newName });
                    }
                    this._renaming = false;
                    this._render();
                });
                renameInput.addEventListener('click', (e) => e.stopPropagation());
            }
        }

        _isEditable(mime) {
            if (!mime || mime === '\u2014') return false;
            return mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml' || mime === 'application/javascript';
        }

        _emit(name, detail) {
            this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
        }
    }

    customElements.define('vault-settings', VaultSettings);
})();
