/* =============================================================================
   SGraph Vault — Storage Viewer Debug Panel
   v0.1.2 — Shows localStorage and sessionStorage keys/values for debugging
   ============================================================================= */

(function() {
    'use strict';

    class VaultStorageViewer extends HTMLElement {

        connectedCallback() {
            this.innerHTML = `
                <style>${this.getStyles()}</style>
                <div class="vsv-container">
                    <div class="vsv-header">
                        <button class="vsv-refresh-btn">Refresh</button>
                    </div>
                    <div class="vsv-section">
                        <h4 class="vsv-section-title">localStorage</h4>
                        <div class="vsv-entries vsv-local"></div>
                    </div>
                    <div class="vsv-section">
                        <h4 class="vsv-section-title">sessionStorage</h4>
                        <div class="vsv-entries vsv-session"></div>
                    </div>
                </div>
            `;

            this.querySelector('.vsv-refresh-btn').addEventListener('click', () => this.refresh());
            this.refresh();
        }

        refresh() {
            this._renderStorage(this.querySelector('.vsv-local'), localStorage);
            this._renderStorage(this.querySelector('.vsv-session'), sessionStorage);
        }

        _renderStorage(container, storage) {
            if (!container) return;
            const keys = [];
            for (let i = 0; i < storage.length; i++) {
                keys.push(storage.key(i));
            }
            keys.sort();

            if (keys.length === 0) {
                container.innerHTML = '<div class="vsv-empty">No entries</div>';
                return;
            }

            container.innerHTML = keys.map(key => {
                let value = storage.getItem(key);
                let displayValue = value;
                try {
                    const parsed = JSON.parse(value);
                    displayValue = JSON.stringify(parsed, null, 2);
                } catch (_) { /* not JSON */ }

                const truncated = displayValue.length > 500
                    ? displayValue.substring(0, 500) + '...'
                    : displayValue;

                return `
                    <div class="vsv-entry">
                        <div class="vsv-key">${this._escapeHtml(key)}</div>
                        <pre class="vsv-value">${this._escapeHtml(truncated)}</pre>
                    </div>
                `;
            }).join('');
        }

        _escapeHtml(str) {
            const d = document.createElement('div');
            d.textContent = String(str);
            return d.innerHTML;
        }

        getStyles() {
            return `
                .vsv-container { padding: 0.5rem; }
                .vsv-header { display: flex; justify-content: flex-end; margin-bottom: 0.5rem; }
                .vsv-refresh-btn { font-size: 0.6875rem; padding: 0.25rem 0.5rem; border-radius: var(--radius-sm, 4px); border: 1px solid var(--color-border, #333); background: transparent; color: var(--color-text-secondary, #8892A0); cursor: pointer; }
                .vsv-refresh-btn:hover { background: var(--bg-secondary, #16213E); color: var(--color-primary, #4ECDC4); }
                .vsv-section { margin-bottom: 1rem; }
                .vsv-section-title { font-size: 0.6875rem; font-weight: 600; color: var(--color-text-secondary, #8892A0); text-transform: uppercase; letter-spacing: 0.04em; margin: 0 0 0.375rem; }
                .vsv-empty { font-size: 0.75rem; color: var(--color-text-secondary, #8892A0); padding: 0.5rem; font-style: italic; }
                .vsv-entry { margin-bottom: 0.375rem; border: 1px solid var(--color-border, #333); border-radius: var(--radius-sm, 4px); overflow: hidden; }
                .vsv-key { font-size: 0.6875rem; font-weight: 600; padding: 0.25rem 0.5rem; background: var(--bg-secondary, #16213E); color: var(--color-primary, #4ECDC4); font-family: var(--font-mono, monospace); }
                .vsv-value { font-size: 0.625rem; padding: 0.375rem 0.5rem; margin: 0; color: var(--color-text, #E0E0E0); font-family: var(--font-mono, monospace); white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; background: transparent; }
            `;
        }
    }

    customElements.define('vault-storage-viewer', VaultStorageViewer);
})();
