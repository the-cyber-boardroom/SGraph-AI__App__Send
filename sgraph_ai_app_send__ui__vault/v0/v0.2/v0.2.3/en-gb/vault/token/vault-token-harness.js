/**
 * vault-token-harness.js
 *
 * Main ES module for the /en-gb/vault/token test harness page.
 * Defines: vt-vault-loader, vt-vault-frame, vt-crypto-lab, vt-storage-inspector.
 * vt-token-manager and vt-api-log are defined in their own files.
 *
 * sg-layout is imported from CDN (pinned).
 * _common/ vault library is loaded as globals via <script> tags in index.html.
 */

import { parseCredential, resolveCredential, storeCredentials, getCredentials, clearCredentials } from './vault-credentials.js';
import { deriveVaultSecretKey, exportKeyBytes, ownerEncrypt, ownerDecrypt } from './vault-hkdf.js';
import './vault-api-log.js';
import './vault-token-manager.js';

/* ── Shared util ──────────────────────────────────────────────────────────── */

/**
 * Walk sg-layout's shadow DOM tree (recursively) and click the first tab button
 * whose text content includes `titleFragment`. Returns true if found and clicked.
 */
function _activateSGLayoutTab(titleFragment) {
    const layout = document.getElementById('sg-layout-root');
    if (!layout) return false;

    function search(root) {
        if (!root) return false;
        const nodes = root.querySelectorAll('button, [role="tab"]');
        for (const node of nodes) {
            if (node.textContent && node.textContent.includes(titleFragment)) {
                node.click();
                return true;
            }
        }
        // Recurse into shadow roots of child elements
        for (const child of root.querySelectorAll('*')) {
            if (child.shadowRoot && search(child.shadowRoot)) return true;
        }
        return false;
    }

    // Try shadow root first, then light DOM fallback
    return search(layout.shadowRoot || layout);
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
}

function maskVaultKey(key) {
    if (!key) return '';
    const parts = key.split('-');
    if (parts.length === 3 && /^\d{4}$/.test(parts[2])) {
        return parts[0] + '-' + parts[1] + '-····';
    }
    if (key.length <= 8) return '·'.repeat(key.length);
    return key.slice(0, Math.min(8, Math.floor(key.length * 0.4))) + '···';
}

function maskId(id) {
    if (!id) return '(none)';
    return id.slice(0, 4) + '····' + id.slice(-2);
}

/* ══════════════════════════════════════════════════════════════════════════ */
/*  <vt-vault-loader>                                                         */
/* ══════════════════════════════════════════════════════════════════════════ */
class VtVaultLoader extends HTMLElement {
    connectedCallback() {
        this._render();
        // 1. Restore already-resolved credentials from sessionStorage (page reload)
        const saved = getCredentials();
        if (saved) {
            this._showLoaded(saved);
            document.dispatchEvent(new CustomEvent('vt:credentials-loaded', { detail: saved }));
            return;
        }
        // 2. Auto-load from the vault key stored by the main vault shell (localStorage)
        const lsKey = localStorage.getItem('sg-vault-key');
        if (lsKey) {
            const inp = this.querySelector('#vl-input');
            if (inp) inp.value = lsKey;
            this._setStatus('Vault key detected from main vault — click Load vault or press Ctrl+Enter.', 'ok');
            this._autoLoad(lsKey);
        }
    }

