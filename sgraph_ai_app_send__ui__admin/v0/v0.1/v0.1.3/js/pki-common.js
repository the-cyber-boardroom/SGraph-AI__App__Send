/* =============================================================================
   SGraph Send Admin Console — PKI Common Utilities
   v0.1.3 — Shared IndexedDB, Web Crypto helpers for PKI components

   Extracted from pki-manager.js (v0.1.2) during Phase 2 refactor.
   Used by: pki-keys, pki-encrypt, pki-contacts
   ============================================================================= */

(function() {
    'use strict';

    const DB_NAME    = 'sg-send-pki';
    const DB_VERSION = 1;

    // =========================================================================
    // IndexedDB wrapper — singleton shared across PKI components
    // =========================================================================

    class PKIDatabase {
        constructor() {
            this._db       = null;
            this._opening  = null;
            this._listeners = [];     // onChange callbacks
        }

        async open() {
            if (this._db) return this._db;
            if (this._opening) return this._opening;

            this._opening = new Promise((resolve, reject) => {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('keys'))     db.createObjectStore('keys',     { keyPath: 'id', autoIncrement: true });
                    if (!db.objectStoreNames.contains('contacts')) db.createObjectStore('contacts', { keyPath: 'id', autoIncrement: true });
                };
                req.onsuccess = () => { this._db = req.result; resolve(this._db); };
                req.onerror   = () => reject(req.error);
            });

            return this._opening;
        }

        close() {
            if (this._db) { this._db.close(); this._db = null; this._opening = null; }
        }

        async getAll(storeName) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx  = db.transaction(storeName, 'readonly');
                const req = tx.objectStore(storeName).getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror   = () => reject(req.error);
            });
        }

        async add(storeName, data) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx  = db.transaction(storeName, 'readwrite');
                const req = tx.objectStore(storeName).add(data);
                req.onsuccess = () => { this._notifyChange(storeName); resolve(req.result); };
                req.onerror   = () => reject(req.error);
            });
        }

        async delete(storeName, id) {
            const db = await this.open();
            return new Promise((resolve, reject) => {
                const tx  = db.transaction(storeName, 'readwrite');
                const req = tx.objectStore(storeName).delete(id);
                req.onsuccess = () => { this._notifyChange(storeName); resolve(); };
                req.onerror   = () => reject(req.error);
            });
        }

        onChange(fn)   { this._listeners.push(fn); }
        offChange(fn)  { this._listeners = this._listeners.filter(f => f !== fn); }

        _notifyChange(storeName) {
            for (const fn of this._listeners) {
                try { fn(storeName); } catch (_) { /* swallow */ }
            }
        }
    }

    // =========================================================================
    // Web Crypto helpers
    // =========================================================================

    function hasWebCrypto() {
        return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
    }

    async function exportPublicKeyPEM(publicKey) {
        const exported = await crypto.subtle.exportKey('spki', publicKey);
        const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
        return `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g).join('\n')}\n-----END PUBLIC KEY-----`;
    }

    async function importPublicKeyPEM(pem) {
        const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
        const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        try {
            return await crypto.subtle.importKey('spki', der, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
        } catch (_) {
            return await crypto.subtle.importKey('spki', der, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
        }
    }

    async function importSigningKeyPEM(pem) {
        const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
        const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
        return await crypto.subtle.importKey('spki', der, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
    }

    async function computeFingerprint(publicKey) {
        const exported = await crypto.subtle.exportKey('spki', publicKey);
        const hash     = await crypto.subtle.digest('SHA-256', exported);
        const hex      = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
        return `sha256:${hex.substring(0, 16)}`;
    }

    // =========================================================================
    // Hybrid encryption (RSA-OAEP wraps AES-256-GCM)
    // =========================================================================

    async function hybridEncrypt(publicKey, plaintext) {
        const data   = new TextEncoder().encode(plaintext);
        const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        const iv     = crypto.getRandomValues(new Uint8Array(12));
        const encrypted  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data);
        const rawAesKey  = await crypto.subtle.exportKey('raw', aesKey);
        const wrappedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawAesKey);
        return { wrappedKey, iv, encrypted };
    }

    async function hybridDecrypt(privateKey, wrappedKey, iv, encrypted) {
        const rawAesKey = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, wrappedKey);
        const aesKey    = await crypto.subtle.importKey('raw', rawAesKey, 'AES-GCM', false, ['decrypt']);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, encrypted);
        return new TextDecoder().decode(decrypted);
    }

    // =========================================================================
    // Base64 / ArrayBuffer helpers
    // =========================================================================

    function arrayBufToB64(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))); }

    function b64ToArrayBuf(b64) {
        const bin = atob(b64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return buf.buffer;
    }

    // =========================================================================
    // UI helpers shared by PKI components
    // =========================================================================

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function formatDate(isoStr) {
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                 + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        } catch (_) { return isoStr; }
    }

    function buildPublicKeyBundle(record) {
        const bundle = { v: 1, encrypt: record.publicKeyPEM };
        if (record.signingPublicKeyPEM) bundle.sign = record.signingPublicKeyPEM;
        return JSON.stringify(bundle);
    }

    // =========================================================================
    // Shared styles (CSS variables from admin.css)
    // =========================================================================

    const PKI_SHARED_STYLES = `
        .pk-toast { position: fixed; bottom: 1.5rem; right: 1.5rem; padding: 0.75rem 1.25rem; border-radius: var(--admin-radius, 6px); font-size: var(--admin-font-size-sm, 0.875rem); font-weight: 500; z-index: 100; animation: pk-slide-up 200ms ease; }
        .pk-toast--success { background: var(--admin-success-bg, rgba(52,211,153,0.1)); color: var(--admin-success, #34d399); border: 1px solid rgba(52,211,153,0.2); }
        .pk-toast--error   { background: var(--admin-error-bg, rgba(248,113,113,0.1)); color: var(--admin-error, #f87171); border: 1px solid rgba(248,113,113,0.2); }
        @keyframes pk-slide-up { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        .pk-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 50; }
        .pk-modal { background: var(--admin-surface, #1a1d27); border: 1px solid var(--admin-border, #2e3347); border-radius: var(--admin-radius-lg, 10px); padding: 1.5rem; width: 100%; max-width: 440px; box-shadow: var(--admin-shadow-lg, 0 8px 32px rgba(0,0,0,0.4)); }
        .pk-modal__title   { font-size: var(--admin-font-size-lg, 1.125rem); font-weight: 600; color: var(--admin-text, #e4e6ef); margin-bottom: 1rem; }
        .pk-modal__text    { font-size: var(--admin-font-size-sm, 0.875rem); color: var(--admin-text-secondary, #8b8fa7); margin: 0 0 0.75rem; line-height: 1.5; }
        .pk-modal__warning { font-size: var(--admin-font-size-sm, 0.875rem); color: var(--admin-warning, #fbbf24); background: var(--admin-warning-bg, rgba(251,191,36,0.1)); padding: 0.625rem 0.75rem; border-radius: var(--admin-radius, 6px); margin: 0 0 1rem; line-height: 1.5; }
        .pk-modal__info    { font-size: var(--admin-font-size-xs, 0.75rem); color: var(--admin-text-muted, #5e6280); margin: 0 0 1rem; line-height: 1.5; }
        .pk-modal__field   { margin-bottom: 1rem; }
        .pk-modal__field label { display: block; font-size: var(--admin-font-size-xs, 0.75rem); font-weight: 500; color: var(--admin-text-secondary, #8b8fa7); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.03em; }
        .pk-modal__field input, .pk-modal__field textarea, .pk-modal__field select { width: 100%; padding: 0.5rem 0.625rem; font-size: var(--admin-font-size-sm, 0.875rem); font-family: var(--admin-font, sans-serif); color: var(--admin-text, #e4e6ef); background: var(--admin-bg, #0f1117); border: 1px solid var(--admin-border, #2e3347); border-radius: var(--admin-radius, 6px); box-sizing: border-box; }
        .pk-modal__field textarea { font-family: var(--admin-font-mono, monospace); font-size: var(--admin-font-size-xs, 0.75rem); resize: vertical; }
        .pk-modal__field input:focus, .pk-modal__field textarea:focus { outline: none; border-color: var(--admin-primary, #4f8ff7); box-shadow: 0 0 0 2px var(--admin-primary-bg, rgba(79,143,247,0.1)); }
        .pk-modal__actions { display: flex; justify-content: flex-end; gap: 0.5rem; }

        .pk-section  { background: var(--admin-surface, #1a1d27); border: 1px solid var(--admin-border, #2e3347); border-radius: var(--admin-radius-lg, 10px); padding: 0.875rem 1rem; margin-bottom: 0.75rem; }
        .pk-section__header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.625rem; }
        .pk-section__title  { font-size: var(--admin-font-size-sm, 0.875rem); font-weight: 600; color: var(--admin-text, #e4e6ef); margin: 0; }
        .pk-section__empty  { color: var(--admin-text-muted, #5e6280); font-size: var(--admin-font-size-xs, 0.75rem); padding: 0.5rem 0 0.25rem; }

        .pk-card         { background: var(--admin-bg, #0f1117); border: 1px solid var(--admin-border-subtle, #252838); border-radius: var(--admin-radius, 6px); padding: 0.625rem 0.75rem; margin-bottom: 0.5rem; }
        .pk-card:last-child { margin-bottom: 0; }
        .pk-card__header { display: flex; gap: 0.5rem; align-items: flex-start; }
        .pk-card__icon   { color: var(--admin-primary, #4f8ff7); flex-shrink: 0; margin-top: 0.125rem; }
        .pk-card__icon svg { width: 16px; height: 16px; }
        .pk-card__icon--contact { color: var(--admin-text-secondary, #8b8fa7); }
        .pk-card__info   { flex: 1; min-width: 0; }
        .pk-card__label  { font-weight: 600; font-size: var(--admin-font-size-sm, 0.875rem); color: var(--admin-text, #e4e6ef); margin-bottom: 0.125rem; }
        .pk-card__meta   { font-size: 0.6875rem; color: var(--admin-text-secondary, #8b8fa7); line-height: 1.5; }
        .pk-card__meta code { font-family: var(--admin-font-mono, monospace); font-size: 0.6875rem; color: var(--admin-text-muted, #5e6280); }
        .pk-card__actions { display: flex; gap: 0.375rem; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--admin-border-subtle, #252838); }

        .pk-badge { display: inline-block; padding: 0.0625rem 0.375rem; font-size: var(--admin-font-size-xs, 0.75rem); font-weight: 600; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.03em; }
        .pk-badge--secure { background: var(--admin-success-bg, rgba(52,211,153,0.1)); color: var(--admin-success, #34d399); }
        .pk-badge--warn   { background: var(--admin-warning-bg, rgba(251,191,36,0.1)); color: var(--admin-warning, #fbbf24); }
        .pk-badge--error  { background: var(--admin-error-bg, rgba(248,113,113,0.1)); color: var(--admin-error, #f87171); }

        .pk-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.375rem; border: none; border-radius: var(--admin-radius, 6px); cursor: pointer; font-family: var(--admin-font, sans-serif); font-weight: 500; transition: background 150ms ease, color 150ms ease; white-space: nowrap; text-decoration: none; }
        .pk-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .pk-btn--sm { padding: 0.4rem 0.75rem; font-size: var(--admin-font-size-sm, 0.875rem); }
        .pk-btn--xs { padding: 0.25rem 0.5rem; font-size: var(--admin-font-size-xs, 0.75rem); }
        .pk-btn--primary { background: var(--admin-primary, #4f8ff7); color: #fff; }
        .pk-btn--primary:hover:not(:disabled) { background: var(--admin-primary-hover, #3a7be8); }
        .pk-btn--ghost { background: transparent; color: var(--admin-text-secondary, #8b8fa7); }
        .pk-btn--ghost:hover:not(:disabled) { background: var(--admin-surface-hover, #2a2e3d); color: var(--admin-text, #e4e6ef); }
        .pk-btn--danger { background: var(--admin-error-bg, rgba(248,113,113,0.1)); color: var(--admin-error, #f87171); border: 1px solid rgba(248,113,113,0.2); }
        .pk-btn--danger:hover:not(:disabled) { background: var(--admin-error, #f87171); color: #fff; }

        .pk-loading { display: flex; align-items: center; gap: 0.5rem; padding: 1rem; justify-content: center; color: var(--admin-text-secondary, #8b8fa7); font-size: var(--admin-font-size-sm, 0.875rem); }
        .pk-spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--admin-border, #2e3347); border-top-color: var(--admin-primary, #4f8ff7); border-radius: 50%; animation: pk-spin 0.6s linear infinite; }
        @keyframes pk-spin { to { transform: rotate(360deg); } }

        .pk-empty { text-align: center; padding: 1rem 0.5rem; }
        .pk-empty__icon { color: var(--admin-text-muted, #5e6280); margin-bottom: 0.375rem; }
        .pk-empty__text { font-size: var(--admin-font-size-sm, 0.875rem); color: var(--admin-text-secondary, #8b8fa7); margin-bottom: 0.125rem; }
        .pk-empty__hint { font-size: var(--admin-font-size-xs, 0.75rem); color: var(--admin-text-muted, #5e6280); margin-bottom: 0.75rem; }

        .pk-radio-group { display: flex; flex-direction: column; gap: 0.375rem; }
        .pk-radio { font-size: var(--admin-font-size-sm, 0.875rem); color: var(--admin-text-secondary, #8b8fa7); cursor: pointer; display: flex; align-items: center; gap: 0.375rem; }
        .pk-radio input { cursor: pointer; }

        .pk-insecure { text-align: center; padding: 2rem 1rem; }
        .pk-insecure__icon  { color: var(--admin-warning, #fbbf24); margin-bottom: 0.75rem; }
        .pk-insecure__title { font-size: var(--admin-font-size-xl, 1.25rem); font-weight: 600; color: var(--admin-text, #e4e6ef); margin-bottom: 1rem; }
        .pk-insecure__text  { font-size: var(--admin-font-size-sm, 0.875rem); color: var(--admin-text-secondary, #8b8fa7); line-height: 1.6; margin: 0 0 0.75rem; max-width: 560px; margin-left: auto; margin-right: auto; }
        .pk-insecure__text code { font-family: var(--admin-font-mono, monospace); font-size: var(--admin-font-size-xs, 0.75rem); background: var(--admin-bg, #0f1117); padding: 0.125rem 0.375rem; border-radius: 3px; }
        .pk-insecure__fix   { font-size: var(--admin-font-size-sm, 0.875rem); color: var(--admin-text, #e4e6ef); background: var(--admin-primary-bg, rgba(79,143,247,0.1)); border: 1px solid rgba(79,143,247,0.2); border-radius: var(--admin-radius, 6px); padding: 0.75rem 1rem; max-width: 560px; margin: 1rem auto 0; line-height: 1.5; }
        .pk-insecure__fix a { color: var(--admin-primary, #4f8ff7); text-decoration: underline; word-break: break-all; }

        @media (max-width: 768px) {
            .pk-card__header  { flex-direction: column; }
            .pk-card__actions { flex-wrap: wrap; }
        }
    `;

    // =========================================================================
    // Toast helper mixin
    // =========================================================================

    const PKIToastMixin = {
        _initToast(containerEl) {
            this._toastEl    = containerEl;
            this._toastTimer = null;
        },

        showToast(message, type) {
            if (this._toastTimer) clearTimeout(this._toastTimer);
            if (!this._toastEl) return;
            this._toastEl.innerHTML = `<div class="pk-toast pk-toast--${type}">${escapeHtml(message)}</div>`;
            this._toastTimer = setTimeout(() => {
                if (this._toastEl) this._toastEl.innerHTML = '';
            }, 4000);
        },

        clearToast() {
            if (this._toastTimer) clearTimeout(this._toastTimer);
        }
    };

    // =========================================================================
    // Insecure context error renderer
    // =========================================================================

    function renderInsecureContextError() {
        const currentUrl   = location.href;
        const localhostUrl = currentUrl.replace(location.hostname, 'localhost');
        return `
            <div class="pk-insecure">
                <div class="pk-insecure__icon">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="40" height="40">
                        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                    </svg>
                </div>
                <div class="pk-insecure__title">Secure Context Required</div>
                <p class="pk-insecure__text">
                    The Web Crypto API (<code>crypto.subtle</code>) is not available because this page
                    is being served over an insecure context.
                </p>
                <p class="pk-insecure__text">
                    Browsers restrict <code>crypto.subtle</code> to <strong>HTTPS</strong> or <strong>localhost</strong>.
                    The current origin (<code>${escapeHtml(location.origin)}</code>) does not qualify.
                </p>
                <p class="pk-insecure__fix">
                    Try accessing this page via <a href="${escapeAttr(localhostUrl)}">${escapeHtml(localhostUrl)}</a> instead.
                </p>
            </div>
        `;
    }

    // =========================================================================
    // SVG icons used by PKI components
    // =========================================================================

    const PKI_ICONS = {
        key:     '<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clip-rule="evenodd"/></svg>',
        person:  '<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg>',
        warning: '<svg viewBox="0 0 20 20" fill="currentColor" width="40" height="40"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>',
    };

    // =========================================================================
    // Export singleton + helpers on global namespace
    // =========================================================================

    window.sgraphAdmin = window.sgraphAdmin || {};
    window.sgraphAdmin.pki = {
        db                       : new PKIDatabase(),
        hasWebCrypto,
        exportPublicKeyPEM,
        importPublicKeyPEM,
        importSigningKeyPEM,
        computeFingerprint,
        hybridEncrypt,
        hybridDecrypt,
        arrayBufToB64,
        b64ToArrayBuf,
        escapeHtml,
        escapeAttr,
        formatDate,
        buildPublicKeyBundle,
        renderInsecureContextError,
        PKI_SHARED_STYLES,
        PKIToastMixin,
        PKI_ICONS,
    };

})();
