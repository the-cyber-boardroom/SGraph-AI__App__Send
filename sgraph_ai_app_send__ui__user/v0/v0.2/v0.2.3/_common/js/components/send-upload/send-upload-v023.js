/* =============================================================================
   SGraph Send — Upload Component
   v0.2.3 — Surgical overlay on v0.2.0

   Changes:
     - Three-step wizard state machine (file-ready -> choosing-delivery -> choosing-share)
     - Step indicator (<send-step-indicator>) rendered at top of card
     - MAX_FILE_SIZE_PRESIGNED raised to 10GB
     - Encryption happens LAST — after all user choices
     - New states: file-ready, choosing-delivery, choosing-share
     - Processing phase: zipping -> reading -> encrypting -> creating -> uploading -> completing

   Loads AFTER v0.2.0 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard: v0.2.0 must be loaded ───────────────────────────────────────────
if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v023] SendUpload base class not found — skipping overrides');
    return;
}

// ─── Raise file size limit to 10GB ──────────────────────────────────────────
SendUpload.MAX_FILE_SIZE_PRESIGNED = 10 * 1024 * 1024 * 1024;  // 10GB

// ─── Store v0.2.0 methods we override ───────────────────────────────────────
const _v020_render              = SendUpload.prototype.render;
const _v020_setupEventListeners = SendUpload.prototype.setupEventListeners;
const _v020_startUpload         = SendUpload.prototype.startUpload;
const _v020_resetForNew         = SendUpload.prototype.resetForNew;
const _v020_handleDrop          = SendUpload.prototype.handleDrop;
const _v020_handleFileSelect    = SendUpload.prototype.handleFileSelect;

// ─── Step mapping ───────────────────────────────────────────────────────────
// Maps state to which step the user is on (for the step indicator)
const STATE_TO_STEP = {
    'idle':              1,
    'folder-options':    1,
    'file-ready':        1,
    'choosing-delivery': 2,
    'choosing-share':    3,
    'zipping':           3,
    'reading':           3,
    'encrypting':        3,
    'creating':          3,
    'uploading':         3,
    'completing':        3,
    'complete':          3,
    'error':             1
};

// ─── Content detection ──────────────────────────────────────────────────────
const VIEWABLE_EXTENSIONS = new Set([
    'pdf', 'md', 'txt', 'html', 'htm', 'json', 'csv', 'xml',
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'
]);

const IMAGE_EXTENSIONS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'
]);

function detectDeliveryOptions(file, folderScan) {
    const ext = (file?.name || '').split('.').pop().toLowerCase();
    const options = [{ id: 'download', icon: '\uD83D\uDCE5', title: 'Send as download', desc: 'Recipient gets a file to save to their device', hint: 'Best for: large archives, backups' }];

    if (folderScan) {
        options.push({ id: 'browse', icon: '\uD83D\uDCC2', title: 'Let them browse the folder', desc: 'Recipient sees files in a browsable view with inline preview', hint: 'Best for: sharing documents, reports' });
        const allImages = folderScan.entries
            .filter(e => !e.isDir)
            .every(e => IMAGE_EXTENSIONS.has(e.name.split('.').pop().toLowerCase()));
        if (allImages) {
            options.push({ id: 'gallery', icon: '\uD83D\uDDBC\uFE0F', title: 'Show as photo gallery', desc: 'Recipient browses images in a gallery layout', hint: 'Best for: photo sets, design assets' });
        }
    } else if (VIEWABLE_EXTENSIONS.has(ext)) {
        options.push({ id: 'view', icon: '\uD83D\uDC41\uFE0F', title: 'Let them view in the browser', desc: 'Recipient reads/views directly, no download needed', hint: 'Best for: documents, reports' });
    } else if (ext === 'zip') {
        options.push({ id: 'browse', icon: '\uD83D\uDCC2', title: 'Let them browse the folder', desc: 'Recipient sees files in a browsable view with inline preview', hint: 'Best for: sharing documents, reports' });
    }

    return options;
}

function getRecommendedDelivery(options, folderScan) {
    if (folderScan) return 'browse';
    if (options.find(o => o.id === 'view'))    return 'view';
    if (options.find(o => o.id === 'gallery')) return 'gallery';
    return 'download';
}

// ─── Override: render ───────────────────────────────────────────────────────
SendUpload.prototype.render = function() {
    this._stageTimestamps[this.state] = Date.now();

    // For states the v0.2.3 overlay doesn't handle, fall back to v0.2.0
    if (!STATE_TO_STEP[this.state]) {
        _v020_render.call(this);
        return;
    }

    const step = STATE_TO_STEP[this.state] || 1;
    const isProcessing = !!SendUpload.PROGRESS_STAGES[this.state] || this.state === 'zipping';

    // Step indicator (always visible except on complete)
    const stepIndicator = this.state !== 'complete'
        ? `<send-step-indicator step="${step}" total="3"></send-step-indicator>`
        : '';

    // Render step content based on current state
    let content = '';
    switch (this.state) {
        case 'idle':
            content = this._v023_renderStep1Idle();
            break;
        case 'folder-options':
            content = this.renderFolderOptions();
            break;
        case 'file-ready':
            content = this._v023_renderFileReady();
            break;
        case 'choosing-delivery':
            content = this._v023_renderStep2();
            break;
        case 'choosing-share':
            content = this._v023_renderStep3();
            break;
        case 'zipping':
        case 'reading':
        case 'encrypting':
        case 'creating':
        case 'uploading':
        case 'completing':
            content = this._v023_renderProcessing();
            break;
        case 'complete':
            content = this.renderResult();
            break;
        case 'error':
            content = this.renderError();
            break;
    }

    this.innerHTML = `
        <div class="card">
            ${stepIndicator}
            <div class="step-content${this._v023_goingBack ? ' step-content--reverse' : ''}">
                ${content}
            </div>
        </div>
    `;
    this._v023_goingBack = false;
};

// ─── Step 1: Idle (drop zone) ───────────────────────────────────────────────
SendUpload.prototype._v023_renderStep1Idle = function() {
    const maxSize = this.formatBytes(SendUpload.MAX_FILE_SIZE);
    return `
        <div class="drop-zone" id="drop-zone">
            <div class="drop-zone__label">Drop a file or folder</div>
            <div class="v023-browse-buttons">
                <button class="v023-browse-btn" id="browse-file-btn">Browse files</button>
                <button class="v023-browse-btn" id="browse-folder-btn">Browse folder</button>
            </div>
            <div class="drop-zone__hint" style="margin-top: var(--space-3, 0.75rem);">
                Your files are encrypted in your browser before upload
            </div>
            <div class="drop-zone__hint" style="margin-top: var(--space-1, 0.25rem); font-size: var(--text-small, 0.75rem); opacity: 0.7;">
                Maximum upload: ${this.escapeHtml(maxSize)}
            </div>
            <input type="file" id="file-input" style="display: none;">
            <input type="file" id="folder-input" style="display: none;" webkitdirectory>
        </div>
        <div class="v023-trust-badge">
            <span class="v023-trust-badge__icon">&#128274;</span>
            <span>Zero cookies &middot; Zero tracking &middot; We cannot read your files</span>
        </div>
    `;
};

// ─── Step 1: File Ready (file selected, not yet encrypted) ──────────────────
SendUpload.prototype._v023_renderFileReady = function() {
    const file = this.selectedFile;
    const isFolder = !!this._folderScan;
    const icon = isFolder ? '&#128193;' : '&#128196;';
    const name = isFolder ? this._folderName + '/' : (file ? file.name : '');
    const meta = isFolder
        ? `${this._folderScan.fileCount} files &middot; ${this.formatBytes(this._folderScan.totalSize)}`
        : (file ? this.formatBytes(file.size) : '');

    const tooLarge = file && file.size > SendUpload.MAX_FILE_SIZE;
    const largeWarning = file && file.size > 2 * 1024 * 1024 * 1024
        ? '<div class="v023-large-warning">Large files may take several minutes to encrypt. Keep this tab open.</div>'
        : '';

    if (tooLarge) {
        return `
            <div class="v023-file-summary v023-file-summary--error">
                <span class="v023-file-summary__icon">${icon}</span>
                <div>
                    <div class="v023-file-summary__name">${this.escapeHtml(name)}</div>
                    <div class="v023-file-summary__meta">${meta}</div>
                    <div class="v023-file-summary__meta" style="color: var(--color-error, #FF6B6B);">
                        File too large. Maximum: ${this.escapeHtml(this.formatBytes(SendUpload.MAX_FILE_SIZE))}
                    </div>
                </div>
            </div>
            <button class="v023-back-link" id="v023-back-to-idle">&larr; Choose a different file</button>
        `;
    }

    return `
        <div class="v023-file-summary">
            <span class="v023-file-summary__icon">${icon}</span>
            <div>
                <div class="v023-file-summary__name">${this.escapeHtml(name)}</div>
                <div class="v023-file-summary__meta">${meta}</div>
            </div>
            <div class="v023-file-summary__status">&#10003; Ready</div>
        </div>
        ${largeWarning}
        <div style="text-align: center; margin-top: var(--space-4, 1rem);">
            <button class="btn btn-primary" id="v023-continue-to-delivery">Choose how to share it &rarr;</button>
        </div>
        <button class="v023-back-link" id="v023-back-to-idle">&larr; Choose a different file</button>
    `;
};

// ─── Step 2: Choose Delivery ────────────────────────────────────────────────
SendUpload.prototype._v023_renderStep2 = function() {
    const options = this._v023_deliveryOptions || [];
    const recommended = this._v023_recommendedDelivery || 'download';
    const selected = this._v023_selectedDelivery || null;

    // File summary at top
    const file = this.selectedFile;
    const isFolder = !!this._folderScan;
    const icon = isFolder ? '&#128193;' : '&#128196;';
    const name = isFolder ? this._folderName + '/' : (file ? file.name : '');
    const meta = isFolder
        ? `${this._folderScan.fileCount} files &middot; ${this.formatBytes(this._folderScan.totalSize)}`
        : (file ? this.formatBytes(file.size) : '');

    const cardsHtml = options.map(opt => {
        const isSelected    = selected === opt.id;
        const isRecommended = opt.id === recommended;
        let classes = 'v023-delivery-card';
        if (isSelected)    classes += ' v023-delivery-card--selected';
        if (isRecommended) classes += ' v023-delivery-card--recommended';
        return `
            <div class="${classes}" data-delivery="${opt.id}">
                <div class="v023-delivery-card__icon">${opt.icon}</div>
                <div class="v023-delivery-card__title">${this.escapeHtml(opt.title)}</div>
                <div class="v023-delivery-card__desc">${this.escapeHtml(opt.desc)}</div>
                <div class="v023-delivery-card__hint">${this.escapeHtml(opt.hint)}</div>
            </div>
        `;
    }).join('');

    const continueBtn = selected
        ? `<div style="text-align: center; margin-top: var(--space-4, 1rem);">
               <button class="btn btn-primary" id="v023-continue-to-share">Continue &rarr;</button>
           </div>`
        : '';

    return `
        <div class="v023-file-summary v023-file-summary--compact">
            <span class="v023-file-summary__icon">${icon}</span>
            <div>
                <div class="v023-file-summary__name">${this.escapeHtml(name)}</div>
                <div class="v023-file-summary__meta">${meta}</div>
            </div>
        </div>
        <h3 class="v023-step-title">How should the recipient get this?</h3>
        <div class="v023-delivery-cards">${cardsHtml}</div>
        ${continueBtn}
        <button class="v023-back-link" id="v023-back-to-file-ready">&larr; Back</button>
    `;
};

// ─── Step 3: Choose Share Mode ──────────────────────────────────────────────
SendUpload.prototype._v023_renderStep3 = function() {
    const delivery = this._v023_selectedDelivery || 'download';

    // File summary at top
    const file = this.selectedFile;
    const isFolder = !!this._folderScan;
    const icon = isFolder ? '&#128193;' : '&#128196;';
    const name = isFolder ? this._folderName + '/' : (file ? file.name : '');
    const meta = isFolder
        ? `${this._folderScan.fileCount} files &middot; ${this.formatBytes(this._folderScan.totalSize)}`
        : (file ? this.formatBytes(file.size) : '');

    return `
        <div class="v023-file-summary v023-file-summary--compact">
            <span class="v023-file-summary__icon">${icon}</span>
            <div>
                <div class="v023-file-summary__name">${this.escapeHtml(name)}</div>
                <div class="v023-file-summary__meta">${meta} &middot; ${this.escapeHtml(delivery)}</div>
            </div>
        </div>
        <h3 class="v023-step-title">Ready to encrypt and send</h3>
        <p class="v023-step-desc">
            Your file will be encrypted in your browser, then uploaded.
            A secure link will be generated for sharing.
        </p>
        <div style="text-align: center; margin-top: var(--space-6, 1.5rem);">
            <button class="btn btn-primary btn-lg" id="v023-send-btn">Encrypt &amp; Send</button>
        </div>
        <button class="v023-back-link" id="v023-back-to-delivery">&larr; Back</button>
    `;
};

// ─── Processing phase ───────────────────────────────────────────────────────
SendUpload.prototype._v023_renderProcessing = function() {
    const stage = SendUpload.PROGRESS_STAGES[this.state];
    const pct = stage ? stage.pct : 5;
    const label = stage ? this.t(stage.label) : 'Processing...';

    return `
        <div class="v023-processing">
            <div class="v023-processing__label">${this.escapeHtml(label)}</div>
            <div class="progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
                <div class="progress-bar__fill" style="width: ${pct}%;"></div>
            </div>
            <div class="v023-processing__hint">
                Your file is being encrypted in your browser. Keep this tab open.
            </div>
        </div>
    `;
};

// ─── Override: setupEventListeners ──────────────────────────────────────────
SendUpload.prototype.setupEventListeners = function() {
    // Call base for shared listeners (drag/drop, file input, folder input, mode tabs, etc.)
    _v020_setupEventListeners.call(this);

    // v0.2.3 step navigation buttons
    const continueToDelivery = this.querySelector('#v023-continue-to-delivery');
    if (continueToDelivery) {
        continueToDelivery.addEventListener('click', () => {
            this._v023_deliveryOptions = detectDeliveryOptions(this.selectedFile, this._folderScan);
            this._v023_recommendedDelivery = getRecommendedDelivery(this._v023_deliveryOptions, this._folderScan);
            this._v023_selectedDelivery = null;

            // Auto-advance if only one option
            if (this._v023_deliveryOptions.length === 1) {
                this._v023_selectedDelivery = this._v023_deliveryOptions[0].id;
                this.state = 'choosing-share';
            } else {
                this.state = 'choosing-delivery';
            }
            this.render();
            this.setupEventListeners();
        });
    }

    // Delivery card selection
    this.querySelectorAll('[data-delivery]').forEach(card => {
        card.addEventListener('click', () => {
            this._v023_selectedDelivery = card.getAttribute('data-delivery');
            this.render();
            this.setupEventListeners();
        });
    });

    const continueToShare = this.querySelector('#v023-continue-to-share');
    if (continueToShare) {
        continueToShare.addEventListener('click', () => {
            this.state = 'choosing-share';
            this.render();
            this.setupEventListeners();
        });
    }

    // Send button (Step 3 → processing)
    const sendBtn = this.querySelector('#v023-send-btn');
    if (sendBtn) {
        sendBtn.addEventListener('click', () => {
            this._v023_startProcessing();
        });
    }

    // Back navigation
    const backToIdle = this.querySelector('#v023-back-to-idle');
    if (backToIdle) {
        backToIdle.addEventListener('click', () => {
            this._v023_goingBack = true;
            this.resetForNew();
        });
    }

    const backToFileReady = this.querySelector('#v023-back-to-file-ready');
    if (backToFileReady) {
        backToFileReady.addEventListener('click', () => {
            this._v023_goingBack = true;
            this.state = 'file-ready';
            this.render();
            this.setupEventListeners();
        });
    }

    const backToDelivery = this.querySelector('#v023-back-to-delivery');
    if (backToDelivery) {
        backToDelivery.addEventListener('click', () => {
            this._v023_goingBack = true;
            this.state = 'choosing-delivery';
            this.render();
            this.setupEventListeners();
        });
    }
};

// ─── Override: handleDrop — go to file-ready instead of idle ────────────────
SendUpload.prototype.handleDrop = function(e) {
    e.preventDefault(); e.stopPropagation();
    const dz = this.querySelector('#drop-zone'); if (dz) dz.classList.remove('dragover');

    // Check if a folder was dropped
    const items = e.dataTransfer && e.dataTransfer.items;
    if (items && items.length > 0) {
        const entry = items[0].webkitGetAsEntry && items[0].webkitGetAsEntry();
        if (entry && entry.isDirectory) {
            this._handleFolderEntry(entry);
            return;
        }
    }

    // Single file — go to file-ready state
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) {
        this.selectedFile = files[0];
        this.state = 'file-ready';
        this.render();
        this.setupEventListeners();
        return;
    }

    // Handle drag from test-files component
    const testFileData = e.dataTransfer && e.dataTransfer.getData('application/x-sgraph-test-file');
    if (testFileData) {
        try {
            const { url, name, mime } = JSON.parse(testFileData);
            fetch(url).then(r => r.arrayBuffer()).then(buf => {
                this.selectedFile = new File([buf], name, { type: mime });
                this.state = 'file-ready';
                this.render();
                this.setupEventListeners();
            });
        } catch (err) { /* ignore malformed data */ }
    }
};

