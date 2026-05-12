/**
 * vault-token-manager.js
 *
 * <vt-token-manager> — Create, list, and revoke read-only tokens.
 * Requires owner credentials (full vault key) to be loaded.
 *
 * Dependencies (loaded as globals via <script> tags in index.html):
 *   SGSend, SGVault  — from _common/js/lib/
 *
 * ES-module dependencies imported at the top of vault-token-harness.js
 * and re-exported on window.VT for access here.
 */

import { ownerEncrypt, ownerDecrypt, deriveVaultSecretKey, exportKeyBytes } from './vault-hkdf.js';

/* ── Friendly token generation ────────────────────────────────────────────── */
const ADJECTIVES = [
    'amber','azure','bold','bright','calm','coral','crisp','dark','deep','deft',
    'early','east','fair','fast','firm','fresh','full','glad','gold','good',
    'grand','green','grey','hard','high','jade','keen','kind','lake','last',
    'lean','left','light','lime','live','long','loud','lush','main','mild',
    'mint','next','nice','north','oak','open','pale','pink','plain','plum',
    'pure','quick','quiet','rare','real','rich','rose','rough','round','ruby',
    'salt','sand','sharp','silver','slim','slow','smart','soft','south','still',
    'stone','strong','sure','sweet','swift','tall','teal','thin','top','true',
    'vast','warm','west','wide','wild','wise','young'
];
const NOUNS = [
    'arch','base','bay','beam','bell','bloom','bolt','book','branch','bridge',
    'brook','bud','cape','cave','cliff','cloud','coast','creek','crest','crown',
    'dune','dust','edge','fall','fern','field','fish','flame','flash','floor',
    'flow','foam','ford','forge','gale','gate','glade','glen','glow','grain',
    'grove','gulf','hall','hawk','hill','hive','horn','isle','keep','knoll',
    'lake','land','lane','leaf','ledge','light','loch','loop','marsh','mead',
    'mesa','mill','mist','moon','moor','moss','mount','nest','nook','peal',
    'peak','pine','plain','pool','port','pulse','rain','reef','ridge','rill',
    'ring','rise','river','road','rock','root','rush','sand','shade','shelf',
    'shore','sky','slope','spark','spring','star','stem','step','stone','storm',
    'stream','sun','surge','swale','tide','tree','vale','veil','vent','view',
    'wake','wave','well','wind','wood','yard'
];

function generateFriendlyToken() {
    const adj  = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num  = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `${adj}-${noun}-${num}`;
}

/* ── Expiry helpers ───────────────────────────────────────────────────────── */
function expiryFromDays(days) {
    if (!days) return null;
    const d = new Date();
    d.setDate(d.getDate() + Number(days));
    return d.toISOString();
}

function expiryLabel(isoStr) {
    if (!isoStr) return 'no expiry';
    const diff = new Date(isoStr) - Date.now();
    if (diff < 0) return 'expired';
    const d = Math.ceil(diff / 86400000);
    return `expires in ${d}d`;
}

/* ── SGVault helpers ──────────────────────────────────────────────────────── */
async function openVaultFromCredentials(credentials) {
    const endpoint = sessionStorage.getItem('sg-vault-endpoint') || 'https://dev.send.sgraph.ai';
    const accessKey = sessionStorage.getItem('sg-vault-access-key')
        || localStorage.getItem('sg-vault-access-key-saved')
        || '';
    const sgSend = new SGSend({ endpoint, token: accessKey });
    return SGVault.open(sgSend, credentials.vaultKey);
}

async function loadTokenList(vault) {
    const ownerFolder = vault.listFolder('/.vault/owner');
    if (!ownerFolder || !ownerFolder.some(e => e.name === 'readonly-tokens.json')) {
        return [];
    }
    const plaintext = await vault.getFile('/.vault/owner', 'readonly-tokens.json');
    const decoder = new TextDecoder();
    // plaintext is outer-decrypted bytes; inner layer is our HKDF encryption
    const innerBytes = plaintext instanceof ArrayBuffer ? new Uint8Array(plaintext)
        : (plaintext instanceof Uint8Array ? plaintext : plaintext);
    const base64 = btoa(String.fromCharCode(...innerBytes));
    const decrypted = await ownerDecrypt(vault._passphrase, vault.vaultId, base64);
    return JSON.parse(decoder.decode(decrypted));
}

