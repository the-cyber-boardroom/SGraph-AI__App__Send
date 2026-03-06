/* =============================================================================
   SGraph Workspace — LLM Prompt Input Override
   v0.1.1 — Keep screenshots after send (let user remove manually)

   Patches _send() so pasted images are NOT cleared after submission.
   Users can still remove images via the X button on each thumbnail.
   ============================================================================= */

(function() {
    'use strict';

    const Cls = customElements.get('llm-prompt-input');
    if (!Cls) return;

    const _originalSend = Cls.prototype._send;

    Cls.prototype._send = function() {
        // Temporarily replace _pastedImages clearing behavior:
        // Store current images, call original _send, then restore them.
        const savedImages = this._pastedImages ? [...this._pastedImages] : [];

        _originalSend.call(this);

        // Restore images (original _send clears them)
        this._pastedImages = savedImages;
        if (this._renderImagePreviews) this._renderImagePreviews();
    };

})();