    async _autoLoad(key) {
        const credential = parseCredential(key);
        if (!credential) return;
        this._setStatus('Auto-loading vault from main vault key…', 'busy');
        const btn = this.querySelector('#vl-load-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
        try {
            const resolved = await resolveCredential(credential);
            storeCredentials(resolved);
            this._showLoaded(resolved);
            document.dispatchEvent(new CustomEvent('vt:credentials-loaded', { detail: resolved }));
        } catch (err) {
            this._setStatus(`Auto-load failed: ${err.message} — paste key manually.`, 'err');
            if (btn) { btn.disabled = false; btn.textContent = 'Load vault'; }
        }
    }

    _render() {
        this.innerHTML = `
            <div class="vl-wrap">
                <div class="vl-form" id="vl-form">
                    <div class="vl-title">Vault Loader</div>
                    <div class="vl-hint">Enter a vault key or read-only token to load the vault.</div>
                    <textarea class="vl-input" id="vl-input" rows="2"
                        placeholder="word-word-NNNN&#10;passphrase:vault_id&#10;ro-word-word-NNNN"></textarea>
                    <div class="vl-formats">
                        <span class="vl-fmt">word-word-NNNN → owner</span>
                        <span class="vl-fmt">ro-word-word-NNNN → read-only</span>
                    </div>
                    <div class="vl-actions">
                        <button class="pk-btn pk-btn--primary" id="vl-load-btn">Load vault</button>
                    </div>
                    <div class="vl-status" id="vl-status"></div>
                </div>
                <div class="vl-loaded hidden" id="vl-loaded"></div>
            </div>
            <style>
                .vl-wrap   { display:flex; flex-direction:column; height:100%; padding:0.75rem; gap:0.6rem; }
                .vl-title  { font-size:0.68rem; font-weight:700; text-transform:uppercase;
                             letter-spacing:0.08em; color:var(--muted); }
                .vl-hint   { font-size:0.75rem; color:var(--muted); }
                .vl-input  { background:var(--bg3); border:1px solid var(--border); border-radius:6px;
                             color:var(--text); font-family:monospace; font-size:0.8rem;
                             padding:0.45rem 0.65rem; outline:none; resize:vertical; }
                .vl-input:focus { border-color:rgba(78,205,196,0.4); }
                .vl-formats{ display:flex; flex-direction:column; gap:0.15rem; }
                .vl-fmt    { font-size:0.65rem; color:var(--muted); }
                .vl-actions{ display:flex; gap:0.4rem; flex-wrap:wrap; }
                .vl-status { font-size:0.75rem; min-height:1.1em; }
                .vl-status--ok   { color:var(--teal); }
                .vl-status--err  { color:var(--err); }
                .vl-status--busy { color:var(--muted); font-style:italic; }
                .hidden { display:none !important; }
                /* Loaded card */
                .vl-loaded-card { background:var(--bg2); border:1px solid var(--border);
                                  border-radius:8px; padding:0.65rem 0.8rem; display:flex;
                                  flex-direction:column; gap:0.4rem; }
                .vl-loaded-title{ font-size:0.8rem; font-weight:600; color:var(--text); }
                .vl-loaded-mode { font-size:0.72rem; }
                .vl-loaded-mode--owner  { color:var(--teal); }
                .vl-loaded-mode--ro     { color:var(--warn); }
                .vl-loaded-id   { font-family:monospace; font-size:0.72rem; color:var(--muted); }
                .vl-loaded-actions { display:flex; gap:0.35rem; flex-wrap:wrap; margin-top:0.2rem; }
            </style>`;

        this.querySelector('#vl-load-btn').addEventListener('click', () => this._load());
        this.querySelector('#vl-input').addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) this._load();
        });
    }

    async _load() {
        const input  = (this.querySelector('#vl-input')?.value || '').trim();
        const status = this.querySelector('#vl-status');
        const btn    = this.querySelector('#vl-load-btn');

        if (!input) {
            this._setStatus('Enter a vault key or token.', 'err');
            return;
        }

        const credential = parseCredential(input);
        if (!credential) {
            this._setStatus('Unrecognised format. Use word-word-NNNN, passphrase:vault_id, or ro-word-word-NNNN.', 'err');
            return;
        }

        btn.disabled    = true;
        btn.textContent = 'Loading…';
        this._setStatus('Resolving credentials…', 'busy');

        try {
            const resolved = await resolveCredential(credential);
            storeCredentials(resolved);
            this._showLoaded(resolved);
            document.dispatchEvent(new CustomEvent('vt:credentials-loaded', { detail: resolved }));
        } catch (err) {
            this._setStatus(`Error: ${err.message}`, 'err');
        } finally {
            btn.disabled    = false;
            btn.textContent = 'Load vault';
        }
    }

    _showLoaded(resolved) {
        const form   = this.querySelector('#vl-form');
        const loaded = this.querySelector('#vl-loaded');
        if (!form || !loaded) return;

        form.classList.add('hidden');
        loaded.classList.remove('hidden');

        const modeLabel = resolved.mode === 'full' ? '🔑 Owner mode' : '👁 Read-only mode';
        const modeCls   = resolved.mode === 'full' ? 'vl-loaded-mode--owner' : 'vl-loaded-mode--ro';
        const vaultKeyLabel = resolved.vaultKey ? maskVaultKey(resolved.vaultKey) : '(derived)';

        loaded.innerHTML = `
            <div class="vl-loaded-card">
                <div class="vl-loaded-title">Vault loaded</div>
                <div class="vl-loaded-mode ${modeCls}">${modeLabel}</div>
                ${resolved.vaultId
                    ? `<div class="vl-loaded-id">vault_id: ${esc(maskId(resolved.vaultId))}</div>` : ''}
                ${resolved.mode === 'full'
                    ? `<div class="vl-loaded-id">key: ${esc(vaultKeyLabel)}</div>` : ''}
                ${resolved.mode === 'readonly' && resolved.roToken
                    ? `<div class="vl-loaded-id">token: ro-${esc(resolved.roToken.slice(0, 6))}···</div>` : ''}
                <div class="vl-loaded-actions">
                    <button class="pk-btn pk-btn--danger" id="vl-clear-btn">Clear</button>
                    <button class="pk-btn" id="vl-open-btn">Open in main vault →</button>
                </div>
            </div>`;

        loaded.querySelector('#vl-clear-btn').addEventListener('click', () => this._clear());
        loaded.querySelector('#vl-open-btn').addEventListener('click', () => {
            const hash = resolved.mode === 'full' && resolved.vaultKey
                ? `#${resolved.vaultKey}`
                : (resolved.roToken ? `#ro-${resolved.roToken}` : '');
            window.open(`/en-gb/vault/${hash}`, '_blank');
        });
    }

    _clear() {
        clearCredentials();
        const form   = this.querySelector('#vl-form');
        const loaded = this.querySelector('#vl-loaded');
        if (form)   form.classList.remove('hidden');
        if (loaded) loaded.classList.add('hidden');
        const inp = this.querySelector('#vl-input');
        if (inp) inp.value = '';
        this._setStatus('', '');
        document.dispatchEvent(new CustomEvent('vt:credentials-cleared'));
    }

    _setStatus(msg, type) {
        const el = this.querySelector('#vl-status');
        if (!el) return;
        el.textContent = msg;
        el.className   = `vl-status ${type ? 'vl-status--' + type : ''}`;
    }
}

