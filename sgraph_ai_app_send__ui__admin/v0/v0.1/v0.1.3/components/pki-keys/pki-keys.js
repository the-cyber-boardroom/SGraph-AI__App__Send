/* =============================================================================
   SGraph Send Admin Console — PKI Keys Component
   v0.1.3 — Key pair generation, list, delete, export

   Extracted from pki-manager.js (v0.1.2) during Phase 2 refactor.
   Depends on: pki-common.js (window.sgraphAdmin.pki)
   Events emitted: key-generated, key-deleted
   ============================================================================= */

(function() {
    'use strict';

    const pki = () => window.sgraphAdmin.pki;

    class PKIKeys extends HTMLElement {

        static get appId()    { return 'pki-keys'; }
        static get navLabel() { return 'Keys'; }
        static get navIcon()  { return '\uD83D\uDD11'; }

        constructor() {
            super();
            this._keys       = [];
            this._loading    = true;
            this._generating = false;
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
            this._loadKeys();
            this._setupEvents();
        }

        onDeactivated() {
            this.cleanup();
        }

        // --- Event wiring --------------------------------------------------------

        _setupEvents() {
            this._boundHandlers.onDbChange = (store) => {
                if (store === 'keys') this._loadKeys();
            };
            pki().db.onChange(this._boundHandlers.onDbChange);
        }

        cleanup() {
            if (this._boundHandlers.onDbChange) {
                pki().db.offChange(this._boundHandlers.onDbChange);
            }
        }

        // --- Data ----------------------------------------------------------------

        async _loadKeys() {
            this._loading = true;
            this._renderContent();
            try {
                this._keys = await pki().db.getAll('keys');
            } catch (err) {
                window.sgraphAdmin.messages.error(`Failed to load keys: ${err.message}`);
            }
            this._loading = false;
            this._renderContent();
        }

        // --- Key generation ------------------------------------------------------

        async _generateKeyPair(label, algorithm) {
            this._generating = true;
            this._renderContent();

            try {
                const algoParams = algorithm === 'ECDH'
                    ? { name: 'ECDH', namedCurve: 'P-256' }
                    : { name: 'RSA-OAEP', modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

                const keyUsages = algorithm === 'ECDH' ? ['deriveKey', 'deriveBits'] : ['encrypt', 'decrypt'];
                const keyPair   = await crypto.subtle.generateKey(algoParams, false, keyUsages);
                const publicKeyPEM = await pki().exportPublicKeyPEM(keyPair.publicKey);
                const fingerprint  = await pki().computeFingerprint(keyPair.publicKey);
                const keySize      = algorithm === 'ECDH' ? 256 : 4096;

                let signingKey = null, signingPublicKey = null, signingPublicKeyPEM = null, signingFingerprint = null;
                if (algorithm !== 'ECDH') {
                    const signingPair = await crypto.subtle.generateKey(
                        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']
                    );
                    signingKey          = signingPair.privateKey;
                    signingPublicKey    = signingPair.publicKey;
                    signingPublicKeyPEM = await pki().exportPublicKeyPEM(signingPair.publicKey);
                    signingFingerprint  = await pki().computeFingerprint(signingPair.publicKey);
                }

                await pki().db.add('keys', {
                    label, created: new Date().toISOString(),
                    algorithm: algorithm === 'ECDH' ? 'ECDH' : 'RSA-OAEP', keySize,
                    publicKey: keyPair.publicKey, privateKey: keyPair.privateKey,
                    publicKeyFingerprint: fingerprint, publicKeyPEM,
                    signingKey, signingPublicKey, signingPublicKeyPEM, signingFingerprint,
                });

                await this._loadKeys();
                window.sgraphAdmin.messages.success(`Key pair '${label}' created with signing key.`);
                if (this.events) this.events.emit('key-generated', { fingerprint, algorithm });
            } catch (err) {
                window.sgraphAdmin.messages.error(`Key generation failed: ${err.message}`);
            }

            this._generating = false;
            this._renderContent();
        }

        // --- Actions -------------------------------------------------------------

        async _handleCopyPublicKey(keyRecord) {
            const text = pki().buildPublicKeyBundle(keyRecord);
            try {
                await navigator.clipboard.writeText(text);
                window.sgraphAdmin.messages.success('Public key bundle copied to clipboard');
            } catch (_) {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
                window.sgraphAdmin.messages.success('Public key bundle copied to clipboard');
            }
        }

        async _handleDeleteKey(keyRecord) {
            const confirmed = await this._showDeleteConfirm(keyRecord.label);
            if (!confirmed) return;
            try {
                await pki().db.delete('keys', keyRecord.id);
                await this._loadKeys();
                window.sgraphAdmin.messages.success(`Key pair '${keyRecord.label}' deleted permanently.`);
                if (this.events) this.events.emit('key-deleted', { fingerprint: keyRecord.publicKeyFingerprint });
            } catch (err) {
                window.sgraphAdmin.messages.error(`Delete failed: ${err.message}`);
            }
        }

        // --- Modals --------------------------------------------------------------

        _showGenerateModal() {
            const overlay = this.querySelector('.pk-modal-overlay');
            if (!overlay) return;

            overlay.innerHTML = `
                <div class="pk-modal-backdrop">
                    <div class="pk-modal">
                        <div class="pk-modal__title">Generate New Key Pair</div>
                        <div class="pk-modal__field">
                            <label for="pk-gen-label">Label</label>
                            <input type="text" id="pk-gen-label" placeholder="e.g. My Work Key" autocomplete="off">
                        </div>
                        <div class="pk-modal__field">
                            <label>Algorithm</label>
                            <div class="pk-radio-group">
                                <label class="pk-radio"><input type="radio" name="pk-gen-algo" value="RSA-OAEP" checked> RSA-OAEP 4096-bit</label>
                                <label class="pk-radio"><input type="radio" name="pk-gen-algo" value="ECDH"> ECDH P-256</label>
                            </div>
                        </div>
                        <p class="pk-modal__info">Your private key will be stored securely in this browser. It cannot be exported or read by any code, including ours.</p>
                        <div class="pk-modal__actions">
                            <button class="pk-btn pk-btn--ghost pk-btn--sm" id="pk-modal-cancel">Cancel</button>
                            <button class="pk-btn pk-btn--primary pk-btn--sm" id="pk-modal-confirm">Generate</button>
                        </div>
                    </div>
                </div>
            `;

            const input   = overlay.querySelector('#pk-gen-label');
            const confirm = overlay.querySelector('#pk-modal-confirm');
            const cancel  = overlay.querySelector('#pk-modal-cancel');

            confirm.addEventListener('click', () => {
                const label = input.value.trim() || 'Untitled';
                const algo  = overlay.querySelector('input[name="pk-gen-algo"]:checked').value;
                overlay.innerHTML = '';
                this._generateKeyPair(label, algo);
            });
            cancel.addEventListener('click', () => { overlay.innerHTML = ''; });
            overlay.querySelector('.pk-modal-backdrop').addEventListener('click', (e) => {
                if (e.target === e.currentTarget) overlay.innerHTML = '';
            });
            input.focus();
        }

        _showDeleteConfirm(label) {
            return new Promise((resolve) => {
                const overlay = this.querySelector('.pk-modal-overlay');
                if (!overlay) return resolve(false);

                overlay.innerHTML = `
                    <div class="pk-modal-backdrop">
                        <div class="pk-modal">
                            <div class="pk-modal__title">Delete "${pki().escapeHtml(label)}"?</div>
                            <p class="pk-modal__text">This will permanently delete both the public AND private key from this browser.</p>
                            <p class="pk-modal__warning">This cannot be undone. Any content encrypted with this key pair will become permanently unreadable.</p>
                            <div class="pk-modal__field">
                                <label>Type "delete" to confirm:</label>
                                <input type="text" id="pk-delete-input" autocomplete="off">
                            </div>
                            <div class="pk-modal__actions">
                                <button class="pk-btn pk-btn--ghost pk-btn--sm" id="pk-modal-cancel">Cancel</button>
                                <button class="pk-btn pk-btn--danger pk-btn--sm" id="pk-modal-confirm" disabled>Delete Forever</button>
                            </div>
                        </div>
                    </div>
                `;

                const input   = overlay.querySelector('#pk-delete-input');
                const confirm = overlay.querySelector('#pk-modal-confirm');
                const cancel  = overlay.querySelector('#pk-modal-cancel');

                input.addEventListener('input', () => { confirm.disabled = input.value.toLowerCase() !== 'delete'; });
                confirm.addEventListener('click', () => { overlay.innerHTML = ''; resolve(true); });
                cancel.addEventListener('click', ()  => { overlay.innerHTML = ''; resolve(false); });
                overlay.querySelector('.pk-modal-backdrop').addEventListener('click', (e) => {
                    if (e.target === e.currentTarget) { overlay.innerHTML = ''; resolve(false); }
                });
                input.focus();
            });
        }

        // --- Render --------------------------------------------------------------

        render() {
            this.innerHTML = `
                <style>${pki().PKI_SHARED_STYLES}</style>
                <div class="pk-modal-overlay"></div>
                <div class="pk-content"></div>
            `;
            this._renderContent();
        }

        _renderContent() {
            const el = this.querySelector('.pk-content');
            if (!el) return;

            if (!pki().hasWebCrypto()) {
                el.innerHTML = pki().renderInsecureContextError();
                return;
            }

            if (this._loading) {
                el.innerHTML = `<div class="pk-loading"><span class="pk-spinner"></span> Loading keys...</div>`;
                return;
            }

            el.innerHTML = this._renderKeyList();
            this._wireCardEvents();
        }

        _renderKeyList() {
            if (this._keys.length === 0 && !this._generating) {
                return `
                    <div class="pk-section">
                        <div class="pk-section__header"><h3 class="pk-section__title">My Keys</h3></div>
                        <div class="pk-empty">
                            <div class="pk-empty__icon">${pki().PKI_ICONS.key}</div>
                            <div class="pk-empty__text">No keys yet</div>
                            <div class="pk-empty__hint">Generate a key pair to start.</div>
                            <button class="pk-btn pk-btn--primary pk-btn--sm" id="pk-btn-generate">Generate Key Pair</button>
                        </div>
                    </div>
                `;
            }

            const cards = this._keys.map(k => `
                <div class="pk-card" data-key-id="${k.id}">
                    <div class="pk-card__header">
                        <div class="pk-card__icon">${pki().PKI_ICONS.key}</div>
                        <div class="pk-card__info">
                            <div class="pk-card__label">${pki().escapeHtml(k.label)}</div>
                            <div class="pk-card__meta">Created: ${pki().formatDate(k.created)}</div>
                            <div class="pk-card__meta">Algorithm: ${k.algorithm} ${k.keySize}-bit</div>
                            <div class="pk-card__meta">Fingerprint: <code>${pki().escapeHtml(k.publicKeyFingerprint)}</code></div>
                            <div class="pk-card__meta">Private key: <span class="pk-badge pk-badge--secure">non-extractable</span></div>
                            <div class="pk-card__meta">Signing: ${k.signingKey
                                ? '<span class="pk-badge pk-badge--secure">ECDSA P-256</span>'
                                : '<span class="pk-badge pk-badge--warn">none</span>'}</div>
                        </div>
                    </div>
                    <div class="pk-card__actions">
                        <button class="pk-btn pk-btn--ghost pk-btn--xs pk-btn-copy" data-key-id="${k.id}">Copy Public Key</button>
                        <button class="pk-btn pk-btn--danger pk-btn--xs pk-btn-delete" data-key-id="${k.id}">Delete</button>
                    </div>
                </div>
            `).join('');

            return `
                <div class="pk-section">
                    <div class="pk-section__header">
                        <h3 class="pk-section__title">My Keys</h3>
                        <button class="pk-btn pk-btn--primary pk-btn--xs" id="pk-btn-generate">
                            ${this._generating ? '<span class="pk-spinner"></span> Generating...' : '+ Generate'}
                        </button>
                    </div>
                    ${cards}
                </div>
            `;
        }

        _wireCardEvents() {
            const btnGen = this.querySelector('#pk-btn-generate');
            if (btnGen) btnGen.addEventListener('click', () => this._showGenerateModal());

            this.querySelectorAll('.pk-btn-copy').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rec = this._keys.find(k => k.id === Number(btn.dataset.keyId));
                    if (rec) this._handleCopyPublicKey(rec);
                });
            });

            this.querySelectorAll('.pk-btn-delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rec = this._keys.find(k => k.id === Number(btn.dataset.keyId));
                    if (rec) this._handleDeleteKey(rec);
                });
            });
        }

        get events() { return window.sgraphAdmin?.events; }
    }

    customElements.define('pki-keys', PKIKeys);
})();
