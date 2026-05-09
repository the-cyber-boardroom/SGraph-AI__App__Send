/* ═══════════════════════════════════════════════════════════════════════════════
   SGraph Send — SendUpload Options Step Patch (v0.3.2)

   Implements the 6 → 5 step wizard consolidation. Addresses all 10 gotchas
   documented in team/roles/dev/reviews/05/07/share-a-secret/05-consolidate-delivery-share-step.md

   Gotcha 1: TOTAL_STEPS / STEP_LABELS — handled in upload-constants-patch.js
   Gotcha 2: STATE_TO_STEP — handled in upload-constants-patch.js
   Gotcha 3: _activeComponent() — new 'choosing-options' → 'options' case
   Gotcha 4: _advanceToDelivery() — now sets state 'choosing-options'
   Gotcha 5: _wireNextButton() — choosing-options → confirming in one step
   Gotcha 6: _wireEvents() — step-delivery-chosen / step-sharemode-chosen (no advance)
   Gotcha 7: step-back handler — choosing-options → idle, confirming → choosing-options
   Gotcha 8: step-nav — step 2 → choosing-options, step 3 → confirming
   Gotcha 9: _syncComponent('options') — deliver delivery + shareMode props
   Gotcha 10: step-change-delivery / step-change-share — both → choosing-options

   Additional:
   - Lazy-creates <upload-step-options> and <upload-step-done-secret> in the DOM
   - Patches _render to show/hide the new elements
   - step-nav uses stopImmediatePropagation (capture) to override old listener
   - step-back uses stopImmediatePropagation (capture) to override old listener

   Load AFTER send-upload.js, upload-step-options.js, upload-step-done-secret.js,
             send-upload-secret.js, and upload-engine-secret.js.
   ═══════════════════════════════════════════════════════════════════════════════ */

// ═══ Prototype patches (apply immediately — picked up on next render cycle) ═══

// ─── Gotcha 3: _activeComponent ──────────────────────────────────────────────

var _origActiveComponent = SendUpload.prototype._activeComponent;
SendUpload.prototype._activeComponent = function() {
    if (this._state === 'choosing-options') return 'options';
    if (this._state === 'complete' && this._isSecretMode) return 'done-secret';
    return _origActiveComponent.call(this);
};

// ─── Gotcha 4: _advanceToDelivery → sets 'choosing-options' ──────────────────

SendUpload.prototype._advanceToDelivery = function() {
    this._deliveryOptions     = UploadFileUtils.detectDeliveryOptions(this.selectedFile, this._folderScan);
    this._recommendedDelivery = UploadFileUtils.getSmartDefault(this.selectedFile, this._folderScan);
    this._selectedDelivery    = this._recommendedDelivery;
    this.state = 'choosing-options';   // was: 'choosing-delivery'
};

// ─── Gotcha 5: _wireNextButton ────────────────────────────────────────────────

var _origWireNextButton = SendUpload.prototype._wireNextButton;
SendUpload.prototype._wireNextButton = function() {
    var self    = this;
    var nextBtn = this.querySelector('#upload-next-btn');
    if (nextBtn) {
        // Register BEFORE calling original so stopImmediatePropagation prevents
        // the original's 'confirming' case from firing after our state transition
        nextBtn.addEventListener('click', function(e) {
            if (self._state === 'choosing-options') {
                e.stopImmediatePropagation(); // Prevent original handler from running
                self._selectedDelivery = self._selectedDelivery || self._recommendedDelivery || 'download';
                self._shareMode        = self._shareMode        || 'token';
                self.state = 'confirming';
            }
            // Other states fall through to original (added below)
        });
    }
    // Call original to handle remaining cases (confirming → processing, email btn)
    _origWireNextButton.call(this);
};

// ─── Gotcha 9: _syncComponent — handles 'options' and 'done-secret' ──────────

var _origSyncComponent = SendUpload.prototype._syncComponent;
SendUpload.prototype._syncComponent = function(key) {
    var self = this;

    // Lazy-create <upload-step-options> on first use
    if (key === 'options' && !this._els['options']) {
        var container = this.querySelector('.step-content');
        if (container) {
            var optEl = document.createElement('upload-step-options');
            optEl.style.display = 'none';
            container.appendChild(optEl);
            this._els['options'] = optEl;
        }
    }

    // Lazy-create <upload-step-done-secret> on first use
    if (key === 'done-secret' && !this._els['done-secret']) {
        var container2 = this.querySelector('.step-content');
        if (container2) {
            var doneSecEl = document.createElement('upload-step-done-secret');
            doneSecEl.style.display = 'none';
            container2.appendChild(doneSecEl);
            this._els['done-secret'] = doneSecEl;
        }
    }

    // Sync options element
    if (key === 'options' && this._els['options']) {
        var e = this._els;
        e['options'].deliveryOptions     = this._deliveryOptions;
        e['options'].recommendedDelivery = this._recommendedDelivery;
        e['options'].selectedDelivery    = this._selectedDelivery;
        e['options'].fileSummary         = this._fileSummary();
        e['options'].shareMode           = this._shareMode;
        e['options'].secretMode          = !!this._isSecretMode;
        return; // Don't fall through to original
    }

    // Sync done-secret element — secretConfig must be set before result (result triggers render)
    if (key === 'done-secret' && this._els['done-secret'] && this.result) {
        var doneEl = this._els['done-secret'];
        if (this._secretConfig) doneEl.secretConfig = this._secretConfig;
        doneEl.result = this.result;
        return;
    }

    _origSyncComponent.call(this, key);
};