customElements.define('vt-vault-loader', VtVaultLoader);

/* ══════════════════════════════════════════════════════════════════════════ */
/*  <vt-vault-frame>                                                           */
/* ══════════════════════════════════════════════════════════════════════════ */
class VtVaultFrame extends HTMLElement {
    constructor() {
        super();
        this._mode = null;
    }

    connectedCallback() {
        // mode comes from the sg-layout state or a data attribute
        this._mode = this.dataset.mode || this.getAttribute('data-mode') || 'owner';
        this._render();

        document.addEventListener('vt:credentials-loaded',  e => this._onCredentials(e.detail));
        document.addEventListener('vt:credentials-cleared', () => this._onClear());
        document.addEventListener('vt:load-ro-in-frame',    e => {
            if (this._mode === 'ro') this._loadROToken(e.detail);
        });

        // Hydrate from sessionStorage if credentials were loaded before this frame mounted
        const saved = getCredentials();
        if (saved) this._onCredentials(saved);
    }

    _render() {
        const isOwner = this._mode === 'owner';
        const borderColor = isOwner ? 'var(--teal)' : 'var(--warn)';
        const title = isOwner ? '🔑 Owner View' : '👁 RO View';

        this.innerHTML = `
            <div class="vf-wrap">
                <div class="vf-bar">
                    <span class="vf-title">${title}</span>
                    <div class="vf-actions" id="vf-bar-actions"></div>
                </div>
                <div class="vf-placeholder" id="vf-placeholder">
                    <div class="vf-ph-msg">No vault loaded.</div>
                    <div class="vf-ph-sub">Load credentials in the Vault Loader panel.</div>
                </div>
                <iframe class="vf-iframe hidden" id="vf-iframe"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
                    style="border:2px solid ${borderColor}"></iframe>
            </div>
            <style>
                .vf-wrap    { display:flex; flex-direction:column; height:100%; }
                .vf-bar     { display:flex; align-items:center; gap:0.5rem; padding:0.3rem 0.65rem;
                              border-bottom:1px solid var(--border); flex-shrink:0; background:var(--bg2); }
                .vf-title   { font-size:0.72rem; font-weight:600; color:var(--text); }
                .vf-actions { display:flex; gap:0.3rem; margin-left:auto; }
                .vf-placeholder { display:flex; flex-direction:column; align-items:center;
                                  justify-content:center; flex:1; gap:0.4rem; padding:2rem; text-align:center; }
                .vf-ph-msg  { color:var(--muted); font-style:italic; font-size:0.82rem; }
                .vf-ph-sub  { color:var(--muted); font-size:0.72rem; }
                .vf-iframe  { flex:1; width:100%; height:0; min-height:0; border:none; }
                .vf-iframe.has-src { height:100%; }
                /* RO placeholder */
                .vf-ro-placeholder { display:flex; flex-direction:column; align-items:center;
                                     justify-content:center; flex:1; gap:0.5rem; padding:1.5rem; text-align:center; }
                .vf-ro-title   { color:var(--warn); font-size:0.88rem; font-weight:600; }
                .vf-ro-note    { color:var(--muted); font-size:0.78rem; max-width:320px; }
                .vf-ro-id      { font-family:monospace; font-size:0.75rem; color:var(--text);
                                 background:var(--bg3); padding:0.25rem 0.5rem; border-radius:4px; }
                .vf-ro-actions { display:flex; gap:0.35rem; flex-wrap:wrap; justify-content:center; }
                .hidden { display:none !important; }
            </style>`;
    }

