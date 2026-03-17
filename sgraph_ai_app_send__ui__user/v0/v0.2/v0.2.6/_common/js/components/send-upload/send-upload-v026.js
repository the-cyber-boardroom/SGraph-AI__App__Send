/* =============================================================================
   SGraph Send — Upload Component
   v0.2.6 — Surgical overlay on v0.2.5

   Changes:
     - Five-step wizard (was four):
       1. Upload — drop/browse file
       2. Choose delivery — download/view/browse
       3. Choose share — token/combined/separate cards (auto-advances on click)
       4. Confirm & Send — summary of all choices + prominent Encrypt & Send button
       5. Share — result in chosen mode
     - Simple token is default share mode (first card, pre-selected)
     - Skip file-ready pause for ALL files
     - Step indicator updated to 5 steps

   Loads AFTER v0.2.5 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard: v0.2.5 must be loaded ───────────────────────────────────────────
if (typeof SendUpload === 'undefined' || !SendUpload.prototype._v025_multiFile === undefined) {
    console.warn('[send-upload-v026] v0.2.5 overlay not found — skipping v0.2.6 overrides');
    return;
}

// ─── Store methods we override ──────────────────────────────────────────────
const _v025_renderResult       = SendUpload.prototype.renderResult;
const _v025_setupDynamic       = SendUpload.prototype.setupDynamicListeners;
const _v025_setupEvents        = SendUpload.prototype.setupEventListeners;
const _v025_resetForNew        = SendUpload.prototype.resetForNew;
const _v025_advanceToDelivery  = SendUpload.prototype._v023_advanceToDelivery;
const _v025_renderStep3        = SendUpload.prototype._v023_renderStep3;
const _v025_render             = SendUpload.prototype.render;
const _v025_startProcessing    = SendUpload.prototype._v023_startProcessing;

// ─── Update step indicator to 5 steps ───────────────────────────────────────
if (typeof SendStepIndicator !== 'undefined') {
    SendStepIndicator.STEP_LABELS = ['Upload', 'Delivery', 'Share mode', 'Confirm', 'Done'];
}

// ─── New state-to-step mapping (5 steps) ────────────────────────────────────
var V026_TOTAL_STEPS = 5;
var V026_STATE_TO_STEP = {
    'idle':              1,
    'folder-options':    1,
    'file-ready':        1,
    'choosing-delivery': 2,
    'choosing-share':    3,
    'confirming':        4,
    'zipping':           4,
    'reading':           4,
    'encrypting':        4,
    'creating':          4,
    'uploading':         4,
    'completing':        4,
    'complete':          5,
    'error':             1
};

// ─── Override: render — use 5-step mapping ──────────────────────────────────
SendUpload.prototype.render = function() {
    this._stageTimestamps = this._stageTimestamps || {};
    this._stageTimestamps[this.state] = Date.now();

    var step = V026_STATE_TO_STEP[this.state] || 1;
    var stepIndicator = '<send-step-indicator step="' + step + '" total="' + V026_TOTAL_STEPS + '"></send-step-indicator>';

    var content = '';
    switch (this.state) {
        case 'idle':              content = this._v023_renderStep1Idle(); break;
        case 'folder-options':    content = this.renderFolderOptions(); break;
        case 'file-ready':        content = this._v023_renderFileReady(); break;
        case 'choosing-delivery': content = this._v023_renderStep2(); break;
        case 'choosing-share':    content = this._v026_renderShareChoice(); break;
        case 'confirming':        content = this._v026_renderConfirm(); break;
        case 'zipping':
        case 'reading':
        case 'encrypting':
        case 'creating':
        case 'uploading':
        case 'completing':        content = this._v023_renderProcessing(); break;
        case 'complete':          content = this.renderResult(); break;
        case 'error':             content = this.renderError(); break;
        default:                  _v025_render.call(this); return;
    }

    this.innerHTML =
        '<div class="card">' +
            stepIndicator +
            '<div class="step-content' + (this._v023_goingBack ? ' step-content--reverse' : '') + '">' +
                content +
            '</div>' +
        '</div>';
    this._v023_goingBack = false;
};

// ─── Override: skip file-ready for ALL files + reorder delivery (view first) ─
SendUpload.prototype._v023_advanceToDelivery = function() {
    this._v024_userConfirmed = true;
    _v025_advanceToDelivery.call(this);
    // Reorder: viewable options (view/browse/gallery) before download
    var opts = this._v023_deliveryOptions;
    if (opts && opts.length > 1) {
        var viewFirst = [], downloadLast = [];
        opts.forEach(function(o) {
            (o.id === 'download' ? downloadLast : viewFirst).push(o);
        });
        this._v023_deliveryOptions = viewFirst.concat(downloadLast);
        this.render();
        this.setupEventListeners();
    }
};

// ─── Share mode definitions ────────────────────────────────────────────────
var SHARE_MODES = [
    {
        id:    'token',
        icon:  '\uD83C\uDFAB',       // 🎫
        title: 'Simple token',
        desc:  'A short transfer ID they can enter on the site. Key sent separately.',
        hint:  'Easiest — share verbally or in a message',
        security: 'Recipient needs both the token and the key'
    },
    {
        id:    'combined',
        icon:  '\uD83D\uDD17',       // 🔗
        title: 'Combined link',
        desc:  'One link with the decryption key embedded. Recipient clicks and gets the file.',
        hint:  'Simplest — one click for the recipient',
        security: 'Anyone with this link can decrypt the file'
    },
    {
        id:    'separate',
        icon:  '\uD83D\uDD10',       // 🔐
        title: 'Link + key separate',
        desc:  'Send the link and decryption key through different channels.',
        hint:  'More secure — requires both pieces',
        security: 'Neither piece works alone'
    }
];

// ─── Word list for friendly keys (~256 common words) ─────────────────────────
var V026_WORDS = [
    'acorn','agate','alder','amber','anchor','anvil','apple','arrow','aspen','atlas',
    'badge','baker','barn','basin','beach','berry','birch','blade','blank','blaze',
    'bloom','board','bold','bonus','brave','bread','brick','brook','brush','cabin',
    'camel','candy','cargo','cedar','chain','chalk','charm','chess','chief','chill',
    'cider','citrus','civic','claim','clay','cliff','climb','clock','cloud','clover',
    'coach','coast','cobalt','cocoa','coral','craft','crane','crash','creek','crest',
    'crisp','cross','crown','cubic','curve','dance','dawn','delta','depot','diary',
    'dodge','dove','draft','dream','drift','drum','dune','eagle','earth','echo',
    'elder','elite','ember','epoch','equal','fable','faith','falcon','feast','fern',
    'ferry','fiber','field','flame','flash','flint','float','flora','flute','focus',
    'forge','found','frost','fruit','fudge','gaze','giant','glade','glass','gleam',
    'globe','glow','gold','grace','grain','grand','grape','green','grove','guard',
    'guide','guild','halo','harbor','haven','hawk','hazel','heart','hedge','herb',
    'heron','honey','horizon','hound','humor','index','iris','ivory','jasper','jewel','jolly',
    'judge','jungle','karma','kite','knoll','lake','latch','lemon','level','light',
    'lily','linen','lion','lodge','logic','lotus','lucky','lunar','lyre','magic',
    'mango','manor','maple','marsh','match','mayor','medal','melon','mercy','mirth',
    'model','moose','mortar','moss','mount','music','myth','nectar','noble','north','novel',
    'nutmeg','oak','oasis','ocean','olive','onset','onyx','opal','orange','orbit',
    'otter','oxide','palm','panel','patch','peace','pearl','pecan','pepper','petal',
    'pilot','pixel','plant','plaza','plume','plush','polar','pouch','prism','proud',
    'pulse','quail','queen','quest','quick','radar','rain','rapid','raven','reach',
    'realm','reed','reef','relay','ribbon','ridge','river','robin','robot','royal','ruby',
    'rumor','sage','sandy','satin','scale','scene','scout','scroll','shade','shark',
    'shell','shift','shine','silk','slate','smile','solar','solid','sonic','spark',
    'spell','spice','spine','spoke','spruce','staff','stamp','star','steam','steel',
    'stone','storm','sugar','sunny','surge','sweep','swift','table','tango','terra',
    'thistle','thorn','tiger','toast','token','topaz','tower','trace','trail','trend',
    'trout','tulip','twist','ultra','umber','union','unity','urban','valid','valve',
    'vault','velvet','verse','vigor','vine','vinyl','vivid','voice','walnut','water',
    'wave','wheat','whole','wick','willow','wind','wolf','wonder','world','wren',
    'yacht','yarn','yarrow','yield','zenith','zinc','zone'
];

function v026_randomWord() {
    var arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return V026_WORDS[arr[0] % V026_WORDS.length];
}

function v026_randomSuffix() {
    var arr = new Uint16Array(1);
    crypto.getRandomValues(arr);
    return String(arr[0] % 10000).padStart(4, '0');
}

function v026_newFriendlyKey() {
    return { words: [v026_randomWord(), v026_randomWord()], suffix: v026_randomSuffix() };
}

function v026_formatFriendly(parts) {
    return parts.words[0] + '-' + parts.words[1] + '-' + parts.suffix;
}

function v026_combinationsLabel() {
    var total = V026_WORDS.length * V026_WORDS.length * 10000;
    var label;
    if (total >= 1e9) {
        label = (total / 1e9).toFixed(1).replace(/\.0$/, '') + ' billion';
    } else {
        label = Math.round(total / 1e6) + ' million';
    }
    return V026_WORDS.length + ' words &times; ' + V026_WORDS.length + ' words &times; 10,000 = ~' + label + ' combinations';
}

async function v026_deriveKeyFromFriendly(passphrase) {
    var enc = new TextEncoder();
    var material = await crypto.subtle.importKey(
        'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: enc.encode('sgraph-send-v1'), iterations: 600000, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

/** Derive a deterministic 12-char hex transfer ID from a friendly token.
 *  SHA-256(token) → first 12 hex chars. Must match FriendlyCrypto.deriveTransferId. */
