/* =============================================================================
   SGraph Send — Download Component
   v0.2.7 — Surgical overlay on v0.2.6

   Changes:
     - "Save All" → "Save locally" button text
     - Hash fragment preserved for friendly tokens (Copy Link works on gallery)
     - Markdown lightbox: white background (matches pic4 download view)
     - Lightbox branding moved to top-right + action buttons (print, save, share)
     - Tick alignment fix in upload progress rows (right-aligned timing)

   Loads AFTER v0.2.6 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendDownload === 'undefined') {
    console.warn('[send-download-v027] SendDownload not found — skipping');
    return;
}

// ─── SVG icons ──────────────────────────────────────────────────────────────
var ICON = {
    dl12:   '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg>',
    dl16:   '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg>',
    print:  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 6V1h8v5"/><rect x="1" y="6" width="14" height="6" rx="1"/><path d="M4 10h8v5H4z"/></svg>',
    share:  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="4" r="2"/><circle cx="4" cy="8" r="2"/><circle cx="12" cy="12" r="2"/><path d="M6 9l4 2M6 7l4-2"/></svg>',
    save:   '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 12v2h12v-2M8 2v8M5 7l3 3 3-3"/></svg>'
};

// ─── Save references ────────────────────────────────────────────────────────
var _v026_renderZipLayout = SendDownload.prototype._renderZipLayout;
var _v026_openLightbox    = SendDownload.prototype._v025_openLightbox;
var _v026_showLightbox    = SendDownload.prototype._v025_showLightboxImage;
var _v026_setupEvents     = SendDownload.prototype.setupEventListeners;

// ═══════════════════════════════════════════════════════════════════════════
// FIX 1: Hash fragment preservation for friendly tokens
// ═══════════════════════════════════════════════════════════════════════════

// Override the base download's _processDecryptedContent (or the point where
// hash gets stripped). The stripping happens in send-download.js after
// successful decryption. We patch it to keep the hash for friendly tokens.
var _origProcessComplete = SendDownload.prototype._processDecryptedContent;

if (_origProcessComplete) {
    SendDownload.prototype._processDecryptedContent = function(content) {
        // Before the base method strips the hash, check if it's a friendly token
        if (this._friendlyToken || this._friendlyResolved) {
            // Temporarily prevent hash stripping by saving/restoring
            var savedHash = window.location.hash;
            var result = _origProcessComplete.call(this, content);
            // If hash was stripped, restore it for friendly tokens
            if (!window.location.hash && savedHash) {
                history.replaceState(null, '', window.location.pathname + window.location.search + savedHash);
            }
            return result;
        }
        return _origProcessComplete.call(this, content);
    };
}

// Also patch at the render-complete level to ensure hash stays
var _origRenderComplete = SendDownload.prototype._renderCompleteState;
if (!_origRenderComplete) {
    // The hash stripping is inline in the base component. Let's override
    // the state transition to complete instead.
    var _origSetState = Object.getOwnPropertyDescriptor(SendDownload.prototype, 'state');

    // Simpler approach: after render, restore hash if friendly token
    var _v027_origRender = SendDownload.prototype.render;
    SendDownload.prototype.render = function() {
        var wasFriendly = this._friendlyToken || this._friendlyResolved;
        var savedHash = wasFriendly ? window.location.hash : null;

        _v027_origRender.call(this);

        // Restore hash if it was stripped during render
        if (wasFriendly && savedHash && !window.location.hash) {
            history.replaceState(null, '', window.location.pathname + window.location.search + savedHash);
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2: "Save All" → "Save locally" in gallery header
// ═══════════════════════════════════════════════════════════════════════════

SendDownload.prototype._renderZipLayout = function(timingHtml, sendAnotherHtml) {
    var html = _v026_renderZipLayout.call(this, timingHtml, sendAnotherHtml);
    // Replace "Save All" with "Save locally" in the gallery header button
    html = html.replace('>Save All</button>', '>Save locally</button>');
    return html;
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 3: Lightbox — branding at top-right + action buttons
// ═══════════════════════════════════════════════════════════════════════════

SendDownload.prototype._v025_openLightbox = function(index) {
    var self  = this;
    var files = this._zipTree ? this._zipTree.filter(function(e) { return !e.dir; }) : [];
    if (index < 0 || index >= files.length) return;

    this._v025_lightboxIndex = index;

    var overlay = document.getElementById('v025-lightbox');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'v025-lightbox';
        overlay.className = 'v025-lightbox';
        overlay.innerHTML = '\
            <div class="v025-lightbox__top">\
                <span class="v025-lightbox__filename" id="v025-lb-name"></span>\
                <div class="v027-lightbox__actions">\
                    <button class="v025-lightbox__btn v027-lb-action" id="v027-lb-save-file" title="Save locally">' + ICON.save + ' Save locally</button>\
                    <button class="v025-lightbox__btn v027-lb-action" id="v027-lb-print" title="Print">' + ICON.print + '</button>\
                    <button class="v025-lightbox__btn v027-lb-action" id="v027-lb-share" title="Share">' + ICON.share + '</button>\
                </div>\
                <span class="v025-lightbox__counter" id="v025-lb-counter"></span>\
                <button class="v025-lightbox__btn" id="v025-lb-save" title="Save file">' + ICON.dl16 + '</button>\
                <button class="v025-lightbox__btn v025-lightbox__close" id="v025-lb-close">&times;</button>\
            </div>\
            <div class="v027-lightbox__brand-top">\
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent, #4ECDC4)" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>\
                <span>SG/<b>Send</b></span>\
            </div>\
            <button class="v025-lightbox__nav v025-lightbox__nav--prev" id="v025-lb-prev">\
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>\
            </button>\
            <div class="v025-lightbox__img-wrap" id="v025-lb-img-wrap"></div>\
            <button class="v025-lightbox__nav v025-lightbox__nav--next" id="v025-lb-next">\
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>\
            </button>';
        document.body.appendChild(overlay);

        document.getElementById('v025-lb-close').addEventListener('click', function() { self._v025_closeLightbox(); });
        overlay.addEventListener('click', function(e) { if (e.target === overlay) self._v025_closeLightbox(); });
        document.getElementById('v025-lb-prev').addEventListener('click', function() { self._v025_navigateLightbox(-1); });
        document.getElementById('v025-lb-next').addEventListener('click', function() { self._v025_navigateLightbox(1); });
        document.getElementById('v025-lb-save').addEventListener('click', function() { self._v026_saveFile(); });

        // New action buttons
        document.getElementById('v027-lb-save-file').addEventListener('click', function() { self._v026_saveFile(); });
        document.getElementById('v027-lb-print').addEventListener('click', function() { window.print(); });
        document.getElementById('v027-lb-share').addEventListener('click', function() {
            navigator.clipboard.writeText(window.location.href).then(function() {
                var btn = document.getElementById('v027-lb-share');
                var orig = btn.innerHTML;
                btn.innerHTML = '&#10003; Copied!';
                setTimeout(function() { btn.innerHTML = orig; }, 2000);
            });
        });

        this._v025_keyHandler = function(e) {
            if (!document.getElementById('v025-lightbox')) return;
            if (e.key === 'Escape')                           self._v025_closeLightbox();
            else if (e.key === 'ArrowLeft'  || e.key === 'k') self._v025_navigateLightbox(-1);
            else if (e.key === 'ArrowRight' || e.key === 'j') self._v025_navigateLightbox(1);
            else if (e.key === 's')                            self._v026_saveFile();
        };
        document.addEventListener('keydown', this._v025_keyHandler);
    }

    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    this._v025_showLightboxImage(index);
};

// ═══════════════════════════════════════════════════════════════════════════
// FIX 4: Markdown lightbox — white background
// ═══════════════════════════════════════════════════════════════════════════

var _v026_showLightboxImage = SendDownload.prototype._v025_showLightboxImage;

SendDownload.prototype._v025_showLightboxImage = function(index) {
    // For markdown files, override to use white background
    var files = this._zipTree.filter(function(e) { return !e.dir; });
    var entry = files[index];
    var ext   = (entry.name || '').split('.').pop().toLowerCase();

    if (ext === 'md' || ext === 'markdown') {
        var nameEl  = document.getElementById('v025-lb-name');
        var countEl = document.getElementById('v025-lb-counter');
        var wrap    = document.getElementById('v025-lb-img-wrap');
        var prevBtn = document.getElementById('v025-lb-prev');
        var nextBtn = document.getElementById('v025-lb-next');

        nameEl.textContent  = entry.name;
        countEl.textContent = (index + 1) + ' / ' + files.length;
        prevBtn.style.visibility = index > 0 ? 'visible' : 'hidden';
        nextBtn.style.visibility = index < files.length - 1 ? 'visible' : 'hidden';

        var self = this;
        wrap.innerHTML = '<div class="v025-lightbox__loading">Loading\u2026</div>';
        entry.entry.async('string').then(function(text) {
            if (self._v025_lightboxIndex !== index) return;
            var html;
            if (typeof MarkdownParser !== 'undefined' && MarkdownParser.parse) {
                html = MarkdownParser.parse(text);
            } else {
                html = '<pre>' + self.escapeHtml(text) + '</pre>';
            }
            wrap.innerHTML = '<div class="v027-lightbox__md">' + html + '</div>';
        });
        return;
    }

    // Non-markdown: delegate to v0.2.6
    _v026_showLightboxImage.call(this, index);
};

// ═══════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════

(function injectStyles() {
    if (document.getElementById('v027-download-styles')) return;
    var s = document.createElement('style');
    s.id = 'v027-download-styles';
    s.textContent = '\
        /* ── Markdown lightbox: white background ── */\
        .v027-lightbox__md {\
            width: 70vw; max-width: 900px; max-height: 80vh; overflow-y: auto; padding: 2.5rem 3rem;\
            background: #ffffff; border-radius: var(--radius-md, 8px);\
            color: #1a1a2e; font-size: 1rem; line-height: 1.7;\
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);\
        }\
        .v027-lightbox__md h1, .v027-lightbox__md h2, .v027-lightbox__md h3 {\
            color: #111; margin-top: 1.2em; margin-bottom: 0.5em;\
        }\
        .v027-lightbox__md h1 { font-size: 1.6rem; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }\
        .v027-lightbox__md h2 { font-size: 1.3rem; }\
        .v027-lightbox__md h3 { font-size: 1.1rem; }\
        .v027-lightbox__md p { margin: 0.8em 0; }\
        .v027-lightbox__md pre {\
            background: #f5f5f5; padding: 1em; border-radius: 6px;\
            overflow-x: auto; border: 1px solid #e0e0e0;\
        }\
        .v027-lightbox__md code { font-size: 0.9em; color: #d63384; }\
        .v027-lightbox__md pre code { color: #333; }\
        .v027-lightbox__md a { color: #0969da; }\
        .v027-lightbox__md blockquote {\
            border-left: 3px solid #ddd; padding-left: 1em; margin-left: 0; color: #555;\
        }\
        .v027-lightbox__md table { border-collapse: collapse; width: 100%; }\
        .v027-lightbox__md th, .v027-lightbox__md td {\
            border: 1px solid #ddd; padding: 6px 12px; text-align: left;\
        }\
        .v027-lightbox__md th { background: #f5f5f5; font-weight: 600; }\
        .v027-lightbox__md strong { color: #111; }\
        .v027-lightbox__md hr { border: none; border-top: 1px solid #e0e0e0; margin: 1.5em 0; }\
        \
        /* ── Lightbox branding: top-right instead of bottom-right ── */\
        .v026-lightbox__brand { display: none !important; }\
        .v027-lightbox__brand-top {\
            position: absolute; top: var(--space-3, 0.75rem); right: 60px;\
            display: flex; align-items: center; gap: 6px; z-index: 2;\
            font-size: 0.85rem; color: rgba(255,255,255,0.25); pointer-events: none;\
        }\
        .v027-lightbox__brand-top b { color: rgba(255,255,255,0.4); font-weight: 600; }\
        \
        /* ── Lightbox action buttons row ── */\
        .v027-lightbox__actions {\
            display: flex; gap: 4px; margin-left: auto; margin-right: var(--space-2, 0.5rem);\
        }\
        .v027-lb-action {\
            font-size: 0.75rem !important; gap: 4px;\
            display: inline-flex !important; align-items: center;\
        }\
        \
        /* ── Tick alignment fix: right-align check + ms as a group ── */\
        .v028-live-timing__row {\
            display: flex !important;\
            align-items: center;\
            gap: var(--space-2, 0.5rem);\
        }\
        .v028-live-timing__label {\
            flex: 1;\
            min-width: 0;\
        }\
        .v028-live-timing__check {\
            flex-shrink: 0;\
            width: 16px;\
            text-align: center;\
        }\
        .v028-live-timing__ms {\
            flex-shrink: 0;\
            min-width: 70px;\
            text-align: right;\
            margin-left: 0 !important;\
        }\
        \
        /* ── Print adjustments ── */\
        @media print {\
            .v027-lightbox__brand-top { position: static !important; color: #999 !important; margin-top: 0.5rem; justify-content: flex-end; }\
            .v027-lightbox__brand-top b { color: #666 !important; }\
            .v027-lightbox__actions { display: none !important; }\
            .v027-lightbox__md { box-shadow: none !important; border: 1px solid #ddd; }\
        }\
    ';
    document.head.appendChild(s);
})();

console.log('[send-download-v027] Gallery fixes — Save locally, hash preservation, white MD, lightbox actions');

})();