    _onCredentials(resolved) {
        const iframe = this.querySelector('#vf-iframe');
        const ph     = this.querySelector('#vf-placeholder');
        const bar    = this.querySelector('#vf-bar-actions');

        if (this._mode === 'owner') {
            if (resolved.mode !== 'full' || !resolved.vaultKey) {
                this._showPlaceholder('Owner View requires a full vault key.');
                return;
            }
            const src = `/en-gb/vault/#${resolved.vaultKey}`;
            iframe.src = src;
            iframe.classList.remove('hidden');
            iframe.classList.add('has-src');
            if (ph) ph.classList.add('hidden');
            if (bar) bar.innerHTML = `
                <button class="pk-btn" id="vf-reload">Reload</button>
                <button class="pk-btn" id="vf-popout">Pop-out</button>`;
            this.querySelector('#vf-reload')?.addEventListener('click', () => { iframe.src = src; });
            this.querySelector('#vf-popout')?.addEventListener('click', () => window.open(src, '_blank'));
        } else {
            // RO mode — Phase 1 limitation: show placeholder
            this._showROPlaceholder(resolved.vaultId, null);
        }
    }

    _loadROToken(detail) {
        // Called when "Load in RO frame" is clicked in Token Manager
        const { token, vaultId } = detail || {};
        const roUrl = `${location.origin}/en-gb/vault/#ro-${token}`;
        this._showROPlaceholder(vaultId, token, roUrl);
        // Switch the sg-layout tab so the user can see the result
        _activateSGLayoutTab('RO View');
    }

    _showROPlaceholder(vaultId, token, roUrl) {
        const iframe = this.querySelector('#vf-iframe');
        const ph     = this.querySelector('#vf-placeholder');
        if (iframe) { iframe.classList.add('hidden'); iframe.classList.remove('has-src'); iframe.src = ''; }

        const vaultIdLabel = vaultId ? maskId(vaultId) : '(unknown)';
        const copyUrl = roUrl || (token ? `${location.origin}/en-gb/vault/#ro-${token}` : null);

        this.querySelector('#vf-placeholder')?.remove();

        // Create RO placeholder directly inside vf-wrap
        const wrap = this.querySelector('.vf-wrap');
        let roPh = this.querySelector('.vf-ro-placeholder');
        if (!roPh) {
            roPh = document.createElement('div');
            roPh.className = 'vf-ro-placeholder';
            wrap.appendChild(roPh);
        }

        roPh.innerHTML = `
            <div class="vf-ro-title">👁 RO frame: token resolved</div>
            <div class="vf-ro-note">Awaiting Phase 2 vault integration.<br>
                The RO frame will load the vault in read-only mode once <code>#ro-</code> hash support
                is added to the vault shell.</div>
            ${vaultId ? `<div class="vf-ro-id">vault_id: ${esc(vaultIdLabel)}</div>` : ''}
            ${token   ? `<div class="vf-ro-id">token: ro-${esc(token.slice(0,6))}···</div>` : ''}
            <div class="vf-ro-actions">
                ${copyUrl ? `<button class="pk-btn pk-btn--primary" id="vf-ro-copy">Copy RO link</button>` : ''}
                ${copyUrl ? `<button class="pk-btn" id="vf-ro-popout">Pop-out</button>` : ''}
            </div>`;

        if (copyUrl) {
            roPh.querySelector('#vf-ro-copy')?.addEventListener('click', () => {
                navigator.clipboard && navigator.clipboard.writeText(copyUrl).catch(() => {});
                const btn = roPh.querySelector('#vf-ro-copy');
                if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy RO link'; }, 1500); }
            });
            roPh.querySelector('#vf-ro-popout')?.addEventListener('click', () => window.open(copyUrl, '_blank'));
        }

        // Bar
        const bar = this.querySelector('#vf-bar-actions');
        if (bar) bar.innerHTML = '';
    }

