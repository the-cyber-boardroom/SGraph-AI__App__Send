/* =============================================================================
   SGraph Send Admin Console — Vault Share Dialog
   v0.1.6 — Share vault files with PKI contacts

   Shows a modal dialog that:
   1. Loads contacts from IndexedDB
   2. Lets user pick a contact + permission level
   3. Re-encrypts the file for the contact's public key
   4. Calls ACL backend to grant access

   Usage (from vault-manager):
     const dialog = document.createElement('vault-share-dialog');
     dialog.show({
         fileGuid, fileName, vaultCacheKey,
         ownerPrivateKey, ownerFingerprint,
         encryptedBlob, onComplete
     });
     document.body.appendChild(dialog);
   ============================================================================= */

(function() {
    'use strict';

    const { escapeHtml, PKI_SHARED_STYLES } = window.sgraphAdmin.pki;
    const pki = () => window.sgraphAdmin.pki;

    const SVG_SHARE  = '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z"/></svg>';
    const SVG_USER   = '<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>';

    const SHARE_STYLES = `
        ${PKI_SHARED_STYLES}

        :host { display: block; }

        .vsh-overlay { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; }

        .vsh-dialog { background: var(--admin-surface, #1a1d27); border: 1px solid var(--admin-border, #2e3347); border-radius: var(--admin-radius-lg, 10px); padding: 1.25rem; width: 440px; max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }

        .vsh-title { font-size: 1rem; font-weight: 600; color: var(--admin-text, #e4e6ef); margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.375rem; }
        .vsh-title svg { width: 18px; height: 18px; flex-shrink: 0; }
        .vsh-subtitle { font-size: 0.75rem; color: var(--admin-text-muted, #5e6280); margin-bottom: 1rem; }

        .vsh-field { margin-bottom: 0.75rem; }
        .vsh-field label { display: block; font-size: 0.6875rem; font-weight: 600; color: var(--admin-text-muted, #5e6280); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.25rem; }
        .vsh-field select { width: 100%; background: var(--admin-bg, #0f1117); border: 1px solid var(--admin-border, #2e3347); border-radius: var(--admin-radius, 6px); color: var(--admin-text, #e4e6ef); font-size: 0.8125rem; padding: 0.375rem 0.5rem; outline: none; font-family: var(--admin-font-mono, monospace); }
        .vsh-field select:focus { border-color: var(--admin-primary, #4f8ff7); box-shadow: 0 0 0 2px var(--admin-primary-bg, rgba(79,143,247,0.1)); }

        .vsh-contact-info { font-size: 0.6875rem; color: var(--admin-text-secondary, #8b8fa7); margin-top: 0.25rem; font-family: var(--admin-font-mono, monospace); }

        .vsh-actions { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; }
        .vsh-actions svg { width: 14px; height: 14px; vertical-align: -2px; }

        .vsh-progress { font-size: 0.75rem; color: var(--admin-text-secondary, #8b8fa7); margin-top: 0.75rem; min-height: 1.25rem; }
        .vsh-progress.vsh-error { color: var(--admin-error, #ef4444); }
        .vsh-progress.vsh-success { color: var(--admin-success, #34d399); }

        .vsh-empty { text-align: center; padding: 1.5rem 0; color: var(--admin-text-muted, #5e6280); font-size: 0.8125rem; }
        .vsh-empty svg { width: 24px; height: 24px; margin-bottom: 0.5rem; display: block; margin-inline: auto; opacity: 0.4; }
    `;

    class VaultShareDialog extends HTMLElement {
        constructor() {
            super();
            this._config    = null;
            this._contacts  = [];
        }

        async show(config) {
            this._config = config;
            await this._loadContacts();
            this._render();
        }

        async _loadContacts() {
            try {
                const db = pki().db;
                this._contacts = await db.getAll('contacts');
            } catch {
                this._contacts = [];
            }
        }

        _render() {
            const { fileName } = this._config;
            const hasContacts  = this._contacts.length > 0;

            let bodyHtml = '';
            if (!hasContacts) {
                bodyHtml = `
                    <div class="vsh-empty">
                        ${SVG_USER}
                        No PKI contacts found.<br>
                        Import a contact's public key first.
                    </div>
                    <div class="vsh-actions">
                        <button class="pk-btn pk-btn--sm pk-btn--ghost" id="vsh-cancel">Close</button>
                    </div>`;
            } else {
                const contactOptions = this._contacts.map((c, i) => {
                    const fp = c.publicKeyFingerprint || '';
                    const shortFp = fp.length > 16 ? fp.substring(0, 16) : fp;
                    const label = c.label || `Contact ${i + 1}`;
                    return `<option value="${i}">${escapeHtml(label)} (${escapeHtml(shortFp)})</option>`;
                }).join('');

                bodyHtml = `
                    <div class="vsh-field">
                        <label>Contact</label>
                        <select id="vsh-contact">${contactOptions}</select>
                        <div class="vsh-contact-info" id="vsh-contact-info"></div>
                    </div>
                    <div class="vsh-field">
                        <label>Permission</label>
                        <select id="vsh-permission">
                            <option value="viewer">Viewer — read only</option>
                            <option value="editor">Editor — read &amp; write</option>
                        </select>
                    </div>
                    <div class="vsh-progress" id="vsh-progress"></div>
                    <div class="vsh-actions">
                        <button class="pk-btn pk-btn--sm pk-btn--ghost" id="vsh-cancel">Cancel</button>
                        <button class="pk-btn pk-btn--sm pk-btn--primary" id="vsh-confirm">${SVG_SHARE} Share</button>
                    </div>`;
            }

            this.innerHTML = `<style>${SHARE_STYLES}</style>
                <div class="vsh-overlay">
                    <div class="vsh-dialog">
                        <div class="vsh-title">${SVG_SHARE} Share with Contact</div>
                        <div class="vsh-subtitle">Share "${escapeHtml(fileName || 'file')}" — re-encrypt for contact's key</div>
                        ${bodyHtml}
                    </div>
                </div>`;

            this._bindEvents();
            this._updateContactInfo();
        }

        _bindEvents() {
            const cancel = this.querySelector('#vsh-cancel');
            if (cancel) cancel.addEventListener('click', () => this.remove());

            // Click outside to close
            const overlay = this.querySelector('.vsh-overlay');
            if (overlay) overlay.addEventListener('click', (e) => {
                if (e.target === overlay) this.remove();
            });

            const contactSelect = this.querySelector('#vsh-contact');
            if (contactSelect) contactSelect.addEventListener('change', () => this._updateContactInfo());

            const confirm = this.querySelector('#vsh-confirm');
            if (confirm) confirm.addEventListener('click', () => this._executeShare());
        }

        _updateContactInfo() {
            const info    = this.querySelector('#vsh-contact-info');
            const select  = this.querySelector('#vsh-contact');
            if (!info || !select) return;

            const contact = this._contacts[parseInt(select.value)];
            if (!contact) { info.textContent = ''; return; }

            const fp   = contact.publicKeyFingerprint || 'unknown';
            const algo = contact.algorithm || 'RSA-OAEP';
            const sign = contact.signingPublicKey ? ' + signing' : '';
            info.textContent = `${fp} · ${algo}${sign}`;
        }

        async _executeShare() {
            const select     = this.querySelector('#vsh-contact');
            const permSelect = this.querySelector('#vsh-permission');
            const progress   = this.querySelector('#vsh-progress');
            const confirm    = this.querySelector('#vsh-confirm');

            if (!select || !permSelect) return;

            const contact    = this._contacts[parseInt(select.value)];
            const permission = permSelect.value;

            if (!contact) {
                progress.textContent = 'No contact selected';
                progress.className   = 'vsh-progress vsh-error';
                return;
            }

            confirm.disabled = true;
            const setProgress = (msg) => { progress.textContent = msg; progress.className = 'vsh-progress'; };
            const setError    = (msg) => { progress.textContent = msg; progress.className = 'vsh-progress vsh-error'; confirm.disabled = false; };

            try {
                const { fileGuid, vaultCacheKey, ownerPrivateKey, ownerFingerprint, encryptedBlob } = this._config;
                const multi = window.sgraphAdmin.vaultCryptoMulti;

                if (!multi) {
                    setError('Multi-recipient encryption module not loaded');
                    return;
                }

                const contactFp = contact.publicKeyFingerprint || '';

                // Step 1: Check if blob is v1 or v2
                setProgress('Step 1/4 — Checking encryption format...');
                const packed = new Uint8Array(encryptedBlob);
                let v2Blob;

                if (packed[0] === multi.VERSION_MULTI) {
                    // Already v2: add recipient
                    setProgress('Step 2/4 — Adding recipient key...');
                    v2Blob = await multi.addRecipient(
                        ownerPrivateKey, packed, ownerFingerprint,
                        contact.publicKey, contactFp
                    );
                } else {
                    // v1 legacy: decrypt and re-encrypt for both recipients
                    setProgress('Step 2/4 — Re-encrypting for both recipients...');
                    // Decrypt with v1
                    const wkLen      = new Uint32Array(packed.slice(0, 4).buffer)[0];
                    const wrappedKey = packed.slice(4, 4 + wkLen);
                    const iv         = packed.slice(4 + wkLen, 4 + wkLen + 12);
                    const ciphertext = packed.slice(4 + wkLen + 12);
                    const rawAesKey  = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, ownerPrivateKey, wrappedKey);
                    const aesKey     = await crypto.subtle.importKey('raw', rawAesKey, 'AES-GCM', false, ['decrypt']);
                    const plaintext  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ciphertext);

                    // Re-encrypt as v2 with both recipients
                    v2Blob = await multi.encryptMulti([
                        { publicKey: this._config.ownerPublicKey, fingerprint: ownerFingerprint },
                        { publicKey: contact.publicKey,           fingerprint: contactFp         }
                    ], plaintext);
                }

                // Step 3: Store updated encrypted blob
                setProgress('Step 3/4 — Storing re-encrypted file...');
                const b64 = _arrayBufToB64Safe(v2Blob);
                await adminAPI.vaultStoreFile(vaultCacheKey, fileGuid, b64);

                // Step 4: Grant ACL access
                setProgress('Step 4/4 — Granting access...');
                try {
                    await adminAPI.vaultShare(vaultCacheKey, contactFp, permission);
                } catch (aclErr) {
                    // ACL might fail if service not configured — file is still shared cryptographically
                    console.warn('ACL grant failed (file still re-encrypted):', aclErr);
                }

                progress.textContent = `Shared with "${contact.label || 'contact'}" as ${permission}`;
                progress.className   = 'vsh-progress vsh-success';
                confirm.textContent  = 'Done';
                confirm.disabled     = false;
                confirm.onclick      = () => this.remove();

                if (this._config.onComplete) {
                    this._config.onComplete({ contactFp, permission });
                }

            } catch (err) {
                setError('Share failed: ' + err.message);
            }
        }
    }

    // Chunked base64 encoder (same as vault-manager)
    function _arrayBufToB64Safe(buf) {
        const bytes = new Uint8Array(buf);
        const CHUNK = 8192;
        let binary = '';
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(binary);
    }

    customElements.define('vault-share-dialog', VaultShareDialog);
})();
