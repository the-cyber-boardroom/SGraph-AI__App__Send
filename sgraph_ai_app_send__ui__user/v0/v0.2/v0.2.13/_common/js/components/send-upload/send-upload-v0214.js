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

// ─── Override: setupEventListeners — fix gallery card + hover styling ───────
var _v0213_setupListeners = SendUpload.prototype.setupEventListeners;

SendUpload.prototype.setupEventListeners = function() {
    // Always suppress the gallery preview flag BEFORE calling the chain
    this._v0212_galleryPreview = false;

    // Call the full chain (v0.2.13 → v0.2.12 → ... → v0.2.3)
    // v0.2.12 will clone-replace the gallery card and attach a preview handler.
    _v0213_setupListeners.call(this);

    var self = this;

    // ── Fix gallery card: re-clone with a proper "just proceed" handler ──
    if (this.state === 'choosing-delivery') {
        var galleryCard = this.querySelector('[data-delivery="gallery"]');
        if (galleryCard) {
            var fixedCard = galleryCard.cloneNode(true);
            galleryCard.parentNode.replaceChild(fixedCard, galleryCard);

            fixedCard.addEventListener('click', function() {
                self._v0212_galleryPreview = false;
                self._v023_selectedDelivery = 'gallery';
                self.state = 'choosing-share';
                self.render();
                self.setupEventListeners();
            });

            // Re-apply hover effects for the fixed gallery card
            var recommended = self._v023_recommendedDelivery || 'download';
            var defaultCard = self.querySelector('.v023-delivery-card[data-delivery="' + recommended + '"]');

            if (fixedCard.getAttribute('data-delivery') !== recommended && defaultCard) {
                fixedCard.addEventListener('mouseenter', function() {
                    defaultCard.classList.add('v0214-default-dimmed');
                    defaultCard.classList.remove('v028-default-selected');
                    fixedCard.classList.add('v028-hover-highlight');
                });
                fixedCard.addEventListener('mouseleave', function() {
                    fixedCard.classList.remove('v028-hover-highlight');
                    defaultCard.classList.remove('v0214-default-dimmed');
                    if (!self._v023_selectedDelivery) {
                        defaultCard.classList.add('v028-default-selected');
                    }
                });
            }
        }

        // ── Enhance existing hover: dim instead of fully removing ──
        var cards = this.querySelectorAll('.v023-delivery-card');
        var defaultCard2 = this.querySelector('.v028-default-selected');

        if (defaultCard2) {
            cards.forEach(function(card) {
                var isDefault = card.classList.contains('v028-default-selected');
                if (isDefault) return;

                // Remove v0.2.8's handlers and replace with ours
                var newCard = card.cloneNode(true);
                card.parentNode.replaceChild(newCard, card);

                // Skip the gallery card — already handled above
                if (newCard.getAttribute('data-delivery') === 'gallery') return;

                newCard.addEventListener('mouseenter', function() {
                    defaultCard2.classList.add('v0214-default-dimmed');
                    defaultCard2.classList.remove('v028-default-selected');
                    newCard.classList.add('v028-hover-highlight');
                });
                newCard.addEventListener('mouseleave', function() {
                    newCard.classList.remove('v028-hover-highlight');
                    defaultCard2.classList.remove('v0214-default-dimmed');
                    if (!self._v023_selectedDelivery) {
                        defaultCard2.classList.add('v028-default-selected');
                    }
                });

                // Re-attach click handler (lost during clone)
                newCard.addEventListener('click', function() {
                    var delivery = newCard.getAttribute('data-delivery');
                    self._v023_selectedDelivery = delivery;
                    self.state = 'choosing-share';
                    self.render();
                    self.setupEventListeners();
                });
            });
        }
    }
};

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v0214-upload-styles')) return;
    var style = document.createElement('style');
    style.id = 'v0214-upload-styles';
    style.textContent = '\
        /* ── Dimmed default card when hovering another option ── */\
        .v0214-default-dimmed {\
            border-color: rgba(78, 205, 196, 0.25) !important;\
            background: rgba(78, 205, 196, 0.02) !important;\
            opacity: 0.6;\
            transition: border-color 0.2s, background 0.2s, opacity 0.2s;\
        }\
        .v0214-default-dimmed::after {\
            opacity: 0.4 !important;\
        }\
        /* Smooth transitions on default card */\
        .v028-default-selected {\
            transition: border-color 0.2s, background 0.2s, opacity 0.2s;\
        }\
    ';
    document.head.appendChild(style);
})();

console.log('[send-upload-v0214] Gallery preview removed, gallery click fixed, hover dim on default card');

})();
