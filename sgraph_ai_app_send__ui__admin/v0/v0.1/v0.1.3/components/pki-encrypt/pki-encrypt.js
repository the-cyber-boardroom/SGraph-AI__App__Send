/* =============================================================================
   SGraph Send Admin Console — PKI Encrypt/Decrypt Component
   v0.1.3 — Encrypt & Sign / Decrypt & Verify message workflow

   Extracted from pki-manager.js (v0.1.2) during Phase 2 refactor.
   Depends on: pki-common.js (window.sgraphAdmin.pki)
   Events emitted: message-encrypted, message-decrypted
   ============================================================================= */

(function() {
    'use strict';

    const pki = () => window.sgraphAdmin.pki;

    class PKIEncrypt extends HTMLElement {

        static get appId()    { return 'pki-encrypt'; }
        static get navLabel() { return 'Encrypt'; }
        static get navIcon()  { return '\uD83D\uDD12'; }

        constructor() {
            super();
            this._keys     = [];
            this._contacts = [];
            this._loading  = true;
            this._boundHandlers = {};
        }

        connectedCallback() {
            this.render();
        }

        disconnectedCallback() {
            this.cleanup();
        }

        onActivated() {
            if (!pki().hasWebCrypto()) {
                this._loading = false;
                this._renderContent();
                return;
            }
            this._loadData();
            this._setupEvents();
        }

        onDeactivated() {
            this.cleanup();
        }

        // --- Events --------------------------------------------------------------

        _setupEvents() {
            this._boundHandlers.onDbChange = () => this._loadData();
            pki().db.onChange(this._boundHandlers.onDbChange);
        }

        cleanup() {
            if (this._boundHandlers.onDbChange) pki().db.offChange(this._boundHandlers.onDbChange);
        }

        // --- Data ----------------------------------------------------------------

        async _loadData() {
            this._loading = true;
            this._renderContent();
            try {
                this._keys     = await pki().db.getAll('keys');
                this._contacts = await pki().db.getAll('contacts');
            } catch (err) {
                window.sgraphAdmin.messages.error(`Failed to load data: ${err.message}`);
            }
            this._loading = false;
            this._renderContent();
        }

        // --- Encrypt & Sign ------------------------------------------------------

        async _handleEncrypt(contactId, signingKeyId, plaintext) {
            const outputEl = this.querySelector('#pe-encrypt-output');
            if (!outputEl) return;
            const msg = window.sgraphAdmin.messages;

            const contact = this._contacts.find(c => c.id === contactId);
            if (!contact) { outputEl.textContent = 'No contact selected'; return; }

            try {
                const { wrappedKey, iv, encrypted } = await pki().hybridEncrypt(contact.publicKey, plaintext);

                const payload = {
                    v: 2,
                    w: pki().arrayBufToB64(wrappedKey),
                    i: pki().arrayBufToB64(iv.buffer),
                    c: pki().arrayBufToB64(encrypted),
                };

                const senderKey = this._keys.find(k => k.id === signingKeyId);
                if (senderKey && senderKey.signingKey) {
                    const dataToSign = pki().b64ToArrayBuf(payload.c);
                    const signature  = await crypto.subtle.sign(
                        { name: 'ECDSA', hash: 'SHA-256' }, senderKey.signingKey, dataToSign
                    );
                    payload.s = pki().arrayBufToB64(signature);
                    payload.f = senderKey.signingFingerprint;
                }

                const encoded = btoa(JSON.stringify(payload));
                outputEl.innerHTML = `<span>${encoded}</span>`;
                if (!payload.s) {
                    outputEl.innerHTML += `<div class="pe-verify pe-verify--info" style="margin-top:0.375rem">Not signed — your key was created before signing was available. To enable signing, generate a new key pair.</div>`;
                }

                try {
                    await navigator.clipboard.writeText(encoded);
                    const signed = payload.s ? ' (signed)' : '';
                    msg.success(`Encrypted${signed} payload copied to clipboard`);
                } catch (_) {
                    msg.success('Encrypted. Select and copy the payload manually.');
                }

                if (this.events) this.events.emit('message-encrypted', { recipientFingerprint: contact.publicKeyFingerprint, payloadSize: encoded.length });
            } catch (err) {
                outputEl.textContent = `Error: ${err.message}`;
                msg.error(`Encrypt failed: ${err.message}`);
            }
        }

        // --- Decrypt & Verify ----------------------------------------------------

        async _handleDecrypt(keyId, encodedPayload) {
            const outputEl = this.querySelector('#pe-decrypt-output');
            if (!outputEl) return;
            const msg = window.sgraphAdmin.messages;

            const keyRecord = this._keys.find(k => k.id === keyId);
            if (!keyRecord) { outputEl.textContent = 'No key selected'; return; }

            // Step 1: Decode and parse the payload
            let payload;
            try {
                payload = JSON.parse(atob(encodedPayload));
            } catch (_) {
                const errMsg = 'Invalid payload — the pasted text is not a valid encrypted message';
                outputEl.innerHTML = `<span class="pe-fail">${pki().escapeHtml(errMsg)}</span>`;
                msg.error(errMsg);
                return;
            }

            if (payload.v !== 1 && payload.v !== 2) {
                const errMsg = `Unsupported payload version: v${payload.v}`;
                outputEl.innerHTML = `<span class="pe-fail">${pki().escapeHtml(errMsg)}</span>`;
                msg.error(errMsg);
                return;
            }

            // Step 2: Decrypt
            let decrypted;
            try {
                const wrappedKey = pki().b64ToArrayBuf(payload.w);
                const iv         = new Uint8Array(pki().b64ToArrayBuf(payload.i));
                const encrypted  = pki().b64ToArrayBuf(payload.c);
                decrypted        = await pki().hybridDecrypt(keyRecord.privateKey, wrappedKey, iv, encrypted);
            } catch (_) {
                const errMsg = 'Decryption failed — this message was not encrypted with this key pair';
                outputEl.innerHTML = `<span class="pe-fail">${pki().escapeHtml(errMsg)}</span>`;
                msg.error(errMsg);
                return;
            }

            // Step 3: Verify signature
            let verifyHtml = '';
            if (payload.s && payload.f) {
                const sender = this._contacts.find(c => c.signingFingerprint === payload.f);
                if (sender && sender.signingPublicKey) {
                    try {
                        const sigBuf       = pki().b64ToArrayBuf(payload.s);
                        const dataToVerify = pki().b64ToArrayBuf(payload.c);
                        const valid = await crypto.subtle.verify(
                            { name: 'ECDSA', hash: 'SHA-256' }, sender.signingPublicKey, sigBuf, dataToVerify
                        );
                        verifyHtml = valid
                            ? `<div class="pe-verify pe-verify--ok">Signed by <strong>${pki().escapeHtml(sender.label)}</strong> — signature verified</div>`
                            : `<div class="pe-verify pe-verify--fail">Signature INVALID — message may be tampered</div>`;
                    } catch (_) {
                        verifyHtml = `<div class="pe-verify pe-verify--fail">Signature verification error</div>`;
                    }
                } else {
                    verifyHtml = `<div class="pe-verify pe-verify--unknown">Signed (fingerprint: ${pki().escapeHtml(payload.f)}) — sender not in your contacts</div>`;
                }
            } else {
                verifyHtml = `<div class="pe-verify pe-verify--info">No signature — sender's key was created before signing was available. Confidentiality is intact.</div>`;
            }

            outputEl.innerHTML = `<span class="pe-pass">${pki().escapeHtml(decrypted)}</span>${verifyHtml}`;
            msg.success('Message decrypted successfully');
            if (this.events) this.events.emit('message-decrypted', { senderFingerprint: payload.f || null, verified: verifyHtml.includes('verified') });
        }

        // --- Test round-trip -----------------------------------------------------

        async _handleTestRoundtrip(keyId, plaintext) {
            const resultEl = this.querySelector('#pe-test-result');
            const cipherEl = this.querySelector('#pe-test-ciphertext');
            if (!resultEl || !cipherEl) return;

            const keyRecord = this._keys.find(k => k.id === keyId);
            if (!keyRecord)                       { resultEl.innerHTML = '<span class="pe-fail">No key selected</span>'; return; }
            if (keyRecord.algorithm !== 'RSA-OAEP') { resultEl.innerHTML = '<span class="pe-fail">Encrypt/decrypt test only supports RSA-OAEP keys</span>'; return; }

            try {
                const { wrappedKey, iv, encrypted } = await pki().hybridEncrypt(keyRecord.publicKey, plaintext);
                const wrappedB64 = btoa(String.fromCharCode(...new Uint8Array(wrappedKey)));
                cipherEl.textContent = wrappedB64.substring(0, 80) + '...';
                const decrypted = await pki().hybridDecrypt(keyRecord.privateKey, wrappedKey, iv, encrypted);
                const match = decrypted === plaintext;
                resultEl.innerHTML = match
                    ? `<span class="pe-pass">&#10003; "${pki().escapeHtml(decrypted)}"<br>Round-trip successful. Keys working correctly.</span>`
                    : `<span class="pe-fail">&#10007; Decrypted text does not match original</span>`;
            } catch (err) {
                resultEl.innerHTML = `<span class="pe-fail">&#10007; ${pki().escapeHtml(err.message)}</span>`;
            }
        }

        // --- Render --------------------------------------------------------------

        render() {
            this.innerHTML = `
                <style>
                    ${pki().PKI_SHARED_STYLES}
                    .pe-grid    { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem; }
                    .pe-field   { margin-bottom: 0.5rem; }
                    .pe-field label { display: block; font-size: var(--admin-font-size-xs, 0.75rem); font-weight: 500; color: var(--admin-text-secondary, #8b8fa7); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.03em; }
                    .pe-field select, .pe-field textarea { width: 100%; padding: 0.4rem 0.5rem; font-size: var(--admin-font-size-sm, 0.875rem); font-family: var(--admin-font, sans-serif); color: var(--admin-text, #e4e6ef); background: var(--admin-bg, #0f1117); border: 1px solid var(--admin-border, #2e3347); border-radius: var(--admin-radius, 6px); box-sizing: border-box; }
                    .pe-field textarea { font-family: var(--admin-font-mono, monospace); font-size: var(--admin-font-size-xs, 0.75rem); resize: vertical; }
                    .pe-field select:focus, .pe-field textarea:focus { outline: none; border-color: var(--admin-primary, #4f8ff7); }
                    .pe-output  { margin-top: 0.5rem; padding: 0.5rem 0.625rem; background: var(--admin-bg, #0f1117); border: 1px solid var(--admin-border-subtle, #252838); border-radius: var(--admin-radius, 6px); font-family: var(--admin-font-mono, monospace); font-size: var(--admin-font-size-xs, 0.75rem); color: var(--admin-text-muted, #5e6280); word-break: break-all; min-height: 1.25rem; max-height: 6rem; overflow-y: auto; user-select: all; }
                    .pe-pass    { color: var(--admin-success, #34d399); }
                    .pe-fail    { color: var(--admin-error, #f87171); }
                    .pe-verify  { margin-top: 0.375rem; padding: 0.25rem 0.5rem; border-radius: var(--admin-radius, 6px); font-size: var(--admin-font-size-xs, 0.75rem); line-height: 1.4; }
                    .pe-verify--ok      { background: var(--admin-success-bg, rgba(52,211,153,0.1)); color: var(--admin-success, #34d399); border: 1px solid rgba(52,211,153,0.2); }
                    .pe-verify--fail    { background: var(--admin-error-bg, rgba(248,113,113,0.1)); color: var(--admin-error, #f87171); border: 1px solid rgba(248,113,113,0.2); }
                    .pe-verify--unknown { background: var(--admin-warning-bg, rgba(251,191,36,0.1)); color: var(--admin-warning, #fbbf24); border: 1px solid rgba(251,191,36,0.15); }
                    .pe-verify--info    { background: var(--admin-primary-bg, rgba(79,143,247,0.1)); color: var(--admin-text-secondary, #8b8fa7); border: 1px solid rgba(79,143,247,0.15); }
                    .pe-test-subtitle { font-size: var(--admin-font-size-xs, 0.75rem); color: var(--admin-text-secondary, #8b8fa7); margin: 0 0 0.5rem; }
                    @media (max-width: 768px) { .pe-grid { grid-template-columns: 1fr; } }
                </style>
                <div class="pk-content"></div>
            `;
            this._renderContent();
        }

        _renderContent() {
            const el = this.querySelector('.pk-content');
            if (!el) return;

            if (!pki().hasWebCrypto()) { el.innerHTML = pki().renderInsecureContextError(); return; }
            if (this._loading) { el.innerHTML = `<div class="pk-loading"><span class="pk-spinner"></span> Loading...</div>`; return; }

            const rsaKeys     = this._keys.filter(k => k.algorithm === 'RSA-OAEP');
            const rsaContacts = this._contacts.filter(c => c.algorithm === 'RSA-OAEP');

            el.innerHTML = `
                ${this._renderMessages(rsaKeys, rsaContacts)}
                ${this._renderTest(rsaKeys)}
            `;
            this._wireEvents();
        }

        _renderMessages(rsaKeys, rsaContacts) {
            if (rsaKeys.length === 0 && rsaContacts.length === 0) {
                return `<div class="pk-section"><div class="pk-section__header"><h3 class="pk-section__title">Encrypt & Decrypt</h3></div><div class="pk-section__empty">Generate a key pair and import a contact to use encryption.</div></div>`;
            }

            const contactOpts = rsaContacts.map(c => `<option value="${c.id}">${pki().escapeHtml(c.label)}</option>`).join('');
            const keyOpts     = rsaKeys.map(k => `<option value="${k.id}">${pki().escapeHtml(k.label)}${k.signingKey ? '' : ' (no signing)'}</option>`).join('');

            return `
                <div class="pe-grid">
                    <div>
                        <div class="pk-section">
                            <div class="pk-section__header"><h3 class="pk-section__title">Encrypt & Sign</h3></div>
                            ${rsaContacts.length > 0 && rsaKeys.length > 0 ? `
                                <div class="pe-field"><label>To (recipient)</label><select id="pe-encrypt-contact">${contactOpts}</select></div>
                                <div class="pe-field"><label>From (sign with your key)</label><select id="pe-encrypt-signer">${keyOpts}</select></div>
                                <div class="pe-field"><label>Message</label><textarea id="pe-encrypt-plaintext" rows="3" placeholder="Type your message here..."></textarea></div>
                                <button class="pk-btn pk-btn--primary pk-btn--sm" id="pe-btn-encrypt">Encrypt, Sign & Copy</button>
                                <div class="pe-field"><label>Encrypted payload</label><div class="pe-output" id="pe-encrypt-output">—</div></div>
                            ` : rsaContacts.length === 0
                                ? '<div class="pk-section__empty">Import a contact\'s public key to encrypt messages</div>'
                                : '<div class="pk-section__empty">Generate a key pair to sign messages</div>'}
                        </div>
                    </div>
                    <div>
                        <div class="pk-section">
                            <div class="pk-section__header"><h3 class="pk-section__title">Decrypt & Verify</h3></div>
                            ${rsaKeys.length > 0 ? `
                                <div class="pe-field"><label>With (your key pair)</label><select id="pe-decrypt-key">${keyOpts}</select></div>
                                <div class="pe-field"><label>Paste encrypted payload</label><textarea id="pe-decrypt-payload" rows="3" placeholder="Paste the encrypted payload here..."></textarea></div>
                                <button class="pk-btn pk-btn--primary pk-btn--sm" id="pe-btn-decrypt">Decrypt & Verify</button>
                                <div class="pe-field"><label>Decrypted message</label><div class="pe-output" id="pe-decrypt-output">—</div></div>
                            ` : '<div class="pk-section__empty">Generate a key pair to decrypt messages</div>'}
                        </div>
                    </div>
                </div>
            `;
        }

        _renderTest(rsaKeys) {
            if (rsaKeys.length === 0) return '';

            const options = rsaKeys.map(k => `<option value="${k.id}">${pki().escapeHtml(k.label)}</option>`).join('');
            return `
                <div class="pk-section">
                    <div class="pk-section__header"><h3 class="pk-section__title">Test</h3></div>
                    <p class="pe-test-subtitle">Encrypt / Decrypt round-trip test</p>
                    <div class="pe-field"><label>Key pair</label><select id="pe-test-key">${options}</select></div>
                    <div class="pe-field"><label>Plaintext</label><textarea id="pe-test-plaintext" rows="2" placeholder="Hello, this is a test message."></textarea></div>
                    <button class="pk-btn pk-btn--primary pk-btn--sm" id="pe-btn-test">Encrypt with Public Key, then Decrypt with Private Key</button>
                    <div class="pe-field"><label>Ciphertext (wrapped key, base64 excerpt)</label><div class="pe-output" id="pe-test-ciphertext">—</div></div>
                    <div class="pe-field"><label>Result</label><div class="pe-output" id="pe-test-result">—</div></div>
                </div>
            `;
        }

        _wireEvents() {
            const btnEncrypt = this.querySelector('#pe-btn-encrypt');
            if (btnEncrypt) {
                btnEncrypt.addEventListener('click', () => {
                    const contactId = Number(this.querySelector('#pe-encrypt-contact').value);
                    const signerId  = Number(this.querySelector('#pe-encrypt-signer').value);
                    const plaintext = this.querySelector('#pe-encrypt-plaintext').value.trim();
                    if (!plaintext) { window.sgraphAdmin.messages.warning('Type a message first'); return; }
                    this._handleEncrypt(contactId, signerId, plaintext);
                });
            }

            const btnDecrypt = this.querySelector('#pe-btn-decrypt');
            if (btnDecrypt) {
                btnDecrypt.addEventListener('click', () => {
                    const keyId   = Number(this.querySelector('#pe-decrypt-key').value);
                    const payload = this.querySelector('#pe-decrypt-payload').value.trim();
                    if (!payload) { window.sgraphAdmin.messages.warning('Paste an encrypted payload first'); return; }
                    this._handleDecrypt(keyId, payload);
                });
            }

            const btnTest = this.querySelector('#pe-btn-test');
            if (btnTest) {
                btnTest.addEventListener('click', () => {
                    const keyId     = Number(this.querySelector('#pe-test-key').value);
                    const plaintext = this.querySelector('#pe-test-plaintext').value || 'Hello, this is a test message.';
                    this._handleTestRoundtrip(keyId, plaintext);
                });
            }
        }

        get events() { return window.sgraphAdmin?.events; }
    }

    customElements.define('pki-encrypt', PKIEncrypt);
})();
