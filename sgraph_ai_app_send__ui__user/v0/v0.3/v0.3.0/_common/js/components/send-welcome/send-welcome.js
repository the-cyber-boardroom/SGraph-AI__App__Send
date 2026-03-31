/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Welcome Component
   v0.2.0 — Post-purchase token activation page

   Reads a hash fragment (#transferId/decryptionKey), fetches the encrypted
   transfer, decrypts in the browser, extracts the access token, and saves
   it to localStorage via ApiClient.setAccessToken().

   URL format:  /welcome#<transferId>/<base64url-aes-key>
   The transfer contains the access token string encrypted with AES-256-GCM.

   Usage:  <send-welcome></send-welcome>
   Emits:  'welcome-complete' — { detail: { token } }
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendWelcome extends HTMLElement {

    constructor() {
        super();
        this.transferId  = null;
        this.hashKey     = null;
        this.token       = null;
        this.tokenInfo   = null;
        this.state       = 'loading';        // loading | fetching | decrypting | success | error
        this.errorMessage = null;
    }

    connectedCallback() {
        // Re-render when translations are loaded (for non-English locales)
        this._onLocaleChanged = () => { if (this.state) this.render(); };
        document.addEventListener('locale-changed', this._onLocaleChanged);

        this.parseHash();
        if (!this.transferId || !this.hashKey) {
            this.state = 'error';
            this.errorMessage = this.t('welcome.error.invalid_url');
            this.render();
            return;
        }
        this.activate();
    }

    disconnectedCallback() {
        if (this._onLocaleChanged) {
            document.removeEventListener('locale-changed', this._onLocaleChanged);
        }
    }

    // ─── Shorthand ─────────────────────────────────────────────────────

    t(key, params) { return I18n.t(key, params); }

    // ─── URL Parsing ───────────────────────────────────────────────────

    parseHash() {
        const hash = window.location.hash.substring(1);
        if (!hash) return;
        const i = hash.indexOf('/');
        if (i > 0) {
            this.transferId = hash.substring(0, i);
            this.hashKey    = hash.substring(i + 1);
        }
    }

    // ─── SGMETA Envelope ───────────────────────────────────────────────
    //
    // Two wire formats are in the wild (see send-download.js for details):
    //   Old: SGMETA[6] + \x00 + {json} + content  (bytes[6]=0x00, bytes[7]='{')
    //   New: SGMETA[6] + length[4 big-endian] + json + content (everything else)
    //
    // Discriminator uses bytes[6] AND bytes[7] — bytes[6] alone is insufficient
    // because the new-format length also starts with 0x00 for JSON < 16 MB.

    static SGMETA_MAGIC = [0x53, 0x47, 0x4D, 0x45, 0x54, 0x41];  // "SGMETA" — 6 bytes

    extractMetadata(decryptedBuffer) {
        const bytes = new Uint8Array(decryptedBuffer);
        const magic = SendWelcome.SGMETA_MAGIC;
        if (bytes.length < magic.length + 2) return { metadata: null, content: decryptedBuffer };
        for (let i = 0; i < magic.length; i++) {
            if (bytes[i] !== magic[i]) return { metadata: null, content: decryptedBuffer };
        }

        // ── Old format: SGMETA\x00{json} ─────────────────────────────────
        if (bytes[magic.length] === 0x00 && bytes[magic.length + 1] === 0x7B) {
            const jsonOffset = magic.length + 1;
            let depth = 0, jsonEnd = -1;
            for (let j = jsonOffset; j < bytes.length; j++) {
                if (bytes[j] === 0x7B) depth++;
                else if (bytes[j] === 0x7D) { if (--depth === 0) { jsonEnd = j + 1; break; } }
            }
            if (jsonEnd < 0) return { metadata: null, content: decryptedBuffer };
            try {
                const metaStr = new TextDecoder().decode(bytes.slice(jsonOffset, jsonEnd));
                return { metadata: JSON.parse(metaStr), content: decryptedBuffer.slice(jsonEnd) };
            } catch (_) { return { metadata: null, content: decryptedBuffer }; }
        }

        // ── New format: SGMETA + length[4] + json ────────────────────────
        if (bytes.length < magic.length + 4) return { metadata: null, content: decryptedBuffer };
        const metaLen      = (bytes[magic.length] << 24) | (bytes[magic.length+1] << 16) |
                             (bytes[magic.length+2] << 8) | bytes[magic.length+3];
        const contentStart = magic.length + 4 + metaLen;
        if (contentStart > bytes.length) return { metadata: null, content: decryptedBuffer };
        try {
            const metaStr = new TextDecoder().decode(bytes.slice(magic.length + 4, contentStart));
            return { metadata: JSON.parse(metaStr), content: decryptedBuffer.slice(contentStart) };
        } catch (_) { return { metadata: null, content: decryptedBuffer }; }
    }

    // ─── Activation Flow ───────────────────────────────────────────────

    async activate() {
        try {
            // Step 1: Fetch encrypted payload
            this.state = 'fetching';
            this.render();

            if (!SendCrypto.isAvailable()) {
                this.state = 'error';
                this.errorMessage = this.t('crypto.error.unavailable');
                this.render();
                return;
            }

            const encrypted = await ApiClient.downloadPayload(this.transferId);

            // Step 2: Decrypt
            this.state = 'decrypting';
            this.render();

            const key       = await SendCrypto.importKey(this.hashKey);
            const decrypted = await SendCrypto.decryptFile(key, encrypted);

            // Step 3: Extract token from SGMETA envelope or raw content
            const { content } = this.extractMetadata(decrypted);
            const tokenString = new TextDecoder().decode(content).trim();

            if (!tokenString) {
                this.state = 'error';
                this.errorMessage = this.t('welcome.error.token_invalid');
                this.render();
                return;
            }

            // Step 4: Verify token is valid
            try {
                const checkResult = await ApiClient.checkToken(tokenString);
                if (checkResult.valid === false) {
                    this.state = 'error';
                    this.errorMessage = this.t('welcome.error.token_invalid');
                    this.render();
                    return;
                }
                this.tokenInfo = checkResult;
            } catch (e) {
                // Token check endpoint unavailable — proceed anyway
            }

            // Step 5: Save to localStorage
            ApiClient.setAccessToken(tokenString);
            this.token = tokenString;

            // Step 6: Success
            this.state = 'success';
            this.render();
            this.setupEventListeners();

            this.dispatchEvent(new CustomEvent('welcome-complete', {
                detail: { token: tokenString },
                bubbles: true, composed: true
            }));

        } catch (e) {
            this.state = 'error';
            if (e.message && e.message.includes('Download failed')) {
                this.errorMessage = this.t('welcome.error.fetch_failed');
            } else {
                this.errorMessage = this.t('welcome.error.decrypt_failed');
            }
            this.render();
        }
    }

    // ─── Rendering ─────────────────────────────────────────────────────

    render() {
        if (this.state === 'loading' || this.state === 'fetching' || this.state === 'decrypting') {
            this.innerHTML = this.renderProgress();
        } else if (this.state === 'success') {
            this.innerHTML = this.renderSuccess();
        } else if (this.state === 'error') {
            this.innerHTML = this.renderError();
        }
    }

    renderProgress() {
        const statusKey = this.state === 'decrypting'
            ? 'welcome.decrypting'
            : 'welcome.fetching';

        return `
            <div class="card welcome-loading">
                <div class="welcome-spinner"></div>
                <div class="welcome-title">${this.t('welcome.title')}</div>
                <div class="welcome-status">${this.t(statusKey)}</div>
            </div>
        `;
    }

    renderSuccess() {
        const tokenInfoHtml = this.tokenInfo && this.tokenInfo.remaining !== undefined
            ? `<div class="welcome-token-info">${this.t('welcome.token_active', { remaining: this.tokenInfo.remaining })}</div>`
            : '';

        // Build the upload page URL relative to the welcome page
        const uploadUrl = '../';

        return `
            <div class="card welcome-success">
                <div class="welcome-check">
                    <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
                <div class="welcome-title">${this.t('welcome.success')}</div>
                <div class="welcome-subtitle">${this.t('welcome.personal_token_note')}</div>
                ${tokenInfoHtml}
                <a href="${uploadUrl}" class="welcome-cta">${this.t('welcome.start_sending')}</a>
            </div>
        `;
    }

    renderError() {
        return `
            <div class="card welcome-error">
                <div class="welcome-error-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </div>
                <div class="welcome-title">${this.t('welcome.error_title')}</div>
                <div class="welcome-error-message">${this.errorMessage || this.t('welcome.error.decrypt_failed')}</div>
                <a href="." class="welcome-retry">${this.t('welcome.try_again')}</a>
            </div>
        `;
    }

    setupEventListeners() {
        const cta = this.querySelector('.welcome-cta');
        if (cta) {
            cta.addEventListener('click', (e) => {
                // Let the natural link navigation happen
            });
        }
    }
}

customElements.define('send-welcome', SendWelcome);
