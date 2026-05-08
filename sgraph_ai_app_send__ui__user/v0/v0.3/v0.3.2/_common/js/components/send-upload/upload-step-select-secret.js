/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Step Select: Secret Tab Patch (v0.3.2)

   Replaces the "Text" tab in upload-step-select with a "🔒 Secret" tab.
   The Secret tab renders a textarea + expiry pills and fires
   'step-secret-submit' with { text, config: { maxDownloads, expiresInHours } }.

   "Create Secret Link →" button lives top-right (above textarea), disabled
   until the user has typed at least one non-whitespace character.

   Load AFTER upload-step-select.js.
   ═══════════════════════════════════════════════════════════════════════════════ */

/* ─── Secret-tab styles (injected into Shadow DOM on first secret render) ─────── */
var _SGRAPH_SECRET_CSS = [
    /* Header row: mode toggle left, send button right */
    '.secret-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3,0.75rem);}',
    '.secret-header .mode-toggle{margin-bottom:0;}',
    /* Compact send button for the header */
    '.btn--secret-send{white-space:nowrap;flex-shrink:0;padding:0.375rem 0.875rem;font-size:var(--text-sm,0.875rem);}',
    /* Secret input wrapper */
    '.secret-input-area{margin-bottom:var(--space-4,1rem);}',
    /* Config section */
    '.secret-config{display:flex;flex-direction:column;gap:var(--space-2,0.5rem);margin-bottom:var(--space-4,1rem);padding:var(--space-3,0.75rem);background:rgba(78,205,196,0.03);border:1px solid rgba(78,205,196,0.1);border-radius:var(--radius-md,12px);}',
    '.secret-config__row{display:flex;align-items:center;gap:var(--space-3,0.75rem);}',
    '.secret-config__label{font-size:var(--text-small,0.75rem);font-weight:var(--weight-semibold,600);color:var(--color-text-secondary,#8892A0);text-transform:uppercase;letter-spacing:0.05em;min-width:3.5rem;flex-shrink:0;}',
    '.secret-config__pills{display:flex;flex-wrap:wrap;gap:var(--space-1,0.25rem);}',
    /* Pill toggle buttons */
    '.secret-pill{padding:0.25rem 0.75rem;background:transparent;border:1px solid rgba(78,205,196,0.2);border-radius:999px;color:var(--color-text-secondary,#8892A0);font-size:var(--text-small,0.75rem);cursor:pointer;transition:all 0.15s ease;line-height:1.5;}',
    '.secret-pill:hover{border-color:var(--color-primary,#4ECDC4);color:var(--color-primary,#4ECDC4);}',
    '.secret-pill--active{background:rgba(78,205,196,0.15);border-color:var(--color-primary,#4ECDC4);color:var(--color-primary,#4ECDC4);font-weight:var(--weight-semibold,600);}'
].join('\n');

/* ─── Patch _renderIdle ──────────────────────────────────────────────────────── */

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
        var _sr = this.shadowRoot;
        if (_sr && !_sr.getElementById('sgraph-secret-styles')) {
            var _st = document.createElement('style');
            _st.id = 'sgraph-secret-styles';
            _st.textContent = _SGRAPH_SECRET_CSS;
            _sr.appendChild(_st);
        }

        this._container.innerHTML =
            '<div class="secret-header">' +
                modeToggle +
                '<button class="btn btn-primary btn--secret-send" id="secret-send-btn"' +
                    ' data-testid="secret-send-btn" disabled>Create Secret Link →</button>' +
            '</div>' +
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
                    '<span class="secret-config__label">Views</span>' +
                    '<div class="secret-config__pills" id="max-dl-pills">' +
                        '<button type="button" class="secret-pill secret-pill--active" data-name="max-dl" data-value="1">1 view</button>' +
                        '<button type="button" class="secret-pill" data-name="max-dl" data-value="5">5 views</button>' +
                        '<button type="button" class="secret-pill" data-name="max-dl" data-value="10">10 views</button>' +
                    '</div>' +
                '</div>' +
                '<div class="secret-config__row">' +
                    '<span class="secret-config__label">Expires</span>' +
                    '<div class="secret-config__pills" id="expiry-pills">' +
                        '<button type="button" class="secret-pill" data-name="expiry" data-value="1">1 hour</button>' +
                        '<button type="button" class="secret-pill secret-pill--active" data-name="expiry" data-value="24">24 hours</button>' +
                        '<button type="button" class="secret-pill" data-name="expiry" data-value="168">7 days</button>' +
                        '<button type="button" class="secret-pill" data-name="expiry" data-value="0">Never</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div class="trust-badge">' +
                '<span class="trust-badge__icon">🔒</span>' +
                '<span>Zero cookies · Zero tracking · We cannot read your secret</span>' +
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

/* ─── Patch _setupListeners to wire Secret tab ───────────────────────────────── */

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

    // Secret tab: char counter + enable/disable send button
    var secretInput   = sr.querySelector('#secret-input');
    var secretCount   = sr.querySelector('#secret-char-count');
    var secretSendBtn = sr.querySelector('#secret-send-btn');
    if (secretInput) {
        secretInput.addEventListener('input', function() {
            var len = secretInput.value.length;
            if (secretCount)   secretCount.textContent = len + ' characters';
            if (secretSendBtn) secretSendBtn.disabled  = !secretInput.value.trim();
        });
    }

    // Secret tab: pill toggle buttons
    sr.querySelectorAll('.secret-pill').forEach(function(pill) {
        pill.addEventListener('click', function() {
            var name = pill.dataset.name;
            sr.querySelectorAll('.secret-pill[data-name="' + name + '"]').forEach(function(p) {
                p.classList.remove('secret-pill--active');
            });
            pill.classList.add('secret-pill--active');
        });
    });

    // Secret tab: send button
    if (secretSendBtn) {
        secretSendBtn.addEventListener('click', function() {
            var ta = sr.querySelector('#secret-input');
            if (!ta || !ta.value.trim()) return;

            var maxDlPill  = sr.querySelector('.secret-pill[data-name="max-dl"].secret-pill--active');
            var expiryPill = sr.querySelector('.secret-pill[data-name="expiry"].secret-pill--active');

            var maxDownloads   = maxDlPill  ? parseInt(maxDlPill.dataset.value,  10) : 1;
            var expiresInHours = expiryPill ? parseInt(expiryPill.dataset.value, 10) : 24;

            self.emit('step-secret-submit', {
                text:   ta.value,
                config: { maxDownloads: maxDownloads, expiresInHours: expiresInHours }
            });
        });
    }
};
