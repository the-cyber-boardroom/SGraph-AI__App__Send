/* =============================================================================
   SGraph Send Admin Console — Key Lookup Component
   v0.1.3 — Look up a public key by code and import to contacts

   User enters a lookup code (e.g. DC-7X4F), the component fetches the
   public key from the registry, displays details, and allows import
   into local IndexedDB contacts.
   Events emitted: contact-imported
   ============================================================================= */

(function() {
    'use strict';

    const pki = () => window.sgraphAdmin.pki;
    const msg = () => window.sgraphAdmin.messages;

    class KeyLookup extends HTMLElement {

        static get appId()    { return 'key-lookup'; }
        static get navLabel() { return 'Lookup'; }
        static get navIcon()  { return '\uD83D\uDD0D'; }

        constructor() {
            super();
            this._result = null;
        }

        connectedCallback()    { this.render(); }
        disconnectedCallback() {}

        onActivated()   { this._renderContent(); }
        onDeactivated() { this._result = null; }

        async _handleLookup(code) {
            const resultEl = this.querySelector('#kl-result');
            if (!resultEl) return;

            resultEl.innerHTML = '<span class="pk-spinner"></span> Looking up...';

            try {
                const entry = await adminAPI.lookupKey(code);
                this._result = entry;

                const displayCode = entry.code.toUpperCase();
                resultEl.innerHTML = `
                    <div class="kl-entry">
                        <div class="kl-entry__header">
                            <span class="kl-entry__code">${pki().escapeHtml(displayCode)}</span>
                            <span class="pk-badge pk-badge--secure">${pki().escapeHtml(entry.algorithm)}</span>
                            ${entry.signing_key_pem ? '<span class="pk-badge pk-badge--secure">signing</span>' : ''}
                        </div>
                        <div class="kl-entry__meta">
                            <div>Fingerprint: <code>${pki().escapeHtml(entry.fingerprint)}</code></div>
                            <div>Published: ${pki().formatDate(entry.created)}</div>
                        </div>
                        <div class="kl-import">
                            <div class="kl-field">
                                <label>Label for this contact</label>
                                <input type="text" id="kl-import-label" placeholder="e.g. Alice — Investor Group" autocomplete="off">
                            </div>
                            <button class="pk-btn pk-btn--primary pk-btn--sm" id="kl-btn-import">Import to My Contacts</button>
                        </div>
                    </div>
                `;

                const btnImport = this.querySelector('#kl-btn-import');
                if (btnImport) {
                    btnImport.addEventListener('click', () => {
                        const label = this.querySelector('#kl-import-label').value.trim() || `Contact ${displayCode}`;
                        this._handleImport(entry, label);
                    });
                }

                msg().success(`Key found: ${displayCode}`);
            } catch (err) {
                resultEl.innerHTML = `<div class="kl-not-found">No key found for code "${pki().escapeHtml(code.toUpperCase())}"</div>`;
                msg().error(`Lookup failed: ${err.message}`);
            }
        }

        async _handleImport(entry, label) {
            try {
                const publicKey   = await pki().importPublicKeyPEM(entry.public_key_pem);
                const fingerprint = await pki().computeFingerprint(publicKey);

                let signingPublicKey = null, signingPublicKeyPEM = null, signingFingerprint = null;
                if (entry.signing_key_pem) {
                    signingPublicKey    = await pki().importSigningKeyPEM(entry.signing_key_pem);
                    signingPublicKeyPEM = entry.signing_key_pem;
                    signingFingerprint  = await pki().computeFingerprint(signingPublicKey);
                }

                await pki().db.add('contacts', {
                    label, imported: new Date().toISOString(),
                    algorithm: publicKey.algorithm.name,
                    publicKey, publicKeyFingerprint: fingerprint,
                    publicKeyPEM: entry.public_key_pem,
                    signingPublicKey, signingPublicKeyPEM, signingFingerprint,
                    source: 'registry',
                    registryCode: entry.code,
                });

                const displayCode = entry.code.toUpperCase();
                msg().success(`Contact '${label}' imported from registry (${displayCode})`);
                if (window.sgraphAdmin?.events) {
                    window.sgraphAdmin.events.emit('contact-imported', {
                        fingerprint, source: 'registry', code: entry.code
                    });
                }

                // Reset result
                this._result = null;
                this._renderContent();
            } catch (err) {
                msg().error(`Import failed: ${err.message}`);
            }
        }

        render() {
            this.innerHTML = `
                <style>
                    ${pki().PKI_SHARED_STYLES}
                    .kl-field           { margin-bottom: 0.5rem; }
                    .kl-field label     { display: block; font-size: var(--admin-font-size-xs, 0.75rem); font-weight: 500; color: var(--admin-text-secondary, #8b8fa7); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.03em; }
                    .kl-field input     { width: 100%; padding: 0.4rem 0.5rem; font-size: var(--admin-font-size-sm, 0.875rem); font-family: var(--admin-font, sans-serif); color: var(--admin-text, #e4e6ef); background: var(--admin-bg, #0f1117); border: 1px solid var(--admin-border, #2e3347); border-radius: var(--admin-radius, 6px); box-sizing: border-box; }
                    .kl-field input:focus { outline: none; border-color: var(--admin-primary, #4f8ff7); }
                    .kl-code-input      { font-family: var(--admin-font-mono, monospace) !important; font-size: 1.25rem !important; letter-spacing: 0.1em; text-transform: uppercase; text-align: center; max-width: 200px; }
                    .kl-entry           { padding: 0.75rem; background: var(--admin-surface, #1a1d2e); border: 1px solid var(--admin-border, #2e3347); border-radius: var(--admin-radius, 6px); }
                    .kl-entry__header   { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
                    .kl-entry__code     { font-size: 1.125rem; font-weight: 700; font-family: var(--admin-font-mono, monospace); color: var(--admin-primary, #4f8ff7); letter-spacing: 0.08em; }
                    .kl-entry__meta     { font-size: var(--admin-font-size-xs, 0.75rem); color: var(--admin-text-muted, #5e6280); margin-bottom: 0.75rem; line-height: 1.6; }
                    .kl-import          { border-top: 1px solid var(--admin-border-subtle, #252838); padding-top: 0.75rem; margin-top: 0.5rem; }
                    .kl-not-found       { padding: 0.75rem; background: var(--admin-warning-bg, rgba(251,191,36,0.08)); border: 1px solid rgba(251,191,36,0.15); border-radius: var(--admin-radius, 6px); color: var(--admin-warning, #fbbf24); font-size: var(--admin-font-size-sm, 0.875rem); }
                </style>
                <div class="pk-content"></div>
            `;
            this._renderContent();
        }

        _renderContent() {
            const el = this.querySelector('.pk-content');
            if (!el) return;

            el.innerHTML = `
                <div class="pk-section">
                    <div class="pk-section__header"><h3 class="pk-section__title">Lookup Key</h3></div>
                    <p style="font-size: var(--admin-font-size-xs); color: var(--admin-text-secondary); margin: 0 0 0.75rem;">
                        Enter a lookup code to find and import a contact's public key from the registry.
                    </p>
                    <div class="kl-field" style="display: flex; gap: 0.5rem; align-items: flex-end;">
                        <div style="flex: 0 0 auto;">
                            <label>Lookup code</label>
                            <input type="text" id="kl-code-input" class="kl-code-input" placeholder="DC-7X4F" maxlength="7" autocomplete="off">
                        </div>
                        <button class="pk-btn pk-btn--primary pk-btn--sm" id="kl-btn-lookup">Lookup</button>
                    </div>
                    <div id="kl-result" style="margin-top: 0.75rem;"></div>
                </div>
            `;

            const btnLookup  = this.querySelector('#kl-btn-lookup');
            const codeInput  = this.querySelector('#kl-code-input');

            if (btnLookup) {
                btnLookup.addEventListener('click', () => {
                    const code = codeInput.value.trim();
                    if (!code) { msg().warning('Enter a lookup code first'); return; }
                    this._handleLookup(code);
                });
            }

            if (codeInput) {
                codeInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const code = codeInput.value.trim();
                        if (code) this._handleLookup(code);
                    }
                });
            }
        }
    }

    customElements.define('key-lookup', KeyLookup);
})();