    _showPlaceholder(msg) {
        const iframe = this.querySelector('#vf-iframe');
        const ph     = this.querySelector('#vf-placeholder');
        if (iframe) { iframe.classList.add('hidden'); iframe.classList.remove('has-src'); iframe.src = ''; }
        if (ph) {
            ph.classList.remove('hidden');
            ph.querySelector('.vf-ph-msg').textContent = msg || 'No vault loaded.';
        }
    }

    _onClear() {
        this._showPlaceholder('No vault loaded.');
        const roPh = this.querySelector('.vf-ro-placeholder');
        if (roPh) roPh.remove();
        const bar = this.querySelector('#vf-bar-actions');
        if (bar) bar.innerHTML = '';
    }
}

customElements.define('vt-vault-frame', VtVaultFrame);

/* ══════════════════════════════════════════════════════════════════════════ */
/*  <vt-crypto-lab>                                                            */
/* ══════════════════════════════════════════════════════════════════════════ */
class VtCryptoLab extends HTMLElement {
    constructor() {
        super();
        this._credentials = null;
    }

    connectedCallback() {
        document.addEventListener('vt:credentials-loaded',  e => { this._credentials = e.detail; });
        document.addEventListener('vt:credentials-cleared', () => { this._credentials = null; });
        this._render();
    }

    _render() {
        this.innerHTML = `
            <div class="cl-wrap">
                <div class="cl-section">
                    <div class="cl-section-title">HKDF Derivation</div>
                    <div class="cl-row">
                        <label class="cl-label">Vault key (from loaded credentials or paste)</label>
                        <input class="cl-input" id="cl-hkdf-key" placeholder="word-word-NNNN">
                    </div>
                    <div class="cl-row">
                        <button class="pk-btn pk-btn--primary" id="cl-derive-btn">Derive vault_secret_key</button>
                    </div>
                    <div class="cl-result" id="cl-hkdf-result"></div>
                </div>
                <div class="cl-divider"></div>
                <div class="cl-section">
                    <div class="cl-section-title">Owner-namespace file inspector</div>
                    <div class="cl-row">
                        <label class="cl-label">File path</label>
                        <input class="cl-input" id="cl-file-path" value=".vault/owner/readonly-tokens.json">
                    </div>
                    <div class="cl-row cl-row--inline">
                        <button class="pk-btn pk-btn--primary" id="cl-fetch-owner-btn">Fetch as owner</button>
                        <button class="pk-btn" id="cl-fetch-ro-btn">Fetch as RO reader</button>
                    </div>
                    <div class="cl-result" id="cl-file-result"></div>
                </div>
                <div class="cl-divider"></div>
                <div class="cl-section">
                    <div class="cl-section-title">Transfer API tester</div>
                    <div class="cl-row">
                        <label class="cl-label">Token (ro-word-word-NNNN or word-word-NNNN)</label>
                        <input class="cl-input" id="cl-check-token" placeholder="coral-stamp-1234">
                    </div>
                    <div class="cl-row">
                        <button class="pk-btn pk-btn--primary" id="cl-check-btn">Check token</button>
                    </div>
                    <div class="cl-result" id="cl-check-result"></div>
                </div>
            </div>
            <style>
                .cl-wrap  { display:flex; flex-direction:column; height:100%; overflow-y:auto; padding:0.75rem; gap:0.6rem; }
                .cl-section { display:flex; flex-direction:column; gap:0.45rem; }
                .cl-section-title { font-size:0.65rem; font-weight:700; text-transform:uppercase;
                                    letter-spacing:0.08em; color:var(--muted); }
                .cl-row   { display:flex; flex-direction:column; gap:0.2rem; }
                .cl-row--inline { flex-direction:row; gap:0.4rem; flex-wrap:wrap; }
                .cl-label { font-size:0.68rem; color:var(--muted); }
                .cl-input { background:var(--bg3); border:1px solid var(--border); border-radius:5px;
                            color:var(--text); font-family:monospace; font-size:0.78rem;
                            padding:0.3rem 0.55rem; outline:none; }
                .cl-input:focus { border-color:rgba(78,205,196,0.4); }
                .cl-result { font-size:0.75rem; font-family:monospace; white-space:pre-wrap;
                             word-break:break-all; color:var(--text); min-height:1em; }
                .cl-result--ok   { color:var(--teal); }
                .cl-result--err  { color:var(--err); }
                .cl-result--warn { color:var(--warn); }
                .cl-divider { height:1px; background:var(--border); }
                .cl-param { display:flex; gap:0.5rem; font-size:0.7rem; }
                .cl-param-key  { color:var(--muted); min-width:60px; }
                .cl-param-val  { color:var(--text); font-family:monospace; }
            </style>`;

        this.querySelector('#cl-derive-btn').addEventListener('click', () => this._deriveKey());
        this.querySelector('#cl-fetch-owner-btn').addEventListener('click', () => this._fetchFile('owner'));
        this.querySelector('#cl-fetch-ro-btn').addEventListener('click',    () => this._fetchFile('ro'));
        this.querySelector('#cl-check-btn').addEventListener('click',       () => this._checkToken());

        // Pre-fill from loaded credentials
        document.addEventListener('vt:credentials-loaded', e => {
            const inp = this.querySelector('#cl-hkdf-key');
            if (inp && e.detail.vaultKey) inp.value = e.detail.vaultKey;
        });
    }

