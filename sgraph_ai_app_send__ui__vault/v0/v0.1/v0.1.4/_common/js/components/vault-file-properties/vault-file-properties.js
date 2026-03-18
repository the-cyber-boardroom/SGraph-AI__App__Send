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

            this.querySelector('.vfp-download-btn').addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('file-download-request', {
                    detail: { fileName: this._fileName },
                    bubbles: true, composed: true
                }));
            });

            this.querySelector('.vfp-delete-btn').addEventListener('click', () => {
                if (!this._fileName) return;
                const confirmed = confirm(`Delete "${this._fileName}"?`);
                if (confirmed) {
                    this.dispatchEvent(new CustomEvent('file-delete-request', {
                        detail: { fileName: this._fileName, folderPath: this._folderPath },
                        bubbles: true, composed: true
                    }));
                }
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
                .vfp-download-btn, .vfp-delete-btn, .vfp-rename-btn { font-size: var(--text-small); padding: 0.25rem 0.625rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); cursor: pointer; font-family: var(--font-family); }
                .vfp-download-btn:hover, .vfp-rename-btn:hover { background: var(--bg-secondary); color: var(--color-primary); border-color: var(--color-primary); }
                .vfp-delete-btn:hover { background: rgba(233,69,96,0.1); color: var(--color-error); border-color: var(--color-error); }
            `;
        }
    }

    customElements.define('vault-file-properties', VaultFileProperties);
})();
