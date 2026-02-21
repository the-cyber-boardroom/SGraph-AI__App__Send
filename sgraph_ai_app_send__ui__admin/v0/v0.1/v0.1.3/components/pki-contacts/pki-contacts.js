/* =============================================================================
   SGraph Send Admin Console — PKI Contacts Component
   v0.1.3 — Contact import, list, delete

   Extracted from pki-manager.js (v0.1.2) during Phase 2 refactor.
   Depends on: pki-common.js (window.sgraphAdmin.pki)
   Events emitted: contact-imported, contact-deleted
   ============================================================================= */

(function() {
    'use strict';

    const pki = () => window.sgraphAdmin.pki;

    class PKIContacts extends HTMLElement {

        static get appId()    { return 'pki-contacts'; }
        static get navLabel() { return 'Contacts'; }
        static get navIcon()  { return '\uD83D\uDC64'; }

        constructor() {
            super();
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
            this._loadContacts();
            this._setupEvents();
        }

        onDeactivated() {
            this.cleanup();
        }

        // --- Events --------------------------------------------------------------

        _setupEvents() {
            this._boundHandlers.onDbChange = (store) => {
                if (store === 'contacts') this._loadContacts();
            };
            pki().db.onChange(this._boundHandlers.onDbChange);
        }

        cleanup() {
            if (this._boundHandlers.onDbChange) pki().db.offChange(this._boundHandlers.onDbChange);
            if (this._toastTimer) clearTimeout(this._toastTimer);
        }

        // --- Data ----------------------------------------------------------------

        async _loadContacts() {
            this._loading = true;
            this._renderContent();
            try {
                this._contacts = await pki().db.getAll('contacts');
            } catch (err) {
                this._showToast(`Failed to load contacts: ${err.message}`, 'error');
            }
            this._loading = false;
            this._renderContent();
        }

        // --- Actions -------------------------------------------------------------

        async _handleImport(label, rawText) {
            try {
                let encryptPEM, signPEM = null;
                const trimmed = rawText.trim();
                if (trimmed.startsWith('{')) {
                    const bundle = JSON.parse(trimmed);
                    encryptPEM = bundle.encrypt;
                    signPEM    = bundle.sign || null;
                } else {
                    encryptPEM = trimmed;
                }

                const publicKey    = await pki().importPublicKeyPEM(encryptPEM);
                const fingerprint  = await pki().computeFingerprint(publicKey);
                const publicKeyPEM = await pki().exportPublicKeyPEM(publicKey);

                let signingPublicKey = null, signingPublicKeyPEM = null, signingFingerprint = null;
                if (signPEM) {
                    signingPublicKey    = await pki().importSigningKeyPEM(signPEM);
                    signingPublicKeyPEM = signPEM;
                    signingFingerprint  = await pki().computeFingerprint(signingPublicKey);
                }

                await pki().db.add('contacts', {
                    label, imported: new Date().toISOString(),
                    algorithm: publicKey.algorithm.name,
                    publicKey, publicKeyFingerprint: fingerprint, publicKeyPEM,
                    signingPublicKey, signingPublicKeyPEM, signingFingerprint,
                    source: 'manual',
                });

                await this._loadContacts();
                const sigMsg = signingPublicKey ? ' (with signing key)' : ' (encryption only)';
                this._showToast(`Public key for '${label}' imported${sigMsg}.`, 'success');
                if (this.events) this.events.emit('contact-imported', { fingerprint, source: 'manual' });
            } catch (err) {
                this._showToast(`Import failed: ${err.message}`, 'error');
            }
        }

        async _handleDelete(contact) {
            try {
                await pki().db.delete('contacts', contact.id);
                await this._loadContacts();
                this._showToast(`Contact '${contact.label}' removed.`, 'success');
                if (this.events) this.events.emit('contact-deleted', { contactId: contact.id });
            } catch (err) {
                this._showToast(`Delete failed: ${err.message}`, 'error');
            }
        }

        async _handleViewKey(contact) {
            const text = pki().buildPublicKeyBundle(contact);
            try {
                await navigator.clipboard.writeText(text);
                this._showToast('Key bundle copied to clipboard', 'success');
            } catch (_) {
                this._showToast('Could not copy to clipboard', 'error');
            }
        }

        // --- Import modal --------------------------------------------------------

        _showImportModal() {
            const overlay = this.querySelector('.pk-modal-overlay');
            if (!overlay) return;

            overlay.innerHTML = `
                <div class="pk-modal-backdrop">
                    <div class="pk-modal">
                        <div class="pk-modal__title">Import Public Key</div>
                        <div class="pk-modal__field">
                            <label for="pc-import-label">Label</label>
                            <input type="text" id="pc-import-label" placeholder="e.g. Alice - Investor Group" autocomplete="off">
                        </div>
                        <div class="pk-modal__field">
                            <label for="pc-import-pem">Paste key bundle (JSON) or PEM</label>
                            <textarea id="pc-import-pem" rows="8" placeholder='{"v":1,"encrypt":"-----BEGIN PUBLIC KEY-----...","sign":"-----BEGIN PUBLIC KEY-----..."}'></textarea>
                        </div>
                        <div class="pk-modal__actions">
                            <button class="pk-btn pk-btn--ghost pk-btn--sm" id="pk-modal-cancel">Cancel</button>
                            <button class="pk-btn pk-btn--primary pk-btn--sm" id="pk-modal-confirm">Import</button>
                        </div>
                    </div>
                </div>
            `;

            const labelInput = overlay.querySelector('#pc-import-label');
            const pemInput   = overlay.querySelector('#pc-import-pem');
            const confirm    = overlay.querySelector('#pk-modal-confirm');
            const cancel     = overlay.querySelector('#pk-modal-cancel');

            confirm.addEventListener('click', () => {
                const label = labelInput.value.trim() || 'Untitled Contact';
                const pem   = pemInput.value.trim();
                if (!pem) return;
                overlay.innerHTML = '';
                this._handleImport(label, pem);
            });
            cancel.addEventListener('click', () => { overlay.innerHTML = ''; });
            overlay.querySelector('.pk-modal-backdrop').addEventListener('click', (e) => {
                if (e.target === e.currentTarget) overlay.innerHTML = '';
            });
            labelInput.focus();
        }

        // --- Toast ---------------------------------------------------------------

        _showToast(message, type) {
            const el = this.querySelector('.pk-toast-area');
            if (!el) return;
            el.innerHTML = `<div class="pk-toast pk-toast--${type}">${pki().escapeHtml(message)}</div>`;
            if (this._toastTimer) clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => { if (el) el.innerHTML = ''; }, 4000);
        }

        // --- Render --------------------------------------------------------------

        render() {
            this.innerHTML = `
                <style>${pki().PKI_SHARED_STYLES}</style>
                <div class="pk-toast-area"></div>
                <div class="pk-modal-overlay"></div>
                <div class="pk-content"></div>
            `;
            this._renderContent();
        }

        _renderContent() {
            const el = this.querySelector('.pk-content');
            if (!el) return;

            if (!pki().hasWebCrypto()) { el.innerHTML = pki().renderInsecureContextError(); return; }
            if (this._loading) { el.innerHTML = `<div class="pk-loading"><span class="pk-spinner"></span> Loading contacts...</div>`; return; }

            el.innerHTML = this._renderContactList();
            this._wireCardEvents();
        }

        _renderContactList() {
            const cards = this._contacts.map(c => `
                <div class="pk-card" data-contact-id="${c.id}">
                    <div class="pk-card__header">
                        <div class="pk-card__icon pk-card__icon--contact">${pki().PKI_ICONS.person}</div>
                        <div class="pk-card__info">
                            <div class="pk-card__label">${pki().escapeHtml(c.label)}</div>
                            <div class="pk-card__meta">Imported: ${pki().formatDate(c.imported)}</div>
                            <div class="pk-card__meta">Fingerprint: <code>${pki().escapeHtml(c.publicKeyFingerprint)}</code></div>
                            <div class="pk-card__meta">Signing: ${c.signingPublicKey
                                ? '<span class="pk-badge pk-badge--secure">verifiable</span>'
                                : '<span class="pk-badge pk-badge--warn">no signing key</span>'}</div>
                        </div>
                    </div>
                    <div class="pk-card__actions">
                        <button class="pk-btn pk-btn--ghost pk-btn--xs pc-btn-view" data-contact-id="${c.id}">View Key</button>
                        <button class="pk-btn pk-btn--danger pk-btn--xs pc-btn-delete" data-contact-id="${c.id}">Delete</button>
                    </div>
                </div>
            `).join('');

            return `
                <div class="pk-section">
                    <div class="pk-section__header">
                        <h3 class="pk-section__title">Contacts</h3>
                        <button class="pk-btn pk-btn--primary pk-btn--xs" id="pc-btn-import">+ Import</button>
                    </div>
                    ${cards.length > 0 ? cards : '<div class="pk-section__empty">No contacts imported yet</div>'}
                </div>
            `;
        }

        _wireCardEvents() {
            const btnImport = this.querySelector('#pc-btn-import');
            if (btnImport) btnImport.addEventListener('click', () => this._showImportModal());

            this.querySelectorAll('.pc-btn-view').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rec = this._contacts.find(c => c.id === Number(btn.dataset.contactId));
                    if (rec) this._handleViewKey(rec);
                });
            });

            this.querySelectorAll('.pc-btn-delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rec = this._contacts.find(c => c.id === Number(btn.dataset.contactId));
                    if (rec) this._handleDelete(rec);
                });
            });
        }

        get events() { return window.sgraphAdmin?.events; }
    }

    customElements.define('pki-contacts', PKIContacts);
})();
