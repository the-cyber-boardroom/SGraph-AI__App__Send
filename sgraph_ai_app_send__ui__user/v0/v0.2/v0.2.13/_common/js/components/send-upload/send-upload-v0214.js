/* =============================================================================
   SGraph Send — Upload Component
   v0.2.14 — Surgical overlay on v0.2.13

   Changes:
     - Remove gallery preview from Step 2 (Delivery) entirely.
       Thumbnails aren't calculated until zip creation, so showing a
       preview at this stage is misleading. The gallery card in Step 2
       now goes straight to Step 3 (share mode) like other delivery options.
     - Fix gallery card click: v0.2.12 cloned the gallery card and attached
       a preview handler. We re-clone it with a handler that just proceeds.
     - Dim default-selected card when hovering another delivery option
       (instead of fully removing styling).
     - Always show gallery option for all folder uploads (not just images).
     - Consistent card order: browse → gallery → download (never reorder).
     - Gallery is always DEFAULT (recommended) — it supports all file types.
     - Add thumbnail generation note to confirmation step.

   Loads AFTER v0.2.13 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v0214] SendUpload not found — skipping');
    return;
}

// ─── Override: Step 2 render never shows gallery preview ────────────────────
var _v0213_renderStep2 = SendUpload.prototype._v023_renderStep2;

SendUpload.prototype._v023_renderStep2 = function() {
    // Force-suppress gallery preview — always render normal Step 2
    this._v0212_galleryPreview = false;
    this._v0212_suppressPreview = true;
    var html = _v0213_renderStep2.call(this);
    this._v0212_suppressPreview = false;
    return html;
};

// ─── Override: advanceToDelivery — always show gallery, smart defaults ──────
var _v0210_advanceToDelivery = SendUpload.prototype._v023_advanceToDelivery;

SendUpload.prototype._v023_advanceToDelivery = function() {
    // Call existing chain (v0.2.10 → v0.2.3 base)
    _v0210_advanceToDelivery.call(this);

    var opts = this._v023_deliveryOptions;
    if (!opts) return;

    var scan = this._folderScan;
    if (!scan || !scan.entries) return;

    // ── Ensure gallery is always in the options for folders ──
    var hasGallery = opts.some(function(o) { return o.id === 'gallery'; });
    if (!hasGallery) {
        opts.push({
            id: 'gallery',
            icon: '\uD83D\uDDBC\uFE0F',
            title: 'Gallery mode',
            desc: 'Recipient browses files with preview',
            hint: 'Best for: photo sets, documents, mixed files'
        });
        this._v023_deliveryOptions = opts;
    }

    // ── Classify files ──
    var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
    var files = scan.entries.filter(function(e) { return !e.isDir; });
    var allImages = files.length > 0 && files.every(function(e) {
        var ext = (e.name || '').split('.').pop().toLowerCase();
        return IMAGE_EXTS.indexOf(ext) !== -1;
    });

    // ── Consistent order: always browse → gallery → download ──
    var browse = [], gallery = [], rest = [];
    opts.forEach(function(o) {
        if (o.id === 'browse')        browse.push(o);
        else if (o.id === 'gallery')  gallery.push(o);
        else                          rest.push(o);
    });
    this._v023_deliveryOptions = browse.concat(gallery).concat(rest);

    // Gallery is always recommended (default badge) — it supports all file types
    this._v023_recommendedDelivery = 'gallery';

    this.render();
    this.setupEventListeners();
};

// ─── Override: setupEventListeners — fix gallery card + hover styling ───────
var _v0213_setupListeners = SendUpload.prototype.setupEventListeners;

SendUpload.prototype.setupEventListeners = function() {
    // Always suppress the gallery preview flag BEFORE calling the chain
    this._v0212_galleryPreview = false;

    // Call the full chain (v0.2.13 → v0.2.12 → ... → v0.2.3)
    // v0.2.12 will clone-replace the gallery card and attach a preview handler.
    _v0213_setupListeners.call(this);

    var self = this;

    if (this.state === 'choosing-delivery') {
        // ── Fix ALL delivery cards: re-clone with proper handlers ──
        // This fixes gallery click (broken by v0.2.12 clone) and
        // replaces v0.2.8's hover handlers with dim-based ones.
        var recommended = self._v023_recommendedDelivery || 'download';
        var allCards = this.querySelectorAll('.v023-delivery-card');
        var defaultCard = this.querySelector('.v028-default-selected');

        allCards.forEach(function(card) {
            var isDefault = card.classList.contains('v028-default-selected');
            var delivery = card.getAttribute('data-delivery');

            // Clone to strip ALL previous handlers (v0.2.3, v0.2.8, v0.2.12)
            var newCard = card.cloneNode(true);
            card.parentNode.replaceChild(newCard, card);

            // Click handler: select delivery and proceed to step 3
            newCard.addEventListener('click', function() {
                self._v0212_galleryPreview = false;
                self._v023_selectedDelivery = delivery;
                self.state = 'choosing-share';
                self.render();
                self.setupEventListeners();
            });

            // Hover: dim default card when hovering a non-default
            if (!isDefault && defaultCard) {
                newCard.addEventListener('mouseenter', function() {
                    defaultCard.classList.add('v0214-default-dimmed');
                    defaultCard.classList.remove('v028-default-selected');
                    newCard.classList.add('v028-hover-highlight');
                });
                newCard.addEventListener('mouseleave', function() {
                    newCard.classList.remove('v028-hover-highlight');
                    defaultCard.classList.remove('v0214-default-dimmed');
                    if (!self._v023_selectedDelivery) {
                        defaultCard.classList.add('v028-default-selected');
                    }
                });
            }
        });
    }
};

// ─── Override: confirm step — add thumbnail generation note ─────────────────
var _v026_renderConfirm = SendUpload.prototype._v026_renderConfirm;

SendUpload.prototype._v026_renderConfirm = function() {
    var html = _v026_renderConfirm.call(this);

    // Add thumbnail note for gallery delivery on folder uploads
    var delivery = this._v023_selectedDelivery || 'download';
    var isFolder = !!this._folderScan;

    if (isFolder && (delivery === 'gallery' || delivery === 'browse')) {
        var noteHtml =
            '<div class="v0214-thumbnail-note">' +
                '<span class="v0214-thumbnail-note__icon">&#128247;</span>' +
                '<div class="v0214-thumbnail-note__text">' +
                    '<strong>Preview generation</strong><br>' +
                    'Thumbnails and metadata will be generated from your files during encryption. ' +
                    'This happens entirely in your browser — nothing is sent to the server unencrypted.' +
                '</div>' +
            '</div>';

        // Insert before the back button
        html = html.replace(
            '<button class="v023-back-link" id="v026-back-to-share">',
            noteHtml + '<button class="v023-back-link" id="v026-back-to-share">'
        );
    }

    return html;
};

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v0214-upload-styles')) return;
    var style = document.createElement('style');
    style.id = 'v0214-upload-styles';
    style.textContent = '\
        /* ── Dimmed default card when hovering another option ── */\
        .v0214-default-dimmed {\
            border-color: rgba(78, 205, 196, 0.35) !important;\
            background: rgba(78, 205, 196, 0.03) !important;\
            opacity: 0.75;\
            transition: border-color 0.2s, background 0.2s, opacity 0.2s;\
        }\
        .v0214-default-dimmed::after {\
            opacity: 0.5 !important;\
        }\
        /* Smooth transitions on default card */\
        .v028-default-selected {\
            transition: border-color 0.2s, background 0.2s, opacity 0.2s;\
        }\
        \
        /* ── Thumbnail generation note on confirm step ── */\
        .v0214-thumbnail-note {\
            display: flex;\
            gap: var(--space-3, 0.75rem);\
            align-items: flex-start;\
            padding: var(--space-3, 0.75rem) var(--space-4, 1rem);\
            margin-top: var(--space-4, 1rem);\
            border-radius: var(--radius-md, 8px);\
            background: rgba(78, 205, 196, 0.06);\
            border: 1px solid rgba(78, 205, 196, 0.15);\
            font-size: 0.85rem;\
            line-height: 1.4;\
            color: var(--text-secondary, rgba(255,255,255,0.65));\
        }\
        .v0214-thumbnail-note__icon {\
            font-size: 1.2rem;\
            flex-shrink: 0;\
            margin-top: 0.1rem;\
        }\
        .v0214-thumbnail-note__text strong {\
            color: var(--text-primary, rgba(255,255,255,0.9));\
            font-size: 0.85rem;\
        }\
    ';
    document.head.appendChild(style);
})();

console.log('[send-upload-v0214] Gallery always shown, smart defaults, click fix, hover dim, thumbnail note');

})();