async function v026_deriveTransferId(friendlyToken) {
    var enc = new TextEncoder();
    var hash = await crypto.subtle.digest('SHA-256', enc.encode(friendlyToken));
    var bytes = new Uint8Array(hash);
    var hex = '';
    for (var i = 0; i < 6; i++) {
        hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex;
}

// ─── Step 3: Share mode selection (auto-advances on click) ──────────────────
SendUpload.prototype._v026_renderShareChoice = function() {
    var self = this;
    var selectedMode = this._v026_shareMode || 'token';

    var cardsHtml = SHARE_MODES.map(function(mode) {
        var activeClass = mode.id === selectedMode ? ' v026-share-card--active' : '';
        return '<div class="v026-share-card' + activeClass + '" data-share-mode="' + mode.id + '">' +
            '<div class="v026-share-card__icon">' + mode.icon + '</div>' +
            '<div class="v026-share-card__body">' +
                '<div class="v026-share-card__title">' + self.escapeHtml(mode.title) + '</div>' +
                '<div class="v026-share-card__desc">' + self.escapeHtml(mode.desc) + '</div>' +
                '<div class="v026-share-card__hint">' + self.escapeHtml(mode.hint) + '</div>' +
            '</div>' +
        '</div>';
    }).join('');

    return '<h3 class="v023-step-title">How do you want to share it?</h3>' +
        '<div class="v026-share-cards">' + cardsHtml + '</div>' +
        '<button class="v023-back-link" id="v023-back-to-delivery">&larr; Back</button>';
};

// ─── Step 4: Confirmation summary ──────────────────────────────────────────
SendUpload.prototype._v026_renderConfirm = function() {
    var file = this.selectedFile;
    var isFolder = !!this._folderScan;
    var icon = isFolder ? '&#128193;' : '&#128196;';
    var name = isFolder ? (this._folderName || 'folder') + '/' : (file ? file.name : '');
    var meta = isFolder
        ? this._folderScan.fileCount + ' files &middot; ' + this.formatBytes(this._folderScan.totalSize)
        : (file ? this.formatBytes(file.size) : '');

    var delivery = this._v023_selectedDelivery || 'download';
    var deliveryOpt = (this._v023_deliveryOptions || []).find(function(o) { return o.id === delivery; });
    var shareMode = this._v026_shareMode || 'token';
    var shareModeConfig = SHARE_MODES.find(function(m) { return m.id === shareMode; });

    // Generate friendly key if not already set and share mode is token
    if (shareMode === 'token' && !this._v026_friendlyParts) {
        this._v026_friendlyParts = v026_newFriendlyKey();
        this._v026_friendlyKey = v026_formatFriendly(this._v026_friendlyParts);
    }

    var largeWarning = file && file.size > 2 * 1024 * 1024 * 1024
        ? '<div class="v023-large-warning" style="margin-top: var(--space-4, 1rem);">Large files may take several minutes to encrypt. Keep this tab open.</div>'
        : '';

    // Word picker (only for token mode)
    var wordPickerHtml = '';
    if (shareMode === 'token' && this._v026_friendlyParts) {
        var fp = this._v026_friendlyParts;
        wordPickerHtml =
            '<div class="v026-word-picker">' +
                '<label class="v026-word-picker__label">Your friendly key</label>' +
                '<div class="v026-word-picker__slots">' +
                    '<div class="v026-word-picker__slot">' +
                        '<span class="v026-word-picker__word">' + this.escapeHtml(fp.words[0]) + '</span>' +
                        '<button class="v026-word-picker__shuffle-btn" data-shuffle-word="0" title="Shuffle this word">&#128256;</button>' +
                    '</div>' +
                    '<span class="v026-word-picker__sep">&mdash;</span>' +
                    '<div class="v026-word-picker__slot">' +
                        '<span class="v026-word-picker__word">' + this.escapeHtml(fp.words[1]) + '</span>' +
                        '<button class="v026-word-picker__shuffle-btn" data-shuffle-word="1" title="Shuffle this word">&#128256;</button>' +
                    '</div>' +
                    '<span class="v026-word-picker__sep">&mdash;</span>' +
                    '<div class="v026-word-picker__slot">' +
                        '<span class="v026-word-picker__suffix">' + this.escapeHtml(fp.suffix) + '</span>' +
                    '</div>' +
                '</div>' +
                '<div class="v026-word-picker__preview">' +
                    '<span class="v026-word-picker__key" id="v026-friendly-display">' + this.escapeHtml(this._v026_friendlyKey) + '</span>' +
                    '<button class="v026-word-picker__action" data-copy="v026-friendly-display" title="Copy">&#128203;</button>' +
                    '<button class="v026-word-picker__action" id="v026-shuffle-all" title="Generate new key">&#128256; New</button>' +
                '</div>' +
                '<div class="v026-word-picker__hint">Share this verbally or in a message &mdash; easy to remember and type</div>' +
                '<div class="v026-word-picker__hint" style="opacity: 0.5; margin-top: 0.25rem;">' + v026_combinationsLabel() + '</div>' +
            '</div>';
    }

    return '<h3 class="v023-step-title">Ready to encrypt and send</h3>' +
        '<p class="v023-step-desc" style="margin-bottom: var(--space-5, 1.25rem);">Review your choices, then hit the button below.</p>' +

        // Summary rows
        '<div class="v026-summary">' +
            '<div class="v026-summary__row">' +
                '<span class="v026-summary__label">File</span>' +
                '<span class="v026-summary__value">' +
                    '<span class="v026-summary__icon">' + icon + '</span> ' +
                    this.escapeHtml(name) +
                    '<span class="v026-summary__meta"> &middot; ' + meta + '</span>' +
                '</span>' +
            '</div>' +
            (deliveryOpt ? '<div class="v026-summary__row">' +
                '<span class="v026-summary__label">Delivery</span>' +
                '<span class="v026-summary__value">' +
                    deliveryOpt.icon + ' ' + this.escapeHtml(deliveryOpt.title) +
                '</span>' +
                '<button class="v026-summary__change" data-change="delivery">change</button>' +
            '</div>' : '') +
            (shareModeConfig ? '<div class="v026-summary__row">' +
                '<span class="v026-summary__label">Share mode</span>' +
                '<span class="v026-summary__value">' +
                    shareModeConfig.icon + ' ' + this.escapeHtml(shareModeConfig.title) +
                '</span>' +
                '<button class="v026-summary__change" data-change="share">change</button>' +
            '</div>' : '') +
        '</div>' +

        wordPickerHtml +

        // Security note
        '<div class="v026-security-note" style="margin-top: var(--space-4, 1rem);">' +
            '<span>&#128274;</span> Your file will be encrypted in your browser' +
            (shareMode === 'token' ? ' using this key. The server never sees your data or key.' : ' before upload. The server never sees your data.') +
        '</div>' +

        largeWarning +

        // Big Encrypt & Send button
        '<div class="v026-send-action">' +
            '<button class="v026-send-btn" id="v023-send-btn">' +
                '<span class="v026-send-btn__icon">&#128274;</span>' +
                '<span class="v026-send-btn__text">Encrypt &amp; Send</span>' +
            '</button>' +
        '</div>' +

        '<button class="v023-back-link" id="v026-back-to-share">&larr; Back</button>';
};

// ─── Override: startProcessing — derive key + transfer ID from friendly token ──
SendUpload.prototype._v023_startProcessing = async function() {
    var self = this;
    if (this._v026_shareMode === 'token' && this._v026_friendlyKey) {
        // Derive deterministic transfer ID from friendly token (SHA-256 → 12 hex)
        var derivedTransferId = await v026_deriveTransferId(this._v026_friendlyKey);

        // Temporarily swap key generation to use PBKDF2 from friendly key
        var origGenKey = SendCrypto.generateKey;
        SendCrypto.generateKey = function() {
            return v026_deriveKeyFromFriendly(self._v026_friendlyKey);
        };

        // Temporarily swap createTransfer to include derived transfer_id
        var origCreateTransfer = ApiClient.createTransfer;
        ApiClient.createTransfer = async function(fileSize, contentType) {
            var fetchFn = typeof ApiClient._fetch === 'function'
                        ? ApiClient._fetch.bind(ApiClient)
                        : function(path, opts) { return fetch(path, opts); };
            var res = await fetchFn('/api/transfers/create', {
                method:  'POST',
                headers: Object.assign({ 'Content-Type': 'application/json' }, ApiClient._authHeaders()),
                body:    JSON.stringify({
                    file_size_bytes:   fileSize,
                    content_type_hint: contentType || 'application/octet-stream',
                    transfer_id:       derivedTransferId
                })
            });
            if (!res.ok) {
                if (res.status === 401) throw new Error('ACCESS_TOKEN_INVALID');
                if (res.status === 409) throw new Error('Transfer ID collision — please retry');
                throw new Error('Create transfer failed: ' + res.status);
            }
            return res.json();
        };

        try {
            await _v025_startProcessing.call(this);
        } finally {
            SendCrypto.generateKey    = origGenKey;
            ApiClient.createTransfer  = origCreateTransfer;
        }
        // Store friendly key in result and re-render (original already rendered without it)
        if (this.result) {
            this.result.friendlyKey = this._v026_friendlyKey;
            this.render();
            this.setupDynamicListeners();
        }
    } else {
        await _v025_startProcessing.call(this);
    }
};

// ─── Override: setupEventListeners ──────────────────────────────────────────
SendUpload.prototype.setupEventListeners = function() {
    var self = this;
    _v025_setupEvents.call(this);

    // Share mode card click → save selection and auto-advance to confirmation
    this.querySelectorAll('.v026-share-card[data-share-mode]').forEach(function(card) {
        card.addEventListener('click', function() {
            self._v026_shareMode = card.getAttribute('data-share-mode');
            self.state = 'confirming';
            self.render();
            self.setupEventListeners();
        });
    });

    // Back from confirmation → share choice
    var backToShare = this.querySelector('#v026-back-to-share');
    if (backToShare) {
        backToShare.addEventListener('click', function() {
            self._v023_goingBack = true;
            self.state = 'choosing-share';
            self.render();
            self.setupEventListeners();
        });
    }

    // Change buttons in confirmation summary
    var changeDelivery = this.querySelector('[data-change="delivery"]');
    if (changeDelivery) {
        changeDelivery.addEventListener('click', function() {
            self._v023_goingBack = true;
            self.state = 'choosing-delivery';
            self.render();
            self.setupEventListeners();
        });
    }
    var changeShare = this.querySelector('[data-change="share"]');
    if (changeShare) {
        changeShare.addEventListener('click', function() {
            self._v023_goingBack = true;
            self.state = 'choosing-share';
            self.render();
            self.setupEventListeners();
        });
    }

    // Word picker: shuffle individual words
    this.querySelectorAll('[data-shuffle-word]').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var idx = parseInt(btn.getAttribute('data-shuffle-word'), 10);
            if (self._v026_friendlyParts && self._v026_friendlyParts.words[idx] !== undefined) {
                self._v026_friendlyParts.words[idx] = v026_randomWord();
                self._v026_friendlyKey = v026_formatFriendly(self._v026_friendlyParts);
                self.render();
                self.setupEventListeners();
            }
        });
    });

    // Word picker: shuffle all
    var shuffleAll = this.querySelector('#v026-shuffle-all');
    if (shuffleAll) {
        shuffleAll.addEventListener('click', function() {
            self._v026_friendlyParts = v026_newFriendlyKey();
            self._v026_friendlyKey = v026_formatFriendly(self._v026_friendlyParts);
            self.render();
            self.setupEventListeners();
        });
    }
};