// ─── Override: handleFileSelect — go to file-ready ──────────────────────────
SendUpload.prototype.handleFileSelect = function(e) {
    const files = e.target.files;
    if (files && files.length > 0) {
        this.selectedFile = files[0];
        this.state = 'file-ready';
        this.render();
        this.setupEventListeners();
    }
};

// ─── Override: handleFolderSelect — after folder-options, go to file-ready ──
const _v020_startFolderZip = SendUpload.prototype._startFolderZip;
SendUpload.prototype._startFolderZip = async function() {
    // Folder options confirmed — transition to file-ready (v0.2.3)
    // The actual zipping happens during the processing phase
    // For now, create a synthetic zip file to represent the folder
    // and move to file-ready
    try {
        await this._loadJSZip();

        this.state = 'zipping';
        this.render();
        this.setupEventListeners();

        const zip = new JSZip();
        const entries = this._folderScan.entries.filter(e => !e.isDir);
        const opts = this._folderOptions;

        for (const entry of entries) {
            if (!opts.includeHidden && entry.name.startsWith('.')) continue;
            if (entry.file) {
                zip.file(entry.path, entry.file, { compression: opts.level > 0 ? 'DEFLATE' : 'STORE', compressionOptions: { level: opts.level } });
            }
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const zipName = (this._folderName || 'folder') + '.zip';
        this.selectedFile = new File([blob], zipName, { type: 'application/zip' });

        this.state = 'file-ready';
        this.render();
        this.setupEventListeners();
    } catch (err) {
        this.errorMessage = err.message || 'Failed to create zip';
        this.state = 'error';
        this.render();
        this.setupEventListeners();
    }
};

// ─── Processing: encrypt + upload (called from Step 3) ──────────────────────
SendUpload.prototype._v023_startProcessing = async function() {
    if (!SendCrypto.isAvailable()) {
        this.errorMessage = this.t('crypto.error.unavailable');
        this.state = 'error'; this.render(); this.setupEventListeners(); return;
    }

    const file = this.selectedFile;
    if (!file) return;
    if (file.size > SendUpload.MAX_FILE_SIZE) {
        this.errorMessage = this.t('upload.error.file_too_large', { limit: this.formatBytes(SendUpload.MAX_FILE_SIZE) });
        this.state = 'error'; this.render(); this.setupEventListeners(); return;
    }

    try {
        this._setBeforeUnload(true);
        this._stageTimestamps = {};

        // Reading
        this.state = 'reading'; this.render(); this.setupEventListeners();
        const rawContent = await this.readFileAsArrayBuffer(file);
        const contentType = file.type || 'application/octet-stream';
        const plaintext = this.packageWithMetadata(rawContent, { filename: file.name });
        const fileSizeBytes = plaintext.byteLength;

        // Encrypting (key is now determined — random key for v0.2.3, PBKDF2 in v0.2.6)
        this.state = 'encrypting'; this.render();
        const key       = await SendCrypto.generateKey();
        const keyString = await SendCrypto.exportKey(key);
        const encrypted = await SendCrypto.encryptFile(key, plaintext);

        // Creating transfer
        this.state = 'creating'; this.render();
        const createResult = await ApiClient.createTransfer(fileSizeBytes, contentType);

        // Uploading
        this.state = 'uploading'; this.render();
        const usePresigned = encrypted.byteLength > SendUpload.MAX_FILE_SIZE_DIRECT
                          && this._capabilities
                          && this._capabilities.multipart_upload;
        if (usePresigned) {
            await this._uploadViaPresigned(createResult.transfer_id, encrypted);
        } else {
            await ApiClient.uploadPayload(createResult.transfer_id, encrypted);
        }

        // Completing
        this.state = 'completing'; this.render();
        const completeResult = await ApiClient.completeTransfer(createResult.transfer_id);

        // Build URLs — use delivery-specific route if available
        const delivery = this._v023_selectedDelivery || 'download';
        const combinedUrl = this._v023_buildUrl(createResult.transfer_id, keyString, delivery);
        const linkOnlyUrl = this.buildLinkOnlyUrl(createResult.transfer_id);

        this.result = {
            transferId:   createResult.transfer_id,
            combinedUrl,
            linkOnlyUrl,
            keyString,
            isText:       false,
            delivery,
            transparency: completeResult.transparency || null
        };
        this._setBeforeUnload(false);
        this.state = 'complete'; this.render(); this.setupDynamicListeners();

        this.dispatchEvent(new CustomEvent('upload-complete', {
            detail: { transferId: createResult.transfer_id, downloadUrl: combinedUrl, key: keyString },
            bubbles: true
        }));

    } catch (err) {
        this._setBeforeUnload(false);
        if (err.message === 'ACCESS_TOKEN_INVALID') { document.dispatchEvent(new CustomEvent('access-token-invalid')); return; }
        if (err.message && err.message.includes('ISO-8859-1')) {
            ApiClient.clearAccessToken();
            document.dispatchEvent(new CustomEvent('access-token-invalid'));
            return;
        }
        this.errorMessage = err.message || this.t('upload.error.upload_failed');
        this.state = 'error'; this.render(); this.setupEventListeners();
    }
};

// ─── Build URL based on delivery mode ───────────────────────────────────────
SendUpload.prototype._v023_buildUrl = function(transferId, keyString, delivery) {
    const locale = this._detectLocalePrefix();
    const route = delivery === 'download' ? 'download' : delivery;
    return `${window.location.origin}/${locale}/${route}/#${transferId}/${keyString}`;
};

// ─── Override: resetForNew — clear v0.2.3 state ─────────────────────────────
SendUpload.prototype.resetForNew = function() {
    this._v023_deliveryOptions     = null;
    this._v023_recommendedDelivery = null;
    this._v023_selectedDelivery    = null;
    this._v023_goingBack           = false;
    _v020_resetForNew.call(this);
};

// ─── Inline styles for v0.2.3 components ────────────────────────────────────
// Injected once into the document head
(function injectStyles() {
    if (document.getElementById('v023-styles')) return;
    const style = document.createElement('style');
    style.id = 'v023-styles';
    style.textContent = `
        /* Step content transitions */
        .step-content {
            animation: v023-step-enter 300ms ease;
        }
        @keyframes v023-step-enter {
            from { opacity: 0; transform: translateX(20px); }
            to   { opacity: 1; transform: translateX(0); }
        }
        .step-content--reverse {
            animation: v023-step-enter-reverse 300ms ease;
        }
        @keyframes v023-step-enter-reverse {
            from { opacity: 0; transform: translateX(-20px); }
            to   { opacity: 1; transform: translateX(0); }
        }

        /* Browse buttons (ghost style) */
        .v023-browse-buttons {
            display: flex;
            gap: var(--space-3, 0.75rem);
            justify-content: center;
            margin-top: var(--space-4, 1rem);
        }
        .v023-browse-btn {
            background: transparent;
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));
            color: var(--color-text-secondary, #8892A0);
            padding: var(--space-2, 0.5rem) var(--space-4, 1rem);
            border-radius: var(--radius-sm, 6px);
            font-size: var(--text-small, 0.75rem);
            cursor: pointer;
            transition: border-color 0.2s, color 0.2s;
        }
        .v023-browse-btn:hover {
            border-color: var(--color-primary, #4ECDC4);
            color: var(--color-primary, #4ECDC4);
        }

        /* Trust badge */
        .v023-trust-badge {
            display: flex;
            align-items: center;
            gap: var(--space-2, 0.5rem);
            font-size: var(--text-small, 0.75rem);
            color: var(--color-text-secondary, #8892A0);
            margin-top: var(--space-4, 1rem);
            padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
            border-radius: var(--radius-sm, 6px);
            background: rgba(78, 205, 196, 0.04);
        }
        .v023-trust-badge__icon { flex-shrink: 0; }

        /* File summary */
        .v023-file-summary {
            display: flex;
            align-items: center;
            gap: var(--space-3, 0.75rem);
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);
            background: rgba(78, 205, 196, 0.04);
            border-radius: var(--radius-sm, 6px);
            margin-bottom: var(--space-4, 1rem);
        }
        .v023-file-summary--compact { margin-bottom: var(--space-3, 0.75rem); }
        .v023-file-summary--error { border: 1px solid var(--color-error, #FF6B6B); }
        .v023-file-summary__icon { font-size: 1.25rem; flex-shrink: 0; }
        .v023-file-summary__name {
            font-weight: var(--weight-semibold, 600);
            color: var(--color-text, #E0E0E0);
            font-size: var(--text-sm, 0.875rem);
        }
        .v023-file-summary__meta {
            font-size: var(--text-small, 0.75rem);
            color: var(--color-text-secondary, #8892A0);
        }
        .v023-file-summary__status {
            margin-left: auto;
            font-size: var(--text-small, 0.75rem);
            color: var(--color-success, #4ECDC4);
            display: flex;
            align-items: center;
            gap: var(--space-1, 0.25rem);
        }

        /* Large file warning */
        .v023-large-warning {
            margin-top: var(--space-3, 0.75rem);
            padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
            background: rgba(255, 107, 107, 0.08);
            border: 1px solid rgba(255, 107, 107, 0.2);
            border-radius: var(--radius-sm, 6px);
            font-size: var(--text-small, 0.75rem);
            color: var(--color-text-secondary, #8892A0);
        }

        /* Step titles */
        .v023-step-title {
            font-size: var(--text-body, 1rem);
            font-weight: var(--weight-semibold, 600);
            color: var(--color-text, #E0E0E0);
            margin: 0 0 var(--space-2, 0.5rem) 0;
        }
        .v023-step-desc {
            font-size: var(--text-sm, 0.875rem);
            color: var(--color-text-secondary, #8892A0);
            margin: 0 0 var(--space-4, 1rem) 0;
            line-height: 1.5;
        }

        /* Delivery cards */
        .v023-delivery-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: var(--space-4, 1rem);
            margin-top: var(--space-4, 1rem);
        }
        .v023-delivery-card {
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));
            border-radius: var(--radius-md, 12px);
            padding: var(--space-6, 1.5rem);
            background: var(--color-surface, #1E2A4A);
            cursor: pointer;
            transition: border-color 0.2s, background 0.2s, transform 0.2s;
            text-align: left;
        }
        .v023-delivery-card:hover {
            border-color: var(--color-primary, #4ECDC4);
            background: var(--accent-subtle, rgba(78, 205, 196, 0.12));
            transform: translateY(-2px);
        }
        .v023-delivery-card--selected {
            border-color: var(--color-primary, #4ECDC4);
            background: var(--accent-subtle, rgba(78, 205, 196, 0.12));
            box-shadow: 0 0 0 1px var(--color-primary, #4ECDC4);
        }
        .v023-delivery-card--recommended { position: relative; }
        .v023-delivery-card--recommended::after {
            content: "\\2605 RECOMMENDED";
            position: absolute;
            bottom: var(--space-3, 0.75rem);
            right: var(--space-3, 0.75rem);
            font-size: var(--text-micro, 0.625rem);
            color: var(--color-primary, #4ECDC4);
            font-weight: var(--weight-semibold, 600);
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }
        .v023-delivery-card__icon { font-size: 1.5rem; margin-bottom: var(--space-3, 0.75rem); }
        .v023-delivery-card__title {
            font-size: var(--text-body, 1rem);
            font-weight: var(--weight-semibold, 600);
            color: var(--color-text, #E0E0E0);
            margin-bottom: var(--space-2, 0.5rem);
        }
        .v023-delivery-card__desc {
            font-size: var(--text-small, 0.75rem);
            color: var(--color-text-secondary, #8892A0);
            line-height: 1.5;
            margin-bottom: var(--space-3, 0.75rem);
        }
        .v023-delivery-card__hint {
            font-size: var(--text-micro, 0.625rem);
            color: var(--color-text-secondary, #8892A0);
            opacity: 0.7;
        }

        /* Back link */
        .v023-back-link {
            display: inline-flex;
            align-items: center;
            gap: var(--space-1, 0.25rem);
            margin-top: var(--space-4, 1rem);
            font-size: var(--text-small, 0.75rem);
            color: var(--color-text-secondary, #8892A0);
            cursor: pointer;
            text-decoration: none;
            border: none;
            background: none;
            padding: 0;
        }
        .v023-back-link:hover {
            color: var(--color-primary, #4ECDC4);
        }

        /* Processing */
        .v023-processing {
            padding: var(--space-6, 1.5rem) 0;
        }
        .v023-processing__label {
            font-size: var(--text-sm, 0.875rem);
            color: var(--color-text-secondary, #8892A0);
            margin-bottom: var(--space-3, 0.75rem);
        }
        .v023-processing__hint {
            font-size: var(--text-small, 0.75rem);
            color: var(--color-text-secondary, #8892A0);
            margin-top: var(--space-3, 0.75rem);
            opacity: 0.7;
        }

        /* Mobile */
        @media (max-width: 480px) {
            .v023-browse-buttons { flex-direction: column; gap: var(--space-2, 0.5rem); }
            .v023-browse-btn { width: 100%; padding: var(--space-3, 0.75rem) var(--space-4, 1rem); }
            .v023-delivery-cards { grid-template-columns: 1fr; }
        }
    `;
    document.head.appendChild(style);
})();

console.log('[send-upload-v023] Three-step wizard overlay loaded (10GB limit, encryption-last)');

})();
