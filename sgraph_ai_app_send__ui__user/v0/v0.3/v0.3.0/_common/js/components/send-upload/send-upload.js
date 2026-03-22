/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Orchestrator (v0.3.0)

   Thin coordinator — owns the state machine and wires sub-components together.
   All business logic is in dedicated modules:

     UploadConstants    — step labels, state mapping, carousel, size limits
     UploadEngine       — read → encrypt → create → upload → complete pipeline
     UploadFolder       — directory scanning, JSZip compression, gallery preview
     UploadThumbnails   — image/PDF/markdown/video thumbnail generation
     UploadCrypto       — friendly keys, PBKDF2 key derivation
     UploadFileUtils    — file type detection, delivery options

   Sub-components (Shadow DOM):
     <upload-step-select>    — Step 1: file/folder selection
     <upload-step-delivery>  — Step 2: delivery mode
     <upload-step-share>     — Step 3: share mode
     <upload-step-confirm>   — Step 4: review + word picker
     <upload-step-progress>  — Step 5: encrypt & upload progress
     <upload-step-done>      — Step 6: share links + QR
   ═══════════════════════════════════════════════════════════════════════════════ */

class SendUpload extends HTMLElement {

    constructor() {
        super();
        this._state            = 'idle';
        this._mode             = 'file';
        this.selectedFile      = null;
        this.result            = null;
        this.errorMessage      = '';
        this._folderScan       = null;
        this._folderName       = null;
        this._folderOptions    = { level: 4, includeEmpty: false, includeHidden: false };
        this._deliveryOptions     = null;
        this._recommendedDelivery = null;
        this._selectedDelivery    = null;
        this._shareMode           = 'token';
        this._friendlyParts       = null;
        this._friendlyKey         = null;
        this._thumbnailUrl        = null;
        this._stageTimestamps  = {};
        this._capabilities     = null;
        this._beforeUnloadHandler = null;
        this._carouselIndex    = 0;
        this._carouselTimer    = null;
        this._els              = {};
    }

    get state()  { return this._state; }
    set state(v) { this._state = v; this._stageTimestamps[v] = Date.now(); this._render(); }

    // ═══ Lifecycle ══════════════════════════════════════════════════════════

    connectedCallback() {
        if (typeof SendStepIndicator !== 'undefined') {
            SendStepIndicator.STEP_LABELS = UploadConstants.STEP_LABELS;
        }
        this._checkCapabilities();
        this._render();
        this._wireEvents();
        this._localeHandler = () => {
            if (this._state === 'idle' || this._state === 'complete') this._render();
        };
        document.addEventListener('locale-changed', this._localeHandler);
    }

    disconnectedCallback() {
        this._stopCarousel();
        this._setBeforeUnload(false);
        document.removeEventListener('locale-changed', this._localeHandler);
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
            var names = ['select','delivery','share','confirm','progress','done'];
            var tags  = ['upload-step-select','upload-step-delivery','upload-step-share',
                         'upload-step-confirm','upload-step-progress','upload-step-done'];
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
            if (this._state === 'choosing-delivery' || this._state === 'choosing-share') {
                btnHtml = '<button class="upload-next-btn" id="upload-next-btn">Next \u2192</button>';
            } else if (this._state === 'confirming') {
                btnHtml = '<button class="upload-next-btn upload-next-btn--send" id="upload-next-btn">Encrypt & Upload \u2192</button>';
            } else if (isProc) {
                btnHtml = '<button class="upload-next-btn upload-next-btn--disabled" disabled>Encrypting\u2026</button>';
            } else if (this._state === 'complete') {
                btnHtml = '<button class="upload-next-btn" id="upload-email-btn">Email Link</button>';
            }
            actionSlot.innerHTML = btnHtml;
            this._wireNextButton();
        }

        // Show/hide sub-components
        var activeKey = this._activeComponent();
        var keys = ['select','delivery','share','confirm','progress','done','error'];
        for (var k = 0; k < keys.length; k++) {
            if (this._els[keys[k]]) this._els[keys[k]].style.display = keys[k] === activeKey ? '' : 'none';
        }
        this._syncComponent(activeKey);

