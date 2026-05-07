/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Send Secret View (v0.3.2)

   Standalone Web Component: <send-secret-view>
   Handles both the SECRET VIEW flow and the KILL CONFIRM flow, detected from
   the URL path:

     View:  /en-gb/s/{transferId}#{keyHex}
       → fetches via download-base64, decrypts, displays inline
       → then fetches info to show ephemerality notice (D1 or D2 from doc 03)

     Kill:  /en-gb/s/kill/{transferId}#{deleteAuth}
       → shows kill confirmation screen (Screen H from doc 03)
       → calls DELETE /api/transfers/delete/{id} on confirm

   No Shadow DOM (static useShadow = false). Rendered directly into the page.
   AES-256-GCM: 12-byte IV is prepended to the ciphertext (matches crypto.js).
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendSecretView extends SendComponent {

    static useShadow  = false;
    static useTemplate = false;

    onReady() {
        this._run();
    }

    // ─── Entry point ──────────────────────────────────────────────────────────

    async _run() {
        this._showLoading();
        try {
            var pathParts = window.location.pathname.split('/').filter(Boolean);

            // Detect kill mode: URL contains .../kill/{transferId}
            var killIdx = pathParts.indexOf('kill');
            if (killIdx !== -1) {
                var killTransferId = pathParts[killIdx + 1] || '';
                var deleteAuth     = window.location.hash.slice(1);
                if (!killTransferId || !deleteAuth) {
                    this._showError('invalid-link');
                } else {
                    this._showKillConfirm(killTransferId, deleteAuth);
                }
                return;
            }

            // View mode: URL is .../s/{transferId}#{keyHex}
            var transferId = pathParts[pathParts.length - 1];
            var keyHex     = window.location.hash.slice(1);

            if (!transferId || !keyHex) {
                this._showError('invalid-link');
                return;
            }

            // Fetch ciphertext (server increments download_count here)
            var data = await ApiClient.downloadBase64(transferId);

            // Decode base64 → ArrayBuffer
            var cipherBuf = this._b64ToArrayBuffer(data.data);

            // Import AES key from hex
            var keyBytes  = this._hexToBytes(keyHex);
            var cryptoKey = await crypto.subtle.importKey(
                'raw', keyBytes,
                { name: 'AES-GCM', length: 256 },
                false,
                ['decrypt']
            );

            // Decrypt: first 12 bytes = IV, rest = ciphertext
            var iv         = cipherBuf.slice(0, 12);
            var ciphertext = cipherBuf.slice(12);
            var plainBuf   = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: new Uint8Array(iv) },
                cryptoKey,
                ciphertext
            );

            // Decode UTF-8 — strip SGMETA envelope if present (magic: SGMETA)
            var rawBytes = new Uint8Array(plainBuf);
            var plainText = this._extractContent(rawBytes);

            // Fetch info to determine ephemerality notice (D1 vs D2)
            // Fetched AFTER decrypt to avoid leaking whether the download worked
            var info = null;
            try { info = await ApiClient.getTransferInfo(transferId); } catch (e) { /* fine */ }

            this._showSecret(plainText, info);

        } catch (err) {
            var msg = err.message || '';
            if (msg.indexOf('download:exhausted') !== -1 || msg.indexOf('download:not-found') !== -1) {
                this._showError('already-viewed');
            } else if (msg.indexOf('expired') !== -1) {
                this._showError('expired');
            } else if (msg.indexOf('OperationError') !== -1 || err.name === 'OperationError') {
                this._showError('decrypt-failed');
            } else if (msg.indexOf('download:') !== -1) {
                this._showError('already-viewed');
            } else {
                this._showError('decrypt-failed');
            }
        }
    }

    // ─── Screen D1/D2: secret display ────────────────────────────────────────

    _showSecret(text, info) {
        var noticeHtml = this._buildEphemeralityNotice(info);

        this.innerHTML =
            '<div class="secret-view">' +
                '<div class="secret-view__card">' +
                    '<div class="secret-view__title">🔒 Secret Message</div>' +
                    '<hr class="secret-view__divider">' +
                    '<pre class="secret-view__text">' + this._escHtml(text) + '</pre>' +
                    '<hr class="secret-view__divider">' +
                    '<button class="secret-view__copy" id="sv-copy-btn">📋 Copy</button>' +
                    noticeHtml +
                    '<p class="secret-view__trust">' +
                        'Decrypted in your browser · Server never saw this text' +
                    '</p>' +
                    '<hr class="secret-view__divider">' +
                    '<p class="secret-view__cta">' +
                        'Want to share your own secret? ' +
                        '<a href="../">→ Try SG/Send</a>' +
                    '</p>' +
                '</div>' +
            '</div>';

        var copyBtn = this.querySelector('#sv-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', function() {
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(text).then(function() {
                        copyBtn.textContent = '✓ Copied';
                        setTimeout(function() { copyBtn.textContent = '📋 Copy'; }, 2000);
                    });
                }
            });
        }
    }

    _buildEphemeralityNotice(info) {
        if (!info) return '';

        var remaining = info.downloads_remaining;
        var maxDl     = info.max_downloads;
        var expiresAt = info.expires_at;
        var isExpired = info.is_expired;

        if (isExpired) {
            return '<div class="secret-view__notice secret-view__notice--warn">' +
                   '⚠ This secret has expired.' +
                   '</div>';
        }

        // D1: auto-deleted after this view
        if (remaining === 0 && maxDl > 0) {
            return '<div class="secret-view__notice secret-view__notice--warn">' +
                   '⚠ This secret was deleted from the server after you opened this link. No copy remains.' +
                   '</div>';
        }

        // D2: views remaining
        if (remaining > 0) {
            var parts = [remaining + ' view' + (remaining === 1 ? '' : 's') + ' remaining'];
            if (expiresAt && expiresAt > 0) {
                parts.push('Expires ' + new Date(expiresAt).toLocaleString());
            }
            return '<div class="secret-view__notice secret-view__notice--info">' +
                   'ℹ ' + this._escHtml(parts.join(' · ')) +
                   '</div>';
        }

        // remaining === 0 && !auto_delete
        if (remaining === 0 && maxDl > 0) {
            return '<div class="secret-view__notice secret-view__notice--warn">' +
                   '⚠ No views remaining on this link.' +
                   '</div>';
        }

        return '';
    }

    // ─── Error screens (E/F/G) ────────────────────────────────────────────────

    _showError(type) {
        var content;
        if (type === 'already-viewed') {
            content =
                '<div class="secret-view__title">👁 Already Viewed</div>' +
                '<p>This secret has already been viewed and deleted.</p>' +
                '<p>If you haven\'t seen it yet, ask the sender to create a new secret link.</p>' +
                '<hr class="secret-view__divider">' +
                '<p class="secret-view__security-hint">' +
                    'Was this link intercepted? If you suspect this, let the sender know immediately.' +
                '</p>';
        } else if (type === 'expired') {
            content =
                '<div class="secret-view__title">⏱ Expired</div>' +
                '<p>This secret has expired. The sender set a time limit and it has passed.</p>' +
                '<p>Ask the sender to create a new secret link.</p>';
        } else if (type === 'deleted') {
            content =
                '<div class="secret-view__title">🗑 Deleted</div>' +
                '<p>This secret was deleted by the sender before it was viewed.</p>' +
                '<p>Ask the sender to create a new link if this was in error.</p>';
        } else if (type === 'invalid-link') {
            content =
                '<div class="secret-view__title">🔗 Invalid Link</div>' +
                '<p>This link is missing required information (transfer ID or key).</p>' +
                '<p>Please check the link and try again.</p>';
        } else {
            // decrypt-failed
            content =
                '<div class="secret-view__title">🔑 Decryption Failed</div>' +
                '<p>The decryption key in this link did not match the encrypted content.</p>' +
                '<p>The link may be incomplete or corrupted.</p>';
        }
        this.innerHTML =
            '<div class="secret-view">' +
                '<div class="secret-view__card secret-view__card--error">' +
                    content +
                '</div>' +
            '</div>';
    }

    // ─── Screen H: kill confirmation ──────────────────────────────────────────

    _showKillConfirm(transferId, deleteAuth) {
        var self = this;
        this.innerHTML =
            '<div class="secret-view">' +
                '<div class="secret-view__card">' +
                    '<div class="secret-view__title">🗑 Delete Secret?</div>' +
                    '<p>This will permanently delete the secret before it is viewed.</p>' +
                    '<p><strong>This cannot be undone.</strong></p>' +
                    '<div class="secret-view__kill-actions">' +
                        '<button class="btn btn-secondary" id="sv-kill-cancel">Cancel</button>' +
                        '<button class="btn btn-danger" id="sv-kill-confirm">🗑 Delete Now</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        var cancelBtn  = this.querySelector('#sv-kill-cancel');
        var confirmBtn = this.querySelector('#sv-kill-confirm');

        if (cancelBtn) cancelBtn.addEventListener('click', function() { history.back(); });
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async function() {
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Deleting…';
                try {
                    await ApiClient.deleteTransfer(transferId, deleteAuth);
                    self.innerHTML =
                        '<div class="secret-view">' +
                            '<div class="secret-view__card">' +
                                '<div class="secret-view__title">✓ Secret Deleted</div>' +
                                '<p>The secret has been permanently deleted.</p>' +
                                '<p>Anyone clicking the original link will see "Deleted by sender."</p>' +
                            '</div>' +
                        '</div>';
                } catch (err) {
                    var msg = err.message || '';
                    if (msg.indexOf('not-found') !== -1) {
                        self._showError('already-viewed'); // Already gone
                    } else {
                        self.innerHTML =
                            '<div class="secret-view">' +
                                '<div class="secret-view__card secret-view__card--error">' +
                                    '<div class="secret-view__title">⚠ Delete Failed</div>' +
                                    '<p>Could not delete the secret. It may already be gone.</p>' +
                                '</div>' +
                            '</div>';
                    }
                }
            });
        }
    }

    // ─── Loading spinner ──────────────────────────────────────────────────────

    _showLoading() {
        this.innerHTML =
            '<div class="secret-view">' +
                '<div class="secret-view__card">' +
                    '<div class="secret-view__loading">🔒 Decrypting your secret…</div>' +
                '</div>' +
            '</div>';
    }

    // ─── Crypto helpers ───────────────────────────────────────────────────────

    _b64ToArrayBuffer(b64) {
        var binary = atob(b64);
        var bytes  = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    }

    _hexToBytes(hex) {
        var bytes = new Uint8Array(hex.length / 2);
        for (var i = 0; i < hex.length; i += 2) {
            bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
        }
        return bytes;
    }

    // Strip the SGMETA envelope prepended by UploadConstants.packageWithMetadata
    // Magic: 0x53 0x47 0x4D 0x45 0x54 0x41 ("SGMETA")
    _extractContent(bytes) {
        var MAGIC = [0x53, 0x47, 0x4D, 0x45, 0x54, 0x41];
        var hasMeta = bytes.length > MAGIC.length + 4;
        for (var i = 0; hasMeta && i < MAGIC.length; i++) {
            if (bytes[i] !== MAGIC[i]) { hasMeta = false; }
        }
        if (hasMeta) {
            var metaLen = (bytes[6] << 24) | (bytes[7] << 16) | (bytes[8] << 8) | bytes[9];
            var contentStart = MAGIC.length + 4 + metaLen;
            bytes = bytes.slice(contentStart);
        }
        return new TextDecoder().decode(bytes);
    }

    // ─── Utility ──────────────────────────────────────────────────────────────

    _escHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}

customElements.define('send-secret-view', SendSecretView);