// ─── Override: renderResult — show result in chosen mode ────────────────────
SendUpload.prototype.renderResult = function() {
    if (this.state !== 'complete' || !this.result) return '';

    var result = this.result;
    var selectedMode = this._v026_shareMode || 'token';

    // File summary at top
    var file = this.selectedFile;
    var isFolder = !!this._folderScan;
    var icon = isFolder ? '&#128193;' : '&#128196;';
    var name = isFolder ? (this._folderName || 'folder') + '/' : (file ? file.name : '');
    var meta = isFolder
        ? this._folderScan.fileCount + ' files &middot; ' + this.formatBytes(this._folderScan.totalSize)
        : (file ? this.formatBytes(file.size) : '');

    // Success message
    var successHtml =
        '<div class="v026-success-banner">' +
            '<span class="v026-success-banner__icon">&#10003;</span>' +
            '<span>Encrypted and uploaded successfully</span>' +
        '</div>';

    // File summary
    var summaryHtml =
        '<div class="v023-file-summary v023-file-summary--compact">' +
            '<span class="v023-file-summary__icon">' + icon + '</span>' +
            '<div>' +
                '<div class="v023-file-summary__name">' + this.escapeHtml(name) + '</div>' +
                '<div class="v023-file-summary__meta">' + meta + '</div>' +
            '</div>' +
        '</div>';

    // Card picker mode (user clicked "Change")
    if (this._v026_showPicker) {
        var self = this;
        var cardsHtml = SHARE_MODES.map(function(mode) {
            var activeClass = mode.id === selectedMode ? ' v026-share-card--active' : '';
            return '<div class="v026-share-card' + activeClass + '" data-share-mode="' + mode.id + '">' +
                '<div class="v026-share-card__icon">' + mode.icon + '</div>' +
                '<div class="v026-share-card__body">' +
                    '<div class="v026-share-card__title">' + self.escapeHtml(mode.title) + '</div>' +
                    '<div class="v026-share-card__desc">' + self.escapeHtml(mode.desc) + '</div>' +
                    '<div class="v026-share-card__hint">' + self.escapeHtml(mode.hint) + '</div>' +
                '</div>' +
            '</div>';
        }).join('');

        return successHtml + summaryHtml +
            '<h3 class="v023-step-title">How do you want to share it?</h3>' +
            '<div class="v026-share-cards">' + cardsHtml + '</div>' +
            '<div style="margin-top: var(--space-6, 1.5rem); text-align: center;">' +
                '<button class="btn btn-sm" id="send-another-btn" style="color: var(--accent, var(--color-primary, #4ECDC4));">' +
                    this.escapeHtml(this.t('upload.result.send_another')) +
                '</button>' +
            '</div>';
    }

    // Default: show the selected mode's sharing details directly
    var detailHtml = '';
    var modeConfig = SHARE_MODES.find(function(m) { return m.id === selectedMode; });

    if (selectedMode === 'combined') {
        detailHtml = this._v026_renderCombined(result);
    } else if (selectedMode === 'separate') {
        detailHtml = this._v026_renderSeparate(result);
    } else if (selectedMode === 'token') {
        detailHtml = this._v026_renderToken(result);
    }

    // Delivery mode reminder
    var deliveryLabel = '';
    if (result.delivery && result.delivery !== 'download') {
        var deliveryOpt = (this._v023_deliveryOptions || []).find(function(o) { return o.id === result.delivery; });
        if (deliveryOpt) {
            deliveryLabel =
                '<div class="v023-delivery-choice" style="margin-bottom: var(--space-3, 0.75rem);">' +
                    '<span class="v023-delivery-choice__label">Delivery:</span>' +
                    '<span class="v023-delivery-choice__value">' + deliveryOpt.icon + ' ' + this.escapeHtml(deliveryOpt.title) + '</span>' +
                '</div>';
        }
    }

    // When encrypted with a friendly key, mode is locked (key is PBKDF2-derived, can't switch)
    var modeLocked = selectedMode === 'token' && result.friendlyKey;
    var changeBtn = modeLocked ? '' : '<button class="v026-mode-change" id="v026-change-mode">Change</button>';

    return successHtml + summaryHtml + deliveryLabel +
        '<div class="v026-mode-header">' +
            '<span class="v026-mode-header__icon">' + modeConfig.icon + '</span>' +
            '<span class="v026-mode-header__title">' + this.escapeHtml(modeConfig.title) + '</span>' +
            changeBtn +
        '</div>' +
        detailHtml +
        '<div class="v026-security-note">' +
            '<span>&#128274;</span> ' + this.escapeHtml(modeConfig.security) +
        '</div>' +
        this._renderTimings() +
        (result.transparency ? '<send-transparency id="transparency-panel"></send-transparency>' : '') +
        '<div style="margin-top: var(--space-6, 1.5rem); text-align: center;">' +
            '<button class="btn btn-sm" id="send-another-btn" style="color: var(--accent, var(--color-primary, #4ECDC4));">' +
                this.escapeHtml(this.t('upload.result.send_another')) +
            '</button>' +
        '</div>';
};

