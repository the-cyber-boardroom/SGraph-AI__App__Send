/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Step Select: Secret Tab Patch (v0.3.2)

   Replaces the "Text" tab in upload-step-select with a "🔒 Secret" tab.
   The Secret tab renders a textarea + expiry radio buttons and fires
   'step-secret-submit' with { text, config: { maxDownloads, expiresInHours } }.

   Users who want to share plain text as a file can drop a .txt into the File tab.

   Load AFTER upload-step-select.js.
   ═══════════════════════════════════════════════════════════════════════════════ */

UploadStepSelect.prototype._renderIdle = function() {
    var maxSize  = this._fmt(this._maxFileSize);
    var isFile   = this._inputMode === 'file';
    var isSecret = this._inputMode === 'secret';

    var modeToggle =
        '<div class="mode-toggle">' +
            '<button class="mode-toggle__btn ' + (isFile ? 'mode-toggle__btn--active' : '') +
                '" id="mode-file" data-testid="mode-file">File</button>' +
            '<button class="mode-toggle__btn mode-toggle__btn--secret ' + (isSecret ? 'mode-toggle__btn--active' : '') +
                '" id="mode-secret" data-testid="mode-secret">🔒 Secret</button>' +
        '</div>';

    if (isSecret) {
        this._container.innerHTML =
            modeToggle +
            '<div class="secret-input-area">' +
                '<textarea class="text-input" id="secret-input" data-testid="secret-input"' +
                    ' placeholder="Type or paste the secret to encrypt and share..."' +
                    ' spellcheck="false" rows="6"></textarea>' +
                '<div class="text-input-footer">' +
                    '<span class="text-input-count" id="secret-char-count">0 characters</span>' +
                '</div>' +
            '</div>' +
            '<div class="secret-config">' +
                '<div class="secret-config__row">' +
                    '<span class="secret-config__label">Expires after</span>' +
                    '<div class="secret-config__options">' +
                        '<label><input type="radio" name="max-dl" value="1" checked> 1 view <em>(default)</em></label>' +
                        '<label><input type="radio" name="max-dl" value="5"> 5 views</label>' +
                        '<label><input type="radio" name="max-dl" value="10"> 10 views</label>' +
                    '</div>' +
                '</div>' +
                '<div class="secret-config__row">' +
                    '<span class="secret-config__label">Expires in</span>' +
                    '<div class="secret-config__options">' +
                        '<label><input type="radio" name="expiry" value="1"> 1 hour</label>' +
                        '<label><input type="radio" name="expiry" value="24" checked> 24 hours <em>(default)</em></label>' +
                        '<label><input type="radio" name="expiry" value="168"> 7 days</label>' +
                        '<label><input type="radio" name="expiry" value="0"> No time limit</label>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="trust-badge">' +
                '<span class="trust-badge__icon">🔒</span>' +
                '<span>Zero cookies · Zero tracking · We cannot read your secret</span>' +
            '</div>' +
            '<div class="secret-actions">' +
                '<button class="btn btn-primary" id="secret-send-btn" data-testid="secret-send-btn">Create Secret Link →</button>' +
            '</div>';
    } else {
        // File tab — unchanged from v0.3.0
        this._container.innerHTML =
            modeToggle +
            '<div class="drop-zone" id="drop-zone" data-testid="drop-zone">' +
                '<div class="drop-zone__label">Drop files or a folder</div>' +
                '<div class="drop-zone__paste-hint">or paste from clipboard (Ctrl+V)</div>' +
                '<div class="browse-buttons">' +
                    '<button class="browse-btn" id="browse-file-btn" data-testid="browse-file-btn">Browse files</button>' +
                    '<button class="browse-btn" id="browse-folder-btn" data-testid="browse-folder-btn">Browse folder</button>' +
                '</div>' +
                '<div class="drop-zone__hint" style="margin-top:var(--space-3,0.75rem);">' +
                    'Your files are encrypted in your browser before upload' +
                '</div>' +
                '<div class="drop-zone__hint" style="margin-top:var(--space-1,0.25rem);font-size:var(--text-small,0.75rem);opacity:0.7;">' +
                    'Maximum upload: ' + this._esc(maxSize) +
                '</div>' +
                '<input type="file" id="file-input" data-testid="file-input" style="display:none;" multiple>' +
                '<input type="file" id="folder-input" data-testid="folder-input" style="display:none;" webkitdirectory>' +
            '</div>' +
            '<div class="trust-badge">' +
                '<span class="trust-badge__icon">&#128274;</span>' +
                '<span>Zero cookies &middot; Zero tracking &middot; We cannot read your files</span>' +
            '</div>';
    }
};

// ─── Patch _setupListeners to wire Secret tab and old Text listeners ─────────

var _origSetupListeners = UploadStepSelect.prototype._setupListeners;
UploadStepSelect.prototype._setupListeners = function() {
    _origSetupListeners.call(this);

    var sr   = this.shadowRoot;
    var self = this;

    // Mode toggle: file / secret (Text removed)
    var modeFileBtn   = sr.querySelector('#mode-file');
    var modeSecretBtn = sr.querySelector('#mode-secret');

    if (modeFileBtn) {
        modeFileBtn.addEventListener('click', function() {
            if (self._inputMode !== 'file') { self._inputMode = 'file'; self.render(); }
        });
    }
    if (modeSecretBtn) {
        modeSecretBtn.addEventListener('click', function() {
            if (self._inputMode !== 'secret') { self._inputMode = 'secret'; self.render(); }
        });
    }

    // Secret tab: char counter
    var secretInput = sr.querySelector('#secret-input');
    var secretCount = sr.querySelector('#secret-char-count');
    if (secretInput && secretCount) {
        secretInput.addEventListener('input', function() {
            secretCount.textContent = secretInput.value.length + ' characters';
        });
    }

    // Secret tab: send button
    var secretSendBtn = sr.querySelector('#secret-send-btn');
    if (secretSendBtn) {
        secretSendBtn.addEventListener('click', function() {
            var ta = sr.querySelector('#secret-input');
            if (!ta || !ta.value.trim()) return;

            var maxDlEl  = sr.querySelector('input[name="max-dl"]:checked');
            var expiryEl = sr.querySelector('input[name="expiry"]:checked');

            var maxDownloads    = maxDlEl   ? parseInt(maxDlEl.value,   10) : 1;
            var expiresInHours  = expiryEl  ? parseInt(expiryEl.value,  10) : 24;

            self.emit('step-secret-submit', {
                text:   ta.value,
                config: { maxDownloads: maxDownloads, expiresInHours: expiresInHours }
            });
        });
    }
};