    async _deriveKey() {
        const keyInput = (this.querySelector('#cl-hkdf-key')?.value || '').trim()
            || this._credentials?.vaultKey || '';
        const result   = this.querySelector('#cl-hkdf-result');

        if (!keyInput) {
            this._setResult(result, 'Enter a vault key above.', 'err');
            return;
        }

        try {
            // Derive vault_id first
            const passphrase = keyInput.includes(':') ? keyInput.split(':')[0] : keyInput;
            const vaultIdBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(passphrase));
            const vaultId    = Array.from(new Uint8Array(vaultIdBuf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 12);

            // Derive secret key
            const cryptoKey  = await deriveVaultSecretKey(keyInput, vaultId);
            const keyBytes   = await exportKeyBytes(cryptoKey);
            const first8hex  = Array.from(keyBytes.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('');

            result.className = 'cl-result cl-result--ok';
            result.innerHTML = [
                `vault_id (SHA-256[:12]):  ${esc(vaultId)}`,
                ``,
                `HKDF parameters:`,
                `  input  = ${esc(passphrase.slice(0, 12))}... (vault key)`,
                `  salt   = ${esc(vaultId)} (vault_id, UTF-8)`,
                `  info   = "sgraph-vault-secret-v1"`,
                `  length = 32`,
                ``,
                `vault_secret_key (first 8 hex): ${esc(first8hex)}……`,
                `256-bit key derived ✓`
            ].join('\n');
        } catch (err) {
            this._setResult(result, `Error: ${err.message}`, 'err');
        }
    }

    async _fetchFile(as) {
        const pathInput  = (this.querySelector('#cl-file-path')?.value || '').trim();
        const fileResult = this.querySelector('#cl-file-result');

        if (!this._credentials || this._credentials.mode !== 'full') {
            this._setResult(fileResult, 'Load an owner vault first.', 'err');
            return;
        }
        if (!pathInput) {
            this._setResult(fileResult, 'Enter a file path.', 'err');
            return;
        }

        this._setResult(fileResult, 'Fetching…', '');

        try {
            const endpoint  = sessionStorage.getItem('sg-vault-endpoint') || 'https://dev.send.sgraph.ai';
            const accessKey = sessionStorage.getItem('sg-vault-access-key')
                || localStorage.getItem('sg-vault-access-key-saved') || '';
            const sgSend = new SGSend({ endpoint, token: accessKey });
            const vault  = await SGVault.open(sgSend, this._credentials.vaultKey);

            // Parse path into folder + filename
            const parts    = pathInput.replace(/^\//, '').split('/');
            const fileName = parts.pop();
            const folder   = '/' + parts.join('/');

            const folderContents = vault.listFolder(folder);
            if (!folderContents || !folderContents.some(e => e.name === fileName)) {
                this._setResult(fileResult, `File not found: ${pathInput}`, 'warn');
                return;
            }

            const rawBytes = await vault.getFile(folder, fileName);
            const innerBytes = rawBytes instanceof ArrayBuffer ? new Uint8Array(rawBytes) : rawBytes;

            const isOwnerPath = pathInput.startsWith('/.vault/owner/') || pathInput === '/.vault/owner';
            if (as === 'owner' && isOwnerPath) {
                // Inner-decrypt
                const base64 = btoa(String.fromCharCode(...innerBytes));
                const decrypted = await ownerDecrypt(this._credentials.vaultKey, vault.vaultId, base64);
                const text = new TextDecoder().decode(decrypted);
                try {
                    const json = JSON.parse(text);
                    fileResult.className = 'cl-result cl-result--ok';
                    fileResult.textContent = JSON.stringify(json, null, 2);
                } catch (_) {
                    fileResult.className = 'cl-result cl-result--ok';
                    fileResult.textContent = text;
                }
            } else if (as === 'ro' && isOwnerPath) {
                // RO simulation: show that inner bytes cannot be decrypted
                fileResult.className = 'cl-result cl-result--warn';
                fileResult.textContent = JSON.stringify({
                    encrypted: true,
                    lockedToOwner: true,
                    byteLength: innerBytes.byteLength
                }, null, 2);
            } else {
                // Normal file — show as text
                fileResult.className = 'cl-result cl-result--ok';
                fileResult.textContent = new TextDecoder().decode(innerBytes);
            }
        } catch (err) {
            this._setResult(fileResult, `Error: ${err.message}`, 'err');
        }
    }

    async _checkToken() {
        const raw     = (this.querySelector('#cl-check-token')?.value || '').trim();
        const result  = this.querySelector('#cl-check-result');
        const token   = raw.replace(/^ro-/, '');

        if (!token) {
            this._setResult(result, 'Enter a token.', 'err');
            return;
        }

        this._setResult(result, 'Checking…', '');

        try {
            const endpoint  = sessionStorage.getItem('sg-vault-endpoint') || 'https://dev.send.sgraph.ai';
            const accessKey = sessionStorage.getItem('sg-vault-access-key')
                || localStorage.getItem('sg-vault-access-key-saved') || '';
            const headers = {};
            if (accessKey) headers['x-sgraph-access-token'] = accessKey;

            const resp = await fetch(
                `${endpoint}/api/transfers/check-token/${encodeURIComponent(token)}`,
                { headers }
            );

            if (resp.ok) {
                const data = await resp.json();
                result.className  = 'cl-result cl-result--ok';
                result.textContent = `✓ Token valid\n${JSON.stringify(data, null, 2)}`;
            } else {
                result.className  = 'cl-result cl-result--err';
                result.textContent = `✗ HTTP ${resp.status} (token not found or expired)`;
            }
        } catch (err) {
            this._setResult(result, `Error: ${err.message}`, 'err');
        }
    }

    _setResult(el, msg, type) {
        if (!el) return;
        el.textContent = msg;
        el.className   = `cl-result${type ? ' cl-result--' + type : ''}`;
    }
}

customElements.define('vt-crypto-lab', VtCryptoLab);

/* ══════════════════════════════════════════════════════════════════════════ */
/*  <vt-storage-inspector>                                                     */
/* ══════════════════════════════════════════════════════════════════════════ */
const VT_SS_KEY = 'vt-vault-credentials';
const VAULT_LS_KEYS = [
    'sg-vault-key', 'sg-vault-recent', 'sg-vault-access-key-saved', 'sg-vault-history',
    'sg-vault-picker:credentials', 'sg-vault-recent:migrated-at'
];
const VAULT_SS_KEYS = [
    'sg-vault-access-key', 'sg-vault-endpoint', 'sg-vault-creating', 'sg-vault-session',
    VT_SS_KEY
];

class VtStorageInspector extends HTMLElement {
    connectedCallback() {
        this._render();
    }

    _render() {
        this.innerHTML = `
            <div class="si-wrap">
                <div class="si-section">
                    <div class="si-section-title">Backend access token</div>
                    <div class="si-access-form" id="si-access-form">
                        <input class="si-input" id="si-access-key" type="password"
                            placeholder="Paste access token here"
                            value="${esc(sessionStorage.getItem('sg-vault-access-key') || localStorage.getItem('sg-vault-access-key-saved') || '')}">
                        <div class="si-btn-row">
                            <button class="pk-btn pk-btn--primary" id="si-save-ss">Save to sessionStorage</button>
                            <button class="pk-btn" id="si-save-ls">Save to localStorage</button>
                            <button class="pk-btn pk-btn--danger" id="si-clear-access">Clear</button>
                        </div>
                    </div>
                </div>
                <div class="si-divider"></div>
                <div class="si-section">
                    <div class="si-section-title">sessionStorage</div>
                    <div id="si-ss-list"></div>
                </div>
                <div class="si-divider"></div>
                <div class="si-section">
                    <div class="si-section-title">localStorage (vault keys)</div>
                    <div id="si-ls-list"></div>
                </div>
            </div>
            <style>
                .si-wrap  { display:flex; flex-direction:column; height:100%; overflow-y:auto; padding:0.75rem; gap:0.6rem; font-size:0.78rem; }
                .si-section { display:flex; flex-direction:column; gap:0.4rem; }
                .si-section-title { font-size:0.65rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--muted); }
                .si-access-form { display:flex; flex-direction:column; gap:0.4rem; }
                .si-input { background:var(--bg3); border:1px solid var(--border); border-radius:5px;
                            color:var(--text); font-family:monospace; font-size:0.78rem;
                            padding:0.3rem 0.55rem; outline:none; }
                .si-input:focus { border-color:rgba(78,205,196,0.4); }
                .si-btn-row { display:flex; gap:0.35rem; flex-wrap:wrap; }
                .si-divider { height:1px; background:var(--border); }
                .si-row { display:grid; grid-template-columns:180px 1fr auto; gap:0.4rem; align-items:baseline;
                          padding:0.3rem 0; border-bottom:1px solid var(--border); font-size:0.73rem; }
                .si-row:last-child { border-bottom:none; }
                .si-key { color:var(--muted); font-family:monospace; font-size:0.7rem; word-break:break-all; }
                .si-val { color:var(--text); font-family:monospace; font-size:0.7rem; word-break:break-all; }
                .si-val--muted   { color:var(--muted); font-style:italic; }
                .si-val--teal    { color:var(--teal); }
                .si-val--masked  { color:var(--muted); }
                .si-empty { color:var(--muted); font-style:italic; font-size:0.75rem; }
            </style>`;

        this.querySelector('#si-save-ss').addEventListener('click', () => {
            const val = this.querySelector('#si-access-key').value;
            sessionStorage.setItem('sg-vault-access-key', val);
            this._renderStorageLists();
        });
        this.querySelector('#si-save-ls').addEventListener('click', () => {
            const val = this.querySelector('#si-access-key').value;
            localStorage.setItem('sg-vault-access-key-saved', val);
            this._renderStorageLists();
        });
        this.querySelector('#si-clear-access').addEventListener('click', () => {
            sessionStorage.removeItem('sg-vault-access-key');
            localStorage.removeItem('sg-vault-access-key-saved');
            this.querySelector('#si-access-key').value = '';
            this._renderStorageLists();
        });

        this._renderStorageLists();
    }

    _renderStorageLists() {
        this._renderSS();
        this._renderLS();
    }

    _renderSS() {
        const list = this.querySelector('#si-ss-list');
        if (!list) return;
        const rows = VAULT_SS_KEYS.map(k => {
            const val = sessionStorage.getItem(k);
            const isSecret = k.includes('access-key') || k.includes('session');
            const valHtml  = val === null
                ? `<span class="si-val si-val--muted">(not set)</span>`
                : isSecret
                    ? `<span class="si-val si-val--masked">●●●●●●●● (${val.length} chars)</span>`
                    : k === VT_SS_KEY
                        ? `<span class="si-val si-val--teal">${esc(this._truncate(val, 60))}</span>`
                        : `<span class="si-val">${esc(this._truncate(val, 80))}</span>`;
            const actions = val !== null
                ? `<button class="pk-btn pk-btn--danger" style="font-size:0.62rem"
                       onclick="sessionStorage.removeItem(${JSON.stringify(k)});this.closest('vt-storage-inspector')._renderStorageLists()">Clear</button>`
                : '';
            return `<div class="si-row"><span class="si-key">${esc(k)}</span>${valHtml}<span>${actions}</span></div>`;
        }).join('');
        list.innerHTML = rows || '<div class="si-empty">empty</div>';
    }

    _renderLS() {
        const list = this.querySelector('#si-ls-list');
        if (!list) return;
        const rows = VAULT_LS_KEYS.map(k => {
            const val     = localStorage.getItem(k);
            const isSecret = k.includes('access-key') || k.includes('key') && !k.includes('recent');
            const valHtml = val === null
                ? `<span class="si-val si-val--muted">(not set)</span>`
                : isSecret
                    ? `<span class="si-val si-val--masked">●●●●●●●● (${val.length} chars)</span>`
                    : `<span class="si-val">${esc(this._truncate(val, 80))}</span>`;
            return `<div class="si-row"><span class="si-key">${esc(k)}</span>${valHtml}<span></span></div>`;
        }).join('');
        list.innerHTML = rows || '<div class="si-empty">empty</div>';
    }

    _truncate(s, n) {
        return s.length > n ? s.slice(0, n) + '…' : s;
    }
}

customElements.define('vt-storage-inspector', VtStorageInspector);
