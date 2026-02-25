/* =============================================================================
   SGraph Send — Room View Web Component
   v0.1.8 — Data room with file upload, download, and room-level encryption

   Session from sessionStorage ('sg_room_session').
   Room key from sessionStorage ('sg_room_key') — AES-256-GCM hex string.

   Uses VaultAPI for vault storage, RoomCrypto for symmetric encryption,
   JoinAPI for session validation.

   Encryption: AES-256-GCM with shared room key (simpler than vault's RSA
   hybrid — all room members share the same symmetric key).

   Usage:
     <room-view></room-view>
   ============================================================================= */

(function() {
    'use strict';

    function shortGuid() {
        return crypto.getRandomValues(new Uint8Array(4))
            .reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
    }

    function formatSize(bytes) {
        if (bytes == null) return '';
        if (bytes < 1024)        return bytes + ' B';
        if (bytes < 1048576)     return (bytes / 1024).toFixed(1) + ' KB';
        if (bytes < 1073741824)  return (bytes / 1048576).toFixed(1) + ' MB';
        return (bytes / 1073741824).toFixed(1) + ' GB';
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = String(str);
        return d.innerHTML;
    }

    function escapeAttr(str) {
        return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // =========================================================================
    // Component
    // =========================================================================

    class RoomView extends HTMLElement {

        constructor() {
            super();
            this.attachShadow({ mode: 'open' });

            this._state       = 'loading';  // loading | need-key | no-access | ready | error
            this._session     = null;       // { session_token, room_id, room_name, vault_cache_key, permission, user_id, expires }
            this._roomKey     = null;       // CryptoKey (AES-256-GCM)
            this._roomKeyHex  = '';         // hex string of key (for display/sharing)
            this._index       = {};         // guid -> { name, type, size, kind }
            this._files       = [];         // [{ guid }]
            this._error       = null;
            this._statusMsg   = null;       // { type, text }
            this._statusTimer = null;
            this._downloading = null;       // guid being downloaded
            this._uploading   = false;
        }

        connectedCallback() {
            this.render();
            this._initSession();
        }

        // --- Status Messages ---------------------------------------------------

        _showStatus(type, text) {
            this._statusMsg = { type, text };
            if (this._statusTimer) clearTimeout(this._statusTimer);
            this._statusTimer = setTimeout(() => {
                this._statusMsg = null;
                this.render();
            }, 4000);
            this.render();
        }

        // --- Session Initialization ---------------------------------------------

        async _initSession() {
            const stored = sessionStorage.getItem('sg_room_session');
            if (!stored) {
                this._state = 'no-access';
                this.render();
                return;
            }

            try {
                this._session = JSON.parse(stored);
                const check = await JoinAPI.validateSession(this._session.session_token);
                if (!check.valid) {
                    this._state = 'no-access';
                    this.render();
                    return;
                }
            } catch (e) {
                this._state = 'no-access';
                this.render();
                return;
            }

            // Check for room key
            const keyHex = sessionStorage.getItem('sg_room_key');
            if (keyHex) {
                try {
                    this._roomKey    = await RoomCrypto.importKey(keyHex);
                    this._roomKeyHex = keyHex;
                    this._state      = 'ready';
                    this.render();
                    await this._loadFiles();
                    return;
                } catch (e) {
                    // Key invalid, fall through to need-key
                }
            }

            this._state = 'need-key';
            this.render();
        }

        // --- Key Management ------------------------------------------------------

        async _handleSetKey(e) {
            if (e) e.preventDefault();
            const input = this.shadowRoot.querySelector('#input-room-key');
            const mode  = this.shadowRoot.querySelector('input[name="key-mode"]:checked');
            const isNew = mode && mode.value === 'generate';

            let keyHex;
            if (isNew) {
                keyHex = RoomCrypto.generateRoomKey();
            } else {
                keyHex = (input ? input.value.trim() : '').toLowerCase().replace(/[^0-9a-f]/g, '');
                if (keyHex.length !== 64) {
                    this._error = 'Room key must be 64 hex characters (256 bits)';
                    this.render();
                    return;
                }
            }

            try {
                this._roomKey    = await RoomCrypto.importKey(keyHex);
                this._roomKeyHex = keyHex;
                sessionStorage.setItem('sg_room_key', keyHex);
                this._error = null;
                this._state = 'ready';
                this.render();
                await this._loadFiles();
            } catch (err) {
                this._error = 'Invalid key: ' + err.message;
                this.render();
            }
        }

        // --- Load Files ----------------------------------------------------------

        async _loadFiles() {
            if (!this._session) return;
            const vaultKey = this._session.vault_cache_key;
            if (!vaultKey) { this._files = []; this.render(); return; }

            try {
                // Load file list
                const result = await VaultAPI.listAll(vaultKey);
                if (result && result.files && typeof result.files === 'object') {
                    // files is { guid: data, ... } — convert to array
                    this._files = Object.keys(result.files).map(guid => ({ guid }));
                } else {
                    this._files = [];
                }

                // Load encrypted index (for file names)
                await this._loadIndex();
            } catch (e) {
                this._error = 'Failed to load files: ' + e.message;
            }

            this.render();
        }

        async _loadIndex() {
            if (!this._roomKey) return;
            const vaultKey = this._session.vault_cache_key;
            try {
                const resp = await VaultAPI.getIndex(vaultKey);
                if (resp && resp.data) {
                    const packed    = RoomCrypto.b64ToArrayBuf(resp.data);
                    const plaintext = await RoomCrypto.decrypt(this._roomKey, packed);
                    this._index     = JSON.parse(new TextDecoder().decode(plaintext));
                }
            } catch (_) {
                // Index may not exist yet or key doesn't match — just use empty
                this._index = {};
            }
        }

        async _saveIndex() {
            if (!this._roomKey) return;
            const vaultKey  = this._session.vault_cache_key;
            const json      = JSON.stringify(this._index);
            const data      = new TextEncoder().encode(json);
            const encrypted = await RoomCrypto.encrypt(this._roomKey, data);
            const b64       = RoomCrypto.arrayBufToB64(encrypted);
            await VaultAPI.storeIndex(vaultKey, b64);
        }

        // --- Upload --------------------------------------------------------------

        async _handleUpload(files) {
            if (!files || !files.length) return;
            if (!this._roomKey) {
                this._showStatus('error', 'Set a room key before uploading');
                return;
            }

            this._uploading = true;
            this.render();

            const vaultKey = this._session.vault_cache_key;

            for (const file of files) {
                this._showStatus('info', 'Encrypting "' + file.name + '"...');
                try {
                    const fileGuid  = shortGuid();
                    const data      = await file.arrayBuffer();
                    const encrypted = await RoomCrypto.encrypt(this._roomKey, new Uint8Array(data));
                    const b64       = RoomCrypto.arrayBufToB64(encrypted);

                    this._showStatus('info', 'Uploading "' + file.name + '"...');
                    const result = await VaultAPI.storeFile(vaultKey, fileGuid, b64);
                    if (!result) {
                        this._showStatus('error', 'Upload failed for "' + file.name + '"');
                        continue;
                    }

                    // Update index
                    this._index[fileGuid] = {
                        name: file.name,
                        type: file.type || 'application/octet-stream',
                        size: file.size,
                        kind: 'file'
                    };

                    this._files.push({ guid: fileGuid });
                    this._showStatus('success', '"' + file.name + '" encrypted and uploaded');
                } catch (e) {
                    this._showStatus('error', 'Failed to upload "' + file.name + '": ' + e.message);
                }
            }

            // Save index with new file metadata
            await this._saveIndex();
            this._uploading = false;
            this.render();
        }

        // --- Download ------------------------------------------------------------

        async _handleDownload(fileGuid) {
            if (!this._session || this._downloading) return;
            const vaultKey = this._session.vault_cache_key;
            const meta     = this._index[fileGuid] || {};

            this._downloading = fileGuid;
            this.render();

            try {
                const resp = await VaultAPI.getFile(vaultKey, fileGuid);
                if (!resp || !resp.data) {
                    this._showStatus('error', 'File data not found on server');
                    this._downloading = null;
                    this.render();
                    return;
                }

                const packed = RoomCrypto.b64ToArrayBuf(resp.data);

                if (this._roomKey) {
                    // Decrypt and download
                    try {
                        const plaintext = await RoomCrypto.decrypt(this._roomKey, packed);
                        const blob      = new Blob([plaintext], { type: meta.type || 'application/octet-stream' });
                        const url       = URL.createObjectURL(blob);
                        const a         = document.createElement('a');
                        a.href          = url;
                        a.download      = meta.name || fileGuid;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);
                        this._showStatus('success', '"' + (meta.name || fileGuid) + '" decrypted and downloaded');
                    } catch (decErr) {
                        // Decryption failed — offer raw download
                        this._showStatus('error', 'Decryption failed (wrong key?). Downloading encrypted blob.');
                        this._downloadRawBlob(packed, fileGuid);
                    }
                } else {
                    // No key — download encrypted blob
                    this._downloadRawBlob(packed, fileGuid);
                    this._showStatus('info', 'Downloaded encrypted blob (no room key set)');
                }
            } catch (e) {
                this._showStatus('error', 'Download failed: ' + e.message);
            }

            this._downloading = null;
            this.render();
        }

        _downloadRawBlob(data, fileGuid) {
            const blob = new Blob([data], { type: 'application/octet-stream' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = fileGuid + '.encrypted';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        // --- Render ==============================================================

        render() {
            let content;
            switch (this._state) {
                case 'loading':   content = this._renderLoading();   break;
                case 'need-key':  content = this._renderNeedKey();   break;
                case 'no-access': content = this._renderNoAccess();  break;
                case 'ready':     content = this._renderReady();     break;
                case 'error':     content = this._renderError();     break;
                default:          content = this._renderLoading();
            }

            this.shadowRoot.innerHTML = `
                <style>${RoomView.styles}</style>
                <div class="room-view">
                    ${this._statusMsg ? `<div class="status-bar status-bar--${this._statusMsg.type}">${escapeHtml(this._statusMsg.text)}</div>` : ''}
                    ${content}
                </div>
            `;

            this._wireEvents();
        }

        _renderLoading() {
            return `
                <div class="center-state">
                    <span class="spinner spinner--lg"></span>
                    <p>Verifying access...</p>
                </div>
            `;
        }

        _renderNoAccess() {
            return `
                <div class="center-state">
                    <div class="lock-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                    </div>
                    <h3>Session Expired or Missing</h3>
                    <p>You need a valid invite code to access this room.</p>
                    <a href="join.html" class="btn btn--primary">Join with Invite Code</a>
                </div>
            `;
        }

        _renderNeedKey() {
            const s = this._session;
            return `
                <div class="room-header">
                    <div class="room-title-row">
                        <h2 class="room-name">${escapeHtml(s.room_name || 'Data Room')}</h2>
                        <span class="perm-badge perm-badge--${s.permission || 'viewer'}">${escapeHtml(s.permission || 'viewer')}</span>
                    </div>
                </div>

                ${this._error ? `<div class="error-bar">${escapeHtml(this._error)}</div>` : ''}

                <div class="key-setup">
                    <div class="key-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="40" height="40">
                            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                        </svg>
                    </div>
                    <h3 class="key-title">Room Encryption Key</h3>
                    <p class="key-desc">Files in this room are encrypted with a shared key. Enter the key if you have one, or generate a new key for this room.</p>

                    <form id="form-key" class="key-form">
                        <div class="key-modes">
                            <label class="key-mode-option">
                                <input type="radio" name="key-mode" value="existing" checked>
                                <span>I have a key</span>
                            </label>
                            <label class="key-mode-option">
                                <input type="radio" name="key-mode" value="generate">
                                <span>Generate new key</span>
                            </label>
                        </div>

                        <div class="key-input-wrap" id="key-input-wrap">
                            <input id="input-room-key" type="text" class="input-key"
                                   placeholder="Paste 64-character hex key..."
                                   autocomplete="off" spellcheck="false">
                        </div>

                        <button type="submit" class="btn btn--primary btn--lg">
                            Unlock Room
                        </button>
                    </form>
                </div>
            `;
        }

        _renderReady() {
            const s        = this._session;
            const canWrite = s.permission === 'editor' || s.permission === 'owner';
            const fileRows = this._files.map(f => this._renderFileRow(f)).join('');

            return `
                <div class="room-header">
                    <div class="room-title-row">
                        <h2 class="room-name">${escapeHtml(s.room_name || 'Data Room')}</h2>
                        <span class="perm-badge perm-badge--${s.permission || 'viewer'}">${escapeHtml(s.permission || 'viewer')}</span>
                    </div>
                    <div class="room-meta">
                        <span class="meta-item">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            ${escapeHtml(s.user_id)}
                        </span>
                        <span class="meta-item">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
                            Key: ${escapeHtml(this._roomKeyHex.substring(0, 8))}...
                        </span>
                        <span class="meta-item">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            Expires ${s.expires ? new Date(s.expires).toLocaleString() : 'in 24h'}
                        </span>
                    </div>
                </div>

                ${this._error ? `<div class="error-bar">${escapeHtml(this._error)}</div>` : ''}

                <div class="vault-section">
                    <div class="section-header">
                        <h3 class="section-title">Files</h3>
                        <span class="file-count">${this._files.length} file${this._files.length !== 1 ? 's' : ''}</span>
                    </div>

                    ${canWrite ? `
                        <div class="upload-zone" id="upload-zone">
                            <input type="file" id="file-input" multiple hidden>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="17 8 12 3 7 8"/>
                                <line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                            <p>${this._uploading ? 'Uploading...' : 'Drop files here or click to upload'}</p>
                            <p class="upload-hint">Files are encrypted with the room key before upload</p>
                        </div>
                    ` : ''}

                    ${this._files.length === 0 ? `
                        <div class="empty-state">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                                <polyline points="13 2 13 9 20 9"/>
                            </svg>
                            <p>No files in this room yet</p>
                            ${canWrite ? '<p class="empty-hint">Upload files using the drop zone above</p>' : '<p class="empty-hint">Files uploaded by room members will appear here</p>'}
                        </div>
                    ` : `
                        <div class="file-list">
                            ${fileRows}
                        </div>
                    `}
                </div>

                <div class="room-footer">
                    <button class="btn btn--ghost btn--sm" id="btn-leave">Leave Room</button>
                    <div class="footer-actions">
                        <button class="btn btn--ghost btn--sm" id="btn-copy-key" title="Copy room key to clipboard">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                            Copy Key
                        </button>
                        <button class="btn btn--ghost btn--sm" id="btn-refresh">
                            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/></svg>
                            Refresh
                        </button>
                    </div>
                </div>
            `;
        }

        _renderFileRow(file) {
            const guid   = file.guid;
            const meta   = this._index[guid] || {};
            const name   = meta.name || guid;
            const size   = meta.size != null ? formatSize(meta.size) : '';
            const isDown = this._downloading === guid;

            return `
                <div class="file-row">
                    <div class="file-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                            <polyline points="13 2 13 9 20 9"/>
                        </svg>
                    </div>
                    <div class="file-info">
                        <span class="file-name">${escapeHtml(name)}</span>
                        <span class="file-meta">${size ? escapeHtml(size) + ' \u00B7 ' : ''}${escapeHtml(meta.type || 'Encrypted')}</span>
                    </div>
                    <button class="btn btn--ghost btn--xs btn-download" data-guid="${escapeAttr(guid)}"
                            ${isDown ? 'disabled' : ''}>
                        ${isDown ? '<span class="spinner"></span>' : `
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="14" height="14" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Download
                        `}
                    </button>
                </div>
            `;
        }

        _renderError() {
            return `
                <div class="center-state">
                    <h3>Something went wrong</h3>
                    <p>${escapeHtml(this._error || 'Unknown error')}</p>
                    <button class="btn btn--primary" id="btn-retry">Try Again</button>
                </div>
            `;
        }

        // --- Event Wiring ========================================================

        _wireEvents() {
            // Download buttons
            this.shadowRoot.querySelectorAll('.btn-download').forEach(btn => {
                btn.addEventListener('click', () => this._handleDownload(btn.dataset.guid));
            });

            // Key form
            const formKey = this.shadowRoot.querySelector('#form-key');
            if (formKey) {
                formKey.addEventListener('submit', (e) => this._handleSetKey(e));
                // Toggle key input visibility
                formKey.querySelectorAll('input[name="key-mode"]').forEach(radio => {
                    radio.addEventListener('change', () => {
                        const wrap = this.shadowRoot.querySelector('#key-input-wrap');
                        if (wrap) wrap.style.display = radio.value === 'generate' ? 'none' : 'block';
                    });
                });
            }

            // Upload zone
            const uploadZone = this.shadowRoot.querySelector('#upload-zone');
            const fileInput  = this.shadowRoot.querySelector('#file-input');
            if (uploadZone && fileInput) {
                uploadZone.addEventListener('click', () => fileInput.click());
                uploadZone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    uploadZone.classList.add('upload-zone--active');
                });
                uploadZone.addEventListener('dragleave', () => {
                    uploadZone.classList.remove('upload-zone--active');
                });
                uploadZone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    uploadZone.classList.remove('upload-zone--active');
                    if (e.dataTransfer.files.length) this._handleUpload(e.dataTransfer.files);
                });
                fileInput.addEventListener('change', () => {
                    if (fileInput.files.length) this._handleUpload(fileInput.files);
                });
            }

            // Footer actions
            const btnLeave   = this.shadowRoot.querySelector('#btn-leave');
            const btnRefresh = this.shadowRoot.querySelector('#btn-refresh');
            const btnRetry   = this.shadowRoot.querySelector('#btn-retry');
            const btnCopyKey = this.shadowRoot.querySelector('#btn-copy-key');

            if (btnLeave) btnLeave.addEventListener('click', () => {
                sessionStorage.removeItem('sg_room_session');
                sessionStorage.removeItem('sg_room_key');
                window.location.href = 'join.html';
            });
            if (btnRefresh) btnRefresh.addEventListener('click', () => this._loadFiles());
            if (btnRetry) btnRetry.addEventListener('click', () => {
                this._state = 'loading';
                this._error = null;
                this.render();
                this._initSession();
            });
            if (btnCopyKey) btnCopyKey.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(this._roomKeyHex);
                    this._showStatus('success', 'Room key copied to clipboard');
                } catch (e) {
                    this._showStatus('error', 'Failed to copy key');
                }
            });
        }

        // --- Styles ==============================================================

        static get styles() {
            return `
                :host { display: block; }

                .room-view {
                    max-width: 720px;
                    margin: 0 auto;
                }

                /* --- Status Bar --- */

                .status-bar {
                    padding: var(--space-3, 12px) var(--space-4, 16px);
                    margin-bottom: var(--space-4, 16px);
                    border-radius: var(--radius-sm, 6px);
                    font-size: var(--text-small, 0.8rem);
                    text-align: center;
                }

                .status-bar--info {
                    background: rgba(78, 205, 196, 0.1);
                    border: 1px solid rgba(78, 205, 196, 0.2);
                    color: var(--accent, #4ECDC4);
                }

                .status-bar--success {
                    background: rgba(78, 205, 196, 0.15);
                    border: 1px solid rgba(78, 205, 196, 0.3);
                    color: var(--accent, #4ECDC4);
                }

                .status-bar--error {
                    background: rgba(233, 69, 96, 0.1);
                    border: 1px solid rgba(233, 69, 96, 0.25);
                    color: var(--color-error, #E94560);
                }

                /* --- Center States --- */

                .center-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    padding: var(--space-12, 48px) var(--space-4, 16px);
                    color: var(--color-text-secondary, #8892A0);
                    gap: var(--space-3, 12px);
                }

                .center-state h3 {
                    color: var(--color-text, #E0E0E0);
                    margin: 0;
                    font-family: var(--font-display);
                }

                .center-state p { margin: 0; font-size: var(--text-small, 0.8rem); }

                .lock-icon {
                    width: 64px; height: 64px;
                    display: flex; align-items: center; justify-content: center;
                    border-radius: 50%;
                    background: rgba(233, 69, 96, 0.1);
                    color: var(--color-error, #E94560);
                }

                .lock-icon svg { width: 32px; height: 32px; }

                /* --- Key Setup --- */

                .key-setup {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    padding: var(--space-6, 24px);
                    gap: var(--space-3, 12px);
                }

                .key-icon { color: var(--accent, #4ECDC4); }

                .key-title {
                    font-family: var(--font-display);
                    font-size: var(--text-h3, 1.25rem);
                    font-weight: var(--weight-semibold, 600);
                    color: var(--color-text, #E0E0E0);
                    margin: 0;
                }

                .key-desc {
                    font-size: var(--text-small, 0.8rem);
                    color: var(--color-text-secondary, #8892A0);
                    margin: 0;
                    max-width: 420px;
                }

                .key-form {
                    width: 100%;
                    max-width: 420px;
                    display: flex;
                    flex-direction: column;
                    gap: var(--space-4, 16px);
                    margin-top: var(--space-4, 16px);
                }

                .key-modes {
                    display: flex;
                    gap: var(--space-4, 16px);
                    justify-content: center;
                }

                .key-mode-option {
                    display: flex;
                    align-items: center;
                    gap: var(--space-2, 8px);
                    font-size: var(--text-small, 0.8rem);
                    color: var(--color-text, #E0E0E0);
                    cursor: pointer;
                }

                .key-mode-option input { accent-color: var(--accent, #4ECDC4); }

                .input-key {
                    width: 100%;
                    padding: var(--space-3, 12px) var(--space-4, 16px);
                    font-family: var(--font-mono, monospace);
                    font-size: var(--text-small, 0.8rem);
                    color: var(--color-text, #E0E0E0);
                    background: var(--bg-secondary, #16213E);
                    border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));
                    border-radius: var(--radius, 8px);
                    box-sizing: border-box;
                }

                .input-key:focus {
                    outline: none;
                    border-color: var(--accent, #4ECDC4);
                    box-shadow: 0 0 0 3px rgba(78, 205, 196, 0.15);
                }

                /* --- Room Header --- */

                .room-header {
                    margin-bottom: var(--space-6, 24px);
                    padding-bottom: var(--space-4, 16px);
                    border-bottom: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));
                }

                .room-title-row {
                    display: flex;
                    align-items: center;
                    gap: var(--space-3, 12px);
                    margin-bottom: var(--space-2, 8px);
                }

                .room-name {
                    font-family: var(--font-display);
                    font-size: var(--text-h2, 1.6rem);
                    font-weight: var(--weight-semibold, 600);
                    color: var(--color-text, #E0E0E0);
                    margin: 0;
                }

                .room-meta {
                    display: flex;
                    gap: var(--space-4, 16px);
                    flex-wrap: wrap;
                }

                .meta-item {
                    display: inline-flex;
                    align-items: center;
                    gap: var(--space-1, 4px);
                    font-size: var(--text-small, 0.8rem);
                    color: var(--color-text-secondary, #8892A0);
                }

                /* --- Upload Zone --- */

                .upload-zone {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: var(--space-6, 24px);
                    margin-bottom: var(--space-4, 16px);
                    border: 2px dashed var(--color-drop-zone-border, rgba(78, 205, 196, 0.25));
                    border-radius: var(--radius-md, 12px);
                    background: var(--color-drop-zone-bg, #16213E);
                    color: var(--color-text-secondary, #8892A0);
                    cursor: pointer;
                    transition: border-color var(--transition), background var(--transition);
                }

                .upload-zone:hover, .upload-zone--active {
                    border-color: var(--color-drop-zone-active, #4ECDC4);
                    background: rgba(78, 205, 196, 0.05);
                }

                .upload-zone p { margin: var(--space-2, 8px) 0 0 0; font-size: var(--text-small, 0.8rem); }

                .upload-hint { font-size: var(--text-micro, 0.625rem) !important; opacity: 0.7; }

                /* --- Vault Section --- */

                .vault-section { margin-bottom: var(--space-6, 24px); }

                .section-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: var(--space-4, 16px);
                }

                .section-title {
                    font-size: var(--text-h3, 1.25rem);
                    font-weight: var(--weight-semibold, 600);
                    color: var(--color-text, #E0E0E0);
                    margin: 0;
                }

                .file-count {
                    font-size: var(--text-small, 0.8rem);
                    color: var(--color-text-secondary, #8892A0);
                }

                /* --- Empty State --- */

                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: var(--space-8, 32px);
                    color: var(--color-text-secondary, #8892A0);
                    border: 1px dashed var(--color-border, rgba(78, 205, 196, 0.15));
                    border-radius: var(--radius-md, 12px);
                    text-align: center;
                }

                .empty-state p { margin: var(--space-2, 8px) 0 0 0; }

                .empty-hint { font-size: var(--text-micro, 0.625rem) !important; opacity: 0.7; }

                /* --- File List --- */

                .file-list {
                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                    background: var(--color-border, rgba(78, 205, 196, 0.15));
                    border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));
                    border-radius: var(--radius, 8px);
                    overflow: hidden;
                }

                .file-row {
                    display: flex;
                    align-items: center;
                    gap: var(--space-3, 12px);
                    padding: var(--space-3, 12px) var(--space-4, 16px);
                    background: var(--bg-surface, #1E2A4A);
                    transition: background var(--transition);
                }

                .file-row:hover { background: rgba(78, 205, 196, 0.05); }

                .file-icon {
                    flex-shrink: 0;
                    width: 32px; height: 32px;
                    display: flex; align-items: center; justify-content: center;
                    color: var(--accent, #4ECDC4);
                    opacity: 0.7;
                }

                .file-icon svg { width: 20px; height: 20px; }

                .file-info {
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .file-name {
                    font-size: var(--text-body, 1rem);
                    color: var(--color-text, #E0E0E0);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .file-meta {
                    font-size: var(--text-micro, 0.625rem);
                    color: var(--color-text-secondary, #8892A0);
                }

                /* --- Room Footer --- */

                .room-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-top: var(--space-4, 16px);
                    border-top: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));
                }

                .footer-actions {
                    display: flex;
                    gap: var(--space-2, 8px);
                }

                /* --- Error Bar --- */

                .error-bar {
                    padding: var(--space-3, 12px) var(--space-4, 16px);
                    margin-bottom: var(--space-4, 16px);
                    background: rgba(233, 69, 96, 0.1);
                    border: 1px solid rgba(233, 69, 96, 0.25);
                    border-radius: var(--radius-sm, 6px);
                    color: var(--color-error, #E94560);
                    font-size: var(--text-small, 0.8rem);
                }

                /* --- Permission Badge --- */

                .perm-badge {
                    display: inline-block;
                    padding: var(--space-1, 4px) var(--space-3, 12px);
                    font-size: var(--text-small, 0.8rem);
                    font-weight: var(--weight-semibold, 600);
                    border-radius: 9999px;
                    text-transform: uppercase;
                    letter-spacing: 0.03em;
                }

                .perm-badge--viewer {
                    background: rgba(78, 205, 196, 0.15);
                    color: var(--accent, #4ECDC4);
                }

                .perm-badge--editor {
                    background: rgba(224, 124, 79, 0.15);
                    color: var(--color-warning, #E07C4F);
                }

                .perm-badge--owner {
                    background: rgba(78, 205, 196, 0.25);
                    color: var(--accent, #4ECDC4);
                }

                /* --- Buttons --- */

                .btn {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: var(--space-2, 8px);
                    border: none;
                    border-radius: var(--radius, 8px);
                    cursor: pointer;
                    font-family: var(--font-body);
                    font-weight: var(--weight-medium, 500);
                    transition: background var(--transition), color var(--transition);
                    white-space: nowrap;
                    text-decoration: none;
                }

                .btn:disabled { opacity: 0.5; cursor: not-allowed; }

                .btn--lg {
                    padding: var(--space-3, 12px) var(--space-6, 24px);
                    font-size: var(--text-body, 1rem);
                    width: 100%;
                }

                .btn--primary {
                    background: var(--accent, #4ECDC4);
                    color: var(--bg-primary, #1A1A2E);
                    font-weight: var(--weight-semibold, 600);
                }

                .btn--primary:hover:not(:disabled) {
                    background: var(--accent-hover, #3DBDB4);
                }

                .btn--ghost {
                    background: transparent;
                    color: var(--color-text-secondary, #8892A0);
                    padding: var(--space-2, 8px) var(--space-3, 12px);
                }

                .btn--ghost:hover:not(:disabled) {
                    color: var(--color-text, #E0E0E0);
                    background: rgba(255,255,255,0.05);
                }

                .btn--sm { font-size: var(--text-small, 0.8rem); }

                .btn--xs {
                    font-size: var(--text-small, 0.8rem);
                    padding: var(--space-1, 4px) var(--space-3, 12px);
                }

                /* --- Spinner --- */

                .spinner {
                    display: inline-block;
                    width: 16px; height: 16px;
                    border: 2px solid rgba(255,255,255,0.2);
                    border-top-color: currentColor;
                    border-radius: 50%;
                    animation: spin 0.6s linear infinite;
                }

                .spinner--lg { width: 32px; height: 32px; border-width: 3px; }

                @keyframes spin { to { transform: rotate(360deg); } }

                /* --- Responsive --- */

                @media (max-width: 600px) {
                    .room-meta { flex-direction: column; gap: var(--space-2, 8px); }
                    .file-row { padding: var(--space-2, 8px) var(--space-3, 12px); }
                    .footer-actions { flex-direction: column; }
                }
            `;
        }
    }

    customElements.define('room-view', RoomView);
})();