// ─── Combined link rendering ───────────────────────────────────────────────
SendUpload.prototype._v026_renderCombined = function(result) {
    return '<div class="v026-share-value">' +
        '<label class="v026-share-label">Share this link</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box" id="combined-link">' + this.escapeHtml(result.combinedUrl) + '</div>' +
            '<button class="btn btn-primary btn-sm" data-copy="combined-link">' + this.escapeHtml(this.t('upload.result.copy_link')) + '</button>' +
        '</div>' +
        '<a href="' + this.escapeHtml(result.combinedUrl) + '" target="_blank" rel="noopener" class="v026-open-link">Open in new tab &#8599;</a>' +
    '</div>';
};

// ─── Separate link + key rendering ──────────────────────────────────────────
SendUpload.prototype._v026_renderSeparate = function(result) {
    return '<div class="v026-share-value">' +
        '<label class="v026-share-label">1. Send this link</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box" id="link-only">' + this.escapeHtml(result.linkOnlyUrl) + '</div>' +
            '<button class="btn btn-sm" data-copy="link-only">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
        '</div>' +
    '</div>' +
    '<div class="v026-share-value" style="margin-top: var(--space-4, 1rem);">' +
        '<label class="v026-share-label">2. Send this key separately</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box v026-share-box--key" id="decryption-key">' + this.escapeHtml(result.keyString) + '</div>' +
            '<button class="btn btn-sm" data-copy="decryption-key">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
        '</div>' +
        '<div class="v026-share-guidance">Send through a different channel (e.g. link via email, key via chat)</div>' +
    '</div>';
};

