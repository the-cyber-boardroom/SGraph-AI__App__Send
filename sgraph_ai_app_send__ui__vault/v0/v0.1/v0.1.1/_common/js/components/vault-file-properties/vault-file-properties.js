/* =============================================================================
   SGraph Vault — File Properties Banner
   v0.1.1 — Displays selected file metadata (name, size, type, date)
   ============================================================================= */

(function() {
    'use strict';

    class VaultFileProperties extends HTMLElement {

        connectedCallback() {
            this.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="vfp-banner" style="display:none">
                    <div class="vfp-info">
                        <span class="vfp-icon"></span>
                        <span class="vfp-name"></span>
                    </div>
                    <div class="vfp-meta">
                        <span class="vfp-size"></span>
                        <span class="vfp-date"></span>
                    </div>
                    <div class="vfp-actions">
                        <button class="vfp-download-btn">Download</button>
                    </div>
                </div>
            `;

            this.querySelector('.vfp-download-btn').addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('file-download-request', {
                    detail: { fileName: this._fileName },
                    bubbles: true, composed: true
                }));
            });
        }

        setFile(fileName, entry) {
            this._fileName = fileName;
            const banner = this.querySelector('.vfp-banner');
            if (!banner) return;
            banner.style.display = '';

            const ext  = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
            const type = typeof FileTypeDetect !== 'undefined' ? FileTypeDetect.detect(fileName) : null;
            const icon = type === 'image' ? '\uD83D\uDDBC' : type === 'pdf' ? '\uD83D\uDCC4' : type === 'markdown' ? '\uD83D\uDCDD' :
                         type === 'code' ? '\uD83D\uDCBB' : type === 'audio' ? '\uD83C\uDFB5' : type === 'video' ? '\uD83C\uDFA5' : '\uD83D\uDCC4';

            this.querySelector('.vfp-icon').textContent = icon;
            this.querySelector('.vfp-name').textContent = fileName;
            this.querySelector('.vfp-size').textContent = VaultHelpers.formatBytes(entry.size || 0);
            this.querySelector('.vfp-date').textContent = entry.uploaded ? VaultHelpers.formatTimestamp(entry.uploaded) : '';
        }

        clearFile() {
            this._fileName = null;
            const banner = this.querySelector('.vfp-banner');
            if (banner) banner.style.display = 'none';
        }

        getStyles() {
            return `
                .vfp-banner { display: flex; align-items: center; gap: var(--space-4); padding: var(--space-3) var(--space-4); background: var(--bg-surface); border: 1px solid var(--color-border); border-radius: var(--radius-sm); margin-bottom: var(--space-4); }
                .vfp-info { display: flex; align-items: center; gap: var(--space-2); flex: 1; min-width: 0; }
                .vfp-icon { font-size: 1.25rem; }
                .vfp-name { font-weight: 600; font-size: var(--text-body); color: var(--color-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .vfp-meta { display: flex; gap: var(--space-3); font-size: var(--text-small); color: var(--color-text-secondary); font-family: var(--font-mono); flex-shrink: 0; }
                .vfp-actions { flex-shrink: 0; }
                .vfp-download-btn { font-size: var(--text-small); padding: 0.25rem 0.625rem; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); cursor: pointer; }
                .vfp-download-btn:hover { background: var(--bg-secondary); color: var(--color-primary); border-color: var(--color-primary); }
            `;
        }
    }

    customElements.define('vault-file-properties', VaultFileProperties);
})();