        if (isProc) this._startCarousel();
        else this._stopCarousel();
    }

    _activeComponent() {
        switch (this._state) {
            case 'idle': case 'file-ready': case 'folder-options': return 'select';
            case 'choosing-delivery': return 'delivery';
            case 'choosing-share':    return 'share';
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
        if (key === 'delivery' && e.delivery) {
            e.delivery.deliveryOptions     = this._deliveryOptions;
            e.delivery.recommendedDelivery = this._recommendedDelivery;
            e.delivery.selectedDelivery    = this._selectedDelivery;
            e.delivery.fileSummary         = this._fileSummary();
        }
        if (key === 'share' && e.share) {
            e.share.shareMode = this._shareMode;
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
            e.done.result          = this.result;
            e.done.shareMode       = this._shareMode;
            e.done.fileSummary     = this._fileSummary();
            e.done.deliveryOptions = this._deliveryOptions || [];
            e.done.stageTimestamps = this._stageTimestamps;
            e.done.selectedDelivery= this._selectedDelivery;
            e.done.showPicker      = false;
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

        c.addEventListener('step-file-dropped',    function(e) { self._onDrop(e.detail); });
        c.addEventListener('step-file-selected',    function(e) { self._onFileInput(e.detail.files); });
        c.addEventListener('step-folder-selected',  function(e) { self._onFolderInput(e.detail.files); });
        c.addEventListener('step-paste',            function(e) { self._onPaste(e.detail.files); });
        c.addEventListener('step-continue',         function()  { self._advanceToDelivery(); });
        c.addEventListener('step-folder-upload',    function(e) { self._onFolderUpload(e.detail.options); });
        c.addEventListener('step-folder-cancel',    function()  { self._folderScan = null; self._folderName = null; self.state = 'idle'; });
        c.addEventListener('step-back-to-idle',     function()  { self._resetSelection(); self.state = 'idle'; });
        c.addEventListener('step-delivery-selected',function(e) { self._selectedDelivery = e.detail.deliveryId; self.state = 'choosing-share'; });
        c.addEventListener('step-share-selected',   function(e) { self._shareMode = e.detail.mode; self.state = 'confirming'; });
        c.addEventListener('step-confirmed',        function()  { self._startProcessing(); });
        c.addEventListener('step-change-delivery',  function()  { self.state = 'choosing-delivery'; });
        c.addEventListener('step-change-share',     function()  { self.state = 'choosing-share'; });
        c.addEventListener('step-shuffle-word',     function(e) {
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
        c.addEventListener('step-send-another',       function()  { self._resetForNew(); });
        c.addEventListener('step-change-mode',        function()  { if (self._els.done) self._els.done.showPicker = true; });
        c.addEventListener('step-share-mode-changed', function(e) {
            self._shareMode = e.detail.mode;
            if (self._els.done) { self._els.done.shareMode = e.detail.mode; self._els.done.showPicker = false; }
        });
        c.addEventListener('step-email-link', function() { self._openEmailLink(); });
        c.addEventListener('step-back', function() {
            switch (self._state) {
                case 'choosing-delivery': self._resetSelection(); self.state = 'idle'; break;
                case 'choosing-share':    self.state = 'choosing-delivery'; break;
                case 'confirming':        self.state = 'choosing-share'; break;
            }
        });
    }

    _wireNextButton() {
        var self = this;
        var nextBtn = this.querySelector('#upload-next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                if (self._state === 'choosing-delivery') {
                    // Advance with current default
                    self._selectedDelivery = self._selectedDelivery || self._recommendedDelivery || 'download';
                    self.state = 'choosing-share';
                } else if (self._state === 'choosing-share') {
                    self._shareMode = self._shareMode || 'token';
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
        if (detail.files && detail.files.length > 0) this._setFile(detail.files[0]);
    }

    _onFileInput(files)  { if (files && files.length > 0) this._setFile(files[0]); }
    _onPaste(files)      { if (files && files.length > 0) this._setFile(files[0]); }

    _onFolderInput(files) {
        if (!files || files.length === 0) return;
        var result = UploadFolder.buildFolderScan(files);
        this._folderName = result.folderName;
        this._folderScan = result.scan;
        this.state = 'folder-options';
    }

    async _onFolderDrop(directoryEntry) {
        var result = await UploadFolder.scanDirectoryEntry(directoryEntry);
        this._folderName = result.folderName;
        this._folderScan = result.scan;
        this.state = 'folder-options';
    }

    _setFile(file) {
        this.selectedFile  = file;
        this._folderScan   = null;
        this._folderName   = null;
        if (this._thumbnailUrl) URL.revokeObjectURL(this._thumbnailUrl);
        this._thumbnailUrl = UploadFileUtils.isImageFile(file) ? URL.createObjectURL(file) : null;
        this.state = 'file-ready';
    }

    _resetSelection() {
        if (this._thumbnailUrl) { URL.revokeObjectURL(this._thumbnailUrl); this._thumbnailUrl = null; }
        this.selectedFile = null;
        this._folderScan  = null;
        this._folderName  = null;
    }

    // ═══ Wizard Flow ════════════════════════════════════════════════════════

    _advanceToDelivery() {
        this._deliveryOptions     = UploadFileUtils.detectDeliveryOptions(this.selectedFile, this._folderScan);
        this._recommendedDelivery = UploadFileUtils.getSmartDefault(this.selectedFile, this._folderScan);
        this._selectedDelivery    = this._recommendedDelivery;
        this.state = 'choosing-delivery';
    }

    _onFolderUpload(options) {
        if (options) this._folderOptions = options;
        if (this._folderScan.totalSize > UploadConstants.MAX_FILE_SIZE) {
            this.errorMessage = 'Folder too large. Maximum: ' + SendHelpers.formatBytes(UploadConstants.MAX_FILE_SIZE);
            this.state = 'error';
            return;
        }
        this._advanceToDelivery();
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

        var self = this;
        try {
            this._setBeforeUnload(true);
            this._stageTimestamps = {};

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
        this.result             = null;
        this.errorMessage       = '';
        this._deliveryOptions   = null;
        this._recommendedDelivery = null;
        this._selectedDelivery  = null;
        this._shareMode         = 'token';
        this._friendlyParts     = null;
        this._friendlyKey       = null;
        this._stageTimestamps   = {};
        this._carouselIndex     = 0;
        this.state = 'idle';
    }

    _openEmailLink() {
        if (!this.result) return;
        var body = "I've sent you an encrypted file via SG/Send.\n\nOpen this link to download:\n" + (this.result.combinedUrl || '');
        window.open('mailto:?subject=' + encodeURIComponent('Secure file for you') + '&body=' + encodeURIComponent(body));
    }
}

customElements.define('send-upload', SendUpload);