// ─── Token + key rendering ──────────────────────────────────────────────────
SendUpload.prototype._v026_renderToken = function(result) {
    var transferId = result.transferId || '';
    var friendlyKey = result.friendlyKey || null;

    if (friendlyKey) {
        return '<div class="v026-share-value">' +
            '<label class="v026-share-label">1. Share this token</label>' +
            '<div class="v026-share-row">' +
                '<div class="v026-share-box v026-share-box--token" id="transfer-token">' + this.escapeHtml(transferId) + '</div>' +
                '<button class="btn btn-sm" data-copy="transfer-token">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
            '</div>' +
            '<div class="v026-share-guidance">Recipient enters this at ' + this.escapeHtml(window.location.origin) + '</div>' +
        '</div>' +
        '<div class="v026-share-value" style="margin-top: var(--space-4, 1rem);">' +
            '<label class="v026-share-label">2. Share this key</label>' +
            '<div class="v026-share-row">' +
                '<div class="v026-share-box v026-share-box--friendly" id="friendly-key">' + this.escapeHtml(friendlyKey) + '</div>' +
                '<button class="btn btn-sm" data-copy="friendly-key">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
            '</div>' +
            '<div class="v026-share-guidance">Tell them this key &mdash; easy to say and type</div>' +
        '</div>';
    }

    // Fallback: no friendly key, show raw key
    return '<div class="v026-share-value">' +
        '<label class="v026-share-label">1. Share this token</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box v026-share-box--token" id="transfer-token">' + this.escapeHtml(transferId) + '</div>' +
            '<button class="btn btn-sm" data-copy="transfer-token">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
        '</div>' +
        '<div class="v026-share-guidance">Recipient enters this at ' + this.escapeHtml(window.location.origin) + '</div>' +
    '</div>' +
    '<div class="v026-share-value" style="margin-top: var(--space-4, 1rem);">' +
        '<label class="v026-share-label">2. Share the decryption key</label>' +
        '<div class="v026-share-row">' +
            '<div class="v026-share-box v026-share-box--key" id="decryption-key">' + this.escapeHtml(result.keyString) + '</div>' +
            '<button class="btn btn-sm" data-copy="decryption-key">' + this.escapeHtml(this.t('upload.result.copy')) + '</button>' +
        '</div>' +
    '</div>';
};

