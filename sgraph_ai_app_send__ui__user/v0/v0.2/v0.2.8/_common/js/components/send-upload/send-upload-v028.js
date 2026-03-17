/* =============================================================================
   SGraph Send — Upload Component
   v0.2.8 — Surgical overlay on v0.2.7

   Changes:
     - Step 2: Pre-select recommended delivery option. Deselects on hover
       over another card, reselects if user moves away without clicking.
       "RECOMMENDED" badge changed to "DEFAULT".
     - Step 4: Remove duplicate Encrypt & Send button (bottom). The Next bar
       at the top already has "Encrypt & Send →".
     - Step 5: In simple token mode, hide the share mode header (no change
       button — mode is locked). Add "Copy All" button in Next bar position
       that copies both token and friendly key together.

   Loads AFTER v0.2.7 — overrides via prototype mutation.
   NO customElements.define() — reuses v0.2.0's registration.
   ============================================================================= */

(function() {

// ─── Guard ──────────────────────────────────────────────────────────────────
if (typeof SendUpload === 'undefined') {
    console.warn('[send-upload-v028] SendUpload not found — skipping v0.2.8 overrides');
    return;
}

// ─── Store methods we override ──────────────────────────────────────────────
var _v027_render          = SendUpload.prototype.render;
var _v027_setupEvents     = SendUpload.prototype.setupEventListeners;
var _v026_renderConfirm   = SendUpload.prototype._v026_renderConfirm;
var _v026_renderResult    = SendUpload.prototype.renderResult;

// ─── Override: render — add default selection + fix Step 4/5 ────────────────
SendUpload.prototype.render = function() {
    // Let v0.2.7 render first (which calls v0.2.6 render + adds Next bar)
    _v027_render.call(this);

    // ── Step 2: Pre-select the recommended delivery option ──
    if (this.state === 'choosing-delivery') {
        var recommended = this._v023_recommendedDelivery || 'download';
        var cards = this.querySelectorAll('.v023-delivery-card');
        cards.forEach(function(card) {
            var deliveryId = card.getAttribute('data-delivery');
            if (deliveryId === recommended) {
                card.classList.add('v028-default-selected');
            }
        });
    }

    // ── Step 4: Remove the bottom Encrypt & Send button (Next bar has it) ──
    if (this.state === 'confirming') {
        var sendAction = this.querySelector('.v026-send-action');
        if (sendAction) {
            sendAction.remove();
        }
    }

    // ── Step 5: In simple token mode, simplify the display ──
    if (this.state === 'complete' && this._v026_shareMode === 'token' && !this._v026_showPicker) {
        // Remove the mode header (no need to show "Simple token" + Change button)
        var modeHeader = this.querySelector('.v026-mode-header');
        if (modeHeader) {
            modeHeader.remove();
        }

        // Add "Copy All" button in the Next bar position
        var stepIndicator = this.querySelector('send-step-indicator');
        if (stepIndicator && !this.querySelector('#v028-copy-all-bar')) {
            var copyBar = document.createElement('div');
            copyBar.className = 'v027-next-bar';
            copyBar.id = 'v028-copy-all-bar';
            copyBar.innerHTML = '<button class="v027-next-btn" id="v028-copy-all-btn">Copy All</button>';
            stepIndicator.insertAdjacentElement('afterend', copyBar);
        }
    }
};

// ─── Override: setupEventListeners — hover behaviour + Copy All ─────────────
SendUpload.prototype.setupEventListeners = function() {
    var self = this;
    _v027_setupEvents.call(this);

    // ── Step 2: Hover deselects default, mouseout reselects ──
    if (this.state === 'choosing-delivery') {
        var recommended = this._v023_recommendedDelivery || 'download';
        var cards = this.querySelectorAll('.v023-delivery-card');
        var defaultCard = this.querySelector('.v023-delivery-card[data-delivery="' + recommended + '"]');

        cards.forEach(function(card) {
            var isDefault = card.getAttribute('data-delivery') === recommended;

            card.addEventListener('mouseenter', function() {
                if (!isDefault && defaultCard) {
                    // Hovering a non-default card → deselect the default
                    defaultCard.classList.remove('v028-default-selected');
                    // Highlight this card
                    card.classList.add('v028-hover-highlight');
                }
            });

            card.addEventListener('mouseleave', function() {
                card.classList.remove('v028-hover-highlight');
                // If no card has been clicked yet, re-highlight default
                if (!self._v023_selectedDelivery && defaultCard) {
                    defaultCard.classList.add('v028-default-selected');
                }
            });
        });
    }

    // ── Step 5: Copy All button ──
    var copyAllBtn = this.querySelector('#v028-copy-all-btn');
    if (copyAllBtn && this.result) {
        copyAllBtn.addEventListener('click', function() {
            var transferId  = self.result.transferId  || '';
            var friendlyKey = self.result.friendlyKey || '';
            var text = 'Token: ' + transferId + '\nKey: ' + friendlyKey;
            navigator.clipboard.writeText(text).then(function() {
                copyAllBtn.textContent = 'Copied!';
                setTimeout(function() { copyAllBtn.textContent = 'Copy All'; }, 2000);
            });
        });
    }
};

// ─── Override: _v026_renderConfirm — update hint text ───────────────────────
SendUpload.prototype._v026_renderConfirm = function() {
    var html = _v026_renderConfirm.call(this);
    // Replace "Review your choices, then hit the button below." since the
    // button is now at the top
    html = html.replace(
        'Review your choices, then hit the button below.',
        'Review your choices, then hit Encrypt &amp; Send above.'
    );
    return html;
};

// ─── Styles ─────────────────────────────────────────────────────────────────
(function injectStyles() {
    if (document.getElementById('v028-styles')) return;
    var style = document.createElement('style');
    style.id = 'v028-styles';
    style.textContent = '\
        /* Override RECOMMENDED → DEFAULT badge */\
        .v023-delivery-card--recommended::after {\
            content: "\\2605 DEFAULT" !important;\
        }\
        \
        /* Default-selected delivery card (pre-selected state) */\
        .v028-default-selected {\
            border-color: var(--color-primary, #4ECDC4) !important;\
            background: var(--accent-subtle, rgba(78, 205, 196, 0.08)) !important;\
        }\
        \
        /* Hover highlight for non-default cards */\
        .v028-hover-highlight {\
            border-color: var(--color-primary, #4ECDC4) !important;\
            background: var(--accent-subtle, rgba(78, 205, 196, 0.12)) !important;\
        }\
    ';
    document.head.appendChild(style);
})();

console.log('[send-upload-v028] Default selection, badge fix, deduplicated Encrypt button, Copy All');

})();
