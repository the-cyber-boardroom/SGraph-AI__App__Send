/* =============================================================================
   SGraph Send — Download Component
   v0.2.13 — Surgical overlay on v0.2.12

   Changes:
     - PDF present mode: fullscreen button in lightbox toolbar opens PDF
       in a dedicated fullscreen viewer (one page at a time, arrow key
       navigation, page counter). Uses pdf.js to render pages to canvas.
     - Fix lightbox top-right layout: SG/Send branding and close button
       overlap. Restructure the lightbox top bar so action buttons, brand,
       and close button don't collide with each other.
     - Add 'f' keyboard shortcut for present mode when PDF is showing.

   Loads AFTER v0.2.12 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

'use strict';

if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v0213] SendDownload not found — skipping');
    return;
}

// ─── SVG icons ──────────────────────────────────────────────────────────────
var ICON_PRESENT = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h12v10H2z"/><path d="M5 8h6M8 6v4"/></svg>';
var ICON_FULLSCREEN = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>';

// ─── PDF.js lazy loader (reuse if already loaded by upload component) ───────
var PDF_JS_CDNS = [
    { js: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' },
    { js: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
      worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js' }
];

function ensurePdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    return new Promise(function(resolve, reject) {
        function tryLoad(urls, idx) {
            if (idx >= urls.length) { reject(new Error('Failed to load pdf.js')); return; }
            var entry = urls[idx];
            var script = document.createElement('script');
            script.src = entry.js;
            script.onload = function() {
                if (window.pdfjsLib) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = entry.worker;
                    resolve();
                } else { tryLoad(urls, idx + 1); }
            };
            script.onerror = function() { tryLoad(urls, idx + 1); };
            document.head.appendChild(script);
        }
        tryLoad(PDF_JS_CDNS, 0);
    });
}

// ─── Helper: detect PDF type ────────────────────────────────────────────────
function isPdf(name) {
    return (name || '').split('.').pop().toLowerCase() === 'pdf';
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 1: Lightbox layout — restructure top bar
//
// The v0.2.7 lightbox top bar has:
//   filename | actions (save/print/share) | counter | save-icon | close
//   + brand positioned absolute top-right overlapping close button
//
// Fix: hide the separate brand element and duplicate save-icon button,
// clean up the flex layout so nothing overlaps.
// ═══════════════════════════════════════════════════════════════════════════

var _v0212_openLightbox = SendDownload.prototype._v025_openLightbox;

SendDownload.prototype._v025_openLightbox = function(index) {
    _v0212_openLightbox.call(this, index);

    // After the lightbox is created/opened, fix the layout
    var overlay = document.getElementById('v025-lightbox');
    if (!overlay) return;

    // Hide the duplicate download button (v025-lb-save) — actions already has "Save locally"
    var dupSave = document.getElementById('v025-lb-save');
    if (dupSave && !dupSave.dataset.v0213Hidden) {
        dupSave.style.display = 'none';
        dupSave.dataset.v0213Hidden = 'true';
    }

    // Hide the brand-top element that overlaps the close button
    var brandTop = overlay.querySelector('.v027-lightbox__brand-top');
    if (brandTop) {
        brandTop.style.display = 'none';
    }

    // Add present mode button for PDFs
    var self = this;
    var files = this._v027_galleryFiles || this._v027_filteredFiles ||
        (this._zipTree ? this._zipTree.filter(function(e) { return !e.dir; }) : []);
    var entry = files[index];

    var existingPresent = document.getElementById('v0213-lb-present');

    if (entry && isPdf(entry.name)) {
        if (!existingPresent) {
            var actionsDiv = overlay.querySelector('.v027-lightbox__actions');
            if (actionsDiv) {
                var presentBtn = document.createElement('button');
                presentBtn.id = 'v0213-lb-present';
                presentBtn.className = 'v025-lightbox__btn v027-lb-action';
                presentBtn.title = 'Present (fullscreen)';
                presentBtn.innerHTML = ICON_FULLSCREEN + ' Present';
                actionsDiv.insertBefore(presentBtn, actionsDiv.firstChild);
                presentBtn.addEventListener('click', function() {
                    self._v0213_openPresenter(self._v025_lightboxIndex);
                });
            }
        } else {
            existingPresent.style.display = '';
        }
    } else if (existingPresent) {
        existingPresent.style.display = 'none';
    }
};

// Update present button visibility when navigating
var _v0212_showLightboxImage = SendDownload.prototype._v025_showLightboxImage;

SendDownload.prototype._v025_showLightboxImage = function(index) {
    _v0212_showLightboxImage.call(this, index);

    var files = this._v027_galleryFiles || this._v027_filteredFiles ||
        (this._zipTree ? this._zipTree.filter(function(e) { return !e.dir; }) : []);
    var entry = files[index];
    var presentBtn = document.getElementById('v0213-lb-present');
    if (presentBtn) {
        presentBtn.style.display = (entry && isPdf(entry.name)) ? '' : 'none';
    }
};

// Add 'f' key for present mode
var _v0212_keyHandler_ref = null;

var _v0212_setupEvents = SendDownload.prototype.setupEventListeners;
SendDownload.prototype.setupEventListeners = function() {
    _v0212_setupEvents.call(this);

    var self = this;
    // Augment the existing key handler with 'f' for present mode
    if (!this._v0213_keyPatched) {
        this._v0213_keyPatched = true;
        document.addEventListener('keydown', function(e) {
            if (!document.getElementById('v025-lightbox')) return;
            if (document.getElementById('v0213-presenter')) return; // presenter handles its own keys
            if (e.key === 'f' || e.key === 'F') {
                var files = self._v027_galleryFiles || self._v027_filteredFiles ||
                    (self._zipTree ? self._zipTree.filter(function(e2) { return !e2.dir; }) : []);
                var entry = files[self._v025_lightboxIndex];
                if (entry && isPdf(entry.name)) {
                    self._v0213_openPresenter(self._v025_lightboxIndex);
                }
            }
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// PRESENT MODE — fullscreen PDF viewer, one page at a time
// ═══════════════════════════════════════════════════════════════════════════

SendDownload.prototype._v0213_openPresenter = function(index) {
    var self = this;
    var files = this._v027_galleryFiles || this._v027_filteredFiles ||
        (this._zipTree ? this._zipTree.filter(function(e) { return !e.dir; }) : []);
    var entry = files[index];
    if (!entry || !isPdf(entry.name)) return;

    // Create presenter overlay
    var presenter = document.createElement('div');
    presenter.id = 'v0213-presenter';
    presenter.className = 'v0213-presenter';
    presenter.innerHTML = '\
        <div class="v0213-presenter__toolbar">\
            <span class="v0213-presenter__name" id="v0213-pr-name"></span>\
            <span class="v0213-presenter__counter" id="v0213-pr-counter"></span>\
            <button class="v0213-presenter__btn" id="v0213-pr-close" title="Exit present mode (Esc)">&times;</button>\
        </div>\
        <div class="v0213-presenter__canvas-wrap" id="v0213-pr-canvas-wrap">\
            <div class="v0213-presenter__loading">Loading PDF\u2026</div>\
        </div>\
        <button class="v0213-presenter__nav v0213-presenter__nav--prev" id="v0213-pr-prev">\
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>\
        </button>\
        <button class="v0213-presenter__nav v0213-presenter__nav--next" id="v0213-pr-next">\
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>\
        </button>';
    document.body.appendChild(presenter);

    var nameEl    = document.getElementById('v0213-pr-name');
    var counterEl = document.getElementById('v0213-pr-counter');
    var canvasWrap = document.getElementById('v0213-pr-canvas-wrap');
    var prevBtn   = document.getElementById('v0213-pr-prev');
    var nextBtn   = document.getElementById('v0213-pr-next');
    var closeBtn  = document.getElementById('v0213-pr-close');

    nameEl.textContent = entry.name;

    var pdfDoc = null;
    var currentPage = 1;
    var totalPages = 0;
    var rendering = false;

    function renderPage(pageNum) {
        if (!pdfDoc || rendering) return;
        rendering = true;
        counterEl.textContent = pageNum + ' / ' + totalPages;
        prevBtn.style.visibility = pageNum > 1 ? 'visible' : 'hidden';
        nextBtn.style.visibility = pageNum < totalPages ? 'visible' : 'hidden';

        pdfDoc.getPage(pageNum).then(function(page) {
            // Calculate scale to fit viewport
            var viewport = page.getViewport({ scale: 1.0 });
            var availW = window.innerWidth - 120;  // leave room for nav arrows
            var availH = window.innerHeight - 80;   // leave room for toolbar
            var scaleW = availW / viewport.width;
            var scaleH = availH / viewport.height;
            var scale  = Math.min(scaleW, scaleH, 3); // cap at 3x

            var scaledViewport = page.getViewport({ scale: scale });

            var canvas = document.createElement('canvas');
            canvas.width  = Math.round(scaledViewport.width);
            canvas.height = Math.round(scaledViewport.height);
            canvas.className = 'v0213-presenter__canvas';
            var ctx = canvas.getContext('2d');

            // White background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            page.render({ canvasContext: ctx, viewport: scaledViewport }).promise.then(function() {
                canvasWrap.innerHTML = '';
                canvasWrap.appendChild(canvas);
                currentPage = pageNum;
                rendering = false;
            }).catch(function() { rendering = false; });
        }).catch(function() { rendering = false; });
    }

    function goPage(delta) {
        var next = currentPage + delta;
        if (next >= 1 && next <= totalPages) {
            renderPage(next);
        }
    }

    function closePresenter() {
        // Exit fullscreen if active
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(function() {});
        }
        var el = document.getElementById('v0213-presenter');
        if (el) el.remove();
        document.removeEventListener('keydown', presenterKeyHandler);
    }

    function presenterKeyHandler(e) {
        if (e.key === 'Escape')     { closePresenter(); e.stopPropagation(); }
        if (e.key === 'ArrowLeft')  { goPage(-1); e.stopPropagation(); }
        if (e.key === 'ArrowRight') { goPage(1); e.stopPropagation(); }
        if (e.key === 'ArrowUp')    { goPage(-1); e.stopPropagation(); }
        if (e.key === 'ArrowDown')  { goPage(1); e.stopPropagation(); }
        if (e.key === ' ')          { goPage(1); e.preventDefault(); e.stopPropagation(); }
        if (e.key === 'Home')       { renderPage(1); e.stopPropagation(); }
        if (e.key === 'End')        { renderPage(totalPages); e.stopPropagation(); }
    }

    prevBtn.addEventListener('click', function() { goPage(-1); });
    nextBtn.addEventListener('click', function() { goPage(1); });
    closeBtn.addEventListener('click', closePresenter);
    document.addEventListener('keydown', presenterKeyHandler);

    // Exit when fullscreen is exited via browser UI
    document.addEventListener('fullscreenchange', function onFSChange() {
        if (!document.fullscreenElement && document.getElementById('v0213-presenter')) {
            closePresenter();
            document.removeEventListener('fullscreenchange', onFSChange);
        }
    });

    // Load the PDF and render page 1
    entry.entry.async('arraybuffer').then(function(buf) {
        return ensurePdfJs().then(function() {
            return window.pdfjsLib.getDocument({ data: buf }).promise;
        });
    }).then(function(doc) {
        pdfDoc = doc;
        totalPages = doc.numPages;
        renderPage(1);

        // Request fullscreen
        if (presenter.requestFullscreen) {
            presenter.requestFullscreen().catch(function() {
                // Fullscreen denied — still works in normal mode
                console.log('[v0213] Fullscreen denied — presenter works in overlay mode');
            });
        }
    }).catch(function(err) {
        canvasWrap.innerHTML = '<div class="v0213-presenter__loading">Failed to load PDF: ' +
            (err.message || 'Unknown error') + '</div>';
    });
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

(function injectStyles() {
    if (document.getElementById('v0213-download-styles')) return;
    var s = document.createElement('style');
    s.id = 'v0213-download-styles';
    s.textContent = '\
        /* ── Fix: lightbox top bar layout ── */\
        /* Hide duplicate save button and overlapping brand */\
        .v027-lightbox__brand-top {\
            display: none !important;\
        }\
        /* Ensure close button has proper spacing */\
        .v025-lightbox__close {\
            margin-left: auto;\
            flex-shrink: 0;\
        }\
        /* Counter should not push close button */\
        .v025-lightbox__counter {\
            flex-shrink: 0;\
        }\
        /* Actions group should not overflow */\
        .v027-lightbox__actions {\
            flex-shrink: 0;\
            flex-wrap: nowrap;\
        }\
        \
        /* ── Present mode overlay ── */\
        .v0213-presenter {\
            position: fixed;\
            inset: 0;\
            z-index: 10001;\
            background: #000;\
            display: flex;\
            flex-direction: column;\
            align-items: center;\
            justify-content: center;\
        }\
        .v0213-presenter__toolbar {\
            position: absolute;\
            top: 0;\
            left: 0;\
            right: 0;\
            display: flex;\
            align-items: center;\
            gap: var(--space-3, 0.75rem);\
            padding: var(--space-2, 0.5rem) var(--space-4, 1rem);\
            background: linear-gradient(rgba(0,0,0,0.7), transparent);\
            z-index: 2;\
            opacity: 0;\
            transition: opacity 0.3s;\
        }\
        .v0213-presenter:hover .v0213-presenter__toolbar,\
        .v0213-presenter:focus-within .v0213-presenter__toolbar {\
            opacity: 1;\
        }\
        .v0213-presenter__name {\
            flex: 1;\
            font-size: 0.9rem;\
            color: rgba(255,255,255,0.8);\
            white-space: nowrap;\
            overflow: hidden;\
            text-overflow: ellipsis;\
        }\
        .v0213-presenter__counter {\
            font-size: 0.85rem;\
            color: rgba(255,255,255,0.6);\
            font-variant-numeric: tabular-nums;\
        }\
        .v0213-presenter__btn {\
            background: rgba(255,255,255,0.1);\
            border: none;\
            color: rgba(255,255,255,0.8);\
            padding: 4px 12px;\
            border-radius: 4px;\
            cursor: pointer;\
            font-size: 20px;\
            line-height: 1;\
        }\
        .v0213-presenter__btn:hover {\
            background: rgba(255,255,255,0.2);\
        }\
        .v0213-presenter__canvas-wrap {\
            display: flex;\
            align-items: center;\
            justify-content: center;\
            width: 100%;\
            height: 100%;\
            z-index: 1;\
        }\
        .v0213-presenter__canvas {\
            max-width: calc(100vw - 120px);\
            max-height: calc(100vh - 60px);\
            box-shadow: 0 4px 40px rgba(0,0,0,0.8);\
        }\
        .v0213-presenter__loading {\
            color: rgba(255,255,255,0.5);\
            font-size: 1rem;\
        }\
        .v0213-presenter__nav {\
            position: absolute;\
            top: 50%;\
            transform: translateY(-50%);\
            background: rgba(255,255,255,0.06);\
            border: none;\
            color: rgba(255,255,255,0.5);\
            padding: 20px 12px;\
            border-radius: 8px;\
            cursor: pointer;\
            z-index: 2;\
            transition: background 0.15s, color 0.15s;\
        }\
        .v0213-presenter__nav:hover {\
            background: rgba(255,255,255,0.12);\
            color: rgba(255,255,255,0.9);\
        }\
        .v0213-presenter__nav--prev { left: 12px; }\
        .v0213-presenter__nav--next { right: 12px; }\
    ';
    document.head.appendChild(s);
})();

console.log('[send-download-v0213] PDF present mode + lightbox layout fix');

})();
