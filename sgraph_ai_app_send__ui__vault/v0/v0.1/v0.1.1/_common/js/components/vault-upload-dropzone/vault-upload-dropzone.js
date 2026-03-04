/* =============================================================================
   SGraph Vault — Upload Dropzone Overlay
   v0.1.1 — Full-area drag-and-drop overlay for the main content area

   When files are dragged over the main content area, this overlay appears.
   Dropping files triggers the upload flow via vault-upload-request events.
   ============================================================================= */

(function() {
    'use strict';

    class VaultUploadDropzone extends HTMLElement {

        constructor() {
            super();
            this._targetPath = '/';
        }

        set targetPath(p) { this._targetPath = p || '/'; }

        connectedCallback() {
            this.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="vud-overlay" style="display:none">
                    <div class="vud-content">
                        <span class="vud-icon">\u2B06\uFE0F</span>
                        <span class="vud-label">Drop files to encrypt & upload</span>
                    </div>
                </div>
            `;

            const overlay = this.querySelector('.vud-overlay');

            overlay.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });

            overlay.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Only hide if we actually left the overlay
                if (!overlay.contains(e.relatedTarget)) {
                    this.hide();
                }
            });

            overlay.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hide();

                const files = e.dataTransfer?.files;
                if (!files || files.length === 0) return;

                const path = this._targetPath || '/';
                for (const file of files) {
                    this.dispatchEvent(new CustomEvent('vault-upload-file', {
                        detail: { file, path },
                        bubbles: true, composed: true
                    }));
                }

                // Also trigger upload panel
                this.dispatchEvent(new CustomEvent('vault-upload-request', {
                    detail: { path },
                    bubbles: true, composed: true
                }));
            });
        }

        show() {
            const overlay = this.querySelector('.vud-overlay');
            if (overlay) overlay.style.display = '';
        }

        hide() {
            const overlay = this.querySelector('.vud-overlay');
            if (overlay) overlay.style.display = 'none';
        }

        getStyles() {
            return `
                .vud-overlay {
                    position: absolute;
                    inset: 0;
                    background: rgba(78, 205, 196, 0.08);
                    border: 2px dashed var(--color-primary);
                    border-radius: var(--radius);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 50;
                    backdrop-filter: blur(2px);
                }
                .vud-content {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: var(--space-2);
                }
                .vud-icon { font-size: 2.5rem; }
                .vud-label {
                    font-size: var(--text-body);
                    font-weight: 600;
                    color: var(--color-primary);
                }
            `;
        }
    }

    customElements.define('vault-upload-dropzone', VaultUploadDropzone);
})();
