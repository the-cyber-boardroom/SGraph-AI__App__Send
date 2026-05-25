/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Orchestrator
   v0.4.0 — Unified file + secret share orchestrator (merged from v0.3.0 base
            + v0.3.2 send-upload-secret.js + send-upload-options.js).

   Thin coordinator — owns the 5-step state machine and wires sub-components.
   All business logic is in dedicated modules:

     UploadConstants    — step labels, state mapping, carousel, size limits
     UploadEngine       — read → encrypt → create → upload → complete pipeline
     UploadFolder       — directory scanning, JSZip compression, gallery preview
     UploadThumbnails   — image/PDF/markdown/video thumbnail generation
     UploadCrypto       — friendly keys, PBKDF2 key derivation
     UploadFileUtils    — file type detection, delivery options

   5-step wizard:
     1. Upload                  — file/folder/secret selection
     2. Options                 — delivery mode + share mode in one screen
     3. Confirm                 — review + word picker
     4. Encrypt & Upload        — progress, carousel
     5. Done                    — share links + QR (mode='secret' adds kill link)

   Sub-components (all live in send-upload/):
     <upload-step-select>     — Step 1: file/folder/secret selection
     <upload-step-options>    — Step 2: combined delivery + share-mode picker
     <upload-step-confirm>    — Step 3: review + word picker
     <upload-step-progress>   — Step 4: encrypt & upload progress
     <upload-step-done>       — Step 5: share links + QR (mode='file'|'secret')

   Secret mode (when user picks the "🔒 Secret" tab in Step 1):
     - selectedFile = a File wrapping the typed text (secret.txt)
     - _isSecretMode = true; _secretConfig = { max_downloads, auto_delete,
       expires_at, delete_auth_hash }
     - _deleteAuth is a 32-byte random token; only sha256(deleteAuth) goes to
       the server. The kill URL carries the raw token in the fragment (never
       sent in HTTP requests — zero-knowledge preserved).
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendUpload extends HTMLElement {

    constructor() {
        super();
        this._state               = 'idle';
        this._mode                = 'file';
        this.selectedFile         = null;
        this.result               = null;
        this.errorMessage         = '';
        this._folderScan          = null;
        this._folderName          = null;
        this._folderOptions       = { level: 4, includeEmpty: false, includeHidden: false };
        this._deliveryOptions     = null;
        this._recommendedDelivery = null;
        this._selectedDelivery    = null;
        this._shareMode           = 'token';
        this._friendlyParts       = null;
        this._friendlyKey         = null;
        this._thumbnailUrl        = null;
        this._stageTimestamps     = {};
        this._capabilities        = null;
        this._beforeUnloadHandler = null;
        this._carouselIndex       = 0;
        this._carouselTimer       = null;
        this._els                 = {};

        // Secret-mode state
        this._isSecretMode = false;
        this._secretConfig = null;
        this._deleteAuth   = null;
    }

    get state()  { return this._state; }
    set state(v) { this._state = v; this._stageTimestamps[v] = Date.now(); this._render(); }

    // ═══ Lifecycle ══════════════════════════════════════════════════════════

    connectedCallback() {
        this._checkCapabilities();
        this._render();
        this._wireEvents();
        this._localeHandler = () => {
            if (this._state === 'idle' || this._state === 'complete') this._render();
        };
        document.addEventListener('locale-changed', this._localeHandler);
        // Test files component dispatches on document (it's outside our tree)
        this._testFileHandler = (e) => {
            var files = e.detail && e.detail.files;
            if (!files || files.length === 0) return;
            if (files.length > 1) this._onMultiFile(files);
            else this._setFile(files[0]);
        };
        document.addEventListener('test-file-loaded', this._testFileHandler);
    }

    disconnectedCallback() {
        this._stopCarousel();
        this._setBeforeUnload(false);
        document.removeEventListener('locale-changed', this._localeHandler);
        if (this._testFileHandler) document.removeEventListener('test-file-loaded', this._testFileHandler);
    }

    async _checkCapabilities() {
        try {
            var caps = await ApiClient.getCapabilities();
            this._capabilities = caps;
            UploadConstants.setMaxFileSize(
                caps.multipart_upload ? UploadConstants.MAX_FILE_SIZE_PRESIGNED : UploadConstants.MAX_FILE_SIZE_DIRECT
            );
            if (this._els.select) this._els.select.maxFileSize = UploadConstants.MAX_FILE_SIZE;
        } catch (e) { /* default to direct */ }
    }

    // ═══ Rendering ══════════════════════════════════════════════════════════

    _render() {
        var step   = UploadConstants.stepForState(this._state);
        var isProc = UploadConstants.isProcessing(this._state);

        // Build shell on first render
        if (!this._els.select) {
            this.innerHTML =
                '<div class="card">' +
                    '<div class="upload-header-row">' +
                        '<div class="upload-header-row__steps">' +
                            '<send-step-indicator step="' + step + '" total="' + UploadConstants.TOTAL_STEPS + '"></send-step-indicator>' +
                        '</div>' +
                        '<div class="upload-header-row__action"></div>' +
                    '</div>' +
                    '<div class="step-content"></div>' +
                '</div>';
            var container = this.querySelector('.step-content');
            var names = ['select','options','confirm','progress','done'];
            var tags  = ['upload-step-select','upload-step-options','upload-step-confirm',
                         'upload-step-progress','upload-step-done'];
            for (var i = 0; i < names.length; i++) {
                var el = document.createElement(tags[i]);
                el.style.display = 'none';
                container.appendChild(el);
                this._els[names[i]] = el;
            }
            var errDiv = document.createElement('div');
            errDiv.className = 'status status--error';
            errDiv.style.display = 'none';
            container.appendChild(errDiv);
            this._els.error = errDiv;
            this._wireEvents();
        }

        // Step indicator
        var indicator = this.querySelector('send-step-indicator');
        if (indicator) {
            indicator.setAttribute('step', step);
            indicator.setAttribute('total', UploadConstants.TOTAL_STEPS);
        }

        // Inline Next button (changes per state)
        var actionSlot = this.querySelector('.upload-header-row__action');
        if (actionSlot) {
            var btnHtml = '';
            if (this._state === 'choosing-options') {
                btnHtml = '<button class="upload-next-btn" id="upload-next-btn">Next →</button>';
            } else if (this._state === 'confirming') {
                btnHtml = '<button class="upload-next-btn upload-next-btn--send" id="upload-next-btn">Encrypt & Upload →</button>';
            } else if (isProc) {
                btnHtml = '<button class="upload-next-btn upload-next-btn--disabled" disabled>Encrypting…</button>';
            } else if (this._state === 'complete') {
                btnHtml = '<button class="upload-next-btn" id="upload-email-btn">Email Link</button>';
            }
            actionSlot.innerHTML = btnHtml;
            this._wireNextButton();
        }

        // Show/hide sub-components
        var activeKey = this._activeComponent();
        var keys = ['select','options','confirm','progress','done','error'];
        for (var k = 0; k < keys.length; k++) {
            if (this._els[keys[k]]) this._els[keys[k]].style.display = keys[k] === activeKey ? '' : 'none';
        }
        this._syncComponent(activeKey);

        if (isProc) this._startCarousel();
        else this._stopCarousel();

        // U-017: Hide Access Token and Test Files sections once past Step 1 idle
        var showSiblings = (this._state === 'idle' || this._state === 'file-ready' || this._state === 'folder-options');
        var testFiles = document.querySelector('send-test-files');
        if (testFiles) testFiles.style.display = showSiblings ? '' : 'none';
        var tokenBar = document.querySelector('.v026-token-bar');
        if (tokenBar) tokenBar.style.display = showSiblings ? '' : 'none';
    }

    _activeComponent() {
        switch (this._state) {
            case 'idle': case 'file-ready': case 'folder-options': return 'select';
            case 'choosing-options':  return 'options';
            case 'confirming':        return 'confirm';
            case 'zipping': case 'reading': case 'encrypting':
            case 'creating': case 'uploading': case 'completing': return 'progress';
            case 'complete':          return 'done';
            case 'error':             return 'error';
            default:                  return 'select';
        }
    }

    _syncComponent(key) {
        var e = this._els;

        if (key === 'select' && e.select) {
            e.select.state        = this._state === 'file-ready' ? 'file-ready'
                                  : this._state === 'folder-options' ? 'folder-options' : 'idle';
            e.select.selectedFile = this.selectedFile;
            e.select.folderScan   = this._folderScan;
            e.select.folderName   = this._folderName;
            e.select.folderOptions= this._folderOptions;
            e.select.maxFileSize  = UploadConstants.MAX_FILE_SIZE;
            e.select.thumbnailUrl = this._thumbnailUrl;
        }
        if (key === 'options' && e.options) {
            e.options.deliveryOptions     = this._deliveryOptions;
            e.options.recommendedDelivery = this._recommendedDelivery;
            e.options.selectedDelivery    = this._selectedDelivery;
            e.options.fileSummary         = this._fileSummary();
            e.options.shareMode           = this._shareMode;
            e.options.secretMode          = !!this._isSecretMode;
        }
        if (key === 'confirm' && e.confirm) {
            if (!this._friendlyParts && this._shareMode === 'token') {
                this._friendlyParts = UploadCrypto.newFriendlyKey();
                this._friendlyKey   = UploadCrypto.formatFriendly(this._friendlyParts);
            }
            var allDelivery = this._deliveryOptions || [];
            var selDel = this._selectedDelivery;
            var deliveryOpt = allDelivery.find(function(o) { return o.id === selDel; });
            var shareModes = UploadCrypto.SHARE_MODES;
            var sm = this._shareMode;
            var shareCfg = shareModes.find(function(m) { return m.id === sm; });

            e.confirm.fileSummary       = this._fileSummary();
            e.confirm.deliveryOption    = deliveryOpt || null;
            e.confirm.shareModeConfig   = shareCfg || null;
            e.confirm.shareMode         = this._shareMode;
            e.confirm.friendlyParts     = this._friendlyParts;
            e.confirm.friendlyKey       = this._friendlyKey;
            e.confirm.fileSize          = this.selectedFile ? this.selectedFile.size : 0;
            e.confirm.showThumbnailNote = this._selectedDelivery === 'gallery';
        }
        if (key === 'progress' && e.progress) {
            e.progress.stage           = this._state;
            e.progress.stageTimestamps = this._stageTimestamps;
        }
        if (key === 'done' && e.done && this.result) {
            e.done.mode            = this._isSecretMode ? 'secret' : 'file';
            e.done.result          = this.result;
            e.done.shareMode       = this._shareMode;
            e.done.fileSummary     = this._fileSummary();
            e.done.deliveryOptions = this._deliveryOptions || [];
            e.done.stageTimestamps = this._stageTimestamps;
            e.done.selectedDelivery= this._selectedDelivery;
            e.done.showPicker      = false;
            if (this._isSecretMode && this._secretConfig) {
                e.done.secretConfig = this._secretConfig;
                e.done.deleteAuth   = this._deleteAuth;
            }
        }
        if (key === 'error' && e.error) {
            e.error.textContent = this.errorMessage;
        }
    }

    _fileSummary() {
        return UploadFileUtils.buildFileSummary(
            this.selectedFile, this._folderScan, this._folderName,
            SendHelpers.formatBytes, SendHelpers.escapeHtml
        );
    }

    // ═══ Event Wiring ═══════════════════════════════════════════════════════

    _wireEvents() {
        var self = this;
        var c = this.querySelector('.step-content');
        if (!c || c._wired) return;
        c._wired = true;

        // Step indicator click navigation (bubbles from send-step-indicator)
        this.addEventListener('step-nav', function(e) {
            var step = e.detail.step;
            // Clear friendly key when navigating back past Options (avoid ID collision)
            if (step <= 2) {
                self._friendlyParts = null;
                self._friendlyKey   = null;
            }
            if (step === 1) {
                self._resetSelection();
                self.state = 'idle';
            } else if (step === 2) {
                self.state = 'choosing-options';
            } else if (step === 3) {
                self.state = 'confirming';
            }
            // Steps 4-5 (processing/done) are not navigable
        });

        // ─── Step 1: select ─────────────────────────────────────────────────
        c.addEventListener('step-file-dropped',    function(e) { self._onDrop(e.detail); });
        c.addEventListener('step-file-selected',   function(e) { self._onFileInput(e.detail.files); });
        c.addEventListener('step-folder-selected', function(e) { self._onFolderInput(e.detail.files); });
        c.addEventListener('step-paste',           function(e) { self._onPaste(e.detail.files); });
        c.addEventListener('step-continue',        function()  { self._advanceToOptions(); });
        c.addEventListener('step-folder-upload',   function(e) { self._onFolderUpload(e.detail.options); });
        c.addEventListener('step-folder-cancel',   function()  { self._folderScan = null; self._folderName = null; self.state = 'idle'; });
        c.addEventListener('step-back-to-idle',    function()  { self._resetSelection(); self.state = 'idle'; });
        c.addEventListener('step-secret-submit',   function(e) { self._onSecretSubmit(e.detail); });

        // ─── Step 2: options (lightweight selection — no auto-advance) ──────
        c.addEventListener('step-delivery-chosen',  function(e) { self._selectedDelivery = e.detail.deliveryId; });
        c.addEventListener('step-sharemode-chosen', function(e) { self._shareMode        = e.detail.mode; });
        c.addEventListener('step-change-delivery',  function() { self.state = 'choosing-options'; });
        c.addEventListener('step-change-share',     function() { self.state = 'choosing-options'; });

        // ─── Step 3: confirm ────────────────────────────────────────────────
        c.addEventListener('step-confirmed', function() { self._startProcessing(); });
        c.addEventListener('step-shuffle-word', function(e) {
            var idx = e.detail.index;
            if (self._friendlyParts && self._friendlyParts.words[idx] !== undefined) {
                self._friendlyParts.words[idx] = UploadCrypto.randomWord();
                self._friendlyKey = UploadCrypto.formatFriendly(self._friendlyParts);
                self.state = 'confirming';
            }
        });
        c.addEventListener('step-shuffle-all', function() {
            self._friendlyParts = UploadCrypto.newFriendlyKey();
            self._friendlyKey   = UploadCrypto.formatFriendly(self._friendlyParts);
            self.state = 'confirming';
        });

        // ─── Step 5: done ───────────────────────────────────────────────────
        c.addEventListener('step-send-another',       function() { self._resetForNew(); });
        c.addEventListener('step-change-mode',        function() { if (self._els.done) self._els.done.showPicker = true; });
        c.addEventListener('step-share-mode-changed', function(e) {
            self._shareMode = e.detail.mode;
            if (self._els.done) { self._els.done.shareMode = e.detail.mode; self._els.done.showPicker = false; }
        });
        c.addEventListener('step-email-link', function() { self._openEmailLink(); });

        // ─── Universal Back ─────────────────────────────────────────────────
        c.addEventListener('step-back', function() {
            switch (self._state) {
                case 'choosing-options': self._resetSelection(); self.state = 'idle'; break;
                case 'confirming':       self.state = 'choosing-options'; break;
            }
        });
    }

    _wireNextButton() {
        var self = this;
        var nextBtn = this.querySelector('#upload-next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                if (self._state === 'choosing-options') {
                    self._selectedDelivery = self._selectedDelivery || self._recommendedDelivery || 'download';
                    self._shareMode        = self._shareMode        || 'token';
                    self.state = 'confirming';
                } else if (self._state === 'confirming') {
                    self._startProcessing();
                }
            });
        }
        var emailBtn = this.querySelector('#upload-email-btn');
        if (emailBtn) {
            emailBtn.addEventListener('click', function() { self._openEmailLink(); });
        }
    }

    // ═══ File Handlers ══════════════════════════════════════════════════════

    _onDrop(detail) {
        var items = detail.items;
        if (items && items.length === 1 && items[0].webkitGetAsEntry) {
            var entry = items[0].webkitGetAsEntry();
            if (entry && entry.isDirectory) { this._onFolderDrop(entry); return; }
        }
        var files = detail.files;
        if (files && files.length > 1) {
            this._onMultiFile(files);
        } else if (files && files.length > 0) {
            this._setFile(files[0]);
        }
    }

    _onFileInput(files) {
        if (!files || files.length === 0) return;
        if (files.length > 1) {
            this._onMultiFile(files);
        } else {
            this._setFile(files[0]);
        }
    }

    _onPaste(files) {
        if (!files || files.length === 0) return;
        if (files.length > 1) {
            this._onMultiFile(files);
        } else {
            this._setFile(files[0]);
        }
    }

    _onMultiFile(files) {
        // Multiple files → treat as folder bundle, skip file-ready
        var entries = [];
        var totalSize = 0;
        for (var i = 0; i < files.length; i++) {
            entries.push({ path: files[i].name, file: files[i], isDir: false, name: files[i].name });
            totalSize += files[i].size;
        }
        this._folderName = files.length + ' files';
        this._folderScan = { entries: entries, fileCount: entries.length, folderCount: 0, totalSize: totalSize };
        this._folderOptions = { level: 9, includeEmpty: false, includeHidden: false };
        if (this._thumbnailUrl) { URL.revokeObjectURL(this._thumbnailUrl); this._thumbnailUrl = null; }
        this.selectedFile = null;
        // Smart skip: folders/multi-file go straight to options
        this._advanceToOptions();
    }

    _onFolderInput(files) {
        if (!files || files.length === 0) return;
        var result = UploadFolder.buildFolderScan(files);
        this._folderName = result.folderName;
        this._folderScan = result.scan;
        this._folderOptions = { level: 9, includeEmpty: false, includeHidden: false };
        this.selectedFile = null;
        this._advanceToOptions();
    }

    async _onFolderDrop(directoryEntry) {
        var result = await UploadFolder.scanDirectoryEntry(directoryEntry);
        this._folderName = result.folderName;
        this._folderScan = result.scan;
        this._folderOptions = { level: 9, includeEmpty: false, includeHidden: false };
        this.selectedFile = null;
        this._advanceToOptions();
    }

    _onSecretSubmit(detail) {
        // text + config = { maxDownloads, expiresInHours }
        var text   = detail.text;
        var config = detail.config;

        // Wrap text in a File blob — same content pipeline as a regular upload
        var blob = new Blob([text], { type: 'text/plain' });
        var file = new File([blob], 'secret.txt', { type: 'text/plain' });
        this.selectedFile = file;

        // expires_at: Timestamp_Now format (int milliseconds since epoch).
        // The # fragment key never touches the server — zero-knowledge preserved.
        this._secretConfig = {
            max_downloads: config.maxDownloads,
            auto_delete:   config.maxDownloads > 0,
            expires_at:    config.expiresInHours > 0
                           ? Date.now() + (config.expiresInHours * 3600000)
                           : 0
        };
        this._shareMode        = 'token';     // Simple token — the only mode for secrets
        this._selectedDelivery = 'download';
        this._isSecretMode     = true;

        // Land on Confirm (matches the file flow). User clicks
        // "Encrypt & Upload" there to start processing.
        this.state = 'confirming';
    }

    _setFile(file) {
        this.selectedFile  = file;
        this._folderScan   = null;
        this._folderName   = null;
        if (this._thumbnailUrl) URL.revokeObjectURL(this._thumbnailUrl);
        this._thumbnailUrl = UploadFileUtils.isImageFile(file) ? URL.createObjectURL(file) : null;
        // Smart skip: go straight to Options (v0.2.6+)
        this._advanceToOptions();
    }

    _resetSelection() {
        if (this._thumbnailUrl) { URL.revokeObjectURL(this._thumbnailUrl); this._thumbnailUrl = null; }
        this.selectedFile = null;
        this._folderScan  = null;
        this._folderName  = null;
    }

    // ═══ Wizard Flow ════════════════════════════════════════════════════════

    _advanceToOptions() {
        this._deliveryOptions     = UploadFileUtils.detectDeliveryOptions(this.selectedFile, this._folderScan);
        this._recommendedDelivery = UploadFileUtils.getSmartDefault(this.selectedFile, this._folderScan);
        this._selectedDelivery    = this._recommendedDelivery;
        this.state = 'choosing-options';
    }

    _onFolderUpload(options) {
        if (options) this._folderOptions = options;
        if (this._folderScan.totalSize > UploadConstants.MAX_FILE_SIZE) {
            this.errorMessage = 'Folder too large. Maximum: ' + SendHelpers.formatBytes(UploadConstants.MAX_FILE_SIZE);
            this.state = 'error';
            return;
        }
        this._advanceToOptions();
    }

    // ═══ Upload Pipeline ════════════════════════════════════════════════════

    async _startProcessing() {
        if (!SendCrypto.isAvailable()) {
            this.errorMessage = 'Web Crypto API not available (requires HTTPS)';
            this.state = 'error';
            return;
        }
        if (!this.selectedFile && !this._folderScan) return;

        var checkSize = this._folderScan ? this._folderScan.totalSize : (this.selectedFile ? this.selectedFile.size : 0);
        if (checkSize > UploadConstants.MAX_FILE_SIZE) {
            this.errorMessage = 'File too large. Maximum: ' + SendHelpers.formatBytes(UploadConstants.MAX_FILE_SIZE);
            this.state = 'error';
            return;
        }

        // Secret mode: generate deleteAuth and its sha256 hash before the engine
        // runs. deleteAuth is a cryptographically random 32-byte token; only its
        // hash goes to the server. The kill URL carries the raw token in the
        // fragment (never sent in HTTP requests — zero-knowledge guarantee).
        if (this._isSecretMode && this._secretConfig && !this._secretConfig.delete_auth_hash) {
            var deleteAuthBytes = new Uint8Array(32);
            crypto.getRandomValues(deleteAuthBytes);
            this._deleteAuth = Array.from(deleteAuthBytes)
                .map(function(b) { return b.toString(16).padStart(2, '0'); })
                .join('');
            var enc     = new TextEncoder();
            var hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(this._deleteAuth));
            this._secretConfig.delete_auth_hash = Array.from(new Uint8Array(hashBuf))
                .map(function(b) { return b.toString(16).padStart(2, '0'); })
                .join('');

            // Signal the engine to attach secretConfig to createTransfer
            UploadEngine._pendingSecretConfig = this._secretConfig;
            UploadEngine._pendingDeleteAuth   = this._deleteAuth;
        }

        var self = this;
        try {
            this._setBeforeUnload(true);
            this._stageTimestamps = {};

            // Single file + gallery delivery → wrap in zip with thumbnails (v0.2.17)
            // Skip wrapping if the file is already a zip — treat it as a regular file
            var delivery = this._selectedDelivery || 'download';
            var fileExt  = (this.selectedFile && this.selectedFile.name || '').split('.').pop().toLowerCase();
            if (delivery === 'gallery' && !this._folderScan && this.selectedFile && fileExt !== 'zip') {
                var file = this.selectedFile;
                this._folderScan = {
                    entries:   [{ name: file.name, path: file.name, isDir: false, file: file }],
                    totalSize: file.size,
                    fileCount: 1
                };
                this._folderName = file.name.replace(/\.[^.]+$/, '') || 'file';
                this._folderOptions = this._folderOptions || { level: 4, includeEmpty: false, includeHidden: false };
            }

            if (this._folderScan) {
                this.state = 'zipping';
                this.selectedFile = await UploadFolder.compressToZip(
                    this._folderScan, this._folderName, this._folderOptions, this._selectedDelivery
                );
            }

            this.result = await UploadEngine.run({
                file:         this.selectedFile,
                shareMode:    this._shareMode,
                friendlyKey:  this._friendlyKey,
                delivery:     this._selectedDelivery || 'download',
                capabilities: this._capabilities,
                onStage:      function(stage) { self.state = stage; }
            });

            this._setBeforeUnload(false);
            this._stageTimestamps.complete = Date.now();
            this.state = 'complete';

            this.dispatchEvent(new CustomEvent('upload-complete', {
                detail: { transferId: this.result.transferId, downloadUrl: this.result.combinedUrl, key: this.result.keyString },
                bubbles: true
            }));

        } catch (err) {
            this._setBeforeUnload(false);
            if (err.message === 'ACCESS_TOKEN_INVALID') {
                document.dispatchEvent(new CustomEvent('access-token-invalid'));
                return;
            }
            if (err.message && err.message.includes('ISO-8859-1')) {
                ApiClient.clearAccessToken();
                document.dispatchEvent(new CustomEvent('access-token-invalid'));
                return;
            }
            this.errorMessage = err.message || 'Upload failed';
            this.state = 'error';
        } finally {
            // Always clear engine pending context so it never leaks into the next run
            UploadEngine._pendingSecretConfig = null;
            UploadEngine._pendingDeleteAuth   = null;
        }
    }

    // ═══ Carousel ═══════════════════════════════════════════════════════════

    _startCarousel() {
        if (this._carouselTimer) return;
        var self = this;
        var msgs = UploadConstants.CAROUSEL_MESSAGES;
        if (this._els.progress) this._els.progress.carouselMessage = msgs[this._carouselIndex];
        this._carouselTimer = setInterval(function() {
            self._carouselIndex = (self._carouselIndex + 1) % msgs.length;
            if (self._els.progress) self._els.progress.carouselMessage = msgs[self._carouselIndex];
        }, UploadConstants.CAROUSEL_INTERVAL_MS);
    }

    _stopCarousel() {
        if (this._carouselTimer) { clearInterval(this._carouselTimer); this._carouselTimer = null; }
    }

    // ═══ Utilities ══════════════════════════════════════════════════════════

    _setBeforeUnload(active) {
        if (active && !this._beforeUnloadHandler) {
            this._beforeUnloadHandler = function(e) { e.preventDefault(); e.returnValue = ''; };
            window.addEventListener('beforeunload', this._beforeUnloadHandler);
        } else if (!active && this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }
    }

    _resetForNew() {
        this._resetSelection();
        this.result              = null;
        this.errorMessage        = '';
        this._deliveryOptions    = null;
        this._recommendedDelivery= null;
        this._selectedDelivery   = null;
        this._shareMode          = 'token';
        this._friendlyParts      = null;
        this._friendlyKey        = null;
        this._stageTimestamps    = {};
        this._carouselIndex      = 0;
        this._isSecretMode       = false;
        this._secretConfig       = null;
        this._deleteAuth         = null;
        this.state = 'idle';
    }

    _openEmailLink() {
        if (!this.result) return;
        var subject = 'Encrypted file via SG/Send';
        var body;
        if (this._shareMode === 'separate') {
            // SECURITY: only include the link, NOT the key — key must travel separately
            body = "I've sent you an encrypted file via SG/Send.\n\n" +
                   "Open this link to download:\n" + (this.result.linkOnlyUrl || '') + "\n\n" +
                   "You'll need the decryption key to open it — I'll send that separately.";
        } else if (this._shareMode === 'token' && this.result.friendlyKey) {
            var tokenLink = this.result.tokenLink || this.result.combinedUrl || '';
            body = "I've sent you an encrypted file via SG/Send.\n\n" +
                   "Open this link to view it:\n" + tokenLink;
        } else {
            body = "I've sent you an encrypted file via SG/Send.\n\n" +
                   "Open this link to view it:\n" + (this.result.combinedUrl || '');
        }
        window.open('mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body), '_blank');
    }
}

customElements.define('send-upload', SendUpload);