async function saveTokenList(vault, tokens) {
    const plainBytes  = new TextEncoder().encode(JSON.stringify(tokens, null, 2));
    const innerCipher = await ownerEncrypt(vault._passphrase, vault.vaultId, plainBytes);
    const innerBytes  = Uint8Array.from(atob(innerCipher), c => c.charCodeAt(0));

    if (!vault.listFolder('/.vault'))       await vault.createFolder('/.vault');
    if (!vault.listFolder('/.vault/owner')) await vault.createFolder('/.vault/owner');

    const existing = vault.listFolder('/.vault/owner')?.find(e => e.name === 'readonly-tokens.json');
    if (existing) {
        await vault.updateFile('/.vault/owner', 'readonly-tokens.json', innerBytes);
    } else {
        await vault.addFile('/.vault/owner', 'readonly-tokens.json', innerBytes);
    }
    await vault.push();
}

/* ── Token creation via transfer API ──────────────────────────────────────── */
async function createTransferToken(vault, roToken, expiresAt, maxUses) {
    const endpoint  = sessionStorage.getItem('sg-vault-endpoint') || 'https://dev.send.sgraph.ai';
    const accessKey = sessionStorage.getItem('sg-vault-access-key')
        || localStorage.getItem('sg-vault-access-key-saved')
        || '';
    // Correct header name: x-sgraph-access-token (not X-SGraph-Send-Access-Token)
    const headers = { 'Content-Type': 'application/json' };
    if (accessKey) headers['x-sgraph-access-token'] = accessKey;

    // Generate a random delete_auth secret; server stores SHA-256(secret).
    // We keep the plaintext secret as delete_key for use in revocation.
    const deleteAuthBytes = crypto.getRandomValues(new Uint8Array(32));
    const deleteAuth      = Array.from(deleteAuthBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const deleteAuthHashBuf = await crypto.subtle.digest('SHA-256', deleteAuthBytes);
    const deleteAuthHash  = Array.from(new Uint8Array(deleteAuthHashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

    // 1. Create transfer slot — schema requires: file_size_bytes, delete_auth_hash,
    //    expires_at (ms epoch int), max_downloads (not max_uses)
    const createBody = {
        file_size_bytes:   0,
        delete_auth_hash:  deleteAuthHash,
        max_downloads:     maxUses ? Number(maxUses) : 0,
        auto_delete:       false,
        expires_at:        expiresAt ? new Date(expiresAt).getTime() : 0
    };
    const createResp = await fetch(`${endpoint}/api/transfers/create`, {
        method: 'POST', headers, body: JSON.stringify(createBody)
    });
    if (!createResp.ok) {
        const errText = await createResp.text().catch(() => '');
        throw new Error(`Create failed: HTTP ${createResp.status}${errText ? ' — ' + errText : ''}`);
    }
    const createData = await createResp.json();
    const transferId = createData.transfer_id;
    const uploadUrl  = createData.upload_url;  // server-provided upload path

    // 2. Encrypt payload { vault_id, read_key } with roToken as passphrase
    const payload      = JSON.stringify({ vault_id: vault.vaultId, read_key: vault.readKey || '' });
    const payloadBytes = new TextEncoder().encode(payload);
    const encPayload   = await _encryptWithPassphrase(roToken, payloadBytes);

    // 3. Upload ciphertext — use upload_url from response
    const uploadHeaders = { 'Content-Type': 'application/octet-stream' };
    if (accessKey) uploadHeaders['x-sgraph-access-token'] = accessKey;
    const uploadPath = uploadUrl || `/api/transfers/upload/${encodeURIComponent(transferId)}`;
    const uploadResp = await fetch(`${endpoint}${uploadPath}`, {
        method: 'POST', headers: uploadHeaders,
        body: Uint8Array.from(atob(encPayload), c => c.charCodeAt(0))
    });
    if (!uploadResp.ok) throw new Error(`Upload failed: HTTP ${uploadResp.status}`);

    // 4. Mark complete
    const completeResp = await fetch(`${endpoint}/api/transfers/complete/${encodeURIComponent(transferId)}`, {
        method: 'POST', headers
    });
    if (!completeResp.ok) throw new Error(`Complete failed: HTTP ${completeResp.status}`);

    // deleteAuth (preimage) is the delete_key — never sent to server, stored locally only
    return { transferId, deleteKey: deleteAuth };
}

async function revokeTransferToken(transferId, deleteKey) {
    const endpoint = sessionStorage.getItem('sg-vault-endpoint') || 'https://dev.send.sgraph.ai';
    const resp = await fetch(`${endpoint}/api/transfers/delete/${encodeURIComponent(transferId)}`, {
        method: 'DELETE',
        headers: { 'x-sgraph-transfer-delete-auth': deleteKey }
    });
    return resp.ok;
}

async function _encryptWithPassphrase(passphrase, data) {
    const rawKey = new TextEncoder().encode(passphrase);
    const importedKey = await crypto.subtle.importKey('raw', rawKey, { name: 'PBKDF2' }, false, ['deriveKey']);
    const salt = new TextEncoder().encode('sgraph-ro-token-v1');
    const aesKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
        importedKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipherBytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data);
    const combined = new Uint8Array(12 + cipherBytes.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBytes), 12);
    return btoa(String.fromCharCode(...combined));
}

/* ── <vt-token-manager> custom element ────────────────────────────────────── */
class VtTokenManager extends HTMLElement {
    constructor() {
        super();
        this._credentials = null;
        this._vault       = null;
        this._tokens      = [];
        this._loading     = false;
    }

    connectedCallback() {
        document.addEventListener('vt:credentials-loaded', e => this._onCredentials(e.detail));
        document.addEventListener('vt:credentials-cleared', () => this._onClear());
        document.addEventListener('vt:load-ro-token-in-frame', e => this._onLoadInFrame(e.detail));
        this._render();
    }

    async _onCredentials(credentials) {
        this._credentials = credentials;
        if (credentials.mode !== 'full') {
            this._credentials = null;
            this._render();
            return;
        }
        this._render();
        await this._loadVaultAndTokens();
    }

    _onClear() {
        this._credentials = null;
        this._vault       = null;
        this._tokens      = [];
        this._render();
    }

    _onLoadInFrame(detail) {
        // Fired by "Load in RO frame" button — handled by vt-vault-frame listener
        // This component just emits the event, nothing to do here
    }

    async _loadVaultAndTokens() {
        this._setStatus('Loading vault…', 'muted');
        try {
            this._vault  = await openVaultFromCredentials(this._credentials);
            this._tokens = await loadTokenList(this._vault);
        } catch (err) {
            this._tokens = [];
            this._setStatus(`Vault load error: ${err.message}`, 'err');
        }
        this._renderTokenList();
        this._setStatus('', '');
    }

    _render() {
        if (!this._credentials || this._credentials.mode !== 'full') {
            this.innerHTML = `
                <div class="tm-placeholder">
                    <div class="tm-placeholder__icon">🎟</div>
                    <div class="tm-placeholder__msg">Load a vault with a write key first</div>
                    <div class="tm-placeholder__sub">The Token Manager requires owner credentials.</div>
                </div>
                <style>
                    .tm-placeholder { display:flex; flex-direction:column; align-items:center;
                        justify-content:center; height:100%; gap:0.5rem; padding:2rem; text-align:center; }
                    .tm-placeholder__icon { font-size:2rem; }
                    .tm-placeholder__msg  { color:var(--text); font-size:0.88rem; }
                    .tm-placeholder__sub  { color:var(--muted); font-size:0.78rem; }
                </style>`;
            return;
        }

        const accessKey = sessionStorage.getItem('sg-vault-access-key')
            || localStorage.getItem('sg-vault-access-key-saved');
        const noKeyWarning = !accessKey
            ? `<div class="tm-warn">⚠ Backend access token not set — token creation will fail.
               Set it in the Storage panel.</div>` : '';

        this.innerHTML = `
            <div class="tm-wrap">
                ${noKeyWarning}
                <div class="tm-status" id="tm-status"></div>

                <div class="tm-section">
                    <div class="tm-section__title">Create read-only token</div>
                    <div class="tm-create-form">
                        <div class="tm-form-row">
                            <label class="tm-label">Label</label>
                            <input class="tm-input" id="tm-label" placeholder="e.g. My dev token" value="">
                        </div>
                        <div class="tm-form-row tm-form-row--inline">
                            <label class="tm-label">Expires</label>
                            <select class="tm-select" id="tm-expires">
                                <option value="">never</option>
                                <option value="1">1 day</option>
                                <option value="7" selected>7 days</option>
                                <option value="30">30 days</option>
                                <option value="90">90 days</option>
                            </select>
                            <label class="tm-label" style="margin-left:0.75rem">Use limit</label>
                            <select class="tm-select" id="tm-max-uses">
                                <option value="">unlimited</option>
                                <option value="1">1 use</option>
                                <option value="10">10 uses</option>
                                <option value="100">100 uses</option>
                            </select>
                        </div>
                        <button class="pk-btn pk-btn--primary" id="tm-create-btn">+ Create read-only token</button>
                    </div>
                </div>

                <div class="tm-section">
                    <div class="tm-section__title">Tokens <span class="tm-count" id="tm-count"></span></div>
                    <div id="tm-list" class="tm-list"></div>
                </div>
            </div>
            <style>
                .tm-wrap { display:flex; flex-direction:column; height:100%; overflow-y:auto;
                           padding:0.75rem; gap:0.75rem; font-size:0.82rem; }
                .tm-warn { background:var(--warn-dim); border:1px solid rgba(224,172,78,0.35);
                           border-radius:6px; padding:0.5rem 0.75rem; color:var(--warn); font-size:0.78rem; }
                .tm-status { font-size:0.75rem; min-height:1.2em; }
                .tm-status--muted { color:var(--muted); font-style:italic; }
                .tm-status--err   { color:var(--err); }
                .tm-section { display:flex; flex-direction:column; gap:0.4rem; }
                .tm-section__title { font-size:0.65rem; font-weight:700; text-transform:uppercase;
                                     letter-spacing:0.08em; color:var(--muted); }
                .tm-create-form { background:var(--bg2); border:1px solid var(--border);
                                  border-radius:8px; padding:0.75rem; display:flex; flex-direction:column; gap:0.5rem; }
                .tm-form-row    { display:flex; flex-direction:column; gap:0.2rem; }
                .tm-form-row--inline { flex-direction:row; align-items:center; gap:0.4rem; flex-wrap:wrap; }
                .tm-label  { font-size:0.68rem; color:var(--muted); text-transform:uppercase; letter-spacing:0.06em; }
                .tm-input, .tm-select { background:var(--bg3); border:1px solid var(--border); border-radius:5px;
                                        color:var(--text); font-size:0.78rem; padding:0.3rem 0.55rem; outline:none; }
                .tm-input:focus, .tm-select:focus { border-color:rgba(78,205,196,0.4); }
                .tm-input  { flex:1; }
                .tm-count  { font-size:0.68rem; color:var(--muted); font-weight:400; }
                .tm-list   { display:flex; flex-direction:column; gap:0.4rem; }
                .tm-empty  { color:var(--muted); font-style:italic; font-size:0.78rem; padding:0.4rem 0; }
                /* Token row */
                .tm-token-row { background:var(--bg2); border:1px solid var(--border); border-radius:7px;
                                padding:0.55rem 0.75rem; display:flex; flex-direction:column; gap:0.35rem; }
                .tm-token-row--revoked { opacity:0.55; }
                .tm-token-top { display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; }
                .tm-token-label { font-weight:600; color:var(--text); }
                .tm-badge { display:inline-block; font-size:0.6rem; font-weight:700; text-transform:uppercase;
                            letter-spacing:0.06em; padding:0.1rem 0.35rem; border-radius:3px; }
                .tm-badge--active   { background:rgba(78,205,196,0.12); color:var(--teal); border:1px solid rgba(78,205,196,0.3); }
                .tm-badge--revoked  { background:rgba(224,108,117,0.12); color:var(--err);  border:1px solid rgba(224,108,117,0.3); }
                .tm-badge--expired  { background:rgba(224,172,78,0.12);  color:var(--warn); border:1px solid rgba(224,172,78,0.3); }
                .tm-token-meta { font-size:0.7rem; color:var(--muted); display:flex; gap:0.75rem; flex-wrap:wrap; }
                .tm-token-actions { display:flex; gap:0.35rem; flex-wrap:wrap; margin-top:0.1rem; }
                .tm-share-link { font-family:monospace; font-size:0.72rem; color:var(--teal);
                                 word-break:break-all; padding:0.3rem 0.5rem; background:var(--bg3);
                                 border-radius:4px; border:1px solid var(--border); }
            </style>`;

        this.querySelector('#tm-create-btn').addEventListener('click', () => this._createToken());
        this._renderTokenList();
    }

    _renderTokenList() {
        const list  = this.querySelector('#tm-list');
        const count = this.querySelector('#tm-count');
        if (!list) return;

        if (count) count.textContent = `(${this._tokens.length})`;

        if (this._tokens.length === 0) {
            list.innerHTML = '<div class="tm-empty">No tokens yet. Create one above.</div>';
            return;
        }

        list.innerHTML = this._tokens.map((t, i) => {
            const status  = t.revoked ? 'revoked' : (t.expires_at && new Date(t.expires_at) < new Date() ? 'expired' : 'active');
            const badgeCls= `tm-badge--${status}`;
            const expLabel = t.revoked
                ? `revoked ${new Date(t.revoked_at).toLocaleString()}`
                : (t.expires_at ? expiryLabel(t.expires_at) : 'no expiry');
            const usesLabel = t.max_uses
                ? `${t.uses || 0} / ${t.max_uses} uses`
                : `${t.uses || 0} uses`;
            const origin = location.origin;
            const shareUrl = `${origin}/en-gb/vault/#ro-${t.token}`;
            const canRevoke = !t.revoked && status !== 'expired';

            return `<div class="tm-token-row ${t.revoked ? 'tm-token-row--revoked' : ''}" data-idx="${i}">
                <div class="tm-token-top">
                    <span class="tm-token-label">${_esc(t.label || t.token)}</span>
                    <span class="tm-badge ${badgeCls}">${status}</span>
                </div>
                <div class="tm-token-meta">
                    <span>ro-${_esc(t.token)}</span>
                    <span>${expLabel}</span>
                    <span>${usesLabel}</span>
                </div>
                <div class="tm-share-link" id="tm-link-${i}">${_esc(shareUrl)}</div>
                <div class="tm-token-actions">
                    <button class="pk-btn pk-btn--primary" data-copy="${i}">Copy link</button>
                    <button class="pk-btn" data-load="${i}" ${status !== 'active' ? 'disabled' : ''}>Load in RO frame</button>
                    ${canRevoke ? `<button class="pk-btn pk-btn--danger" data-revoke="${i}">Revoke</button>` : ''}
                </div>
            </div>`;
        }).join('');

        // Wire up buttons
        list.querySelectorAll('[data-copy]').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.copy);
                const url = `${location.origin}/en-gb/vault/#ro-${this._tokens[i].token}`;
                navigator.clipboard && navigator.clipboard.writeText(url).catch(() => {});
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = 'Copy link'; }, 1500);
            });
        });

        list.querySelectorAll('[data-load]').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.load);
                const t = this._tokens[i];
                document.dispatchEvent(new CustomEvent('vt:load-ro-in-frame', {
                    detail: { token: t.token, vaultId: this._vault?.vaultId }
                }));
            });
        });

        list.querySelectorAll('[data-revoke]').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.revoke);
                this._revokeToken(i);
            });
        });
    }

    async _createToken() {
        const btn     = this.querySelector('#tm-create-btn');
        const label   = (this.querySelector('#tm-label')?.value || '').trim() || 'Unnamed token';
        const expDays = this.querySelector('#tm-expires')?.value;
        const maxUses = this.querySelector('#tm-max-uses')?.value;

        if (!this._vault) {
            this._setStatus('Vault not loaded. Try loading credentials again.', 'err');
            return;
        }

        btn.disabled   = true;
        btn.textContent = 'Creating…';
        this._setStatus('Creating token…', 'muted');

        try {
            const roToken   = generateFriendlyToken();
            const expiresAt = expiryFromDays(expDays);
            const { transferId, deleteKey } = await createTransferToken(
                this._vault, roToken, expiresAt, maxUses ? Number(maxUses) : null
            );

            const entry = {
                token:      roToken,
                transfer_id: transferId,
                delete_key:  deleteKey,
                label,
                created_at:  new Date().toISOString(),
                expires_at:  expiresAt,
                max_uses:    maxUses ? Number(maxUses) : null,
                uses:        0,
                revoked:     false,
                revoked_at:  null
            };

            this._tokens.push(entry);
            await saveTokenList(this._vault, this._tokens);
            this._setStatus('Token created.', 'muted');
            this._renderTokenList();
        } catch (err) {
            this._setStatus(`Error: ${err.message}`, 'err');
        } finally {
            btn.disabled    = false;
            btn.textContent = '+ Create read-only token';
        }
    }

    async _revokeToken(idx) {
        const t = this._tokens[idx];
        if (!t || t.revoked) return;

        const btn = this.querySelector(`[data-revoke="${idx}"]`);
        if (btn) { btn.disabled = true; btn.textContent = 'Revoking…'; }

        let serverOk = false;
        try {
            serverOk = await revokeTransferToken(t.transfer_id, t.delete_key);
        } catch (_) {}

        t.revoked    = true;
        t.revoked_at = new Date().toISOString();

        try {
            await saveTokenList(this._vault, this._tokens);
        } catch (err) {
            this._setStatus(`Warning: local revoke ok but save failed: ${err.message}`, 'err');
        }

        if (!serverOk) {
            this._setStatus('Server-side delete failed — marked revoked locally.', 'err');
        } else {
            this._setStatus('Token revoked.', 'muted');
        }
        this._renderTokenList();
    }

    _setStatus(msg, type) {
        const el = this.querySelector('#tm-status');
        if (!el) return;
        el.textContent  = msg;
        el.className    = `tm-status ${type ? 'tm-status--' + type : ''}`;
    }
}

function _esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
    return d.innerHTML;
}

customElements.define('vt-token-manager', VtTokenManager);