// ─── Override: setupDynamicListeners — handle mode cards + copy ──────────────
SendUpload.prototype.setupDynamicListeners = function() {
    var self = this;

    // Copy buttons
    this.querySelectorAll('[data-copy]').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            var targetId = e.target.getAttribute('data-copy');
            var el = self.querySelector('#' + targetId);
            if (el) self.copyToClipboard(el.textContent, e.target);
        });
    });

    // Share mode card selection (in picker view on result screen)
    this.querySelectorAll('[data-share-mode]').forEach(function(card) {
        card.addEventListener('click', function() {
            self._v026_shareMode = card.getAttribute('data-share-mode');
            self._v026_showPicker = false;
            self.render();
            self.setupDynamicListeners();
        });
    });

    // Change mode button — show the card picker
    var changeBtn = this.querySelector('#v026-change-mode');
    if (changeBtn) {
        changeBtn.addEventListener('click', function() {
            self._v026_showPicker = true;
            self.render();
            self.setupDynamicListeners();
        });
    }

    // Transparency panel
    var transparencyPanel = this.querySelector('#transparency-panel');
    if (transparencyPanel && self.result && self.result.transparency) {
        transparencyPanel.setData(self.result.transparency);
    }

    // Send another
    var sendAnotherBtn = this.querySelector('#send-another-btn');
    if (sendAnotherBtn) {
        sendAnotherBtn.addEventListener('click', function() { self.resetForNew(); });
    }
};

