/* =============================================================================
   SGraph Send Admin Console — Key Publish Component
   v0.1.3 — Publish local key pair to the key registry

   Reads keys from local IndexedDB (via pki-common.js), publishes PEM to the
   backend API, and displays the assigned lookup code.
   Events emitted: key-published
   ============================================================================= */

(function() {
    'use strict';

    const pki = () => window.sgraphAdmin.pki;
    const msg = () => window.sgraphAdmin.messages;

    class KeyPublish extends HTMLElement {

        static get appId()    { return 'key-publish'; }
        static get navLabel() { return 'Publish'; }
        static get navIcon()  { return '\uD83D\uDCE4'; }

        constructor() {
            super();
            this._keys    = [];
            this._loading = true;
            this._boundHandlers = {};
        }

        connectedCallback()    { this.render(); }
        disconnectedCallback() { this.cleanup(); }

        onActivated() {
            if (!pki().hasWebCrypto()) {
                this._loading = false;
                this._renderContent();
                return;
            }
            this._loadKeys();
            this._setupEvents();
        }

        onDeactivated() { this.cleanup(); }

        _setupEvents() {
            this._boundHandlers.onDbChange = (store) => {
                if (store === 'keys') this._loadKeys();
            };
            pki().db.onChange(this._boundHandlers.onDbChange);
        }

        cleanup() {
            if (this._boundHandlers.onDbChange) pki().db.offChange(this._boundHandlers.onDbChange);
        }

        async _loadKeys() {
            this._loading = true;
            this._renderContent();
            try {
                this._keys = await pki().db.getAll('keys');
            } catch (err) {
                msg().error(`Failed to load keys: ${err.message}`);
            }
            this._loading = false;
            this._renderContent();
        }

        async _handlePublish(keyId) {
            const keyRecord = this._keys.find(k => k.id === keyId);
            if (!keyRecord) return;

            const statusEl = this.querySelector('#kp-status');
            if (statusEl) statusEl.innerHTML = '<span class="pk-spinner"></span> Publishing...';

            try {
                const publicKeyPEM  = await pki().exportPublicKeyPEM(keyRecord.publicKey);
                let signingKeyPEM   = '';
                if (keyRecord.signingPublicKey) {
                    signingKeyPEM = await pki().exportSigningKeyPEM(keyRecord.signingPublicKey);
                }

                const result = await adminAPI.publishKey(publicKeyPEM, signingKeyPEM);

                const displayCode = result.code.toUpperCase();
                if (statusEl) {
                    statusEl.innerHTML = `
                        <div class="kp-success">
                            <div class="kp-success__label">Published! Share this lookup code:</div>
                            <div class="kp-success__code">${pki().escapeHtml(displayCode)}</div>
                            <div class="kp-success__meta">Fingerprint: <code>${pki().escapeHtml(result.fingerprint)}</code></div>
                            <div class="kp-success__btns">
                                <button class="pk-btn pk-btn--primary pk-btn--xs" id="kp-copy-code" data-code="${pki().escapeHtml(displayCode)}">Copy Code</button>
                                <button class="pk-btn pk-btn--ghost pk-btn--xs" id="kp-show-qr">Show QR</button>
                            </div>
                            <div class="kp-qr" id="kp-qr-container" style="display:none"></div>
                        </div>
                    `;
                    const copyBtn = this.querySelector('#kp-copy-code');
                    if (copyBtn) {
                        copyBtn.addEventListener('click', async () => {
                            try {
                                await navigator.clipboard.writeText(displayCode);
                                msg().success(`Code ${displayCode} copied to clipboard`);
                            } catch (_) {
                                msg().error('Could not copy to clipboard');
                            }
                        });
                    }
                    const qrBtn = this.querySelector('#kp-show-qr');
                    const qrBox = this.querySelector('#kp-qr-container');
                    if (qrBtn && qrBox && window.sgraphAdmin?.qr) {
                        qrBtn.addEventListener('click', () => {
                            if (qrBox.style.display === 'none') {
                                qrBox.innerHTML = window.sgraphAdmin.qr.toSvg(displayCode, { ecl: 'medium', border: 2 });
                                qrBox.style.display = 'flex';
                                qrBtn.textContent = 'Hide QR';
                            } else {
                                qrBox.style.display = 'none';
                                qrBtn.textContent = 'Show QR';
                            }
                        });
                    }
                }

                msg().success(`Key published as ${displayCode}`);
                if (window.sgraphAdmin?.events) {
                    window.sgraphAdmin.events.emit('key-published', {
                        code: result.code, fingerprint: result.fingerprint
                    });
                }
            } catch (err) {
                if (statusEl) statusEl.innerHTML = `<span class="kp-error">${pki().escapeHtml(err.message)}</span>`;
                msg().error(`Publish failed: ${err.message}`);
            }
        }

        render() {
            this.innerHTML = `
                <style>
                    ${pki().PKI_SHARED_STYLES}
                    .kp-success         { padding: 1rem; background: var(--admin-success-bg, rgba(52,211,153,0.08)); border: 1px solid rgba(52,211,153,0.2); border-radius: var(--admin-radius, 6px); text-align: center; }
                    .kp-success__label  { font-size: var(--admin-font-size-sm, 0.875rem); color: var(--admin-text-secondary, #8b8fa7); margin-bottom: 0.5rem; }
                    .kp-success__code   { font-size: 1.75rem; font-weight: 700; font-family: var(--admin-font-mono, monospace); color: var(--admin-success, #34d399); letter-spacing: 0.12em; margin-bottom: 0.5rem; user-select: all; }
                    .kp-success__meta   { font-size: var(--admin-font-size-xs, 0.75rem); color: var(--admin-text-muted, #5e6280); margin-bottom: 0.75rem; }
                    .kp-error           { color: var(--admin-error, #f87171); }
                    .kp-qr              { margin-top: 0.75rem; display: flex; justify-content: center; }
                    .kp-qr svg          { width: 160px; height: 160px; border-radius: var(--admin-radius, 6px); }
                    .kp-success__btns   { display: flex; gap: 0.375rem; justify-content: center; }
                    .kp-field           { margin-bottom: 0.5rem; }
                    .kp-field label     { display: block; font-size: var(--admin-font-size-xs, 0.75rem); font-weight: 500; color: var(--admin-text-secondary, #8b8fa7); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.03em; }
                    .kp-field select    { width: 100%; padding: 0.4rem 0.5rem; font-size: var(--admin-font-size-sm, 0.875rem); font-family: var(--admin-font, sans-serif); color: var(--admin-text, #e4e6ef); background: var(--admin-bg, #0f1117); border: 1px solid var(--admin-border, #2e3347); border-radius: var(--admin-radius, 6px); box-sizing: border-box; }
                    .kp-field select:focus { outline: none; border-color: var(--admin-primary, #4f8ff7); }
                </style>
                <div class="pk-content"></div>
            `;
            this._renderContent();
        }

        _renderContent() {
            const el = this.querySelector('.pk-content');
            if (!el) return;

            if (!pki().hasWebCrypto()) { el.innerHTML = pki().renderInsecureContextError(); return; }
            if (this._loading) { el.innerHTML = '<div class="pk-loading"><span class="pk-spinner"></span> Loading...</div>'; return; }

            const rsaKeys = this._keys.filter(k => k.algorithm === 'RSA-OAEP');

            if (rsaKeys.length === 0) {
                el.innerHTML = `
                    <div class="pk-section">
                        <div class="pk-section__header"><h3 class="pk-section__title">Publish Key</h3></div>
                        <div class="pk-section__empty">Generate a key pair first in the Keys tab, then publish it here.</div>
                    </div>`;
                return;
            }

            const options = rsaKeys.map(k =>
                `<option value="${k.id}">${pki().escapeHtml(k.label)} — ${pki().escapeHtml(k.publicKeyFingerprint || '...')}</option>`
            ).join('');

            el.innerHTML = `
                <div class="pk-section">
                    <div class="pk-section__header"><h3 class="pk-section__title">Publish Key</h3></div>
                    <p style="font-size: var(--admin-font-size-xs); color: var(--admin-text-secondary); margin: 0 0 0.75rem;">
                        Publishing your public key to the registry lets others look it up by a short code.
                        Only the public key is sent — your private key never leaves this browser.
                    </p>
                    <div class="kp-field">
                        <label>Key pair to publish</label>
                        <select id="kp-select-key">${options}</select>
                    </div>
                    <button class="pk-btn pk-btn--primary pk-btn--sm" id="kp-btn-publish">Publish to Registry</button>
                    <div id="kp-status" style="margin-top: 0.75rem;"></div>
                </div>
            `;

            const btnPublish = this.querySelector('#kp-btn-publish');
            if (btnPublish) {
                btnPublish.addEventListener('click', () => {
                    const keyId = Number(this.querySelector('#kp-select-key').value);
                    this._handlePublish(keyId);
                });
            }
        }

        get events() { return window.sgraphAdmin?.events; }
    }

    customElements.define('key-publish', KeyPublish);
})();
