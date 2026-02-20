/* =============================================================================
   SGraph Send Admin Console — PKI Key Manager Web Component
   v0.1.2 — Genesis: client-side PKI key management

   Features:
     - Generate RSA-OAEP 4096-bit key pairs (non-extractable private keys)
     - Generate ECDSA P-256 signing key pairs alongside encryption keys
     - Store keys in IndexedDB (sg-send-pki)
     - Export/import public key bundles (JSON: encrypt + sign)
     - SHA-256 fingerprints for key identification
     - Hybrid encryption (RSA-OAEP wraps AES-256-GCM)
     - Digital signatures (ECDSA P-256) for sender authentication
     - Contacts store for imported public keys
     - Encrypt & Sign / Decrypt & Verify message workflow
     - Payload v2: encrypted + signed, backwards-compatible with v1
     - Browser capability detection

   Usage:
     <pki-manager></pki-manager>

   Dependencies: Web Crypto API, IndexedDB (native browser only)
   ============================================================================= */

class PKIManager extends HTMLElement {

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._db           = null;
        this._keys         = [];
        this._contacts     = [];
        this._loading      = true;
        this._generating   = false;
        this._toast        = null;
        this._toastTimer   = null;
    }

    connectedCallback() {
        this.render();

        // Web Crypto API requires a secure context (HTTPS or localhost).
        // Accessing via 0.0.0.0 or a plain HTTP IP will make crypto.subtle undefined.
        if (!this._hasWebCrypto()) {
            this._loading = false;
            this._renderInsecureContextError();
            return;
        }

        this._initDB();
    }

    _hasWebCrypto() {
        return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
    }

    _renderInsecureContextError() {
        const el = this.shadowRoot.querySelector('#content');
        if (!el) return;
        const currentUrl  = location.href;
        const localhostUrl = currentUrl.replace(location.hostname, 'localhost');
        el.innerHTML = `
            ${this._renderHeader()}
            <section class="section">
                <div class="insecure-context">
                    <div class="insecure-context__icon">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="40" height="40">
                            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <div class="insecure-context__title">Secure Context Required</div>
                    <p class="insecure-context__text">
                        The Web Crypto API (<code>crypto.subtle</code>) is not available because this page
                        is being served over an insecure context.
                    </p>
                    <p class="insecure-context__text">
                        Browsers restrict <code>crypto.subtle</code> to <strong>HTTPS</strong> or <strong>localhost</strong>.
                        The current origin (<code>${this._escapeHtml(location.origin)}</code>) does not qualify.
                    </p>
                    <p class="insecure-context__fix">
                        Try accessing this page via <a href="${this._escapeAttr(localhostUrl)}">${this._escapeHtml(localhostUrl)}</a> instead.
                    </p>
                </div>
            </section>
        `;
    }

    disconnectedCallback() {
        if (this._toastTimer) clearTimeout(this._toastTimer);
        if (this._db) this._db.close();
    }

    // =========================================================================
    // IndexedDB
    // =========================================================================

    async _initDB() {
        try {
            this._db = await new Promise((resolve, reject) => {
                const req = indexedDB.open('sg-send-pki', 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('keys')) {
                        db.createObjectStore('keys', { keyPath: 'id', autoIncrement: true });
                    }
                    if (!db.objectStoreNames.contains('contacts')) {
                        db.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
                    }
                };
                req.onsuccess = () => resolve(req.result);
                req.onerror   = () => reject(req.error);
            });
            await this._loadAll();
        } catch (err) {
            this._loading = false;
            this._renderContent();
            this._showToast(`IndexedDB error: ${err.message}`, 'error');
        }
    }

    async _loadAll() {
        this._loading = true;
        this._renderContent();

        try {
            this._keys     = await this._dbGetAll('keys');
            this._contacts = await this._dbGetAll('contacts');
        } catch (err) {
            this._showToast(`Failed to load keys: ${err.message}`, 'error');
        }

        this._loading = false;
        this._renderContent();
    }

    _dbGetAll(storeName) {
        return new Promise((resolve, reject) => {
            const tx    = this._db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req   = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
    }

    _dbAdd(storeName, data) {
        return new Promise((resolve, reject) => {
            const tx    = this._db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req   = store.add(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror   = () => reject(req.error);
        });
    }

    _dbDelete(storeName, id) {
        return new Promise((resolve, reject) => {
            const tx    = this._db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const req   = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror   = () => reject(req.error);
        });
    }

    // =========================================================================
    // Web Crypto — Key Generation
    // =========================================================================

    async _generateKeyPair(label, algorithm) {
        this._generating = true;
        this._renderContent();

        try {
            const algoParams = algorithm === 'ECDH'
                ? { name: 'ECDH', namedCurve: 'P-256' }
                : { name: 'RSA-OAEP', modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

            const keyUsages = algorithm === 'ECDH'
                ? ['deriveKey', 'deriveBits']
                : ['encrypt', 'decrypt'];

            const keyPair = await crypto.subtle.generateKey(algoParams, false, keyUsages);

            const publicKeyPEM     = await this._exportPublicKeyPEM(keyPair.publicKey);
            const fingerprint      = await this._computeFingerprint(keyPair.publicKey);
            const keySize          = algorithm === 'ECDH' ? 256 : 4096;

            // Generate ECDSA P-256 signing key pair alongside the encryption key
            let signingKey = null, signingPublicKey = null, signingPublicKeyPEM = null, signingFingerprint = null;
            if (algorithm !== 'ECDH') {
                const signingPair = await crypto.subtle.generateKey(
                    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']
                );
                signingKey          = signingPair.privateKey;
                signingPublicKey    = signingPair.publicKey;
                signingPublicKeyPEM = await this._exportPublicKeyPEM(signingPair.publicKey);
                signingFingerprint  = await this._computeFingerprint(signingPair.publicKey);
            }

            await this._dbAdd('keys', {
                label,
                created     : new Date().toISOString(),
                algorithm   : algorithm === 'ECDH' ? 'ECDH' : 'RSA-OAEP',
                keySize,
                publicKey   : keyPair.publicKey,
                privateKey  : keyPair.privateKey,
                publicKeyFingerprint : fingerprint,
                publicKeyPEM,
                signingKey,
                signingPublicKey,
                signingPublicKeyPEM,
                signingFingerprint,
            });

            await this._loadAll();
            this._showToast(`Key pair '${label}' created with signing key.`, 'success');
        } catch (err) {
            this._showToast(`Key generation failed: ${err.message}`, 'error');
        }

        this._generating = false;
        this._renderContent();
    }

    // =========================================================================
    // Web Crypto — PEM Export/Import
    // =========================================================================

    async _exportPublicKeyPEM(publicKey) {
        const exported = await crypto.subtle.exportKey('spki', publicKey);
        const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
        return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
    }

    async _importPublicKeyPEM(pem) {
        const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
        const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

        // Try RSA-OAEP first, then ECDH
        try {
            return await crypto.subtle.importKey('spki', der, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
        } catch (_) {
            return await crypto.subtle.importKey('spki', der, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
        }
    }

    async _importSigningKeyPEM(pem) {
        const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
        const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        return await crypto.subtle.importKey('spki', der, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
    }

    // =========================================================================
    // Web Crypto — Fingerprint
    // =========================================================================

    async _computeFingerprint(publicKey) {
        const exported = await crypto.subtle.exportKey('spki', publicKey);
        const hash     = await crypto.subtle.digest('SHA-256', exported);
        const hex      = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
        return `sha256:${hex.substring(0, 16)}`;
    }

    // =========================================================================
    // Web Crypto — Hybrid Encryption (RSA-OAEP + AES-256-GCM)
    // =========================================================================

    async _hybridEncrypt(publicKey, plaintext) {
        const encoder = new TextEncoder();
        const data    = encoder.encode(plaintext);

        // 1. Generate random AES key
        const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

        // 2. Encrypt data with AES
        const iv        = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data);

        // 3. Wrap AES key with RSA public key
        const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);
        const wrappedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawAesKey);

        return { wrappedKey, iv, encrypted };
    }

    async _hybridDecrypt(privateKey, wrappedKey, iv, encrypted) {
        // 1. Unwrap AES key with RSA private key
        const rawAesKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wrappedKey);

        // 2. Import AES key
        const aesKey = await crypto.subtle.importKey('raw', rawAesKey, 'AES-GCM', false, ['decrypt']);

        // 3. Decrypt data
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, encrypted);

        return new TextDecoder().decode(decrypted);
    }

    // =========================================================================
    // Actions
    // =========================================================================

    _buildPublicKeyBundle(record) {
        const bundle = { v: 1, encrypt: record.publicKeyPEM };
        if (record.signingPublicKeyPEM) bundle.sign = record.signingPublicKeyPEM;
        return JSON.stringify(bundle);
    }

    async _handleCopyPublicKey(keyRecord) {
        const text = this._buildPublicKeyBundle(keyRecord);
        try {
            await navigator.clipboard.writeText(text);
            this._showToast('Public key bundle copied to clipboard', 'success');
        } catch (_) {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            this._showToast('Public key bundle copied to clipboard', 'success');
        }
    }

    async _handleDeleteKey(keyRecord) {
        const confirmed = await this._showDeleteConfirm(keyRecord.label);
        if (!confirmed) return;

        try {
            await this._dbDelete('keys', keyRecord.id);
            await this._loadAll();
            this._showToast(`Key pair '${keyRecord.label}' deleted permanently.`, 'success');
        } catch (err) {
            this._showToast(`Delete failed: ${err.message}`, 'error');
        }
    }

    async _handleDeleteContact(contact) {
        try {
            await this._dbDelete('contacts', contact.id);
            await this._loadAll();
            this._showToast(`Contact '${contact.label}' removed.`, 'success');
        } catch (err) {
            this._showToast(`Delete failed: ${err.message}`, 'error');
        }
    }

    async _handleImportPublicKey(label, rawText) {
        try {
            let encryptPEM, signPEM = null;

            // Detect JSON bundle vs legacy PEM
            const trimmed = rawText.trim();
            if (trimmed.startsWith('{')) {
                const bundle = JSON.parse(trimmed);
                encryptPEM = bundle.encrypt;
                signPEM    = bundle.sign || null;
            } else {
                encryptPEM = trimmed;
            }

            const publicKey    = await this._importPublicKeyPEM(encryptPEM);
            const fingerprint  = await this._computeFingerprint(publicKey);
            const publicKeyPEM = await this._exportPublicKeyPEM(publicKey);

            let signingPublicKey = null, signingPublicKeyPEM = null, signingFingerprint = null;
            if (signPEM) {
                signingPublicKey    = await this._importSigningKeyPEM(signPEM);
                signingPublicKeyPEM = signPEM;
                signingFingerprint  = await this._computeFingerprint(signingPublicKey);
            }

            await this._dbAdd('contacts', {
                label,
                imported            : new Date().toISOString(),
                algorithm           : publicKey.algorithm.name,
                publicKey,
                publicKeyFingerprint: fingerprint,
                publicKeyPEM,
                signingPublicKey,
                signingPublicKeyPEM,
                signingFingerprint,
                source              : 'manual',
            });

            await this._loadAll();
            const sigMsg = signingPublicKey ? ' (with signing key)' : ' (encryption only)';
            this._showToast(`Public key for '${label}' imported${sigMsg}.`, 'success');
        } catch (err) {
            this._showToast(`Import failed: ${err.message}`, 'error');
        }
    }

    async _handleTestEncryptDecrypt(keyId, plaintext) {
        const resultEl = this.shadowRoot.querySelector('#test-result');
        const cipherEl = this.shadowRoot.querySelector('#test-ciphertext');
        if (!resultEl || !cipherEl) return;

        const keyRecord = this._keys.find(k => k.id === keyId);
        if (!keyRecord) {
            resultEl.innerHTML = '<span class="test-fail">No key selected</span>';
            return;
        }

        if (keyRecord.algorithm !== 'RSA-OAEP') {
            resultEl.innerHTML = '<span class="test-fail">Encrypt/decrypt test only supports RSA-OAEP keys</span>';
            return;
        }

        try {
            // Encrypt
            const { wrappedKey, iv, encrypted } = await this._hybridEncrypt(keyRecord.publicKey, plaintext);

            // Show ciphertext (base64 of wrapped key for display)
            const wrappedB64 = btoa(String.fromCharCode(...new Uint8Array(wrappedKey)));
            cipherEl.textContent = wrappedB64.substring(0, 80) + '...';

            // Decrypt
            const decrypted = await this._hybridDecrypt(keyRecord.privateKey, wrappedKey, iv, encrypted);

            const match = decrypted === plaintext;
            resultEl.innerHTML = match
                ? `<span class="test-pass">&#10003; "${this._escapeHtml(decrypted)}"<br>Round-trip successful. Keys working correctly.</span>`
                : `<span class="test-fail">&#10007; Decrypted text does not match original</span>`;
        } catch (err) {
            resultEl.innerHTML = `<span class="test-fail">&#10007; ${this._escapeHtml(err.message)}</span>`;
        }
    }

    // =========================================================================
    // Messages — Encrypt / Decrypt
    // =========================================================================

    async _handleMessageEncrypt(contactId, signingKeyId, plaintext) {
        const outputEl = this.shadowRoot.querySelector('#msg-encrypt-output');
        if (!outputEl) return;

        const contact = this._contacts.find(c => c.id === contactId);
        if (!contact) { outputEl.textContent = 'No contact selected'; return; }

        try {
            const { wrappedKey, iv, encrypted } = await this._hybridEncrypt(contact.publicKey, plaintext);

            const payload = {
                v: 2,
                w: this._arrayBufToB64(wrappedKey),
                i: this._arrayBufToB64(iv.buffer),
                c: this._arrayBufToB64(encrypted),
            };

            // Sign the ciphertext with sender's ECDSA key if available
            const senderKey = this._keys.find(k => k.id === signingKeyId);
            if (senderKey && senderKey.signingKey) {
                const dataToSign = this._b64ToArrayBuf(payload.c);
                const signature = await crypto.subtle.sign(
                    { name: 'ECDSA', hash: 'SHA-256' }, senderKey.signingKey, dataToSign
                );
                payload.s = this._arrayBufToB64(signature);
                payload.f = senderKey.signingFingerprint;
            }

            const encoded = btoa(JSON.stringify(payload));

            outputEl.textContent = encoded;
            try {
                await navigator.clipboard.writeText(encoded);
                const signed = payload.s ? ' (signed)' : ' (unsigned)';
                this._showToast(`Encrypted${signed} payload copied to clipboard`, 'success');
            } catch (_) {
                this._showToast('Encrypted. Select and copy the payload manually.', 'success');
            }
        } catch (err) {
            outputEl.textContent = `Error: ${err.message}`;
            this._showToast(`Encrypt failed: ${err.message}`, 'error');
        }
    }

    async _handleMessageDecrypt(keyId, encodedPayload) {
        const outputEl = this.shadowRoot.querySelector('#msg-decrypt-output');
        if (!outputEl) return;

        const keyRecord = this._keys.find(k => k.id === keyId);
        if (!keyRecord) { outputEl.textContent = 'No key selected'; return; }

        try {
            const payload = JSON.parse(atob(encodedPayload));
            if (payload.v !== 1 && payload.v !== 2) throw new Error('Unsupported payload version');

            const wrappedKey = this._b64ToArrayBuf(payload.w);
            const iv         = new Uint8Array(this._b64ToArrayBuf(payload.i));
            const encrypted  = this._b64ToArrayBuf(payload.c);

            const decrypted = await this._hybridDecrypt(keyRecord.privateKey, wrappedKey, iv, encrypted);

            // Verify signature if present (v2 payload)
            let verifyHtml = '';
            if (payload.s && payload.f) {
                const senderContact = this._contacts.find(c => c.signingFingerprint === payload.f);
                if (senderContact && senderContact.signingPublicKey) {
                    try {
                        const sigBuf    = this._b64ToArrayBuf(payload.s);
                        const dataToVerify = this._b64ToArrayBuf(payload.c);
                        const valid = await crypto.subtle.verify(
                            { name: 'ECDSA', hash: 'SHA-256' }, senderContact.signingPublicKey, sigBuf, dataToVerify
                        );
                        if (valid) {
                            verifyHtml = `<div class="verify verify--ok">Signed by <strong>${this._escapeHtml(senderContact.label)}</strong> — signature verified</div>`;
                        } else {
                            verifyHtml = `<div class="verify verify--fail">Signature INVALID — message may be tampered</div>`;
                        }
                    } catch (_) {
                        verifyHtml = `<div class="verify verify--fail">Signature verification error</div>`;
                    }
                } else {
                    verifyHtml = `<div class="verify verify--unknown">Signed (fingerprint: ${this._escapeHtml(payload.f)}) — sender not in contacts</div>`;
                }
            } else {
                verifyHtml = `<div class="verify verify--unsigned">Unsigned message (v${payload.v}) — sender not authenticated</div>`;
            }

            outputEl.innerHTML = `<span class="test-pass">${this._escapeHtml(decrypted)}</span>${verifyHtml}`;
            this._showToast('Message decrypted successfully', 'success');
        } catch (err) {
            outputEl.innerHTML = `<span class="test-fail">Error: ${this._escapeHtml(err.message)}</span>`;
            this._showToast(`Decrypt failed: ${err.message}`, 'error');
        }
    }

    _arrayBufToB64(buf) {
        return btoa(String.fromCharCode(...new Uint8Array(buf)));
    }

    _b64ToArrayBuf(b64) {
        const bin = atob(b64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return buf.buffer;
    }

    // =========================================================================
    // UI Helpers
    // =========================================================================

    _showToast(message, type) {
        if (this._toastTimer) clearTimeout(this._toastTimer);
        this._toast = { message, type };
        this._renderToast();
        this._toastTimer = setTimeout(() => {
            this._toast = null;
            this._renderToast();
        }, 4000);
    }

    _renderToast() {
        const el = this.shadowRoot.querySelector('#toast');
        if (!el) return;
        if (!this._toast) {
            el.innerHTML = '';
            return;
        }
        el.innerHTML = `<div class="toast toast--${this._toast.type}">${this._escapeHtml(this._toast.message)}</div>`;
    }

    _showDeleteConfirm(label) {
        return new Promise((resolve) => {
            const overlay = this.shadowRoot.querySelector('#modal-overlay');
            if (!overlay) return resolve(false);

            overlay.innerHTML = `
                <div class="modal-backdrop">
                    <div class="modal">
                        <div class="modal__title">Delete "${this._escapeHtml(label)}"?</div>
                        <p class="modal__text">
                            This will permanently delete both the public AND private key from this browser.
                        </p>
                        <p class="modal__warning">This cannot be undone. Any content encrypted with this key pair will become permanently unreadable.</p>
                        <div class="modal__field">
                            <label>Type "delete" to confirm:</label>
                            <input type="text" id="delete-confirm-input" autocomplete="off">
                        </div>
                        <div class="modal__actions">
                            <button class="btn btn--ghost btn--sm" id="modal-cancel">Cancel</button>
                            <button class="btn btn--danger btn--sm" id="modal-confirm" disabled>Delete Forever</button>
                        </div>
                    </div>
                </div>
            `;

            const input   = overlay.querySelector('#delete-confirm-input');
            const confirm = overlay.querySelector('#modal-confirm');
            const cancel  = overlay.querySelector('#modal-cancel');

            input.addEventListener('input', () => {
                confirm.disabled = input.value.toLowerCase() !== 'delete';
            });

            confirm.addEventListener('click', () => {
                overlay.innerHTML = '';
                resolve(true);
            });

            cancel.addEventListener('click', () => {
                overlay.innerHTML = '';
                resolve(false);
            });

            overlay.querySelector('.modal-backdrop').addEventListener('click', (e) => {
                if (e.target === e.currentTarget) {
                    overlay.innerHTML = '';
                    resolve(false);
                }
            });

            input.focus();
        });
    }

    _showGenerateModal() {
        const overlay = this.shadowRoot.querySelector('#modal-overlay');
        if (!overlay) return;

        overlay.innerHTML = `
            <div class="modal-backdrop">
                <div class="modal">
                    <div class="modal__title">Generate New Key Pair</div>
                    <div class="modal__field">
                        <label for="gen-label">Label</label>
                        <input type="text" id="gen-label" placeholder="e.g. My Work Key" autocomplete="off">
                    </div>
                    <div class="modal__field">
                        <label>Algorithm</label>
                        <div class="radio-group">
                            <label class="radio"><input type="radio" name="gen-algo" value="RSA-OAEP" checked> RSA-OAEP 4096-bit</label>
                            <label class="radio"><input type="radio" name="gen-algo" value="ECDH"> ECDH P-256</label>
                        </div>
                    </div>
                    <p class="modal__info">Your private key will be stored securely in this browser. It cannot be exported or read by any code, including ours.</p>
                    <div class="modal__actions">
                        <button class="btn btn--ghost btn--sm" id="modal-cancel">Cancel</button>
                        <button class="btn btn--primary btn--sm" id="modal-confirm">Generate</button>
                    </div>
                </div>
            </div>
        `;

        const input   = overlay.querySelector('#gen-label');
        const confirm = overlay.querySelector('#modal-confirm');
        const cancel  = overlay.querySelector('#modal-cancel');

        confirm.addEventListener('click', () => {
            const label = input.value.trim() || 'Untitled';
            const algo  = overlay.querySelector('input[name="gen-algo"]:checked').value;
            overlay.innerHTML = '';
            this._generateKeyPair(label, algo);
        });

        cancel.addEventListener('click', () => { overlay.innerHTML = ''; });

        overlay.querySelector('.modal-backdrop').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) overlay.innerHTML = '';
        });

        input.focus();
    }

    _showImportModal() {
        const overlay = this.shadowRoot.querySelector('#modal-overlay');
        if (!overlay) return;

        overlay.innerHTML = `
            <div class="modal-backdrop">
                <div class="modal">
                    <div class="modal__title">Import Public Key</div>
                    <div class="modal__field">
                        <label for="import-label">Label</label>
                        <input type="text" id="import-label" placeholder="e.g. Alice - Investor Group" autocomplete="off">
                    </div>
                    <div class="modal__field">
                        <label for="import-pem">Paste key bundle (JSON) or PEM</label>
                        <textarea id="import-pem" rows="8" placeholder='{"v":1,"encrypt":"-----BEGIN PUBLIC KEY-----...","sign":"-----BEGIN PUBLIC KEY-----..."}'></textarea>
                    </div>
                    <div class="modal__actions">
                        <button class="btn btn--ghost btn--sm" id="modal-cancel">Cancel</button>
                        <button class="btn btn--primary btn--sm" id="modal-confirm">Import</button>
                    </div>
                </div>
            </div>
        `;

        const labelInput = overlay.querySelector('#import-label');
        const pemInput   = overlay.querySelector('#import-pem');
        const confirm    = overlay.querySelector('#modal-confirm');
        const cancel     = overlay.querySelector('#modal-cancel');

        confirm.addEventListener('click', () => {
            const label = labelInput.value.trim() || 'Untitled Contact';
            const pem   = pemInput.value.trim();
            if (!pem) return;
            overlay.innerHTML = '';
            this._handleImportPublicKey(label, pem);
        });

        cancel.addEventListener('click', () => { overlay.innerHTML = ''; });

        overlay.querySelector('.modal-backdrop').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) overlay.innerHTML = '';
        });

        labelInput.focus();
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    _escapeAttr(str) {
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    _formatDate(isoStr) {
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                 + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        } catch (_) {
            return isoStr;
        }
    }

    // =========================================================================
    // Render
    // =========================================================================

    render() {
        this.shadowRoot.innerHTML = `
            <style>${PKIManager.styles}</style>
            <div class="pki">
                <div id="toast"></div>
                <div id="modal-overlay"></div>
                <div id="content"></div>
            </div>
        `;
        this._renderContent();
    }

    _renderContent() {
        const el = this.shadowRoot.querySelector('#content');
        if (!el) return;

        if (this._loading) {
            el.innerHTML = `
                ${this._renderHeader()}
                <div class="loading"><span class="spinner"></span> Loading keys...</div>
            `;
            return;
        }

        el.innerHTML = `
            ${this._renderHeader()}

            <div class="layout-grid">
                <div class="layout-grid__col">${this._renderMyKeys()}</div>
                <div class="layout-grid__col">${this._renderContacts()}</div>
            </div>
            ${this._renderMessages()}
            ${this._renderTest()}
            ${this._renderInfo()}
        `;

        this._wireEvents();
    }

    // --- Header with Brand ---

    _renderHeader() {
        return `
            <div class="panel-header">
                <div class="panel-header__brand">
                    <h2 class="panel-header__title">
                        <span class="brand">SG<span class="brand__slash">/</span>Send</span>
                        <span class="panel-header__subtitle">PKI</span>
                    </h2>
                </div>
                <a href="index.html" class="btn btn--ghost btn--sm">Back to Admin</a>
            </div>
        `;
    }

    // --- My Keys Section ---

    _renderMyKeys() {
        if (this._keys.length === 0 && !this._generating) {
            return `
                <section class="section">
                    <div class="section__header">
                        <h3 class="section__title">My Keys</h3>
                    </div>
                    <div class="empty-state">
                        <div class="empty-state__icon">
                            <svg viewBox="0 0 20 20" fill="currentColor" width="24" height="24">
                                <path fill-rule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clip-rule="evenodd"/>
                            </svg>
                        </div>
                        <div class="empty-state__text">No keys yet</div>
                        <div class="empty-state__hint">Generate a key pair to start.</div>
                        <button class="btn btn--primary btn--sm" id="btn-generate-first">Generate Key Pair</button>
                    </div>
                </section>
            `;
        }

        const keyCards = this._keys.map(k => `
            <div class="key-card" data-key-id="${k.id}">
                <div class="key-card__header">
                    <div class="key-card__icon">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
                            <path fill-rule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <div class="key-card__info">
                        <div class="key-card__label">${this._escapeHtml(k.label)}</div>
                        <div class="key-card__meta">Created: ${this._formatDate(k.created)}</div>
                        <div class="key-card__meta">Algorithm: ${k.algorithm} ${k.keySize}-bit</div>
                        <div class="key-card__meta">Fingerprint: <code>${this._escapeHtml(k.publicKeyFingerprint)}</code></div>
                        <div class="key-card__meta">Private key: <span class="badge badge--secure">non-extractable</span></div>
                        <div class="key-card__meta">Signing: ${k.signingKey
                            ? `<span class="badge badge--secure">ECDSA P-256</span>`
                            : `<span class="badge badge--warn">none</span>`}</div>
                    </div>
                </div>
                <div class="key-card__actions">
                    <button class="btn btn--ghost btn--xs btn-copy-pub" data-key-id="${k.id}">Copy Public Key</button>
                    <button class="btn btn--danger btn--xs btn-delete-key" data-key-id="${k.id}">Delete</button>
                </div>
            </div>
        `).join('');

        return `
            <section class="section">
                <div class="section__header">
                    <h3 class="section__title">My Keys</h3>
                    <button class="btn btn--primary btn--xs" id="btn-generate">
                        ${this._generating ? '<span class="spinner"></span> Generating...' : '+ Generate'}
                    </button>
                </div>
                ${keyCards}
            </section>
        `;
    }

    // --- Contacts Section ---

    _renderContacts() {
        const contactCards = this._contacts.map(c => `
            <div class="key-card" data-contact-id="${c.id}">
                <div class="key-card__header">
                    <div class="key-card__icon key-card__icon--contact">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
                            <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/>
                        </svg>
                    </div>
                    <div class="key-card__info">
                        <div class="key-card__label">${this._escapeHtml(c.label)}</div>
                        <div class="key-card__meta">Imported: ${this._formatDate(c.imported)}</div>
                        <div class="key-card__meta">Fingerprint: <code>${this._escapeHtml(c.publicKeyFingerprint)}</code></div>
                        <div class="key-card__meta">Signing: ${c.signingPublicKey
                            ? `<span class="badge badge--secure">verifiable</span>`
                            : `<span class="badge badge--warn">no signing key</span>`}</div>
                    </div>
                </div>
                <div class="key-card__actions">
                    <button class="btn btn--ghost btn--xs btn-view-contact" data-contact-id="${c.id}">View Key</button>
                    <button class="btn btn--danger btn--xs btn-delete-contact" data-contact-id="${c.id}">Delete</button>
                </div>
            </div>
        `).join('');

        return `
            <section class="section">
                <div class="section__header">
                    <h3 class="section__title">Contacts</h3>
                    <button class="btn btn--primary btn--xs" id="btn-import">+ Import</button>
                </div>
                ${contactCards.length > 0 ? contactCards : '<div class="section__empty">No contacts imported yet</div>'}
            </section>
        `;
    }

    // --- Messages Section ---

    _renderMessages() {
        const rsaKeys    = this._keys.filter(k => k.algorithm === 'RSA-OAEP');
        const rsaContacts = this._contacts.filter(c => c.algorithm === 'RSA-OAEP');
        if (rsaKeys.length === 0 && rsaContacts.length === 0) return '';

        const contactOpts = rsaContacts.map(c =>
            `<option value="${c.id}">${this._escapeHtml(c.label)}</option>`
        ).join('');

        const keyOpts = rsaKeys.map(k =>
            `<option value="${k.id}">${this._escapeHtml(k.label)}${k.signingKey ? '' : ' (no signing)'}</option>`
        ).join('');

        return `
            <div class="layout-grid">
                <div class="layout-grid__col">
                    <section class="section">
                        <div class="section__header">
                            <h3 class="section__title">Encrypt &amp; Sign</h3>
                        </div>
                        ${rsaContacts.length > 0 && rsaKeys.length > 0 ? `
                            <div class="msg-field">
                                <label>To (recipient)</label>
                                <select id="msg-encrypt-contact">${contactOpts}</select>
                            </div>
                            <div class="msg-field">
                                <label>From (sign with your key)</label>
                                <select id="msg-encrypt-signer">${keyOpts}</select>
                            </div>
                            <div class="msg-field">
                                <label>Message</label>
                                <textarea id="msg-encrypt-plaintext" rows="3" placeholder="Type your message here..."></textarea>
                            </div>
                            <button class="btn btn--primary btn--sm" id="btn-msg-encrypt">Encrypt, Sign &amp; Copy</button>
                            <div class="msg-field">
                                <label>Encrypted payload</label>
                                <div class="msg-output" id="msg-encrypt-output">—</div>
                            </div>
                        ` : rsaContacts.length === 0
                            ? '<div class="section__empty">Import a contact\'s public key to encrypt messages</div>'
                            : '<div class="section__empty">Generate a key pair to sign messages</div>'}
                    </section>
                </div>
                <div class="layout-grid__col">
                    <section class="section">
                        <div class="section__header">
                            <h3 class="section__title">Decrypt &amp; Verify</h3>
                        </div>
                        ${rsaKeys.length > 0 ? `
                            <div class="msg-field">
                                <label>With (your key pair)</label>
                                <select id="msg-decrypt-key">${keyOpts}</select>
                            </div>
                            <div class="msg-field">
                                <label>Paste encrypted payload</label>
                                <textarea id="msg-decrypt-payload" rows="3" placeholder="Paste the encrypted payload here..."></textarea>
                            </div>
                            <button class="btn btn--primary btn--sm" id="btn-msg-decrypt">Decrypt &amp; Verify</button>
                            <div class="msg-field">
                                <label>Decrypted message</label>
                                <div class="msg-output" id="msg-decrypt-output">—</div>
                            </div>
                        ` : '<div class="section__empty">Generate a key pair to decrypt messages</div>'}
                    </section>
                </div>
            </div>
        `;
    }

    // --- Test Section ---

    _renderTest() {
        if (this._keys.length === 0) return '';

        const rsaKeys = this._keys.filter(k => k.algorithm === 'RSA-OAEP');
        if (rsaKeys.length === 0) return '';

        const options = rsaKeys.map(k =>
            `<option value="${k.id}">${this._escapeHtml(k.label)}</option>`
        ).join('');

        return `
            <section class="section">
                <div class="section__header">
                    <h3 class="section__title">Test</h3>
                </div>
                <div class="test-area">
                    <p class="test-area__subtitle">Encrypt / Decrypt round-trip test</p>
                    <div class="test-area__field">
                        <label>Key pair</label>
                        <select id="test-key-select">${options}</select>
                    </div>
                    <div class="test-area__field">
                        <label>Plaintext</label>
                        <textarea id="test-plaintext" rows="2" placeholder="Hello, this is a test message."></textarea>
                    </div>
                    <button class="btn btn--primary btn--sm" id="btn-test-roundtrip">Encrypt with Public Key, then Decrypt with Private Key</button>
                    <div class="test-area__field">
                        <label>Ciphertext (wrapped key, base64 excerpt)</label>
                        <div class="test-area__output" id="test-ciphertext">—</div>
                    </div>
                    <div class="test-area__field">
                        <label>Result</label>
                        <div class="test-area__output" id="test-result">—</div>
                    </div>
                </div>
            </section>
        `;
    }

    // --- Info Section ---

    _renderInfo() {
        const hasWebCrypto = typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
        const hasIndexedDB = typeof indexedDB !== 'undefined';
        const keyCount     = this._keys.length;
        const contactCount = this._contacts.length;

        return `
            <section class="section section--info">
                <div class="info-strip">
                    <span class="info-chip"><span class="info-chip__label">Crypto</span> ${hasWebCrypto ? '<span class="badge badge--secure">ok</span>' : '<span class="badge badge--error">no</span>'}</span>
                    <span class="info-chip"><span class="info-chip__label">IndexedDB</span> ${hasIndexedDB ? `<span class="badge badge--secure">ok</span> <span class="info-chip__detail">${keyCount} key${keyCount !== 1 ? 's' : ''}, ${contactCount} contact${contactCount !== 1 ? 's' : ''}</span>` : '<span class="badge badge--error">no</span>'}</span>
                    <span class="info-chip"><span class="info-chip__label">Private keys</span> <span class="badge badge--secure">non-extractable</span></span>
                    <span class="info-chip"><span class="info-chip__label">Origin</span> <code>${this._escapeHtml(location.origin)}</code></span>
                </div>
                <div class="info-warning">
                    Keys are stored in this browser only. Clearing data deletes keys permanently — by design.
                </div>
            </section>
        `;
    }

    // --- Wire Events ---

    _wireEvents() {
        const root = this.shadowRoot;

        // Generate button
        const btnGen = root.querySelector('#btn-generate') || root.querySelector('#btn-generate-first');
        if (btnGen) btnGen.addEventListener('click', () => this._showGenerateModal());

        // Import button
        const btnImport = root.querySelector('#btn-import');
        if (btnImport) btnImport.addEventListener('click', () => this._showImportModal());

        // Copy public key buttons
        root.querySelectorAll('.btn-copy-pub').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = Number(btn.dataset.keyId);
                const keyRecord = this._keys.find(k => k.id === id);
                if (keyRecord) this._handleCopyPublicKey(keyRecord);
            });
        });

        // Delete key buttons
        root.querySelectorAll('.btn-delete-key').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = Number(btn.dataset.keyId);
                const keyRecord = this._keys.find(k => k.id === id);
                if (keyRecord) this._handleDeleteKey(keyRecord);
            });
        });

        // View contact key buttons
        root.querySelectorAll('.btn-view-contact').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = Number(btn.dataset.contactId);
                const contact = this._contacts.find(c => c.id === id);
                if (contact) {
                    const text = this._buildPublicKeyBundle(contact);
                    this._showToast('Key bundle copied to clipboard', 'success');
                    navigator.clipboard.writeText(text).catch(() => {});
                }
            });
        });

        // Delete contact buttons
        root.querySelectorAll('.btn-delete-contact').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = Number(btn.dataset.contactId);
                const contact = this._contacts.find(c => c.id === id);
                if (contact) this._handleDeleteContact(contact);
            });
        });

        // Test round-trip button
        const btnTest = root.querySelector('#btn-test-roundtrip');
        if (btnTest) {
            btnTest.addEventListener('click', () => {
                const select    = root.querySelector('#test-key-select');
                const textarea  = root.querySelector('#test-plaintext');
                const keyId     = Number(select.value);
                const plaintext = textarea.value || 'Hello, this is a test message.';
                this._handleTestEncryptDecrypt(keyId, plaintext);
            });
        }

        // Message encrypt button
        const btnMsgEncrypt = root.querySelector('#btn-msg-encrypt');
        if (btnMsgEncrypt) {
            btnMsgEncrypt.addEventListener('click', () => {
                const contactSel = root.querySelector('#msg-encrypt-contact');
                const signerSel  = root.querySelector('#msg-encrypt-signer');
                const textarea   = root.querySelector('#msg-encrypt-plaintext');
                const contactId  = Number(contactSel.value);
                const signerId   = Number(signerSel.value);
                const plaintext  = textarea.value.trim();
                if (!plaintext) { this._showToast('Type a message first', 'error'); return; }
                this._handleMessageEncrypt(contactId, signerId, plaintext);
            });
        }

        // Message decrypt button
        const btnMsgDecrypt = root.querySelector('#btn-msg-decrypt');
        if (btnMsgDecrypt) {
            btnMsgDecrypt.addEventListener('click', () => {
                const select  = root.querySelector('#msg-decrypt-key');
                const textarea = root.querySelector('#msg-decrypt-payload');
                const keyId   = Number(select.value);
                const payload = textarea.value.trim();
                if (!payload) { this._showToast('Paste an encrypted payload first', 'error'); return; }
                this._handleMessageDecrypt(keyId, payload);
            });
        }
    }

    // =========================================================================
    // Styles
    // =========================================================================

    static get styles() {
        return `
            :host {
                display: block;
            }

            .pki {
                position: relative;
            }

            /* --- Brand --- */
            .brand {
                font-weight: 700;
                letter-spacing: -0.01em;
            }

            .brand__slash {
                color: #4ECDC4;
                font-weight: 800;
            }

            /* --- Panel Header --- */
            .panel-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 0.75rem;
            }

            .panel-header__brand {
                display: flex;
                align-items: baseline;
                gap: 0.5rem;
            }

            .panel-header__title {
                font-size: var(--admin-font-size-lg, 1.125rem);
                font-weight: 600;
                color: var(--admin-text, #e4e6ef);
                margin: 0;
                display: flex;
                align-items: baseline;
                gap: 0.5rem;
            }

            .panel-header__subtitle {
                font-size: var(--admin-font-size-sm, 0.875rem);
                font-weight: 500;
                color: var(--admin-text-secondary, #8b8fa7);
            }

            /* --- Two-Column Grid --- */
            .layout-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 0.75rem;
                margin-bottom: 0.75rem;
            }

            .layout-grid__col > .section {
                margin-bottom: 0;
                height: 100%;
                display: flex;
                flex-direction: column;
            }

            /* --- Sections --- */
            .section {
                background: var(--admin-surface, #1a1d27);
                border: 1px solid var(--admin-border, #2e3347);
                border-radius: var(--admin-radius-lg, 10px);
                padding: 0.875rem 1rem;
                margin-bottom: 0.75rem;
            }

            .section--info {
                padding: 0.625rem 1rem;
            }

            .section__header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 0.5rem;
                margin-bottom: 0.625rem;
            }

            .section__title {
                font-size: var(--admin-font-size-sm, 0.875rem);
                font-weight: 600;
                color: var(--admin-text, #e4e6ef);
                margin: 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                min-width: 0;
            }

            .section__empty {
                color: var(--admin-text-muted, #5e6280);
                font-size: var(--admin-font-size-xs, 0.75rem);
                padding: 0.5rem 0 0.25rem;
            }

            /* --- Key Cards --- */
            .key-card {
                background: var(--admin-bg, #0f1117);
                border: 1px solid var(--admin-border-subtle, #252838);
                border-radius: var(--admin-radius, 6px);
                padding: 0.625rem 0.75rem;
                margin-bottom: 0.5rem;
            }

            .key-card:last-child {
                margin-bottom: 0;
            }

            .key-card__header {
                display: flex;
                gap: 0.5rem;
                align-items: flex-start;
            }

            .key-card__icon {
                color: var(--admin-primary, #4f8ff7);
                flex-shrink: 0;
                margin-top: 0.125rem;
            }

            .key-card__icon svg {
                width: 16px;
                height: 16px;
            }

            .key-card__icon--contact {
                color: var(--admin-text-secondary, #8b8fa7);
            }

            .key-card__info {
                flex: 1;
                min-width: 0;
            }

            .key-card__label {
                font-weight: 600;
                font-size: var(--admin-font-size-sm, 0.875rem);
                color: var(--admin-text, #e4e6ef);
                margin-bottom: 0.125rem;
            }

            .key-card__meta {
                font-size: 0.6875rem;
                color: var(--admin-text-secondary, #8b8fa7);
                line-height: 1.5;
            }

            .key-card__meta code {
                font-family: var(--admin-font-mono, monospace);
                font-size: 0.6875rem;
                color: var(--admin-text-muted, #5e6280);
            }

            .key-card__actions {
                display: flex;
                gap: 0.375rem;
                margin-top: 0.5rem;
                padding-top: 0.5rem;
                border-top: 1px solid var(--admin-border-subtle, #252838);
            }

            /* --- Badges --- */
            .badge {
                display: inline-block;
                padding: 0.0625rem 0.375rem;
                font-size: var(--admin-font-size-xs, 0.75rem);
                font-weight: 600;
                border-radius: 9999px;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }

            .badge--secure {
                background: var(--admin-success-bg, rgba(52,211,153,0.1));
                color: var(--admin-success, #34d399);
            }

            .badge--error {
                background: var(--admin-error-bg, rgba(248,113,113,0.1));
                color: var(--admin-error, #f87171);
            }

            .badge--warn {
                background: var(--admin-warning-bg, rgba(251,191,36,0.1));
                color: var(--admin-warning, #fbbf24);
            }

            /* --- Empty State --- */
            .empty-state {
                text-align: center;
                padding: 1rem 0.5rem;
            }

            .empty-state__icon {
                color: var(--admin-text-muted, #5e6280);
                margin-bottom: 0.375rem;
            }

            .empty-state__text {
                font-size: var(--admin-font-size-sm, 0.875rem);
                color: var(--admin-text-secondary, #8b8fa7);
                margin-bottom: 0.125rem;
            }

            .empty-state__hint {
                font-size: var(--admin-font-size-xs, 0.75rem);
                color: var(--admin-text-muted, #5e6280);
                margin-bottom: 0.75rem;
            }

            /* --- Buttons --- */
            .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 0.375rem;
                border: none;
                border-radius: var(--admin-radius, 6px);
                cursor: pointer;
                font-family: var(--admin-font, sans-serif);
                font-weight: 500;
                transition: background 150ms ease, color 150ms ease;
                white-space: nowrap;
                text-decoration: none;
            }

            .btn:disabled { opacity: 0.5; cursor: not-allowed; }
            .btn--sm { padding: 0.4rem 0.75rem; font-size: var(--admin-font-size-sm, 0.875rem); }
            .btn--xs { padding: 0.25rem 0.5rem; font-size: var(--admin-font-size-xs, 0.75rem); }
            .btn--primary { background: var(--admin-primary, #4f8ff7); color: #fff; }
            .btn--primary:hover:not(:disabled) { background: var(--admin-primary-hover, #3a7be8); }
            .btn--ghost { background: transparent; color: var(--admin-text-secondary, #8b8fa7); }
            .btn--ghost:hover:not(:disabled) { background: var(--admin-surface-hover, #2a2e3d); color: var(--admin-text, #e4e6ef); }
            .btn--danger { background: var(--admin-error-bg, rgba(248,113,113,0.1)); color: var(--admin-error, #f87171); border: 1px solid rgba(248,113,113,0.2); }
            .btn--danger:hover:not(:disabled) { background: var(--admin-error, #f87171); color: #fff; }

            /* --- Loading --- */
            .loading {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 1rem;
                justify-content: center;
                color: var(--admin-text-secondary, #8b8fa7);
                font-size: var(--admin-font-size-sm, 0.875rem);
            }

            .spinner {
                display: inline-block;
                width: 16px;
                height: 16px;
                border: 2px solid var(--admin-border, #2e3347);
                border-top-color: var(--admin-primary, #4f8ff7);
                border-radius: 50%;
                animation: spin 0.6s linear infinite;
            }

            @keyframes spin { to { transform: rotate(360deg); } }

            /* --- Toast --- */
            .toast {
                position: fixed;
                bottom: 1.5rem;
                right: 1.5rem;
                padding: 0.75rem 1.25rem;
                border-radius: var(--admin-radius, 6px);
                font-size: var(--admin-font-size-sm, 0.875rem);
                font-weight: 500;
                z-index: 100;
                animation: slide-up 200ms ease;
            }

            .toast--success {
                background: var(--admin-success-bg, rgba(52,211,153,0.1));
                color: var(--admin-success, #34d399);
                border: 1px solid rgba(52,211,153,0.2);
            }

            .toast--error {
                background: var(--admin-error-bg, rgba(248,113,113,0.1));
                color: var(--admin-error, #f87171);
                border: 1px solid rgba(248,113,113,0.2);
            }

            @keyframes slide-up {
                from { transform: translateY(10px); opacity: 0; }
                to   { transform: translateY(0); opacity: 1; }
            }

            /* --- Modal --- */
            .modal-backdrop {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.6);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 50;
            }

            .modal {
                background: var(--admin-surface, #1a1d27);
                border: 1px solid var(--admin-border, #2e3347);
                border-radius: var(--admin-radius-lg, 10px);
                padding: 1.5rem;
                width: 100%;
                max-width: 440px;
                box-shadow: var(--admin-shadow-lg, 0 8px 32px rgba(0,0,0,0.4));
            }

            .modal__title {
                font-size: var(--admin-font-size-lg, 1.125rem);
                font-weight: 600;
                color: var(--admin-text, #e4e6ef);
                margin-bottom: 1rem;
            }

            .modal__text {
                font-size: var(--admin-font-size-sm, 0.875rem);
                color: var(--admin-text-secondary, #8b8fa7);
                margin: 0 0 0.75rem;
                line-height: 1.5;
            }

            .modal__warning {
                font-size: var(--admin-font-size-sm, 0.875rem);
                color: var(--admin-warning, #fbbf24);
                background: var(--admin-warning-bg, rgba(251,191,36,0.1));
                padding: 0.625rem 0.75rem;
                border-radius: var(--admin-radius, 6px);
                margin: 0 0 1rem;
                line-height: 1.5;
            }

            .modal__info {
                font-size: var(--admin-font-size-xs, 0.75rem);
                color: var(--admin-text-muted, #5e6280);
                margin: 0 0 1rem;
                line-height: 1.5;
            }

            .modal__field {
                margin-bottom: 1rem;
            }

            .modal__field label {
                display: block;
                font-size: var(--admin-font-size-xs, 0.75rem);
                font-weight: 500;
                color: var(--admin-text-secondary, #8b8fa7);
                margin-bottom: 0.25rem;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }

            .modal__field input,
            .modal__field textarea,
            .modal__field select {
                width: 100%;
                padding: 0.5rem 0.625rem;
                font-size: var(--admin-font-size-sm, 0.875rem);
                font-family: var(--admin-font, sans-serif);
                color: var(--admin-text, #e4e6ef);
                background: var(--admin-bg, #0f1117);
                border: 1px solid var(--admin-border, #2e3347);
                border-radius: var(--admin-radius, 6px);
                box-sizing: border-box;
            }

            .modal__field textarea {
                font-family: var(--admin-font-mono, monospace);
                font-size: var(--admin-font-size-xs, 0.75rem);
                resize: vertical;
            }

            .modal__field input:focus,
            .modal__field textarea:focus {
                outline: none;
                border-color: var(--admin-primary, #4f8ff7);
                box-shadow: 0 0 0 2px var(--admin-primary-bg, rgba(79,143,247,0.1));
            }

            .modal__actions {
                display: flex;
                justify-content: flex-end;
                gap: 0.5rem;
            }

            .radio-group {
                display: flex;
                flex-direction: column;
                gap: 0.375rem;
            }

            .radio {
                font-size: var(--admin-font-size-sm, 0.875rem);
                color: var(--admin-text-secondary, #8b8fa7);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 0.375rem;
            }

            .radio input { cursor: pointer; }

            /* --- Test Area --- */
            .test-area {
                padding: 0.125rem 0;
            }

            .test-area__subtitle {
                font-size: var(--admin-font-size-xs, 0.75rem);
                color: var(--admin-text-secondary, #8b8fa7);
                margin: 0 0 0.5rem;
            }

            .test-area__field {
                margin-bottom: 0.5rem;
            }

            .test-area__field label {
                display: block;
                font-size: var(--admin-font-size-xs, 0.75rem);
                font-weight: 500;
                color: var(--admin-text-secondary, #8b8fa7);
                margin-bottom: 0.25rem;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }

            .test-area__field select,
            .test-area__field textarea {
                width: 100%;
                padding: 0.5rem 0.625rem;
                font-size: var(--admin-font-size-sm, 0.875rem);
                font-family: var(--admin-font, sans-serif);
                color: var(--admin-text, #e4e6ef);
                background: var(--admin-bg, #0f1117);
                border: 1px solid var(--admin-border, #2e3347);
                border-radius: var(--admin-radius, 6px);
                box-sizing: border-box;
            }

            .test-area__field textarea {
                font-family: var(--admin-font-mono, monospace);
                resize: vertical;
            }

            .test-area__field select:focus,
            .test-area__field textarea:focus {
                outline: none;
                border-color: var(--admin-primary, #4f8ff7);
            }

            .test-area__output {
                padding: 0.5rem 0.625rem;
                background: var(--admin-bg, #0f1117);
                border: 1px solid var(--admin-border-subtle, #252838);
                border-radius: var(--admin-radius, 6px);
                font-family: var(--admin-font-mono, monospace);
                font-size: var(--admin-font-size-xs, 0.75rem);
                color: var(--admin-text-muted, #5e6280);
                word-break: break-all;
                min-height: 1.25rem;
            }

            .test-pass {
                color: var(--admin-success, #34d399);
            }

            .test-fail {
                color: var(--admin-error, #f87171);
            }

            /* --- Message Fields --- */
            .msg-field {
                margin-bottom: 0.5rem;
            }

            .msg-field label {
                display: block;
                font-size: var(--admin-font-size-xs, 0.75rem);
                font-weight: 500;
                color: var(--admin-text-secondary, #8b8fa7);
                margin-bottom: 0.25rem;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }

            .msg-field select,
            .msg-field textarea {
                width: 100%;
                padding: 0.4rem 0.5rem;
                font-size: var(--admin-font-size-sm, 0.875rem);
                font-family: var(--admin-font, sans-serif);
                color: var(--admin-text, #e4e6ef);
                background: var(--admin-bg, #0f1117);
                border: 1px solid var(--admin-border, #2e3347);
                border-radius: var(--admin-radius, 6px);
                box-sizing: border-box;
            }

            .msg-field textarea {
                font-family: var(--admin-font-mono, monospace);
                font-size: var(--admin-font-size-xs, 0.75rem);
                resize: vertical;
            }

            .msg-field select:focus,
            .msg-field textarea:focus {
                outline: none;
                border-color: var(--admin-primary, #4f8ff7);
            }

            .msg-output {
                margin-top: 0.5rem;
                padding: 0.5rem 0.625rem;
                background: var(--admin-bg, #0f1117);
                border: 1px solid var(--admin-border-subtle, #252838);
                border-radius: var(--admin-radius, 6px);
                font-family: var(--admin-font-mono, monospace);
                font-size: var(--admin-font-size-xs, 0.75rem);
                color: var(--admin-text-muted, #5e6280);
                word-break: break-all;
                min-height: 1.25rem;
                max-height: 6rem;
                overflow-y: auto;
                user-select: all;
            }

            /* --- Verification Status --- */
            .verify {
                margin-top: 0.375rem;
                padding: 0.25rem 0.5rem;
                border-radius: var(--admin-radius, 6px);
                font-size: var(--admin-font-size-xs, 0.75rem);
                line-height: 1.4;
            }

            .verify--ok {
                background: var(--admin-success-bg, rgba(52,211,153,0.1));
                color: var(--admin-success, #34d399);
                border: 1px solid rgba(52,211,153,0.2);
            }

            .verify--fail {
                background: var(--admin-error-bg, rgba(248,113,113,0.1));
                color: var(--admin-error, #f87171);
                border: 1px solid rgba(248,113,113,0.2);
            }

            .verify--unknown {
                background: var(--admin-warning-bg, rgba(251,191,36,0.1));
                color: var(--admin-warning, #fbbf24);
                border: 1px solid rgba(251,191,36,0.15);
            }

            .verify--unsigned {
                background: var(--admin-surface-hover, #2a2e3d);
                color: var(--admin-text-muted, #5e6280);
                border: 1px solid var(--admin-border-subtle, #252838);
            }

            /* --- Info Strip --- */
            .info-strip {
                display: flex;
                flex-wrap: wrap;
                gap: 0.5rem 1rem;
                align-items: center;
            }

            .info-chip {
                display: inline-flex;
                align-items: center;
                gap: 0.25rem;
                font-size: var(--admin-font-size-xs, 0.75rem);
                color: var(--admin-text, #e4e6ef);
            }

            .info-chip__label {
                color: var(--admin-text-muted, #5e6280);
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }

            .info-chip__detail {
                color: var(--admin-text-secondary, #8b8fa7);
                font-size: 0.6875rem;
            }

            .info-chip code {
                font-family: var(--admin-font-mono, monospace);
                font-size: 0.6875rem;
            }

            .info-warning {
                margin-top: 0.5rem;
                padding: 0.375rem 0.625rem;
                background: var(--admin-warning-bg, rgba(251,191,36,0.1));
                border: 1px solid rgba(251,191,36,0.15);
                border-radius: var(--admin-radius, 6px);
                font-size: var(--admin-font-size-xs, 0.75rem);
                color: var(--admin-warning, #fbbf24);
                line-height: 1.4;
            }

            /* --- Insecure Context Error --- */
            .insecure-context {
                text-align: center;
                padding: 2rem 1rem;
            }

            .insecure-context__icon {
                color: var(--admin-warning, #fbbf24);
                margin-bottom: 0.75rem;
            }

            .insecure-context__title {
                font-size: var(--admin-font-size-xl, 1.25rem);
                font-weight: 600;
                color: var(--admin-text, #e4e6ef);
                margin-bottom: 1rem;
            }

            .insecure-context__text {
                font-size: var(--admin-font-size-sm, 0.875rem);
                color: var(--admin-text-secondary, #8b8fa7);
                line-height: 1.6;
                margin: 0 0 0.75rem;
                max-width: 560px;
                margin-left: auto;
                margin-right: auto;
            }

            .insecure-context__text code {
                font-family: var(--admin-font-mono, monospace);
                font-size: var(--admin-font-size-xs, 0.75rem);
                background: var(--admin-bg, #0f1117);
                padding: 0.125rem 0.375rem;
                border-radius: 3px;
            }

            .insecure-context__fix {
                font-size: var(--admin-font-size-sm, 0.875rem);
                color: var(--admin-text, #e4e6ef);
                background: var(--admin-primary-bg, rgba(79,143,247,0.1));
                border: 1px solid rgba(79,143,247,0.2);
                border-radius: var(--admin-radius, 6px);
                padding: 0.75rem 1rem;
                max-width: 560px;
                margin: 1rem auto 0;
                line-height: 1.5;
            }

            .insecure-context__fix a {
                color: var(--admin-primary, #4f8ff7);
                text-decoration: underline;
                word-break: break-all;
            }

            /* --- Responsive --- */
            @media (max-width: 768px) {
                .layout-grid {
                    grid-template-columns: 1fr;
                }

                .info-strip {
                    flex-direction: column;
                    align-items: flex-start;
                }

                .key-card__header {
                    flex-direction: column;
                }

                .key-card__actions {
                    flex-wrap: wrap;
                }
            }
        `;
    }
}

customElements.define('pki-manager', PKIManager);
