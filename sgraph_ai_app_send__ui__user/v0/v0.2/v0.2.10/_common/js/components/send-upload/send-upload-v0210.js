/* =============================================================================
   SGraph Send — Upload Component
   v0.2.10 — Surgical overlay on v0.2.9

   Changes:
     - Fix stepper + button position: consistent height header row so the
       progress indicator doesn't shift between steps
     - Fix encryption message (step 5): remove lighter blue box around the
       carousel message, place it directly in the dark section, vertically
       centred with the stats column
     - Gallery first: when all uploaded files are images, reorder delivery
       options so "Show as photo gallery" comes before "Let them browse"
     - Clickable test files: all test file cards work on click (fetch file
       and feed into upload flow), not just drag-and-drop
     - Multi-image test: "4 test images" card generates sample images
     - Folder simulation: "Test folder" card bundles all test files as a
       multi-file upload to test folder/browse delivery options

   Loads AFTER v0.2.9 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v0210] SendUpload not found — skipping');
    return;
}

// ─── Store methods we override ──────────────────────────────────────────────
var _v028_advanceToDelivery = SendUpload.prototype._v023_advanceToDelivery;
var _v028_renderProcessing  = SendUpload.prototype._v023_renderProcessing;

// ─── Fix 1: Gallery first when all images ───────────────────────────────────
SendUpload.prototype._v023_advanceToDelivery = function() {
    _v028_advanceToDelivery.call(this);

    var opts = this._v023_deliveryOptions;
    if (!opts || opts.length <= 1) return;

    // Check if all files are images
    var scan = this._folderScan;
    var allImages = false;
    if (scan && scan.entries) {
        var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
        var files = scan.entries.filter(function(e) { return !e.isDir; });
        allImages = files.length > 0 && files.every(function(e) {
            var ext = (e.name || '').split('.').pop().toLowerCase();
            return IMAGE_EXTS.indexOf(ext) !== -1;
        });
    }

    if (allImages) {
        var gallery = [], browse = [], rest = [];
        opts.forEach(function(o) {
            if (o.id === 'gallery')       gallery.push(o);
            else if (o.id === 'browse')   browse.push(o);
            else if (o.id === 'download') rest.push(o);
            else                          browse.push(o);
        });
        this._v023_deliveryOptions = gallery.concat(browse).concat(rest);
        this._v023_recommendedDelivery = 'gallery';
        this.render();
        this.setupEventListeners();
    }
};

// ─── Fix 2: Encryption message — remove lighter blue box, vertically centre ─
SendUpload.prototype._v023_renderProcessing = function() {
    var stage = SendUpload.PROGRESS_STAGES[this.state];
    var pct   = stage ? stage.pct : 5;
    var label = stage ? this.t(stage.label) : 'Processing...';

    var allStages = ['zipping', 'reading', 'encrypting', 'creating', 'uploading', 'completing'];
    var ts = this._stageTimestamps || {};
    var completedRows = '';
    var currentIndex = allStages.indexOf(this.state);

    for (var i = 0; i < allStages.length; i++) {
        var s = allStages[i];
        var next = allStages[i + 1] || this.state;
        if (ts[s] && ts[next] && i < currentIndex) {
            var ms = ts[next] - ts[s];
            var stageInfo = SendUpload.PROGRESS_STAGES[s];
            var stageLabel = stageInfo ? this.t(stageInfo.label) : s;
            stageLabel = stageLabel.replace('...', '');
            completedRows +=
                '<div class="v028-live-timing__row">' +
                    '<span class="v028-live-timing__label">' + this.escapeHtml(stageLabel) + '</span>' +
                    '<span class="v028-live-timing__check">&#10003;</span>' +
                    '<span class="v028-live-timing__ms">' + ms + 'ms</span>' +
                '</div>';
        }
    }

    if (this._v027_carouselIndex === undefined) {
        this._v027_carouselIndex = 0;
    }
    var CAROUSEL = SendUpload.CAROUSEL_MESSAGES || [];
    var msg = CAROUSEL.length > 0 ? CAROUSEL[this._v027_carouselIndex % CAROUSEL.length] : null;
    var carouselHtml = msg
        ? '<div class="v028-process-col v0210-process-col--messages">' +
              '<div class="v027-carousel" id="v027-carousel">' +
                  '<div class="v027-carousel__message v027-carousel__message--visible">' +
                      '<span class="v027-carousel__icon">' + msg.icon + '</span>' +
                      '<span class="v027-carousel__text">' + this.escapeHtml(msg.text) + '</span>' +
                  '</div>' +
              '</div>' +
          '</div>'
        : '<div class="v028-process-col v0210-process-col--messages">' +
              '<div class="v023-processing__hint">Your file is being encrypted in your browser. Keep this tab open.</div>' +
          '</div>';

    var statsHtml = completedRows
        ? '<div class="v028-process-col v028-process-col--stats">' +
              '<div class="v028-live-timing">' + completedRows + '</div>' +
          '</div>'
        : '';

    return '<div class="v023-processing">' +
        '<div class="v023-processing__label">' + this.escapeHtml(label) + '</div>' +
        '<div class="progress-bar" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
            '<div class="progress-bar__fill" style="width: ' + pct + '%;"></div>' +
        '</div>' +
        '<div class="v028-process-columns">' +
            carouselHtml +
            statsHtml +
        '</div>' +
    '</div>';
};

// ─── Fix 3: Clickable test files + multi-image + folder simulation ──────────
if (typeof SendTestFiles !== 'undefined') {
    var _origRender = SendTestFiles.prototype.render;

    // Helper: feed a single file into the upload component
    function feedSingleFile(file) {
        var upload = document.querySelector('send-upload');
        if (!upload) return;
        upload._v025_multiFile = false;
        upload._folderScan = null;
        upload._folderName = null;
        upload.selectedFile = file;
        upload._v023_advanceToDelivery();
    }

    // Helper: feed multiple files into the upload component as a bundle
    function feedMultiFiles(files, folderName) {
        var upload = document.querySelector('send-upload');
        if (!upload) return;
        upload._v025_multiFile = true;
        upload._folderName = folderName || (files.length + ' files');
        upload._folderScan = {
            entries: files.map(function(f) {
                return { path: f.name, file: f, isDir: false, name: f.name };
            }),
            fileCount: files.length,
            folderCount: 0,
            totalSize: files.reduce(function(sum, f) { return sum + f.size; }, 0)
        };
        upload._folderOptions = { level: 9, includeEmpty: false, includeHidden: false };
        upload._v023_advanceToDelivery();
    }

    // Helper: generate sample images
    function generateTestImages() {
        var colours = [
            { name: 'sunset.png',   r: 255, g: 107, b:  74 },
            { name: 'ocean.png',    r:  78, g: 205, b: 196 },
            { name: 'meadow.png',   r: 107, g: 203, b:  80 },
            { name: 'lavender.png', r: 155, g:  89, b: 182 }
        ];

        return colours.map(function(c) {
            var canvas = document.createElement('canvas');
            canvas.width = 400;
            canvas.height = 300;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
            ctx.fillRect(0, 0, 400, 300);
            var grad = ctx.createLinearGradient(0, 0, 400, 300);
            grad.addColorStop(0, 'rgba(255,255,255,0.3)');
            grad.addColorStop(0.5, 'rgba(0,0,0,0)');
            grad.addColorStop(1, 'rgba(0,0,0,0.3)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 400, 300);
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = 'bold 24px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(c.name.replace('.png', ''), 200, 160);
            var dataUrl = canvas.toDataURL('image/png');
            var byteString = atob(dataUrl.split(',')[1]);
            var ab = new ArrayBuffer(byteString.length);
            var ia = new Uint8Array(ab);
            for (var i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
            }
            return new File([ab], c.name, { type: 'image/png' });
        });
    }

    SendTestFiles.prototype.render = function() {
        _origRender.call(this);

        var grid = this.querySelector('.test-files__grid');
        if (!grid) return;

        // ── Make existing file cards clickable (fetch + feed into upload) ──
        var basePath = this._basePath();
        grid.querySelectorAll('.test-file[data-file-url]').forEach(function(card) {
            card.addEventListener('click', function(e) {
                e.preventDefault();
                var url  = card.getAttribute('data-file-url');
                var name = card.getAttribute('data-file-name');
                var mime = card.getAttribute('data-file-mime');
                card.style.opacity = '0.5';
                fetch(url).then(function(r) { return r.arrayBuffer(); }).then(function(buf) {
                    card.style.opacity = '';
                    feedSingleFile(new File([buf], name, { type: mime }));
                }).catch(function() { card.style.opacity = ''; });
            });
        });

        // ── "4 test images" card ──
        var imagesCard = document.createElement('a');
        imagesCard.className = 'test-file v0210-test-special';
        imagesCard.href = '#';
        imagesCard.draggable = false;
        imagesCard.innerHTML =
            '<svg class="test-file__icon" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M0 2C0 .9.9 0 2 0h8l6 6v12c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V2z" fill="#16213E" stroke="#9B59B6" stroke-width=".75"/>' +
                '<path d="M8 0v4c0 1.1.9 2 2 2h4" stroke="#9B59B6" stroke-width=".75"/>' +
                '<rect x="3" y="10" width="10" height="7" rx="1" fill="none" stroke="#9B59B6" stroke-width=".75"/>' +
                '<circle cx="5.5" cy="12.5" r="1" fill="#4ECDC4"/>' +
                '<path d="M3 16l3-3 2 1.5 2.5-2.5L13 15" stroke="#4ECDC4" stroke-width=".75" fill="none"/>' +
            '</svg>' +
            '<span class="test-file__name">4 test images</span>' +
            '<span class="test-file__size">click to load</span>';
        grid.appendChild(imagesCard);
        imagesCard.addEventListener('click', function(e) {
            e.preventDefault();
            feedMultiFiles(generateTestImages(), '4 files');
        });

        // ── "Test folder" card — bundles all test files as a folder ──
        var folderCard = document.createElement('a');
        folderCard.className = 'test-file v0210-test-special';
        folderCard.href = '#';
        folderCard.draggable = false;
        folderCard.innerHTML =
            '<svg class="test-file__icon" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                '<path d="M0 4C0 2.9.9 2 2 2h4l2 2h6c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V4z" fill="#16213E" stroke="#E07C4F" stroke-width=".75"/>' +
                '<line x1="4" y1="10" x2="12" y2="10" stroke="#E07C4F" stroke-width=".5"/>' +
                '<line x1="4" y1="13" x2="10" y2="13" stroke="#E07C4F" stroke-width=".5"/>' +
            '</svg>' +
            '<span class="test-file__name">Test folder</span>' +
            '<span class="test-file__size">all 5 files</span>';
        grid.appendChild(folderCard);

        var self = this;
        folderCard.addEventListener('click', function(e) {
            e.preventDefault();
            folderCard.style.opacity = '0.5';

            // Fetch all test files and bundle them
            var files = SendTestFiles.FILES;
            var promises = files.map(function(f) {
                var url = basePath + '/' + f.name;
                return fetch(url).then(function(r) { return r.arrayBuffer(); }).then(function(buf) {
                    return new File([buf], f.name, { type: f.mime });
                });
            });
            Promise.all(promises).then(function(fetched) {
                folderCard.style.opacity = '';
                feedMultiFiles(fetched, 'test-files');
            }).catch(function() { folderCard.style.opacity = ''; });
        });
    };
}

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v0210-styles')) return;
    var style = document.createElement('style');
    style.id = 'v0210-styles';
    style.textContent = '\
        /* Fix 1: Stable header row height — prevent stepper shifting */\
        .v028-header-row {\
            min-height: 72px;\
            align-items: center;\
        }\
        \
        /* Fix 2: Remove lighter blue box from processing messages column */\
        .v0210-process-col--messages {\
            background: transparent !important;\
            border: none !important;\
            padding: var(--space-3, 0.75rem) !important;\
            display: flex !important;\
            align-items: center !important;\
            justify-content: center !important;\
        }\
        .v0210-process-col--messages .v027-carousel {\
            width: 100%;\
        }\
        .v0210-process-col--messages .v027-carousel__message {\
            display: flex;\
            align-items: center;\
            gap: var(--space-3, 0.75rem);\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
        }\
        .v028-process-columns {\
            align-items: center !important;\
        }\
        \
        /* Special test cards (images + folder) */\
        .v0210-test-special {\
            border-style: dashed !important;\
            cursor: pointer !important;\
        }\
        .v0210-test-special:hover {\
            border-color: var(--color-primary, #4ECDC4) !important;\
            background: rgba(78, 205, 196, 0.08) !important;\
        }\
    ';
    document.head.appendChild(style);
})();

console.log('[send-upload-v0210] Gallery first, clickable test files, test images, test folder, processing fix, stable stepper');

})();
