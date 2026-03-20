/* =============================================================================
   SGraph Vault — File Properties Banner
   v0.1.3 — Displays selected file metadata with folder path, download,
             delete, and rename actions
   ============================================================================= */

(function() {
    'use strict';

    class VaultFileProperties extends HTMLElement {

        constructor() {
            super();
            this._fileName   = null;
            this._folderPath = '/';
            this._fileEntry  = null;
            this._renaming   = false;
        }

        connectedCallback() {
            this.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="vfp-banner" style="display:none">
                    <div class="vfp-row-top">
                        <div class="vfp-info">
                            <span class="vfp-icon"></span>
                            <span class="vfp-name"></span>
                            <input class="vfp-rename-input" style="display:none" autocomplete="off">
                        </div>
                        <div class="vfp-actions">
                            <a class="vfp-raw-btn" title="View raw file metadata" href="#">raw</a>
                            <button class="vfp-rename-btn" title="Rename">Rename</button>
                            <button class="vfp-download-btn" title="Download">Download</button>
                            <button class="vfp-delete-btn" title="Delete">Delete</button>
                        </div>
                    </div>
                    <div class="vfp-row-meta">
                        <span class="vfp-size"></span>
                        <span class="vfp-type-label"></span>
                        <span class="vfp-date"></span>
                        <span class="vfp-folder"></span>
                    </div>
                </div>
            `;

            this.querySelector('.vfp-raw-btn').addEventListener('click', (e) => {
                e.preventDefault();
                if (!this._fileName) return;
                this.dispatchEvent(new CustomEvent('tree-raw-requested', {
                    detail: { path: this._folderPath + (this._folderPath === '/' ? '' : '/') + this._fileName, type: 'file', name: this._fileName, entry: this._fileEntry, folderPath: this._folderPath },
                    bubbles: true, composed: true
                }));
            });
            this.querySelector('.vfp-download-btn').addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('file-download-request', {
                    detail: { fileName: this._fileName },
                    bubbles: true, composed: true
                }));
            });

            this.querySelector('.vfp-delete-btn').addEventListener('click', () => {
                if (!this._fileName) return;
                this._showDeleteConfirm();
            });

            this.querySelector('.vfp-rename-btn').addEventListener('click', () => {
                this._startRename();
            });

            const renameInput = this.querySelector('.vfp-rename-input');
            renameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter')  this._commitRename();
                if (e.key === 'Escape') this._cancelRename();
            });
            renameInput.addEventListener('blur', () => {
                if (this._renaming) this._commitRename();
            });
        }

        setFile(fileName, entry, folderPath) {
            this._fileName   = fileName;
            this._fileEntry  = entry;
            this._folderPath = folderPath || '/';
            this._renaming   = false;
            const banner = this.querySelector('.vfp-banner');
            if (!banner) return;
            banner.style.display = '';

            const type = typeof FileTypeDetect !== 'undefined' ? FileTypeDetect.detect(fileName) : null;
            const icon = type === 'image' ? '\uD83D\uDDBC' : type === 'pdf' ? '\uD83D\uDCC4' : type === 'markdown' ? '\uD83D\uDCDD' :
                         type === 'code' ? '\uD83D\uDCBB' : type === 'audio' ? '\uD83C\uDFB5' : type === 'video' ? '\uD83C\uDFA5' : '\uD83D\uDCC4';

            this.querySelector('.vfp-icon').textContent = icon;
            this.querySelector('.vfp-name').textContent = fileName;
            this.querySelector('.vfp-name').style.display = '';
            this.querySelector('.vfp-rename-input').style.display = 'none';
            this.querySelector('.vfp-size').textContent = VaultHelpers.formatBytes(entry.size || 0);
            this.querySelector('.vfp-type-label').textContent = type ? type.charAt(0).toUpperCase() + type.slice(1) : '--';
            this.querySelector('.vfp-date').textContent = entry.uploaded ? VaultHelpers.formatTimestamp(entry.uploaded) : '';
            this.querySelector('.vfp-folder').textContent = this._folderPath;
        }

        clearFile() {
            this._fileName  = null;
            this._fileEntry = null;
            this._renaming  = false;
            const banner = this.querySelector('.vfp-banner');
            if (banner) banner.style.display = 'none';
        }

        _startRename() {
            if (!this._fileName) return;
            this._renaming = true;
            const nameEl = this.querySelector('.vfp-name');
            const input  = this.querySelector('.vfp-rename-input');
            nameEl.style.display = 'none';
            input.style.display  = '';
            input.value = this._fileName;
            input.focus();
            // Select name without extension
            const dotIndex = this._fileName.lastIndexOf('.');
            input.setSelectionRange(0, dotIndex > 0 ? dotIndex : this._fileName.length);
        }

        _cancelRename() {
            this._renaming = false;
            this.querySelector('.vfp-name').style.display = '';
            this.querySelector('.vfp-rename-input').style.display = 'none';
        }

        _commitRename() {
            if (!this._renaming) return;
            this._renaming = false;
            const input   = this.querySelector('.vfp-rename-input');
            const newName = input.value.trim();

            this.querySelector('.vfp-name').style.display = '';
            input.style.display = 'none';

            if (!newName || newName === this._fileName) return;

            this.dispatchEvent(new CustomEvent('file-rename-request', {
                detail: {
                    oldName:    this._fileName,
                    newName:    newName,
                    folderPath: this._folderPath
                },
                bubbles: true, composed: true
            }));
        }

        _showDeleteConfirm() {
            // Remove existing confirm bar
            const existing = this.querySelector('.vfp-confirm-bar');
            if (existing) { existing.remove(); return; }

            const bar = document.createElement('div');
            bar.className = 'vfp-confirm-bar';
            bar.innerHTML = `
                <span class="vfp-confirm-msg">Delete "${this._escapeHtml(this._fileName)}"?</span>
                <button class="vfp-confirm-yes">Delete</button>
                <button class="vfp-confirm-no">Cancel</button>
            `;

            const fileName   = this._fileName;
            const folderPath = this._folderPath;
            const remove     = () => bar.remove();

            bar.querySelector('.vfp-confirm-yes').addEventListener('click', () => {
                remove();
                this.dispatchEvent(new CustomEvent('file-delete-request', {
                    detail: { fileName, folderPath },
                    bubbles: true, composed: true
                }));
            });
            bar.querySelector('.vfp-confirm-no').addEventListener('click', remove);

            const banner = this.querySelector('.vfp-banner');
            if (banner) banner.appendChild(bar);
        }

        _escapeHtml(str) {
            const d = document.createElement('div');
            d.textContent = String(str);
            return d.innerHTML;
        }

        getStyles() {
            return `
                .vfp-banner { padding: var(--space-3) var(--space-4); background: var(--bg-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); margin-bottom: var(--space-4); }
                .vfp-row-top { display: flex; align-items: center; gap: var(--space-4); }
                .vfp-info { display: flex; align-items: center; gap: var(--space-2); flex: 1; min-width: 0; }
                .vfp-icon { font-size: 1.25rem; flex-shrink: 0; }
                .vfp-name { font-weight: 600; font-size: var(--text-body); color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .vfp-rename-input { flex: 1; padding: 0.25rem 0.5rem; font-size: var(--text-body); font-family: var(--font-mono); background: var(--bg-primary); border: 1px solid var(--color-primary); border-radius: var(--radius-sm); color: var(--color-text); outline: none; box-sizing: border-box; }
                .vfp-row-meta { display: flex; gap: var(--space-3); font-size: var(--text-small); color: var(--color-text-secondary); font-family: var(--font-mono); margin-top: var(--space-2); flex-wrap: wrap; }
                .vfp-folder { color: var(--color-primary); opacity: 0.8; }
                .vfp-actions { display: flex; gap: var(--space-2); flex-shrink: 0; }
                .vfp-raw-btn { font-size: 0.625rem; color: var(--color-text-secondary); text-decoration: none; padding: 0.25rem 0.5rem; opacity: 0.6; }
                .vfp-raw-btn:hover { color: var(--color-primary); opacity: 1; }
                .vfp-download-btn, .vfp-delete-btn, .vfp-rename-btn { font-size: var(--text-small); padding: 0.25rem 0.625rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family); }
                .vfp-download-btn:hover, .vfp-rename-btn:hover { background: var(--bg-secondary); color: var(--color-primary); border-color: var(--color-primary); }
                .vfp-delete-btn:hover { background: rgba(233,69,96,0.1); color: var(--color-error); border-color: var(--color-error); }
                .vfp-confirm-bar { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-2); padding: var(--space-2) 0; border-top: 1px solid rgba(233,69,96,0.2); animation: vfp-fade 0.15s ease-out; }
                .vfp-confirm-msg { font-size: var(--text-sm); font-weight: 600; color: var(--color-error, #E94560); flex: 1; }
                .vfp-confirm-yes { font-size: var(--text-small); padding: 0.2rem 0.625rem; border-radius: var(--radius-sm); border: 1px solid var(--color-error, #E94560); background: var(--color-error, #E94560); color: #fff; cursor: pointer; font-weight: 600; font-family: var(--font-family); }
                .vfp-confirm-no { font-size: var(--text-small); padding: 0.2rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family); }
                .vfp-confirm-no:hover { background: var(--bg-secondary); color: var(--color-text); }
                @keyframes vfp-fade { from { opacity: 0; } to { opacity: 1; } }
            `;
        }
    }

    customElements.define('vault-file-properties', VaultFileProperties);
})();
