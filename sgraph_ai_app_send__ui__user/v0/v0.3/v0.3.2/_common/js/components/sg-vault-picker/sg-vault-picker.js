/* =============================================================================
   SG/Send — <sg-vault-picker> Component  (Stage 1: localStorage stand-in)
   v0.3.2

   Zero-dependency Web Component for vault credential management.
   Stage 1: credentials stored in localStorage.
   Stage 2 (planned): navigator.credentials (PasswordCredential API).

   Events dispatched:
     vault-opened    { vaultKey, vaultName }
     vault-created   { vaultKey, vaultName }
     vault-key-copied { vaultKey }
     vault-share-requested { vaultKey }
     vault-closed    {}

   Attributes:
     vault-key  — pre-open a vault on mount (skips picker UI)
     compact    — suppress description text (toolbar mode)
     label      — override the displayed vault name
   ============================================================================= */

(function () {
    'use strict';

    const STORAGE_KEY = 'sg-vault-picker:credentials';
    const RECOVERY_SHOWN_KEY = 'sg-vault-picker:recovery-shown';

    function generateVaultKey() {
        const adjectives = ['apple','amber','azure','brass','cedar','cobalt','coral','crimson',
                            'dusk','ember','fern','gold','jade','lapis','maple','mint',
                            'ocean','pearl','pine','rose','ruby','sage','sand','stone'];
        const nouns      = ['arch','bank','bay','brook','cliff','cove','creek','dale',
                            'dell','dune','fell','ford','glen','hill','lake','moor',
                            'peak','plain','reef','ridge','river','shore','vale','wood'];
        const buf        = new Uint32Array(3);
        crypto.getRandomValues(buf);
        const adj  = adjectives[buf[0] % adjectives.length];
        const noun = nouns[buf[1] % nouns.length];
        const num  = (buf[2] % 9000) + 1000;
        return `${adj}-${noun}-${num}`;
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function loadCredentials() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (_) {
            return [];
        }
    }

    function saveCredentials(list) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }

    function findCredential(vaultKey) {
        return loadCredentials().find(c => c.vaultKey === vaultKey) || null;
    }

    function storeCredential(vaultKey, vaultName) {
        const list = loadCredentials().filter(c => c.vaultKey !== vaultKey);
        list.unshift({ vaultKey, vaultName, savedAt: Date.now() });
        saveCredentials(list);
    }

    function removeCredential(vaultKey) {
        saveCredentials(loadCredentials().filter(c => c.vaultKey !== vaultKey));
    }

    function truncateKey(key) {
        if (!key || key.length <= 12) return key;
        const parts = key.split('-');
        return parts.length >= 3
            ? `${parts[0]}-${parts[1]}-···`
            : key.slice(0, 8) + '···';
    }

    // =========================================================================

    class SgVaultPicker extends HTMLElement {

        constructor() {
            super();
            this._vaultKey  = null;
            this._vaultName = null;
            this._state     = 'idle'; // idle | open | creating
            this._copyTimer = null;
            this._showPaste = false;
        }

        static get observedAttributes() {
            return ['vault-key', 'compact', 'label'];
        }

        attributeChangedCallback(name, _old, value) {
            if (name === 'vault-key' && value && value !== this._vaultKey) {
                this._openVault(value, this.getAttribute('label') || value);
            }
        }

        connectedCallback() {
            const preKey = this.getAttribute('vault-key');
            if (preKey) {
                const stored = findCredential(preKey);
                this._openVault(preKey, stored ? stored.vaultName : preKey);
            } else {
                const list = loadCredentials();
                if (list.length > 0) {
                    this._openVault(list[0].vaultKey, list[0].vaultName);
                } else {
                    this._state = 'idle';
                    this._render();
                }
            }
        }

        disconnectedCallback() {
            if (this._copyTimer) clearTimeout(this._copyTimer);
        }

        // ----- public API -----

        open(vaultKey) {
            const stored = findCredential(vaultKey);
            this._openVault(vaultKey, stored ? stored.vaultName : vaultKey);
        }

        close() {
            this._vaultKey  = null;
            this._vaultName = null;
            this._state     = 'idle';
            this._render();
            this._emit('vault-closed', {});
        }

        create(vaultName) {
            const key = generateVaultKey();
            return this._openVault(key, vaultName || 'My vault', true);
        }

        getVaultKey()  { return this._vaultKey;  }
        getVaultName() { return this._vaultName; }

        // ----- internal -----

        _openVault(key, name, isNew = false) {
            this._vaultKey  = key;
            this._vaultName = name || key;
            this._state     = 'open';
            storeCredential(key, this._vaultName);
            this._render();
            const eventName = isNew ? 'vault-created' : 'vault-opened';
            this._emit(eventName, { vaultKey: key, vaultName: this._vaultName });
            if (isNew && !localStorage.getItem(RECOVERY_SHOWN_KEY)) {
                this._showRecovery();
            }
            return key;
        }

        _emit(name, detail) {
            this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true, detail }));
        }

        async _copyKey() {
            if (!this._vaultKey) return;
            try {
                await navigator.clipboard.writeText(this._vaultKey);
            } catch (_) {
                const ta = document.createElement('textarea');
                ta.value = this._vaultKey;
                ta.style.cssText = 'position:fixed;opacity:0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            this._emit('vault-key-copied', { vaultKey: this._vaultKey });
            const btn = this.querySelector('[data-action="copy"]');
            if (btn) {
                btn.textContent = 'Copied!';
                btn.classList.add('sg-vp__btn--copied');
                if (this._copyTimer) clearTimeout(this._copyTimer);
                this._copyTimer = setTimeout(() => {
                    btn.textContent = 'Copy key';
                    btn.classList.remove('sg-vp__btn--copied');
                }, 2000);
            }
        }

        _handleCreate() {
            const input = this.querySelector('[data-field="name"]');
            const name  = input ? input.value.trim() || 'My vault' : 'My vault';
            this.create(name);
        }

        _handlePasteOpen() {
            const input = this.querySelector('[data-field="paste-key"]');
            const key   = input ? input.value.trim().replace(/^["']|["']$/g, '') : '';
            if (!key) {
                this._showError('Paste your vault key above.');
                return;
            }
            this._openVault(key, key);
        }

        _showError(msg) {
            const el = this.querySelector('.sg-vp__error');
            if (el) {
                el.textContent = msg;
                el.style.display = 'block';
            }
        }

        _showRecovery() {
            const popover = document.createElement('div');
            popover.className = 'sg-vp__recovery';
            popover.innerHTML = `
                <div class="sg-vp__recovery-inner">
                    <div class="sg-vp__recovery-title">✓ Vault created — <code>${escapeHtml(this._vaultKey)}</code></div>
                    <div class="sg-vp__recovery-body">
                        The key above unlocks your vault on any device.
                        If you lose it, the vault cannot be recovered. There is no reset link — by design.
                    </div>
                    <div class="sg-vp__recovery-actions">
                        <button class="sg-vp__btn" data-action="recovery-copy">📋 Copy key</button>
                        <button class="sg-vp__btn" data-action="recovery-download">📥 Download .txt</button>
                    </div>
                    <button class="sg-vp__btn sg-vp__btn--primary" data-action="recovery-dismiss">Got it, continue →</button>
                </div>`;

            popover.querySelector('[data-action="recovery-copy"]').addEventListener('click', () => {
                this._copyKey();
            });
            popover.querySelector('[data-action="recovery-download"]').addEventListener('click', () => {
                const blob = new Blob([`SG/Send vault key\n\n${this._vaultKey}\n\nVault name: ${this._vaultName}\nCreated: ${new Date().toISOString()}\n\nKeep this file safe. If you lose the key, the vault cannot be recovered.\n`], { type: 'text/plain' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = 'sg-send-vault-key.txt';
                a.click();
                URL.revokeObjectURL(url);
            });
            popover.querySelector('[data-action="recovery-dismiss"]').addEventListener('click', () => {
                localStorage.setItem(RECOVERY_SHOWN_KEY, '1');
                popover.remove();
            });

            this.appendChild(popover);
        }

        _render() {
            const compact = this.hasAttribute('compact');
            if (this._state === 'open') {
                this.innerHTML = this._renderOpen(compact);
            } else {
                this.innerHTML = this._renderIdle(compact);
            }
            this._bindEvents();
        }

        _renderOpen(compact) {
            const name = escapeHtml(this.getAttribute('label') || this._vaultName || this._vaultKey);
            const keyShort = escapeHtml(truncateKey(this._vaultKey || ''));
            return `
<div class="sg-vp sg-vp--open${compact ? ' sg-vp--compact' : ''}">
    <div class="sg-vp__header">
        <span class="sg-vp__status-dot"></span>
        <span class="sg-vp__name" title="${escapeHtml(this._vaultKey || '')}">${name}</span>
        <span class="sg-vp__key-short">${keyShort}</span>
    </div>
    <div class="sg-vp__actions">
        <button class="sg-vp__btn" data-action="copy">Copy key</button>
        <button class="sg-vp__btn" data-action="share">Share</button>
        <button class="sg-vp__btn sg-vp__btn--ghost" data-action="switch">Switch vault</button>
    </div>
</div>`;
        }

        _renderIdle(compact) {
            return `
<div class="sg-vp sg-vp--idle${compact ? ' sg-vp--compact' : ''}">
    ${compact ? '' : '<div class="sg-vp__desc">A vault stores your files and settings, encrypted in your browser. Only you hold the key.</div>'}
    <div class="sg-vp__section">
        <label class="sg-vp__label" for="sg-vp-name">Vault name</label>
        <input class="sg-vp__input" id="sg-vp-name" type="text" placeholder="My vault" data-field="name" />
        <button class="sg-vp__btn sg-vp__btn--primary" data-action="create">Create vault</button>
    </div>
    <div class="sg-vp__divider">or</div>
    <div class="sg-vp__section">
        <button class="sg-vp__btn sg-vp__btn--ghost sg-vp__toggle-paste" data-action="toggle-paste">
            Already have a key?
        </button>
        <div class="sg-vp__paste-section" style="display:none">
            <input class="sg-vp__input" type="text" placeholder="Paste vault key (e.g. apple-river-1234)" data-field="paste-key" autocomplete="off" spellcheck="false" />
            <div class="sg-vp__error" style="display:none"></div>
            <button class="sg-vp__btn sg-vp__btn--primary" data-action="open">Open vault</button>
        </div>
    </div>
</div>`;
        }

        _bindEvents() {
            this.querySelectorAll('[data-action]').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = el.dataset.action;
                    if (action === 'create')       this._handleCreate();
                    if (action === 'open')         this._handlePasteOpen();
                    if (action === 'copy')         this._copyKey();
                    if (action === 'share')        this._emit('vault-share-requested', { vaultKey: this._vaultKey });
                    if (action === 'switch')       this.close();
                    if (action === 'toggle-paste') this._togglePaste();
                });
            });

            const nameInput = this.querySelector('[data-field="name"]');
            if (nameInput) {
                nameInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') this._handleCreate();
                });
            }
            const pasteInput = this.querySelector('[data-field="paste-key"]');
            if (pasteInput) {
                pasteInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') this._handlePasteOpen();
                });
            }
        }

        _togglePaste() {
            const section = this.querySelector('.sg-vp__paste-section');
            const btn     = this.querySelector('.sg-vp__toggle-paste');
            if (!section) return;
            const visible = section.style.display !== 'none';
            section.style.display = visible ? 'none' : 'block';
            if (btn) btn.textContent = visible ? 'Already have a key?' : 'Hide';
            if (!visible) {
                const input = section.querySelector('input');
                if (input) input.focus();
            }
        }
    }

    if (!customElements.get('sg-vault-picker')) {
        customElements.define('sg-vault-picker', SgVaultPicker);
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { SgVaultPicker, generateVaultKey, loadCredentials, storeCredential, removeCredential };
    }

})();