// ─── _render patch: show/hide new elements + inline Next button for options ──

var _origRender = SendUpload.prototype._render;
SendUpload.prototype._render = function() {
    _origRender.call(this);

    // Show/hide new elements not in the original keys list
    var activeKey = this._activeComponent();
    var extraKeys = ['options', 'done-secret'];
    for (var i = 0; i < extraKeys.length; i++) {
        var el = this._els[extraKeys[i]];
        if (el) el.style.display = extraKeys[i] === activeKey ? '' : 'none';
    }

    // Fix the inline Next button: also show for 'choosing-options'
    var actionSlot = this.querySelector('.upload-header-row__action');
    if (actionSlot && this._state === 'choosing-options') {
        actionSlot.innerHTML = '<button class="upload-next-btn" id="upload-next-btn">Next →</button>';
        this._wireNextButton();
    }
};

// ═══ Wire new event listeners on already-connected elements ═══════════════════
//     (must run after prototype patches, for elements already in DOM)

(function() {
    document.querySelectorAll('send-upload').forEach(function(el) {
        _wireOptionsEvents(el);
    });

    function _wireOptionsEvents(el) {
        var c = el.querySelector('.step-content');
        if (!c || c._optionsWired) return;
        c._optionsWired = true;

        // ─── Gotcha 6: lightweight selection events (no state advance) ──────
        c.addEventListener('step-delivery-chosen', function(e) {
            el._selectedDelivery = e.detail.deliveryId;
        });
        c.addEventListener('step-sharemode-chosen', function(e) {
            el._shareMode = e.detail.mode;
        });

        // ─── Gotcha 10: both change events → choosing-options ────────────────
        c.addEventListener('step-change-delivery', function() {
            el.state = 'choosing-options';
        });
        c.addEventListener('step-change-share', function() {
            el.state = 'choosing-options';
        });

        // ─── Gotcha 7: step-back — capture phase overrides old bubble handler ─
        //     Capture runs first; stopImmediatePropagation prevents old listener.
        c.addEventListener('step-back', function(e) {
            if (el._state === 'choosing-options') {
                e.stopImmediatePropagation();
                el._resetSelection();
                el.state = 'idle';
            } else if (el._state === 'confirming') {
                e.stopImmediatePropagation();
                el.state = 'choosing-options';
            }
            // Other states (idle, complete etc.) fall through — no action needed
        }, true /* capture */);

        // ─── Gotcha 8: step-nav — capture overrides old listener ─────────────
        el.addEventListener('step-nav', function(e) {
            var step = e.detail.step;
            e.stopImmediatePropagation(); // Prevent old listener from running

            // Clear friendly key when navigating back past step 2 (was step 3)
            if (step <= 2) {
                el._friendlyParts = null;
                el._friendlyKey   = null;
            }
            if (step === 1) {
                el._resetSelection();
                el.state = 'idle';
            } else if (step === 2) {
                el.state = 'choosing-options';
            } else if (step === 3) {
                el.state = 'confirming';
            }
            // Steps 4-5 (processing/done) are not navigable
        }, true /* capture */);
    }
})();

// ─── Also patch _wireEvents to set up options listeners for future instances ──

var _origWireEventsForOptions = SendUpload.prototype._wireEvents;
SendUpload.prototype._wireEvents = function() {
    _origWireEventsForOptions.call(this);
    var self = this;
    var c    = this.querySelector('.step-content');
    if (!c || c._optionsWired) return;
    c._optionsWired = true;

    c.addEventListener('step-delivery-chosen', function(e) {
        self._selectedDelivery = e.detail.deliveryId;
    });
    c.addEventListener('step-sharemode-chosen', function(e) {
        self._shareMode = e.detail.mode;
    });
    c.addEventListener('step-change-delivery', function() { self.state = 'choosing-options'; });
    c.addEventListener('step-change-share',    function() { self.state = 'choosing-options'; });

    c.addEventListener('step-back', function(e) {
        if (self._state === 'choosing-options') {
            e.stopImmediatePropagation();
            self._resetSelection();
            self.state = 'idle';
        } else if (self._state === 'confirming') {
            e.stopImmediatePropagation();
            self.state = 'choosing-options';
        }
    }, true);

    this.addEventListener('step-nav', function(e) {
        var step = e.detail.step;
        e.stopImmediatePropagation();
        if (step <= 2) { self._friendlyParts = null; self._friendlyKey = null; }
        if      (step === 1) { self._resetSelection(); self.state = 'idle'; }
        else if (step === 2) { self.state = 'choosing-options'; }
        else if (step === 3) { self.state = 'confirming'; }
    }, true);
};
