/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — Upload Orchestrator (v0.3.0)
   Clean rewrite — delegates rendering to Shadow DOM sub-components,
   keeps all business logic (upload engine, crypto, SGMETA, thumbnails).

   Sub-components (Shadow DOM):
     <upload-step-select>    — Step 1: File/folder selection, drag-drop, paste
     <upload-step-delivery>  — Step 2: Delivery mode (download/view/browse/gallery)
     <upload-step-share>     — Step 3: Share mode (token/combined/separate)
     <upload-step-confirm>   — Step 4: Review + word picker + encrypt button
     <upload-step-progress>  — Step 5: Encrypt & upload progress with carousel
     <upload-step-done>      — Step 6: Share links, QR, send another

   Shared utilities:
     upload-crypto.js        — Friendly key generation, PBKDF2 derivation
     upload-file-utils.js    — File type detection, delivery options
   ═══════════════════════════════════════════════════════════════════════════════ */

// ─── Thumbnail constants ────────────────────────────────────────────────────
var THUMB_MAX_WIDTH = 400;
var THUMB_HEIGHT    = 520;
var THUMB_QUALITY   = 0.75;
var THUMB_FORMAT    = 'image/jpeg';

var IMAGE_EXTS = ['png','jpg','jpeg','gif','webp','bmp','svg'];
var PDF_EXTS   = ['pdf'];
var MD_EXTS    = ['md','markdown'];
var VIDEO_EXTS = ['mp4','webm','mov','avi','mkv'];
var AUDIO_EXTS = ['mp3','wav','ogg','flac','aac','m4a'];

function _getExt(name)  { return (name || '').split('.').pop().toLowerCase(); }
function _fileId(index) { var n = String(index+1); while(n.length<3) n='0'+n; return 'file-'+n; }
function _getFileCategory(name) {
    var ext = _getExt(name);
    if (IMAGE_EXTS.indexOf(ext) !== -1) return 'image';
    if (PDF_EXTS.indexOf(ext)   !== -1) return 'pdf';
    if (MD_EXTS.indexOf(ext)    !== -1) return 'markdown';
    if (VIDEO_EXTS.indexOf(ext) !== -1) return 'video';
    if (AUDIO_EXTS.indexOf(ext) !== -1) return 'audio';
    return 'other';
}

// ─── Carousel messages ──────────────────────────────────────────────────────
var CAROUSEL_MESSAGES = [
    { icon: '\uD83D\uDD12', text: 'Your file is encrypted with AES-256-GCM. The key never leaves your device.' },
    { icon: '\uD83D\uDEE1\uFE0F', text: "Even we can't read what you're uploading. That's the point." },
    { icon: '\uD83C\uDF6A', text: 'Zero cookies. Zero tracking. Verify: open DevTools \u2192 Application \u2192 Cookies.' },
    { icon: '\uD83C\uDFD4\uFE0F', text: 'Tip: Share the code by voice, the link by text \u2014 different channels, maximum security.' },
    { icon: '\uD83D\uDCDC', text: 'Our privacy policy is six sentences. No lawyers needed.' },
    { icon: '\uD83D\uDD11', text: 'The decryption key is only in your browser. We never see it, store it, or transmit it.' },
    { icon: '\u2705', text: 'No account required. No email collected. Just encrypted file sharing.' },
    { icon: '\uD83D\uDD2C', text: "Don't trust us \u2014 verify. Open the Network tab and inspect every request we make." },
    { icon: '\uD83C\uDF0D', text: 'Available in 17 languages. Same zero-knowledge encryption everywhere.' },
    { icon: '\uD83D\uDCE6', text: 'Files are split into encrypted chunks. Each chunk is meaningless without your key.' }
];
var CAROUSEL_INTERVAL_MS = 4000;