// ─── Override: resetForNew — clear share mode ───────────────────────────────
SendUpload.prototype.resetForNew = function() {
    this._v026_shareMode      = null;
    this._v026_showPicker     = false;
    this._v026_friendlyParts  = null;
    this._v026_friendlyKey    = null;
    _v025_resetForNew.call(this);
};

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v026-styles')) return;
    var style = document.createElement('style');
    style.id = 'v026-styles';
    style.textContent = '\
        /* Success banner */\
        .v026-success-banner {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
            background: rgba(78, 205, 196, 0.08);\
            border: 1px solid rgba(78, 205, 196, 0.25);\
            border-radius: var(--radius-sm, 6px);\
            margin-bottom: var(--space-4, 1rem);\
            font-size: var(--text-sm, 0.875rem);\
            color: var(--color-success, #4ECDC4);\
            font-weight: var(--weight-semibold, 600);\
        }\
        .v026-success-banner__icon {\
            font-size: 1.25rem;\
            flex-shrink: 0;\
        }\
        \
        /* Share mode cards */\
        .v026-share-cards {\
            display: flex;\
            flex-direction: column;\
            gap: var(--space-3, 0.75rem);\
            margin-top: var(--space-4, 1rem);\
        }\
        .v026-share-card {\
            display: flex;\
            align-items: flex-start;\
            gap: var(--space-3, 0.75rem);\
            padding: var(--space-4, 1rem);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-md, 12px);\
            background: var(--color-surface, #1E2A4A);\
            cursor: pointer;\
            transition: border-color 0.2s, background 0.2s, transform 0.15s;\
        }\
        .v026-share-card:hover {\
            border-color: var(--color-primary, #4ECDC4);\
            background: var(--accent-subtle, rgba(78, 205, 196, 0.12));\
            transform: translateY(-1px);\
        }\
        .v026-share-card--active {\
            border-color: var(--color-primary, #4ECDC4);\
            background: var(--accent-subtle, rgba(78, 205, 196, 0.08));\
        }\
        .v026-share-card__icon {\
            font-size: 1.5rem;\
            flex-shrink: 0;\
            margin-top: 2px;\
        }\
        .v026-share-card__body { flex: 1; min-width: 0; }\
        .v026-share-card__title {\
            font-size: var(--text-body, 1rem);\
            font-weight: var(--weight-semibold, 600);\
            color: var(--color-text, #E0E0E0);\
            margin-bottom: var(--space-1, 0.25rem);\
        }\
        .v026-share-card__desc {\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            line-height: 1.5;\
            margin-bottom: var(--space-2, 0.5rem);\
        }\
        .v026-share-card__hint {\
            font-size: var(--text-micro, 0.625rem);\
            color: var(--color-primary, #4ECDC4);\
            opacity: 0.8;\
        }\
        \
        /* Confirmation summary */\
        .v026-summary {\
            display: flex;\
            flex-direction: column;\
            gap: 0;\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-md, 12px);\
            overflow: hidden;\
        }\
        .v026-summary__row {\
            display: flex;\
            align-items: center;\
            gap: var(--space-3, 0.75rem);\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
            background: var(--color-surface, #1E2A4A);\
            border-bottom: 1px solid var(--color-border, rgba(78, 205, 196, 0.1));\
        }\
        .v026-summary__row:last-child { border-bottom: none; }\
        .v026-summary__label {\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            min-width: 80px;\
            flex-shrink: 0;\
            text-transform: uppercase;\
            letter-spacing: 0.05em;\
            font-weight: var(--weight-semibold, 600);\
        }\
        .v026-summary__value {\
            flex: 1;\
            font-size: var(--text-sm, 0.875rem);\
            color: var(--color-text, #E0E0E0);\
            min-width: 0;\
            overflow: hidden;\
            text-overflow: ellipsis;\
            white-space: nowrap;\
        }\
        .v026-summary__icon { font-size: 1rem; }\
        .v026-summary__meta {\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
        }\
        .v026-summary__change {\
            background: none;\
            border: none;\
            color: var(--color-text-secondary, #8892A0);\
            font-size: var(--text-micro, 0.625rem);\
            cursor: pointer;\
            padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);\
            border-radius: var(--radius-xs, 4px);\
            text-decoration: underline;\
            text-underline-offset: 2px;\
            flex-shrink: 0;\
        }\
        .v026-summary__change:hover {\
            color: var(--color-primary, #4ECDC4);\
        }\
        \
        /* Big send button */\
        .v026-send-action {\
            text-align: center;\
            margin-top: var(--space-6, 1.5rem);\
        }\
        .v026-send-btn {\
            display: inline-flex;\
            align-items: center;\
            gap: var(--space-3, 0.75rem);\
            padding: var(--space-4, 1rem) var(--space-8, 2rem);\
            background: var(--color-primary, #4ECDC4);\
            color: var(--color-bg, #1A1A2E);\
            border: none;\
            border-radius: var(--radius-md, 12px);\
            font-size: var(--text-lg, 1.25rem);\
            font-weight: var(--weight-bold, 700);\
            cursor: pointer;\
            transition: transform 0.15s, box-shadow 0.2s, background 0.2s;\
            box-shadow: 0 4px 16px rgba(78, 205, 196, 0.3);\
        }\
        .v026-send-btn:hover {\
            transform: translateY(-2px);\
            box-shadow: 0 6px 24px rgba(78, 205, 196, 0.45);\
            background: #5DE0D6;\
        }\
        .v026-send-btn:active {\
            transform: translateY(0);\
            box-shadow: 0 2px 8px rgba(78, 205, 196, 0.25);\
        }\
        .v026-send-btn__icon { font-size: 1.5rem; }\
        .v026-send-btn__text { white-space: nowrap; }\
        \
        /* Mode header (after selection) */\
        .v026-mode-header {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
            background: rgba(78, 205, 196, 0.06);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-sm, 6px);\
            margin-bottom: var(--space-4, 1rem);\
        }\
        .v026-mode-header__icon { font-size: 1.25rem; }\
        .v026-mode-header__title {\
            font-weight: var(--weight-semibold, 600);\
            color: var(--color-primary, #4ECDC4);\
            flex: 1;\
        }\
        .v026-mode-change {\
            background: none;\
            border: none;\
            color: var(--color-text-secondary, #8892A0);\
            font-size: var(--text-small, 0.75rem);\
            cursor: pointer;\
            padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);\
            border-radius: var(--radius-xs, 4px);\
        }\
        .v026-mode-change:hover {\
            color: var(--color-primary, #4ECDC4);\
            background: rgba(78, 205, 196, 0.08);\
        }\
        \
        /* Share value blocks */\
        .v026-share-value {\
            margin-top: var(--space-3, 0.75rem);\
        }\
        .v026-share-label {\
            display: block;\
            font-weight: var(--weight-semibold, 600);\
            font-size: var(--text-sm, 0.875rem);\
            color: var(--color-text-secondary, #8892A0);\
            margin-bottom: var(--space-2, 0.5rem);\
        }\
        .v026-share-row {\
            display: flex;\
            gap: var(--space-2, 0.5rem);\
            align-items: center;\
        }\
        .v026-share-box {\
            flex: 1;\
            min-width: 0;\
            font-family: var(--font-mono, monospace);\
            font-size: var(--text-sm, 0.875rem);\
            background: var(--bg-secondary, #16213E);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-sm, 6px);\
            padding: 0.5rem 0.75rem;\
            white-space: nowrap;\
            overflow-x: auto;\
            color: var(--color-text, #E0E0E0);\
        }\
        .v026-share-box--token {\
            font-size: var(--text-lg, 1.25rem);\
            letter-spacing: 0.1em;\
            font-weight: var(--weight-semibold, 600);\
            text-align: center;\
            color: var(--color-primary, #4ECDC4);\
        }\
        .v026-share-box--key {\
            font-size: var(--text-small, 0.75rem);\
            word-break: break-all;\
            white-space: normal;\
        }\
        .v026-share-guidance {\
            font-size: var(--text-micro, 0.625rem);\
            color: var(--color-text-secondary, #8892A0);\
            opacity: 0.7;\
            margin-top: var(--space-1, 0.25rem);\
        }\
        .v026-open-link {\
            display: inline-block;\
            margin-top: var(--space-2, 0.5rem);\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            text-decoration: none;\
        }\
        .v026-open-link:hover {\
            color: var(--color-primary, #4ECDC4);\
        }\
        \
        /* Security note */\
        .v026-security-note {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            margin-top: var(--space-4, 1rem);\
            padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            background: rgba(78, 205, 196, 0.04);\
            border-radius: var(--radius-sm, 6px);\
        }\
        \
        /* Word picker */\
        .v026-word-picker {\
            margin-top: var(--space-4, 1rem);\
            padding: var(--space-4, 1rem);\
            background: var(--color-surface, #1E2A4A);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-md, 12px);\
        }\
        .v026-word-picker__label {\
            display: block;\
            font-size: var(--text-sm, 0.875rem);\
            font-weight: var(--weight-semibold, 600);\
            color: var(--color-text, #E0E0E0);\
            margin-bottom: var(--space-3, 0.75rem);\
        }\
        .v026-word-picker__slots {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            justify-content: center;\
            flex-wrap: wrap;\
        }\
        .v026-word-picker__slot {\
            display: flex;\
            align-items: center;\
            gap: var(--space-1, 0.25rem);\
            background: var(--bg-secondary, #16213E);\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            border-radius: var(--radius-sm, 6px);\
            padding: var(--space-2, 0.5rem) var(--space-3, 0.75rem);\
        }\
        .v026-word-picker__word,\
        .v026-word-picker__suffix {\
            font-family: var(--font-mono, monospace);\
            font-size: var(--text-body, 1rem);\
            font-weight: var(--weight-semibold, 600);\
            color: var(--color-primary, #4ECDC4);\
        }\
        .v026-word-picker__shuffle-btn {\
            background: none;\
            border: none;\
            cursor: pointer;\
            padding: 2px;\
            font-size: 0.875rem;\
            color: var(--color-text-secondary, #8892A0);\
            border-radius: var(--radius-xs, 4px);\
            transition: color 0.2s, background 0.2s;\
            line-height: 1;\
        }\
        .v026-word-picker__shuffle-btn:hover {\
            color: var(--color-primary, #4ECDC4);\
            background: rgba(78, 205, 196, 0.08);\
        }\
        .v026-word-picker__sep {\
            color: var(--color-text-secondary, #8892A0);\
            font-size: var(--text-sm, 0.875rem);\
        }\
        .v026-word-picker__preview {\
            display: flex;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
            margin-top: var(--space-3, 0.75rem);\
            justify-content: center;\
        }\
        .v026-word-picker__key {\
            font-family: var(--font-mono, monospace);\
            font-size: var(--text-lg, 1.25rem);\
            font-weight: var(--weight-bold, 700);\
            color: var(--color-primary, #4ECDC4);\
            letter-spacing: 0.05em;\
        }\
        .v026-word-picker__action {\
            background: none;\
            border: 1px solid var(--color-border, rgba(78, 205, 196, 0.15));\
            cursor: pointer;\
            padding: var(--space-1, 0.25rem) var(--space-2, 0.5rem);\
            font-size: var(--text-small, 0.75rem);\
            color: var(--color-text-secondary, #8892A0);\
            border-radius: var(--radius-xs, 4px);\
            transition: color 0.2s, border-color 0.2s;\
        }\
        .v026-word-picker__action:hover {\
            color: var(--color-primary, #4ECDC4);\
            border-color: var(--color-primary, #4ECDC4);\
        }\
        .v026-word-picker__hint {\
            text-align: center;\
            margin-top: var(--space-2, 0.5rem);\
            font-size: var(--text-micro, 0.625rem);\
            color: var(--color-text-secondary, #8892A0);\
            opacity: 0.7;\
        }\
        \
        /* Friendly key box in result */\
        .v026-share-box--friendly {\
            font-size: var(--text-lg, 1.25rem);\
            letter-spacing: 0.05em;\
            font-weight: var(--weight-semibold, 600);\
            text-align: center;\
            color: var(--color-primary, #4ECDC4);\
        }\
        \
        /* Mobile */\
        @media (max-width: 480px) {\
            .v026-share-row { flex-direction: column; align-items: stretch; }\
            .v026-share-row .btn { width: 100%; }\
            .v026-summary__label { min-width: 60px; }\
            .v026-send-btn { width: 100%; justify-content: center; }\
            .v026-word-picker__slots { flex-direction: column; }\
            .v026-word-picker__sep { display: none; }\
        }\
    ';
    document.head.appendChild(style);
})();

console.log('[send-upload-v026] Five-step wizard: Upload > Delivery > Share mode > Confirm & Send > Done');

})();