// ─── PDF.js lazy loader ─────────────────────────────────────────────────────
var _pdfJsLoaded = false, _pdfJsLoading = null;
var PDF_JS_CDNS = [
    { js: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' },
    { js: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
      worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js' }
];
function _loadPdfJs() {
    if (_pdfJsLoaded && window.pdfjsLib) return Promise.resolve();
    if (_pdfJsLoading) return _pdfJsLoading;
    _pdfJsLoading = new Promise(function(resolve, reject) {
        if (window.pdfjsLib) { _pdfJsLoaded = true; resolve(); return; }
        function tryLoad(urls, idx) {
            if (idx >= urls.length) { reject(new Error('Failed to load pdf.js')); return; }
            var entry = urls[idx], script = document.createElement('script');
            script.src = entry.js;
            script.onload = function() {
                if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = entry.worker; _pdfJsLoaded = true; resolve(); }
                else tryLoad(urls, idx + 1);
            };
            script.onerror = function() { tryLoad(urls, idx + 1); };
            document.head.appendChild(script);
        }
        tryLoad(PDF_JS_CDNS, 0);
    });
    return _pdfJsLoading;
}

// ─── Step labels and state mapping ──────────────────────────────────────────
var STEP_LABELS   = ['Upload', 'Delivery', 'Share mode', 'Confirm', 'Encrypt & Upload', 'Done'];
var TOTAL_STEPS   = 6;
var STATE_TO_STEP = {
    'idle': 1, 'folder-options': 1, 'file-ready': 1,
    'choosing-delivery': 2, 'choosing-share': 3, 'confirming': 4,
    'zipping': 5, 'reading': 5, 'encrypting': 5, 'creating': 5, 'uploading': 5, 'completing': 5,
    'complete': 6, 'error': 1
};

// ═══════════════════════════════════════════════════════════════════════════════
// SendUpload — Orchestrator Web Component
// ═══════════════════════════════════════════════════════════════════════════════

class SendUpload extends HTMLElement {

    static SGMETA_MAGIC           = new Uint8Array([0x53, 0x47, 0x4D, 0x45, 0x54, 0x41]);
    static MAX_FILE_SIZE_DIRECT   = 5 * 1024 * 1024;
    static MAX_FILE_SIZE_PRESIGNED= 10 * 1024 * 1024 * 1024;
    static MAX_FILE_SIZE          = 5 * 1024 * 1024;
    static PARALLEL_UPLOADS       = 5;
    static CAROUSEL_MESSAGES      = CAROUSEL_MESSAGES;

    constructor() {
        super();
        // ── State ───────────────────────────────────────────────────────
        this._state            = 'idle';
        this._mode             = 'file';           // 'file' or 'text'
        this.selectedFile      = null;
        this.result            = null;
        this.errorMessage      = '';

        // ── Folder state ────────────────────────────────────────────────
        this._folderScan       = null;
        this._folderName       = null;
        this._folderOptions    = { level: 4, includeEmpty: false, includeHidden: false };

        // ── Wizard state ────────────────────────────────────────────────
        this._deliveryOptions     = null;
        this._recommendedDelivery = null;
        this._selectedDelivery    = null;
        this._shareMode           = 'token';
        this._friendlyParts       = null;
        this._friendlyKey         = null;
        this._thumbnailUrl        = null;

        // ── Upload state ────────────────────────────────────────────────
        this._stageTimestamps  = {};
        this._capabilities     = null;
        this._beforeUnloadHandler = null;

        // ── Carousel ────────────────────────────────────────────────────
        this._carouselIndex    = 0;
        this._carouselTimer    = null;

        // ── Sub-component refs ──────────────────────────────────────────
        this._els = {};
    }

    // ─── State property (triggers render) ───────────────────────────────
    get state()  { return this._state; }
    set state(v) {
        this._state = v;
        this._stageTimestamps[v] = Date.now();
        this._render();
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────

    connectedCallback() {
        // Update step indicator labels
        if (typeof SendStepIndicator !== 'undefined') {
            SendStepIndicator.STEP_LABELS = STEP_LABELS;
        }
        // Check upload capabilities
        this._checkCapabilities();
        // Initial render
        this._render();
        this._wireEvents();
        // Locale changes
        this._localeHandler = () => { if (this._state === 'idle' || this._state === 'complete') this._render(); };
        document.addEventListener('locale-changed', this._localeHandler);
    }

    disconnectedCallback() {
        this._stopCarousel();
        this._setBeforeUnload(false);
        document.removeEventListener('locale-changed', this._localeHandler);
    }

    // ─── Capabilities ───────────────────────────────────────────────────

    async _checkCapabilities() {
        try {
            var caps = await ApiClient.getCapabilities();
            this._capabilities = caps;
            SendUpload.MAX_FILE_SIZE = caps.multipart_upload
                ? SendUpload.MAX_FILE_SIZE_PRESIGNED
                : SendUpload.MAX_FILE_SIZE_DIRECT;
            // Update select step's max size
            if (this._els.select) this._els.select.maxFileSize = SendUpload.MAX_FILE_SIZE;
        } catch (e) { /* default to direct */ }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Rendering — show/hide sub-components
    // ═══════════════════════════════════════════════════════════════════════

    _render() {
        var step    = STATE_TO_STEP[this._state] || 1;
        var isProcessing = ['zipping','reading','encrypting','creating','uploading','completing'].indexOf(this._state) !== -1;

        // Build the shell if first render
        if (!this._els.select) {
            this.innerHTML =
                '<div class="card">' +
                    '<send-step-indicator step="' + step + '" total="' + TOTAL_STEPS + '"></send-step-indicator>' +
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
            // Error container
            var errDiv = document.createElement('div');
            errDiv.className = 'status status--error';
            errDiv.style.display = 'none';
            container.appendChild(errDiv);
            this._els.error = errDiv;

            this._wireEvents();
        }

        // Update step indicator
        var indicator = this.querySelector('send-step-indicator');
        if (indicator) {
            indicator.setAttribute('step', step);
            indicator.setAttribute('total', TOTAL_STEPS);
        }

        // Show/hide sub-components
        var activeKey = this._stateToComponent();
        var keys = ['select','delivery','share','confirm','progress','done','error'];
        for (var k = 0; k < keys.length; k++) {
            if (this._els[keys[k]]) {
                this._els[keys[k]].style.display = keys[k] === activeKey ? '' : 'none';
            }
        }

        // Push data to active component
        this._updateActiveComponent(activeKey);

        // Carousel management
        if (isProcessing) this._startCarousel();
        else this._stopCarousel();
    }

    _stateToComponent() {
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

    _updateActiveComponent(key) {
        var e = this._els;
        switch (key) {
            case 'select':
                if (e.select) {
                    e.select.state       = this._state === 'file-ready' ? 'file-ready'
                                         : this._state === 'folder-options' ? 'folder-options' : 'idle';
                    e.select.selectedFile = this.selectedFile;
                    e.select.folderScan   = this._folderScan;
                    e.select.folderName   = this._folderName;
                    e.select.folderOptions= this._folderOptions;
                    e.select.maxFileSize  = SendUpload.MAX_FILE_SIZE;
                    e.select.thumbnailUrl = this._thumbnailUrl;
                }
                break;
            case 'delivery':
                if (e.delivery) {
                    var fileSummary = this._buildFileSummary();
                    e.delivery.deliveryOptions     = this._deliveryOptions;
                    e.delivery.recommendedDelivery = this._recommendedDelivery;
                    e.delivery.selectedDelivery    = this._selectedDelivery;
                    e.delivery.fileSummary          = fileSummary;
                }
                break;
            case 'share':
                if (e.share) {
                    e.share.shareMode = this._shareMode;
                }
                break;
            case 'confirm':
                if (e.confirm) {
                    var fs = this._buildFileSummary();
                    var deliveryOpt = this._deliveryOptions
                        ? this._deliveryOptions.find(function(o) { return o.id === this._selectedDelivery; }.bind(this))
                        : null;
                    var shareModes = UploadCrypto.SHARE_MODES;
                    var shareModeConfig = shareModes.find(function(m) { return m.id === this._shareMode; }.bind(this));
                    if (!this._friendlyParts && this._shareMode === 'token') {
                        this._friendlyParts = UploadCrypto.newFriendlyKey();
                        this._friendlyKey   = UploadCrypto.formatFriendly(this._friendlyParts);
                    }
                    e.confirm.fileSummary       = fs;
                    e.confirm.deliveryOption     = deliveryOpt || null;
                    e.confirm.shareModeConfig    = shareModeConfig || null;
                    e.confirm.shareMode          = this._shareMode;
                    e.confirm.friendlyParts      = this._friendlyParts;
                    e.confirm.friendlyKey        = this._friendlyKey;
                    e.confirm.fileSize           = this.selectedFile ? this.selectedFile.size : 0;
                    e.confirm.showThumbnailNote  = this._selectedDelivery === 'gallery';
                }
                break;
            case 'progress':
                if (e.progress) {
                    e.progress.stage           = this._state;
                    e.progress.stageTimestamps = this._stageTimestamps;
                }
                break;
            case 'done':
                if (e.done && this.result) {
                    var fs2 = this._buildFileSummary();
                    e.done.result          = this.result;
                    e.done.shareMode       = this._shareMode;
                    e.done.fileSummary     = fs2;
                    e.done.deliveryOptions = this._deliveryOptions || [];
                    e.done.stageTimestamps = this._stageTimestamps;
                    e.done.selectedDelivery= this._selectedDelivery;
                    e.done.showPicker      = false;
                }
                break;
            case 'error':
                if (e.error) {
                    e.error.textContent = this.errorMessage;
                    e.error.style.display = '';
                }
                break;
        }
    }

    // ─── Helpers ────────────────────────────────────────────────────────

    _buildFileSummary() {
        return UploadFileUtils.buildFileSummary(
            this.selectedFile, this._folderScan, this._folderName,
            SendHelpers.formatBytes, SendHelpers.escapeHtml
        );
    }

    _t(key, params) { return (typeof I18n !== 'undefined') ? I18n.t(key, params) : key; }

    // ═══════════════════════════════════════════════════════════════════════
    // Event Wiring — listen to sub-component custom events
    // ═══════════════════════════════════════════════════════════════════════

    _wireEvents() {
        var self = this;
        var container = this.querySelector('.step-content');
        if (!container || container._eventsWired) return;
        container._eventsWired = true;

        // ── Step 1: Select ──────────────────────────────────────────────
        container.addEventListener('step-file-dropped', function(e)  { self._handleDrop(e.detail); });
        container.addEventListener('step-file-selected', function(e) { self._handleFileInput(e.detail.files); });
        container.addEventListener('step-folder-selected', function(e) { self._handleFolderInput(e.detail.files); });
        container.addEventListener('step-paste', function(e)         { self._handlePaste(e.detail.files); });
        container.addEventListener('step-continue', function()       { self._advanceToDelivery(); });
        container.addEventListener('step-folder-upload', function(e) { self._startFolderZip(e.detail.options); });
        container.addEventListener('step-folder-cancel', function()  { self._folderScan = null; self._folderName = null; self.state = 'idle'; });
        container.addEventListener('step-back-to-idle', function()   { self._resetSelection(); self.state = 'idle'; });

        // ── Step 2: Delivery ────────────────────────────────────────────
        container.addEventListener('step-delivery-selected', function(e) {
            self._selectedDelivery = e.detail.deliveryId;
            self.state = 'choosing-share';
        });

        // ── Step 3: Share ───────────────────────────────────────────────
        container.addEventListener('step-share-selected', function(e) {
            self._shareMode = e.detail.mode;
            self.state = 'confirming';
        });

        // ── Step 4: Confirm ─────────────────────────────────────────────
        container.addEventListener('step-confirmed', function()      { self._startProcessing(); });
        container.addEventListener('step-change-delivery', function(){ self.state = 'choosing-delivery'; });
        container.addEventListener('step-change-share', function()   { self.state = 'choosing-share'; });
        container.addEventListener('step-shuffle-word', function(e)  {
            var idx = e.detail.index;
            if (self._friendlyParts && self._friendlyParts.words[idx] !== undefined) {
                self._friendlyParts.words[idx] = UploadCrypto.randomWord();
                self._friendlyKey = UploadCrypto.formatFriendly(self._friendlyParts);
                self.state = 'confirming'; // re-render
            }
        });
        container.addEventListener('step-shuffle-all', function() {
            self._friendlyParts = UploadCrypto.newFriendlyKey();
            self._friendlyKey   = UploadCrypto.formatFriendly(self._friendlyParts);
            self.state = 'confirming';
        });

        // ── Step 5: Progress — no events (display only) ─────────────────

        // ── Step 6: Done ────────────────────────────────────────────────
        container.addEventListener('step-send-another', function()   { self._resetForNew(); });
        container.addEventListener('step-change-mode', function()    {
            if (self._els.done) self._els.done.showPicker = true;
        });
        container.addEventListener('step-share-mode-changed', function(e) {
            self._shareMode = e.detail.mode;
            if (self._els.done) { self._els.done.shareMode = e.detail.mode; self._els.done.showPicker = false; }
        });
        container.addEventListener('step-email-link', function()     { self._openEmailLink(); });

        // ── Back navigation (shared across steps) ───────────────────────
        container.addEventListener('step-back', function() {
            switch (self._state) {
                case 'choosing-delivery': self.state = 'file-ready'; break;
                case 'choosing-share':    self.state = 'choosing-delivery'; break;
                case 'confirming':        self.state = 'choosing-share'; break;
                default: break;
            }
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // File Selection Handlers
    // ═══════════════════════════════════════════════════════════════════════

    _handleDrop(detail) {
        var files = detail.files;
        var items = detail.items;
        // Check for folder drop via webkitGetAsEntry
        if (items && items.length === 1 && items[0].webkitGetAsEntry) {
            var entry = items[0].webkitGetAsEntry();
            if (entry && entry.isDirectory) {
                this._handleFolderEntry(entry);
                return;
            }
        }
        if (files && files.length > 0) {
            this._setFile(files[0]);
        }
    }

    _handleFileInput(files) {
        if (files && files.length > 0) this._setFile(files[0]);
    }

    _handleFolderInput(files) {
        if (!files || files.length === 0) return;
        // Build folder scan from input files
        var entries = [];
        var folderName = '';
        for (var i = 0; i < files.length; i++) {
            var f = files[i];
            var path = f.webkitRelativePath || f.name;
            if (!folderName && path.indexOf('/') > 0) folderName = path.split('/')[0];
            entries.push({ path: path, file: f, isDir: false, name: f.name });
        }
        this._folderName = folderName || 'folder';
        this._folderScan = {
            entries:     entries,
            fileCount:   entries.length,
            folderCount: 0,
            totalSize:   entries.reduce(function(s, e) { return s + (e.file ? e.file.size : 0); }, 0)
        };
        this.state = 'folder-options';
    }

    _handlePaste(files) {
        if (files && files.length > 0) this._setFile(files[0]);
    }

    _setFile(file) {
        this.selectedFile  = file;
        this._folderScan   = null;
        this._folderName   = null;
        this._thumbnailUrl = null;
        // Generate image thumbnail for preview
        if (UploadFileUtils.isImageFile(file)) {
            this._thumbnailUrl = URL.createObjectURL(file);
        }
        this.state = 'file-ready';
    }

    _resetSelection() {
        if (this._thumbnailUrl) { URL.revokeObjectURL(this._thumbnailUrl); this._thumbnailUrl = null; }
        this.selectedFile = null;
        this._folderScan  = null;
        this._folderName  = null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Folder Entry (from drag-drop)
    // ═══════════════════════════════════════════════════════════════════════

    async _handleFolderEntry(directoryEntry) {
        this._folderName = directoryEntry.name;
        var entries = await this._readDirectoryTree(directoryEntry);
        this._folderScan = {
            entries:     entries,
            fileCount:   entries.filter(function(e) { return !e.isDir; }).length,
            folderCount: entries.filter(function(e) { return e.isDir; }).length,
            totalSize:   entries.reduce(function(s, e) { return s + (e.file ? e.file.size : 0); }, 0)
        };
        this.state = 'folder-options';
    }

    async _readDirectoryTree(dirEntry) {
        var results = [];
        var readEntries = function(dir, path) {
            return new Promise(function(resolve, reject) {
                var reader = dir.createReader();
                var all = [];
                var readBatch = function() {
                    reader.readEntries(async function(entries) {
                        if (entries.length === 0) {
                            for (var i = 0; i < all.length; i++) {
                                var e = all[i];
                                if (e.isFile) {
                                    try {
                                        var file = await new Promise(function(res, rej) { e.file(res, rej); });
                                        results.push({ path: path + e.name, file: file, isDir: false, name: e.name });
                                    } catch (err) { /* skip */ }
                                } else if (e.isDirectory) {
                                    results.push({ path: path + e.name + '/', file: null, isDir: true, name: e.name });
                                    await readEntries(e, path + e.name + '/');
                                }
                            }
                            resolve();
                        } else {
                            all.push.apply(all, entries);
                            readBatch();
                        }
                    }, reject);
                };
                readBatch();
            });
        };
        await readEntries(dirEntry, '');
        return results;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Step Advancement
    // ═══════════════════════════════════════════════════════════════════════

    _advanceToDelivery() {
        var file       = this.selectedFile;
        var folderScan = this._folderScan;
        this._deliveryOptions     = UploadFileUtils.detectDeliveryOptions(file, folderScan);
        this._recommendedDelivery = UploadFileUtils.getRecommendedDelivery(this._deliveryOptions, folderScan);
        this._selectedDelivery    = this._recommendedDelivery;
        this.state = 'choosing-delivery';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Upload Engine
    // ═══════════════════════════════════════════════════════════════════════

    async _startProcessing() {
        if (!SendCrypto.isAvailable()) {
            this.errorMessage = this._t('crypto.error.unavailable');
            this.state = 'error';
            return;
        }
        if (!this.selectedFile && !this._folderScan) return;

        var checkSize = this._folderScan ? this._folderScan.totalSize : (this.selectedFile ? this.selectedFile.size : 0);
        if (checkSize > SendUpload.MAX_FILE_SIZE) {
            this.errorMessage = this._t('upload.error.file_too_large', { limit: SendHelpers.formatBytes(SendUpload.MAX_FILE_SIZE) });
            this.state = 'error';
            return;
        }

        try {
            this._setBeforeUnload(true);
            this._stageTimestamps = {};

            // Compress folder if needed
            if (this._folderScan) {
                this.state = 'zipping';
                await this._compressFolder();
            }

            // Read file
            var file = this.selectedFile;
            this.state = 'reading';
            var rawContent  = await this._readFileAsArrayBuffer(file);
            var contentType = file.type || 'application/octet-stream';
            var plaintext   = this._packageWithMetadata(rawContent, { filename: file.name });
            var fileSizeBytes = plaintext.byteLength;

            // Encrypt
            this.state = 'encrypting';
            var key, keyString;
            if (this._shareMode === 'token' && this._friendlyKey) {
                key       = await UploadCrypto.deriveKeyFromFriendly(this._friendlyKey);
                keyString = await SendCrypto.exportKey(key);
            } else {
                key       = await SendCrypto.generateKey();
                keyString = await SendCrypto.exportKey(key);
            }
            var encrypted = await SendCrypto.encryptFile(key, plaintext);

            // Create transfer
            this.state = 'creating';
            var createResult;
            if (this._shareMode === 'token' && this._friendlyKey) {
                var derivedId = await UploadCrypto.deriveTransferId(this._friendlyKey);
                createResult  = await this._createTransferWithId(fileSizeBytes, contentType, derivedId);
            } else {
                createResult = await ApiClient.createTransfer(fileSizeBytes, contentType);
            }

            // Upload
            this.state = 'uploading';
            var usePresigned = encrypted.byteLength > SendUpload.MAX_FILE_SIZE_DIRECT
                            && this._capabilities && this._capabilities.multipart_upload;
            if (usePresigned) {
                await this._uploadViaPresigned(createResult.transfer_id, encrypted);
            } else {
                await ApiClient.uploadPayload(createResult.transfer_id, encrypted);
            }

            // Complete
            this.state = 'completing';
            var completeResult = await ApiClient.completeTransfer(createResult.transfer_id);

            // Build result
            var delivery   = this._selectedDelivery || 'download';
            var combinedUrl = this._buildUrl(createResult.transfer_id, keyString, delivery);
            var linkOnlyUrl = this._buildLinkOnlyUrl(createResult.transfer_id);

            this.result = {
                transferId:   createResult.transfer_id,
                combinedUrl:  combinedUrl,
                linkOnlyUrl:  linkOnlyUrl,
                keyString:    keyString,
                friendlyKey:  (this._shareMode === 'token') ? this._friendlyKey : null,
                delivery:     delivery,
                isText:       false,
                transparency: completeResult.transparency || null
            };

            this._setBeforeUnload(false);
            this._stageTimestamps.complete = Date.now();
            this.state = 'complete';

            this.dispatchEvent(new CustomEvent('upload-complete', {
                detail: { transferId: createResult.transfer_id, downloadUrl: combinedUrl, key: keyString },
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
            this.errorMessage = err.message || this._t('upload.error.upload_failed');
            this.state = 'error';
        }
    }

    // ─── Create transfer with deterministic ID (token mode) ─────────────

    async _createTransferWithId(fileSize, contentType, transferId) {
        var fetchFn = typeof ApiClient._fetch === 'function'
            ? ApiClient._fetch.bind(ApiClient)
            : function(path, opts) { return fetch(path, opts); };
        var res = await fetchFn('/api/transfers/create', {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json' }, ApiClient._authHeaders()),
            body: JSON.stringify({
                file_size_bytes:   fileSize,
                content_type_hint: contentType || 'application/octet-stream',
                transfer_id:       transferId
            })
        });
        if (!res.ok) {
            if (res.status === 401) throw new Error('ACCESS_TOKEN_INVALID');
            if (res.status === 409) throw new Error('Transfer ID collision — please retry');
            throw new Error('Create transfer failed: ' + res.status);
        }
        return res.json();
    }

    // ─── Presigned Multipart Upload ─────────────────────────────────────

    async _uploadViaPresigned(transferId, encrypted) {
        var partSize = (this._capabilities && this._capabilities.max_part_size) || (10 * 1024 * 1024);
        var numParts = Math.ceil(encrypted.byteLength / partSize);
        var initResult = await ApiClient.initiateMultipart(transferId, encrypted.byteLength, numParts);
        var uploadId   = initResult.upload_id;
        var partUrls   = initResult.part_urls;

        try {
            var completedParts = new Array(partUrls.length);
            var partsCompleted = 0;
            var self = this;

            var uploadOnePart = async function(i) {
                var start  = i * partSize;
                var end    = Math.min(start + partSize, encrypted.byteLength);
                var partBuf= encrypted.slice(start, end);
                var etag   = await ApiClient.uploadPart(partUrls[i].upload_url, partBuf);
                completedParts[i] = { part_number: partUrls[i].part_number, etag: etag };
                partsCompleted++;
            };

            var active  = new Set();
            var maxPool = SendUpload.PARALLEL_UPLOADS;
            for (var i = 0; i < partUrls.length; i++) {
                var p = uploadOnePart(i).then(function() { active.delete(p); });
                active.add(p);
                if (active.size >= maxPool) await Promise.race(active);
            }
            await Promise.all(active);
            await ApiClient.completeMultipart(transferId, uploadId, completedParts);
        } catch (err) {
            try { await ApiClient.abortMultipart(transferId, uploadId); } catch (e) { /* ignore */ }
            throw err;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Folder Compression + Gallery Thumbnails
    // ═══════════════════════════════════════════════════════════════════════

    async _startFolderZip(options) {
        if (options) this._folderOptions = options;
        var totalSize = this._folderScan.totalSize;
        if (totalSize > SendUpload.MAX_FILE_SIZE) {
            this.errorMessage = this._t('upload.folder.error_too_large', { limit: SendHelpers.formatBytes(SendUpload.MAX_FILE_SIZE) });
            this.state = 'error';
            return;
        }
        // Feed directly into processing pipeline
        this._advanceToDelivery();
    }

    async _compressFolder() {
        await this._loadJSZip();
        var opts    = this._folderOptions || {};
        var entries = this._folderScan.entries.filter(function(e) {
            if (!opts.includeHidden && e.name.startsWith('.')) return false;
            if (e.isDir && !opts.includeEmpty) return false;
            return true;
        });

        var zip = new JSZip();
        for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            if (entry.isDir) { zip.folder(entry.path); }
            else if (entry.file) {
                var buf = await entry.file.arrayBuffer();
                zip.file(entry.path, buf, {
                    compression: (opts.level || 4) > 0 ? 'DEFLATE' : 'STORE',
                    compressionOptions: { level: opts.level || 4 }
                });
            }
        }

        // Gallery thumbnails
        var delivery = this._selectedDelivery || 'download';
        if (delivery === 'gallery') {
            await this._addPreviewToZip(zip, entries.filter(function(e) { return !e.isDir; }));
        }

        var blob    = await zip.generateAsync({ type: 'blob' });
        var zipName = (this._folderName || 'folder') + '.zip';
        this.selectedFile = new File([blob], zipName, { type: 'application/zip' });
    }

    async _loadJSZip() {
        if (typeof JSZip !== 'undefined') return;
        return new Promise(function(resolve, reject) {
            var script   = document.createElement('script');
            var basePath = (typeof SendComponentPaths !== 'undefined' && SendComponentPaths.base) || '../_common';
            script.src   = basePath + '/js/vendor/jszip.min.js';
            script.onload  = resolve;
            script.onerror = function() { reject(new Error('Failed to load JSZip')); };
            document.head.appendChild(script);
        });
    }

    // ─── Gallery preview generation ─────────────────────────────────────

    async _addPreviewToZip(zip, fileEntries) {
        var files = fileEntries.filter(function(e) { return e.file; });
        if (files.length === 0) return;

        // Compute content hashes
        var fileHashes = [];
        for (var h = 0; h < files.length; h++) {
            try { fileHashes.push(await _computeFileHash(files[h].file)); }
            catch (e) { fileHashes.push('0000000000000000'); }
        }
        var folderHash = await _computeFolderHash(fileHashes);
        var previewDir = '_gallery.' + folderHash;

        // Load PDF.js if needed
        var hasPdfs = files.some(function(e) { return _getFileCategory(e.name) === 'pdf'; });
        if (hasPdfs) {
            try { await _loadPdfJs(); }
            catch (e) { hasPdfs = false; }
        }

        // Generate thumbnails + metadata
        var manifest = {
            version: '0.2', preview_enabled: true, generated_at: new Date().toISOString(),
            folder_hash: folderHash, thumbnail_max_width: THUMB_MAX_WIDTH,
            thumbnail_format: THUMB_FORMAT, thumbnail_quality: THUMB_QUALITY,
            total_files: files.length, file_hashes: {}, files: []
        };
        var thumbnailsGenerated = 0;
        var self = this;

        for (var i = 0; i < files.length; i++) {
            var entry    = files[i];
            var id       = _fileId(i);
            var category = _getFileCategory(entry.name);
            var meta = {
                id: id, name: entry.name, path: entry.path, type: category,
                extension: _getExt(entry.name), size: entry.file.size,
                mime: entry.file.type || 'application/octet-stream', hash: fileHashes[i]
            };
            var manifestEntry = {
                id: id, name: entry.name, path: entry.path, type: category,
                size: entry.file.size, hash: fileHashes[i], thumbnail: null,
                metadata: previewDir + '/metadata/' + id + '.meta.json'
            };
            manifest.file_hashes[id] = fileHashes[i];

            // Generate thumbnail per type
            try {
                var thumbResult = null, thumbExt = 'jpg';
                if (category === 'image') {
                    thumbResult = await self._generateImageThumbnail(entry.file);
                    thumbExt = _getExt(entry.name) === 'svg' ? 'svg' : 'jpg';
                    meta.dimensions = { width: thumbResult.originalWidth, height: thumbResult.originalHeight };
                } else if (category === 'pdf' && hasPdfs) {
                    thumbResult = await _generatePdfThumbnail(entry.file);
                    meta.pageCount = thumbResult.pageCount;
                } else if (category === 'markdown') {
                    thumbResult = await _generateMarkdownThumbnail(entry.file);
                    meta.textLength = thumbResult.textLen;
                } else if (category === 'video') {
                    thumbResult = await _generateVideoThumbnail(entry.file);
                    meta.duration = thumbResult.duration;
                    meta.dimensions = { width: thumbResult.videoW, height: thumbResult.videoH };
                } else if (category === 'audio') {
                    var audioMeta = await _extractAudioMetadata(entry.file);
                    meta.duration = audioMeta.duration;
                }
                if (thumbResult && thumbResult.buffer) {
                    var thumbPath = previewDir + '/thumbnails/' + id + '.thumb.' + thumbExt;
                    zip.file(thumbPath, thumbResult.buffer);
                    meta.thumbnail = { path: thumbPath, width: thumbResult.width, height: thumbResult.height, format: THUMB_FORMAT, size: thumbResult.buffer.byteLength };
                    manifestEntry.thumbnail = thumbPath;
                    thumbnailsGenerated++;
                }
            } catch (e) { /* skip failed thumbnails */ }

            zip.file(previewDir + '/metadata/' + id + '.meta.json', JSON.stringify(meta, null, 2));
            manifest.files.push(manifestEntry);
        }

        manifest.thumbnails_generated = thumbnailsGenerated;
        zip.file(previewDir + '/_manifest.json', JSON.stringify(manifest, null, 2));
    }

    // ─── Image thumbnail (canvas resize) ────────────────────────────────

    _generateImageThumbnail(file) {
        return new Promise(function(resolve, reject) {
            if (_getExt(file.name) === 'svg') {
                file.arrayBuffer().then(function(buf) {
                    resolve({ buffer: buf, width: THUMB_MAX_WIDTH, height: THUMB_MAX_WIDTH, format: 'image/svg+xml', originalWidth: 0, originalHeight: 0 });
                }).catch(reject);
                return;
            }
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onload = function() {
                var origW = img.naturalWidth, origH = img.naturalHeight;
                var scale = Math.min(1, THUMB_MAX_WIDTH / origW);
                var w = Math.round(origW * scale), h = Math.round(origH * scale);
                var canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                URL.revokeObjectURL(url);
                canvas.toBlob(function(blob) {
                    if (!blob) { reject(new Error('toBlob failed')); return; }
                    blob.arrayBuffer().then(function(buf) {
                        resolve({ buffer: buf, width: w, height: h, format: THUMB_FORMAT, originalWidth: origW, originalHeight: origH });
                    }).catch(reject);
                }, THUMB_FORMAT, THUMB_QUALITY);
            };
            img.onerror = function() { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
            img.src = url;
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SGMETA + Helpers
    // ═══════════════════════════════════════════════════════════════════════

    _packageWithMetadata(contentBuffer, metadata) {
        var magic    = SendUpload.SGMETA_MAGIC;
        var metaBytes= new TextEncoder().encode(JSON.stringify(metadata));
        var metaLen  = metaBytes.length;
        var result   = new Uint8Array(magic.length + 4 + metaLen + contentBuffer.byteLength);
        result.set(magic, 0);
        result[magic.length]     = (metaLen >> 24) & 0xFF;
        result[magic.length + 1] = (metaLen >> 16) & 0xFF;
        result[magic.length + 2] = (metaLen >> 8) & 0xFF;
        result[magic.length + 3] = metaLen & 0xFF;
        result.set(metaBytes, magic.length + 4);
        result.set(new Uint8Array(contentBuffer), magic.length + 4 + metaLen);
        return result.buffer;
    }

    _readFileAsArrayBuffer(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload  = function() { resolve(reader.result); };
            reader.onerror = function() { reject(new Error('Failed to read file')); };
            reader.readAsArrayBuffer(file);
        });
    }

    _buildUrl(transferId, keyString, delivery) {
        var locale = this._detectLocalePrefix();
        var route  = delivery === 'download' ? 'download' : delivery;
        return window.location.origin + '/' + locale + '/' + route + '/#' + transferId + '/' + keyString;
    }

    _buildLinkOnlyUrl(transferId) {
        var locale = this._detectLocalePrefix();
        return window.location.origin + '/' + locale + '/download/#' + transferId;
    }

    _detectLocalePrefix() {
        var match = window.location.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\//);
        return match ? match[1] : 'en-gb';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Carousel
    // ═══════════════════════════════════════════════════════════════════════

    _startCarousel() {
        if (this._carouselTimer) return;
        var self = this;
        this._carouselTimer = setInterval(function() {
            self._carouselIndex = (self._carouselIndex + 1) % CAROUSEL_MESSAGES.length;
            if (self._els.progress) {
                self._els.progress.carouselMessage = CAROUSEL_MESSAGES[self._carouselIndex];
            }
        }, CAROUSEL_INTERVAL_MS);
        // Set initial message
        if (this._els.progress) {
            this._els.progress.carouselMessage = CAROUSEL_MESSAGES[this._carouselIndex];
        }
    }

    _stopCarousel() {
        if (this._carouselTimer) { clearInterval(this._carouselTimer); this._carouselTimer = null; }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Before-unload guard
    // ═══════════════════════════════════════════════════════════════════════

    _setBeforeUnload(active) {
        if (active && !this._beforeUnloadHandler) {
            this._beforeUnloadHandler = function(e) { e.preventDefault(); e.returnValue = ''; };
            window.addEventListener('beforeunload', this._beforeUnloadHandler);
        } else if (!active && this._beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this._beforeUnloadHandler);
            this._beforeUnloadHandler = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Reset
    // ═══════════════════════════════════════════════════════════════════════

    _resetForNew() {
        this._resetSelection();
        this.result            = null;
        this.errorMessage      = '';
        this._deliveryOptions  = null;
        this._recommendedDelivery = null;
        this._selectedDelivery = null;
        this._shareMode        = 'token';
        this._friendlyParts    = null;
        this._friendlyKey      = null;
        this._stageTimestamps  = {};
        this._carouselIndex    = 0;
        this.state = 'idle';
    }

    // ─── Email link ─────────────────────────────────────────────────────

    _openEmailLink() {
        if (!this.result) return;
        var subject = 'Secure file for you';
        var url     = this.result.combinedUrl || '';
        var body    = 'I\'ve sent you an encrypted file via SG/Send.\n\nOpen this link to download:\n' + url;
        window.open('mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body));
    }
}

customElements.define('send-upload', SendUpload);

// ═══════════════════════════════════════════════════════════════════════════════
// Module-level thumbnail helpers (not on prototype — avoid polluting the class)
// ═══════════════════════════════════════════════════════════════════════════════

function _computeFileHash(file) {
    return file.arrayBuffer().then(function(buf) {
        return crypto.subtle.digest('SHA-256', buf);
    }).then(function(hashBuf) {
        var arr = new Uint8Array(hashBuf);
        var hex = '';
        for (var i = 0; i < arr.length; i++) hex += ('0' + arr[i].toString(16)).slice(-2);
        return hex;
    });
}

function _computeFolderHash(fileHashes) {
    var data = new TextEncoder().encode(fileHashes.join(''));
    return crypto.subtle.digest('SHA-256', data).then(function(hashBuf) {
        var arr = new Uint8Array(hashBuf);
        var hex = '';
        for (var i = 0; i < 8; i++) hex += ('0' + arr[i].toString(16)).slice(-2);
        return hex;
    });
}

function _generatePdfThumbnail(file) {
    return _loadPdfJs().then(function() { return file.arrayBuffer(); })
    .then(function(buf) { return window.pdfjsLib.getDocument({ data: buf }).promise; })
    .then(function(pdfDoc) {
        var pageCount = pdfDoc.numPages;
        return pdfDoc.getPage(1).then(function(page) {
            var vp = page.getViewport({ scale: 1.0 });
            var scale = THUMB_MAX_WIDTH / vp.width;
            var svp = page.getViewport({ scale: scale });
            var canvas = document.createElement('canvas');
            canvas.width = Math.round(svp.width); canvas.height = Math.round(svp.height);
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            return page.render({ canvasContext: ctx, viewport: svp }).promise.then(function() {
                return new Promise(function(resolve, reject) {
                    canvas.toBlob(function(blob) {
                        if (!blob) { reject(new Error('PDF toBlob failed')); return; }
                        blob.arrayBuffer().then(function(buf) {
                            resolve({ buffer: buf, width: canvas.width, height: canvas.height, format: THUMB_FORMAT, pageCount: pageCount });
                        }).catch(reject);
                    }, THUMB_FORMAT, THUMB_QUALITY);
                });
            });
        });
    });
}

function _generateMarkdownThumbnail(file) {
    return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function() {
            var text = reader.result || '';
            var canvas = document.createElement('canvas');
            canvas.width = THUMB_MAX_WIDTH; canvas.height = THUMB_HEIGHT;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            var padding = 12, y = padding, maxWidth = canvas.width - padding * 2, maxY = canvas.height - 20;
            var lines = text.split('\n');
            for (var li = 0; li < lines.length && y < maxY; li++) {
                var line = lines[li];
                if (line.match(/^#{1,3}\s/)) {
                    ctx.font = 'bold 10px system-ui, sans-serif'; ctx.fillStyle = '#1a1a2e';
                    var cleanLine = line.replace(/^#+\s*/, '');
                    ctx.fillText(cleanLine, padding, y); y += 14;
                } else if (line.trim()) {
                    var cleanText = line.replace(/[*_`~]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
                    ctx.font = '7px system-ui, sans-serif'; ctx.fillStyle = '#1a1a2e';
                    var words = cleanText.split(' '), currentLine = '';
                    for (var wi = 0; wi < words.length && y < maxY; wi++) {
                        var testLine = currentLine ? currentLine + ' ' + words[wi] : words[wi];
                        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
                            ctx.fillText(currentLine, padding, y); y += 10; currentLine = words[wi];
                        } else { currentLine = testLine; }
                    }
                    if (currentLine && y < maxY) { ctx.fillText(currentLine, padding, y); y += 10; }
                    y += 2;
                }
            }
            if (y >= maxY) {
                var grad = ctx.createLinearGradient(0, THUMB_HEIGHT - 30, 0, THUMB_HEIGHT);
                grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(255,255,255,1)');
                ctx.fillStyle = grad; ctx.fillRect(0, THUMB_HEIGHT - 30, THUMB_MAX_WIDTH, 30);
            }
            canvas.toBlob(function(blob) {
                if (!blob) { reject(new Error('MD toBlob failed')); return; }
                blob.arrayBuffer().then(function(buf) {
                    resolve({ buffer: buf, width: THUMB_MAX_WIDTH, height: THUMB_HEIGHT, format: THUMB_FORMAT, textLen: text.length });
                }).catch(reject);
            }, THUMB_FORMAT, THUMB_QUALITY);
        };
        reader.onerror = function() { reject(new Error('Failed to read markdown')); };
        reader.readAsText(file);
    });
}

function _generateVideoThumbnail(file) {
    return new Promise(function(resolve, reject) {
        var url = URL.createObjectURL(file), video = document.createElement('video');
        video.preload = 'metadata'; video.muted = true;
        var timeout = setTimeout(function() { URL.revokeObjectURL(url); reject(new Error('Video timeout')); }, 10000);
        video.onloadeddata = function() { video.currentTime = Math.min(1, video.duration / 4); };
        video.onseeked = function() {
            clearTimeout(timeout);
            var origW = video.videoWidth, origH = video.videoHeight;
            var scale = Math.min(1, THUMB_MAX_WIDTH / origW);
            var w = Math.round(origW * scale), h = Math.round(origH * scale);
            var canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(video, 0, 0, w, h);
            URL.revokeObjectURL(url);
            canvas.toBlob(function(blob) {
                if (!blob) { reject(new Error('Video toBlob failed')); return; }
                blob.arrayBuffer().then(function(buf) {
                    resolve({ buffer: buf, width: w, height: h, format: THUMB_FORMAT, duration: video.duration, videoW: origW, videoH: origH });
                }).catch(reject);
            }, THUMB_FORMAT, THUMB_QUALITY);
        };
        video.onerror = function() { clearTimeout(timeout); URL.revokeObjectURL(url); reject(new Error('Video load failed')); };
        video.src = url;
    });
}

function _extractAudioMetadata(file) {
    return new Promise(function(resolve, reject) {
        var url = URL.createObjectURL(file), audio = document.createElement('audio');
        audio.preload = 'metadata';
        var timeout = setTimeout(function() { URL.revokeObjectURL(url); reject(new Error('Audio timeout')); }, 5000);
        audio.onloadedmetadata = function() {
            clearTimeout(timeout); var d = audio.duration; URL.revokeObjectURL(url);
            var m = Math.floor(d / 60), s = Math.floor(d % 60);
            resolve({ duration: d, durationFormatted: m + ':' + (s < 10 ? '0' : '') + s });
        };
        audio.onerror = function() { clearTimeout(timeout); URL.revokeObjectURL(url); reject(new Error('Audio load failed')); };
        audio.src = url;
    });
}
